import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CancelOrderLineDto, CreateModifierDto, CreateModifierGroupDto, CreateVariantDto, CreateVenueOrderDto, LinkModifierGroupDto, UpsertCommerceProfileDto } from './dto/ordering.dto';
import { OrderingService } from './ordering.service';

@ApiTags('ordering') @Controller('ordering') @UseGuards(JwtAuthGuard)
export class OrderingController {
  constructor(private readonly ordering: OrderingService) {}
  @Get('catalog') @RequirePermissions(PERMISSIONS.MENU_READ) catalog(@CurrentUser() u: JwtAccessPayload) { return this.ordering.catalog(u); }
  @Post('modifier-groups') @RequirePermissions(PERMISSIONS.MENU_WRITE) createGroup(@CurrentUser() u: JwtAccessPayload, @Body() d: CreateModifierGroupDto) { return this.ordering.createGroup(u,d); }
  @Post('modifiers') @RequirePermissions(PERMISSIONS.MENU_WRITE) createModifier(@CurrentUser() u: JwtAccessPayload, @Body() d: CreateModifierDto) { return this.ordering.createModifier(u,d); }
  @Post('variants') @RequirePermissions(PERMISSIONS.MENU_WRITE) createVariant(@CurrentUser() u: JwtAccessPayload, @Body() d: CreateVariantDto) { return this.ordering.createVariant(u,d); }
  @Post('item-modifier-groups') @RequirePermissions(PERMISSIONS.MENU_WRITE) linkGroup(@CurrentUser() u: JwtAccessPayload, @Body() d: LinkModifierGroupDto) { return this.ordering.linkGroup(u,d); }
  @Put('commerce-profile') @RequirePermissions(PERMISSIONS.MENU_WRITE) profile(@CurrentUser() u: JwtAccessPayload, @Body() d: UpsertCommerceProfileDto) { return this.ordering.upsertProfile(u,d); }
  @Get('orders') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) list(@CurrentUser() u: JwtAccessPayload) { return this.ordering.listOrders(u); }
  @Get('orders/:id') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) get(@CurrentUser() u: JwtAccessPayload, @Param('id') id: string) { return this.ordering.getOrder(u,id); }
  @Post('orders') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) create(@CurrentUser() u: JwtAccessPayload, @Body() d: CreateVenueOrderDto) { return this.ordering.createOrder(u,d); }
  @Post('orders/:orderId/lines/:lineId/cancel') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) cancelLine(@CurrentUser() u: JwtAccessPayload,@Param('orderId') orderId:string,@Param('lineId') lineId:string,@Body() d:CancelOrderLineDto){return this.ordering.cancelLine(u,orderId,lineId,d);}
  @Delete('orders/:id') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) cancel(@CurrentUser() u: JwtAccessPayload,@Param('id') id:string){return this.ordering.cancelOrder(u,id);}
}
