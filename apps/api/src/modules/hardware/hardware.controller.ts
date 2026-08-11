import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/auth.service';
import {
  BindCustomerDisplayDto,
  CompletePrintJobDto,
  ConfigurePrinterDto,
  CreatePrintJobDto,
  CreatePrintRouteDto,
  UpdateCustomerDisplaySnapshotDto,
  UpsertBarcodeAliasDto,
} from './dto/hardware.dto';
import { HardwareService } from './hardware.service';

@ApiTags('hardware')
@Controller('hardware')
export class HardwareController {
  constructor(private readonly hardware: HardwareService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  overview(@CurrentUser() user: JwtAccessPayload) {
    return this.hardware.overview(user);
  }

  @Post('printers/configure')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  configurePrinter(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: ConfigurePrinterDto,
  ) {
    return this.hardware.configurePrinter(user, dto);
  }

  @Post('print-routes')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  createRoute(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreatePrintRouteDto,
  ) {
    return this.hardware.createRoute(user, dto);
  }

  @Post('print-jobs')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE, PERMISSIONS.SHOP_MANAGE)
  createPrintJob(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: CreatePrintJobDto,
  ) {
    return this.hardware.createPrintJob(user, dto);
  }

  @Post('print-jobs/:id/retry')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  retryPrintJob(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ) {
    return this.hardware.retryPrintJob(user, id);
  }

  @Post('customer-displays/bind')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  bindDisplay(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: BindCustomerDisplayDto,
  ) {
    return this.hardware.bindCustomerDisplay(user, dto);
  }

  @Post('customer-displays/:id/snapshot')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE, PERMISSIONS.SHOP_MANAGE)
  updateDisplay(
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDisplaySnapshotDto,
  ) {
    return this.hardware.updateDisplaySnapshot(user, id, dto);
  }

  @Public()
  @Get('customer-display/feed')
  displayFeed(@Headers('authorization') authorization?: string) {
    return this.hardware.customerDisplayFeed(authorization);
  }

  @Post('barcodes')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.SHOP_MANAGE)
  upsertBarcode(
    @CurrentUser() user: JwtAccessPayload,
    @Body() dto: UpsertBarcodeAliasDto,
  ) {
    return this.hardware.upsertBarcode(user, dto);
  }

  @Get('barcodes/resolve')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions(PERMISSIONS.TRANSACTION_READ, PERMISSIONS.SHOP_MANAGE)
  resolveBarcode(
    @CurrentUser() user: JwtAccessPayload,
    @Query('barcode') barcode: string,
  ) {
    return this.hardware.resolveBarcode(user, barcode);
  }

  @Public()
  @Post('edge/print-jobs/claim')
  edgeClaim(@Headers() headers: Record<string, string | string[] | undefined>) {
    return this.hardware.edgeClaim(headers);
  }

  @Public()
  @Post('edge/print-jobs/:id/printing')
  edgePrinting(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
  ) {
    return this.hardware.edgeMarkPrinting(headers, id);
  }

  @Public()
  @Post('edge/print-jobs/:id/complete')
  edgeComplete(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Param('id') id: string,
    @Body() dto: CompletePrintJobDto,
  ) {
    return this.hardware.edgeComplete(headers, id, dto);
  }
}
