import type { InputParams, ProjectionRow } from './types';
import { runProjection, bracketHeadroom, stdDeductionHeadroom, taxableSSPortion, ssAt, spouseSsAt, taxInflFactor, countEligible65, estimateTax, estimateConfiguredStateTax } from './financial';

// ── Types ──────────────────────────────────────────────────────────────────

const BRACKET_NAMES = ['10%', '12%', '22%', '24%'] as const;
const BRACKET_RATES = [0.10, 0.12, 0.22, 0.24];

export interface ConversionStrategy {
  name: string;
  description: string;
  targetBracket: 0 | 1 | 2 | 3;
  maxAnnual: number;    // 0 = fill to bracket ceiling (no cap)
  untilAge: number;     // 0 = never convert
}

export interface StrategyResult {
  strategy: ConversionStrategy;
  rows: ProjectionRow[];
  schedule: Record<number, number>; // age → conversion amount
  lifetimeFederalTax: number;
  lifetimeStateTax: number;
  lifetimeIRMAA: number;
  lifetimeTotalTax: number;
  lifetimeTaxNPV: number;  // taxes discounted to today at nominal return rate
  terminalTrad: number;
  terminalRoth: number;
  terminalTotal: number;
  terminalAfterTax: number;
  peakMarginalRate: number;
  avgMarginalRate: number;
  marginalRateRange: number; // max − min across retirement years (smoothness metric)
}

export interface StartAgeMetric {
  bracket: 0 | 1 | 2 | 3;
  untilAge: number;
  lifetimeTotalTax: number;
  lifetimeIRMAA: number;
  peakMarginalRate: number;
  terminalTotal: number;
  savings: number;
  schedule: Record<number, number>;
  hasPreRetirementConv: boolean; // true if any conversion occurs before retireAge
}

export interface StartAgeResult {
  convStart: number;
  bestTax: StartAgeMetric;
  bestTerminal: StartAgeMetric;
  bestPeak: StartAgeMetric;
  bestIrmaa: StartAgeMetric;
}

export interface OptimizationOutput {
  strategies: StrategyResult[];
  best: StrategyResult;            // best by lifetime tax (backward compat alias for bestByTax)
  bestByTax: StrategyResult;       // minimize lifetime taxes
  bestByPortfolio: StrategyResult; // maximize terminal portfolio value
  bestByPeakRate: StrategyResult;  // minimize peak marginal rate (smoothest brackets)
  baseline: StrategyResult;        // no-conversion baseline
  currentSettings: StrategyResult; // what the sidebar is currently set to (reference only)
  savingsVsBaseline: number;
  savingsVsCurrent: number;
  recommendedSchedule: Record<number, number>;
  recommendedBracket: 0 | 1 | 2 | 3;
  recommendedUntilAge: number;
  recommendedAvgAnnual: number;
  startAgeAnalysis: StartAgeResult[];
}

// ── Build strategy grid (INDEPENDENT of user conversion settings) ──────────

function buildStrategies(convStart: number): ConversionStrategy[] {
  const untilAges = [62, 65, 70, 72];

  const strategies: ConversionStrategy[] = [
    {
      name: 'No conversions',
      description: 'Baseline — never convert. Let RMDs happen naturally.',
      targetBracket: 1,
      maxAnnual: 0,
      untilAge: 0,
    },
  ];

  for (let b = 0; b <= 3; b++) {
    for (const until of untilAges) {
      if (until < convStart) continue;
      strategies.push({
        name: `Fill ${BRACKET_NAMES[b]} bracket until age ${until}`,
        description: `Modeled conversions fill the ${BRACKET_NAMES[b]} bracket from age ${convStart} until age ${until}.`,
        targetBracket: b as 0 | 1 | 2 | 3,
        maxAnnual: 0,
        untilAge: until,
      });
    }
  }

  return strategies;
}

// ── Build per-year schedule from a strategy ────────────────────────────────

