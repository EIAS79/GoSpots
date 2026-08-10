import { Body, Controller, Get, MessageEvent, Param, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { interval, map, startWith, switchMap } from 'rxjs';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePrepRouteDto, CreatePrepStationDto, PrepStatusDto } from './dto/kitchen.dto';
import { KitchenService } from './kitchen.service';
@ApiTags('kitchen') @Controller('kitchen') @UseGuards(JwtAuthGuard)
export class KitchenController { constructor(private readonly kitchen:KitchenService){}
@Get('stations') @RequirePermissions(PERMISSIONS.MENU_READ) stations(@CurrentUser()u:JwtAccessPayload){return this.kitchen.listStations(u);}
@Post('stations') @RequirePermissions(PERMISSIONS.MENU_WRITE) createStation(@CurrentUser()u:JwtAccessPayload,@Body()d:CreatePrepStationDto){return this.kitchen.createStation(u,d);}
@Post('routes') @RequirePermissions(PERMISSIONS.MENU_WRITE) createRoute(@CurrentUser()u:JwtAccessPayload,@Body()d:CreatePrepRouteDto){return this.kitchen.createRoute(u,d);}
@Post('orders/:id/submit') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) submit(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string){return this.kitchen.submitOrder(u,id);}
@Get('board') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) board(@CurrentUser()u:JwtAccessPayload,@Query('stationId')stationId?:string){return this.kitchen.board(u,stationId);}
@Sse('stream') @RequirePermissions(PERMISSIONS.TRANSACTION_READ) stream(@CurrentUser()u:JwtAccessPayload,@Query('stationId')stationId?:string){return interval(2000).pipe(startWith(0),switchMap(()=>this.kitchen.board(u,stationId)),map(data=>({data} as MessageEvent)));}
@Post('lines/:id/status') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) lineStatus(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:PrepStatusDto){return this.kitchen.setLineStatus(u,id,d);}
@Post('tickets/:id/status') @RequirePermissions(PERMISSIONS.TRANSACTION_WRITE) ticketStatus(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:PrepStatusDto){return this.kitchen.setTicketStatus(u,id,d);}
}
