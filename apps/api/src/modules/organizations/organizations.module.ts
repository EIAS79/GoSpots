import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { FoundationModule } from '../foundation/foundation.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [FoundationModule, AuditModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