function buildSchedule(
  params: InputParams,
  strategy: ConversionStrategy,
  noConvBaseline: ProjectionRow[],
  convStart?: number,
): Record<number, number> {
  const schedule: Record<number, number> = {};

  // No-conversion strategy
  if (strategy.untilAge === 0) return schedule;

  const effectiveStart = convStart ?? params.age + 1;

  // Track trad balance as we build the schedule — conversions in earlier
  // years reduce available trad for later years
  const startRow = noConvBaseline.find(r => r.age === params.age);
  let remainingTrad = startRow?.trad ?? params.tradBal;

  for (let age = params.age + 1; age <= strategy.untilAge; age++) {
    const row = noConvBaseline.find(r => r.age === age);
    if (!row) continue;

    // Grow remaining trad by one year of returns
    remainingTrad *= (1 + params.r);

    // Before conversion start: grow balance but don't convert
    if (age < effectiveStart) {
      remainingTrad -= row.rmd;
      continue;
    }

    // Ordinary income before conversion (RMD + taxable SS + salary during working years)
    const ssInc = ssAt(params, age);
    const spouseSsInc = spouseSsAt(params, age);
    const rmd = row.rmd;
    const ssTaxableBefore = taxableSSPortion(ssInc + spouseSsInc, rmd, params.filingStatus);
    const annualSalary = age < params.retireAge ? (params.salary ?? 0) : 0;
    const ordinaryBefore = rmd + ssTaxableBefore + annualSalary;

    // Headroom to fill up to the target bracket
    const headroom = bracketHeadroom(ordinaryBefore, params.filingStatus, strategy.targetBracket, countEligible65(params, age), taxInflFactor(params, age));

    // Cap by max annual (0 = no cap beyond bracket ceiling)
    let amount = headroom;
    if (strategy.maxAnnual > 0) {
      amount = Math.min(amount, strategy.maxAnnual);
    }

    // Cap by remaining trad balance (after RMD)
    amount = Math.min(amount, Math.max(0, remainingTrad - rmd));

    if (amount > 0) {
      schedule[age] = Math.floor(amount);
      remainingTrad -= amount + rmd;
    } else {
      remainingTrad -= rmd;
    }
  }

  return schedule;
}

// ── Greedy per-year optimizer ──────────────────────────────────────────────
//
// For each year from retirement to 72, compare the current marginal rate
// against the expected future marginal rate on RMDs. Convert only when
// current rate < future rate, filling brackets up to the point where
// it still saves money.

function buildGreedySchedule(
  params: InputParams,
  noConvBaseline: ProjectionRow[],
  minConvStartAge: number,
): Record<number, number> {
  const schedule: Record<number, number> = {};
  const convEndAge = 72; // always go to max — independent of user settings

  // Track trad balance
  const startRow = noConvBaseline.find(r => r.age === params.age);
  let remainingTrad = startRow?.trad ?? params.tradBal;

  // Collect future RMD years for rate comparison
  const futureRmdRows = noConvBaseline.filter(r => r.age >= 73 && r.rmd > 0);
  if (futureRmdRows.length === 0) return schedule; // no RMDs → no benefit

  // Weighted average future marginal rate on RMDs
  const weightedSum = futureRmdRows.reduce((s, r) => s + r.marginalRate * r.rmd, 0);
  const totalRmd = futureRmdRows.reduce((s, r) => s + r.rmd, 0);
  const avgFutureRate = totalRmd > 0 ? weightedSum / totalRmd : 0;

  for (let age = params.age + 1; age <= convEndAge; age++) {
    const row = noConvBaseline.find(r => r.age === age);
    if (!row || remainingTrad <= 0) continue;

    remainingTrad *= (1 + params.r);

    if (age < minConvStartAge) {
      remainingTrad -= row.rmd;
      continue;
    }

    // Current marginal rate with no conversion at this age
    const currentRate = row.marginalRate;

    // Decide target bracket based on future vs current rates
    let targetBracket: 0 | 1 | 2 | 3;

    if (avgFutureRate <= 0.10 || currentRate >= avgFutureRate) {
      // Future rate lower or current rate already high — skip
      remainingTrad -= row.rmd;
      continue;
    }

    // Fill up to the bracket just below avgFutureRate
    if (avgFutureRate <= 0.12) {
      targetBracket = 0;
    } else if (avgFutureRate <= 0.22) {
      targetBracket = 1;
    } else if (avgFutureRate <= 0.24) {
      targetBracket = 2;
    } else {
      targetBracket = 3;
    }

    // Never fill above current rate — if current is 22%+, don't push into 24%
    if (BRACKET_RATES[targetBracket] > currentRate && currentRate >= 0.22) {
      targetBracket = 2; // cap at 22%
    }
    if (BRACKET_RATES[targetBracket] > currentRate && currentRate >= 0.24) {
      targetBracket = 1; // cap at 12%
    }

    const ssInc = ssAt(params, age);
    const spouseSsInc = spouseSsAt(params, age);
    const rmd = row.rmd;
    const ssTaxableBefore = taxableSSPortion(ssInc + spouseSsInc, rmd, params.filingStatus);
    const ordinaryBefore = rmd + ssTaxableBefore;
    const headroom = bracketHeadroom(ordinaryBefore, params.filingStatus, targetBracket, countEligible65(params, age), taxInflFactor(params, age));
    const amount = Math.min(headroom, Math.max(0, remainingTrad - rmd));

    if (amount > 0) {
      schedule[age] = Math.floor(amount);
      remainingTrad -= amount + rmd;
    } else {
      remainingTrad -= rmd;
    }
  }

  return schedule;
}

