import type { InputParams, ProjectionRow } from './types';

// IRS Uniform Lifetime Table (RMD divisors by age, SECURE 2.0)
const RMD_FACTORS: Record<number, number> = {
  72: 27.4,
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1,
  80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2,
  87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1,
  94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
};

// RMD start age per SECURE Act rules based on birth year.
// Note: born in 1949 is treated as 72 (second-half 1949 rule) — we lack birth-month precision.
export function rmdStartAge(birthYear: number): number {
  if (birthYear <= 1948) return 71; // pre-SECURE: 70½ rule (first RMD in year after turning 70½)
  if (birthYear <= 1950) return 72; // SECURE 1.0
  if (birthYear <= 1959) return 73; // SECURE 2.0
  return 75;                        // SECURE 2.0 extended (born 1960+, takes effect 2033)
}

export function computeLoanPayoffMonths(balance: number, monthly: number, annualRate: number): number {
  if (monthly <= 0 || balance <= 0) return 0;
  if (annualRate <= 0) return Math.ceil(balance / monthly);
  const r = annualRate / 12;
  if (monthly <= balance * r) return Infinity;
  return Math.ceil(-Math.log(1 - (balance * r) / monthly) / Math.log(1 + r));
}

export function rmdFactor(age: number, startAge: number): number | null {
  if (age < startAge) return null;
  return RMD_FACTORS[Math.min(age, 100)] ?? 6.4;
}

// Base year for bracket inflation extrapolation. Brackets scale with params.inf each year beyond this.
export const BASE_TAX_YEAR = 2025;

// 2025 federal income tax brackets [ceiling, rate]
const TAX_BRACKETS: Record<'single' | 'married', [number, number][]> = {
  single: [
    [11925, 0.10], [48475, 0.12], [103350, 0.22], [197300, 0.24],
    [250525, 0.32], [626350, 0.35], [Infinity, 0.37],
  ],
  married: [
    [23850, 0.10], [96950, 0.12], [206700, 0.22], [394600, 0.24],
    [501050, 0.32], [751600, 0.35], [Infinity, 0.37],
  ],
};

// Standard deductions 2025
const STD_DEDUCTION = { single: 15000, married: 30000 };

// 2025 LTCG thresholds (where 0% rate ends and 15% begins, 15% ends and 20% begins)
const LTCG_THRESHOLDS: Record<'single' | 'married', [number, number]> = {
  single: [48350, 518900],
  married: [96700, 583750],
};
// Additional standard deduction for 65+ — per eligible person (both spouses count separately)
const ADDITIONAL_STD_65 = { single: 2000, married: 1600 };

// IRMAA thresholds 2025 (income from 2 years prior)
const IRMAA_THRESHOLDS: Record<'single' | 'married', [number, number, number, number, number]> = {
  single:   [106000, 133000, 167000, 200000, 500000],
  married:  [212000, 266000, 334000, 400000, 750000],
};
// 2025 monthly IRMAA surcharges (above standard Part B/D premium)
const IRMAA_PART_B_SURCHARGES = [0, 74.00, 185.00, 295.90, 406.90, 443.90];
const IRMAA_PART_D_SURCHARGES = [0, 13.70, 35.30, 57.00, 78.60, 78.60];

// Returns the inflation multiplier to apply to 2025 bracket ceilings/deductions for a given calendar year.
export function taxInflFactor(params: InputParams, age: number): number {
  const calendarYear = new Date().getFullYear() + (age - params.age);
  return Math.pow(1 + params.inf, Math.max(0, calendarYear - BASE_TAX_YEAR));
}

// Returns how many people on this tax return are eligible for the 65+ extra deduction.
export function countEligible65(params: InputParams, age: number): number {
  const primary65 = age >= 65 ? 1 : 0;
  if (params.filingStatus === 'single') return primary65;
  const spouseCurrentAge = params.spouseAge !== undefined ? params.spouseAge + (age - params.age) : undefined;
  const spouse65 = spouseCurrentAge !== undefined && spouseCurrentAge >= 65 ? 1 : 0;
  return primary65 + spouse65;
}

function getBracketCeiling(status: 'single' | 'married', bracketIndex: number, inflFactor = 1): number {
  const ceil = TAX_BRACKETS[status]?.[bracketIndex]?.[0] ?? Infinity;
  return ceil === Infinity ? Infinity : Math.round(ceil * inflFactor);
}

export function bracketHeadroom(
  currentOrdinaryIncome: number,
  status: 'single' | 'married',
  targetBracket: number,
  num65: number = 0,
  inflFactor: number = 1,
): number {
  const std = (STD_DEDUCTION[status] + num65 * ADDITIONAL_STD_65[status]) * inflFactor;
  // ceiling is a taxable-income threshold; max gross income at ceiling = ceiling + std
  const ceiling = getBracketCeiling(status, targetBracket, inflFactor);
  return Math.max(0, ceiling + std - currentOrdinaryIncome);
}

