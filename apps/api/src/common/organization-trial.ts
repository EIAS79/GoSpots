import { BadRequestException } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export type OrganizationTrialRecord = {
  id: string;
  legalName: string;
  countryCode: string;
  businessIdNormalized: string;
  businessIdDisplay: string;
  trialStartedAt: Date;
  trialEndsAt: Date;
  trialConsumedAt: Date;
};

type DbClient = Prisma.TransactionClient | PrismaClient;

export function normalizeBusinessCountryCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new BadRequestException(
      'Business country must be a 2-letter country code (for example PL, DE or AE).',
    );
  }
  return code;
}

export function normalizeBusinessIdentifier(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 4 || normalized.length > 64) {
    throw new BadRequestException(
      'Business tax/company identifier must contain 4–64 letters or digits.',
    );
  }
  return normalized;
}

export async function findOrganizationTrialByIdentity(
  db: DbClient,
  countryCode: string,
  businessIdNormalized: string,
): Promise<OrganizationTrialRecord | null> {
  const rows = await db.$queryRaw<OrganizationTrialRecord[]>(Prisma.sql`
    SELECT
      id,
      "legalName",
      "countryCode",
      "businessIdNormalized",
      "businessIdDisplay",
      "trialStartedAt",
      "trialEndsAt",
      "trialConsumedAt"
    FROM "OrganizationTrial"
    WHERE "countryCode" = ${countryCode}
      AND "businessIdNormalized" = ${businessIdNormalized}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function getOrganizationTrialForOwner(
  db: DbClient,
  userId: string,
): Promise<OrganizationTrialRecord | null> {
  const rows = await db.$queryRaw<OrganizationTrialRecord[]>(Prisma.sql`
    SELECT
      o.id,
      o."legalName",
      o."countryCode",
      o."businessIdNormalized",
      o."businessIdDisplay",
      o."trialStartedAt",
      o."trialEndsAt",
      o."trialConsumedAt"
    FROM "OrganizationTrialOwner" m
    JOIN "OrganizationTrial" o ON o.id = m."organizationTrialId"
    WHERE m."userId" = ${userId}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export async function createOrganizationTrial(
  db: DbClient,
  input: {
    legalName: string;
    countryCode: string;
    businessIdNormalized: string;
    businessIdDisplay: string;
    trialStartedAt: Date;
    trialEndsAt: Date;
  },
): Promise<OrganizationTrialRecord> {
  const id = `org_${randomUUID()}`;
  const rows = await db.$queryRaw<OrganizationTrialRecord[]>(Prisma.sql`
    INSERT INTO "OrganizationTrial" (
      id,
      "legalName",
      "countryCode",
      "businessIdNormalized",
      "businessIdDisplay",
      "trialStartedAt",
      "trialEndsAt",
      "trialConsumedAt",
      "createdAt",
      "updatedAt"
    ) VALUES (
      ${id},
      ${input.legalName},
      ${input.countryCode},
      ${input.businessIdNormalized},
      ${input.businessIdDisplay},
      ${input.trialStartedAt},
      ${input.trialEndsAt},
      ${input.trialStartedAt},
      NOW(),
      NOW()
    )
    RETURNING
      id,
      "legalName",
      "countryCode",
      "businessIdNormalized",
      "businessIdDisplay",
      "trialStartedAt",
      "trialEndsAt",
      "trialConsumedAt"
  `);
  return rows[0]!;
}

export async function linkOwnerToOrganizationTrial(
  db: DbClient,
  userId: string,
  organizationTrialId: string,
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "OrganizationTrialOwner" (
      "userId",
      "organizationTrialId",
      "createdAt"
    ) VALUES (${userId}, ${organizationTrialId}, NOW())
    ON CONFLICT ("userId") DO UPDATE
      SET "organizationTrialId" = EXCLUDED."organizationTrialId"
  `);
}

export async function linkShopToOrganizationTrial(
  db: DbClient,
  shopId: string,
  organizationTrialId: string,
): Promise<void> {
  await db.$executeRaw(Prisma.sql`
    INSERT INTO "OrganizationTrialShop" (
      "shopId",
      "organizationTrialId",
      "createdAt"
    ) VALUES (${shopId}, ${organizationTrialId}, NOW())
    ON CONFLICT ("shopId") DO UPDATE
      SET "organizationTrialId" = EXCLUDED."organizationTrialId"
  `);
}