// ── Income smoother ───────────────────────────────────────────────────────
//
// Sweeps over candidate fixed annual conversion amounts and picks the one that
// minimizes lifetime taxes. This approach naturally handles the SS taxation
// interaction (more income → more SS taxable → possible bracket overflow) without
// needing to solve a feedback loop. The target bracket from the no-conv baseline
// caps the upper bound of the sweep range.

function buildFixedAnnualSchedule(
  params: InputParams,
  annualAmount: number,
  noConvBaseline: ProjectionRow[],
  minConvStartAge: number,
): Record<number, number> {
  const schedule: Record<number, number> = {};
  const startRow = noConvBaseline.find(r => r.age === params.age);
  let remainingTrad = startRow?.trad ?? params.tradBal;

  for (let age = params.age + 1; age <= 72; age++) {
    const row = noConvBaseline.find(r => r.age === age);
    if (!row || remainingTrad <= 0) continue;
    remainingTrad *= (1 + params.r);
    const rmd = row.rmd;
    if (age < minConvStartAge || (age < params.retireAge && (params.salary ?? 0) > 0)) {
      remainingTrad -= rmd;
      continue;
    }
    const amount = Math.min(annualAmount, Math.max(0, remainingTrad - rmd));
    if (amount > 100) {
      schedule[age] = Math.floor(amount);
      remainingTrad -= amount + rmd;
    } else {
      remainingTrad -= rmd;
    }
  }

  return schedule;
}

function buildSmootherSchedule(
  params: InputParams,
  noConvBaseline: ProjectionRow[],
  minConvStartAge: number,
): Record<number, number> {
  const rmdRows = noConvBaseline.filter(r => r.age >= 73 && r.rmd > 0);
  if (rmdRows.length === 0) return {};

  // RMD-weighted average marginal rate during RMD years (no conversions)
  const totalRmd = rmdRows.reduce((s, r) => s + r.rmd, 0);
  const weightedRate = rmdRows.reduce((s, r) => s + r.marginalRate * r.rmd, 0) / totalRmd;

  // Target bracket determines the upper bound of the annual sweep
  let targetBracket: 0 | 1 | 2 | 3;
  if (weightedRate <= 0.10) targetBracket = 0;
  else if (weightedRate <= 0.12) targetBracket = 1;
  else if (weightedRate <= 0.22) targetBracket = 2;
  else targetBracket = 3;

  // Upper bound: for bracket 0 (10% ceiling < std deduction), cap at the standard deduction
  // (free-conversion zone). For higher brackets, cap at the full bracket headroom.
  const startInflFactor = taxInflFactor(params, params.age + 1);
  const startNum65 = countEligible65(params, params.age + 1);
  const maxAmount = targetBracket === 0
    ? stdDeductionHeadroom(0, params.filingStatus, startNum65, startInflFactor)
    : bracketHeadroom(0, params.filingStatus, targetBracket, startNum65, startInflFactor);

  if (maxAmount <= 0) return {};

  // Sweep 10 candidate amounts and pick the one with minimum lifetime tax
  const N_STEPS = 10;
  let bestTax = Infinity;
  let bestSchedule: Record<number, number> = {};

  for (let i = 1; i <= N_STEPS; i++) {
    const annual = Math.round((i / N_STEPS) * maxAmount);
    const sched = buildFixedAnnualSchedule(params, annual, noConvBaseline, minConvStartAge);
    const result = evaluateSchedule(params, sched, {
      name: 'Income smoother (sweep)',
      description: '',
      targetBracket,
      maxAnnual: annual,
      untilAge: 72,
    });
    if (result.lifetimeTotalTax < bestTax) {
      bestTax = result.lifetimeTotalTax;
      bestSchedule = sched;
    }
  }

  return bestSchedule;
}

// ── Evaluate a schedule ────────────────────────────────────────────────────

