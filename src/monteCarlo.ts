import { effectiveSpouseAge, runProjection } from './financial';
import { HISTORICAL_RETURNS } from './historicalReturns';
import type { InputParams, ProjectionRow, ScenarioYear } from './types';

export interface MonteCarloOptions {
  method?: 'parametric' | 'historical';
  runs?: number;
  seed?: string;
  portfolioStdDev?: number;
  taxableStdDev?: number;
  hsaStdDev?: number;
  inflationStdDev?: number;
  expenseInflationStdDev?: number;
  healthcareInflationStdDev?: number;
  taxableCorrelation?: number;
  hsaCorrelation?: number;
  returnInflationCorrelation?: number;
  bearMarketProbability?: number;
  bearMarketReturnDrag?: number;
  bearMarketInflationShock?: number;
  spendingShockProbability?: number;
  spendingShockPct?: number;
  stockAllocation?: number;
  bondAllocation?: number;
  cashAllocation?: number;
  blockSize?: number;
  healthcareInflationSpread?: number;
  volatilityMultiplier?: number;
}

export interface MonteCarloResult {
  successRates: number[];
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  labels: number[];
  finalSuccessRate: number;
  seed: string;
  runs: number;
  assumptions: Required<MonteCarloOptions>;
}

export const DEFAULT_MONTE_CARLO_OPTIONS: Required<MonteCarloOptions> = {
  method: 'parametric',
  runs: 1000,
  seed: 'retirement-planner',
  portfolioStdDev: 0.16,
  taxableStdDev: 0.14,
  hsaStdDev: 0.14,
  inflationStdDev: 0.018,
  expenseInflationStdDev: 0.016,
  healthcareInflationStdDev: 0.024,
  taxableCorrelation: 0.85,
  hsaCorrelation: 0.90,
  returnInflationCorrelation: -0.30,
  bearMarketProbability: 0.08,
  bearMarketReturnDrag: -0.18,
  bearMarketInflationShock: 0.01,
  spendingShockProbability: 0.05,
  spendingShockPct: 0.25,
  stockAllocation: 0.70,
  bondAllocation: 0.25,
  cashAllocation: 0.05,
  blockSize: 3,
  healthcareInflationSpread: 0.025,
  volatilityMultiplier: 1,
};

