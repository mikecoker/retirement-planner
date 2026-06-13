import type { AccountType, InputParams, ProjectionOptions, ProjectionRow } from './types';
import { getStateTaxPreset } from './stateTaxPresets';

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

export function inferredBirthYear(params: InputParams): number {
  return params.birthYear ?? new Date().getFullYear() - params.age;
}

export function effectiveSpouseAge(params: InputParams): number | undefined {
  if (params.filingStatus !== 'married') return undefined;
  return params.spouseAge ?? params.age;
}

function spouseAgeAt(params: InputParams, age: number): number | undefined {
  const spouseAge = effectiveSpouseAge(params);
  return spouseAge !== undefined ? spouseAge + (age - params.age) : undefined;
}

export function inferredSpouseBirthYear(params: InputParams): number | undefined {
  if (params.spouseBirthYear !== undefined) return params.spouseBirthYear;
  const spouseAge = effectiveSpouseAge(params);
  if (spouseAge === undefined) return undefined;
  return new Date().getFullYear() - spouseAge;
}

export function fullRetirementAge(birthYear: number): number {
  if (birthYear <= 1937) return 65;
  if (birthYear <= 1942) return 65 + ((birthYear - 1937) * 2) / 12;
  if (birthYear <= 1954) return 66;
  if (birthYear <= 1959) return 66 + ((birthYear - 1954) * 2) / 12;
  return 67;
}

export function computeLoanPayoffMonths(balance: number, monthly: number, annualRate: number): number {
  if (monthly <= 0 || balance <= 0) return 0;
  if (annualRate <= 0) return Math.ceil(balance / monthly);
  const r = annualRate / 12;
  if (monthly <= balance * r) return Infinity;
  return Math.ceil(-Math.log(1 - (balance * r) / monthly) / Math.log(1 + r));
}

function retirementContributionLimit(age: number): number {
  const base = 24500;
  if (age >= 60 && age <= 63) return base + 11250;
  if (age >= 50) return base + 8000;
  return base;
}

function hsaContributionLimit(params: InputParams, age: number): number {
  const base = params.filingStatus === 'married' ? 8750 : 4400;
  return age >= 55 ? base + 1000 : base;
}

export function rmdFactor(age: number, startAge: number): number | null {
  if (age < startAge) return null;
  return RMD_FACTORS[Math.min(age, 100)] ?? 6.4;
}

function adjustedRmdFactor(params: InputParams, ownerAge: number, ownerStartAge: number, spouseAge?: number): number | null {
  const base = rmdFactor(ownerAge, ownerStartAge);
  if (base === null) return null;
  if (!params.useJointLifeRmd || spouseAge === undefined || ownerAge - spouseAge <= 10) return base;
  // Approximation for the IRS Joint Life and Last Survivor table when the
  // spouse is the sole beneficiary and more than 10 years younger.
  return base + (ownerAge - spouseAge - 10);
}

// Base year for federal tax extrapolation. Brackets scale with params.inf each year beyond this.
export const BASE_TAX_YEAR = 2026;

// 2026 federal income tax brackets [ceiling, rate]
const TAX_BRACKETS: Record<'single' | 'married', [number, number][]> = {
  single: [
    [12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24],
    [256225, 0.32], [640600, 0.35], [Infinity, 0.37],
  ],
  married: [
    [24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24],
    [512450, 0.32], [768700, 0.35], [Infinity, 0.37],
  ],
};

// Standard deductions 2026
const STD_DEDUCTION = { single: 16100, married: 32200 };

// 2026 LTCG thresholds (where 0% rate ends and 15% begins, 15% ends and 20% begins)
const LTCG_THRESHOLDS: Record<'single' | 'married', [number, number]> = {
  single: [49450, 546250],
  married: [98900, 613700],
};
// Additional standard deduction for 65+ — per eligible person (both spouses count separately)
const ADDITIONAL_STD_65 = { single: 2050, married: 1650 };

// IRMAA thresholds 2026 (income from 2 years prior)
const IRMAA_THRESHOLDS: Record<'single' | 'married', [number, number, number, number, number]> = {
  single:   [109000, 137000, 171000, 205000, 500000],
  married:  [218000, 274000, 342000, 410000, 750000],
};
// 2026 monthly IRMAA surcharges (above standard Part B/D premium)
const IRMAA_PART_B_SURCHARGES = [0, 81.20, 202.90, 324.60, 446.30, 487.00];
const IRMAA_PART_D_SURCHARGES = [0, 14.50, 37.50, 60.40, 83.30, 91.00];
const MEDICARE_PART_B_STANDARD_MONTHLY = 202.90;

// Returns the inflation multiplier to apply to base-year bracket ceilings/deductions for a given calendar year.
export function taxInflFactor(params: InputParams, age: number, inflationRate = params.inf): number {
  const calendarYear = new Date().getFullYear() + (age - params.age);
  return Math.pow(1 + inflationRate, Math.max(0, calendarYear - BASE_TAX_YEAR));
}