function evaluateSchedule(
  params: InputParams,
  schedule: Record<number, number>,
  strategy: ConversionStrategy,
): StrategyResult {
  // When a schedule is provided, runProjection ignores the user's
  // rothConv/convUntil/targetConvBracket — it only uses the schedule.
  // So no need to zero out those params here.
  const rows = runProjection(params, params.r, schedule);
  const allRows = rows.slice(1); // skip y=0 initial state, count ALL years (pre- and post-retirement)
  const lastRow = rows[rows.length - 1];
  const terminalTradTax = lastRow
    ? estimateTax(lastRow.trad, params.filingStatus, countEligible65(params, lastRow.age), taxInflFactor(params, lastRow.age))
      + estimateConfiguredStateTax(lastRow.trad, params)
    : 0;
  const terminalAfterTax = lastRow
    ? Math.max(0, lastRow.trad - terminalTradTax) + lastRow.roth + lastRow.taxable + lastRow.hsa
    : 0;

  const lifetimeFederalTax = allRows.reduce((s, r) => s + r.federalTax, 0);
  const lifetimeStateTax = allRows.reduce((s, r) => s + r.stateTax, 0);
  const lifetimeIRMAA = allRows.reduce((s, r) => s + r.irmaaPartB + r.irmaaPartD, 0);
  const lifetimeTotalTax = allRows.reduce((s, r) => s + r.totalTax, 0);
  const lifetimeTaxNPV = allRows.reduce((s, r) => {
    const yearsOut = Math.max(0, r.age - params.age);
    return s + r.totalTax / Math.pow(1 + params.r, yearsOut);
  }, 0);

  const rates = allRows.map(r => r.marginalRate);
  const peakMarginalRate = rates.length ? Math.max(...rates) : 0;
  const minMarginalRate = rates.length ? Math.min(...rates) : 0;
  const avgMarginalRate = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  const marginalRateRange = peakMarginalRate - minMarginalRate;

  return {
    strategy,
    rows,
    schedule,
    lifetimeFederalTax,
    lifetimeStateTax,
    lifetimeIRMAA,
    lifetimeTotalTax,
    lifetimeTaxNPV,
    terminalTrad: lastRow?.trad ?? 0,
    terminalRoth: lastRow?.roth ?? 0,
    terminalTotal: lastRow?.total ?? 0,
    terminalAfterTax,
    peakMarginalRate,
    avgMarginalRate,
    marginalRateRange,
  };
}

// ── Evaluate "Your current settings" (uses sidebar's dynamic logic) ────────

function evaluateCurrentSettings(params: InputParams): StrategyResult {
  // This runs the full dynamic conversion logic from the sidebar,
  // using rothConv/convUntil/targetConvBracket as configured.
  const rows = runProjection(params, params.r);
  const allRows = rows.slice(1);
  const lastRow = rows[rows.length - 1];
  const terminalTradTax = lastRow
    ? estimateTax(lastRow.trad, params.filingStatus, countEligible65(params, lastRow.age), taxInflFactor(params, lastRow.age))
      + estimateConfiguredStateTax(lastRow.trad, params)
    : 0;
  const terminalAfterTax = lastRow
    ? Math.max(0, lastRow.trad - terminalTradTax) + lastRow.roth + lastRow.taxable + lastRow.hsa
    : 0;

  const lifetimeFederalTax = allRows.reduce((s, r) => s + r.federalTax, 0);
  const lifetimeStateTax = allRows.reduce((s, r) => s + r.stateTax, 0);
  const lifetimeIRMAA = allRows.reduce((s, r) => s + r.irmaaPartB + r.irmaaPartD, 0);
  const lifetimeTotalTax = allRows.reduce((s, r) => s + r.totalTax, 0);
  const lifetimeTaxNPV = allRows.reduce((s, r) => {
    const yearsOut = Math.max(0, r.age - params.age);
    return s + r.totalTax / Math.pow(1 + params.r, yearsOut);
  }, 0);

  const rates = allRows.map(r => r.marginalRate);
  const peakMarginalRate = rates.length ? Math.max(...rates) : 0;
  const minMarginalRate = rates.length ? Math.min(...rates) : 0;
  const avgMarginalRate = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : 0;
  const marginalRateRange = peakMarginalRate - minMarginalRate;

  const schedule = rows
    .filter(r => r.conv > 0)
    .reduce((m, r) => { m[r.age] = r.conv; return m; }, {} as Record<number, number>);

  const convStart = params.convStart ?? params.retireAge;
  return {
    strategy: {
      name: 'Your current settings',
      description: `Sidebar settings: ${BRACKET_NAMES[params.targetConvBracket]} bracket, max $${params.rothConv.toLocaleString()}/yr, from age ${convStart} until age ${params.convUntil}.`,
      targetBracket: params.targetConvBracket,
      maxAnnual: params.rothConv,
      untilAge: params.convUntil,
    },
    rows,
    schedule,
    lifetimeFederalTax,
    lifetimeStateTax,
    lifetimeIRMAA,
    lifetimeTotalTax,
    lifetimeTaxNPV,
    terminalTrad: lastRow?.trad ?? 0,
    terminalRoth: lastRow?.roth ?? 0,
    terminalTotal: lastRow?.total ?? 0,
    terminalAfterTax,
    peakMarginalRate,
    avgMarginalRate,
    marginalRateRange,
  };
}

