import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateReservationDto,
  ReservationQueryDto,
  ScheduleQueryDto,
  UpdateReservationDto,
} from './dto/reservations.dto';
import { CreatePublicGamingReservationDto } from '../guest/dto/public-gaming.dto';
import { MailService } from '../mail/mail.service';
import { ReservationsPublicService } from './reservations-public.service';
import { ReservationsScheduleService } from './reservations-schedule.service';
import { ReservationsStaffService } from './reservations-staff.service';

@Injectable()
export class ReservationsService {
  private readonly scheduleSvc: ReservationsScheduleService;
  private readonly staffSvc: ReservationsStaffService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly publicGuest: ReservationsPublicService,
    // Bible §14 reservations split: schedule builder lives on
    // ReservationsScheduleService. Optional so pre-existing unit specs that
    // construct ReservationsService with the legacy 6-arg signature keep working.
    @Optional() scheduleSvc?: ReservationsScheduleService,
    // Bible §14 reservations split: staff CRUD lives on
    // ReservationsStaffService. Optional so pre-existing unit specs that
    // construct ReservationsService without the 8th arg keep working.
    @Optional() staffSvc?: ReservationsStaffService,
  ) {
    this.scheduleSvc = scheduleSvc ?? new ReservationsScheduleService(prisma);
    this.staffSvc =
      staffSvc ??
      new ReservationsStaffService(
        prisma,
        audit,
        notifications,
        mail,
        config,
      );
  }

  /** @see ReservationsStaffService.list */
  async list(actor: JwtAccessPayload, query: ReservationQueryDto) {
    return this.staffSvc.list(actor, query);
  }

  /** @see ReservationsScheduleService.getSchedule */
  async getSchedule(actor: JwtAccessPayload, query: ScheduleQueryDto) {
    return this.scheduleSvc.getSchedule(actor, query);
  }

  /** @see ReservationsScheduleService.getPublicSchedule */
  async getPublicSchedule(
    slug: string,
    query: ScheduleQueryDto,
    kind?: 'dining' | 'gaming',
  ) {
    return this.scheduleSvc.getPublicSchedule(slug, query, kind);
  }

  async createPublicGamingBooking(
    slug: string,
    dto: CreatePublicGamingReservationDto,
    kind?: 'dining' | 'gaming',
  ) {
    return this.publicGuest.createPublicGamingBooking(slug, dto, kind);
  }

  async getPublicGamingStatus(
    slug: string,
    token: string,
    kind?: 'dining' | 'gaming',
  ) {
    return this.publicGuest.getPublicGamingStatus(slug, token, kind);
  }

  async cancelPublicGamingBooking(
    slug: string,
    token: string,
    kind?: 'dining' | 'gaming',
  ) {
    return this.publicGuest.cancelPublicGamingBooking(slug, token, kind);
  }

  /** @see ReservationsStaffService.create */
  async create(actor: JwtAccessPayload, dto: CreateReservationDto) {
    return this.staffSvc.create(actor, dto);
  }

  /** @see ReservationsStaffService.update */
  async update(actor: JwtAccessPayload, id: string, dto: UpdateReservationDto) {
    return this.staffSvc.update(actor, id, dto);
  }

  /** @see ReservationsStaffService.delete */
  async delete(actor: JwtAccessPayload, id: string) {
    return this.staffSvc.delete(actor, id);
  }
}
