import { describe, it, expect } from 'vitest';
import { estimateConfiguredStateTax, estimateTax, fullRetirementAge, runProjection, spouseSsAt, ssInterpolate, taxInflFactor } from '../financial';
import { buildHistoricalScenarioPath, buildScenarioPath, runMonteCarlo } from '../monteCarlo';
import type { InputParams } from '../types';

const BASE: InputParams = {
  age: 55,
  retireAge: 62,
  lifeExp: 85,
  filingStatus: 'married',
  spouseAge: undefined,
  spouseLifeExp: undefined,
  spouseSsType: 'own',
  spouseSs: undefined,
  spouseSs62: undefined,
  spouseSs67: undefined,
  spouseSs70: undefined,
  spouseSsAge: 67,
  tradBal: 500000,
  rothBal: 100000,
  taxableBal: 200000,
  taxableBasis: undefined,
  hsaBal: 20000,
  tradContrib: 2000,
  rothContrib: 500,
  taxableContrib: 500,
  hsaContrib: 300,
  employerMatch: 0.04,
  matchLimit: 6,
  ss: 2500,
  ssAge: 67,
  ss62: 0,
  ss67: 0,
  ss70: 0,
  expenses: 7000,
  healthcareExpenses: 800,
  ltcExpenses: 0,
  discretionaryExpenses: 500,
  expenseInflationRate: 0.03,
  healthcareInflationRate: 0.055,
  rothConv: 20000,
  convStart: 62,
  convUntil: 72,
  targetConvBracket: 1,
  qcdAnnual: 0,
  qcdStartAge: 70,
  useJointLifeRmd: false,
  r: 0.07,
  taxableReturn: 0.07,
  taxableOrdinaryYield: 0,
  taxableQualifiedDividendYield: 0.015,
  taxableRealizedGainYield: 0,
  hsaReturn: 0.07,
  inf: 0.03,
  stateTaxRate: 0,
  stateTaxBrackets: undefined,
  includeIRMAA: true,
  includeMedicarePremiums: false,
  includeAcaPremiumCredits: false,
  acaMonthlyPremium: 0,
  acaMonthlyCredit: 0,
  includeStateTax: false,
  ssCOLA: 0.025,
};