// Returns how much ordinary income can be added before any federal income tax is owed.
// Income below the standard deduction is at 0% effective rate — always free to convert.
export function stdDeductionHeadroom(
  currentOrdinaryIncome: number,
  status: 'single' | 'married',
  num65: number = 0,
  inflFactor: number = 1,
): number {
  const std = (STD_DEDUCTION[status] + num65 * ADDITIONAL_STD_65[status]) * inflFactor;
  return Math.max(0, std - currentOrdinaryIncome);
}

export function estimateTax(
  income: number,
  status: 'single' | 'married',
  num65: number = 0,
  inflFactor: number = 1,
): number {
  const brackets = TAX_BRACKETS[status] || TAX_BRACKETS.married;
  const std = (STD_DEDUCTION[status] + num65 * ADDITIONAL_STD_65[status]) * inflFactor;
  const taxable = Math.max(0, income - std);
  let tax = 0;
  let prev = 0;
  for (const [cap, rate] of brackets) {
    const adjCap = cap === Infinity ? Infinity : Math.round(cap * inflFactor);
    if (taxable <= prev) break;
    tax += (Math.min(taxable, adjCap) - prev) * rate;
    prev = adjCap;
  }
  return Math.round(tax);
}

function estimateLtcgTax(
  ltcg: number,
  ordinaryTaxableIncome: number,  // already net of standard deduction
  status: 'single' | 'married',
  inflFactor: number = 1,
): number {
  if (ltcg <= 0) return 0;
  const [zero, fifteen] = LTCG_THRESHOLDS[status].map(t => Math.round(t * inflFactor));
  // LTCG stacks on top of ordinary taxable income
  const inZero = Math.max(0, Math.min(ltcg, zero - ordinaryTaxableIncome));
  const above0 = ltcg - inZero;
  const start15 = Math.max(0, ordinaryTaxableIncome - zero);
  const inFifteen = Math.max(0, Math.min(above0, fifteen - zero - start15));
  const inTwenty = Math.max(0, ltcg - inZero - inFifteen);
  return Math.round(inFifteen * 0.15 + inTwenty * 0.20);
}

export function marginalRate(
  income: number,
  status: 'single' | 'married',
  num65: number = 0,
  inflFactor: number = 1,
): number {
  const std = (STD_DEDUCTION[status] + num65 * ADDITIONAL_STD_65[status]) * inflFactor;
  const taxable = Math.max(0, income - std);
  for (const [cap, rate] of (TAX_BRACKETS[status] || TAX_BRACKETS.married)) {
    const adjCap = cap === Infinity ? Infinity : Math.round(cap * inflFactor);
    if (taxable <= adjCap) return rate;
  }
  return 0.37;
}

/**
 * Calculate IRMAA surcharges based on MAGI from 2 years prior
 */
function calcIRMAA(
  magi: number,
  status: 'single' | 'married',
  inflFactor: number = 1,
): { partB: number; partD: number } {
  const thresholds = IRMAA_THRESHOLDS[status];
  let tier = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (magi >= thresholds[i] * inflFactor) tier = i + 1;
  }
  return {
    partB: Math.round(IRMAA_PART_B_SURCHARGES[tier] * 12 * inflFactor),
    partD: Math.round(IRMAA_PART_D_SURCHARGES[tier] * 12 * inflFactor),
  };
}

/**
 * Calculate taxable portion of Social Security using provisional income
 * Thresholds: single $25k/$34k, married $32k/$44k
 */
export function taxableSSPortion(
  ssIncome: number,
  otherIncome: number,
  status: 'single' | 'married',
): number {
  const base = status === 'single' ? 25000 : 32000;
  const upper = status === 'single' ? 34000 : 44000;
  const provisional = otherIncome + ssIncome * 0.5;

  if (provisional <= base) return 0;
  if (provisional <= upper) {
    return Math.min(ssIncome * 0.5, (provisional - base) * 0.5);
  }
  return Math.min(ssIncome * 0.85, (upper - base) * 0.5 + (provisional - upper) * 0.85);
}

export function fmt(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'K';
  return sign + '$' + Math.round(abs);
}

// SSA early-claim reduction for a given number of months before FRA.
// First 36 months: 5/9% per month; beyond 36 months: 5/12% per month.
function ssEarlyReduction(monthsBeforeFRA: number): number {
  if (monthsBeforeFRA <= 0) return 0;
  const first = Math.min(monthsBeforeFRA, 36) * (5 / 9) / 100;
  const extra = Math.max(0, monthsBeforeFRA - 36) * (5 / 12) / 100;
  return first + extra;
}

