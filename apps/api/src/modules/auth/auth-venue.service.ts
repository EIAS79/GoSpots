import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { classifyVenuePath } from '../../common/dashboard-path';
import { permissionsToEffectiveCsv } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from './auth.types';

/**
 * Venue dashboard path resolution, access verification, and session bind.
 *
 * Extracted from `AuthService` as part of Bible #14 (auth capability split).
 * `AuthService` still facade-delegates so controllers and existing callers
 * are unaffected.
 */
@Injectable()
export class AuthVenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Ensures the signed-in user may access this private dashboard URL. */
  async verifyVenueDashboard(
    userId: string,
    sysRole: string,
    venuePath: string,
  ) {
    const ref = classifyVenuePath(venuePath);
    if (!ref) {
      throw new BadRequestException('Invalid venue dashboard path.');
    }

    // Phase 3: always slug-only (legacy slug--key strips to slug; key not verified).
    const shop = await this.prisma.shop.findFirst({
      where: { slug: ref.slug },
      select: {
        id: true,
        slug: true,
        name: true,
        locale: true,
        currency: true,
        city: true,
        isPublished: true,
      },
    });
    if (!shop) {
      throw new UnauthorizedException('Venue not found or access denied.');
    }

    if (sysRole === 'SUPER_ADMIN') {
      return { shop, membership: null };
    }

    const membership = await this.prisma.membership.findFirst({
      where: { userId, shopId: shop.id, isActive: true },
      include: { permissionRows: { select: { permission: true } } },
    });
    if (!membership) {
      throw new UnauthorizedException('You do not have access to this venue.');
    }

    return { shop, membership };
  }

  /** Re-issue access token scoped to the venue in the dashboard URL. */
  async bindVenueSession(actor: JwtAccessPayload, venuePath: string) {
    const { shop, membership } = await this.verifyVenueDashboard(
      actor.sub,
      actor.sysRole,
      venuePath,
    );

    const shopFull = await this.prisma.shop.findUnique({
      where: { id: shop.id },
      include: { subscription: true },
    });

    const shopProfile = await this.prisma.shop.findUnique({
      where: { id: shop.id },
      select: {
        id: true,
        name: true,
        displayName: true,
        slug: true,
        description: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        coverImage: true,
        locale: true,
        currency: true,
        isPublished: true,
        floorCount: true,
      },
    });
    if (!shopProfile) {
      throw new UnauthorizedException('Venue not found or access denied.');
    }

    const accessTtl = +this.config.get('JWT_ACCESS_TTL', '900');
    const effectivePerms = membership
      ? permissionsToEffectiveCsv({
          permissionRows: membership.permissionRows,
        })
      : '*';
    const payload: JwtAccessPayload = {
      sub: actor.sub,
      sysRole: actor.sysRole,
      email: actor.email,
      acct: actor.acct,
      sid: actor.sid,
      shopId: shop.id,
      shopRole: membership?.role ?? 'OWNER',
      perms: effectivePerms,
      tier: shopFull?.subscription?.tier,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: accessTtl,
    });

    return { shop: shopProfile, accessToken, accessExpiresIn: accessTtl };
  }

  /** Primary venue slug for redirects (never the secret `slug--key`). */
  resolveVenuePathForUser(user: {
    memberships: {
      isActive: boolean;
      role: string;
      shop: { slug: string };
    }[];
  }): string | null {
    const active = user.memberships.filter((m) => m.isActive);
    const primary = active.find((m) => m.role === 'OWNER') ?? active[0];
    if (!primary) return null;
    return primary.shop.slug;
  }
}
