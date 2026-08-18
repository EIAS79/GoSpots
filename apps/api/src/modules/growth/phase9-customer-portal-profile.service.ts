import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Phase9CustomerPortalService } from './phase9-customer-portal.service';

export type PortalProfileUpdate = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

@Injectable()
export class Phase9CustomerPortalProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly portal: Phase9CustomerPortalService,
  ) {}

  async update(rawToken: string, dto: PortalProfileUpdate) {
    const access = await this.portal.accessContext(rawToken);
    const current = await this.prisma.customerProfile.findFirst({
      where: { id: access.customerId, shopId: access.shopId },
    });
    if (!current) throw new NotFoundException('Customer not found.');

    const nextName =
      dto.name === undefined ? current.name : dto.name?.trim() || null;
    const nextEmail =
      dto.email === undefined ? current.email : this.normalizeEmail(dto.email);
    const nextPhone =
      dto.phone === undefined ? current.phone : this.normalizePhone(dto.phone);

    if (nextName && nextName.length > 160) {
      throw new BadRequestException('Name must be at most 160 characters.');
    }
    if (nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) {
      throw new BadRequestException('Email address is invalid.');
    }
    if (nextPhone && nextPhone.length > 40) {
      throw new BadRequestException('Phone number is too long.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`customer-profile:${access.shopId}:${access.customerId}`}))`;
      await this.assertIdentityAvailable(
        tx,
        access.shopId,
        access.customerId,
        'EMAIL',
        nextEmail,
      );
      await this.assertIdentityAvailable(
        tx,
        access.shopId,
        access.customerId,
        'PHONE',
        nextPhone,
      );

      const row = await tx.customerProfile.update({
        where: { id: access.customerId },
        data: { name: nextName, email: nextEmail, phone: nextPhone },
      });

      // CustomerIdentity intentionally keeps prior aliases so historical
      // reservations and dedupe evidence remain linked to the same customer.
      // Current profile fields are the customer-controlled contact values.
      if (nextEmail) {
        await tx.customerIdentity.upsert({
          where: {
            shopId_kind_normalizedValue: {
              shopId: access.shopId,
              kind: 'EMAIL',
              normalizedValue: nextEmail,
            },
          },
          create: {
            shopId: access.shopId,
            customerId: access.customerId,
            kind: 'EMAIL',
            normalizedValue: nextEmail,
          },
          update: { customerId: access.customerId },
        });
      }
      if (nextPhone) {
        await tx.customerIdentity.upsert({
          where: {
            shopId_kind_normalizedValue: {
              shopId: access.shopId,
              kind: 'PHONE',
              normalizedValue: nextPhone,
            },
          },
          create: {
            shopId: access.shopId,
            customerId: access.customerId,
            kind: 'PHONE',
            normalizedValue: nextPhone,
          },
          update: { customerId: access.customerId },
        });
      }
      return row;
    });

    await this.audit.recordForShop(access.shopId, {
      section: 'customer',
      action: 'customer.portal.profile.update',
      summary: 'Customer updated portal profile details',
      previousState: {
        name: current.name,
        email: current.email,
        phone: current.phone,
      },
      newState: {
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
      },
      meta: { customerId: updated.id },
      actorName: 'Customer portal',
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
    };
  }

  private async assertIdentityAvailable(
    tx: Prisma.TransactionClient,
    shopId: string,
    customerId: string,
    kind: 'EMAIL' | 'PHONE',
    normalizedValue: string | null,
  ) {
    if (!normalizedValue) return;
    const identity = await tx.customerIdentity.findUnique({
      where: {
        shopId_kind_normalizedValue: { shopId, kind, normalizedValue },
      },
    });
    if (identity && identity.customerId !== customerId) {
      throw new ConflictException(
        `${kind === 'EMAIL' ? 'Email' : 'Phone'} is already linked to another customer.`,
      );
    }
  }

  private normalizeEmail(value?: string | null) {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }

  private normalizePhone(value?: string | null) {
    const normalized = value?.trim().replace(/[\s().-]/g, '');
    return normalized || null;
  }
}
