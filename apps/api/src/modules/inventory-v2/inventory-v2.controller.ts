import { Body,Controller,Get,Headers,Param,Post,Put,UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateLegacyInventoryMappingDto } from './dto/inventory.dto';
import { Phase7LocationDto,Phase7ProfileDto,Phase7PurchaseOrderDto,Phase7QuickStocktakeDto,Phase7ReceiveDto,Phase7RecipeDto,Phase7ReverseDto,Phase7StockItemDto,Phase7StocktakeCountsDto,Phase7StocktakeStartDto,Phase7SupplierDto,Phase7TransferDto,Phase7TransferReceiveDto,Phase7WasteDto } from './dto/inventory-phase7.dto';
import { InventoryPhase7Service } from './inventory-phase7.service';
import { InventoryV2Service } from './inventory-v2.service';
@ApiTags('inventory-v2') @Controller('inventory-v2') @UseGuards(JwtAuthGuard)
export class InventoryV2Controller{
 constructor(private readonly inventory:InventoryPhase7Service,private readonly legacy:InventoryV2Service){}
 @Get('profile') @RequirePermissions(PERMISSIONS.INVENTORY_READ) profile(@CurrentUser()u:JwtAccessPayload){return this.inventory.profile(u);}
 @Put('profile') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) setProfile(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7ProfileDto){return this.inventory.setProfile(u,d);}
 @Get('dashboard') @RequirePermissions(PERMISSIONS.INVENTORY_READ) dashboard(@CurrentUser()u:JwtAccessPayload){return this.inventory.dashboard(u);}
 @Post('locations') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) location(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7LocationDto){return this.inventory.createLocation(u,d);}
 @Post('items') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) item(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7StockItemDto){return this.inventory.createItem(u,d);}
 @Post('suppliers') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) supplier(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7SupplierDto){return this.inventory.createSupplier(u,d);}
 @Post('recipes') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) recipe(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7RecipeDto){return this.inventory.createRecipe(u,d);}
 @Put('recipes/:id') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) updateRecipe(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:Phase7RecipeDto){return this.inventory.updateRecipe(u,id,d);}
 @Post('legacy-mappings') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) legacyMap(@CurrentUser()u:JwtAccessPayload,@Body()d:CreateLegacyInventoryMappingDto){return this.legacy.createLegacyMapping(u,d);}
 @Post('waste') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) waste(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7WasteDto){return this.inventory.waste(u,d,false);}
 @Post('waste-with-approval') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) wasteApproved(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7WasteDto){return this.inventory.waste(u,d,true);}
 @Post('purchase-orders') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) po(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7PurchaseOrderDto){return this.inventory.createPurchaseOrder(u,d);}
 @Post('purchase-orders/:id/approve') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) approvePo(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.approvePo(u,id);}
 @Post('purchase-orders/:id/send') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) sendPo(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.sendPo(u,id);}
 @Post('purchase-orders/:id/cancel') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) cancelPo(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.cancelPo(u,id);}
 @Post('receipts') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) receive(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7ReceiveDto,@Headers('idempotency-key')key?:string){return this.inventory.receive(u,d,undefined,key);}
 @Post('purchase-orders/:id/receive') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) receivePo(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:Phase7ReceiveDto,@Headers('idempotency-key')key?:string){return this.inventory.receive(u,d,id,key);}
 @Post('stocktakes/start') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) startStocktake(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7StocktakeStartDto){return this.inventory.startStocktake(u,d);}
 @Put('stocktakes/:id/counts') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) countStocktake(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:Phase7StocktakeCountsDto){return this.inventory.countStocktake(u,id,d);}
 @Post('stocktakes/:id/submit') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) submitStocktake(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.submitStocktake(u,id);}
 @Post('stocktakes/:id/approve') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) approveStocktake(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.approveStocktake(u,id);}
 @Post('stocktakes') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) quickStocktake(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7QuickStocktakeDto){return this.inventory.quickStocktake(u,d);}
 @Post('transfers') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) transfer(@CurrentUser()u:JwtAccessPayload,@Body()d:Phase7TransferDto){return this.inventory.transfer(u,d);}
 @Post('transfers/:id/receive') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) receiveTransfer(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:Phase7TransferReceiveDto,@Headers('idempotency-key')key?:string){return this.inventory.receiveTransfer(u,id,d,key);}
 @Post('orders/:id/complete') @RequirePermissions(PERMISSIONS.INVENTORY_WRITE) complete(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.completeOrder(u,id,false);}
 @Post('orders/:id/complete-with-approval') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) completeApproved(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.inventory.completeOrder(u,id,true);}
 @Post('orders/:id/reverse') @RequirePermissions(PERMISSIONS.INVENTORY_CORRECTION) reverse(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:Phase7ReverseDto){return this.inventory.reverseOrder(u,id,d);}
 @Get('reports/cogs') @RequirePermissions(PERMISSIONS.INVENTORY_READ) cogs(@CurrentUser()u:JwtAccessPayload){return this.inventory.cogs(u);}
 @Get('reports/costing') @RequirePermissions(PERMISSIONS.INVENTORY_READ) costing(@CurrentUser()u:JwtAccessPayload){return this.inventory.costing(u);}
}
