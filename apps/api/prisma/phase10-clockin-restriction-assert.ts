import { firstValueFrom, of } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import type { JwtAccessPayload } from '../src/modules/auth/auth.types';
import { Phase10ClockInRestrictionInterceptor } from '../src/modules/workforce/phase10-clockin-restriction.interceptor';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE10_CLOCKIN: ${message}`);
}

function requestContext(actor: JwtAccessPayload, body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/v1/workforce/clock-in',
        body,
        user: actor,
      }),
    }),
  } as unknown as ExecutionContext;
}

async function attempt(
  interceptor: Phase10ClockInRestrictionInterceptor,
  actor: JwtAccessPayload,
  body: Record<string, unknown>,
) {
  return firstValueFrom(
    interceptor.intercept(requestContext(actor, body), { handle: () => of('allowed') }),
  );
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const shop = await prisma.shop.findFirst({
    where: { name: 'Phase 10 Pilot' },
    orderBy: { createdAt: 'desc' },
  });
  const otherShop = await prisma.shop.findFirst({
    where: { name: 'Phase 10 Other' },
    orderBy: { createdAt: 'desc' },
  });
  assert(shop && otherShop, 'operational pilot shops were not found');

  const staff = await prisma.membership.findFirst({
    where: { shopId: shop.id, role: 'STAFF', isActive: true },
    include: { user: true },
  });
  assert(staff, 'active pilot staff membership was not found');

  const actor: JwtAccessPayload = {
    sub: staff.userId,
    shopId: shop.id,
    sysRole: 'USER',
    shopRole: 'STAFF',
    email: staff.user.email,
    perms: '*',
  };

  const localDevice = await prisma.device.create({
    data: {
      shopId: shop.id,
      label: `Phase 10 Clock-In POS ${Date.now()}`,
      type: 'POS',
      status: 'ACTIVE',
    },
  });
  const foreignDevice = await prisma.device.create({
    data: {
      shopId: otherShop.id,
      label: `Phase 10 Foreign POS ${Date.now()}`,
      type: 'POS',
      status: 'ACTIVE',
    },
  });

  await prisma.workforcePolicy.update({
    where: { shopId: shop.id },
    data: {
      clockInDeviceRequired: true,
      clockInAllowedDeviceIds: [localDevice.id],
      clockInLocationRequired: true,
      clockInLatitude: 52.2297,
      clockInLongitude: 21.0122,
      clockInRadiusMeters: 100,
    },
  });

  const interceptor = new Phase10ClockInRestrictionInterceptor(prisma);

  let missingDeviceDenied = false;
  try {
    await attempt(interceptor, actor, { latitude: 52.2297, longitude: 21.0122 });
  } catch (error) {
    missingDeviceDenied = /active registered venue device/i.test(String(error));
  }
  assert(missingDeviceDenied, 'device-required clock-in accepted no device');

  let foreignDeviceDenied = false;
  try {
    await attempt(interceptor, actor, {
      deviceId: foreignDevice.id,
      latitude: 52.2297,
      longitude: 21.0122,
    });
  } catch (error) {
    foreignDeviceDenied = /does not belong to this venue/i.test(String(error));
  }
  assert(foreignDeviceDenied, 'cross-tenant clock-in device was accepted');

  let outsideRadiusDenied = false;
  try {
    await attempt(interceptor, actor, {
      deviceId: localDevice.id,
      latitude: 52.24,
      longitude: 21.0122,
    });
  } catch (error) {
    outsideRadiusDenied = /outside the configured venue radius/i.test(String(error));
  }
  assert(outsideRadiusDenied, 'out-of-radius clock-in was accepted');

  const allowed = await attempt(interceptor, actor, {
    deviceId: localDevice.id,
    latitude: 52.2297,
    longitude: 21.0122,
  });
  assert(allowed === 'allowed', 'valid device/geofence clock-in evidence was rejected');

  await prisma.workforcePolicy.update({
    where: { shopId: shop.id },
    data: {
      clockInDeviceRequired: false,
      clockInAllowedDeviceIds: [],
      clockInLocationRequired: false,
      clockInLatitude: null,
      clockInLongitude: null,
    },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        shopId: shop.id,
        deviceRestriction: true,
        crossTenantDeviceDenied: true,
        geofenceRestriction: true,
        validClockInEvidenceAccepted: true,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});