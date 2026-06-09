import { describe, it, expect } from 'vitest';
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
  r: 0.07,
  taxableReturn: 0.07,
  hsaReturn: 0.07,
  inf: 0.03,
  stateTaxRate: 0,
  stateTaxBrackets: undefined,
  includeIRMAA: true,
  includeStateTax: false,
  ssCOLA: 0.025,
};

describe('runProjection', () => {
  it('returns one row per year from current age to life expectancy', () => {
    const rows = runProjection(BASE, BASE.r);
    expect(rows.length).toBe(BASE.lifeExp - BASE.age + 1);
    expect(rows[0].age).toBe(BASE.age);
    expect(rows[rows.length - 1].age).toBe(BASE.lifeExp);
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

  it('RMDs start at the correct age based on birth year and are zero before', () => {
    // BASE age=55 in 2026 → birth year 1971 → RMD start age 75 (born 1960+)
    const rows = runProjection(BASE, BASE.r);
    const preRMD = rows.filter(r => r.age < 75);
    const atRMD = rows.find(r => r.age === 75);
    for (const r of preRMD) expect(r.rmd).toBe(0);
    if (atRMD) expect(atRMD.rmd).toBeGreaterThan(0);
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