function normalizeOptions(options: MonteCarloOptions = {}): Required<MonteCarloOptions> {
  const merged = { ...DEFAULT_MONTE_CARLO_OPTIONS, ...options };
  const stock = Math.max(0, merged.stockAllocation);
  const bond = Math.max(0, merged.bondAllocation);
  const cash = Math.max(0, merged.cashAllocation);
  const total = stock + bond + cash;
  const normalized = total <= 0
    ? {
        stockAllocation: DEFAULT_MONTE_CARLO_OPTIONS.stockAllocation,
        bondAllocation: DEFAULT_MONTE_CARLO_OPTIONS.bondAllocation,
        cashAllocation: DEFAULT_MONTE_CARLO_OPTIONS.cashAllocation,
      }
    : {
        stockAllocation: stock / total,
        bondAllocation: bond / total,
        cashAllocation: cash / total,
      };
  const stats = historicalPortfolioStats(normalized);
  return {
    ...merged,
    ...normalized,
    portfolioStdDev: options.portfolioStdDev ?? stats.stdDev * merged.volatilityMultiplier,
    taxableStdDev: options.taxableStdDev ?? stats.stdDev * merged.volatilityMultiplier,
    hsaStdDev: options.hsaStdDev ?? stats.stdDev * merged.volatilityMultiplier,
  };
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: () => number): number {
  const u1 = Math.max(Number.EPSILON, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function correlatedShock(primary: number, independent: number, rho: number): number {
  const bounded = Math.max(-0.99, Math.min(0.99, rho));
  return bounded * primary + Math.sqrt(1 - bounded * bounded) * independent;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function historicalPortfolioStats(allocation: { stockAllocation: number; bondAllocation: number; cashAllocation: number }): { arithmeticReturn: number; geometricReturn: number; stdDev: number } {
  const returns = HISTORICAL_RETURNS.map(year =>
    year.stock * allocation.stockAllocation +
    year.bond * allocation.bondAllocation +
    year.cash * allocation.cashAllocation,
  );
  const arithmeticReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const geometricReturn = Math.exp(returns.reduce((sum, r) => sum + Math.log(1 + r), 0) / returns.length) - 1;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - arithmeticReturn, 2), 0) / Math.max(1, returns.length - 1);
  return { arithmeticReturn, geometricReturn, stdDev: Math.sqrt(variance) };
}

function annualSpendingBase(inputs: InputParams): number {
  if (inputs.expenseItems && inputs.expenseItems.length > 0) {
    return inputs.expenseItems
      .filter(item => !item.isOneTime)
      .reduce((sum, item) => sum + item.monthly * 12, 0);
  }
  return (inputs.expenses + inputs.healthcareExpenses + inputs.discretionaryExpenses + inputs.ltcExpenses) * 12;
}

function normalizedAllocation(opts: Required<MonteCarloOptions>): { stock: number; bond: number; cash: number } {
  return {
    stock: opts.stockAllocation,
    bond: opts.bondAllocation,
    cash: opts.cashAllocation,
  };
}

function blendedHistoricalReturn(
  year: (typeof HISTORICAL_RETURNS)[number],
  allocation: { stock: number; bond: number; cash: number },
): number {
  return year.stock * allocation.stock + year.bond * allocation.bond + year.cash * allocation.cash;
}

export function buildHistoricalScenarioPath(
  inputs: InputParams,
  options: MonteCarloOptions = {},
  rng: () => number = makeRng(normalizeOptions(options).seed),
): ScenarioYear[] {
  const opts = normalizeOptions(options);
  const allocation = normalizedAllocation(opts);
  const spouseAge = effectiveSpouseAge(inputs);
  const endAge = Math.max(
    inputs.lifeExp,
    (inputs.spouseLifeExp && spouseAge !== undefined)
      ? inputs.age + (inputs.spouseLifeExp - spouseAge)
      : inputs.lifeExp,
  );
  const path: ScenarioYear[] = [];
  const shockBase = annualSpendingBase(inputs);
  const blockSize = Math.max(1, Math.round(opts.blockSize));
  const sampledYears: typeof HISTORICAL_RETURNS = [];

  while (sampledYears.length < endAge - inputs.age) {
    const maxStart = Math.max(0, HISTORICAL_RETURNS.length - blockSize);
    const start = Math.floor(rng() * (maxStart + 1));
    sampledYears.push(...HISTORICAL_RETURNS.slice(start, start + blockSize));
  }

  for (let i = 0; i < endAge - inputs.age; i++) {
    const age = inputs.age + i + 1;
    const historicalYear = sampledYears[i];
    const portfolioReturn = clamp(blendedHistoricalReturn(historicalYear, allocation), -0.55, 0.55);
    const inflation = clamp(historicalYear.inflation, -0.05, 0.15);
    const healthcareInflation = clamp(inflation + opts.healthcareInflationSpread, 0, 0.18);
    const expenseInflation = clamp(inflation, 0, 0.15);
    const spendingShock = rng() < opts.spendingShockProbability
      ? Math.round(shockBase * opts.spendingShockPct * (0.5 + rng()))
      : 0;

    path.push({
      age,
      portfolioReturn,
      taxableReturn: portfolioReturn,
      hsaReturn: portfolioReturn,
      inflation,
      expenseInflation,
      healthcareInflation,
      ssCOLA: Math.max(0, inflation),
      spendingShock,
    });
  }

  return path;
}

export function buildScenarioPath(
  inputs: InputParams,
  options: MonteCarloOptions = {},
  rng: () => number = makeRng(normalizeOptions(options).seed),
): ScenarioYear[] {
  const opts = normalizeOptions(options);
  const spouseAge = effectiveSpouseAge(inputs);
  const endAge = Math.max(
    inputs.lifeExp,
    (inputs.spouseLifeExp && spouseAge !== undefined)
      ? inputs.age + (inputs.spouseLifeExp - spouseAge)
      : inputs.lifeExp,
  );
  const path: ScenarioYear[] = [];
  const shockBase = annualSpendingBase(inputs);
  for (let age = inputs.age + 1; age <= endAge; age++) {
    const marketShock = normal(rng);
    const inflationShock = correlatedShock(marketShock, normal(rng), opts.returnInflationCorrelation);
    const taxableShock = correlatedShock(marketShock, normal(rng), opts.taxableCorrelation);
    const hsaShock = correlatedShock(marketShock, normal(rng), opts.hsaCorrelation);
    const bearScale = rng() < opts.bearMarketProbability ? 0.6 + rng() * 0.8 : 0;
    const bearDrag = opts.bearMarketReturnDrag * bearScale;
    const bearInflation = opts.bearMarketInflationShock * bearScale;
    const expectedBearScale = opts.bearMarketProbability;
    const portfolioBearOffset = -opts.bearMarketReturnDrag * expectedBearScale;
    const taxableBearOffset = -opts.bearMarketReturnDrag * 0.85 * expectedBearScale;
    const hsaBearOffset = -opts.bearMarketReturnDrag * 0.90 * expectedBearScale;
    const inflationBearOffset = -opts.bearMarketInflationShock * expectedBearScale;

    const portfolioReturn = clamp(inputs.r + portfolioBearOffset + marketShock * opts.portfolioStdDev + bearDrag, -0.55, 0.45);
    const taxableReturn = clamp(inputs.taxableReturn + taxableBearOffset + taxableShock * opts.taxableStdDev + bearDrag * 0.85, -0.55, 0.45);
    const hsaReturn = clamp(inputs.hsaReturn + hsaBearOffset + hsaShock * opts.hsaStdDev + bearDrag * 0.90, -0.55, 0.45);
    const inflation = clamp(inputs.inf + inflationBearOffset + inflationShock * opts.inflationStdDev + bearInflation, 0, 0.12);
    const healthcareInflation = clamp(
      inputs.healthcareInflationRate + inflationBearOffset + inflationShock * opts.healthcareInflationStdDev + bearInflation,
      0,
      0.16,
    );
    const expenseInflation = clamp(
      inputs.expenseInflationRate + inflationBearOffset * 0.75 + inflationShock * opts.expenseInflationStdDev + bearInflation * 0.75,
      0,
      0.12,
    );
    const spendingShock = rng() < opts.spendingShockProbability
      ? Math.round(shockBase * opts.spendingShockPct * (0.5 + rng()))
      : 0;
    path.push({
      age,
      portfolioReturn,
      taxableReturn,
      hsaReturn,
      inflation,
      expenseInflation,
      healthcareInflation,
      ssCOLA: inflation,
      spendingShock,
    });
  }
  return path;
}

const percentile = (arr: number[], p: number): number => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.ceil(p * s.length) - 1))];
};

