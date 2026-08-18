import { Injectable } from '@nestjs/common';
import { permissionsToEffectiveCsv } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EdgeOperatorSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async snapshot(shopId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { shopId, isActive: true },
      include: { permissionRows: true },
    });
    return memberships.map((membership) => ({
      id: membership.userId,
      userId: membership.userId,
      role: membership.role,
      isActive: membership.isActive,
      permissions: permissionsToEffectiveCsv({ permissionRows: membership.permissionRows }),
    }));
  }
}