// Returns how many people on this tax return are eligible for the 65+ extra deduction.
export function countEligible65(params: InputParams, age: number): number {
  const primary65 = age >= 65 ? 1 : 0;
  if (params.filingStatus === 'single') return primary65;
  const spouseCurrentAge = spouseAgeAt(params, age);
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

function calculateBracketTax(income: number, brackets: Array<[number | null, number]>): number {
  const normalized = brackets
    .filter(b => Array.isArray(b) && b.length === 2 && Number.isFinite(Number(b[1])))
    .map(([cap, rate]) => [cap === null ? Infinity : Number(cap), Number(rate)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  let tax = 0;
  let prev = 0;
  for (const [cap, rate] of normalized) {
    if (income <= prev) break;
    tax += (Math.min(income, cap) - prev) * rate;
    prev = cap;
  }
  return Math.round(tax);
}

function estimateStateTax(income: number, params: InputParams, status: 'single' | 'married' = params.filingStatus): number {
  if (!params.includeStateTax || income <= 0) return 0;
  let tax = 0;
  const preset = getStateTaxPreset(params.stateTaxPreset);
  if (preset) {
    tax = preset.brackets
      ? calculateBracketTax(income, preset.brackets[status])
      : preset.flatRate && preset.flatRate > 0 ? Math.round(income * preset.flatRate) : 0;
  } else if (params.stateTaxBrackets) {
    try {
      const parsed = JSON.parse(params.stateTaxBrackets) as Array<[number, number]>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        tax = calculateBracketTax(income, parsed);
      }
    } catch {
      // Fall back to flat state rate below.
    }
  } else if (params.stateTaxRate > 0) {
    tax = Math.round(income * params.stateTaxRate);
  }
  if ((params.stateLocalTaxRate ?? 0) > 0) tax += Math.round(income * (params.stateLocalTaxRate ?? 0));
  return tax;
}

export function estimateConfiguredStateTax(income: number, params: InputParams): number {
  return estimateStateTax(income, params);
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

export function ssClaimFactor(age: number, fraAge: number): number {
  const monthsFromFra = Math.round((age - fraAge) * 12);
  if (monthsFromFra < 0) return 1 - ssEarlyReduction(Math.abs(monthsFromFra));
  return 1 + 0.08 * (monthsFromFra / 12);
}

// Interpolate SS monthly benefit at any whole-year claim age using the actual SSA reduction curve.
// Uses ss62/ss67/ss70 as anchors, with the benefit curve shaped by the birth-year FRA.
// Returns a whole-dollar amount matching SSA's displayed values within ~$2 (residual PIA rounding).
export function ssInterpolate(ss62: number, ss67: number, ss70: number, age: number, fraAge = 67): number {
  if (age <= 62) return ss62;
  if (age >= 70) return ss70;
  if (age === 67) return ss67;
  if (fraAge !== 67) {
    const f62 = ssClaimFactor(62, fraAge);
    const f67 = ssClaimFactor(67, fraAge);
    const f70 = ssClaimFactor(70, fraAge);
    const fAge = ssClaimFactor(age, fraAge);
    if (age < 67) {
      return Math.round(ss62 + (ss67 - ss62) * (fAge - f62) / (f67 - f62));
    }
    return Math.round(ss67 + (ss70 - ss67) * (fAge - f67) / (f70 - f67));
  }
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
  const benefitFactor = params.ssBenefitFactor ?? 1;
  // Apply SS COLA
  return params.ss * benefitFactor * 12 * Math.pow(1 + params.ssCOLA, age - params.ssAge);
}

function spousalMonthly(params: InputParams, claimAge: number): number {
  const spouseFra = fullRetirementAge(inferredSpouseBirthYear(params) ?? inferredBirthYear(params));
  const fraMonthly = primaryPia(params) * 0.5;
  // Spousal early reduction: 25/36%/mo for first 36 months, 5/12%/mo beyond; no delayed credits past FRA
  const effectiveAge = Math.min(claimAge, spouseFra);
  return fraMonthly * spousalReductionFactor(spouseFra, effectiveAge);
}

function primaryPia(params: InputParams): number {
  const primaryFra = fullRetirementAge(inferredBirthYear(params));
  return params.ss67
    ? params.ss67 / ssClaimFactor(67, primaryFra)
    : params.ss / ssClaimFactor(params.ssAge, primaryFra);
}

function spousalReductionFactor(spouseFra: number, claimAge: number): number {
  const effectiveAge = Math.min(claimAge, spouseFra);
  const monthsBefore = Math.max(0, Math.round((spouseFra - effectiveAge) * 12));
  const first36 = Math.min(monthsBefore, 36) * (25 / 36) / 100;
  const extra = Math.max(0, monthsBefore - 36) * (5 / 12) / 100;
  return 1 - first36 - extra;
}

function spouseOwnMonthly(params: InputParams, claimAge: number): number | null {
  if (params.spouseSs62 && params.spouseSs67 && params.spouseSs70) {
    const spouseBirthYear = inferredSpouseBirthYear(params);
    return ssInterpolate(
      params.spouseSs62,
      params.spouseSs67,
      params.spouseSs70,
      claimAge,
      spouseBirthYear !== undefined ? fullRetirementAge(spouseBirthYear) : 67,
    );
  }
  return params.spouseSs ?? null;
}

function spouseOwnPia(params: InputParams, claimAge: number, ownMonthly: number): number {
  const spouseBirthYear = inferredSpouseBirthYear(params);
  const spouseFra = spouseBirthYear !== undefined ? fullRetirementAge(spouseBirthYear) : 67;
  return params.spouseSs67
    ? params.spouseSs67 / ssClaimFactor(67, spouseFra)
    : ownMonthly / ssClaimFactor(claimAge, spouseFra);
}

function spouseAgeAtPrimaryFiling(params: InputParams): number {
  return (effectiveSpouseAge(params) ?? params.ssAge) + (params.ssAge - params.age);
}

function spousalExcessMonthly(params: InputParams, startAge: number, spouseOwnPiaAmount: number): number {
  const spouseFra = fullRetirementAge(inferredSpouseBirthYear(params) ?? inferredBirthYear(params));
  const excessAtFra = Math.max(0, primaryPia(params) * 0.5 - spouseOwnPiaAmount);
  return excessAtFra * spousalReductionFactor(spouseFra, startAge);
}

export function spouseSsAt(params: InputParams, age: number): number {
  const spouseAge = effectiveSpouseAge(params);
  if (spouseAge === undefined) return 0;
  const benefitFactor = params.ssBenefitFactor ?? 1;
  const spouseAgeThisYear = spouseAge + (age - params.age);
  if (params.spouseLifeExp && spouseAgeThisYear > params.spouseLifeExp) return 0;

  const claimAge = params.spouseSsAge ?? 67;
  const ssType = params.spouseSsType ?? 'own';
  // Spousal/combined top-up requires primary to have filed first
  const primaryHasFiled = age >= params.ssAge;
  const primaryFilingSpouseAge = spouseAgeAtPrimaryFiling(params);

  if (ssType === 'spousal') {
    const startAge = Math.max(claimAge, primaryFilingSpouseAge);
    if (spouseAgeThisYear < startAge || !primaryHasFiled) return 0;
    const monthly = spousalMonthly(params, startAge);
    return monthly * benefitFactor * 12 * Math.pow(1 + params.ssCOLA, spouseAgeThisYear - startAge);
  }

  // 'own' or 'combined' — own benefit starts at her claim age, no dependency on primary
  if (spouseAgeThisYear < claimAge) return 0;

  const ownMonthly = spouseOwnMonthly(params, claimAge);
  if (ownMonthly === null) return 0;

  const ownAnnual = ownMonthly * benefitFactor * 12 * Math.pow(1 + params.ssCOLA, spouseAgeThisYear - claimAge);
  if (ssType !== 'combined' || !primaryHasFiled) return ownAnnual;

  const topUpStartAge = Math.max(claimAge, primaryFilingSpouseAge);
  if (spouseAgeThisYear < topUpStartAge) return ownAnnual;

  const ownPia = spouseOwnPia(params, claimAge, ownMonthly);
  const topUpMonthly = spousalExcessMonthly(params, topUpStartAge, ownPia);
  const topUpAnnual = topUpMonthly * benefitFactor * 12 * Math.pow(1 + params.ssCOLA, spouseAgeThisYear - topUpStartAge);
  return ownAnnual + topUpAnnual;
}

export function computeGuaranteedIncome(params: InputParams, age: number): number {
  if (!params.accounts) return 0;
  let total = 0;
  const projectionYear = age - params.age;
  const spouseStartAge = effectiveSpouseAge(params);
  const spouseAge = spouseStartAge !== undefined ? spouseStartAge + projectionYear : undefined;
  const primaryAlive = age <= params.lifeExp;
  const spouseAlive = spouseAge !== undefined && (!params.spouseLifeExp || spouseAge <= params.spouseLifeExp);
  const projEnd = Math.max(
    params.lifeExp,
    (params.spouseLifeExp && spouseStartAge !== undefined)
      ? params.age + (params.spouseLifeExp - spouseStartAge)
      : 0,
  );

  for (const acct of params.accounts) {
    if (acct.type !== 'annuity' && acct.type !== 'pension' && acct.type !== 'bond_tips') continue;
    if (!acct.monthlyIncome) continue;
    const owner = acct.owner ?? 'primary';
    const ownerAge = owner === 'spouse' ? spouseAge : age;
    const ownerAlive = owner === 'joint'
      ? (primaryAlive || spouseAlive)
      : owner === 'spouse'
        ? spouseAlive
        : primaryAlive;
    const survivorAlive = owner === 'primary'
      ? spouseAlive
      : owner === 'spouse'
        ? primaryAlive
        : false;
    const startAge = acct.incomeStartAge ?? (owner === 'spouse' && spouseStartAge !== undefined ? spouseStartAge : params.retireAge);
    const defaultEndAge = owner === 'joint'
      ? projEnd
      : owner === 'spouse'
        ? (params.spouseLifeExp ?? projEnd)
        : params.lifeExp;
    const endAge = acct.incomeEndAge ?? defaultEndAge;
    const ownerDeathAge = owner === 'spouse' ? params.spouseLifeExp : params.lifeExp;
    const ownerBenefitEligible = ownerAge !== undefined && ownerAge >= startAge && ownerAge <= endAge;
    const survivorBenefitEligible = owner !== 'joint'
      && survivorAlive
      && ownerDeathAge !== undefined
      && ownerDeathAge >= startAge
      && ownerDeathAge <= endAge;
    if (ownerAlive ? !ownerBenefitEligible : !survivorBenefitEligible) continue;
    const incomeAge = ownerAge ?? age;

    let annual = acct.monthlyIncome * 12;
    if (acct.inflationAdjusted) {
      const rate = acct.inflationRate ?? params.inf;
      annual *= Math.pow(1 + rate, incomeAge - startAge);
    }

    if (!ownerAlive) {
      if (!survivorAlive) continue;
      const survivorType = acct.survivorBenefitType ?? 'none';
      if (survivorType === 'percent') {
        annual *= acct.survivorPercent ?? 0;
      } else if (survivorType === 'fixed') {
        annual = (acct.survivorMonthlyIncome ?? 0) * 12;
        if (acct.inflationAdjusted) {
          const rate = acct.inflationRate ?? params.inf;
          annual *= Math.pow(1 + rate, incomeAge - startAge);
        }
      } else {
        continue;
      }
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
export function runProjection(
  params: InputParams,
  rOrOptions: number | ProjectionOptions,
  legacyConversionSchedule?: Record<number, number>,
): ProjectionRow[] {
  const options: ProjectionOptions = typeof rOrOptions === 'number'
    ? { returnRate: rOrOptions, conversionSchedule: legacyConversionSchedule }
    : rOrOptions;
  const baseReturn = options.returnRate ?? params.r;
  const conversionSchedule = options.conversionSchedule;
  const scenarioByAge = new Map((options.scenarioPath ?? []).map(y => [y.age, y]));
  const expenseItems = params.expenseItems ?? [];
  const scheduledExpenseItems = expenseItems.filter(item => !item.isOneTime);
  const oneTimeExpenseItems = expenseItems.filter(item => item.isOneTime);
  const hasScheduledExpenseItems = scheduledExpenseItems.length > 0;
  let trad = params.tradBal;
  let roth = params.rothBal;
  let rothBasis = params.rothBasis ?? params.rothBal;
  let taxable = params.taxableBal;
  let hsa = params.hsaBal;
  let basis = params.taxableBasis ?? params.taxableBal; // full basis = no embedded gains by default
  type InvestmentAccountType = Extract<AccountType, 'traditional' | 'roth' | 'taxable' | 'hsa'>;
  type InvestmentBucket = {
    id: string;
    type: InvestmentAccountType;
    balance: number;
    annualContrib: number;
    growthRate?: number;
    employerMatch?: number;
    matchLimit?: number;
  };
  const investmentTypes: InvestmentAccountType[] = ['traditional', 'roth', 'taxable', 'hsa'];
  const accountBuckets: InvestmentBucket[] = (params.accounts ?? [])
    .filter((a): a is typeof a & { type: InvestmentAccountType } => investmentTypes.includes(a.type as InvestmentAccountType))
    .map(a => ({
      id: a.id,
      type: a.type,
      balance: a.balance,
      annualContrib: a.annualContrib ?? 0,
      growthRate: a.growthRate,
      employerMatch: a.employerMatch,
      matchLimit: a.matchLimit,
    }));
  const hasInvestmentAccounts = accountBuckets.length > 0;
  const defaultGrowthForType = (
    type: InvestmentAccountType,
    scenario: { portfolioReturn: number; taxableReturn: number; hsaReturn: number },
  ) => {
    if (type === 'taxable') return scenario.taxableReturn;
    if (type === 'hsa') return scenario.hsaReturn;
    return scenario.portfolioReturn;
  };
  const syncTotalsFromBuckets = () => {
    if (!hasInvestmentAccounts) return;
    trad = accountBuckets.filter(a => a.type === 'traditional').reduce((s, a) => s + a.balance, 0);
    roth = accountBuckets.filter(a => a.type === 'roth').reduce((s, a) => s + a.balance, 0);
    taxable = accountBuckets.filter(a => a.type === 'taxable').reduce((s, a) => s + a.balance, 0);
    hsa = accountBuckets.filter(a => a.type === 'hsa').reduce((s, a) => s + a.balance, 0);
  };
  const syncBucketsToTotal = (
    type: InvestmentAccountType,
    total: number,
    scenario: { portfolioReturn: number; taxableReturn: number; hsaReturn: number },
  ) => {
    if (!hasInvestmentAccounts) return;
    const buckets = accountBuckets.filter(a => a.type === type);
    if (buckets.length === 0) {
      if (total > 0) {
        accountBuckets.push({
          id: `synthetic-${type}`,
          type,
          balance: total,
          annualContrib: 0,
          growthRate: defaultGrowthForType(type, scenario),
        });
      }
      return;
    }
    const current = buckets.reduce((s, a) => s + a.balance, 0);
    if (total <= 0) {
      buckets.forEach(a => { a.balance = 0; });
      return;
    }
    if (current <= 0) {
      buckets[0].balance = total;
      buckets.slice(1).forEach(a => { a.balance = 0; });
      return;
    }
    buckets.forEach(a => {
      a.balance = total * (a.balance / current);
    });
  };
  const syncAllBucketsToTotals = (
    scenario: { portfolioReturn: number; taxableReturn: number; hsaReturn: number },
  ) => {
    syncBucketsToTotal('traditional', trad, scenario);
    syncBucketsToTotal('roth', roth, scenario);
    syncBucketsToTotal('taxable', taxable, scenario);
    syncBucketsToTotal('hsa', hsa, scenario);
  };

  // When accounts are defined, they override the flat sidebar balance/contribution fields
  if (hasInvestmentAccounts) {
    syncTotalsFromBuckets();
    rothBasis = roth;
    basis = (params.accounts ?? [])
      .filter(a => a.type === 'taxable')
      .reduce((s, a) => s + (a.costBasis ?? a.balance), 0);
  }

  const retireIn = Math.max(1, params.retireAge - params.age);
  const birthYear = inferredBirthYear(params);
  const spendingPhaseMultiplier = (age: number): number => {
    if (!params.spendingSmileEnabled || age < params.retireAge) return 1;
    const lateAge = params.lateRetirementAge ?? 75;
    const adjustment = age >= lateAge
      ? (params.lateRetirementSpendingChange ?? 0)
      : (params.earlyRetirementSpendingChange ?? 0);
    return Math.max(0, 1 + adjustment);
  };
  // Effective last age of the projection — extends past primary's lifeExp when spouse outlives them
  const spouseStartAge = effectiveSpouseAge(params);
  const projEndAge = Math.max(
    params.lifeExp,
    (params.spouseLifeExp && spouseStartAge !== undefined)
      ? params.age + (params.spouseLifeExp - spouseStartAge)
      : 0,
  );
  const totalYears = projEndAge - params.age;
  const rows: ProjectionRow[] = [];

  const targetConvBracket = params.targetConvBracket;

  // Keep track of MAGI from 2 years ago for IRMAA
  let magi2YearsAgo = 0;
  let magi1YearAgo = 0;

  const factorAtAge = new Map<number, {
    portfolioReturn: number;
    taxableReturn: number;
    hsaReturn: number;
    inflationRate: number;
    expenseInflationRate: number;
    healthcareInflationRate: number;
    ssCola: number;
    spendingShock: number;
    inflationFactor: number;
    expenseFactor: number;
    healthcareFactor: number;
    ssFactor: number;
  }>();
  let inflationFactor = 1;
  let expenseFactor = 1;
  let healthcareFactor = 1;
  let ssFactor = 1;
  for (let y = 0; y <= totalYears; y++) {
    const age = params.age + y;
    const scenarioYear = scenarioByAge.get(age);
    const inflationRate = scenarioYear?.inflation ?? params.inf;
    const expenseInflationRate = scenarioYear?.expenseInflation ?? params.expenseInflationRate;
    const healthcareInflationRate = scenarioYear?.healthcareInflation ?? params.healthcareInflationRate;
    const ssCola = scenarioYear?.ssCOLA ?? params.ssCOLA;
    if (y > 0) {
      inflationFactor *= (1 + inflationRate);
      expenseFactor *= (1 + expenseInflationRate);
      healthcareFactor *= (1 + healthcareInflationRate);
      ssFactor *= (1 + ssCola);
    }
    factorAtAge.set(age, {
      portfolioReturn: scenarioYear?.portfolioReturn ?? baseReturn,
      taxableReturn: scenarioYear?.taxableReturn ?? params.taxableReturn,
      hsaReturn: scenarioYear?.hsaReturn ?? params.hsaReturn,
      inflationRate,
      expenseInflationRate,
      healthcareInflationRate,
      ssCola,
      spendingShock: scenarioYear?.spendingShock ?? 0,
      inflationFactor,
      expenseFactor,
      healthcareFactor,
      ssFactor,
    });
  }
  const retireFactors = factorAtAge.get(params.retireAge) ?? {
    inflationFactor: 1,
    expenseFactor: 1,
    healthcareFactor: 1,
    ssFactor: 1,
  };

  for (let y = 0; y <= totalYears; y++) {
    const age = params.age + y;
    const scenario = factorAtAge.get(age)!;
    const { portfolioReturn, taxableReturn, hsaReturn, inflationRate, ssCola, spendingShock } = scenario;
    const expenseInflationFactor = scenario.expenseFactor;
    const healthcareInflationFactor = scenario.healthcareFactor;
    const cpiInflationFactor = scenario.inflationFactor;
    const spouseCurrentAge = spouseStartAge !== undefined ? spouseStartAge + y : undefined;
    const primaryAlive = age <= params.lifeExp;
    const spouseAlive = spouseCurrentAge !== undefined && (!params.spouseLifeExp || spouseCurrentAge <= params.spouseLifeExp);
    const isSurvivorYear = params.filingStatus === 'married' && spouseStartAge !== undefined && age > params.lifeExp;
    const filingStatusForYear: 'single' | 'married' = isSurvivorYear ? 'single' : params.filingStatus;
    const primaryEligible65 = !isSurvivorYear && age >= 65 ? 1 : 0;
    const spouseEligible65 = params.filingStatus === 'married' && spouseCurrentAge !== undefined && spouseCurrentAge >= 65 ? 1 : 0;
    const num65 = filingStatusForYear === 'single'
      ? (isSurvivorYear ? spouseEligible65 : primaryEligible65)
      : primaryEligible65 + spouseEligible65;
    const inflFactor = taxInflFactor(params, age, inflationRate);
    let rmd = 0, qcd = 0, conv = 0, tradW = 0, rothW = 0, taxableW = 0, hsaW = 0;
    let pensionInc = 0;
    let ssInc = 0, spouseSsInc = 0;
    let ssTaxable = 0, federalTax = 0, stateTax = 0;
    let irmaaPartB = 0, irmaaPartD = 0;
    let convTaxCalc = 0;
    let rothPenaltyTax = 0;
    let qualifiedDividends = 0;
    let investmentOrdinaryIncome = 0;
    let annualRealizedLtcg = 0;
    let ltcgAmount = 0;

    if (y === 0) {
      rows.push({
        age, trad: Math.round(trad), roth: Math.round(roth),
        taxable: Math.round(taxable), hsa: Math.round(hsa),
        total: Math.round(trad + roth + taxable + hsa),
        rmd: 0, qcd: 0, conv: 0, tradW: 0, rothW: 0, taxableW: 0, hsaW: 0,
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

    const priorYearEndTrad = trad;

    // Apply returns
    if (hasInvestmentAccounts) {
      for (const bucket of accountBuckets) {
        bucket.balance *= (1 + (bucket.growthRate ?? defaultGrowthForType(bucket.type, scenario)));
      }
      syncTotalsFromBuckets();
    } else {
      trad *= (1 + portfolioReturn);
      roth *= (1 + portfolioReturn);
      taxable *= (1 + taxableReturn);
      hsa *= (1 + hsaReturn);
    }
    if (taxable > 0) {
      investmentOrdinaryIncome = Math.round(taxable * (params.taxableOrdinaryYield ?? 0));
      qualifiedDividends = Math.round(taxable * (params.taxableQualifiedDividendYield ?? 0));
      annualRealizedLtcg = Math.round(taxable * (params.taxableRealizedGainYield ?? 0));
      ltcgAmount = annualRealizedLtcg;
    }

    // Calculate inflation-adjusted expenses
    const baseExpense = params.expenses * 12;
    const baseHcExpense = params.healthcareExpenses * 12;
    const baseDiscExpense = params.discretionaryExpenses * 12;
    const baseLtcExpense = params.ltcExpenses * 12;

    let yearExpense = 0, yearHcExpense = 0, yearDiscExpense = 0, yearLtcExpense = 0;

    if (y < retireIn) {
      // Accumulation phase
      let tradContribAmt: number, rothContribAmt: number;
      let taxableContribAmt: number, hsaContribAmt: number, employerMatchAmt: number;
      if (hasInvestmentAccounts) {
        const salary = params.salary ?? 0;
        tradContribAmt = 0;
        rothContribAmt = 0;
        taxableContribAmt = 0;
        hsaContribAmt = 0;
        employerMatchAmt = 0;
        for (const bucket of accountBuckets) {
          const contribution = bucket.annualContrib;
          if (bucket.type === 'traditional') tradContribAmt += contribution;
          if (bucket.type === 'roth') rothContribAmt += contribution;
          if (bucket.type === 'taxable') taxableContribAmt += contribution;
          if (bucket.type === 'hsa') hsaContribAmt += contribution;
          bucket.balance += contribution;
          if (bucket.type === 'traditional' && bucket.employerMatch && contribution) {
            const matchOnContrib = contribution * bucket.employerMatch;
            const salaryCap = bucket.matchLimit ? (bucket.matchLimit / 100) * salary : matchOnContrib;
            const match = Math.min(matchOnContrib, salaryCap > 0 ? salaryCap : matchOnContrib);
            employerMatchAmt += match;
            bucket.balance += Math.round(match);
          }
        }
        syncTotalsFromBuckets();
      } else {
        const requestedTrad = params.tradContrib * 12;
        const requestedRoth = params.rothContrib * 12;
        const retirementLimit = Math.min(retirementContributionLimit(age), params.salary ?? retirementContributionLimit(age));
        const requestedRetirement = requestedTrad + requestedRoth;
        const retirementScale = requestedRetirement > retirementLimit && requestedRetirement > 0
          ? retirementLimit / requestedRetirement
          : 1;
        tradContribAmt    = Math.round(requestedTrad * retirementScale);
        rothContribAmt    = Math.round(requestedRoth * retirementScale);
        taxableContribAmt = params.taxableContrib * 12;
        hsaContribAmt     = Math.min(params.hsaContrib * 12, hsaContributionLimit(params, age));
        const matchPct    = params.employerMatch;
        const matchLimit  = (params.matchLimit / 100) * tradContribAmt;
        employerMatchAmt  = Math.min(matchLimit, tradContribAmt * matchPct);
      }
      if (!hasInvestmentAccounts) {
        trad    += tradContribAmt + (y > 0 ? Math.round(employerMatchAmt) : 0);
        roth    += rothContribAmt;
        taxable += taxableContribAmt;
        hsa     += hsaContribAmt;
      }
      rothBasis += rothContribAmt;
      basis += taxableContribAmt;

      const annualSalary = params.salary ?? 0;

      // Full income tax on salary — standard deduction + progressive brackets
      if (annualSalary > 0 || investmentOrdinaryIncome > 0 || qualifiedDividends > 0 || ltcgAmount > 0) {
        const salaryFed = estimateTax(annualSalary, filingStatusForYear, num65, inflFactor);
        const salaryState = estimateStateTax(annualSalary, params, filingStatusForYear);
        const ordinaryTaxableIncome = Math.max(0, annualSalary + investmentOrdinaryIncome - (STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor);
        const investmentPrefTax = estimateLtcgTax(qualifiedDividends + ltcgAmount, ordinaryTaxableIncome, filingStatusForYear, inflFactor);
        federalTax = estimateTax(annualSalary + investmentOrdinaryIncome, filingStatusForYear, num65, inflFactor) + investmentPrefTax;
        stateTax = estimateStateTax(annualSalary + investmentOrdinaryIncome + qualifiedDividends + ltcgAmount, params, filingStatusForYear);
        const investmentTaxDrag = Math.max(0, federalTax + stateTax - salaryFed - salaryState);
        taxable = Math.max(0, taxable - investmentTaxDrag);
        syncBucketsToTotal('taxable', taxable, scenario);
      }

      // Pre-retirement Roth conversions
      const convStart = params.convStart ?? params.retireAge;
      // Schedule overrides convStart/convUntil — honor whatever ages the schedule contains
      if (conversionSchedule && conversionSchedule[age] !== undefined && trad > 0) {
        conv = Math.max(0, Math.min(conversionSchedule[age], trad));
      } else if (!conversionSchedule && trad > 0 && age >= convStart && age <= params.convUntil) {
        // Auto-conversion: respect configured range, fill remaining salary headroom
        const headroom = bracketHeadroom(annualSalary, filingStatusForYear, targetConvBracket, num65, inflFactor);
        const maxConv = params.rothConv > 0
          ? Math.min(params.rothConv, headroom, trad)
          : Math.min(headroom, trad);
        conv = Math.max(0, Math.floor(maxConv));
      }
      if (conv > 0) {
        // Incremental conversion tax on top of salary (this portion is paid from taxable account)
        const ordinaryWithConv = annualSalary + investmentOrdinaryIncome + conv;
        const ordinaryTaxableWithConv = Math.max(0, ordinaryWithConv - (STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor);
        const taxWithConv = estimateTax(ordinaryWithConv, filingStatusForYear, num65, inflFactor)
          + estimateLtcgTax(qualifiedDividends + ltcgAmount, ordinaryTaxableWithConv, filingStatusForYear, inflFactor);
        const convFed = Math.max(0, taxWithConv - federalTax);
        federalTax = taxWithConv; // full tax: salary + conversion
        convTaxCalc = convFed;
        const stateWithConv = estimateStateTax(annualSalary + conv, params, filingStatusForYear);
        convTaxCalc += Math.max(0, stateWithConv - stateTax);
        stateTax = stateWithConv;
        trad -= conv;
        roth += conv;
        rothBasis += conv;
        taxable = Math.max(0, taxable - convTaxCalc); // only conversion taxes drawn from taxable account
        syncAllBucketsToTotals(scenario);
      }

      magi2YearsAgo = magi1YearAgo;
      magi1YearAgo = annualSalary + conv + investmentOrdinaryIncome + qualifiedDividends + ltcgAmount; // MAGI tracking

      // Record expenses for display (salary covers them — no account draws)
      if (hasScheduledExpenseItems) {
        for (const item of scheduledExpenseItems) {
          const itemStart = item.startAge ?? params.age;
          let itemEnd = item.endAge ?? projEndAge;
          if (item.isLoan && item.loanBalance && item.loanRate !== undefined && item.monthly > 0) {
            const months = computeLoanPayoffMonths(item.loanBalance, item.monthly, item.loanRate);
            if (isFinite(months)) itemEnd = Math.min(itemEnd, Math.floor(params.age + months / 12));
          }
          if (age < itemStart || age > itemEnd) continue;
          let infl = 1;
          if (item.inflationType === 'general') infl = expenseInflationFactor;
          else if (item.inflationType === 'healthcare') infl = healthcareInflationFactor;
          else if (item.inflationType === 'cpi') infl = cpiInflationFactor;
          const annual = item.monthly * 12 * infl;
          if (item.category === 'healthcare') yearHcExpense += annual;
          else if (item.category === 'discretionary') yearDiscExpense += annual;
          else yearExpense += annual;
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
      for (const item of oneTimeExpenseItems) {
        if (item.atAge === age) {
          const annual = Math.round(item.monthly * expenseInflationFactor);
          taxable = Math.max(0, taxable - annual);
          syncBucketsToTotal('taxable', taxable, scenario);
          yearExpense += annual;
        }
      }
      if (params.includeMedicarePremiums) {
        yearHcExpense += Math.round(num65 * MEDICARE_PART_B_STANDARD_MONTHLY * 12);
      }
      if (params.includeAcaPremiumCredits) {
        const covered = (primaryAlive && age < 65 ? 1 : 0) + (spouseAlive && spouseCurrentAge !== undefined && spouseCurrentAge < 65 ? 1 : 0);
        yearHcExpense += Math.max(0, Math.round(covered * (params.acaMonthlyPremium - params.acaMonthlyCredit) * 12));
      }
    } else {
      // Distribution phase
      if (hasScheduledExpenseItems) {
        for (const item of scheduledExpenseItems) {
          const itemStart = item.startAge ?? params.age;
          let itemEnd = item.endAge ?? projEndAge;
          if (item.isLoan && item.loanBalance && item.loanRate !== undefined && item.monthly > 0) {
            const months = computeLoanPayoffMonths(item.loanBalance, item.monthly, item.loanRate);
            if (isFinite(months)) itemEnd = Math.min(itemEnd, Math.floor(params.age + months / 12));
          }
          if (age < itemStart || age > itemEnd) continue;
          let infl = 1;
          if (item.inflationType === 'general') infl = expenseInflationFactor;
          else if (item.inflationType === 'healthcare') infl = healthcareInflationFactor;
          else if (item.inflationType === 'cpi') infl = cpiInflationFactor;
          const annual = item.monthly * 12 * infl;
          if (item.category === 'healthcare') yearHcExpense += annual;
          else if (item.category === 'discretionary') yearDiscExpense += annual;
          else yearExpense += annual;
        }
        yearExpense = Math.round(yearExpense);
        yearHcExpense = Math.round(yearHcExpense);
        yearDiscExpense = Math.round(yearDiscExpense);
        yearLtcExpense = Math.round(baseLtcExpense * (healthcareInflationFactor / retireFactors.healthcareFactor));
      } else {
        const spendingMultiplier = spendingPhaseMultiplier(age);
        yearExpense = Math.round(baseExpense * (expenseInflationFactor / retireFactors.expenseFactor) * spendingMultiplier);
        yearHcExpense = Math.round(baseHcExpense * (healthcareInflationFactor / retireFactors.healthcareFactor));
        yearDiscExpense = Math.round(baseDiscExpense * (cpiInflationFactor / retireFactors.inflationFactor) * spendingMultiplier);
        yearLtcExpense = Math.round(baseLtcExpense * (healthcareInflationFactor / retireFactors.healthcareFactor));
      }
      // Add one-time expenses this year
      for (const item of oneTimeExpenseItems) {
        if (item.atAge === age) {
          yearExpense += Math.round(item.monthly * expenseInflationFactor);
        }
      }
      yearExpense += Math.round(spendingShock);
      if (params.includeMedicarePremiums) {
        yearHcExpense += Math.round(num65 * MEDICARE_PART_B_STANDARD_MONTHLY * 12);
      }
      if (params.includeAcaPremiumCredits) {
        const covered = (primaryAlive && age < 65 ? 1 : 0) + (spouseAlive && spouseCurrentAge !== undefined && spouseCurrentAge < 65 ? 1 : 0);
        yearHcExpense += Math.max(0, Math.round(covered * (params.acaMonthlyPremium - params.acaMonthlyCredit) * 12));
      }
      const totalSpending = yearExpense + yearHcExpense + yearDiscExpense + yearLtcExpense;

      if (isSurvivorYear) {
        ssInc = 0;
        const colaParams = { ...params, ssCOLA: ssCola };
        spouseSsInc = Math.max(ssAt(colaParams, age), spouseSsAt(colaParams, age));
      } else {
        ssInc = age <= params.lifeExp ? ssAt({ ...params, ssCOLA: ssCola }, age) : 0;
        spouseSsInc = spouseSsAt({ ...params, ssCOLA: ssCola }, age);
      }
      pensionInc = computeGuaranteedIncome(params, age);

      // Step 1: Calculate RMD (mandatory)
      const ownerAge = isSurvivorYear && spouseCurrentAge !== undefined ? spouseCurrentAge : age;
      const ownerBirthYear = isSurvivorYear
        ? (inferredSpouseBirthYear(params) ?? birthYear)
        : birthYear;
      const factor = adjustedRmdFactor(params, ownerAge, rmdStartAge(ownerBirthYear), spouseCurrentAge);
      if (factor !== null && priorYearEndTrad > 0) {
        rmd = Math.min(trad, Math.round(priorYearEndTrad / factor));
      }
      if (rmd > 0 && params.qcdAnnual > 0 && ownerAge >= (params.qcdStartAge || 70)) {
        qcd = Math.min(rmd, params.qcdAnnual);
      }
      const taxableRmd = rmd - qcd;

        // Step 2: Roth conversion
      if (trad > 0) {
        if (conversionSchedule && conversionSchedule[age] !== undefined) {
          conv = Math.max(0, Math.min(conversionSchedule[age], trad - rmd));
        } else if (!conversionSchedule && age >= (params.convStart ?? params.retireAge) && age <= params.convUntil) {
          const initialSsTaxable = taxableSSPortion(ssInc + spouseSsInc, taxableRmd, filingStatusForYear);
          const ordinaryIncomeBeforeConv = taxableRmd + initialSsTaxable;
          const headroom = bracketHeadroom(ordinaryIncomeBeforeConv, filingStatusForYear, targetConvBracket, num65, inflFactor);
          const maxConv = params.rothConv > 0
            ? Math.min(params.rothConv, headroom, trad - rmd)
            : Math.min(headroom, trad - rmd);
          conv = Math.max(0, Math.floor(maxConv));
        }
      }

      // IRMAA (based on MAGI from 2 years ago, thresholds inflation-adjusted)
      if (params.includeIRMAA && age >= 65) {
        const irmaa = calcIRMAA(magi2YearsAgo, filingStatusForYear, inflFactor);
        irmaaPartB = irmaa.partB;
        irmaaPartD = irmaa.partD;
      }

      // MAGI tracking updated later after withdrawals and LTCG are known

      // Step 3: Determine withdrawals and taxes together. Traditional withdrawals
      // and realized capital gains can create more tax, which can require more
      // withdrawals, so iterate until the cash need stabilizes.
      const totalSS = ssInc + spouseSsInc;
      let ltcgTax = 0;
      const gainRatio = taxable > 0 ? Math.max(0, Math.min(1, (taxable - basis) / taxable)) : 0;

      for (let iter = 0; iter < 12; iter++) {
        const prevFederalTax = federalTax;
        const prevStateTax = stateTax;
        const prevLtcgTax = ltcgTax;
        const prevRothPenaltyTax = rothPenaltyTax;
        const prevTradW = tradW;
        const prevTaxableW = taxableW;
        const prevRothW = rothW;
        const prevHsaW = hsaW;

        const cashNeed = totalSpending + federalTax + stateTax + ltcgTax + rothPenaltyTax + irmaaPartB + irmaaPartD - totalSS - pensionInc;
        let remaining = Math.max(0, cashNeed);

        const fromRmd = Math.min(Math.max(0, rmd - qcd), remaining);
        remaining -= fromRmd;

        hsaW = 0;
        taxableW = 0;
        tradW = 0;
        rothW = 0;

        if (remaining > 0 && hsa > 0) {
          hsaW = Math.min(hsa, yearHcExpense > 0 ? yearHcExpense : remaining, remaining);
          remaining -= hsaW;
        }

        if (remaining > 0 && taxable > 0) {
          taxableW = Math.min(taxable, remaining);
          remaining -= taxableW;
        }

        if (remaining > 0 && trad > 0) {
          const tradAvailable = Math.max(0, trad - rmd - conv);
          tradW = Math.min(tradAvailable, remaining);
          remaining -= tradW;
        }

        if (remaining > 0 && roth > 0) {
          rothW = Math.min(roth, remaining);
          remaining -= rothW;
        }

        ltcgAmount = annualRealizedLtcg + Math.round(taxableW * gainRatio);
        const earlyRothTaxable = age < 60 ? Math.max(0, rothW - rothBasis) : 0;
        const totalPreferentialIncome = ltcgAmount + qualifiedDividends;
        ssTaxable = taxableSSPortion(
          ssInc + spouseSsInc,
          taxableRmd + conv + pensionInc + tradW + investmentOrdinaryIncome + totalPreferentialIncome,
          filingStatusForYear,
        );

        const totalOrdinaryWithWithdrawals = taxableRmd + conv + tradW + earlyRothTaxable + ssTaxable + pensionInc + investmentOrdinaryIncome;
        rothPenaltyTax = Math.round(earlyRothTaxable * 0.10);
        federalTax = estimateTax(totalOrdinaryWithWithdrawals, filingStatusForYear, num65, inflFactor) + rothPenaltyTax;

        stateTax = estimateStateTax(totalOrdinaryWithWithdrawals + totalPreferentialIncome, params, filingStatusForYear);

        const stdDed = (STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor;
        const ordinaryTaxableIncome = Math.max(0, totalOrdinaryWithWithdrawals - stdDed);
        ltcgTax = estimateLtcgTax(totalPreferentialIncome, ordinaryTaxableIncome, filingStatusForYear, inflFactor);

        const stable =
          Math.abs(federalTax - prevFederalTax) <= 1 &&
          Math.abs(stateTax - prevStateTax) <= 1 &&
          Math.abs(ltcgTax - prevLtcgTax) <= 1 &&
          Math.abs(rothPenaltyTax - prevRothPenaltyTax) <= 1 &&
          Math.abs(tradW - prevTradW) <= 1 &&
          Math.abs(taxableW - prevTaxableW) <= 1 &&
          Math.abs(rothW - prevRothW) <= 1 &&
          Math.abs(hsaW - prevHsaW) <= 1;
        if (stable) break;
      }

      // Incremental tax attributable to the conversion
      if (conv > 0) {
        const ssTaxableNoConv = taxableSSPortion(
          ssInc + spouseSsInc,
          taxableRmd + pensionInc + tradW + investmentOrdinaryIncome + ltcgAmount + qualifiedDividends,
          filingStatusForYear,
        );
        const incomeNoConv = taxableRmd + tradW + ssTaxableNoConv + pensionInc + investmentOrdinaryIncome;
        const fedNoConv = estimateTax(incomeNoConv, filingStatusForYear, num65, inflFactor);
        const stateNoConv = estimateStateTax(incomeNoConv + ltcgAmount + qualifiedDividends, params, filingStatusForYear);
        const stdDedNoConv = (STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor;
        const ltcgTaxNoConv = estimateLtcgTax(
          ltcgAmount + qualifiedDividends,
          Math.max(0, incomeNoConv - stdDedNoConv),
          filingStatusForYear,
          inflFactor,
        );
        convTaxCalc = Math.max(0, federalTax + stateTax + ltcgTax - fedNoConv - stateNoConv - ltcgTaxNoConv);
      }

      // Update MAGI tracking (include LTCG in MAGI for next year's IRMAA)
      magi2YearsAgo = magi1YearAgo;
      magi1YearAgo = taxableRmd + conv + tradW + ssTaxable + investmentOrdinaryIncome + qualifiedDividends + ltcgAmount + pensionInc;

      // Update balances
      trad = Math.max(0, trad - rmd - conv - tradW);
      roth = Math.max(0, roth + conv - rothW);
      rothBasis = Math.max(0, rothBasis + conv - rothW);
      // Update basis proportionally to fraction of account sold
      if (taxable > 0) basis = Math.round(basis * Math.max(0, taxable - taxableW) / taxable);
      taxable = Math.max(0, taxable - taxableW);
      hsa = Math.max(0, hsa - hsaW);
      syncAllBucketsToTotals(scenario);
    }

    const portfolioValue = trad + roth + taxable + hsa;
    const salaryInRow = age < params.retireAge ? (params.salary ?? 0) : 0;
    const taxableRmdForRow = rmd - qcd;
    const ordinaryForTax = taxableRmdForRow + conv + tradW + ssTaxable + salaryInRow + pensionInc + investmentOrdinaryIncome;
    const mRate = marginalRate(ordinaryForTax, filingStatusForYear, num65, inflFactor);
    const grossIncome = taxableRmdForRow + conv + tradW + ssInc + spouseSsInc + investmentOrdinaryIncome + qualifiedDividends + ltcgAmount + salaryInRow + pensionInc;
    const ltcgTaxFinal = (age >= params.retireAge) ? (() => {
      // Re-derive ltcgTax for eRate calculation — already computed in distribution block
      // We need it in scope; use the value already captured in the closure via ltcgAmount
      if (ltcgAmount + qualifiedDividends <= 0) return 0;
      const stdDed = (STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor;
      const ordTaxable = Math.max(0, ordinaryForTax - stdDed);
      return estimateLtcgTax(ltcgAmount + qualifiedDividends, ordTaxable, filingStatusForYear, inflFactor);
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
      qcd,
      conv,
      tradW: Math.round(tradW),
      rothW: Math.round(rothW),
      taxableW: Math.round(taxableW),
      hsaW: Math.round(hsaW),
      ss: Math.round(ssInc),
      spouseSs: Math.round(spouseSsInc),
      pension: Math.round(pensionInc),
      ordinaryIncome: Math.round(taxableRmdForRow + conv + tradW + ssTaxable + salaryInRow + pensionInc + investmentOrdinaryIncome),
      qualifiedDividends: Math.round(qualifiedDividends),
      ltcg: Math.round(ltcgAmount),
      ssTaxable: Math.round(ssTaxable),
      standardDeduction: Math.round((STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor),
      taxableIncome: Math.round(Math.max(0, taxableRmdForRow + conv + tradW + ssTaxable + salaryInRow + pensionInc + investmentOrdinaryIncome - (STD_DEDUCTION[filingStatusForYear] + num65 * ADDITIONAL_STD_65[filingStatusForYear]) * inflFactor)),
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