export function runMonteCarlo(
  inputs: InputParams,
  conversionSchedule: Record<number, number> | null | undefined,
  runsOrOptions: number | MonteCarloOptions = DEFAULT_MONTE_CARLO_OPTIONS.runs,
): MonteCarloResult {
  const options = typeof runsOrOptions === 'number'
    ? normalizeOptions({ runs: runsOrOptions })
    : normalizeOptions(runsOrOptions);
  const rng = makeRng(options.seed);
  const runs = options.runs;
  const baseRows = runProjection(inputs, inputs.r, conversionSchedule ?? undefined).slice(1);
  const labels = baseRows.map(r => r.age);
  const balsByYear: number[][] = Array.from({ length: labels.length }, () => []);

  for (let sim = 0; sim < runs; sim++) {
    const scenarioPath = options.method === 'historical'
      ? buildHistoricalScenarioPath(inputs, options, rng)
      : buildScenarioPath(inputs, options, rng);
    const rows: ProjectionRow[] = runProjection(inputs, {
      returnRate: inputs.r,
      conversionSchedule: conversionSchedule ?? undefined,
      scenarioPath,
    }).slice(1);

    for (let i = 0; i < labels.length; i++) {
      balsByYear[i].push(rows[i]?.total ?? 0);
    }
  }

  const successRates = balsByYear.map(ys => Math.round((ys.filter(v => v > 0).length / runs) * 100));
  return {
    labels,
    seed: options.seed,
    runs,
    assumptions: options,
    successRates,
    percentiles: {
      p10: balsByYear.map(ys => percentile(ys, 0.10)),
      p25: balsByYear.map(ys => percentile(ys, 0.25)),
      p50: balsByYear.map(ys => percentile(ys, 0.50)),
      p75: balsByYear.map(ys => percentile(ys, 0.75)),
      p90: balsByYear.map(ys => percentile(ys, 0.90)),
    },
    finalSuccessRate: successRates[successRates.length - 1] ?? 0,
  };
}