// Interpolate SS monthly benefit at any whole-year claim age using the actual SSA reduction curve.
// Uses ss62 and ss67 as anchors for early claims, ss67 and ss70 for delayed.
// Returns a whole-dollar amount matching SSA's displayed values within ~$2 (residual PIA rounding).
export function ssInterpolate(ss62: number, ss67: number, ss70: number, age: number): number {
  if (age <= 62) return ss62;
  if (age >= 70) return ss70;
  if (age === 67) return ss67;
  if (age < 67) {
    const r62 = ssEarlyReduction(60);                    // reduction at 62 = 0.30
    const rAge = ssEarlyReduction((67 - age) * 12);
    return Math.round(ss62 + (ss67 - ss62) * (r62 - rAge) / r62);
  }
  // Delayed: 8%/yr is linear, so straight interpolation is exact
  return Math.round(ss67 + (ss70 - ss67) * (age - 67) / 3);
}

export function ssAt(params: InputParams, age: number): number {
  if (age < params.ssAge) return 0;
  // Apply SS COLA
  return params.ss * 12 * Math.pow(1 + params.ssCOLA, age - params.ssAge);
}

function spousalMonthly(params: InputParams, claimAge: number): number {
  const primaryPIA = params.ss67 || (params.ssAge === 67 ? params.ss
    : params.ssAge < 67 ? params.ss / (1 - ssEarlyReduction((67 - params.ssAge) * 12))
    : params.ss / (1 + 0.08 * (params.ssAge - 67)));
  const fraMonthly = primaryPIA * 0.5;
  // Spousal early reduction: 25/36%/mo for first 36 months, 5/12%/mo beyond; no delayed credits past FRA
  const effectiveAge = Math.min(claimAge, 67);
  const monthsBefore = Math.max(0, (67 - effectiveAge) * 12);
  const first36 = Math.min(monthsBefore, 36) * (25 / 36) / 100;
  const extra = Math.max(0, monthsBefore - 36) * (5 / 12) / 100;
  return fraMonthly * (1 - first36 - extra);
}

export function spouseSsAt(params: InputParams, age: number): number {
  if (params.spouseAge === undefined) return 0;
  const spouseAgeThisYear = params.spouseAge + (age - params.age);
  if (params.spouseLifeExp && spouseAgeThisYear > params.spouseLifeExp) return 0;

  const claimAge = params.spouseSsAge ?? 67;
  const ssType = params.spouseSsType ?? 'own';
  // Spousal/combined top-up requires primary to have filed first
  const primaryHasFiled = age >= params.ssAge;

  if (ssType === 'spousal') {
    const effectiveClaimAge = Math.min(claimAge, 67);
    if (spouseAgeThisYear < effectiveClaimAge || !primaryHasFiled) return 0;
    const monthly = spousalMonthly(params, claimAge);
    return monthly * 12 * Math.pow(1 + params.ssCOLA, spouseAgeThisYear - effectiveClaimAge);
  }

  // 'own' or 'combined' — own benefit starts at her claim age, no dependency on primary
  if (spouseAgeThisYear < claimAge) return 0;

  let ownMonthly: number;
  if (params.spouseSs62 && params.spouseSs67 && params.spouseSs70) {
    ownMonthly = ssInterpolate(params.spouseSs62, params.spouseSs67, params.spouseSs70, claimAge);
  } else if (params.spouseSs) {
    ownMonthly = params.spouseSs;
  } else {
    return 0;
  }

  // 'combined': once primary files, SSA pays max(own, spousal). Before that, own only.
  const monthly = (ssType === 'combined' && primaryHasFiled)
    ? Math.max(ownMonthly, spousalMonthly(params, claimAge))
    : ownMonthly;

  return monthly * 12 * Math.pow(1 + params.ssCOLA, spouseAgeThisYear - claimAge);
}

export function computeGuaranteedIncome(params: InputParams, age: number): number {
  if (!params.accounts) return 0;
  let total = 0;
  for (const acct of params.accounts) {
    if (acct.type !== 'annuity' && acct.type !== 'pension' && acct.type !== 'bond_tips') continue;
    if (!acct.monthlyIncome) continue;
    const startAge = acct.incomeStartAge ?? params.retireAge;
    const projEnd = Math.max(params.lifeExp, (params.spouseLifeExp && params.spouseAge) ? params.age + (params.spouseLifeExp - params.spouseAge) : 0);
    const endAge = acct.incomeEndAge ?? projEnd;
    if (age < startAge || age > endAge) continue;
    let annual = acct.monthlyIncome * 12;
    if (acct.inflationAdjusted) {
      const rate = acct.inflationRate ?? params.inf;
      annual *= Math.pow(1 + rate, age - startAge);
    }
    total += annual;
  }
  return Math.round(total);
}

