import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { wrapPrismaWithTenantRls } from '../common/tenant-rls.util';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // Proxy model/$queryRaw onto the request RLS transaction when ALS is set.
    // eslint-disable-next-line no-constructor-return -- Nest DI receives the proxy.
    return wrapPrismaWithTenantRls(this);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
