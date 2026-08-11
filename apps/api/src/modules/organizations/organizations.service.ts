import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerKind,
  OrganizationAccessMode,
  OrganizationRole,
  Prisma,
  ShopRole,
} from '@prisma/client';
import {
  applyTenantRlsSession,
  getTenantRlsStore,
} from '../../common/tenant-rls.util';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { FeatureFlagService } from '../foundation/feature-flag.service';
import {
  AddOrganizationMemberDto,
  AddOrganizationShopDto,
  CreateOrganizationDto,
  UpdateOrganizationMemberDto,
  UpdateOrganizationShopDto,
} from './dto/organization.dto';

const ORG_ADMIN_ROLES = new Set<OrganizationRole>([
  OrganizationRole.OWNER,
  OrganizationRole.ADMIN,
]);

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flags: FeatureFlagService,
    private readonly audit: AuditService,
  ) {}

  private async requireFeature(actor: JwtAccessPayload) {
    const shopId = requireShopId(actor);
    if (!(await this.flags.isFeatureEnabled(shopId, 'organizations_v1'))) {
      throw new ForbiddenException('Organizations are not enabled for this venue');
    }
    return shopId;
  }

  private async requireOrgMembership(actor: JwtAccessPayload, organizationId: string) {
    const membership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId: actor.sub },
      },
    });
    if (!membership) throw new ForbiddenException('Organization access denied');
    return membership;
  }

  private async requireOrgAdmin(actor: JwtAccessPayload, organizationId: string) {
    const membership = await this.requireOrgMembership(actor, organizationId);
    if (!ORG_ADMIN_ROLES.has(membership.role)) {
      throw new ForbiddenException('Organization administrator access required');
    }
    return membership;
  }

  /**
   * Group reads legitimately span tenant rows. If the HTTP request currently
   * runs under single-Shop FORCE RLS, temporarily enter bypass only after an
   * OrganizationMembership check and always restore tenant mode in finally.
   */
  private async withVerifiedGroupRead<T>(
    actor: JwtAccessPayload,
    organizationId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    await this.requireOrgMembership(actor, organizationId);
    const store = getTenantRlsStore();
    if (!store?.tx) return fn();
    const activeShopId = requireShopId(actor);
    await applyTenantRlsSession(store.tx, { shopId: activeShopId, mode: 'bypass' });
    try {
      return await fn();
    } finally {
      await applyTenantRlsSession(store.tx, { shopId: activeShopId, mode: 'tenant' });
    }
  }

  private async accessibleShopIds(
    actor: JwtAccessPayload,
    organizationId: string,
  ): Promise<Set<string>> {
    const orgMembership = await this.requireOrgMembership(actor, organizationId);
    const orgShops = await this.prisma.organizationShop.findMany({
      where: { organizationId },
      select: { shopId: true },
    });
    if (orgMembership.accessMode === OrganizationAccessMode.ALL_SHOPS) {
      return new Set(orgShops.map((row) => row.shopId));
    }

    return this.withVerifiedGroupRead(actor, organizationId, async () => {
      const direct = await this.prisma.membership.findMany({
        where: {
          userId: actor.sub,
          shopId: { in: orgShops.map((row) => row.shopId) },
        },
        select: { shopId: true },
      });
      return new Set(direct.map((row) => row.shopId));
    });
  }

  async list(actor: JwtAccessPayload) {
    await this.requireFeature(actor);
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: actor.sub },
      include: {
        organization: { include: { shops: { orderBy: { sortOrder: 'asc' } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return this.withVerifiedGroupReadForList(actor, async () => {
      const allShopIds = memberships.flatMap((row) =>
        row.organization.shops.map((shop) => shop.shopId),
      );
      const [shops, directMemberships] = await Promise.all([
        this.prisma.shop.findMany({
          where: { id: { in: allShopIds } },
          select: {
            id: true,
            name: true,
            slug: true,
            dashboardKey: true,
            currency: true,
            timezone: true,
          },
        }),
        this.prisma.membership.findMany({
          where: { userId: actor.sub, shopId: { in: allShopIds } },
          select: { shopId: true, role: true },
        }),
      ]);
      const shopById = new Map(shops.map((shop) => [shop.id, shop]));
      const directByShop = new Map(directMemberships.map((m) => [m.shopId, m.role]));

      return {
        organizations: memberships.map((membership) => ({
          id: membership.organization.id,
          name: membership.organization.name,
          slug: membership.organization.slug,
          role: membership.role,
          accessMode: membership.accessMode,
          shops: membership.organization.shops.map((orgShop) => {
            const shop = shopById.get(orgShop.shopId);
            return {
              id: orgShop.shopId,
              name: orgShop.displayName || shop?.name || 'Venue',
              slug: shop?.slug ?? null,
              venuePath: shop?.dashboardKey ?? shop?.slug ?? null,
              currency: shop?.currency ?? null,
              timezone: shop?.timezone ?? null,
              sharedCatalogEnabled: orgShop.sharedCatalogEnabled,
              inheritedSettings: orgShop.inheritedSettings ?? null,
              overrideSettings: orgShop.overrideSettings ?? null,
              operationalAccess: directByShop.has(orgShop.shopId),
              operationalRole: directByShop.get(orgShop.shopId) ?? null,
            };
          }),
        })),
      };
    });
  }

  private async withVerifiedGroupReadForList<T>(actor: JwtAccessPayload, fn: () => Promise<T>) {
    const store = getTenantRlsStore();
    if (!store?.tx) return fn();
    const activeShopId = requireShopId(actor);
    await applyTenantRlsSession(store.tx, { shopId: activeShopId, mode: 'bypass' });
    try {
      return await fn();
    } finally {
      await applyTenantRlsSession(store.tx, { shopId: activeShopId, mode: 'tenant' });
    }
  }

  async create(actor: JwtAccessPayload, dto: CreateOrganizationDto) {
    const shopId = await this.requireFeature(actor);
    if (actor.shopRole !== ShopRole.OWNER) {
      throw new ForbiddenException('Only a venue owner can create an organization');
    }

    const linked = await this.prisma.organizationShop.findUnique({ where: { shopId } });
    if (linked) throw new ConflictException('This venue already belongs to an organization');

    const organization = await this.prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          slug: dto.slug.trim().toLowerCase(),
          createdById: actor.sub,
        },
      });
      await tx.organizationMembership.create({
        data: {
          organizationId: created.id,
          userId: actor.sub,
          role: OrganizationRole.OWNER,
          accessMode: OrganizationAccessMode.ALL_SHOPS,
        },
      });
      await tx.organizationShop.create({
        data: { organizationId: created.id, shopId },
      });
      return created;
    });

    await this.audit.record(actor, {
      section: 'venue',
      action: 'organization.created',
      summary: `Created organization ${organization.name}`,
      meta: { organizationId: organization.id },
    });
    return organization;
  }

  async addShop(actor: JwtAccessPayload, organizationId: string, dto: AddOrganizationShopDto) {
    await this.requireFeature(actor);
    await this.requireOrgAdmin(actor, organizationId);

    const targetOwner = await this.withVerifiedGroupRead(actor, organizationId, () =>
      this.prisma.membership.findFirst({
        where: { userId: actor.sub, shopId: dto.shopId, role: ShopRole.OWNER },
        select: { id: true },
      }),
    );
    if (!targetOwner) {
      throw new ForbiddenException('You must directly own the venue before linking it to an organization');
    }

    try {
      const row = await this.prisma.organizationShop.create({
        data: {
          organizationId,
          shopId: dto.shopId,
          displayName: dto.displayName?.trim() || null,
          sharedCatalogEnabled: dto.sharedCatalogEnabled ?? false,
          overrideSettings: dto.overrideSettings as Prisma.InputJsonValue | undefined,
        },
      });
      await this.audit.record(actor, {
        section: 'venue',
        action: 'organization.shop_linked',
        summary: 'Linked venue to organization',
        meta: { organizationId, shopId: dto.shopId },
      });
      return row;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Venue is already linked to an organization');
      }
      throw error;
    }
  }

  async updateShop(
    actor: JwtAccessPayload,
    organizationId: string,
    shopId: string,
    dto: UpdateOrganizationShopDto,
  ) {
    await this.requireFeature(actor);
    await this.requireOrgAdmin(actor, organizationId);
    const row = await this.prisma.organizationShop.findUnique({ where: { shopId } });
    if (!row || row.organizationId !== organizationId) {
      throw new NotFoundException('Organization venue not found');
    }
    const updated = await this.prisma.organizationShop.update({
      where: { shopId },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() || null } : {}),
        ...(dto.sharedCatalogEnabled !== undefined
          ? { sharedCatalogEnabled: dto.sharedCatalogEnabled }
          : {}),
        ...(dto.inheritedSettings !== undefined
          ? { inheritedSettings: dto.inheritedSettings as Prisma.InputJsonValue }
          : {}),
        ...(dto.overrideSettings !== undefined
          ? { overrideSettings: dto.overrideSettings as Prisma.InputJsonValue }
          : {}),
      },
    });
    await this.audit.record(actor, {
      section: 'venue',
      action: 'organization.shop_updated',
      summary: 'Updated organization venue settings',
      meta: {
        organizationId,
        shopId,
        sharedCatalogEnabled: updated.sharedCatalogEnabled,
      },
    });
    return updated;
  }

  async addMember(actor: JwtAccessPayload, organizationId: string, dto: AddOrganizationMemberDto) {
    await this.requireFeature(actor);
    await this.requireOrgAdmin(actor, organizationId);
    if (dto.role === OrganizationRole.OWNER) {
      const current = await this.requireOrgMembership(actor, organizationId);
      if (current.role !== OrganizationRole.OWNER) {
        throw new ForbiddenException('Only an organization owner can add another owner');
      }
    }
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, email: true, name: true },
    });
    if (!user) throw new NotFoundException('User must have a GoSpots account before being added');

    const membership = await this.prisma.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      create: {
        organizationId,
        userId: user.id,
        role: dto.role,
        accessMode: dto.accessMode ?? OrganizationAccessMode.EXPLICIT,
      },
      update: {
        role: dto.role,
        ...(dto.accessMode ? { accessMode: dto.accessMode } : {}),
      },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'organization.member_upserted',
      summary: `Updated organization member ${user.email}`,
      meta: { organizationId, userId: user.id, role: membership.role },
    });
    return { ...membership, user };
  }

  async updateMember(
    actor: JwtAccessPayload,
    organizationId: string,
    memberId: string,
    dto: UpdateOrganizationMemberDto,
  ) {
    await this.requireFeature(actor);
    const admin = await this.requireOrgAdmin(actor, organizationId);
    const target = await this.prisma.organizationMembership.findFirst({
      where: { id: memberId, organizationId },
    });
    if (!target) throw new NotFoundException('Organization member not found');
    if (
      (target.role === OrganizationRole.OWNER || dto.role === OrganizationRole.OWNER) &&
      admin.role !== OrganizationRole.OWNER
    ) {
      throw new ForbiddenException('Only an organization owner can change owner membership');
    }
    if (target.role === OrganizationRole.OWNER && dto.role && dto.role !== OrganizationRole.OWNER) {
      const owners = await this.prisma.organizationMembership.count({
        where: { organizationId, role: OrganizationRole.OWNER },
      });
      if (owners <= 1) throw new ConflictException('Organization must keep at least one owner');
    }
    const updated = await this.prisma.organizationMembership.update({
      where: { id: memberId },
      data: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(dto.accessMode ? { accessMode: dto.accessMode } : {}),
      },
    });
    await this.audit.record(actor, {
      section: 'team',
      action: 'organization.member_updated',
      summary: 'Updated organization membership',
      meta: {
        organizationId,
        memberId,
        userId: target.userId,
        role: updated.role,
        accessMode: updated.accessMode,
      },
    });
    return updated;
  }

  async groupAnalytics(
    actor: JwtAccessPayload,
    organizationId: string,
    from?: string,
    to?: string,
  ) {
    await this.requireFeature(actor);
    const allowed = await this.accessibleShopIds(actor, organizationId);
    const shopIds = [...allowed];
    if (!shopIds.length) return { shops: [], totals: { netRevenue: '0.0000' } };
    const gte = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lt = to ? new Date(to) : new Date();
    if (Number.isNaN(gte.getTime()) || Number.isNaN(lt.getTime()) || gte >= lt) {
      throw new ConflictException('Invalid analytics date range');
    }

    return this.withVerifiedGroupRead(actor, organizationId, async () => {
      const [rows, shops] = await Promise.all([
        this.prisma.ledgerEntry.groupBy({
          by: ['shopId', 'kind'],
          where: { shopId: { in: shopIds }, occurredAt: { gte, lt } },
          _sum: { amount: true },
        }),
        this.prisma.shop.findMany({
          where: { id: { in: shopIds } },
          select: { id: true, name: true, currency: true },
        }),
      ]);
      const byShop = new Map<string, Prisma.Decimal>();
      for (const row of rows) {
        const signed =
          row.kind === LedgerKind.REFUND || row.kind === LedgerKind.LOSS
            ? row._sum.amount?.negated()
            : row._sum.amount;
        if (!signed) continue;
        byShop.set(
          row.shopId,
          (byShop.get(row.shopId) ?? new Prisma.Decimal(0)).add(signed),
        );
      }
      const currencies = new Set(shops.map((shop) => shop.currency));
      const comparable = currencies.size <= 1;
      const total = comparable
        ? [...byShop.values()].reduce(
            (sum, value) => sum.add(value),
            new Prisma.Decimal(0),
          )
        : null;
      return {
        from: gte.toISOString(),
        to: lt.toISOString(),
        comparableCurrency: comparable ? shops[0]?.currency ?? null : null,
        totals: { netRevenue: total?.toFixed(4) ?? null },
        shops: shops.map((shop) => ({
          id: shop.id,
          name: shop.name,
          currency: shop.currency,
          netRevenue: (byShop.get(shop.id) ?? new Prisma.Decimal(0)).toFixed(4),
        })),
      };
    });
  }
}
