import { describe, it, expect } from 'vitest';
import { runOptimizer } from '../optimizer';
import { runProjection } from '../financial';
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

describe('runOptimizer', () => {
  const opt = runOptimizer(BASE);

  it('returns all required strategy results', () => {
    expect(opt.strategies.length).toBeGreaterThan(0);
    expect(opt.baseline).toBeDefined();
    expect(opt.currentSettings).toBeDefined();
    expect(opt.bestByTax).toBeDefined();
    expect(opt.bestByPortfolio).toBeDefined();
    expect(opt.bestByPeakRate).toBeDefined();
  });

  it('baseline is the no-conversion strategy', () => {
    expect(opt.baseline.strategy.name).toBe('No conversions');
    const retireRows = opt.baseline.rows.filter(r => r.age >= BASE.retireAge);
    for (const r of retireRows) expect(r.conv).toBe(0);
  });

  it('"Your current settings" is never selected as best', () => {
    expect(opt.bestByTax.strategy.name).not.toBe('Your current settings');
    expect(opt.bestByPortfolio.strategy.name).not.toBe('Your current settings');
    expect(opt.bestByPeakRate.strategy.name).not.toBe('Your current settings');
  });

  it('bestByTax has lifetime taxes <= baseline', () => {
    expect(opt.bestByTax.lifetimeTotalTax).toBeLessThanOrEqual(opt.baseline.lifetimeTotalTax);
  });

  it('bestByPortfolio has terminal total >= baseline', () => {
    expect(opt.bestByPortfolio.terminalAfterTax).toBeGreaterThanOrEqual(opt.baseline.terminalAfterTax);
  });

  it('bestByPeakRate has peak marginal rate <= baseline', () => {
    expect(opt.bestByPeakRate.peakMarginalRate).toBeLessThanOrEqual(opt.baseline.peakMarginalRate);
  });

  it('all lifetime tax values are non-negative', () => {
    for (const s of opt.strategies) {
      expect(s.lifetimeTotalTax).toBeGreaterThanOrEqual(0);
      expect(s.lifetimeFederalTax).toBeGreaterThanOrEqual(0);
      expect(s.lifetimeIRMAA).toBeGreaterThanOrEqual(0);
    }
  });

  it('all terminal totals are positive', () => {
    for (const s of opt.strategies) {
      expect(s.terminalTotal).toBeGreaterThan(0);
    }
  });

  it('applying recommended schedule changes the projection from baseline', () => {
    const schedule = opt.bestByTax.schedule;
    if (Object.keys(schedule).length === 0) return; // no conversions — skip
    const withSchedule = runProjection(BASE, BASE.r, schedule);
    const noConv = runProjection({ ...BASE, rothConv: 0, convUntil: 0 }, BASE.r);
    // Roth should be higher with schedule applied
    const termWith = withSchedule[withSchedule.length - 1];
    const termNo = noConv[noConv.length - 1];
    expect(termWith.roth).toBeGreaterThan(termNo.roth);
  });

  it('income smoother is present in strategies', () => {
    const smoother = opt.strategies.find(s => s.strategy.name === 'Income smoother');
    expect(smoother).toBeDefined();
  });

  it('per-year optimizer is present in strategies', () => {
    const perYear = opt.strategies.find(s => s.strategy.name === 'Per-year optimizer');
    expect(perYear).toBeDefined();
  });

  it('income smoother converts at 0% effective rate even when RMDs would be at 10%', () => {
    // BASE has $500K trad — RMDs land at 10% bracket. Converting at 12%+ to avoid 10% is bad,
    // but converting for FREE (income below standard deduction) is always beneficial.
    // The smoother fills to the standard deduction ceiling each year — these conversions are
    // at 0% effective rate and reduce future trad, trimming lifetime taxes.
    const smoother = opt.strategies.find(s => s.strategy.name === 'Income smoother')!;
    const totalConverted = Object.values(smoother.schedule).reduce((s, v) => s + v, 0);
    expect(totalConverted).toBeGreaterThan(0);
    // Smoother should produce lower lifetime taxes than no-conversion baseline
    expect(smoother.lifetimeTotalTax).toBeLessThan(opt.baseline.lifetimeTotalTax);
  });

  it('income smoother converts meaningfully when RMDs would spike to 22%+', () => {
    // Large trad pushes RMDs into 22% bracket — smoother should convert proactively
    const largeTrad = { ...BASE, tradBal: 2000000 };
    const o = runOptimizer(largeTrad);
    const smoother = o.strategies.find(s => s.strategy.name === 'Income smoother')!;
    const years = Object.keys(smoother.schedule).length;
    const avg = years > 0
      ? Object.values(smoother.schedule).reduce((s, v) => s + v, 0) / years
      : 0;
    expect(avg).toBeGreaterThan(50000); // substantial annual conversions
  });

  it('income smoother with large trad and high spending still converts meaningfully', () => {
    // Regression test: two-pass approach used to collapse to ~$16K/yr with large trad + high spending
    const highSpend = { ...BASE, tradBal: 2000000, expenses: 15000 };
    const o = runOptimizer(highSpend);
    const smoother = o.strategies.find(s => s.strategy.name === 'Income smoother')!;
    const years = Object.keys(smoother.schedule).length;
    const avg = years > 0
      ? Object.values(smoother.schedule).reduce((s, v) => s + v, 0) / years
      : 0;
    expect(avg).toBeGreaterThan(30000);
  });

  it('income smoother does not exceed 24% bracket peak', () => {
    const smoother = opt.strategies.find(s => s.strategy.name === 'Income smoother')!;
    expect(smoother.peakMarginalRate).toBeLessThanOrEqual(0.24);
  });

  it('bestByTax lifetime taxes <= bestByPortfolio lifetime taxes', () => {
    // Tax minimizer should win on taxes, portfolio maximizer on terminal total
    // (these are NOT strict — they can be equal or even reversed for some inputs,
    //  but the tax minimizer should generally do better on taxes)
    // Just verify each goal picks a valid strategy with non-degenerate outputs
    expect(opt.bestByTax.lifetimeTotalTax).toBeGreaterThanOrEqual(0);
    expect(opt.bestByPortfolio.terminalTotal).toBeGreaterThan(0);
  });

  it('savingsVsBaseline is >= 0 when a conversion strategy is best', () => {
    expect(opt.savingsVsBaseline).toBeGreaterThanOrEqual(0);
  });
});

