import { Prisma } from '@prisma/client';

import { computeDepreciation } from '../services/asset.service';

function makeAsset(overrides: Partial<Parameters<typeof computeDepreciation>[0]> = {}) {
  return {
    purchaseCost: null,
    freightCost: null,
    installationCost: null,
    customsDuties: null,
    otherCapitalizedCosts: null,
    residualValue: null,
    usefulLifeMonths: null,
    depreciationStartDate: null,
    depreciationMethod: null,
    ...overrides,
  };
}

describe('computeDepreciation', () => {
  it('returns zero depreciation when no cost data', () => {
    const result = computeDepreciation(makeAsset());
    expect(result.capitalizedCost).toBe(0);
    expect(result.monthlyDepreciation).toBe(0);
    expect(result.accumulatedDepreciation).toBe(0);
    expect(result.netBookValue).toBe(0);
  });

  it('returns full value as NBV when no useful life set', () => {
    const result = computeDepreciation(makeAsset({
      purchaseCost: new Prisma.Decimal(10000),
    }));
    expect(result.capitalizedCost).toBe(10000);
    expect(result.monthlyDepreciation).toBe(0);
    expect(result.netBookValue).toBe(10000);
  });

  it('sums all cost components into capitalizedCost', () => {
    const result = computeDepreciation(makeAsset({
      purchaseCost: new Prisma.Decimal(1000),
      freightCost: new Prisma.Decimal(200),
      installationCost: new Prisma.Decimal(300),
      customsDuties: new Prisma.Decimal(50),
      otherCapitalizedCosts: new Prisma.Decimal(150),
    }));
    expect(result.capitalizedCost).toBe(1700);
  });

  it('computes straight-line depreciation correctly', () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 12);
    const result = computeDepreciation(makeAsset({
      purchaseCost: new Prisma.Decimal(12000),
      residualValue: new Prisma.Decimal(0),
      usefulLifeMonths: 60,
      depreciationStartDate: startDate,
      depreciationMethod: 'straight_line',
    }));
    expect(result.monthlyDepreciation).toBe(200);
    expect(result.accumulatedDepreciation).toBe(2400);
    expect(result.netBookValue).toBe(9600);
  });

  it('caps accumulated depreciation at useful life', () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 120);
    const result = computeDepreciation(makeAsset({
      purchaseCost: new Prisma.Decimal(6000),
      residualValue: new Prisma.Decimal(600),
      usefulLifeMonths: 60,
      depreciationStartDate: startDate,
      depreciationMethod: 'straight_line',
    }));
    expect(result.accumulatedDepreciation).toBe(5400);
    expect(result.netBookValue).toBe(600);
  });

  it('handles future depreciation start date', () => {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + 6);
    const result = computeDepreciation(makeAsset({
      purchaseCost: new Prisma.Decimal(12000),
      usefulLifeMonths: 60,
      depreciationStartDate: startDate,
      depreciationMethod: 'straight_line',
    }));
    expect(result.accumulatedDepreciation).toBe(0);
    expect(result.netBookValue).toBe(12000);
  });
});