describe('runProjection', () => {
  it('calculates Social Security full retirement age by birth year', () => {
    expect(fullRetirementAge(1954)).toBe(66);
    expect(fullRetirementAge(1956)).toBeCloseTo(66 + 4 / 12, 5);
    expect(fullRetirementAge(1959)).toBeCloseTo(66 + 10 / 12, 5);
    expect(fullRetirementAge(1960)).toBe(67);
  });

  it('uses birth-year FRA to shape Social Security interpolation', () => {
    const fra67 = ssInterpolate(1400, 2000, 2480, 66, 67);
    const fra66And4 = ssInterpolate(1400, 2000, 2480, 66, 66 + 4 / 12);
    expect(fra66And4).not.toBe(fra67);
  });

  it('returns one row per year from current age to life expectancy', () => {
    const rows = runProjection(BASE, BASE.r);
    expect(rows.length).toBe(BASE.lifeExp - BASE.age + 1);
    expect(rows[0].age).toBe(BASE.age);
    expect(rows[rows.length - 1].age).toBe(BASE.lifeExp);
  });

  it('applies scenario-path returns year by year', () => {
    const params = {
      ...BASE,
      age: 55,
      retireAge: 58,
      lifeExp: 57,
      tradBal: 100000,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      tradContrib: 0,
      rothContrib: 0,
      taxableContrib: 0,
      hsaContrib: 0,
      employerMatch: 0,
      ss: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
    };

    const rows = runProjection(params, {
      returnRate: 0,
      scenarioPath: [
        { age: 56, portfolioReturn: 0.10, taxableReturn: 0, hsaReturn: 0 },
        { age: 57, portfolioReturn: -0.10, taxableReturn: 0, hsaReturn: 0 },
      ],
    });

    expect(rows.find(r => r.age === 56)?.trad).toBe(110000);
    expect(rows.find(r => r.age === 57)?.trad).toBe(99000);
  });

  it('uses basic return defaults for advanced accounts without per-account growth rates', () => {
    const params: InputParams = {
      ...BASE,
      age: 55,
      retireAge: 58,
      lifeExp: 56,
      tradBal: 999999,
      rothBal: 999999,
      taxableBal: 999999,
      hsaBal: 999999,
      tradContrib: 0,
      rothContrib: 0,
      taxableContrib: 0,
      hsaContrib: 0,
      employerMatch: 0,
      salary: 0,
      ss: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      r: 0.05,
      taxableReturn: 0.02,
      taxableQualifiedDividendYield: 0,
      hsaReturn: 0.01,
      accounts: [
        { id: 'trad', name: 'Traditional', type: 'traditional', balance: 100000 },
        { id: 'roth', name: 'Roth', type: 'roth', balance: 100000 },
        { id: 'taxable', name: 'Taxable', type: 'taxable', balance: 100000 },
        { id: 'hsa', name: 'HSA', type: 'hsa', balance: 100000 },
      ],
    };

    const row = runProjection(params, params.r).find(r => r.age === 56)!;

    expect(row.trad).toBe(105000);
    expect(row.roth).toBe(105000);
    expect(row.taxable).toBe(102000);
    expect(row.hsa).toBe(101000);
  });

  it('compounds advanced accounts with their own growth rates', () => {
    const params: InputParams = {
      ...BASE,
      age: 55,
      retireAge: 58,
      lifeExp: 57,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      tradContrib: 0,
      rothContrib: 0,
      taxableContrib: 0,
      hsaContrib: 0,
      employerMatch: 0,
      salary: 0,
      ss: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      r: 0.05,
      accounts: [
        { id: 'trad-flat', name: 'Traditional flat', type: 'traditional', balance: 100000, growthRate: 0 },
        { id: 'trad-growth', name: 'Traditional growth', type: 'traditional', balance: 100000, growthRate: 0.10 },
        { id: 'roth-growth', name: 'Roth growth', type: 'roth', balance: 100000, growthRate: 0.08 },
      ],
    };

    const rows = runProjection(params, params.r);

    expect(rows.find(r => r.age === 56)?.trad).toBe(210000);
    expect(rows.find(r => r.age === 57)?.trad).toBe(221000);
    expect(rows.find(r => r.age === 56)?.roth).toBe(108000);
    expect(rows.find(r => r.age === 57)?.roth).toBe(116640);
  });

  it('builds Monte Carlo paths with separate annual return draws', () => {
    const path = buildScenarioPath(BASE, { seed: 'path-test' });

    expect(path.length).toBe(BASE.lifeExp - BASE.age);
    expect(new Set(path.map(y => y.portfolioReturn)).size).toBeGreaterThan(1);
  });

  it('returns reproducible Monte Carlo results for the same seed', () => {
    const first = runMonteCarlo(BASE, null, { runs: 25, seed: 'repeatable' });
    const second = runMonteCarlo(BASE, null, { runs: 25, seed: 'repeatable' });

    expect(second.finalSuccessRate).toBe(first.finalSuccessRate);
    expect(second.percentiles.p50).toEqual(first.percentiles.p50);
  });

  it('builds historical bootstrap paths from sampled historical years', () => {
    const path = buildHistoricalScenarioPath(BASE, {
      seed: 'historical-path',
      stockAllocation: 0.60,
      bondAllocation: 0.35,
      cashAllocation: 0.05,
      blockSize: 5,
      spendingShockProbability: 0,
    });

    expect(path.length).toBe(BASE.lifeExp - BASE.age);
    expect(new Set(path.map(y => y.portfolioReturn)).size).toBeGreaterThan(1);
    expect(path.every(y => y.inflation !== undefined)).toBe(true);
  });

  it('returns reproducible historical bootstrap Monte Carlo results for the same seed', () => {
    const first = runMonteCarlo(BASE, null, { method: 'historical', runs: 25, seed: 'history-repeatable' });
    const second = runMonteCarlo(BASE, null, { method: 'historical', runs: 25, seed: 'history-repeatable' });

    expect(second.finalSuccessRate).toBe(first.finalSuccessRate);
    expect(second.percentiles.p50).toEqual(first.percentiles.p50);
  });

  it('keeps bear-market regimes mean-neutral around the configured return', () => {
    const path = buildScenarioPath(BASE, { seed: 'mean-return', bearMarketProbability: 0.08 });
    const avgReturn = path.reduce((sum, y) => sum + (y.portfolioReturn ?? 0), 0) / path.length;

    expect(avgReturn).toBeGreaterThan(BASE.r - 0.08);
    expect(avgReturn).toBeLessThan(BASE.r + 0.08);
  });

  it('all rows have non-negative portfolio values', () => {
    const rows = runProjection(BASE, BASE.r);
    for (const r of rows) {
      expect(r.trad).toBeGreaterThanOrEqual(0);
      expect(r.roth).toBeGreaterThanOrEqual(0);
      expect(r.taxable).toBeGreaterThanOrEqual(0);
      expect(r.hsa).toBeGreaterThanOrEqual(0);
      expect(r.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('all tax values are non-negative', () => {
    const rows = runProjection(BASE, BASE.r);
    for (const r of rows) {
      expect(r.federalTax).toBeGreaterThanOrEqual(0);
      expect(r.stateTax).toBeGreaterThanOrEqual(0);
      expect(r.totalTax).toBeGreaterThanOrEqual(0);
    }
  });

  it('Social Security begins at ssAge, not before', () => {
    const rows = runProjection(BASE, BASE.r);
    const preSS = rows.filter(r => r.age < BASE.ssAge);
    const postSS = rows.filter(r => r.age >= BASE.ssAge);
    for (const r of preSS) expect(r.ss).toBe(0);
    expect(postSS[0].ss).toBeGreaterThan(0);
  });

  it('applies Social Security benefit reduction factor', () => {
    const full = runProjection({ ...BASE, ssBenefitFactor: 1 }, BASE.r).find(r => r.age === BASE.ssAge)!;
    const reduced = runProjection({ ...BASE, ssBenefitFactor: 0.75 }, BASE.r).find(r => r.age === BASE.ssAge)!;

    expect(reduced.ss).toBe(Math.round(full.ss * 0.75));
  });

  it('models spouse own-record Social Security from manual monthly benefit', () => {
    const params = {
      ...BASE,
      age: 60,
      birthYear: 1966,
      ssAge: 67,
      ssCOLA: 0,
      spouseAge: 60,
      spouseBirthYear: 1966,
      spouseSsType: 'own' as const,
      spouseSs: 1200,
      spouseSsAge: 62,
    };

    expect(spouseSsAt(params, 61)).toBe(0);
    expect(spouseSsAt(params, 62)).toBe(1200 * 12);
  });

  it('models spouse own-record Social Security from SSA age estimates', () => {
    const params = {
      ...BASE,
      age: 60,
      birthYear: 1966,
      ssCOLA: 0,
      spouseAge: 60,
      spouseBirthYear: 1966,
      spouseSsType: 'own' as const,
      spouseSs: undefined,
      spouseSs62: 900,
      spouseSs67: 1400,
      spouseSs70: 1736,
      spouseSsAge: 70,
    };

    expect(spouseSsAt(params, 69)).toBe(0);
    expect(spouseSsAt(params, 70)).toBe(1736 * 12);
  });

  it('models spousal-only Social Security after the spouse claims and primary has filed', () => {
    const params = {
      ...BASE,
      age: 60,
      birthYear: 1966,
      ss: 3000,
      ss67: 3000,
      ssAge: 67,
      ssCOLA: 0,
      spouseAge: 60,
      spouseBirthYear: 1966,
      spouseSsType: 'spousal' as const,
      spouseSs: undefined,
      spouseSsAge: 62,
    };

    expect(spouseSsAt(params, 62)).toBe(0);
    expect(spouseSsAt(params, 67)).toBe(1500 * 12);
  });

  it('models combined spouse benefit as own record plus excess spousal top-up after primary files', () => {
    const params = {
      ...BASE,
      age: 60,
      birthYear: 1966,
      ss: 3000,
      ss67: 3000,
      ssAge: 67,
      ssCOLA: 0,
      spouseAge: 60,
      spouseBirthYear: 1966,
      spouseSsType: 'combined' as const,
      spouseSs: 800,
      spouseSsAge: 62,
    };

    expect(spouseSsAt(params, 62)).toBe(800 * 12);
    expect(spouseSsAt(params, 67)).toBeCloseTo((800 + (1500 - 800 / 0.7)) * 12, 5);
  });

  it('applies Social Security benefit reduction factor to spouse benefits', () => {
    const full = {
      ...BASE,
      age: 60,
      ssCOLA: 0,
      spouseAge: 60,
      spouseSsType: 'own' as const,
      spouseSs: 1200,
      spouseSsAge: 62,
      ssBenefitFactor: 1,
    };
    const reduced = { ...full, ssBenefitFactor: 0.8 };

    expect(spouseSsAt(reduced, 62)).toBe(Math.round(spouseSsAt(full, 62) * 0.8));
  });

  it('RMDs start at the correct age based on birth year and are zero before', () => {
    // BASE age=55 in 2026 → birth year 1971 → RMD start age 75 (born 1960+)
    const rows = runProjection(BASE, BASE.r);
    const preRMD = rows.filter(r => r.age < 75);
    const atRMD = rows.find(r => r.age === 75);
    for (const r of preRMD) expect(r.rmd).toBe(0);
    if (atRMD) expect(atRMD.rmd).toBeGreaterThan(0);
  });

  it('calculates RMD from prior year-end balance, not post-return balance', () => {
    // age=74 in 2026 -> birth year 1952 -> already subject to RMDs.
    const params = {
      ...BASE,
      age: 74,
      retireAge: 74,
      lifeExp: 75,
      tradBal: 1000000,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      tradContrib: 0,
      rothContrib: 0,
      taxableContrib: 0,
      hsaContrib: 0,
      ss: 0,
      rothConv: 0,
      convUntil: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      r: 0.10,
    };
    const rows = runProjection(params, params.r);
    const age75 = rows.find(r => r.age === 75)!;
    expect(age75.rmd).toBe(Math.round(1000000 / 24.6));
    expect(age75.rmd).not.toBe(Math.round(1100000 / 24.6));
  });

  it('excludes QCDs from taxable RMD income while still distributing the RMD', () => {
    const withQcd = {
      ...BASE,
      age: 74,
      birthYear: 1952,
      retireAge: 74,
      lifeExp: 75,
      filingStatus: 'single' as const,
      tradBal: 1000000,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      rothConv: 0,
      convUntil: 0,
      qcdAnnual: 10000,
      qcdStartAge: 70,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      r: 0,
    };
    const rows = runProjection(withQcd, 0);
    const age75 = rows.find(r => r.age === 75)!;
    expect(age75.rmd).toBe(Math.round(1000000 / 24.6));
    expect(age75.qcd).toBe(10000);
    expect(age75.ordinaryIncome).toBe(age75.rmd - age75.qcd);
    expect(age75.trad).toBe(1000000 - age75.rmd);
  });

  it('reduces RMDs when joint life estimate is enabled for a much younger spouse', () => {
    const base = {
      ...BASE,
      age: 74,
      birthYear: 1952,
      retireAge: 74,
      lifeExp: 75,
      filingStatus: 'married' as const,
      spouseAge: 60,
      spouseBirthYear: 1966,
      tradBal: 1000000,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      rothConv: 0,
      convUntil: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      r: 0,
    };
    const uniform = runProjection({ ...base, useJointLifeRmd: false }, 0).find(r => r.age === 75)!;
    const joint = runProjection({ ...base, useJointLifeRmd: true }, 0).find(r => r.age === 75)!;
    expect(joint.rmd).toBeLessThan(uniform.rmd);
  });

  it('uses updated 2026 standard deduction amounts', () => {
    expect(estimateTax(16100, 'single')).toBe(0);
    expect(estimateTax(16200, 'single')).toBe(10);
    expect(estimateTax(32200, 'married')).toBe(0);
    expect(estimateTax(32300, 'married')).toBe(10);
  });

  it('supports configured progressive state tax brackets', () => {
    const stateParams = {
      ...BASE,
      includeStateTax: true,
      stateTaxRate: 0.05,
      stateTaxBrackets: JSON.stringify([[10000, 0.01], [50000, 0.03], [null, 0.05]]),
    };
    expect(estimateConfiguredStateTax(60000, stateParams)).toBe(100 + 1200 + 500);
    expect(estimateConfiguredStateTax(60000, { ...stateParams, stateTaxBrackets: undefined })).toBe(3000);
  });

  it('models taxable account qualified dividends and realized gains', () => {
    const taxableIncome = {
      ...BASE,
      age: 60,
      retireAge: 60,
      lifeExp: 61,
      filingStatus: 'single' as const,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 100000,
      taxableBasis: 100000,
      hsaBal: 0,
      ss: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      taxableReturn: 0,
      taxableQualifiedDividendYield: 0.02,
      taxableRealizedGainYield: 0.01,
    };
    const rows = runProjection(taxableIncome, 0);
    const age61 = rows.find(r => r.age === 61)!;
    expect(age61.qualifiedDividends).toBe(2000);
    expect(age61.ltcg).toBe(1000);
    expect(age61.totalTax).toBeGreaterThanOrEqual(0);
  });

  it('uses the 2026 highest Part D IRMAA surcharge', () => {
    const highMagi = {
      ...BASE,
      age: 63,
      retireAge: 64,
      lifeExp: 66,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      includeIRMAA: true,
      accounts: [{
        id: 'pension',
        name: 'Large pension',
        type: 'pension' as const,
        balance: 0,
        monthlyIncome: 90000,
        incomeStartAge: 64,
        incomeEndAge: 65,
      }],
    };
    const rows = runProjection(highMagi, highMagi.r);
    const age66 = rows.find(r => r.age === 66)!;
    expect(age66.irmaaPartD).toBe(Math.round(91.00 * 12 * taxInflFactor(highMagi, 66)));
  });

  it('Roth conversions only occur within the specified window', () => {
    const rows = runProjection(BASE, BASE.r);
    const retireRows = rows.filter(r => r.age >= BASE.retireAge);
    const outsideWindow = retireRows.filter(r => r.age > BASE.convUntil);
    for (const r of outsideWindow) expect(r.conv).toBe(0);
  });

  it('conversionSchedule overrides manual conversion settings', () => {
    const schedule: Record<number, number> = { 63: 50000, 64: 75000 };
    const rows = runProjection(BASE, BASE.r, schedule);
    const r63 = rows.find(r => r.age === 63);
    const r64 = rows.find(r => r.age === 64);
    const r65 = rows.find(r => r.age === 65);
    expect(r63?.conv).toBe(50000);
    expect(r64?.conv).toBe(75000);
    // Age 65 is not in schedule — should be 0 since schedule was provided
    expect(r65?.conv).toBe(0);
  });

  it('total portfolio grows pre-retirement with no spending', () => {
    const noSpend = { ...BASE, expenses: 0, healthcareExpenses: 0, discretionaryExpenses: 0 };
    const rows = runProjection(noSpend, noSpend.r);
    const preRetire = rows.filter(r => r.age < BASE.retireAge);
    for (let i = 1; i < preRetire.length; i++) {
      expect(preRetire[i].total).toBeGreaterThan(preRetire[i - 1].total);
    }
  });

  it('caps basic retirement and HSA contributions at 2026 limits', () => {
    const capped = {
      ...BASE,
      age: 49,
      retireAge: 51,
      lifeExp: 51,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      tradContrib: 5000,
      rothContrib: 5000,
      hsaContrib: 2000,
      taxableContrib: 0,
      employerMatch: 0,
      salary: 200000,
      r: 0,
      hsaReturn: 0,
      taxableReturn: 0,
    };
    const rows = runProjection(capped, 0);
    const age50 = rows.find(r => r.age === 50)!;
    expect(age50.trad + age50.roth).toBe(32500);
    expect(age50.hsa).toBe(8750);
  });

  it('taxes and penalizes early Roth withdrawals above basis', () => {
    const earlyRoth = {
      ...BASE,
      age: 55,
      retireAge: 55,
      lifeExp: 56,
      filingStatus: 'single' as const,
      tradBal: 0,
      rothBal: 100000,
      rothBasis: 20000,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      expenses: 5000,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      rothConv: 0,
      convUntil: 0,
      r: 0,
    };
    const rows = runProjection(earlyRoth, 0);
    const age56 = rows.find(r => r.age === 56)!;
    expect(age56.rothW).toBeGreaterThan(20000);
    expect(age56.federalTax).toBeGreaterThan(0);
  });

  it('Roth conversion decreases trad balance and conversions are recorded', () => {
    // Zero expenses so portfolio draws don't obscure the conversion mechanics
    const withConv = { ...BASE, rothConv: 50000, convStart: 55, convUntil: 72, retireAge: 55, expenses: 0, healthcareExpenses: 0, discretionaryExpenses: 0 };
    const noConv = { ...BASE, rothConv: 0, convStart: 55, convUntil: 0, retireAge: 55, expenses: 0, healthcareExpenses: 0, discretionaryExpenses: 0 };
    const rowsWith = runProjection(withConv, withConv.r);
    const rowsNo = runProjection(noConv, noConv.r);
    const age65With = rowsWith.find(r => r.age === 65)!;
    const age65No = rowsNo.find(r => r.age === 65)!;
    expect(rowsWith.some(r => r.conv > 0)).toBe(true);
    expect(age65With.trad).toBeLessThan(age65No.trad);
    expect(age65With.roth).toBeGreaterThan(age65No.roth);
  });

  it('convTax is zero when there is no conversion', () => {
    const noConv = { ...BASE, rothConv: 0, convUntil: 0 };
    const rows = runProjection(noConv, noConv.r);
    for (const r of rows) expect(r.convTax).toBe(0);
  });

  it('taxes traditional withdrawals used for spending and grosses up the cash need', () => {
    const tradOnly = {
      ...BASE,
      age: 65,
      retireAge: 65,
      lifeExp: 66,
      filingStatus: 'single' as const,
      spouseAge: undefined,
      tradBal: 1000000,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      ssAge: 70,
      rothConv: 0,
      convUntil: 0,
      expenses: 10000,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      includeStateTax: false,
    };
    const rows = runProjection(tradOnly, 0);
    const age66 = rows.find(r => r.age === 66)!;
    expect(age66.tradW).toBeGreaterThan(age66.totalSpending);
    expect(age66.ordinaryIncome).toBe(age66.tradW);
    expect(age66.federalTax).toBe(estimateTax(age66.ordinaryIncome, 'single', 1, taxInflFactor(tradOnly, 66)));
  });

  it('applies retirement spending smile adjustments to basic ordinary and discretionary spending', () => {
    const smile = {
      ...BASE,
      age: 65,
      retireAge: 65,
      lifeExp: 70,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      expenses: 1000,
      healthcareExpenses: 200,
      discretionaryExpenses: 500,
      ltcExpenses: 0,
      expenseInflationRate: 0,
      healthcareInflationRate: 0,
      inf: 0,
      spendingSmileEnabled: true,
      earlyRetirementSpendingChange: 0.20,
      lateRetirementAge: 70,
      lateRetirementSpendingChange: -0.25,
    };
    const rows = runProjection(smile, 0);

    const early = rows.find(r => r.age === 66)!;
    expect(early.expenses).toBe(14400);
    expect(early.discretionaryExpenses).toBe(7200);
    expect(early.healthcareExpenses).toBe(2400);

    const late = rows.find(r => r.age === 70)!;
    expect(late.expenses).toBe(9000);
    expect(late.discretionaryExpenses).toBe(4500);
    expect(late.healthcareExpenses).toBe(2400);
  });

  it('adds one-time expenses on top of basic monthly spending', () => {
    const withOneTime = {
      ...BASE,
      age: 65,
      retireAge: 65,
      lifeExp: 67,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      expenses: 1000,
      healthcareExpenses: 200,
      discretionaryExpenses: 300,
      ltcExpenses: 0,
      expenseInflationRate: 0,
      healthcareInflationRate: 0,
      inf: 0,
      expenseItems: [
        { id: 'wedding', name: 'Wedding', category: 'other' as const, monthly: 25000, inflationType: 'general' as const, isOneTime: true, atAge: 66 },
      ],
    };
    const rows = runProjection(withOneTime, 0);

    const eventYear = rows.find(r => r.age === 66)!;
    expect(eventYear.expenses).toBe(37000);
    expect(eventYear.healthcareExpenses).toBe(2400);
    expect(eventYear.discretionaryExpenses).toBe(3600);

    const regularYear = rows.find(r => r.age === 67)!;
    expect(regularYear.expenses).toBe(12000);
    expect(regularYear.healthcareExpenses).toBe(2400);
    expect(regularYear.discretionaryExpenses).toBe(3600);
  });

  it('does not apply basic spending smile adjustments to advanced expense items', () => {
    const advanced = {
      ...BASE,
      age: 65,
      retireAge: 65,
      lifeExp: 66,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      expenses: 1000,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      expenseInflationRate: 0,
      healthcareInflationRate: 0,
      inf: 0,
      spendingSmileEnabled: true,
      earlyRetirementSpendingChange: 0.50,
      expenseItems: [
        { id: 'rent', name: 'Rent', category: 'housing' as const, monthly: 1000, inflationType: 'fixed' as const, startAge: 65 },
      ],
    };
    const rows = runProjection(advanced, 0);

    expect(rows.find(r => r.age === 66)?.expenses).toBe(12000);
  });

  it('switches to survivor treatment after primary life expectancy', () => {
    const survivor = {
      ...BASE,
      age: 65,
      birthYear: 1961,
      retireAge: 65,
      lifeExp: 66,
      filingStatus: 'married' as const,
      spouseAge: 64,
      spouseBirthYear: 1962,
      spouseLifeExp: 68,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 3000,
      ssAge: 65,
      spouseSsType: 'own' as const,
      spouseSs: 1000,
      spouseSsAge: 65,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
    };
    const rows = runProjection(survivor, 0);
    const age67 = rows.find(r => r.age === 67)!;
    expect(age67.ss).toBe(0);
    expect(age67.spouseSs).toBeGreaterThan(3000 * 12);
    expect(age67.standardDeduction).toBe(Math.round((16100 + 2050) * taxInflFactor(survivor, 67)));
  });

  it('adds ACA premiums net of credits before Medicare age', () => {
    const aca = {
      ...BASE,
      age: 60,
      retireAge: 60,
      lifeExp: 61,
      filingStatus: 'single' as const,
      tradBal: 0,
      rothBal: 0,
      taxableBal: 0,
      hsaBal: 0,
      ss: 0,
      expenses: 0,
      healthcareExpenses: 0,
      discretionaryExpenses: 0,
      ltcExpenses: 0,
      includeAcaPremiumCredits: true,
      acaMonthlyPremium: 800,
      acaMonthlyCredit: 300,
    };
    const rows = runProjection(aca, 0);
    const age61 = rows.find(r => r.age === 61)!;
    expect(age61.healthcareExpenses).toBe(6000);
  });

  it('higher return rate produces higher terminal portfolio', () => {
    const lo = runProjection(BASE, 0.04);
    const hi = runProjection(BASE, 0.08);
    expect(hi[hi.length - 1].total).toBeGreaterThan(lo[lo.length - 1].total);
  });

  it('totalTax equals federalTax + stateTax + IRMAA', () => {
    const rows = runProjection(BASE, BASE.r);
    for (const r of rows) {
      const expected = r.federalTax + r.stateTax + r.irmaaPartB + r.irmaaPartD;
      expect(r.totalTax).toBeCloseTo(expected, 0);
    }
  });
});
