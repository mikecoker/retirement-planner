import React, { useState } from 'react';
import type { InputParams, ProjectionRow, Account, PlannerPage } from '../types';
import { DEFAULT_MONTE_CARLO_OPTIONS, type MonteCarloOptions, runMonteCarlo } from '../monteCarlo';
import { spouseSsAt, ssAt } from '../financial';
import { ExpenseTab } from './ExpenseTab';
import { AccountsTab } from './AccountsTab';
import Sidebar from './Sidebar';
import TipLabel from './TipLabel';
import { CUSTOM_STATE_TAX_PRESET, getStateTaxPreset, STATE_TAX_PRESETS } from '../stateTaxPresets';
import { Chart as ChartJS, type ChartData, type ChartOptions } from 'chart.js';
import {
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  BarElement,
  ArcElement,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, BarElement, ArcElement, Filler,
);

interface MainProps {
  inputs: InputParams;
  activeTab: PlannerPage;
  rows: ProjectionRow[];
  metrics: { m1: string; m2: string; m3: string; m4: string; m5: string };
  optimization: import('../optimizer').OptimizationOutput | null;
  optTimestamp: number;
  conversionSchedule: Record<number, number> | null;
  onApplySchedule: (schedule: Record<number, number>) => void;
  onClearSchedule: () => void;
  onInputChange: (field: keyof InputParams, value: string | number | boolean) => void;
  onExpenseItemsChange: (items: import('../types').ExpenseItem[]) => void;
  onAccountsChange: (accounts: Account[]) => void;
  optMinStartAge: number;
  setOptMinStartAge: (age: number) => void;
  mcRuns: number;
  setMcRuns: (runs: number) => void;
  mcSeed: string;
  setMcSeed: (seed: string) => void;
  mcPreset: MonteCarloPreset;
  setMcPreset: (preset: MonteCarloPreset) => void;
  mcMethod: MonteCarloMethod;
  setMcMethod: (method: MonteCarloMethod) => void;
  mcStockAllocation: number;
  setMcStockAllocation: (allocation: number) => void;
  mcBondAllocation: number;
  setMcBondAllocation: (allocation: number) => void;
  mcCashAllocation: number;
  setMcCashAllocation: (allocation: number) => void;
  mcBlockSize: number;
  setMcBlockSize: (blockSize: number) => void;
  getMonteCarloOptions: (
    preset: MonteCarloPreset,
    runs: number,
    seed: string,
    method: MonteCarloMethod,
    stockAllocation: number,
    bondAllocation: number,
    cashAllocation: number,
    blockSize: number,
  ) => MonteCarloOptions;
  dollarMode: DollarMode;
}

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'K';
  return sign + '$' + Math.round(abs);
};

const pct = (n: number): string => (n * 100).toFixed(1) + '%';
const CHART_TICK = '#8D99A6';
const CHART_GRID = 'rgba(141,153,166,0.16)';

type OptimizerGoal = 'tax' | 'portfolio' | 'peakrate' | 'greedy';
type MonteCarloPreset = 'base' | 'stress';
type MonteCarloMethod = 'parametric' | 'historical';
type DollarMode = 'nominal' | 'today';

const CollapsibleTableSection: React.FC<{
  id: string;
  title: string;
  meta?: string;
  children: React.ReactNode;
}> = ({ id, title, meta, children }) => {
  const storageKey = `vault.table.${id}.open`;
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(storageKey) === 'true';
  });
  const toggleOpen = () => {
    setIsOpen(open => {
      const next = !open;
      window.localStorage.setItem(storageKey, String(next));
      return next;
    });
  };

  return (
    <section className={`collapsible-table${isOpen ? ' open' : ''}`}>
      <button
        type="button"
        className="collapsible-table-header"
        onClick={toggleOpen}
        aria-expanded={isOpen}
      >
        <span className="collapsible-table-left">
          <span className="collapsible-table-chevron" aria-hidden="true" />
          <span className="collapsible-table-title">{title}</span>
          {meta && <span className="collapsible-table-meta">{meta}</span>}
        </span>
        <span className="collapsible-table-action">{isOpen ? 'Hide' : 'Show'}</span>
      </button>
      {isOpen && (
        <div className="optimizer-table-wrap collapsible-table-body">
          {children}
        </div>
      )}
    </section>
  );
};

