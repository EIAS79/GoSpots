import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BindRfidCredentialDto,
  CreateRfidWalletDto,
  CreateTicketProductDto,
  IssueTicketOrderDto,
  ReverseRfidEntryDto,
  RfidTapDto,
  RfidWalletMutationDto,
  ScanTicketDto,
} from './dto/ticketing.dto';
import { TicketingService } from './ticketing.service';

@ApiTags('ticketing')
@Controller('ticketing')
@UseGuards(JwtAuthGuard)
@RequirePermissions(PERMISSIONS.TICKETING_MANAGE)
export class TicketingController {
  constructor(private readonly ticketing: TicketingService) {}

  @Get()
  overview(@CurrentUser() user: JwtAccessPayload) {
    return this.ticketing.overview(user);
  }

  @Post('products')
  createProduct(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateTicketProductDto) {
    return this.ticketing.createProduct(user, dto);
  }

  @Post('orders')
  issueOrder(@CurrentUser() user: JwtAccessPayload, @Body() dto: IssueTicketOrderDto) {
    return this.ticketing.issueOrder(user, dto);
  }

  @Post('tickets/scan')
  scan(@CurrentUser() user: JwtAccessPayload, @Body() dto: ScanTicketDto) {
    return this.ticketing.scan(user, dto);
  }

  @Post('rfid/wallets')
  createWallet(@CurrentUser() user: JwtAccessPayload, @Body() dto: CreateRfidWalletDto) {
    return this.ticketing.createWallet(user, dto);
  }

  @Post('rfid/credentials')
  bindCredential(@CurrentUser() user: JwtAccessPayload, @Body() dto: BindRfidCredentialDto) {
    return this.ticketing.bindCredential(user, dto);
  }

  @Post('rfid/wallets/:id/load')
  load(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: RfidWalletMutationDto) {
    return this.ticketing.load(user, id, dto);
  }

  @Post('rfid/wallets/:id/spend')
  spend(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: RfidWalletMutationDto) {
    return this.ticketing.spend(user, id, dto);
  }

  @Post('rfid/wallets/:id/refund')
  refund(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: RfidWalletMutationDto) {
    return this.ticketing.refund(user, id, dto);
  }

  @Post('rfid/wallets/:id/reverse')
  reverse(@CurrentUser() user: JwtAccessPayload, @Param('id') id: string, @Body() dto: ReverseRfidEntryDto) {
    return this.ticketing.reverse(user, id, dto);
  }

  @Post('rfid/tap')
  tap(@CurrentUser() user: JwtAccessPayload, @Body() dto: RfidTapDto) {
    return this.ticketing.tap(user, dto);
  }

  @Get('readiness')
  readiness(@CurrentUser() user: JwtAccessPayload) {
    return this.ticketing.readiness(user);
  }
}
