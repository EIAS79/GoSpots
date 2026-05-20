import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { StaffModule } from "./modules/staff/staff.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { MenuModule } from "./modules/menu/menu.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { ReservationsModule } from "./modules/reservations/reservations.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { AuditModule } from "./modules/audit/audit.module";
import { PublicModule } from "./modules/public/public.module";
import { ShopModule } from "./modules/shop/shop.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { HoursModule } from "./modules/hours/hours.module";
import { GalleryModule } from "./modules/gallery/gallery.module";
import { MediaModule } from "./modules/media/media.module";
import { VenueContextInterceptor } from "./common/venue-context.interceptor";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { RolesGuard } from "./modules/auth/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    MediaModule,
    AuditModule,
    ShopModule,
    PublicModule,
    AuthModule,
    StaffModule,
    DashboardModule,
    MenuModule,
    ResourcesModule,
    ReservationsModule,
    FinanceModule,
    NotificationsModule,
    HoursModule,
    GalleryModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: VenueContextInterceptor },
  ],
})
export class AppModule {}