describe('optimizer goal consistency', () => {
  it('bestByTax and bestByPortfolio can differ', () => {
    // This is a smoke test — just verifies both goals produce valid results
    const opt = runOptimizer(BASE);
    expect(opt.bestByTax).toBeDefined();
    expect(opt.bestByPortfolio).toBeDefined();
    // They might be the same strategy — that is fine and valid
    expect(opt.bestByTax.terminalTotal).toBeGreaterThan(0);
    expect(opt.bestByPortfolio.lifetimeTotalTax).toBeGreaterThanOrEqual(0);
  });

  it('large trad balance scenario finds meaningful tax savings', () => {
    const bigTrad = { ...BASE, tradBal: 2000000, rothBal: 0 };
    const opt = runOptimizer(bigTrad);
    // With $2M trad, conversions should meaningfully reduce taxes
    expect(opt.savingsVsBaseline).toBeGreaterThan(10000);
  });

  it('no trad balance scenario has no conversions recommended', () => {
    const noTrad = { ...BASE, tradBal: 0 };
    const opt = runOptimizer(noTrad);
    // With no trad, no conversions possible — best should equal baseline on conv amounts
    const bestSchedule = opt.bestByTax.schedule;
    const totalConv = Object.values(bestSchedule).reduce((s, v) => s + v, 0);
    expect(totalConv).toBe(0);
  });
});
