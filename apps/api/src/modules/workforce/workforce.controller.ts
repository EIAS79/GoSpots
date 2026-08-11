import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PERMISSIONS } from '../../common/permissions';
import type { JwtAccessPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClockInDto, CreateEmployeeRateDto, CreateJobRoleDto, CreateScheduleEntryDto, CreateTimeAdjustmentDto, DecideTimeAdjustmentDto, StartBreakDto } from './dto/workforce.dto';
import { WorkforceService } from './workforce.service';
@ApiTags('workforce') @Controller('workforce') @UseGuards(JwtAuthGuard)
export class WorkforceController { constructor(private readonly workforce:WorkforceService){}
@Get('roster') @RequirePermissions(PERMISSIONS.STAFF_READ) roster(@CurrentUser()u:JwtAccessPayload){return this.workforce.roster(u);}
@Post('job-roles') @RequirePermissions(PERMISSIONS.STAFF_WRITE) role(@CurrentUser()u:JwtAccessPayload,@Body()d:CreateJobRoleDto){return this.workforce.createJobRole(u,d);}
@Post('rates') @RequirePermissions(PERMISSIONS.STAFF_WRITE) rate(@CurrentUser()u:JwtAccessPayload,@Body()d:CreateEmployeeRateDto){return this.workforce.createRate(u,d);}
@Post('schedule') @RequirePermissions(PERMISSIONS.STAFF_WRITE) schedule(@CurrentUser()u:JwtAccessPayload,@Body()d:CreateScheduleEntryDto){return this.workforce.createSchedule(u,d);}
@Get('my-shift') @RequirePermissions(PERMISSIONS.STAFF_READ) myShift(@CurrentUser()u:JwtAccessPayload){return this.workforce.myShift(u);}
@Post('clock-in') @RequirePermissions(PERMISSIONS.STAFF_READ) clockIn(@CurrentUser()u:JwtAccessPayload,@Body()d:ClockInDto){return this.workforce.clockIn(u,d);}
@Post('break/start') @RequirePermissions(PERMISSIONS.STAFF_READ) startBreak(@CurrentUser()u:JwtAccessPayload,@Body()d:StartBreakDto){return this.workforce.startBreak(u,d);}
@Post('break/end') @RequirePermissions(PERMISSIONS.STAFF_READ) endBreak(@CurrentUser()u:JwtAccessPayload){return this.workforce.endBreak(u);}
@Post('clock-out') @RequirePermissions(PERMISSIONS.STAFF_READ) clockOut(@CurrentUser()u:JwtAccessPayload){return this.workforce.clockOut(u);}
@Post('adjustments') @RequirePermissions(PERMISSIONS.STAFF_READ) adjustment(@CurrentUser()u:JwtAccessPayload,@Body()d:CreateTimeAdjustmentDto){return this.workforce.requestAdjustment(u,d);}
@Get('adjustments/pending') @RequirePermissions(PERMISSIONS.STAFF_WRITE) pending(@CurrentUser()u:JwtAccessPayload){return this.workforce.pendingAdjustments(u);}
@Post('adjustments/:id/decision') @RequirePermissions(PERMISSIONS.STAFF_WRITE) decide(@CurrentUser()u:JwtAccessPayload,@Param('id')id:string,@Body()d:DecideTimeAdjustmentDto){return this.workforce.decideAdjustment(u,id,d);}
@Get('time-records') @RequirePermissions(PERMISSIONS.STAFF_READ) records(@CurrentUser()u:JwtAccessPayload,@Query('from')from?:string,@Query('to')to?:string){return this.workforce.timeRecords(u,from?new Date(from):undefined,to?new Date(to):undefined);}
@Get('reports/scheduled-worked') @RequirePermissions(PERMISSIONS.STAFF_READ) report(@CurrentUser()u:JwtAccessPayload,@Query('from')from:string,@Query('to')to:string){return this.workforce.report(u,new Date(from),new Date(to));}
@Get('reports/labor') @RequirePermissions(PERMISSIONS.STAFF_READ,PERMISSIONS.TRANSACTION_READ) labor(@CurrentUser()u:JwtAccessPayload,@Query('days')days?:string){return this.workforce.laborAnalytics(u,Number(days??30));}
}
