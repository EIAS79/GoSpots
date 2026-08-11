import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { intervalsOverlap, projectSignedBalance, signedLedgerAmount } from './growth.rules';
import type { AttachReservationPolicyDto, CreateReservationPolicyDto, CreateWaitlistDto, OfferWaitlistDto, RecordDepositDto, ReservationOutcomeDto } from './growth.types';

@Injectable()
export class ReservationGrowthService {
  constructor(private readonly prisma:PrismaService, private readonly audit:AuditService) {}

  listPolicies(actor:JwtAccessPayload){return this.prisma.reservationPolicy.findMany({where:{shopId:requireShopId(actor)},orderBy:[{active:'desc'},{name:'asc'}]});}

  async createPolicy(actor:JwtAccessPayload,dto:CreateReservationPolicyDto){
    const shopId=requireShopId(actor);
    const kind=dto.depositKind??'NONE';
    if(kind==='FIXED'&&(!Number.isInteger(dto.depositFixedMinor)||Number(dto.depositFixedMinor)<0))throw new BadRequestException('Fixed deposit requires a non-negative depositFixedMinor.');
    if(kind==='PERCENT'&&(!Number.isInteger(dto.depositPercentBps)||Number(dto.depositPercentBps)<0||Number(dto.depositPercentBps)>10000))throw new BadRequestException('Percent deposit requires depositPercentBps from 0 to 10000.');
    const late=this.percent(dto.lateCancelForfeitPercent??0),noShow=this.percent(dto.noShowForfeitPercent??100);
    const row=await this.prisma.reservationPolicy.create({data:{shopId,name:dto.name,depositKind:kind,depositFixedMinor:dto.depositFixedMinor,depositPercentBps:dto.depositPercentBps,cancellationWindowMinutes:Math.max(0,dto.cancellationWindowMinutes??0),lateCancelForfeitPercent:late,noShowForfeitPercent:noShow}});
    await this.record(actor,'reservation.policy.create','Created reservation deposit/cancellation policy',{policyId:row.id,name:row.name}); return row;
  }

  async attachPolicy(actor:JwtAccessPayload,reservationId:string,dto:AttachReservationPolicyDto){
    const shopId=requireShopId(actor),reservation=await this.requireReservation(shopId,reservationId),policy=await this.prisma.reservationPolicy.findFirst({where:{id:dto.policyId,shopId,active:true}});
    if(!policy)throw new NotFoundException('Reservation policy not found.');
    const snapshot={name:policy.name,depositKind:policy.depositKind,depositFixedMinor:policy.depositFixedMinor,depositPercentBps:policy.depositPercentBps,cancellationWindowMinutes:policy.cancellationWindowMinutes,lateCancelForfeitPercent:policy.lateCancelForfeitPercent,noShowForfeitPercent:policy.noShowForfeitPercent};
    const row=await this.prisma.reservationExtension.upsert({where:{reservationId},create:{shopId,reservationId,policyId:policy.id,policySnapshot:snapshot as Prisma.InputJsonValue},update:{policyId:policy.id,policySnapshot:snapshot as Prisma.InputJsonValue}});
    await this.record(actor,'reservation.policy.attach','Attached policy snapshot to reservation',{reservationId:reservation.id,policyId:policy.id}); return {...row,depositRequiredMinor:this.requiredDepositMinor(reservation,policy)};
  }

