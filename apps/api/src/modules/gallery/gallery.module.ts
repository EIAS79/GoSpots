import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { GalleryController } from "./gallery.controller";
import { GalleryService } from "./gallery.service";

@Module({
  imports: [AuditModule],
  controllers: [GalleryController],
  providers: [GalleryService],
})
export class GalleryModule {}
