import { movementTotalCostMinor, projectBalanceMilli, recipeConsumptionMilli, weightedAverageCostMinor } from './inventory-v2.service';

describe('append-only inventory accounting',()=>{
  it('projects balance only from movements',()=>expect(projectBalanceMilli([{quantityMilli:5000},{quantityMilli:-1250},{quantityMilli:250}])).toBe(4000));
  it('updates weighted average cost after receiving',()=>expect(weightedAverageCostMinor({currentMilli:10000,currentCostMinor:200,receivedMilli:10000,receivedCostMinor:400})).toBe(300));
  it('snapshots COGS in integer minor units',()=>expect(movementTotalCostMinor(-2500,199)).toBe(498));
  it('scales recipe components by configured batch yield',()=>{
    expect(recipeConsumptionMilli(6000,1,3000)).toBe(-2000);
    expect(recipeConsumptionMilli(6000,3,3000)).toBe(-6000);
  });
  it('rejects a zero recipe yield',()=>expect(()=>recipeConsumptionMilli(1000,1,0)).toThrow('Recipe yield must be greater than zero.'));
});
