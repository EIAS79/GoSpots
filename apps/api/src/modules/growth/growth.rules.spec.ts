import { clipSeconds, computePricingQuote, intervalsOverlap, projectPointsBalance, projectSignedBalance, signedLedgerAmount } from './growth.rules';

describe('growth rules',()=>{
  it('applies deterministic promotion priority, exclusive groups and non-stackable stopping',()=>{
    const quote=computePricingQuote({subtotalMinor:10000,taxMinor:800,tipBps:1000,promotions:[
      {id:'b',name:'small',kind:'FIXED',valueBps:null,amountMinor:500,priority:1,stackable:true,exclusiveGroup:'season',minSubtotalMinor:0},
      {id:'a',name:'vip',kind:'PERCENT',valueBps:1000,amountMinor:null,priority:10,stackable:true,exclusiveGroup:'season',minSubtotalMinor:0},
      {id:'c',name:'flash',kind:'FIXED',valueBps:null,amountMinor:1000,priority:5,stackable:false,exclusiveGroup:null,minSubtotalMinor:0},
      {id:'d',name:'never-after-exclusive',kind:'FIXED',valueBps:null,amountMinor:1000,priority:0,stackable:true,exclusiveGroup:null,minSubtotalMinor:0},
    ]});
    expect(quote.appliedPromotions.map(x=>x.id)).toEqual(['a','c']);
    expect(quote.discountMinor).toBe(2000);
    expect(quote.tipMinor).toBe(800);
    expect(quote.totalMinor).toBe(9600);
  });
  it('never discounts below zero',()=>{expect(computePricingQuote({subtotalMinor:500,promotions:[{id:'x',name:'x',kind:'FIXED',valueBps:null,amountMinor:9999,priority:0,stackable:true,exclusiveGroup:null,minSubtotalMinor:0}]}).totalMinor).toBe(0);});
  it('projects append-only money and points balances',()=>{expect(projectSignedBalance([{amountMinor:1000},{amountMinor:-250}])).toBe(750);expect(projectPointsBalance([{points:50},{points:-20}])).toBe(30);expect(signedLedgerAmount('REDEEM',200,['REDEEM'])).toBe(-200);});
  it('uses half-open interval semantics and clips utilization seconds',()=>{const a=new Date('2026-01-01T10:00:00Z'),b=new Date('2026-01-01T11:00:00Z'),c=new Date('2026-01-01T11:00:00Z'),d=new Date('2026-01-01T12:00:00Z');expect(intervalsOverlap(a,b,c,d)).toBe(false);expect(clipSeconds(a,d,new Date('2026-01-01T10:30:00Z'),new Date('2026-01-01T11:15:00Z'))).toBe(2700);});
});
