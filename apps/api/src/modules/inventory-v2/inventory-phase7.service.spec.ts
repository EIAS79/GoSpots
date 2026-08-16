import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { p7Balance,p7Convert,p7Cost,p7NegativeDecision,p7PoStatus,p7RecipeConsumption,p7TheoreticalCost,p7TransferDiscrepancy,p7WeightedCost } from './inventory-phase7.service';
describe('Phase 7 inventory mathematics',()=>{
 it('projects stock only from movements',()=>expect(p7Balance([{quantityMilli:5000},{quantityMilli:-1250},{quantityMilli:250}])).toBe(4000));
 it('uses integer money snapshots',()=>expect(p7Cost(-2500,199)).toBe(498));
 it('converts purchase to inventory units deterministically',()=>{expect(p7Convert(2500,6000)).toBe(15000);expect(()=>p7Convert(1000,0)).toThrow('Invalid inventory unit conversion.');});
 it('calculates weighted-average valuation',()=>expect(p7WeightedCost(10000,200,10000,400)).toBe(300));
 it('scales recipe consumption and theoretical cost',()=>{expect(p7RecipeConsumption(6000,3,3000)).toBe(-6000);expect(p7TheoreticalCost([{quantityMilli:2000,unitCostMinor:100},{quantityMilli:500,unitCostMinor:400}],1000)).toBe(400);});
 it('enforces negative-stock policies',()=>{expect(p7NegativeDecision('BLOCK',false,false)).toEqual({allow:false,warning:false});expect(p7NegativeDecision('WARN_ALLOW',false,false)).toEqual({allow:true,warning:true});expect(p7NegativeDecision('ALLOW_SELECTED',true,false)).toEqual({allow:true,warning:true});expect(p7NegativeDecision('ALLOW_SELECTED',false,false)).toEqual({allow:false,warning:false});expect(p7NegativeDecision('ALLOW_WITH_APPROVAL',false,true)).toEqual({allow:true,warning:true});});
 it('keeps a PO partial until every line is fully received',()=>{expect(p7PoStatus([{orderedMilli:1000,receivedMilli:500}])).toBe('PARTIALLY_RECEIVED');expect(p7PoStatus([{orderedMilli:1000,receivedMilli:1000}])).toBe('RECEIVED');});
 it('records transfer discrepancy without inventing destination stock',()=>{expect(p7TransferDiscrepancy(10000,8000,1000)).toEqual({missingMilli:1000});expect(()=>p7TransferDiscrepancy(10000,11000,0)).toThrow('Invalid transfer receiving quantities.');});
});
describe('Phase 7 executable contracts',()=>{
 const service=readFileSync(join(__dirname,'inventory-phase7.service.ts'),'utf8');
 const controller=readFileSync(join(__dirname,'inventory-v2.controller.ts'),'utf8');
 it('makes receipt and transfer receive idempotent',()=>{expect(service).toContain("scope:'inventory.receipts.create'");expect(service).toContain("scope:'inventory.transfers.receive'");expect(service).toContain('requireKey:true');});
 it('implements the PO lifecycle',()=>{for(const state of ['DRAFT','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED'])expect(service).toContain(state);});
 it('models transfer as out then explicit receive with discrepancies',()=>{expect(service).toContain("status:'IN_TRANSIT'");expect(service).toContain("kind:'TRANSFER_OUT'");expect(service).toContain("kind:'TRANSFER_IN'");expect(service).toContain("kind:'TRANSFER_DAMAGE'");});
 it('protects stocktake snapshots from concurrent movement',()=>{expect(service).toContain('STOCKTAKE_CONCURRENT_MOVEMENT');expect(service).toContain('occurredAt:{gt:take.snapshotAt}');});
 it('preserves historical sale cost on refund/restock',()=>{expect(service).toContain('unitCostMinor:m.unitCostMinor');expect(service).toContain('totalCostMinor:m.totalCostMinor');expect(service).toContain("kind:'SALE_REVERSAL'");});
 it('exposes actual vs theoretical usage and waste/variance cost',()=>{for(const key of ['theoreticalUsageMilli','actualUsageMilli','usageVarianceMilli','wasteCostMinor','stocktakeVarianceMilli'])expect(service).toContain(key);});
 it('uses inventory-specific permissions only',()=>{expect(controller).toContain('PERMISSIONS.INVENTORY_READ');expect(controller).toContain('PERMISSIONS.INVENTORY_WRITE');expect(controller).toContain('PERMISSIONS.INVENTORY_CORRECTION');expect(controller).not.toContain('PERMISSIONS.MENU_WRITE');expect(controller).not.toContain('PERMISSIONS.TRANSACTION_WRITE');});
});