  async recordDeposit(actor:JwtAccessPayload,reservationId:string,dto:RecordDepositDto){
    const shopId=requireShopId(actor); await this.requireReservation(shopId,reservationId);
    const shop=await this.prisma.shop.findUnique({where:{id:shopId},select:{currency:true}}); const currency=(dto.currency??shop?.currency??'EUR').toUpperCase();
    const signed=signedLedgerAmount(dto.type,dto.amountMinor,['REFUND','FORFEIT']);
    const row=await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation-deposit:${shopId}:${reservationId}`}))`;
      const existing=await tx.reservationDepositLedgerEntry.findUnique({where:{shopId_correlationId:{shopId,correlationId:dto.correlationId}}}); if(existing)return existing;
      if(dto.type==='CAPTURE'){
        if(!dto.paymentId)throw new BadRequestException('CAPTURE requires paymentId from the existing checkout/payment domain.');
        const payment=await tx.payment.findFirst({where:{id:dto.paymentId,shopId,status:'SUCCESS'}}); if(!payment)throw new ConflictException('Successful payment evidence was not found for this deposit capture.');
      }
      if(dto.type==='REFUND'){
        if(!dto.refundId)throw new BadRequestException('REFUND requires refundId from the existing refund domain.');
        const refund=await tx.refund.findFirst({where:{id:dto.refundId,shopId,state:'SUCCEEDED'}}); if(!refund)throw new ConflictException('Successful refund evidence was not found.');
      }
      const prior=await tx.reservationDepositLedgerEntry.findMany({where:{shopId,reservationId},select:{amountMinor:true}}); const balance=projectSignedBalance(prior);
      if(signed<0&&balance+signed<0)throw new ConflictException('Deposit refund/forfeit cannot exceed captured deposit balance.');
      return tx.reservationDepositLedgerEntry.create({data:{shopId,reservationId,type:dto.type,amountMinor:signed,currency,paymentId:dto.paymentId,refundId:dto.refundId,correlationId:dto.correlationId,note:dto.note,actorUserId:actor.sub}});
    });
    await this.record(actor,'reservation.deposit.record','Recorded append-only reservation deposit movement',{reservationId,entryId:row.id,type:row.type,amountMinor:row.amountMinor}); return {entry:row,summary:await this.depositSummary(actor,reservationId)};
  }

  async depositSummary(actor:JwtAccessPayload,reservationId:string){const shopId=requireShopId(actor);await this.requireReservation(shopId,reservationId);const rows=await this.prisma.reservationDepositLedgerEntry.findMany({where:{shopId,reservationId},orderBy:{createdAt:'asc'}});return {reservationId,balanceMinor:projectSignedBalance(rows),capturedMinor:rows.filter(r=>r.type==='CAPTURE').reduce((s,r)=>s+r.amountMinor,0),refundedMinor:-rows.filter(r=>r.type==='REFUND').reduce((s,r)=>s+r.amountMinor,0),forfeitedMinor:-rows.filter(r=>r.type==='FORFEIT').reduce((s,r)=>s+r.amountMinor,0),entries:rows};}

  async closeReservation(actor:JwtAccessPayload,id:string,dto:ReservationOutcomeDto){
    const shopId=requireShopId(actor),reservation=await this.requireReservation(shopId,id); if(reservation.status===dto.outcome)return {reservation,deposit:await this.depositSummary(actor,id)};
    const extension=await this.prisma.reservationExtension.findFirst({where:{shopId,reservationId:id}}); const policy=extension?.policyId?await this.prisma.reservationPolicy.findFirst({where:{id:extension.policyId,shopId}}):null;
    const summary=await this.depositSummary(actor,id); const late=policy?reservation.startsAt.getTime()-Date.now()<=policy.cancellationWindowMinutes*60000:false; const percent=dto.outcome==='NO_SHOW'?(policy?.noShowForfeitPercent??0):(late?(policy?.lateCancelForfeitPercent??0):0); const forfeit=Math.min(summary.balanceMinor,Math.round(summary.balanceMinor*percent/100));
    if(forfeit>0)await this.recordDeposit(actor,id,{type:'FORFEIT',amountMinor:forfeit,currency:summary.entries[0]?.currency,correlationId:`reservation-outcome:${id}:${dto.outcome}`,note:dto.reason??`${dto.outcome} policy forfeit`});
    const updated=await this.prisma.reservation.update({where:{id},data:{status:dto.outcome}}); const after=await this.depositSummary(actor,id);
    await this.record(actor,'reservation.outcome','Applied cancellation/no-show policy',{reservationId:id,outcome:dto.outcome,late,forfeitMinor:forfeit,refundDueMinor:after.balanceMinor}); return {reservation:updated,deposit:after,refundDueMinor:after.balanceMinor};
  }

  async createWaitlist(actor:JwtAccessPayload,dto:CreateWaitlistDto){const shopId=requireShopId(actor),start=new Date(dto.desiredStartsAt),end=new Date(dto.desiredEndsAt);this.assertInterval(start,end);if(dto.resourceId)await this.requireResource(shopId,dto.resourceId);const row=await this.prisma.reservationWaitlistEntry.create({data:{shopId,resourceId:dto.resourceId,guestName:dto.guestName,guestEmail:dto.guestEmail,guestPhone:dto.guestPhone,partySize:Math.max(1,dto.partySize??1),desiredStartsAt:start,desiredEndsAt:end,priority:dto.priority??0,note:dto.note}});await this.record(actor,'reservation.waitlist.create','Added guest to waitlist',{waitlistEntryId:row.id,resourceId:row.resourceId});return row;}
  listWaitlist(actor:JwtAccessPayload){return this.prisma.reservationWaitlistEntry.findMany({where:{shopId:requireShopId(actor),status:{in:['WAITING','OFFERED']}},orderBy:[{priority:'desc'},{createdAt:'asc'}]});}
  async offerWaitlist(actor:JwtAccessPayload,id:string,dto:OfferWaitlistDto){const shopId=requireShopId(actor),row=await this.prisma.reservationWaitlistEntry.findFirst({where:{id,shopId,status:'WAITING'}});if(!row)throw new NotFoundException('Waiting entry not found.');const now=new Date();const updated=await this.prisma.reservationWaitlistEntry.update({where:{id},data:{status:'OFFERED',offeredAt:now,offerExpiresAt:new Date(now.getTime()+Math.max(1,dto.offerMinutes??15)*60000)}});await this.record(actor,'reservation.waitlist.offer','Offered waitlist slot',{waitlistEntryId:id,expiresAt:updated.offerExpiresAt});return updated;}

  async convertWaitlist(actor:JwtAccessPayload,id:string){
    const shopId=requireShopId(actor);const result=await this.prisma.$transaction(async tx=>{
      const row=await tx.reservationWaitlistEntry.findFirst({where:{id,shopId,status:{in:['WAITING','OFFERED']}}});if(!row)throw new NotFoundException('Active waitlist entry not found.');if(!row.resourceId)throw new ConflictException('Assign a resource before converting this waitlist entry.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation-resource:${shopId}:${row.resourceId}`}))`;
      const overlaps=await tx.reservation.findMany({where:{shopId,resourceId:row.resourceId,startsAt:{lt:row.desiredEndsAt},endsAt:{gt:row.desiredStartsAt}}});if(overlaps.some(r=>!['CANCELED','NO_SHOW'].includes(r.status)))throw new ConflictException('Resource is no longer available for the waitlist interval.');
      const reservation=await tx.reservation.create({data:{shopId,resourceId:row.resourceId,guestName:row.guestName,guestEmail:row.guestEmail,guestPhone:row.guestPhone,partySize:row.partySize,startsAt:row.desiredStartsAt,endsAt:row.desiredEndsAt,notes:row.note}});await tx.reservationWaitlistEntry.update({where:{id},data:{status:'CONVERTED',reservationId:reservation.id}});return reservation;
    });await this.record(actor,'reservation.waitlist.convert','Converted waitlist entry into reservation',{waitlistEntryId:id,reservationId:result.id});return result;
  }

  async convertReservation(actor:JwtAccessPayload,reservationId:string){
    const shopId=requireShopId(actor);const result=await this.prisma.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reservation-session:${shopId}:${reservationId}`}))`;
      const reservation=await tx.reservation.findFirst({where:{id:reservationId,shopId}});if(!reservation)throw new NotFoundException('Reservation not found.');if(!reservation.resourceId)throw new ConflictException('Reservation needs a resource before session conversion.');
      const ext=await tx.reservationExtension.findFirst({where:{shopId,reservationId}});if(ext?.convertedSessionId){const existing=await tx.operationsSession.findFirst({where:{id:ext.convertedSessionId,shopId}});if(existing)return existing;}
      const active=await tx.operationsSession.findFirst({where:{shopId,resourceId:reservation.resourceId,status:{in:['ACTIVE','PAUSED']}}});if(active)throw new ConflictException('Resource already has an active operations session.');
      const resource=await tx.resource.findFirst({where:{id:reservation.resourceId,shopId}});if(!resource)throw new NotFoundException('Reservation resource not found.');
      const rates=await tx.operationsRatePlan.findMany({where:{shopId,active:true},orderBy:{createdAt:'desc'}});const rate=rates.find(r=>r.resourceId===resource.id)??rates.find(r=>!r.resourceId&&r.resourceCategoryId===resource.categoryId)??rates.find(r=>!r.resourceId&&!r.resourceCategoryId);if(!rate)throw new ConflictException('No active operations rate plan applies to this resource.');
      const shop=await tx.shop.findUnique({where:{id:shopId},select:{currency:true}});const snapshot={ratePlanId:rate.id,name:rate.name,hourlyRateMinor:rate.hourlyRateMinor,overtimeRateMinor:rate.overtimeRateMinor,overtimeAfterMinutes:rate.overtimeAfterMinutes,roundingMinutes:rate.roundingMinutes,minimumMinutes:rate.minimumMinutes,capMinor:rate.capMinor};
      const session=await tx.operationsSession.create({data:{shopId,resourceId:resource.id,reservationId,ratePlanId:rate.id,hourlyRateMinor:rate.hourlyRateMinor,overtimeRateMinor:rate.overtimeRateMinor,overtimeAfterMinutes:rate.overtimeAfterMinutes,roundingMinutes:rate.roundingMinutes,minimumMinutes:rate.minimumMinutes,capMinor:rate.capMinor,rateSnapshot:snapshot as Prisma.InputJsonValue,currency:shop?.currency??'EUR',createdById:actor.sub}});
      await tx.reservationExtension.upsert({where:{reservationId},create:{shopId,reservationId,convertedSessionId:session.id},update:{convertedSessionId:session.id}});return session;
    });await this.record(actor,'reservation.session.convert','Converted reservation into Operations 2.0 session',{reservationId,sessionId:result.id});return result;
  }

  async timeline(actor:JwtAccessPayload,from:Date,to:Date){const shopId=requireShopId(actor);this.assertInterval(from,to);const [reservations,waitlist,sessions,holds]=await Promise.all([this.prisma.reservation.findMany({where:{shopId,startsAt:{lt:to},endsAt:{gt:from}},include:{resource:true},orderBy:{startsAt:'asc'}}),this.prisma.reservationWaitlistEntry.findMany({where:{shopId,desiredStartsAt:{lt:to},desiredEndsAt:{gt:from}},orderBy:{desiredStartsAt:'asc'}}),this.prisma.operationsSession.findMany({where:{shopId,startedAt:{lt:to},OR:[{finishedAt:null},{finishedAt:{gt:from}}]},orderBy:{startedAt:'asc'}}),this.prisma.eventResourceHold.findMany({where:{shopId,startsAt:{lt:to},endsAt:{gt:from},status:{in:['HOLD','CONFIRMED']}},orderBy:{startsAt:'asc'}})]);return {from,to,reservations,waitlist,sessions,eventHolds:holds};}

  private percent(value:number){if(!Number.isInteger(value)||value<0||value>100)throw new BadRequestException('Percent must be an integer from 0 to 100.');return value;}
  private requiredDepositMinor(reservation:{billingBaseAmount:Prisma.Decimal|null;billedAmount:Prisma.Decimal|null},policy:{depositKind:string;depositFixedMinor:number|null;depositPercentBps:number|null}){if(policy.depositKind==='FIXED')return policy.depositFixedMinor??0;if(policy.depositKind==='PERCENT'){const major=reservation.billingBaseAmount??reservation.billedAmount;const base=major?Math.round(Number(major.toString())*100):0;return Math.round(base*(policy.depositPercentBps??0)/10000);}return 0;}
  private assertInterval(start:Date,end:Date){if(Number.isNaN(start.getTime())||Number.isNaN(end.getTime())||end<=start)throw new BadRequestException('End must be after start.');}
  private async requireReservation(shopId:string,id:string){const row=await this.prisma.reservation.findFirst({where:{id,shopId}});if(!row)throw new NotFoundException('Reservation not found.');return row;}
  private async requireResource(shopId:string,id:string){const row=await this.prisma.resource.findFirst({where:{id,shopId}});if(!row)throw new NotFoundException('Resource not found.');return row;}
  private record(actor:JwtAccessPayload,action:string,summary:string,meta:Record<string,unknown>){return this.audit.record(actor,{section:'reservation',action,summary,meta});}
}
