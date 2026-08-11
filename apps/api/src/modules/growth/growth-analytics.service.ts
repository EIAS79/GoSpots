import { BadRequestException, Injectable } from '@nestjs/common';
import { requireShopId } from '../../common/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtAccessPayload } from '../auth/auth.service';
import { clipSeconds } from './growth.rules';

@Injectable()
export class GrowthAnalyticsService {
  constructor(private readonly prisma:PrismaService){}

  async overview(actor:JwtAccessPayload,from:Date,to:Date){
    const shopId=requireShopId(actor);if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime())||to<=from)throw new BadRequestException('Analytics end must be after start.');
    const [payments,refunds,pricing,tips,resources,sessions,reservations,tickets,movements,punches,customers,loyalty,stored,eventExecutions,eventSchedules]=await Promise.all([
      this.prisma.payment.findMany({where:{shopId,status:'SUCCESS',succeededAt:{gte:from,lt:to}}}),
      this.prisma.refund.findMany({where:{shopId,state:'SUCCEEDED',succeededAt:{gte:from,lt:to}}}),
      this.prisma.pricingSnapshot.findMany({where:{shopId,createdAt:{gte:from,lt:to}}}),
      this.prisma.tipLedgerEntry.findMany({where:{shopId,createdAt:{gte:from,lt:to}}}),
      this.prisma.resource.count({where:{shopId}}),
      this.prisma.operationsSession.findMany({where:{shopId,startedAt:{lt:to},OR:[{finishedAt:null},{finishedAt:{gt:from}}]}}),
      this.prisma.reservation.findMany({where:{shopId,startsAt:{gte:from,lt:to}}}),
      this.prisma.prepTicket.findMany({where:{shopId,openedAt:{gte:from,lt:to}}}),
      this.prisma.stockMovement.findMany({where:{shopId,occurredAt:{gte:from,lt:to},kind:{in:['SALE_CONSUMPTION','SALE_REVERSAL','WASTE']}}}),
      this.prisma.timePunch.findMany({where:{shopId,startedAt:{lt:to},OR:[{endedAt:null},{endedAt:{gt:from}}]}}),
      this.prisma.customerProfile.count({where:{shopId}}),
      this.prisma.loyaltyLedgerEntry.findMany({where:{shopId,createdAt:{gte:from,lt:to}}}),
      this.prisma.storedValueLedgerEntry.findMany({where:{shopId,createdAt:{gte:from,lt:to}}}),
      this.prisma.eventExecution.findMany({where:{shopId,createdAt:{gte:from,lt:to}}}),
      this.prisma.eventPaymentSchedule.findMany({where:{shopId,dueAt:{gte:from,lt:to}}}),
    ]);
    const grossPaymentsMinor=payments.reduce((s,p)=>s+this.decimalToMinor(p.amount),0),refundMinor=refunds.reduce((s,r)=>s+this.decimalToMinor(r.amount),0),netRevenueMinor=grossPaymentsMinor-refundMinor;
    const pricingTotals=pricing.reduce((a,p)=>({subtotalMinor:a.subtotalMinor+p.subtotalMinor,discountMinor:a.discountMinor+p.discountMinor,taxMinor:a.taxMinor+p.taxMinor,tipMinor:a.tipMinor+p.tipMinor,totalMinor:a.totalMinor+p.totalMinor}),{subtotalMinor:0,discountMinor:0,taxMinor:0,tipMinor:0,totalMinor:0});
    const tipLedgerMinor=tips.reduce((s,t)=>s+t.amountMinor,0);const rangeSeconds=(to.getTime()-from.getTime())/1000;const occupiedSeconds=sessions.reduce((s,row)=>s+clipSeconds(row.startedAt,row.finishedAt??to,from,to),0);const utilizationPct=resources>0&&rangeSeconds>0?Math.min(100,(occupiedSeconds/(resources*rangeSeconds))*100):0;
    const reservationByStatus=Object.fromEntries([...new Set(reservations.map(r=>r.status))].map(status=>[status,reservations.filter(r=>r.status===status).length]));const prepDurations=tickets.filter(t=>t.readyAt).map(t=>Math.max(0,Math.floor(((t.readyAt as Date).getTime()-(t.startedAt??t.openedAt).getTime())/1000)));const avgPrepSeconds=prepDurations.length?Math.round(prepDurations.reduce((s,n)=>s+n,0)/prepDurations.length):0;
    const cogsMinor=movements.reduce((s,m)=>s+(m.kind==='SALE_REVERSAL'?-m.totalCostMinor:m.totalCostMinor),0);const laborSeconds=punches.reduce((s,p)=>s+clipSeconds(p.startedAt,p.endedAt??to,from,to),0);const laborCostMinor=punches.reduce((s,p)=>{const seconds=clipSeconds(p.startedAt,p.endedAt??to,from,to);return s+Math.round(seconds*p.hourlyRateMinor/3600);},0);
    const loyaltyNetPoints=loyalty.reduce((s,l)=>s+l.points,0),storedValueNetMinor=stored.reduce((s,l)=>s+l.amountMinor,0),eventPaidMinor=eventSchedules.filter(s=>s.status==='PAID').reduce((sum,s)=>sum+s.amountMinor,0);
    return {from,to,revenue:{grossPaymentsMinor,refundMinor,netRevenueMinor,paymentCount:payments.length,refundCount:refunds.length},pricing:{...pricingTotals,snapshotCount:pricing.length,tipLedgerMinor,tipVarianceMinor:tipLedgerMinor-pricingTotals.tipMinor},resources:{resourceCount:resources,sessionCount:sessions.length,occupiedSeconds,utilizationPct},reservations:{count:reservations.length,byStatus:reservationByStatus},kds:{ticketCount:tickets.length,readyCount:prepDurations.length,avgPrepSeconds},inventory:{cogsMinor},labor:{workedSeconds:laborSeconds,laborHours:laborSeconds/3600,laborCostMinor,revenuePerLaborHour:laborSeconds?netRevenueMinor/(laborSeconds/3600):0},customers:{customerCount:customers,loyaltyNetPoints,storedValueNetMinor},events:{executionCount:eventExecutions.length,completed:eventExecutions.filter(e=>e.status==='COMPLETED').length,canceled:eventExecutions.filter(e=>e.status==='CANCELED').length,scheduledPaymentMinor:eventSchedules.reduce((s,e)=>s+e.amountMinor,0),paidMinor:eventPaidMinor},reconciliation:{netRevenueMinor,pricingTotalMinor:pricingTotals.totalMinor,pricingCoverageCount:pricing.length,revenueVsPricingVarianceMinor:netRevenueMinor-pricingTotals.totalMinor}};
  }
  private decimalToMinor(value:{toString():string}){return Math.round(Number(value.toString())*100);}
}
