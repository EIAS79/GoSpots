import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CorrelationIdInterceptor } from './common/correlation-id.interceptor';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { SentryExceptionFilter } from './common/sentry-exception.filter';
import { TenantRlsInterceptor } from './common/tenant-rls.interceptor';
import { VenueContextInterceptor } from './common/venue-context.interceptor';
import { CaptchaAwareThrottlerGuard } from './common/captcha-throttler.guard';
import { TrialAccessGuard } from './common/trial-access.guard';
import { isThrottleDisabled, parsePositiveInt } from './common/throttle.config';
import { AiInsightsModule } from './modules/ai-insights/ai-insights.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CsrfGuard } from './modules/auth/guards/csrf.guard';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { AutomationModule } from './modules/automation/automation.module';
import { BillingModule } from './modules/billing/billing.module';
import { CashModule } from './modules/cash/cash.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { DevicePaymentModule } from './modules/device-payment/device-payment.module';
import { EdgeHubModule } from './modules/edge-hub/edge-hub.module';
import { FinanceModule } from './modules/finance/finance.module';
import { FoundationModule } from './modules/foundation/foundation.module';
import { GalleryModule } from './modules/gallery/gallery.module';
import { GdprModule } from './modules/gdpr/gdpr.module';
import { GrowthModule } from './modules/growth/growth.module';
import { GuestCheckModule } from './modules/guest-check/guest-check.module';
import { GuestModule } from './modules/guest/guest.module';
import { HardwareModule } from './modules/hardware/hardware.module';
import { HealthModule } from './modules/health/health.module';
import { HoursModule } from './modules/hours/hours.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { InventoryV2Module } from './modules/inventory-v2/inventory-v2.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { MailModule } from './modules/mail/mail.module';
import { MediaModule } from './modules/media/media.module';
import { MenuModule } from './modules/menu/menu.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotesModule } from './modules/notes/notes.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OfflineSyncModule } from './modules/offline-sync/offline-sync.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { OperationsModule } from './modules/operations/operations.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PublicModule } from './modules/public/public.module';
import { ReliabilityModule } from './modules/reliability/reliability.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { ResourcesModule } from './modules/resources/resources.module';
import { RestaurantOperationsModule } from './modules/restaurant-operations/restaurant-operations.module';
import { ShopModule } from './modules/shop/shop.module';
import { StaffApprovalsModule } from './modules/staff-approvals/staff-approvals.module';
import { StaffModule } from './modules/staff/staff.module';
import { TicketingModule } from './modules/ticketing/ticketing.module';
import { WorkforceModule } from './modules/workforce/workforce.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = parsePositiveInt(config.get<string>('THROTTLE_TTL_MS'), 60000);
        const limit = parsePositiveInt(config.get<string>('THROTTLE_GLOBAL_LIMIT'), 100);
        return {
          skipIf: () => isThrottleDisabled(config.get<string>('THROTTLE_DISABLED')),
          throttlers: [{ name: 'default', ttl, limit }],
        };
      },
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    FoundationModule,
    MailModule,
    MediaModule,
    AuditModule,
    ShopModule,
    OnboardingModule,
    PublicModule,
    GuestModule,
    AuthModule,
    StaffModule,
    DashboardModule,
    MenuModule,
    ResourcesModule,
    ReservationsModule,
    FinanceModule,
    BillingModule,
    NotificationsModule,
    HoursModule,
    GalleryModule,
    NotesModule,
    GdprModule,
    GuestCheckModule,
    CheckoutModule,
    CashModule,
    DevicePaymentModule,
    ComplianceModule,
    OfflineSyncModule,
    EdgeHubModule,
    StaffApprovalsModule,
    OperationsModule,
    OrderingModule,
    KitchenModule,
    RestaurantOperationsModule,
    InventoryV2Module,
    WorkforceModule,
    GrowthModule,
    OrganizationsModule,
    IntegrationsModule,
    HardwareModule,
    TicketingModule,
    AutomationModule,
    AiInsightsModule,
    ReliabilityModule,
    HealthModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: SentryExceptionFilter },
    { provide: APP_GUARD, useClass: CaptchaAwareThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TrialAccessGuard },
    { provide: APP_INTERCEPTOR, useClass: CorrelationIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: VenueContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantRlsInterceptor },
  ],
})
export class AppModule {}
