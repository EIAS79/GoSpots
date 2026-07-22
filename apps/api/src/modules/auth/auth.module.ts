import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthSessionService } from './auth-session.service';
import { AuthRefreshService } from './auth-refresh.service';
import { AuthLogoutService } from './auth-logout.service';
import { AuthPasswordService } from './auth-password.service';
import { AuthVenueService } from './auth-venue.service';
import { AuthMfaService } from './auth-mfa.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    MailModule,
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt-access' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: +config.get('JWT_ACCESS_TTL', '900'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthSessionService,
    AuthRefreshService,
    AuthLogoutService,
    AuthPasswordService,
    AuthVenueService,
    AuthMfaService,
    AuthService,
    JwtAccessStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule {}