/**
 * Run the core year-by-year projection with smart withdrawal ordering.
 * @param conversionSchedule - Optional per-year override: age -> forced conversion amount.
 *   When provided, bracketHeadroom logic is skipped and the schedule amount is used (capped by trad balance).
 */
export function runProjection(params: InputParams, r: number, conversionSchedule?: Record<number, number>): ProjectionRow[] {
  let trad = params.tradBal;
  let roth = params.rothBal;
  let taxable = params.taxableBal;
  let hsa = params.hsaBal;
  let basis = params.taxableBasis ?? params.taxableBal; // full basis = no embedded gains by default

  // When accounts are defined, they override the flat sidebar balance/contribution fields
  if (params.accounts && params.accounts.length > 0) {
    const tradAccts = params.accounts.filter(a => a.type === 'traditional');
    const rothAccts = params.accounts.filter(a => a.type === 'roth');
    const taxAccts  = params.accounts.filter(a => a.type === 'taxable');
    const hsaAccts  = params.accounts.filter(a => a.type === 'hsa');
    if (tradAccts.length + rothAccts.length + taxAccts.length + hsaAccts.length > 0) {
      trad    = tradAccts.reduce((s, a) => s + a.balance, 0);
      roth    = rothAccts.reduce((s, a) => s + a.balance, 0);
      taxable = taxAccts.reduce((s, a) => s + a.balance, 0);
      basis   = taxAccts.reduce((s, a) => s + (a.costBasis ?? a.balance), 0);
      hsa     = hsaAccts.reduce((s, a) => s + a.balance, 0);
    }
  }

  const retireIn = Math.max(1, params.retireAge - params.age);
  const birthYear = new Date().getFullYear() - params.age;
  const rmdStart = rmdStartAge(birthYear);
  // Effective last age of the projection — extends past primary's lifeExp when spouse outlives them
  const projEndAge = Math.max(
    params.lifeExp,
    (params.spouseLifeExp && params.spouseAge)
      ? params.age + (params.spouseLifeExp - params.spouseAge)
      : 0,
  );
  const totalYears = projEndAge - params.age;
  const rows: ProjectionRow[] = [];

  const targetConvBracket = params.targetConvBracket;

  // Keep track of MAGI from 2 years ago for IRMAA
  let magi2YearsAgo = 0;
  let magi1YearAgo = 0;

  for (let y = 0; y <= totalYears; y++) {
    const age = params.age + y;
    const inflFactor = taxInflFactor(params, age);
    const num65 = countEligible65(params, age);
    let rmd = 0, conv = 0, tradW = 0, rothW = 0, taxableW = 0, hsaW = 0;
    let pensionInc = 0;
    let ssInc = 0, spouseSsInc = 0;
    let ssTaxable = 0, federalTax = 0, stateTax = 0;
    let irmaaPartB = 0, irmaaPartD = 0;
    let convTaxCalc = 0;
    let ltcgAmount = 0;

    if (y === 0) {
      rows.push({
        age, trad: Math.round(trad), roth: Math.round(roth),
        taxable: Math.round(taxable), hsa: Math.round(hsa),
        total: Math.round(trad + roth + taxable + hsa),
        rmd: 0, conv: 0, tradW: 0, rothW: 0, taxableW: 0, hsaW: 0,
        ss: 0, spouseSs: 0, pension: 0,
        ordinaryIncome: 0, qualifiedDividends: 0, ltcg: 0,
        ssTaxable: 0, standardDeduction: 0, taxableIncome: 0,
        federalTax: 0, stateTax: 0, totalTax: 0, convTax: 0,
        marginalRate: 0, effectiveRate: 0,
        irmaaPartB: 0, irmaaPartD: 0,
        expenses: 0, healthcareExpenses: 0, ltcExpenses: 0, discretionaryExpenses: 0,
        totalSpending: 0, withdrawalRate: 0, portfolioValue: Math.round(trad + roth + taxable + hsa),
      });
      continue;
    }

    // Apply returns
    trad *= (1 + r);
    roth *= (1 + r);
    taxable *= (1 + params.taxableReturn);
    hsa *= (1 + params.hsaReturn);

    // Calculate inflation-adjusted expenses
    const ry = y - retireIn;
    const baseExpense = params.expenses * 12;
    const baseHcExpense = params.healthcareExpenses * 12;
    const baseDiscExpense = params.discretionaryExpenses * 12;
    const baseLtcExpense = params.ltcExpenses * 12;

    let yearExpense = 0, yearHcExpense = 0, yearDiscExpense = 0, yearLtcExpense = 0;

    if (y < retireIn) {
      // Accumulation phase
      let tradContribAmt: number, rothContribAmt: number;
      let taxableContribAmt: number, hsaContribAmt: number, employerMatchAmt: number;
      if (params.accounts && params.accounts.length > 0) {
        tradContribAmt    = params.accounts.filter(a => a.type === 'traditional').reduce((s, a) => s + (a.annualContrib ?? 0), 0);
        rothContribAmt    = params.accounts.filter(a => a.type === 'roth').reduce((s, a) => s + (a.annualContrib ?? 0), 0);
        taxableContribAmt = params.accounts.filter(a => a.type === 'taxable').reduce((s, a) => s + (a.annualContrib ?? 0), 0);
        hsaContribAmt     = params.accounts.filter(a => a.type === 'hsa').reduce((s, a) => s + (a.annualContrib ?? 0), 0);
        // Employer match: sum across traditional accounts
        const salary = params.salary ?? 0;
        employerMatchAmt = params.accounts
          .filter(a => a.type === 'traditional' && a.employerMatch && a.annualContrib)
          .reduce((s, a) => {
            const matchOnContrib = (a.annualContrib ?? 0) * (a.employerMatch ?? 0);
            const salaryCap = a.matchLimit ? (a.matchLimit / 100) * salary : matchOnContrib;
            return s + Math.min(matchOnContrib, salaryCap > 0 ? salaryCap : matchOnContrib);
          }, 0);
      } else {
        tradContribAmt    = params.tradContrib * 12;
        rothContribAmt    = params.rothContrib * 12;
        taxableContribAmt = params.taxableContrib * 12;
        hsaContribAmt     = params.hsaContrib * 12;
        const matchPct    = params.employerMatch;
        const matchLimit  = (params.matchLimit / 100) * tradContribAmt;
        employerMatchAmt  = Math.min(matchLimit, tradContribAmt * matchPct);
      }
      trad    += tradContribAmt + (y > 0 ? Math.round(employerMatchAmt) : 0);
      roth    += rothContribAmt;
      taxable += taxableContribAmt;
      basis   += taxableContribAmt;
      hsa     += hsaContribAmt;

      const annualSalary = params.salary ?? 0;

      // Full income tax on salary — standard deduction + progressive brackets
      if (annualSalary > 0) {
        federalTax = estimateTax(annualSalary, params.filingStatus, num65, inflFactor);
        if (params.includeStateTax && params.stateTaxRate > 0) {
          stateTax = Math.round(annualSalary * params.stateTaxRate);
        }
      }

      // Pre-retirement Roth conversions
      const convStart = params.convStart ?? params.retireAge;
      // Schedule overrides convStart/convUntil — honor whatever ages the schedule contains
      if (conversionSchedule && conversionSchedule[age] !== undefined && trad > 0) {
        conv = Math.max(0, Math.min(conversionSchedule[age], trad));
      } else if (!conversionSchedule && trad > 0 && age >= convStart && age <= params.convUntil) {
        // Auto-conversion: respect configured range, fill remaining salary headroom
        const headroom = bracketHeadroom(annualSalary, params.filingStatus, targetConvBracket, num65, inflFactor);
        const maxConv = params.rothConv > 0
          ? Math.min(params.rothConv, headroom, trad)
          : Math.min(headroom, trad);
        conv = Math.max(0, Math.floor(maxConv));
      }
      if (conv > 0) {
          // Incremental conversion tax on top of salary (this portion is paid from taxable account)
          const taxWithConv = estimateTax(annualSalary + conv, params.filingStatus, num65, inflFactor);
          const convFed = Math.max(0, taxWithConv - federalTax);
          federalTax = taxWithConv; // full tax: salary + conversion
          convTaxCalc = convFed;
          if (params.includeStateTax && params.stateTaxRate > 0) {
            const convStateTax = Math.round(conv * params.stateTaxRate);
            stateTax += convStateTax;
            convTaxCalc += convStateTax;
          }
          trad -= conv;
          roth += conv;
          taxable = Math.max(0, taxable - convTaxCalc); // only conversion taxes drawn from taxable account
      }

      magi2YearsAgo = magi1YearAgo;
      magi1YearAgo = annualSalary + conv; // MAGI includes salary for IRMAA tracking

      // Record expenses for display (salary covers them — no account draws)
      if (params.expenseItems && params.expenseItems.length > 0) {
        const yearsOut = age - params.age;
        for (const item of params.expenseItems) {
          const itemStart = item.startAge ?? params.age;
          let itemEnd = item.endAge ?? projEndAge;
          if (item.isLoan && item.loanBalance && item.loanRate !== undefined && item.monthly > 0) {
            const months = computeLoanPayoffMonths(item.loanBalance, item.monthly, item.loanRate);
            if (isFinite(months)) itemEnd = Math.min(itemEnd, Math.floor(params.age + months / 12));
          }
          if (item.isOneTime) {
            if (item.atAge === age) {
              const infl = Math.pow(1 + params.expenseInflationRate, yearsOut);
              const annual = Math.round(item.monthly * infl);
              taxable = Math.max(0, taxable - annual);
              yearExpense += annual;
            }
          } else {
            if (age < itemStart || age > itemEnd) continue;
            let infl = 1;
            if (item.inflationType === 'general') infl = Math.pow(1 + params.expenseInflationRate, yearsOut);
            else if (item.inflationType === 'healthcare') infl = Math.pow(1 + params.healthcareInflationRate, yearsOut);
            else if (item.inflationType === 'cpi') infl = Math.pow(1 + params.inf, yearsOut);
            const annual = item.monthly * 12 * infl;
            if (item.category === 'healthcare') yearHcExpense += annual;
            else if (item.category === 'discretionary') yearDiscExpense += annual;
            else yearExpense += annual;
          }
        }
        yearExpense = Math.round(yearExpense);
        yearHcExpense = Math.round(yearHcExpense);
        yearDiscExpense = Math.round(yearDiscExpense);
      } else {
        yearExpense = Math.round(baseExpense);
        yearHcExpense = Math.round(baseHcExpense);
        yearDiscExpense = Math.round(baseDiscExpense);
        if (age >= 80) yearLtcExpense = Math.round(baseLtcExpense);
      }
    } else {
      // Distribution phase
      if (params.expenseItems && params.expenseItems.length > 0) {
        const yearsOut = age - params.age;
        for (const item of params.expenseItems) {
          if (item.isOneTime) continue;
          const itemStart = item.startAge ?? params.age;
          let itemEnd = item.endAge ?? projEndAge;
          if (item.isLoan && item.loanBalance && item.loanRate !== undefined && item.monthly > 0) {
            const months = computeLoanPayoffMonths(item.loanBalance, item.monthly, item.loanRate);
            if (isFinite(months)) itemEnd = Math.min(itemEnd, Math.floor(params.age + months / 12));
          }
          if (age < itemStart || age > itemEnd) continue;
          let infl = 1;
          if (item.inflationType === 'general') infl = Math.pow(1 + params.expenseInflationRate, yearsOut);
          else if (item.inflationType === 'healthcare') infl = Math.pow(1 + params.healthcareInflationRate, yearsOut);
          else if (item.inflationType === 'cpi') infl = Math.pow(1 + params.inf, yearsOut);
          const annual = item.monthly * 12 * infl;
          if (item.category === 'healthcare') yearHcExpense += annual;
          else if (item.category === 'discretionary') yearDiscExpense += annual;
          else yearExpense += annual;
        }
        yearExpense = Math.round(yearExpense);
        yearHcExpense = Math.round(yearHcExpense);
        yearDiscExpense = Math.round(yearDiscExpense);
        yearLtcExpense = Math.round(baseLtcExpense * Math.pow(1 + params.healthcareInflationRate, ry));
      } else {
        yearExpense = Math.round(baseExpense * Math.pow(1 + params.expenseInflationRate, ry));
        yearHcExpense = Math.round(baseHcExpense * Math.pow(1 + params.healthcareInflationRate, ry));
        yearDiscExpense = Math.round(baseDiscExpense * Math.pow(1 + params.inf, ry));
        yearLtcExpense = Math.round(baseLtcExpense * Math.pow(1 + params.healthcareInflationRate, ry));
      }
      // Add one-time expenses this year
      if (params.expenseItems) {
        for (const item of params.expenseItems) {
          if (item.isOneTime && item.atAge === age) {
            const yearsOut = age - params.age;
            yearExpense += Math.round(item.monthly * Math.pow(1 + params.expenseInflationRate, yearsOut));
          }
        }
      }
      const totalSpending = yearExpense + yearHcExpense + yearDiscExpense + yearLtcExpense;

      ssInc = ssAt(params, age);
      spouseSsInc = spouseSsAt(params, age);
      pensionInc = computeGuaranteedIncome(params, age);

      // Step 1: Calculate RMD (mandatory)
      const factor = rmdFactor(age, rmdStart);
      if (factor !== null && trad > 0) {
        rmd = Math.round(trad / factor);
      }

        // Step 2: Roth conversion
      if (trad > 0) {
        if (conversionSchedule && conversionSchedule[age] !== undefined) {
          conv = Math.max(0, Math.min(conversionSchedule[age], trad - rmd));
        } else if (!conversionSchedule && age >= (params.convStart ?? params.retireAge) && age <= params.convUntil) {
          const initialSsTaxable = taxableSSPortion(ssInc + spouseSsInc, rmd, params.filingStatus);
          const ordinaryIncomeBeforeConv = rmd + initialSsTaxable;
          const headroom = bracketHeadroom(ordinaryIncomeBeforeConv, params.filingStatus, targetConvBracket, num65, inflFactor);
          const maxConv = params.rothConv > 0
            ? Math.min(params.rothConv, headroom, trad - rmd)
            : Math.min(headroom, trad - rmd);
          conv = Math.max(0, Math.floor(maxConv));
        }
      }

      // Recalculate SS taxable portion with RMD + conversion + pension
      const otherIncome = rmd + conv + pensionInc;
      ssTaxable = taxableSSPortion(ssInc + spouseSsInc, otherIncome, params.filingStatus);

      // Total ordinary income for tax calculation
      const totalOrdinary = rmd + conv + ssTaxable + pensionInc;

      // Federal tax (inflation-adjusted brackets)
      federalTax = estimateTax(totalOrdinary, params.filingStatus, num65, inflFactor);

      // State tax (flat rate for now)
      if (params.includeStateTax && params.stateTaxRate > 0) {
        stateTax = Math.round(totalOrdinary * params.stateTaxRate);
      }

      const totalTax = federalTax + stateTax;

      // Incremental tax attributable to the conversion
      if (conv > 0) {
        const ssTaxableNoConv = taxableSSPortion(ssInc + spouseSsInc, rmd + pensionInc, params.filingStatus);
        const incomeNoConv = rmd + ssTaxableNoConv + pensionInc;
        const fedNoConv = estimateTax(incomeNoConv, params.filingStatus, num65, inflFactor);
        const stateNoConv = params.includeStateTax && params.stateTaxRate > 0
          ? Math.round(incomeNoConv * params.stateTaxRate) : 0;
        convTaxCalc = Math.max(0, totalTax - (fedNoConv + stateNoConv));
      }

      // IRMAA (based on MAGI from 2 years ago, thresholds inflation-adjusted)
      if (params.includeIRMAA && age >= 65) {
        const irmaa = calcIRMAA(magi2YearsAgo, params.filingStatus, inflFactor);
        irmaaPartB = irmaa.partB;
        irmaaPartD = irmaa.partD;
      }

      // MAGI tracking updated later after LTCG is known

      // Step 3: Determine spending need after SS, pension, and taxes
      const totalSS = ssInc + spouseSsInc;
      const needed = totalSpending + totalTax + irmaaPartB + irmaaPartD - totalSS - pensionInc;

      // Step 4: WITHDRAWAL ORDER (smart):
      // a) Use RMD for spending (already distributed)
      let remaining = Math.max(0, needed);
      const fromRmd = Math.min(rmd, remaining);
      remaining -= fromRmd;

      // b) HSA for healthcare expenses first (tax-free if medical)
      if (remaining > 0 && hsa > 0) {
        hsaW = Math.min(hsa, yearHcExpense > 0 ? yearHcExpense : remaining, remaining);
        remaining -= hsaW;
      }

      // c) Taxable account withdrawals (lower tax impact)
      if (remaining > 0 && taxable > 0) {
        taxableW = Math.min(taxable, remaining);
        remaining -= taxableW;
      }

      // d) Traditional withdrawals (reduce future RMDs)
      if (remaining > 0 && trad > 0) {
        const tradAvailable = Math.max(0, trad - rmd - conv);
        tradW = Math.min(tradAvailable, remaining);
        remaining -= tradW;
      }

      // e) Roth withdrawals only when all else exhausted
      if (remaining > 0 && roth > 0) {
        rothW = Math.min(roth, remaining);
        remaining -= rothW;
      }

      // LTCG: compute realized gain from taxable withdrawal
      const gainRatio = taxable > 0 ? Math.max(0, Math.min(1, (taxable - basis) / taxable)) : 0;
      ltcgAmount = Math.round(taxableW * gainRatio);

      // If there are realized gains, re-run SS taxability and ordinary tax including LTCG in provisional income
      let ltcgTax = 0;
      if (ltcgAmount > 0) {
        // LTCG is included in provisional income for SS taxability
        ssTaxable = taxableSSPortion(ssInc + spouseSsInc, rmd + conv + ltcgAmount, params.filingStatus);
        const totalOrdinaryWithLtcg = rmd + conv + ssTaxable;
        federalTax = estimateTax(totalOrdinaryWithLtcg, params.filingStatus, num65, inflFactor);
        if (params.includeStateTax && params.stateTaxRate > 0) {
          stateTax = Math.round(totalOrdinaryWithLtcg * params.stateTaxRate);
        }
        const stdDed = (STD_DEDUCTION[params.filingStatus] + num65 * ADDITIONAL_STD_65[params.filingStatus]) * inflFactor;
        const ordinaryTaxableIncome = Math.max(0, totalOrdinaryWithLtcg - stdDed);
        ltcgTax = estimateLtcgTax(ltcgAmount, ordinaryTaxableIncome, params.filingStatus, inflFactor);
      }

      // Update MAGI tracking (include LTCG in MAGI for next year's IRMAA)
      magi2YearsAgo = magi1YearAgo;
      magi1YearAgo = rmd + conv + ssTaxable + ltcgAmount + pensionInc;

      // Update balances
      trad = Math.max(0, trad - rmd - conv - tradW);
      roth = Math.max(0, roth + conv - rothW);
      // Update basis proportionally to fraction of account sold
      if (taxable > 0) basis = Math.round(basis * Math.max(0, taxable - taxableW) / taxable);
      taxable = Math.max(0, taxable - taxableW - ltcgTax); // LTCG tax paid from taxable account
      hsa = Math.max(0, hsa - hsaW);
    }

    const portfolioValue = trad + roth + taxable + hsa;
    const salaryInRow = age < params.retireAge ? (params.salary ?? 0) : 0;
    const ordinaryForTax = rmd + conv + ssTaxable + salaryInRow + pensionInc;
    const mRate = marginalRate(ordinaryForTax, params.filingStatus, num65, inflFactor);
    const grossIncome = rmd + conv + ssInc + spouseSsInc + ltcgAmount + salaryInRow + pensionInc;
    const ltcgTaxFinal = (age >= params.retireAge) ? (() => {
      // Re-derive ltcgTax for eRate calculation — already computed in distribution block
      // We need it in scope; use the value already captured in the closure via ltcgAmount
      if (ltcgAmount <= 0) return 0;
      const stdDed = (STD_DEDUCTION[params.filingStatus] + num65 * ADDITIONAL_STD_65[params.filingStatus]) * inflFactor;
      const ordTaxable = Math.max(0, ordinaryForTax - stdDed);
      return estimateLtcgTax(ltcgAmount, ordTaxable, params.filingStatus, inflFactor);
    })() : 0;
    const eRate = grossIncome > 0 && age >= params.retireAge
      ? ((federalTax + stateTax + ltcgTaxFinal) / grossIncome)
      : 0;

    rows.push({
      age,
      trad: Math.round(trad),
      roth: Math.round(roth),
      taxable: Math.round(taxable),
      hsa: Math.round(hsa),
      total: Math.round(portfolioValue),
      rmd,
      conv,
      tradW: Math.round(tradW),
      rothW: Math.round(rothW),
      taxableW: Math.round(taxableW),
      hsaW: Math.round(hsaW),
      ss: Math.round(ssInc),
      spouseSs: Math.round(spouseSsInc),
      pension: Math.round(pensionInc),
      ordinaryIncome: Math.round(rmd + conv + ssTaxable + salaryInRow + pensionInc),
      qualifiedDividends: 0,
      ltcg: Math.round(ltcgAmount),
      ssTaxable: Math.round(ssTaxable),
      standardDeduction: Math.round((STD_DEDUCTION[params.filingStatus] + num65 * ADDITIONAL_STD_65[params.filingStatus]) * inflFactor),
      taxableIncome: Math.round(Math.max(0, rmd + conv + ssTaxable + salaryInRow + pensionInc - (STD_DEDUCTION[params.filingStatus] + num65 * ADDITIONAL_STD_65[params.filingStatus]) * inflFactor)),
      federalTax,
      stateTax,
      totalTax: federalTax + stateTax + irmaaPartB + irmaaPartD + ltcgTaxFinal,
      convTax: convTaxCalc,
      marginalRate: mRate,
      effectiveRate: eRate,
      irmaaPartB,
      irmaaPartD,
      expenses: yearExpense,
      healthcareExpenses: yearHcExpense,
      ltcExpenses: yearLtcExpense,
      discretionaryExpenses: yearDiscExpense,
      totalSpending: yearExpense + yearHcExpense + yearDiscExpense + yearLtcExpense,
      withdrawalRate: portfolioValue > 0 && age >= params.retireAge
        ? (rmd + tradW + rothW + taxableW + hsaW) / portfolioValue
        : 0,
      portfolioValue: Math.round(portfolioValue),
    });
  }

  return rows;
}