const Main: React.FC<MainProps> = ({
  inputs,
  activeTab,
  rows,
  metrics,
  optimization,
  optTimestamp,
  conversionSchedule,
  onApplySchedule,
  onClearSchedule,
  onInputChange,
  onExpenseItemsChange,
  onAccountsChange,
  optMinStartAge,
  setOptMinStartAge,
  mcRuns,
  setMcRuns,
  mcSeed,
  setMcSeed,
  mcPreset,
  setMcPreset,
  mcMethod,
  setMcMethod,
  mcStockAllocation,
  setMcStockAllocation,
  mcBondAllocation,
  setMcBondAllocation,
  mcCashAllocation,
  setMcCashAllocation,
  mcBlockSize,
  setMcBlockSize,
  getMonteCarloOptions,
  dollarMode,
}) => {
  const [optimizerGoal, setOptimizerGoal] = useState<OptimizerGoal>('tax');
  const [numberDrafts, setNumberDrafts] = useState<Record<string, string>>({});
  const allRows = rows.slice(1); // all years from current age onward (skip y=0 initial state)
  const getSalary = (r: ProjectionRow) => r.age < inputs.retireAge ? (inputs.salary ?? 0) : 0;
  const pageSection = (['about', 'social', 'conversions', 'accounts', 'expenses'] as PlannerPage[]).includes(activeTab)
    ? 'Setup'
    : (['optimizer', 'mc'] as PlannerPage[]).includes(activeTab)
      ? 'Tools'
      : 'Results';
  const pageTitles: Record<PlannerPage, string> = {
    about: 'About You',
    social: 'Social Security',
    conversions: 'Roth Conversions',
    accounts: 'Accounts',
    expenses: 'Expenses',
    balance: 'Balances',
    income: 'Income',
    rmd: 'RMDs & Conversions',
    tax: 'Tax Analysis',
    cashflow: 'Cash Flow',
    optimizer: 'Roth Optimizer',
    mc: 'Monte Carlo',
  };
  const yearsUntilRetirement = Math.max(0, inputs.retireAge - inputs.age);
  const horizonEndAge = Math.max(
    inputs.lifeExp,
    inputs.spouseAge !== undefined && inputs.spouseLifeExp !== undefined
      ? inputs.age + (inputs.spouseLifeExp - inputs.spouseAge)
      : inputs.lifeExp,
  );
  const yearsInRetirement = Math.max(0, horizonEndAge - inputs.retireAge);
  const projectionAgeRange = rows.length > 0
    ? `age ${rows[0].age}-${rows[rows.length - 1].age}`
    : undefined;
  const resultAgeRange = allRows.length > 0
    ? `age ${allRows[0].age}-${allRows[allRows.length - 1].age}`
    : projectionAgeRange;
  const primarySsMonthly = Math.round(ssAt(inputs, inputs.ssAge) / 12);
  const scheduledPrimarySsMonthly = inputs.ss;
  const ssBenefitFactor = inputs.ssBenefitFactor ?? 1;
  const spouseClaimAge = inputs.spouseSsAge ?? 67;
  const spouseClaimPrimaryAge = inputs.spouseAge !== undefined
    ? inputs.age + Math.max(0, spouseClaimAge - inputs.spouseAge)
    : inputs.age;
  const spouseSsAnnualAtClaim = inputs.filingStatus === 'married'
    ? spouseSsAt(inputs, Math.max(spouseClaimPrimaryAge, inputs.ssAge))
    : 0;
  const spouseSsMonthly = Math.round(spouseSsAnnualAtClaim / 12);
  const totalSsMonthly = primarySsMonthly + spouseSsMonthly;
  const selectedStateTaxPreset = getStateTaxPreset(inputs.stateTaxPreset);
  const displayAtAge = (value: number, age: number): number =>
    dollarMode === 'today'
      ? value / Math.pow(1 + inputs.inf, Math.max(0, age - inputs.age))
      : value;
  const displayFmt = (value: number, age: number): string => fmt(displayAtAge(value, age));
  const dollarModeLabel = dollarMode === 'today' ? "Today's dollars" : 'Future dollars';
  const DollarModeNote = () => (
    <div className="dollar-mode-note">
      Showing <strong>{dollarModeLabel}</strong>
      {dollarMode === 'today'
        ? `, discounted at ${(inputs.inf * 100).toFixed(2)}% from age ${inputs.age}.`
        : '. Projected values include inflation and growth assumptions.'}
    </div>
  );
  const conversionRows = conversionSchedule
    ? Object.entries(conversionSchedule)
      .map(([age, amount]) => ({ age: Number(age), amount }))
      .sort((a, b) => a.age - b.age)
    : [];
  const manualConversionStart = inputs.convStart ?? inputs.retireAge;
  const manualConversionEnd = inputs.convUntil;
  const conversionStartAge = conversionRows.length > 0 ? conversionRows[0].age : manualConversionStart;
  const conversionEndAge = conversionRows.length > 0 ? conversionRows[conversionRows.length - 1].age : manualConversionEnd;
  const conversionYears = conversionRows.length > 0
    ? conversionRows.length
    : Math.max(0, conversionEndAge - conversionStartAge + 1);
  const conversionMaxAnnual = conversionRows.length > 0
    ? Math.max(...conversionRows.map(r => r.amount))
    : inputs.rothConv;
  const conversionTotal = conversionRows.length > 0
    ? conversionRows.reduce((sum, row) => sum + row.amount, 0)
    : conversionMaxAnnual * conversionYears;
  const handleRmdNumberChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, Number((e.target as HTMLInputElement).value) || 0);
  };
  const handleRmdRangeChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, Number((e.target as HTMLInputElement).value));
  };
  const handleTaxNumberChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, Number((e.target as HTMLInputElement).value) || 0);
  };
  const handleTaxRateChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, Number((e.target as HTMLInputElement).value) / 100);
  };
  const updatePercentDraft = (key: keyof InputParams, raw: string) => {
    setNumberDrafts(prev => ({ ...prev, [key]: raw }));
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const value = Number(raw);
    if (Number.isFinite(value)) onInputChange(key, value / 100);
  };
  const updateInputDraft = (key: string, raw: string, onValid: (value: number) => void) => {
    setNumberDrafts(prev => ({ ...prev, [key]: raw }));
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const value = Number(raw);
    if (Number.isFinite(value)) onValid(value);
  };
  const finishNumberDraft = (key: string) => {
    setNumberDrafts(prev => {
      const { [key]: _discard, ...rest } = prev;
      return rest;
    });
  };

  // Rows past the primary's life expectancy are spouse-only survivor years
  const survivorRowStyle = (r: ProjectionRow, base?: React.CSSProperties): React.CSSProperties => {
    if (r.age <= inputs.lifeExp) return base ?? {};
    return {
      ...(base ?? {}),
      ...(r.age === inputs.lifeExp + 1 ? { borderTop: '2px dashed currentColor' } : {}),
    };
  };
  const survivorRowClassName = (r: ProjectionRow): string | undefined =>
    r.age > inputs.lifeExp ? 'survivor-row' : undefined;
  const SurvivorTag = ({ age }: { age: number }) =>
    age === inputs.lifeExp + 1 && inputs.spouseAge !== undefined
      ? <span style={{ marginLeft: 5, fontSize: 9, color: '#aaa', fontWeight: 600 }}>SPOUSE</span>
      : null;

  // ----- Balance Chart -----
  const balanceData = (): ChartData<'line', number[], string> => ({
    labels: rows.map(r => String(r.age)),
    datasets: [
      { label: 'Traditional', data: rows.map(r => displayAtAge(r.trad, r.age)), borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'Roth', data: rows.map(r => displayAtAge(r.roth, r.age)), borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'Taxable', data: rows.map(r => displayAtAge(r.taxable, r.age)), borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.06)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'HSA', data: rows.map(r => displayAtAge(r.hsa, r.age)), borderColor: '#F39C12', backgroundColor: 'rgba(243,156,18,0.06)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'Total', data: rows.map(r => displayAtAge(r.total, r.age)), borderColor: '#888780', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.4, borderWidth: 1.5, borderDash: [4, 3] },
    ],
  });

  // ----- Income Chart (stacked bar) -----
  const incomeData = (): ChartData<'bar', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'Salary', data: allRows.map(r => displayAtAge(getSalary(r), r.age)), backgroundColor: '#2ECC71', stack: 'income', type: 'bar' as const },
      { label: 'RMD', data: allRows.map(r => displayAtAge(r.rmd, r.age)), backgroundColor: '#BA7517', stack: 'income', type: 'bar' as const },
      { label: 'Conversion', data: allRows.map(r => displayAtAge(r.conv, r.age)), backgroundColor: '#378ADD', stack: 'income', type: 'bar' as const },
      { label: 'Traditional IRA withdrawal', data: allRows.map(r => displayAtAge(r.tradW, r.age)), backgroundColor: '#5DADE2', stack: 'income', type: 'bar' as const },
      { label: 'Roth IRA withdrawal', data: allRows.map(r => displayAtAge(r.rothW, r.age)), backgroundColor: '#1D9E75', stack: 'income', type: 'bar' as const },
      { label: 'Taxable account withdrawal', data: allRows.map(r => displayAtAge(r.taxableW, r.age)), backgroundColor: '#9B59B6', stack: 'income', type: 'bar' as const },
      { label: 'HSA withdrawal', data: allRows.map(r => displayAtAge(r.hsaW, r.age)), backgroundColor: '#F39C12', stack: 'income', type: 'bar' as const },
      { label: 'SS (primary)', data: allRows.map(r => displayAtAge(r.ss, r.age)), backgroundColor: '#9FE1CB', stack: 'income', type: 'bar' as const },
      { label: 'SS (spouse)', data: allRows.map(r => displayAtAge(r.spouseSs, r.age)), backgroundColor: '#76D7C4', stack: 'income', type: 'bar' as const },
      { label: 'Pension/Annuity', data: allRows.map(r => displayAtAge(r.pension, r.age)), backgroundColor: '#8E44AD', stack: 'income', type: 'bar' as const },
      { label: 'Taxes', data: allRows.map(r => -displayAtAge(r.totalTax, r.age)), backgroundColor: '#F09595', stack: 'tax', type: 'bar' as const },
      { label: 'Expenses', data: allRows.map(r => displayAtAge(r.totalSpending, r.age)), type: 'line' as const, borderColor: '#D85A30', backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, borderWidth: 2, order: 0 },
    ] as any,
  });

  // ----- RMD Chart -----
  const rmdData = (): ChartData<'bar', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'RMD required', data: allRows.map(r => displayAtAge(r.rmd, r.age)), backgroundColor: '#BA7517', stack: 'a', type: 'bar' },
      { label: 'Roth conversion', data: allRows.map(r => displayAtAge(r.conv, r.age)), backgroundColor: '#378ADD', stack: 'a', type: 'bar' },
    ],
  });

  // ----- Tax Chart (marginal + effective rate) -----
  const taxRateData = (): ChartData<'line', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'Marginal rate', data: allRows.map(r => r.marginalRate * 100), borderColor: '#E74C3C', backgroundColor: 'rgba(231,76,60,0.08)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'Effective rate', data: allRows.map(r => r.effectiveRate * 100), borderColor: '#3498DB', backgroundColor: 'rgba(52,152,219,0.08)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
    ],
  });

  const taxDollarData = (): ChartData<'line', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'Federal tax', data: allRows.map(r => displayAtAge(r.federalTax, r.age)), borderColor: '#E67E22', backgroundColor: 'rgba(230,126,34,0.07)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'State tax', data: allRows.map(r => displayAtAge(r.stateTax, r.age)), borderColor: '#27AE60', backgroundColor: 'rgba(39,174,96,0.07)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'IRMAA (B+D)', data: allRows.map(r => displayAtAge(r.irmaaPartB + r.irmaaPartD, r.age)), borderColor: '#8E44AD', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2, borderDash: [4, 3] },
    ],
  });

  // ----- Cashflow Chart -----
  const cashflowData = (): ChartData<'bar', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'Total income', data: allRows.map(r => displayAtAge(getSalary(r) + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW + r.ss + r.spouseSs + r.pension, r.age)), backgroundColor: '#27AE60', stack: 'cf', type: 'bar' as const },
      { label: 'Total spending', data: allRows.map(r => -displayAtAge(r.totalSpending, r.age)), backgroundColor: '#E74C3C', stack: 'cf', type: 'bar' as const },
      { label: 'Total tax', data: allRows.map(r => -displayAtAge(r.totalTax, r.age)), backgroundColor: '#F09595', stack: 'cf', type: 'bar' as const },
    ] as any,
  });

  // Monte Carlo is computed inline in the tab render to keep all data in one place.

  // ----- Chart Options -----
  const rateOpts = (): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
      axis: 'x',
    },
    hover: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label || ''}: ${ctx.parsed.y.toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: { ticks: { color: CHART_TICK, maxTicksLimit: 10, font: { size: 11 } }, grid: { display: false } },
      y: { min: 0, ticks: { color: CHART_TICK, callback: (v: number | string) => Number(v).toFixed(0) + '%', font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: CHART_GRID } },
    },
  } as any);

  const baseOpts = (stacked = false, yMin?: number, yMax?: number): ChartOptions<'bar' | 'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: {
      mode: 'index',
      intersect: false,
      axis: 'x',
    },
    hover: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: (ctx: any) => {
            let l = ctx.dataset.label || '';
            if (l) l += ': ';
            if (activeTab === 'mc') {
              l += ctx.parsed.y + '%';
            } else {
              l += fmt(ctx.parsed.y);
            }
            return l;
          },
        },
      },
    },
    scales: {
      x: { stacked, ticks: { color: CHART_TICK, maxTicksLimit: 10, font: { size: 11 } }, grid: { display: false } },
      y: { stacked, min: yMin, max: yMax, ticks: { color: CHART_TICK, callback: (v: number | string) => fmt(Number(v)), font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: CHART_GRID } },
    },
  } as any);

  // ----- RMD/SS interaction detail panel -----
  const renderRMDDetail = () => {
    const rmdRows = allRows.filter(r => r.rmd > 0 || r.conv > 0 || r.ss > 0);
    if (rmdRows.length === 0) return <div className="note">No RMD/SS data yet for this scenario.</div>;

    const firstRmd = rmdRows.find(r => r.rmd > 0);
    const peakRmd = rmdRows.reduce(
      (mx, r) => displayAtAge(r.rmd, r.age) > displayAtAge(mx.rmd, mx.age) ? r : mx,
      rmdRows[0]
    );
    const peakConv = rmdRows.reduce(
      (mx, r) => displayAtAge(r.conv, r.age) > displayAtAge(mx.conv, mx.age) ? r : mx,
      rmdRows[0]
    );

    return (
      <div className="detail-panel">
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">First RMD age</div>
            <div className="detail-value">{firstRmd?.age ?? '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">First RMD amount</div>
            <div className="detail-value">{firstRmd ? displayFmt(firstRmd.rmd, firstRmd.age) : '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Peak RMD age</div>
            <div className="detail-value">{peakRmd.age}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Peak RMD amount</div>
            <div className="detail-value">{displayFmt(peakRmd.rmd, peakRmd.age)}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Peak conversion</div>
            <div className="detail-value">{peakConv.conv > 0 ? displayFmt(peakConv.conv, peakConv.age) + ' (age ' + peakConv.age + ')' : 'None'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Total conversions</div>
            <div className="detail-value">{fmt(rmdRows.reduce((s, r) => s + displayAtAge(r.conv, r.age), 0))}</div>
          </div>
        </div>

        <div className="detail-section-title">RMD impact on Social Security taxation</div>
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">Provisional income at first RMD</div>
            <div className="detail-value">{firstRmd ? displayFmt(firstRmd.rmd + firstRmd.conv + (firstRmd.ss + firstRmd.spouseSs) * 0.5, firstRmd.age) : '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Taxable SS at first RMD</div>
            <div className="detail-value">{firstRmd ? displayFmt(firstRmd.ssTaxable, firstRmd.age) : '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Marginal rate at first RMD</div>
            <div className="detail-value">{firstRmd ? pct(firstRmd.marginalRate) : '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Marginal rate at peak RMD</div>
            <div className="detail-value">{pct(peakRmd.marginalRate)}</div>
          </div>
        </div>
        <div className="note">
          Provisional income = AGI + nontaxable interest + 50% of SS. SS becomes 50% taxable above ${inputs.filingStatus === 'married' ? '32K' : '25K'} and 85% taxable above ${inputs.filingStatus === 'married' ? '44K' : '34K'}.
        </div>

        {(() => {
          const convRows = allRows.filter(r => r.conv > 0);
          if (convRows.length === 0) return null;

          const totalConverted = convRows.reduce((s, r) => s + displayAtAge(r.conv, r.age), 0);
          const totalConvTax = convRows.reduce((s, r) => s + displayAtAge(r.convTax, r.age), 0);
          const shortfallRows = convRows.filter(r => r.tradW > 0);
          const hasShortfall = shortfallRows.length > 0;
          const convAgeRange = convRows.length > 0
            ? `age ${convRows[0].age}-${convRows[convRows.length - 1].age}`
            : undefined;

          return (
            <CollapsibleTableSection id="rmd-conversion-tax" title="Conversion tax cost" meta={convAgeRange}>
              <div className="rmd-tax-cost-summary">
                <div>
                  <div className="detail-label">Total converted</div>
                  <div className="detail-value">{fmt(totalConverted)}</div>
                </div>
                <div>
                  <div className="detail-label">Tax on conversions</div>
                  <div className="detail-value">{fmt(totalConvTax)}</div>
                </div>
                <div>
                  <div className="detail-label">Average conversion rate</div>
                  <div className="detail-value">
                    {totalConverted > 0 ? pct(totalConvTax / totalConverted) : '—'}
                  </div>
                </div>
              </div>

              {/* Year-by-year conversion tax table */}
              <div className="optimizer-table-wrap rmd-conversion-tax-table">
                <table className="optimizer-table opt-schedule-table">
                  <thead>
                    <tr>
                      <th>Age</th>
                      <th>Conversion</th>
                      <th>Tax on conversion</th>
                      <th>Total tax that year</th>
                      <th>Effective conv rate</th>
                      <th>Taxable account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convRows.map(r => (
                      <tr key={r.age} className={survivorRowClassName(r)} style={survivorRowStyle(r, r.tradW > 0 ? { background: '#FFF5F5' } : undefined)}>
                        <td>{r.age}<SurvivorTag age={r.age} /></td>
                        <td>{displayFmt(r.conv, r.age)}</td>
                        <td>{displayFmt(r.convTax, r.age)}</td>
                        <td>{displayFmt(r.totalTax, r.age)}</td>
                        <td>{r.conv > 0 ? pct(r.convTax / r.conv) : '—'}</td>
                        <td style={r.tradW > 0 ? { color: '#C0392B', fontWeight: 600 } : undefined}>
                          {displayFmt(r.taxable, r.age)}{r.tradW > 0 ? ' ⚠' : ''}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 600, borderTop: '2px solid #ddd' }}>
                      <td>Total</td>
                      <td>{fmt(totalConverted)}</td>
                      <td>{fmt(totalConvTax)}</td>
                      <td>—</td>
                      <td>{totalConverted > 0 ? pct(totalConvTax / totalConverted) : '—'}</td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {hasShortfall ? (
                <div className="note rmd-tax-cost-note warning">
                  <strong>Warning:</strong> In {shortfallRows.length} conversion year{shortfallRows.length > 1 ? 's' : ''} (age{shortfallRows.length > 1 ? 's' : ''} {shortfallRows.map(r => r.age).join(', ')}),
                  the taxable account ran short and additional traditional IRA withdrawals were needed to cover expenses and taxes (highlighted above).
                  Those extra withdrawals are themselves taxable income — the true tax cost in those years is understated.
                  Consider increasing your taxable account balance or reducing conversion amounts.
                </div>
              ) : (
                <div className="note rmd-tax-cost-note info">
                  Conversion taxes are modeled as paid from your taxable account. The taxable account remained solvent throughout the conversion period.
                </div>
              )}
            </CollapsibleTableSection>
          );
        })()}
      </div>
    );
  };

  return (
    <div className="main">
      <div className="page-heading">
        <div className="page-kicker">{pageSection}</div>
        <div className="page-title">{pageTitles[activeTab]}</div>
      </div>
      <div className="metrics">
        <div className="metric-card">
          <div className="mlabel">Total at retirement</div>
          <div className="mval">{metrics.m1}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">Net worth at longevity</div>
          <div className="mval">{metrics.m4}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">Lifetime taxes</div>
          <div className="mval">{metrics.m2}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">Peak RMD</div>
          <div className="mval">{metrics.m3}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">MC success rate</div>
          <div className="mval">{metrics.m5}</div>
        </div>
      </div>

      {activeTab === 'about' && (
        <div className="setup-grid">
          <div className="chart-card setup-card">
            <Sidebar
              inputs={inputs}
              onInputChange={onInputChange}
              conversionSchedule={conversionSchedule}
              onClearSchedule={onClearSchedule}
              page="about"
            />
          </div>
          <div className="chart-card horizon-card">
            <div className="chart-title">Your horizon</div>
            <div className="horizon-stat">
              <div className="detail-label">Years until retirement</div>
              <div><span className="horizon-number accent">{yearsUntilRetirement}</span><span className="horizon-unit"> yrs</span></div>
            </div>
            <div className="horizon-divider" />
            <div className="horizon-stat">
              <div className="detail-label">Years in retirement</div>
              <div><span className="horizon-number">{yearsInRetirement}</span><span className="horizon-unit"> yrs</span></div>
            </div>
            <div className="horizon-track" aria-hidden="true">
              <span style={{ flexGrow: Math.max(1, yearsUntilRetirement) }} />
              <span style={{ flexGrow: Math.max(1, yearsInRetirement) }} />
            </div>
            <div className="note">
              Retiring at <strong>{inputs.retireAge}</strong>, planning through <strong>{horizonEndAge}</strong>, filing <strong>{inputs.filingStatus === 'married' ? 'jointly' : 'single'}</strong>.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'social' && (
        <div className="social-grid">
          <div className="chart-card setup-card">
            <Sidebar
              inputs={inputs}
              onInputChange={onInputChange}
              conversionSchedule={conversionSchedule}
              onClearSchedule={onClearSchedule}
              page="social"
            />
          </div>
          <div className="chart-card ss-glance-card">
            <div className="chart-title">Benefits at a glance</div>
            <div className="ss-total">
              <span>{fmt(totalSsMonthly * 12)}</span>
              <span> / yr</span>
            </div>
            <div className="note" style={{ marginTop: 0 }}>
              {fmt(totalSsMonthly)} / month at the chosen claim ages
              {ssBenefitFactor < 1 ? ` (${Math.round(ssBenefitFactor * 100)}% of scheduled benefits)` : ''}
            </div>
            <div className="ss-benefit-list">
              <div className="ss-benefit-row">
                <span className="ss-dot primary" />
                <span>You · claim {inputs.ssAge}</span>
                <strong>{fmt(primarySsMonthly)}/mo</strong>
              </div>
              {ssBenefitFactor < 1 && scheduledPrimarySsMonthly > 0 && (
                <div className="ss-benefit-row muted">
                  <span />
                  <span>Scheduled benefit</span>
                  <strong>{fmt(scheduledPrimarySsMonthly)}/mo</strong>
                </div>
              )}
              {inputs.filingStatus === 'married' && (
                <div className="ss-benefit-row">
                  <span className="ss-dot spouse" />
                  <span>Spouse · claim {spouseClaimAge}</span>
                  <strong>{fmt(spouseSsMonthly)}/mo</strong>
                </div>
              )}
            </div>
            <div className="horizon-divider" />
            <div className="note">
              COLA of <strong>{((inputs.ssCOLA ?? 0.025) * 100).toFixed(2)}%</strong> is applied each year after benefits begin.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'conversions' && (
        <div className="conversion-grid">
          <div>
            <div className="chart-card setup-card">
              <Sidebar
                inputs={inputs}
                onInputChange={onInputChange}
                conversionSchedule={conversionSchedule}
                onClearSchedule={onClearSchedule}
                page="conversions"
              />
            </div>
            <div className="callout conversion-callout">
              Converting traditional balances to Roth before RMDs begin fills lower brackets early and shrinks future required distributions. See <strong>Roth Optimizer</strong> to compare strategies, or set a manual schedule here.
            </div>
          </div>
          <div className="chart-card conversion-window-card">
            <div className="chart-title">Conversion window</div>
            <div className="ss-total">
              <span>{fmt(conversionTotal)}</span>
            </div>
            <div className="note" style={{ marginTop: 0 }}>
              {conversionSchedule ? 'scheduled conversions' : `max converted over ${conversionYears} year${conversionYears === 1 ? '' : 's'}`}
            </div>
            <div className="window-list">
              <div className="window-row">
                <span>From age</span>
                <strong>{conversionYears > 0 ? conversionStartAge : '—'}</strong>
              </div>
              <div className="window-row">
                <span>Until age</span>
                <strong>{conversionYears > 0 ? conversionEndAge : '—'}</strong>
              </div>
              <div className="window-row">
                <span>Max / year</span>
                <strong>{conversionMaxAnnual > 0 ? fmt(conversionMaxAnnual) : '—'}</strong>
              </div>
              {conversionSchedule && (
                <div className="window-row">
                  <span>Mode</span>
                  <strong>Optimizer</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'balance' && (
        <div className="chart-card">
          <div className="chart-title">Portfolio balances over time</div>
          <DollarModeNote />
          <div className="legend">
            <span className="li"><span className="ls" style={{ background: '#378ADD' }}></span>Traditional</span>
            <span className="li"><span className="ls" style={{ background: '#1D9E75' }}></span>Roth</span>
            <span className="li"><span className="ls" style={{ background: '#9B59B6' }}></span>Taxable</span>
            <span className="li"><span className="ls" style={{ background: '#F39C12' }}></span>HSA</span>
            <span className="li"><span className="ls" style={{ background: '#888780', opacity: 0.6 }}></span>Total</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <Line data={balanceData()} options={baseOpts()} />
          </div>

          <CollapsibleTableSection id="balances" title="Year-by-year balances" meta={projectionAgeRange}>
            <table className="optimizer-table opt-schedule-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Traditional IRA</th>
                  <th>Roth IRA</th>
                  <th>Taxable</th>
                  <th>HSA</th>
                  <th>Total</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const prev = rows[i - 1];
                  const change = prev ? r.total - prev.total : null;
                  return (
                    <tr key={r.age} className={survivorRowClassName(r)} style={survivorRowStyle(r, r.age === inputs.retireAge ? { borderTop: '2px solid #378ADD' } : undefined)}>
                      <td>
                        {r.age}
                        {r.age === inputs.retireAge && <span style={{ marginLeft: 6, fontSize: 10, color: '#378ADD', fontWeight: 600 }}>RETIRE</span>}
                        <SurvivorTag age={r.age} />
                      </td>
                      <td>{displayFmt(r.trad, r.age)}</td>
                      <td>{displayFmt(r.roth, r.age)}</td>
                      <td>{displayFmt(r.taxable, r.age)}</td>
                      <td>{displayFmt(r.hsa, r.age)}</td>
                      <td style={{ fontWeight: 600 }}>{displayFmt(r.total, r.age)}</td>
                      <td style={{ color: change === null ? undefined : change >= 0 ? '#1D9E75' : '#C0392B' }}>
                        {change === null ? '—' : (change >= 0 ? '+' : '') + displayFmt(change, r.age)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleTableSection>
        </div>
      )}

      {activeTab === 'income' && (
        <div className="chart-card">
          <div className="chart-title">Annual income sources vs expenses</div>
          <DollarModeNote />
          <div className="legend">
            <span className="li"><span className="ls" style={{ background: '#2ECC71' }}></span>Salary</span>
            <span className="li"><span className="ls" style={{ background: '#BA7517' }}></span>RMD</span>
            <span className="li"><span className="ls" style={{ background: '#378ADD' }}></span>Conversion</span>
            <span className="li"><span className="ls" style={{ background: '#5DADE2' }}></span>Traditional IRA withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#1D9E75' }}></span>Roth IRA withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#9B59B6' }}></span>Taxable account withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#F39C12' }}></span>HSA withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#9FE1CB' }}></span>SS (primary)</span>
            <span className="li"><span className="ls" style={{ background: '#76D7C4' }}></span>SS (spouse)</span>
            <span className="li"><span className="ls" style={{ background: '#8E44AD' }}></span>Pension/Annuity</span>
            <span className="li"><span className="ls" style={{ background: '#F09595' }}></span>Taxes</span>
            <span className="li"><span className="ls" style={{ background: '#D85A30', height: '3px', borderRadius: 0, width: '14px' }}></span>Expenses</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <Bar data={incomeData()} options={baseOpts(true)} />
          </div>

          {/* Year-by-year income & spending breakdown */}
          <CollapsibleTableSection id="income" title="Annual income & spending detail" meta={resultAgeRange}>
            <table className="optimizer-table opt-schedule-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Salary</th>
                  <th>Social Security</th>
                  <th>Pension/Annuity</th>
                  <th>RMD</th>
                  <th>Roth Conversion</th>
                  <th>Traditional IRA</th>
                  <th>Roth IRA</th>
                  <th>Taxable Acct</th>
                  <th>HSA</th>
                  <th>Total Income</th>
                  <th>Spending</th>
                  <th>Taxes</th>
                  <th>Net</th>
                  <th title="Non-conversion income minus spending and non-conversion taxes — true cash available for living expenses">Net Spendable</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => {
                  const salary = getSalary(r);
                  const totalIn = salary + r.ss + r.spouseSs + r.pension + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW;
                  const net = totalIn - r.totalSpending - r.totalTax;
                  const netSpendable = totalIn - r.conv - r.totalSpending - (r.totalTax - r.convTax);
                  return (
                    <tr key={r.age} className={survivorRowClassName(r)} style={survivorRowStyle(r, netSpendable < -2000 ? { background: '#FFF5F5' } : undefined)}>
                      <td>{r.age}<SurvivorTag age={r.age} /></td>
                      <td>{salary > 0 ? displayFmt(salary, r.age) : '—'}</td>
                      <td>{r.ss + r.spouseSs > 0 ? displayFmt(r.ss + r.spouseSs, r.age) : '—'}</td>
                      <td>{r.pension > 0 ? displayFmt(r.pension, r.age) : '—'}</td>
                      <td>{r.rmd > 0 ? displayFmt(r.rmd, r.age) : '—'}</td>
                      <td>{r.conv > 0 ? displayFmt(r.conv, r.age) : '—'}</td>
                      <td>{r.tradW > 0 ? displayFmt(r.tradW, r.age) : '—'}</td>
                      <td>{r.rothW > 0 ? displayFmt(r.rothW, r.age) : '—'}</td>
                      <td>{r.taxableW > 0 ? displayFmt(r.taxableW, r.age) : '—'}</td>
                      <td>{r.hsaW > 0 ? displayFmt(r.hsaW, r.age) : '—'}</td>
                      <td style={{ fontWeight: 500 }}>{displayFmt(totalIn, r.age)}</td>
                      <td>{displayFmt(r.totalSpending, r.age)}</td>
                      <td>{displayFmt(r.totalTax, r.age)}</td>
                      <td style={{ color: net < -500 ? '#C0392B' : net > 500 ? '#1D9E75' : undefined }}>
                        {net >= 0 ? '+' : ''}{displayFmt(net, r.age)}
                      </td>
                      <td style={{ color: netSpendable < -2000 ? '#C0392B' : netSpendable > 500 ? '#1D9E75' : undefined, fontWeight: 500 }}>
                        {netSpendable >= 0 ? '+' : ''}{displayFmt(netSpendable, r.age)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleTableSection>
          <div className="note">
            <strong>Net Spendable</strong> = Total In − Roth Conversion − Spending − Taxes. This is actual cash flow: conversions are trad→Roth transfers, not money you can spend.
            <strong> Net</strong> includes conversions as income (for tax accounting). A negative Net Spendable means the portfolio couldn't fully cover real expenses that year.
          </div>
        </div>
      )}

      {activeTab === 'rmd' && (() => {
        const rmdRows = allRows.filter(r => r.rmd > 0 || r.qcd > 0 || r.conv > 0);
        const firstRmd = allRows.find(r => r.rmd > 0);
        const peakRmd = allRows.reduce((mx, r) => r.rmd > mx.rmd ? r : mx, allRows[0]);
        const peakConv = allRows.reduce((mx, r) => r.conv > mx.conv ? r : mx, allRows[0]);
        const tableRows = rmdRows.length > 0 ? rmdRows : allRows.filter((_, i) => i % 5 === 0);

        return (
          <div className="chart-card">
            <div className="chart-title">RMDs and Roth conversions</div>
            <DollarModeNote />
            <div className="rmd-layout">
              <div className="rmd-main-panel">
                <div className="rmd-summary">
                  <div>
                    <div className="detail-label">RMDs begin</div>
                    <div className="rmd-summary-value">{firstRmd ? `age ${firstRmd.age}` : 'None'}</div>
                  </div>
                  <div>
                    <div className="detail-label">Peak RMD</div>
                    <div className="rmd-summary-value accent">{peakRmd?.rmd > 0 ? `${fmt(peakRmd.rmd)}/yr` : 'None'}</div>
                  </div>
                  <div>
                    <div className="detail-label">At age</div>
                    <div className="rmd-summary-value">{peakRmd?.rmd > 0 ? peakRmd.age : '—'}</div>
                  </div>
                  <div>
                    <div className="detail-label">Peak conversion</div>
                    <div className="rmd-summary-value">{peakConv?.conv > 0 ? fmt(peakConv.conv) : 'None'}</div>
                  </div>
                </div>
                <div className="legend">
                  <span className="li"><span className="ls" style={{ background: '#BA7517' }}></span>RMD required</span>
                  <span className="li"><span className="ls" style={{ background: '#378ADD' }}></span>Roth conversion</span>
                </div>
                <div style={{ position: 'relative', width: '100%', height: '300px' }}>
                  <Bar data={rmdData()} options={baseOpts(true)} />
                </div>
              </div>

              <div className="rmd-side-panel">
                <div className="rmd-options-card">
                  <div className="chart-title">RMD options</div>
                  <div className="field">
                    <TipLabel text="Annual QCD ($)" />
                    <input
                      type="number"
                      value={inputs.qcdAnnual}
                      step={1000}
                      onInput={(e) => handleRmdNumberChange('qcdAnnual', e)}
                    />
                  </div>
                  {inputs.qcdAnnual > 0 && (
                    <div className="field">
                      <TipLabel text="QCD start age" />
                      <div className="range-row">
                        <input
                          type="range"
                          min={70}
                          max={100}
                          value={inputs.qcdStartAge}
                          step={1}
                          onInput={(e) => {
                            finishNumberDraft('qcdStartAge');
                            handleRmdRangeChange('qcdStartAge', e);
                          }}
                        />
                        <div className="range-number-wrap">
                          <input
                            className="range-number"
                            type="number"
                            min={70}
                            max={100}
                            step={1}
                            value={numberDrafts.qcdStartAge ?? String(inputs.qcdStartAge)}
                            onInput={(e) => updateInputDraft('qcdStartAge', (e.target as HTMLInputElement).value, value => onInputChange('qcdStartAge', Math.max(70, Math.min(100, value))))}
                            onBlur={() => finishNumberDraft('qcdStartAge')}
                            aria-label="QCD start age value"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {inputs.useJointLifeRmd && (
                    <div className="note" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                      Joint life RMD estimate is enabled from About You.
                    </div>
                  )}
                </div>

                <div className="rmd-options-card">
                  <div className="chart-title">By year</div>
                  <div className="optimizer-table-wrap rmd-year-table">
                    <table className="optimizer-table opt-schedule-table">
                      <thead>
                        <tr>
                          <th>Age</th>
                          <th>RMD</th>
                          <th>QCD</th>
                          <th>Conversion</th>
                          <th>Trad. left</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map(r => (
                          <tr key={r.age} className={survivorRowClassName(r)} style={survivorRowStyle(r)}>
                            <td>{r.age}<SurvivorTag age={r.age} /></td>
                            <td>{r.rmd > 0 ? displayFmt(r.rmd, r.age) : '—'}</td>
                            <td>{r.qcd > 0 ? displayFmt(r.qcd, r.age) : '—'}</td>
                            <td>{r.conv > 0 ? displayFmt(r.conv, r.age) : '—'}</td>
                            <td>{displayFmt(r.trad, r.age)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
            {renderRMDDetail()}
          </div>
        );
      })()}

      {activeTab === 'tax' && (
        <div className="chart-card">
          <div className="chart-title">Tax analysis over retirement</div>
          <DollarModeNote />

          <div className="tax-layout">
            <div className="tax-main-panel">
              <div className="chart-subtitle" style={{ marginTop: 0 }}>Tax rates over time</div>
              <div className="tax-summary">
                <div>
                  <div className="detail-label">Lifetime taxes</div>
                  <div className="rmd-summary-value">{fmt(allRows.reduce((s, r) => s + displayAtAge(r.totalTax, r.age), 0))}</div>
                </div>
                <div>
                  <div className="detail-label">Peak marginal rate</div>
                  <div className="rmd-summary-value accent">{pct(Math.max(...allRows.map(r => r.marginalRate)))}</div>
                </div>
                <div>
                  <div className="detail-label">Avg effective</div>
                  <div className="rmd-summary-value">{pct(allRows.reduce((s, r) => s + r.effectiveRate, 0) / Math.max(1, allRows.length))}</div>
                </div>
              </div>
              <div className="legend">
                <span className="li"><span className="ls" style={{ background: '#E74C3C' }}></span>Marginal rate</span>
                <span className="li"><span className="ls" style={{ background: '#3498DB' }}></span>Effective rate</span>
              </div>
              <div style={{ position: 'relative', width: '100%', height: '240px' }}>
                <Line data={taxRateData()} options={rateOpts()} />
              </div>

              <div className="chart-subtitle" style={{ marginTop: '1rem' }}>Tax amounts</div>
              <div className="legend">
                <span className="li"><span className="ls" style={{ background: '#E67E22' }}></span>Federal tax</span>
                <span className="li"><span className="ls" style={{ background: '#27AE60' }}></span>State tax</span>
                <span className="li"><span className="ls" style={{ background: '#8E44AD', height: '3px', borderRadius: 0, width: '14px' }}></span>IRMAA (B+D)</span>
              </div>
              <div style={{ position: 'relative', width: '100%', height: '180px' }}>
                <Line data={taxDollarData()} options={baseOpts()} />
              </div>
              <div className="detail-panel">
                <div className="detail-grid">
                  <div className="detail-item">
                    <div className="detail-label">Federal tax</div>
                    <div className="detail-value">{fmt(allRows.reduce((s, r) => s + displayAtAge(r.federalTax, r.age), 0))}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">State tax</div>
                    <div className="detail-value">{fmt(allRows.reduce((s, r) => s + displayAtAge(r.stateTax, r.age), 0))}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">IRMAA (Part B + D)</div>
                    <div className="detail-value">{fmt(allRows.reduce((s, r) => s + displayAtAge(r.irmaaPartB + r.irmaaPartD, r.age), 0))}</div>
                  </div>
                  <div className="detail-item">
                    <div className="detail-label">Avg taxable SS %</div>
                    <div className="detail-value">
                      {(() => {
                        const withSS = allRows.filter(r => r.ss > 0);
                        if (withSS.length === 0) return 'N/A';
                        return pct(withSS.reduce((s, r) => s + r.ssTaxable / Math.max(1, r.ss + r.spouseSs), 0) / withSS.length);
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="tax-settings-panel">
              <div className="chart-title">Tax settings</div>
              <div className="tax-toggle-row">
                <div>
                  <TipLabel text="Include IRMAA surcharges" />
                  <div className="detail-label">Medicare premium surcharge on higher incomes</div>
                </div>
                <input
                  type="checkbox"
                  checked={inputs.includeIRMAA}
                  onChange={(e) => onInputChange('includeIRMAA', (e.target as HTMLInputElement).checked)}
                />
              </div>
              <div className="tax-toggle-row">
                <div>
                  <TipLabel text="Include Medicare base premiums" />
                  <div className="detail-label">Part B from age 65</div>
                </div>
                <input
                  type="checkbox"
                  checked={inputs.includeMedicarePremiums}
                  onChange={(e) => onInputChange('includeMedicarePremiums', (e.target as HTMLInputElement).checked)}
                />
              </div>
              <div className="tax-toggle-row">
                <div>
                  <TipLabel text="Include ACA premiums/credits" />
                  <div className="detail-label">Pre-Medicare health coverage</div>
                </div>
                <input
                  type="checkbox"
                  checked={inputs.includeAcaPremiumCredits}
                  onChange={(e) => onInputChange('includeAcaPremiumCredits', (e.target as HTMLInputElement).checked)}
                />
              </div>
              {inputs.includeAcaPremiumCredits && (
                <div className="two-col">
                  <div className="field">
                    <TipLabel text="ACA premium ($/mo)" />
                    <input
                      type="number"
                      value={inputs.acaMonthlyPremium}
                      step={50}
                      onInput={(e) => handleTaxNumberChange('acaMonthlyPremium', e)}
                    />
                  </div>
                  <div className="field">
                    <TipLabel text="ACA credit ($/mo)" />
                    <input
                      type="number"
                      value={inputs.acaMonthlyCredit}
                      step={50}
                      onInput={(e) => handleTaxNumberChange('acaMonthlyCredit', e)}
                    />
                  </div>
                </div>
              )}
              <div className="tax-toggle-row">
                <div>
                  <TipLabel text="Include state tax" />
                  <div className="detail-label">State income tax estimate</div>
                </div>
                <input
                  type="checkbox"
                  checked={inputs.includeStateTax}
                  onChange={(e) => onInputChange('includeStateTax', (e.target as HTMLInputElement).checked)}
                />
              </div>
              {inputs.includeStateTax && (
                <>
                  <div className="field">
                    <TipLabel text="State tax preset" />
                    <select
                      value={inputs.stateTaxPreset ?? CUSTOM_STATE_TAX_PRESET}
                      onChange={(e) => onInputChange('stateTaxPreset', e.target.value)}
                    >
                      <option value={CUSTOM_STATE_TAX_PRESET}>Custom rate / brackets</option>
                      {STATE_TAX_PRESETS.map(p => (
                        <option key={p.code} value={p.code}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  {selectedStateTaxPreset && (
                    <div className="note">
                      <strong>{selectedStateTaxPreset.name}</strong> preset: {selectedStateTaxPreset.confidence} estimate, tax year {selectedStateTaxPreset.taxYear}, rates pulled {selectedStateTaxPreset.ratesAsOf}. {selectedStateTaxPreset.notes}
                    </div>
                  )}
                  <div className="field">
                    <TipLabel text="Additional local tax (%)" />
                    <div className="range-row">
                      <input
                        type="range"
                        min={0}
                        max={5}
                        value={(inputs.stateLocalTaxRate ?? 0) * 100}
                        step={0.25}
                        onInput={(e) => {
                          finishNumberDraft('stateLocalTaxRate');
                          handleTaxRateChange('stateLocalTaxRate', e);
                        }}
                      />
                      <div className="range-number-wrap">
                        <input
                          className="range-number"
                          type="number"
                          min={0}
                          max={5}
                          step={0.25}
                          value={numberDrafts.stateLocalTaxRate ?? String(Number(((inputs.stateLocalTaxRate ?? 0) * 100).toFixed(2)))}
                          onInput={(e) => updatePercentDraft('stateLocalTaxRate', (e.target as HTMLInputElement).value)}
                          onBlur={() => finishNumberDraft('stateLocalTaxRate')}
                          aria-label="Additional local tax value"
                        />
                        <span className="range-number-suffix">%</span>
                      </div>
                    </div>
                  </div>
                  {!selectedStateTaxPreset && (
                    <>
                      <div className="field">
                        <TipLabel text="State tax rate (%)" />
                        <div className="range-row">
                          <input
                            type="range"
                            min={0}
                            max={13}
                            value={inputs.stateTaxRate * 100}
                            step={0.25}
                            onInput={(e) => {
                              finishNumberDraft('stateTaxRate');
                              handleTaxRateChange('stateTaxRate', e);
                            }}
                          />
                          <div className="range-number-wrap">
                            <input
                              className="range-number"
                              type="number"
                              min={0}
                              max={13}
                              step={0.25}
                              value={numberDrafts.stateTaxRate ?? String(Number((inputs.stateTaxRate * 100).toFixed(2)))}
                              onInput={(e) => updatePercentDraft('stateTaxRate', (e.target as HTMLInputElement).value)}
                              onBlur={() => finishNumberDraft('stateTaxRate')}
                              aria-label="State tax rate value"
                            />
                            <span className="range-number-suffix">%</span>
                          </div>
                        </div>
                      </div>
                      <div className="field">
                        <TipLabel text="State tax brackets JSON" />
                        <textarea
                          value={inputs.stateTaxBrackets ?? ''}
                          placeholder="[[10000,0.01],[50000,0.03],[null,0.05]]"
                          style={{ width: '100%', minHeight: 54, fontSize: 11, fontFamily: 'monospace', padding: '4px 6px', border: '1px solid #ccc', borderRadius: 6 }}
                          onInput={(e) => onInputChange('stateTaxBrackets', (e.target as HTMLTextAreaElement).value || undefined as any)}
                        />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <CollapsibleTableSection id="tax" title="Year-by-year tax detail" meta={resultAgeRange}>
            <table className="optimizer-table opt-schedule-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Ordinary Income</th>
                  <th>Std Deduction</th>
                  <th>Taxable Income</th>
                  <th>Federal Tax</th>
                  <th>State Tax</th>
                  <th>IRMAA</th>
                  <th>Total Tax</th>
                  <th>Marginal Rate</th>
                  <th>Effective Rate</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => (
                  <tr key={r.age} className={survivorRowClassName(r)} style={survivorRowStyle(r)}>
                    <td>{r.age}<SurvivorTag age={r.age} /></td>
                    <td>{displayFmt(r.ordinaryIncome, r.age)}</td>
                    <td>{displayFmt(r.standardDeduction, r.age)}</td>
                    <td>{displayFmt(r.taxableIncome, r.age)}</td>
                    <td>{displayFmt(r.federalTax, r.age)}</td>
                    <td>{r.stateTax > 0 ? displayFmt(r.stateTax, r.age) : '—'}</td>
                    <td>{r.irmaaPartB + r.irmaaPartD > 0 ? displayFmt(r.irmaaPartB + r.irmaaPartD, r.age) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{displayFmt(r.totalTax, r.age)}</td>
                    <td style={{ color: r.marginalRate >= 0.24 ? '#C0392B' : r.marginalRate >= 0.22 ? '#BA7517' : undefined }}>
                      {pct(r.marginalRate)}
                    </td>
                    <td>{r.effectiveRate > 0 ? pct(r.effectiveRate) : '—'}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600, borderTop: '2px solid #ddd' }}>
                  <td>Total</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{fmt(allRows.reduce((s, r) => s + displayAtAge(r.federalTax, r.age), 0))}</td>
                  <td>{fmt(allRows.reduce((s, r) => s + displayAtAge(r.stateTax, r.age), 0))}</td>
                  <td>{fmt(allRows.reduce((s, r) => s + displayAtAge(r.irmaaPartB + r.irmaaPartD, r.age), 0))}</td>
                  <td>{fmt(allRows.reduce((s, r) => s + displayAtAge(r.totalTax, r.age), 0))}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </CollapsibleTableSection>
          <div className="note">
            Marginal rate is color-coded: 22%+ is amber, 24%+ is red. Effective rate = (federal + state tax) ÷ gross income.
            IRMAA is based on income from 2 years prior and applies at age 65+.
          </div>
        </div>
      )}

      {activeTab === 'cashflow' && (
        <div className="chart-card">
          <div className="chart-title">Cash flow: income vs spending vs tax</div>
          <DollarModeNote />
          <div className="legend">
            <span className="li"><span className="ls" style={{ background: '#27AE60' }}></span>Total income</span>
            <span className="li"><span className="ls" style={{ background: '#E74C3C' }}></span>Spending</span>
            <span className="li"><span className="ls" style={{ background: '#F09595' }}></span>Tax</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <Bar data={cashflowData()} options={baseOpts(true)} />
          </div>
          <div className="detail-panel">
            <div className="detail-grid">
              <div className="detail-item">
                <div className="detail-label">Portfolio depletion age</div>
                <div className="detail-value">
                  {(() => {
                    const depleted = allRows.find(r => r.total <= 0);
                    return depleted ? depleted.age : 'Never (funded)';
                  })()}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Final portfolio value</div>
                <div className="detail-value">{allRows.length > 0 ? displayFmt(allRows[allRows.length - 1].total, allRows[allRows.length - 1].age) : fmt(0)}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Peak withdrawal rate</div>
                <div className="detail-value">
                  {pct(Math.max(...allRows.filter(r => r.portfolioValue > 0).map(r => r.withdrawalRate)))}
                </div>
              </div>
            </div>
          </div>

          <CollapsibleTableSection id="cashflow" title="Year-by-year cash flow" meta={resultAgeRange}>
            <table className="optimizer-table opt-schedule-table">
              <thead>
                <tr>
                  <th>Age</th>
                  <th>Total Income</th>
                  <th>Spending</th>
                  <th>Taxes</th>
                  <th>Total Out</th>
                  <th>Net Cash Flow</th>
                  <th>Withdrawal Rate</th>
                  <th>Portfolio Value</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map(r => {
                  const totalIn = getSalary(r) + r.ss + r.spouseSs + r.pension + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW;
                  const totalOut = r.totalSpending + r.totalTax;
                  const net = totalIn - totalOut;
                  const depleted = r.total <= 0;
                  return (
                    <tr key={r.age} className={survivorRowClassName(r)} style={survivorRowStyle(r, depleted ? { background: '#FFF5F5' } : undefined)}>
                      <td>{r.age}<SurvivorTag age={r.age} /></td>
                      <td>{displayFmt(totalIn, r.age)}</td>
                      <td>{displayFmt(r.totalSpending, r.age)}</td>
                      <td>{displayFmt(r.totalTax, r.age)}</td>
                      <td>{displayFmt(totalOut, r.age)}</td>
                      <td style={{ color: net < -500 ? '#C0392B' : net > 500 ? '#1D9E75' : undefined, fontWeight: 500 }}>
                        {net >= 0 ? '+' : ''}{displayFmt(net, r.age)}
                      </td>
                      <td style={{ color: r.withdrawalRate > 0.06 ? '#C0392B' : r.withdrawalRate > 0.04 ? '#BA7517' : undefined }}>
                        {r.portfolioValue > 0 ? pct(r.withdrawalRate) : '—'}
                      </td>
                      <td style={{ color: depleted ? '#C0392B' : undefined, fontWeight: depleted ? 600 : undefined }}>
                        {displayFmt(r.portfolioValue, r.age)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CollapsibleTableSection>
          <div className="note">
            Withdrawal rate = total portfolio withdrawals ÷ portfolio value. Above 4% is yellow, above 6% is red.
            Net cash flow near zero is expected — the model draws exactly what is needed each year.
          </div>
        </div>
      )}

      {activeTab === 'expenses' && (
        <ExpenseTab inputs={inputs} onItemsChange={onExpenseItemsChange} onInputChange={onInputChange} />
      )}

      {activeTab === 'accounts' && (
        <AccountsTab inputs={inputs} onAccountsChange={onAccountsChange} onInputChange={onInputChange} />
      )}

      {activeTab === 'optimizer' && (
        <div className="chart-card">
          <div className="chart-title">Roth Conversion Optimizer <span className="opt-timestamp">Updated {new Date(optTimestamp).toLocaleTimeString()}</span></div>
          {optimization ? (() => {
            const greedyResult = optimization.strategies.find(s => s.strategy.name === 'Greedy optimizer') ?? optimization.bestByTax;
            const activeBest = optimizerGoal === 'tax' ? optimization.bestByTax
              : optimizerGoal === 'portfolio' ? optimization.bestByPortfolio
              : optimizerGoal === 'greedy' ? greedyResult
              : optimization.bestByPeakRate;
            const activeSchedule = activeBest.schedule;
            const activeScheduleYears = Object.keys(activeSchedule).map(Number).sort((a, b) => a - b);
            const activeUntilAge = activeScheduleYears.length > 0 ? Math.max(...activeScheduleYears) : 0;
            const activeAvgAnnual = activeScheduleYears.length > 0
              ? Math.round(Object.values(activeSchedule).reduce((a, b) => a + b, 0) / activeScheduleYears.length)
              : 0;

            const savingsText = (() => {
              if (optimizerGoal === 'tax') {
                const vsCurrent = optimization.currentSettings.lifetimeTotalTax - activeBest.lifetimeTotalTax;
                const vsBaseline = optimization.baseline.lifetimeTotalTax - activeBest.lifetimeTotalTax;
                if (vsCurrent > 0) return `Saves ${fmt(vsCurrent)} in lifetime taxes vs your current settings`;
                if (vsBaseline > 0) return `Saves ${fmt(vsBaseline)} in lifetime taxes vs no conversions`;
                return 'No conversion strategy reduces lifetime taxes in this scenario';
              } else if (optimizerGoal === 'portfolio') {
                const gain = activeBest.terminalTotal - optimization.baseline.terminalTotal;
                if (gain > 0) return `Terminal portfolio ${fmt(gain)} larger vs no conversions`;
                return 'Conversions do not improve terminal portfolio — early tax payments reduce compounding';
              } else if (optimizerGoal === 'greedy') {
                const taxSavings = optimization.baseline.lifetimeTotalTax - activeBest.lifetimeTotalTax;
                const scheduleYears = Object.keys(activeBest.schedule).length;
                if (scheduleYears === 0) return 'Current marginal rate is not lower than expected future RMD rate — no opportunistic conversions recommended';
                if (taxSavings > 0) return `Converts only when current rate < future RMD rate. Saves ${fmt(taxSavings)} in lifetime taxes vs no conversions`;
                return 'Per-year opportunistic schedule — converts whenever current bracket is cheaper than projected RMD bracket';
              } else {
                const rateReduction = optimization.baseline.peakMarginalRate - activeBest.peakMarginalRate;
                const taxSavings = optimization.baseline.lifetimeTotalTax - activeBest.lifetimeTotalTax;
                if (rateReduction > 0) return `Reduces peak marginal rate from ${pct(optimization.baseline.peakMarginalRate)} to ${pct(activeBest.peakMarginalRate)}, saving ${fmt(taxSavings)} in lifetime taxes`;
                return 'No conversion strategy reduces your peak marginal rate in this scenario';
              }
            })();

            const GOAL_OPTIONS: { id: OptimizerGoal; label: string; title: string }[] = [
              { id: 'tax', label: 'Minimize taxes', title: 'Minimize total taxes paid from retirement through life expectancy' },
              { id: 'portfolio', label: 'Maximize portfolio', title: 'Maximize total portfolio value at end of plan — accounts for opportunity cost of paying taxes early' },
              { id: 'peakrate', label: 'Smooth brackets', title: 'Minimize peak marginal rate — prevents large RMDs from spiking you into a high bracket. Ties broken by lowest lifetime tax.' },
              { id: 'greedy', label: 'Per-year optimal', title: 'Convert only when your current marginal rate is strictly lower than the expected future marginal rate on RMDs. Year-by-year opportunistic.' },
            ];

            const chartMetric = optimizerGoal === 'portfolio'
              ? { key: 'terminalTotal' as const, label: 'Terminal portfolio' }
              : { key: 'lifetimeTotalTax' as const, label: 'Lifetime total tax' };

            return (
              <>
                {/* Goal selector */}
                <div style={{ display: 'flex', gap: '4px', margin: '0 0 0.5rem 0', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: '#666', alignSelf: 'center', marginRight: '4px' }}>Optimize for:</span>
                  {GOAL_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      title={opt.title}
                      onClick={() => setOptimizerGoal(opt.id)}
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        border: optimizerGoal === opt.id ? '2px solid #1A5276' : '1px solid #ccc',
                        borderRadius: '4px',
                        background: optimizerGoal === opt.id ? '#EAF4FB' : '#fff',
                        color: optimizerGoal === opt.id ? '#1A5276' : '#555',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Earliest start age slider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 1rem 0' }}>
                  <span style={{ fontSize: '11px', color: '#666', whiteSpace: 'nowrap' }}>Earliest start age:</span>
                  <input
                    type="range"
                    min={inputs.age}
                    max={71}
                    value={optMinStartAge}
                    step={1}
                    style={{ flex: 1, maxWidth: '220px' }}
                    onChange={e => {
                      finishNumberDraft('optMinStartAge');
                      setOptMinStartAge(Number(e.target.value));
                    }}
                  />
                  <div className="range-number-wrap" style={{ maxWidth: 82 }}>
                    <input
                      className="range-number"
                      type="number"
                      min={inputs.age}
                      max={71}
                      step={1}
                      value={numberDrafts.optMinStartAge ?? String(optMinStartAge)}
                      onInput={(e) => updateInputDraft('optMinStartAge', (e.target as HTMLInputElement).value, value => setOptMinStartAge(Math.max(inputs.age, Math.min(71, value))))}
                      onBlur={() => finishNumberDraft('optMinStartAge')}
                      aria-label="Earliest optimizer start age value"
                    />
                  </div>
                </div>

                {/* Recommendation banner */}
                <div className="optimizer-banner">
                  <div className="optimizer-rec-label">
                    {optimizerGoal === 'tax' ? 'Lowest lifetime taxes' : optimizerGoal === 'portfolio' ? 'Largest terminal portfolio' : optimizerGoal === 'greedy' ? 'Per-year opportunistic' : 'Smoothest tax brackets'}
                  </div>
                  <div className="optimizer-rec-name">{activeBest.strategy.name}</div>
                  <div className="optimizer-rec-desc">{activeBest.strategy.description}</div>
                  {activeScheduleYears.length > 0 && (
                    <div className="optimizer-rec-params">
                      <span className="opt-param">Target bracket: <strong>{['10%','12%','22%','24%'][activeBest.strategy.targetBracket]}</strong></span>
                      <span className="opt-param">Convert until age: <strong>{activeUntilAge || 'N/A'}</strong></span>
                      <span className="opt-param">Avg annual: <strong>{fmt(activeAvgAnnual)}/yr</strong></span>
                    </div>
                  )}
                  <div className="optimizer-savings">{savingsText}</div>
                </div>

                {/* Year-by-year conversion schedule for active strategy */}
                <div className="chart-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Recommended conversion schedule</span>
                  {conversionSchedule ? (
                    <span style={{ fontSize: '11px', color: '#27AE60', fontWeight: 600 }}>
                      Applied to projection —{' '}
                      <button onClick={onClearSchedule} style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: '11px', padding: 0, fontWeight: 600 }}>
                        Reset to sidebar
                      </button>
                    </span>
                  ) : (
                    activeScheduleYears.length > 0 && (
                      <button
                        onClick={() => onApplySchedule(activeSchedule)}
                        style={{ fontSize: '11px', padding: '3px 10px', background: '#1A5276', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Apply to projection
                      </button>
                    )
                  )}
                </div>
                {activeScheduleYears.length === 0 ? (
                  <div className="note">No conversions recommended for this scenario.</div>
                ) : (
                  <div className="optimizer-table-wrap">
                    <table className="optimizer-table opt-schedule-table">
                      <thead>
                        <tr>
                          <th>Age</th>
                          <th>Conversion</th>
                          <th>Cumulative</th>
                          <th>Remaining Trad (est.)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeScheduleYears.map((age, i) => {
                          const cum = activeScheduleYears.slice(0, i + 1).reduce((s, a) => s + activeSchedule[a], 0);
                          const tradEst = activeBest.rows.find(r => r.age === age)?.trad ?? 0;
                          const isActive = conversionSchedule && conversionSchedule[age] !== undefined;
                          return (
                            <tr key={age} style={{ background: isActive ? '#EBF5FB' : undefined }}>
                              <td>{age}</td>
                              <td>{fmt(activeSchedule[age])}</td>
                              <td>{fmt(cum)}</td>
                              <td>{fmt(tradEst)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Comparison table */}
                <CollapsibleTableSection id="optimizer-strategies" title="Strategy comparison" meta={`${optimization.strategies.length} strategies`}>
                  <table className="optimizer-table">
                    <thead>
                      <tr>
                        <th>Strategy</th>
                        <th>Lifetime Tax</th>
                        <th>IRMAA</th>
                        <th>Peak Marginal</th>
                        <th>Terminal Trad</th>
                        <th>Terminal Roth</th>
                        <th>Terminal Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optimization.strategies.map((s, i) => {
                        const isBest = s.strategy.name === activeBest.strategy.name;
                        const isBaseline = s.strategy.name === optimization.baseline.strategy.name;
                        const isCurrent = s.strategy.name === 'Your current settings';
                        return (
                          <tr key={i} className={isBest ? 'opt-row-best' : isBaseline ? 'opt-row-baseline' : isCurrent ? 'opt-row-current' : ''}>
                            <td>
                              {isBest && <span className="opt-badge-best">BEST</span>}
                              {isBaseline && <span className="opt-badge-base">BASE</span>}
                              {isCurrent && <span className="opt-badge-current">YOU</span>}
                              {' '}{s.strategy.name}
                            </td>
                            <td>{fmt(s.lifetimeTotalTax)}</td>
                            <td>{fmt(s.lifetimeIRMAA)}</td>
                            <td>{pct(s.peakMarginalRate)}</td>
                            <td>{fmt(s.terminalTrad)}</td>
                            <td>{fmt(s.terminalRoth)}</td>
                            <td>{fmt(s.terminalTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CollapsibleTableSection>

                {/* Comparison chart — metric adapts to goal */}
                <div className="chart-subtitle">{chartMetric.label} by strategy</div>
                <div style={{ position: 'relative', width: '100%', height: '200px' }}>
                  <Bar
                    data={{
                      labels: optimization.strategies.map(s => s.strategy.name),
                      datasets: [{
                        label: chartMetric.label,
                        data: optimization.strategies.map(s => s[chartMetric.key]),
                        backgroundColor: optimization.strategies.map(s =>
                          s.strategy.name === activeBest.strategy.name
                            ? '#1D9E75'
                            : s.strategy.name === optimization.baseline.strategy.name
                              ? '#E74C3C'
                              : s.strategy.name === 'Your current settings'
                                ? '#3498DB'
                                : '#378ADD'
                        ),
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      animation: false,
                      indexAxis: 'y',
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (ctx: any) => fmt(ctx.parsed.x) } },
                      },
                      scales: {
                        x: {
                          ticks: { callback: (v: number | string) => fmt(Number(v)), font: { size: 10 } },
                          grid: { color: 'rgba(128,128,128,0.1)' },
                        },
                        y: { ticks: { font: { size: 10 } }, grid: { display: false } },
                      },
                    } as any}
                  />
                </div>

                {/* Start age analysis */}
                {optimization.startAgeAnalysis.length > 0 && (() => {
                  const BRACKET_LABELS = ['10%', '12%', '22%', '24%'];
                  const metricLabel = (m: import('../optimizer').StartAgeMetric) =>
                    `${BRACKET_LABELS[m.bracket]} / until ${m.untilAge}`;
                  const visibleRows = optimization.startAgeAnalysis.filter(r => r.convStart >= optMinStartAge);
                  // Only rows that would show a real value (not "—") are eligible for BEST
                  const eligibleForGoal = visibleRows.filter(r => {
                    const preRet = r.convStart < inputs.retireAge;
                    if (optimizerGoal === 'portfolio') return !preRet || r.bestTerminal.hasPreRetirementConv;
                    if (optimizerGoal === 'peakrate') return !preRet || r.bestPeak.hasPreRetirementConv;
                    return !preRet || r.bestTax.hasPreRetirementConv;
                  });
                  const bestRowForGoal = eligibleForGoal.length === 0 ? null : eligibleForGoal.reduce((best, r) => {
                    if (optimizerGoal === 'portfolio') return r.bestTerminal.terminalTotal > best.bestTerminal.terminalTotal ? r : best;
                    if (optimizerGoal === 'peakrate') return r.bestPeak.peakMarginalRate < best.bestPeak.peakMarginalRate ? r : best;
                    return r.bestTax.lifetimeTotalTax < best.bestTax.lifetimeTotalTax ? r : best;
                  }, eligibleForGoal[0]);

                  const goalSchedule = (row: typeof visibleRows[0]) =>
                    optimizerGoal === 'portfolio' ? row.bestTerminal.schedule
                    : optimizerGoal === 'peakrate' ? row.bestPeak.schedule
                    : row.bestTax.schedule;

                  return (
                    <CollapsibleTableSection id="optimizer-start-age" title="Conversion start age analysis" meta={`${visibleRows.length} start ages`}>
                      <div className="note" style={{ margin: '0 0 0.5rem' }}>
                        Each row tests all 4 brackets by 4 until-ages and shows the independently optimized best for each metric. Apply uses the schedule matching your current goal.
                      </div>
                      <table className="optimizer-table opt-schedule-table">
                        <thead>
                          <tr>
                            <th>Start Age</th>
                            <th>Best Lifetime Tax</th>
                            <th>Tax Savings</th>
                            <th>Best Terminal</th>
                            <th>Best Peak Rate</th>
                            <th>Lowest IRMAA</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map(row => {
                            const isCurrentStart = row.convStart === (inputs.convStart ?? inputs.retireAge);
                            const isBest = row === bestRowForGoal;
                            const sched = goalSchedule(row);
                            const activeMetric = optimizerGoal === 'portfolio' ? row.bestTerminal
                              : optimizerGoal === 'peakrate' ? row.bestPeak
                              : row.bestTax;
                            const isApplied = conversionSchedule && JSON.stringify(conversionSchedule) === JSON.stringify(sched);
                            const preRet = row.convStart < inputs.retireAge;
                            // Show Apply when: schedule is non-empty AND (post-retirement OR the active metric has actual pre-retirement conversions)
                            const canApply = Object.keys(sched).length > 0 && (!preRet || activeMetric.hasPreRetirementConv);
                            const cell = (m: import('../optimizer').StartAgeMetric, content: React.ReactNode) =>
                              preRet && !m.hasPreRetirementConv
                                ? <td style={{ color: '#bbb' }}>—</td>
                                : <td>{content}</td>;
                            return (
                              <tr key={row.convStart} className={isBest ? 'opt-row-best' : isCurrentStart ? 'opt-row-current' : ''}>
                                <td>
                                  {isBest && <span className="opt-badge-best">BEST</span>}
                                  {isCurrentStart && !isBest && <span className="opt-badge-current">YOU</span>}
                                  {' '}{row.convStart}
                                </td>
                                {cell(row.bestTax, <>
                                  {fmt(row.bestTax.lifetimeTotalTax)}
                                  <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>{metricLabel(row.bestTax)}</div>
                                </>)}
                                {cell(row.bestTax, <span style={{ color: row.bestTax.savings > 0 ? '#1D9E75' : '#C0392B', fontWeight: 600 }}>
                                  {row.bestTax.savings > 0 ? '+' : ''}{fmt(row.bestTax.savings)}
                                </span>)}
                                {cell(row.bestTerminal, <>
                                  {fmt(row.bestTerminal.terminalTotal)}
                                  <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>{metricLabel(row.bestTerminal)}</div>
                                </>)}
                                {cell(row.bestPeak, <>
                                  {pct(row.bestPeak.peakMarginalRate)}
                                  <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>{metricLabel(row.bestPeak)}</div>
                                </>)}
                                {cell(row.bestIrmaa, <>
                                  {fmt(row.bestIrmaa.lifetimeIRMAA)}
                                  <div style={{ fontSize: '10px', color: '#888', marginTop: '1px' }}>{metricLabel(row.bestIrmaa)}</div>
                                </>)}
                                <td>
                                  {isApplied ? (
                                    <button onClick={onClearSchedule} style={{ fontSize: '10px', padding: '2px 6px', background: '#E74C3C', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                      Reset
                                    </button>
                                  ) : canApply ? (
                                    <button onClick={() => onApplySchedule(sched)} style={{ fontSize: '10px', padding: '2px 6px', background: '#1A5276', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                                      Apply
                                    </button>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </CollapsibleTableSection>
                  );
                })()}

                {/* Savings breakdown */}
                <div className="detail-panel" style={{ marginTop: '1rem' }}>
                  <div className="detail-section-title">
                    {optimizerGoal === 'portfolio' ? 'Portfolio impact vs no conversions' : 'Where the savings come from'}
                  </div>
                  {optimizerGoal === 'portfolio' ? (
                    <>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <div className="detail-label">Terminal portfolio gain</div>
                          <div className="detail-value" style={{ color: activeBest.terminalTotal >= optimization.baseline.terminalTotal ? '#1D9E75' : '#C0392B' }}>
                            {activeBest.terminalTotal >= optimization.baseline.terminalTotal ? '+' : ''}{fmt(activeBest.terminalTotal - optimization.baseline.terminalTotal)}
                          </div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Roth at death</div>
                          <div className="detail-value">{fmt(optimization.baseline.terminalRoth)} → {fmt(activeBest.terminalRoth)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Traditional IRA at death</div>
                          <div className="detail-value">{fmt(optimization.baseline.terminalTrad)} → {fmt(activeBest.terminalTrad)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Lifetime taxes paid</div>
                          <div className="detail-value">{fmt(activeBest.lifetimeTotalTax)}</div>
                        </div>
                      </div>
                      <div className="note">
                        Terminal total includes pre-tax traditional IRA balances. Maximizing portfolio value
                        often favors fewer conversions because tax dollars paid early stop compounding. However,
                        Roth assets are more valuable to heirs since inherited traditional IRAs must be withdrawn
                        (and taxed) within 10 years.
                      </div>
                    </>
                  ) : optimizerGoal === 'peakrate' ? (
                    <>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <div className="detail-label">Peak marginal rate</div>
                          <div className="detail-value">{pct(optimization.baseline.peakMarginalRate)} → {pct(activeBest.peakMarginalRate)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Lifetime taxes saved</div>
                          <div className="detail-value">{fmt(optimization.baseline.lifetimeTotalTax - activeBest.lifetimeTotalTax)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">IRMAA saved</div>
                          <div className="detail-value">{fmt(optimization.baseline.lifetimeIRMAA - activeBest.lifetimeIRMAA)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Terminal portfolio</div>
                          <div className="detail-value">{fmt(optimization.baseline.terminalTotal)} → {fmt(activeBest.terminalTotal)}</div>
                        </div>
                      </div>
                      <div className="note">
                        Large RMDs at 73+ can spike your marginal rate, increasing taxes on Social Security
                        and triggering IRMAA surcharges. Converting enough before RMDs begin keeps your income
                        in a lower bracket every year. Ties between strategies with the same peak rate are broken
                        by lowest lifetime taxes.
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="detail-grid">
                        <div className="detail-item">
                          <div className="detail-label">Federal tax saved</div>
                          <div className="detail-value">{fmt(optimization.baseline.lifetimeFederalTax - activeBest.lifetimeFederalTax)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">IRMAA saved</div>
                          <div className="detail-value">{fmt(optimization.baseline.lifetimeIRMAA - activeBest.lifetimeIRMAA)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Peak marginal rate</div>
                          <div className="detail-value">{pct(optimization.baseline.peakMarginalRate)} → {pct(activeBest.peakMarginalRate)}</div>
                        </div>
                        <div className="detail-item">
                          <div className="detail-label">Roth at death</div>
                          <div className="detail-value">{fmt(optimization.baseline.terminalRoth)} → {fmt(activeBest.terminalRoth)}</div>
                        </div>
                      </div>
                      <div className="note">
                        Converting early at lower rates reduces future RMDs, which lowers marginal rates during RMD years,
                        which reduces SS taxation and IRMAA surcharges. The optimal strategy fills brackets when current
                        rates are lower than expected future rates.
                      </div>
                    </>
                  )}
                </div>
              </>
            );
          })() : (
            <div className="note">Optimizer is computing...</div>
          )}
        </div>
      )}

      {activeTab === 'mc' && (() => {
        const mcOptions = getMonteCarloOptions(
          mcPreset,
          mcRuns,
          mcSeed,
          mcMethod,
          mcStockAllocation,
          mcBondAllocation,
          mcCashAllocation,
          mcBlockSize,
        );
        const mc = runMonteCarlo(inputs, conversionSchedule, mcOptions);
        const successRates = mc.successRates;
        const { p10, p25, p50, p75, p90 } = mc.percentiles;
        const labels = mc.labels.map(String);
        const finalAge = mc.labels[mc.labels.length - 1] ?? inputs.lifeExp;

        const finalSR = successRates[successRates.length - 1] ?? 0;
        const medianFinal = p50[p50.length - 1] ?? 0;
        const p10Final = p10[p10.length - 1] ?? 0;
        const p90Final = p90[p90.length - 1] ?? 0;

        const keyAges = [70, 75, 80, 85, 90, inputs.lifeExp, finalAge]
          .filter((a, i, arr) => arr.indexOf(a) === i && a >= inputs.retireAge && a <= finalAge);

        const srColor = (sr: number) => sr >= 90 ? '#1D9E75' : sr >= 75 ? '#BA7517' : '#C0392B';

        return (
          <div className="chart-card">
            <div className="chart-title">Monte Carlo — {mc.runs} simulated retirements</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: '0 0 1rem 0', alignItems: 'end' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Method</label>
                <select value={mcMethod} onChange={e => setMcMethod(e.target.value as MonteCarloMethod)}>
                  <option value="parametric">Parametric</option>
                  <option value="historical">Historical bootstrap</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Preset</label>
                <select value={mcPreset} onChange={e => setMcPreset(e.target.value as MonteCarloPreset)}>
                  <option value="base">Base</option>
                  <option value="stress">Stress</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Runs</label>
                <select value={mcRuns} onChange={e => setMcRuns(Number(e.target.value))}>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={2500}>2,500</option>
                  <option value={5000}>5,000</option>
                </select>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Seed</label>
                <input
                  type="text"
                  value={mcSeed}
                  onChange={e => setMcSeed(e.target.value || DEFAULT_MONTE_CARLO_OPTIONS.seed)}
                  style={{ width: '100%', padding: '5px 8px', fontSize: 13, border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6 }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, margin: '0 0 1rem 0', alignItems: 'end' }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Stocks</label>
                <input type="number" min={0} max={100} value={Math.round(mcStockAllocation * 100)} onChange={e => setMcStockAllocation(Number(e.target.value) / 100)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Bonds</label>
                <input type="number" min={0} max={100} value={Math.round(mcBondAllocation * 100)} onChange={e => setMcBondAllocation(Number(e.target.value) / 100)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Cash</label>
                <input type="number" min={0} max={100} value={Math.round(mcCashAllocation * 100)} onChange={e => setMcCashAllocation(Number(e.target.value) / 100)} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Block years</label>
                <select value={mcBlockSize} onChange={e => setMcBlockSize(Number(e.target.value))} disabled={mcMethod !== 'historical'}>
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                </select>
              </div>
            </div>

            <div className="detail-panel" style={{ marginBottom: '1rem' }}>
              <div className="detail-grid">
                <div className="detail-item" style={{ background: finalSR >= 90 ? '#EBF5FB' : finalSR >= 75 ? '#FEF9E7' : '#FDEDEC' }}>
                  <div className="detail-label">Success rate at {finalAge}</div>
                  <div className="detail-value" style={{ color: srColor(finalSR), fontSize: '1.3rem' }}>{finalSR}%</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Median portfolio at {finalAge}</div>
                  <div className="detail-value">{fmt(medianFinal)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Worst 10% at {finalAge}</div>
                  <div className="detail-value" style={{ color: p10Final <= 0 ? '#C0392B' : undefined }}>{fmt(p10Final)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Best 10% at {finalAge}</div>
                  <div className="detail-value">{fmt(p90Final)}</div>
                </div>
              </div>
              <div className="detail-grid" style={{ marginTop: '0.5rem' }}>
                <div className="detail-item">
                  <div className="detail-label">Method</div>
                  <div className="detail-value">{mc.assumptions.method === 'historical' ? 'Historical bootstrap' : 'Parametric'}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Allocation</div>
                  <div className="detail-value">{`${Math.round(mc.assumptions.stockAllocation * 100)}/${Math.round(mc.assumptions.bondAllocation * 100)}/${Math.round(mc.assumptions.cashAllocation * 100)}`}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{mc.assumptions.method === 'historical' ? 'Block years' : 'Portfolio volatility'}</div>
                  <div className="detail-value">{mc.assumptions.method === 'historical' ? mc.assumptions.blockSize : pct(mc.assumptions.portfolioStdDev)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">{mc.assumptions.method === 'historical' ? 'Historical period' : 'Expected portfolio return'}</div>
                  <div className="detail-value">{mc.assumptions.method === 'historical' ? '1928-2025' : pct(inputs.r)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Bear-market year chance</div>
                  <div className="detail-value">{mc.assumptions.method === 'historical' ? 'Historical years' : pct(mc.assumptions.bearMarketProbability)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Return/inflation correlation</div>
                  <div className="detail-value">{mc.assumptions.returnInflationCorrelation.toFixed(2)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Spending shock chance</div>
                  <div className="detail-value">{pct(mc.assumptions.spendingShockProbability)}</div>
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', width: '100%', height: '260px' }}>
              <Line
                data={{
                  labels,
                  datasets: [
                    { label: 'Success %', data: successRates, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.15)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
                  ],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false, animation: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (ctx: any) => `Success rate: ${ctx.parsed.y}%` } },
                  },
                  scales: {
                    x: { ticks: { maxTicksLimit: 10, font: { size: 11 } }, grid: { display: false } },
                    y: { min: 0, max: 100, ticks: { callback: (v: any) => v + '%', font: { size: 11 }, maxTicksLimit: 6 }, grid: { color: 'rgba(128,128,128,0.1)' } },
                  },
                } as any}
              />
            </div>

            <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Portfolio value range at key ages</div>
            <div className="optimizer-table-wrap">
              <table className="optimizer-table opt-schedule-table">
                <thead>
                  <tr>
                    <th>Age</th>
                    <th title="90% of simulations had a higher balance">Worst 10%</th>
                    <th title="75% of simulations had a higher balance">25th pct</th>
                    <th>Median</th>
                    <th title="25% of simulations had a higher balance">75th pct</th>
                    <th title="10% of simulations had a higher balance">Best 10%</th>
                    <th>Success rate</th>
                  </tr>
                </thead>
                <tbody>
                  {keyAges.map(age => {
                    const idx = mc.labels.findIndex(label => label === age);
                    if (idx === -1) return null;
                    const sr = successRates[idx];
                    return (
                      <tr key={age}>
                        <td style={{ fontWeight: age === finalAge ? 600 : undefined }}>
                          {age}{age === finalAge ? ' ★' : ''}
                        </td>
                        <td style={{ color: p10[idx] <= 0 ? '#C0392B' : undefined }}>{fmt(p10[idx])}</td>
                        <td style={{ color: p25[idx] <= 0 ? '#C0392B' : undefined }}>{fmt(p25[idx])}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(p50[idx])}</td>
                        <td>{fmt(p75[idx])}</td>
                        <td>{fmt(p90[idx])}</td>
                        <td style={{ color: srColor(sr), fontWeight: 600 }}>{sr}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="note" style={{ marginTop: '0.75rem' }}>
              <strong>How this works:</strong> Each simulation reruns the full projection engine with the same taxes, Social Security, RMDs, conversions, and account rules. Parametric mode uses seeded correlated return/inflation shocks; historical bootstrap samples {mc.assumptions.blockSize}-year blocks from annual S&P 500, 10-year Treasury, T-bill, and CPI history from 1928-2025.
              <br /><strong>Success</strong> = portfolio still has money at that age.
              <strong> Percentiles</strong> show the spread of outcomes — "Worst 10%" means 9 out of 10 simulations did better than this number.
              The model is still a planning approximation; historical mode uses one global allocation and does not yet model account-specific asset location.
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Main;