// ── Main optimizer entry point ─────────────────────────────────────────────
//
// The optimizer is fully independent of sidebar conversion settings.
// It explores the strategy space (bracket × until-age) and tells you
// the lowest or highest modeled outcome for the selected comparison goal.

export function runOptimizer(params: InputParams, minConvStartAge?: number): OptimizationOutput {
  const effectiveMin = Math.max(params.age + 1, minConvStartAge ?? params.age + 1);

  // 1. Run TRUE no-conversion baseline (zero out user conversion settings)
  const noConvParams = { ...params, rothConv: 0, convUntil: 0, targetConvBracket: 0 as const };
  const noConvBaseline = runProjection(noConvParams, noConvParams.r);

  // 2. Build and evaluate all independent strategies
  const strategies = buildStrategies(effectiveMin);
  const results: StrategyResult[] = [];

  for (const strat of strategies) {
    const schedule = buildSchedule(params, strat, noConvBaseline, effectiveMin);
    results.push(evaluateSchedule(params, schedule, strat));
  }

  // 3. Add greedy optimizer (per-year dynamic)
  const greedySchedule = buildGreedySchedule(params, noConvBaseline, effectiveMin);
  const greedyBracket = Object.keys(greedySchedule).length > 0
    ? (noConvBaseline.filter(r => r.age >= 73 && r.rmd > 0).reduce((s, r) => s + r.marginalRate * r.rmd, 0)
      / noConvBaseline.filter(r => r.age >= 73 && r.rmd > 0).reduce((s, r) => s + r.rmd, 0) > 0.22 ? 2 : 1) as 0 | 1 | 2 | 3
    : 1;
  results.push(evaluateSchedule(params, greedySchedule, {
    name: 'Per-year optimizer',
    description: 'Year-by-year comparison: models conversions when the current marginal rate is below the expected future rate on RMDs.',
    targetBracket: greedyBracket,
    maxAnnual: 0,
    untilAge: 72,
  }));

  // 4. Add income smoother — single-pass against the no-conversion baseline.
  //    The target bracket is fixed from the baseline so it never drifts.
  const smootherSchedule = buildSmootherSchedule(params, noConvBaseline, effectiveMin);
  results.push(evaluateSchedule(params, smootherSchedule, {
    name: 'Income smoother',
    description: 'Models annual conversions to align projected RMD-year income and smooth marginal rates across retirement.',
    targetBracket: 2,
    maxAnnual: 0,
    untilAge: 72,
  }));

  // 5. Add "Your current settings" as a reference row (NOT eligible for "best")
  const currentResult = evaluateCurrentSettings(params);
  results.push(currentResult);

  // 6. Find best per goal — exclude "Your current settings" from competition
  const eligible = results.filter(r => r.strategy.name !== 'Your current settings');
  const bestByTax = [...eligible].sort((a, b) => a.lifetimeTotalTax - b.lifetimeTotalTax)[0];
  const bestByPortfolio = [...eligible].sort((a, b) => b.terminalAfterTax - a.terminalAfterTax)[0];

  // "Smooth brackets" uses the Income smoother because it was built for this goal.
  // Fall back to the lowest-peak grid strategy only if smoother somehow raises the peak rate.
  const smootherResult = eligible.find(r => r.strategy.name === 'Income smoother')!;
  const gridBestByPeak = [...eligible.filter(r => r.strategy.name !== 'Income smoother')]
    .sort((a, b) =>
      a.peakMarginalRate !== b.peakMarginalRate
        ? a.peakMarginalRate - b.peakMarginalRate
        : a.marginalRateRange !== b.marginalRateRange
          ? a.marginalRateRange - b.marginalRateRange
          : a.lifetimeTotalTax - b.lifetimeTotalTax
    )[0];
  const bestByPeakRate = smootherResult &&
    smootherResult.peakMarginalRate <= gridBestByPeak.peakMarginalRate
    ? smootherResult
    : gridBestByPeak;
  const best = bestByTax; // backward compat
  const baseline = results.find(r => r.strategy.name === 'No conversions')!;

  // 6. Derive schedule summary params from the lowest-tax schedule
  const scheduleValues = Object.values(best.schedule);
  const scheduleYears = Object.keys(best.schedule).map(Number);
  const avgAnnual = scheduleValues.length > 0
    ? Math.round(scheduleValues.reduce((a, b) => a + b, 0) / scheduleValues.length)
    : 0;
  const recommendedUntilAge = scheduleYears.length > 0 ? Math.max(...scheduleYears) : 0;

  // 7. Start age analysis — for each convStart, test all 4 brackets × 4 until-ages (16 combos)
  //    and independently track the best result for each metric.
  const startAgeAnalysis: StartAgeResult[] = [];
  const baselineTax = baseline.lifetimeTotalTax;
  const UNTIL_AGES = [62, 65, 70, 72];

  for (let startAge = effectiveMin; startAge <= 72; startAge++) {
    let bTax: StartAgeMetric | null = null;
    let bTerminal: StartAgeMetric | null = null;
    let bPeak: StartAgeMetric | null = null;
    let bIrmaa: StartAgeMetric | null = null;

    for (const until of UNTIL_AGES) {
      if (until < startAge) continue;
      for (let b = 0; b <= 3; b++) {
        const strat: ConversionStrategy = {
          name: '',
          description: '',
          targetBracket: b as 0 | 1 | 2 | 3,
          maxAnnual: 0,
          untilAge: until,
        };
        const sched = buildSchedule(params, strat, noConvBaseline, startAge);
        const res = evaluateSchedule(params, sched, strat);
        const m: StartAgeMetric = {
          bracket: b as 0 | 1 | 2 | 3,
          untilAge: until,
          lifetimeTotalTax: res.lifetimeTotalTax,
          lifetimeIRMAA: res.lifetimeIRMAA,
          peakMarginalRate: res.peakMarginalRate,
          terminalTotal: res.terminalTotal,
          savings: baselineTax - res.lifetimeTotalTax,
          schedule: sched,
          hasPreRetirementConv: Object.keys(sched).some(a => Number(a) < params.retireAge),
        };
        if (!bTax || m.lifetimeTotalTax < bTax.lifetimeTotalTax) bTax = m;
        if (!bTerminal || m.terminalTotal > bTerminal.terminalTotal) bTerminal = m;
        if (!bPeak || m.peakMarginalRate < bPeak.peakMarginalRate ||
            (m.peakMarginalRate === bPeak.peakMarginalRate && m.lifetimeTotalTax < bPeak.lifetimeTotalTax)) bPeak = m;
        if (!bIrmaa || m.lifetimeIRMAA < bIrmaa.lifetimeIRMAA ||
            (m.lifetimeIRMAA === bIrmaa.lifetimeIRMAA && m.lifetimeTotalTax < bIrmaa.lifetimeTotalTax)) bIrmaa = m;
      }
    }
    if (!bTax || !bTerminal || !bPeak || !bIrmaa) continue;
    // Skip pre-retirement start ages where salary fills all brackets (no room for early conversions)
    if (startAge < params.retireAge && ![bTax, bTerminal, bPeak, bIrmaa].some(m => m.hasPreRetirementConv)) continue;
    if (bTax.savings <= 0 && startAgeAnalysis.length > 0) break;
    startAgeAnalysis.push({
      convStart: startAge,
      bestTax: bTax,
      bestTerminal: bTerminal,
      bestPeak: bPeak,
      bestIrmaa: bIrmaa,
    });
  }

  return {
    strategies: results,
    best,
    bestByTax,
    bestByPortfolio,
    bestByPeakRate,
    baseline,
    currentSettings: currentResult,
    savingsVsBaseline: baseline.lifetimeTotalTax - best.lifetimeTotalTax,
    savingsVsCurrent: currentResult.lifetimeTotalTax - best.lifetimeTotalTax,
    recommendedSchedule: best.schedule,
    recommendedBracket: best.strategy.targetBracket,
    recommendedUntilAge,
    recommendedAvgAnnual: avgAnnual,
    startAgeAnalysis,
  };
}
