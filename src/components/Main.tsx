import React, { useState } from 'react';
import type { InputParams, ProjectionRow, Account } from '../types';
import { ExpenseTab } from './ExpenseTab';
import { AccountsTab } from './AccountsTab';
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
  activeTab: 'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer' | 'expenses' | 'accounts';
  setActiveTab: (tab: 'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer' | 'expenses' | 'accounts') => void;
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
}

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'K';
  return sign + '$' + Math.round(abs);
};

const pct = (n: number): string => (n * 100).toFixed(1) + '%';

type OptimizerGoal = 'tax' | 'portfolio' | 'peakrate' | 'greedy';

const Main: React.FC<MainProps> = ({ inputs, activeTab, setActiveTab, rows, metrics, optimization, optTimestamp, conversionSchedule, onApplySchedule, onClearSchedule, onInputChange, onExpenseItemsChange, onAccountsChange, optMinStartAge, setOptMinStartAge }) => {
  const [optimizerGoal, setOptimizerGoal] = useState<OptimizerGoal>('tax');
  const retireIn = Math.max(1, inputs.retireAge - inputs.age);
  const allRows = rows.slice(1); // all years from current age onward (skip y=0 initial state)
  const getSalary = (r: ProjectionRow) => r.age < inputs.retireAge ? (inputs.salary ?? 0) : 0;

  // Rows past the primary's life expectancy are spouse-only survivor years
  const survivorRowStyle = (r: ProjectionRow, base?: React.CSSProperties): React.CSSProperties => {
    if (r.age <= inputs.lifeExp) return base ?? {};
    return {
      ...(base ?? {}),
      background: '#F5F5F5',
      color: '#999',
      ...(r.age === inputs.lifeExp + 1 ? { borderTop: '2px dashed #ccc' } : {}),
    };
  };
  const SurvivorTag = ({ age }: { age: number }) =>
    age === inputs.lifeExp + 1 && inputs.spouseAge !== undefined
      ? <span style={{ marginLeft: 5, fontSize: 9, color: '#aaa', fontWeight: 600 }}>SPOUSE</span>
      : null;

  // ----- Balance Chart -----
  const balanceData = (): ChartData<'line', number[], string> => ({
    labels: rows.map(r => String(r.age)),
    datasets: [
      { label: 'Traditional', data: rows.map(r => r.trad), borderColor: '#378ADD', backgroundColor: 'rgba(55,138,221,0.08)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'Roth', data: rows.map(r => r.roth), borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'Taxable', data: rows.map(r => r.taxable), borderColor: '#9B59B6', backgroundColor: 'rgba(155,89,182,0.06)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'HSA', data: rows.map(r => r.hsa), borderColor: '#F39C12', backgroundColor: 'rgba(243,156,18,0.06)', fill: true, pointRadius: 0, tension: 0.4, borderWidth: 2 },
      { label: 'Total', data: rows.map(r => r.total), borderColor: '#888780', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.4, borderWidth: 1.5, borderDash: [4, 3] },
    ],
  });

  // ----- Income Chart (stacked bar) -----
  const incomeData = (): ChartData<'bar', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'Salary', data: allRows.map(r => getSalary(r)), backgroundColor: '#2ECC71', stack: 'income', type: 'bar' as const },
      { label: 'RMD', data: allRows.map(r => r.rmd), backgroundColor: '#BA7517', stack: 'income', type: 'bar' as const },
      { label: 'Conversion', data: allRows.map(r => r.conv), backgroundColor: '#378ADD', stack: 'income', type: 'bar' as const },
      { label: 'Traditional IRA withdrawal', data: allRows.map(r => r.tradW), backgroundColor: '#5DADE2', stack: 'income', type: 'bar' as const },
      { label: 'Roth IRA withdrawal', data: allRows.map(r => r.rothW), backgroundColor: '#1D9E75', stack: 'income', type: 'bar' as const },
      { label: 'Taxable account withdrawal', data: allRows.map(r => r.taxableW), backgroundColor: '#9B59B6', stack: 'income', type: 'bar' as const },
      { label: 'HSA withdrawal', data: allRows.map(r => r.hsaW), backgroundColor: '#F39C12', stack: 'income', type: 'bar' as const },
      { label: 'SS (primary)', data: allRows.map(r => r.ss), backgroundColor: '#9FE1CB', stack: 'income', type: 'bar' as const },
      { label: 'SS (spouse)', data: allRows.map(r => r.spouseSs), backgroundColor: '#76D7C4', stack: 'income', type: 'bar' as const },
      { label: 'Pension/Annuity', data: allRows.map(r => r.pension), backgroundColor: '#8E44AD', stack: 'income', type: 'bar' as const },
      { label: 'Taxes', data: allRows.map(r => -r.totalTax), backgroundColor: '#F09595', stack: 'tax', type: 'bar' as const },
      { label: 'Expenses', data: allRows.map(r => r.totalSpending), type: 'line' as const, borderColor: '#D85A30', backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, borderWidth: 2, order: 0 },
    ] as any,
  });

  // ----- RMD Chart -----
  const rmdData = (): ChartData<'bar', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'RMD required', data: allRows.map(r => r.rmd), backgroundColor: '#BA7517', stack: 'a', type: 'bar' },
      { label: 'Roth conversion', data: allRows.map(r => r.conv), backgroundColor: '#378ADD', stack: 'a', type: 'bar' },
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
      { label: 'Federal tax', data: allRows.map(r => r.federalTax), borderColor: '#E67E22', backgroundColor: 'rgba(230,126,34,0.07)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'State tax', data: allRows.map(r => r.stateTax), borderColor: '#27AE60', backgroundColor: 'rgba(39,174,96,0.07)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'IRMAA (B+D)', data: allRows.map(r => r.irmaaPartB + r.irmaaPartD), borderColor: '#8E44AD', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3, borderWidth: 2, borderDash: [4, 3] },
    ],
  });

  // ----- Cashflow Chart -----
  const cashflowData = (): ChartData<'bar', number[], string> => ({
    labels: allRows.map(r => String(r.age)),
    datasets: [
      { label: 'Total income', data: allRows.map(r => getSalary(r) + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW + r.ss + r.spouseSs + r.pension), backgroundColor: '#27AE60', stack: 'cf', type: 'bar' as const },
      { label: 'Total spending', data: allRows.map(r => -r.totalSpending), backgroundColor: '#E74C3C', stack: 'cf', type: 'bar' as const },
      { label: 'Total tax', data: allRows.map(r => -r.totalTax), backgroundColor: '#F09595', stack: 'cf', type: 'bar' as const },
    ] as any,
  });

  // Monte Carlo is computed inline in the tab render to keep all data in one place.

  // ----- Chart Options -----
  const rateOpts = (): ChartOptions<'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => `${ctx.dataset.label || ''}: ${ctx.parsed.y.toFixed(1)}%`,
        },
      },
    },
    scales: {
      x: { ticks: { maxTicksLimit: 10, font: { size: 11 } }, grid: { display: false } },
      y: { min: 0, ticks: { callback: (v: number | string) => Number(v).toFixed(0) + '%', font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: 'rgba(128,128,128,0.1)' } },
    },
  } as any);

  const baseOpts = (stacked = false, yMin?: number, yMax?: number): ChartOptions<'bar' | 'line'> => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
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
      x: { stacked, ticks: { maxTicksLimit: 10, font: { size: 11 } }, grid: { display: false } },
      y: { stacked, min: yMin, max: yMax, ticks: { callback: (v: number | string) => fmt(Number(v)), font: { size: 11 }, maxTicksLimit: 5 }, grid: { color: 'rgba(128,128,128,0.1)' } },
    },
  } as any);

  // ----- RMD/SS interaction detail panel -----
  const renderRMDDetail = () => {
    const rmdRows = allRows.filter(r => r.rmd > 0 || r.conv > 0 || r.ss > 0);
    if (rmdRows.length === 0) return <div className="note">No RMD/SS data yet for this scenario.</div>;

    const firstRmd = rmdRows.find(r => r.rmd > 0);
    const peakRmd = rmdRows.reduce((mx, r) => r.rmd > mx.rmd ? r : mx, rmdRows[0]);
    const peakConv = rmdRows.reduce((mx, r) => r.conv > mx.conv ? r : mx, rmdRows[0]);

    return (
      <div className="detail-panel">
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">First RMD age</div>
            <div className="detail-value">{firstRmd?.age ?? '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">First RMD amount</div>
            <div className="detail-value">{firstRmd ? fmt(firstRmd.rmd) : '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Peak RMD age</div>
            <div className="detail-value">{peakRmd.age}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Peak RMD amount</div>
            <div className="detail-value">{fmt(peakRmd.rmd)}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Peak conversion</div>
            <div className="detail-value">{peakConv.conv > 0 ? fmt(peakConv.conv) + ' (age ' + peakConv.age + ')' : 'None'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Total conversions</div>
            <div className="detail-value">{fmt(rmdRows.reduce((s, r) => s + r.conv, 0))}</div>
          </div>
        </div>

        <div className="detail-section-title">RMD impact on Social Security taxation</div>
        <div className="detail-grid">
          <div className="detail-item">
            <div className="detail-label">Provisional income at first RMD</div>
            <div className="detail-value">{firstRmd ? fmt(firstRmd.rmd + firstRmd.conv + (firstRmd.ss + firstRmd.spouseSs) * 0.5) : '—'}</div>
          </div>
          <div className="detail-item">
            <div className="detail-label">Taxable SS at first RMD</div>
            <div className="detail-value">{firstRmd ? fmt(firstRmd.ssTaxable) : '—'}</div>
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

          const totalConvTax = convRows.reduce((s, r) => s + r.convTax, 0);
          const shortfallRows = convRows.filter(r => r.tradW > 0);
          const hasShortfall = shortfallRows.length > 0;

          return (
            <>
              <div className="detail-section-title">Conversion tax cost</div>

              {/* Year-by-year conversion tax table */}
              <div className="optimizer-table-wrap">
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
                      <tr key={r.age} style={survivorRowStyle(r, r.tradW > 0 ? { background: '#FFF5F5' } : undefined)}>
                        <td>{r.age}<SurvivorTag age={r.age} /></td>
                        <td>{fmt(r.conv)}</td>
                        <td>{fmt(r.convTax)}</td>
                        <td>{fmt(r.totalTax)}</td>
                        <td>{r.conv > 0 ? pct(r.convTax / r.conv) : '—'}</td>
                        <td style={r.tradW > 0 ? { color: '#C0392B', fontWeight: 600 } : undefined}>
                          {fmt(r.taxable)}{r.tradW > 0 ? ' ⚠' : ''}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ fontWeight: 600, borderTop: '2px solid #ddd' }}>
                      <td>Total</td>
                      <td>{fmt(convRows.reduce((s, r) => s + r.conv, 0))}</td>
                      <td>{fmt(totalConvTax)}</td>
                      <td>—</td>
                      <td>{convRows.reduce((s, r) => s + r.conv, 0) > 0 ? pct(totalConvTax / convRows.reduce((s, r) => s + r.conv, 0)) : '—'}</td>
                      <td>—</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {hasShortfall ? (
                <div className="note" style={{ color: '#922B21', background: '#FDEDEC', borderLeft: '3px solid #E74C3C', paddingLeft: '8px' }}>
                  <strong>Warning:</strong> In {shortfallRows.length} conversion year{shortfallRows.length > 1 ? 's' : ''} (age{shortfallRows.length > 1 ? 's' : ''} {shortfallRows.map(r => r.age).join(', ')}),
                  the taxable account ran short and additional traditional IRA withdrawals were needed to cover expenses and taxes (highlighted above).
                  Those extra withdrawals are themselves taxable income — the true tax cost in those years is understated.
                  Consider increasing your taxable account balance or reducing conversion amounts.
                </div>
              ) : (
                <div className="note" style={{ color: '#1A5276', background: '#EBF5FB', borderLeft: '3px solid #3498DB', paddingLeft: '8px' }}>
                  Conversion taxes are modeled as paid from your taxable account. The taxable account remained solvent throughout the conversion period.
                </div>
              )}
            </>
          );
        })()}
      </div>
    );
  };

  const accountsConfigured =
    (inputs.accounts?.length ?? 0) > 0 ||
    inputs.tradBal > 0 || inputs.rothBal > 0 || inputs.taxableBal > 0 || inputs.hsaBal > 0 ||
    inputs.tradContrib > 0 || inputs.rothContrib > 0 || inputs.taxableContrib > 0 || inputs.hsaContrib > 0 ||
    !!inputs.salary;

  const expensesConfigured =
    (inputs.expenseItems?.length ?? 0) > 0 ||
    inputs.expenses > 0 || inputs.healthcareExpenses > 0 ||
    inputs.discretionaryExpenses > 0 || inputs.ltcExpenses > 0;

  type TabDef = { key: typeof activeTab; label: string; category: 'setup' | 'results' | 'tool'; configured?: boolean };
  const tabs: TabDef[] = [
    { key: 'accounts', label: 'Accounts', category: 'setup', configured: accountsConfigured },
    { key: 'expenses', label: 'Expenses', category: 'setup', configured: expensesConfigured },
    { key: 'balance', label: 'Balances', category: 'results' },
    { key: 'income', label: 'Income', category: 'results' },
    { key: 'rmd', label: 'RMDs & Conversions', category: 'results' },
    { key: 'tax', label: 'Tax Analysis', category: 'results' },
    { key: 'cashflow', label: 'Cash Flow', category: 'results' },
    { key: 'optimizer', label: 'Roth Optimizer', category: 'tool' },
    { key: 'mc', label: 'Monte Carlo', category: 'tool' },
  ];

  const tabStyle = (t: TabDef): React.CSSProperties => {
    const isActive = activeTab === t.key;
    if (t.category === 'setup') {
      const configured = t.configured ?? false;
      const fg = configured ? '#1A7A4A' : '#C0392B';
      const bg = configured ? '#EAFAF1' : '#FDEDEC';
      const border = configured ? 'rgba(26,122,74,0.5)' : 'rgba(192,57,43,0.5)';
      return isActive
        ? { background: bg, color: fg, borderColor: border }
        : { color: fg, borderColor: border };
    }
    if (t.category === 'results') {
      return isActive
        ? { background: '#EBF5FB', color: '#1A5276', borderColor: 'rgba(36,113,163,0.5)' }
        : {};
    }
    return isActive
      ? { background: '#E8FAF8', color: '#0B6E5A', borderColor: 'rgba(11,110,90,0.5)' }
      : {};
  };

  return (
    <div className="main">
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

      <div className="tabs">
        {tabs.map((t, i) => {
          const prevCat = i > 0 ? tabs[i - 1].category : null;
          return (
            <React.Fragment key={t.key}>
              {prevCat && prevCat !== t.category && (
                <div style={{ width: '2px', background: 'rgba(0,0,0,0.25)', margin: '2px 6px', alignSelf: 'stretch', borderRadius: '1px' }} />
              )}
              <button
                className={`tab ${activeTab === t.key ? 'active' : ''}`}
                style={tabStyle(t)}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {activeTab === 'balance' && (
        <div className="chart-card">
          <div className="chart-title">Portfolio balances over time</div>
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

          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Year-by-year balances</div>
          <div className="optimizer-table-wrap">
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
                    <tr key={r.age} style={survivorRowStyle(r, r.age === inputs.retireAge ? { borderTop: '2px solid #378ADD' } : undefined)}>
                      <td>
                        {r.age}
                        {r.age === inputs.retireAge && <span style={{ marginLeft: 6, fontSize: 10, color: '#378ADD', fontWeight: 600 }}>RETIRE</span>}
                        <SurvivorTag age={r.age} />
                      </td>
                      <td>{fmt(r.trad)}</td>
                      <td>{fmt(r.roth)}</td>
                      <td>{fmt(r.taxable)}</td>
                      <td>{fmt(r.hsa)}</td>
                      <td style={{ fontWeight: 600 }}>{fmt(r.total)}</td>
                      <td style={{ color: change === null ? undefined : change >= 0 ? '#1D9E75' : '#C0392B' }}>
                        {change === null ? '—' : (change >= 0 ? '+' : '') + fmt(change)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'income' && (
        <div className="chart-card">
          <div className="chart-title">Annual income sources vs expenses</div>
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
          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Annual income & spending detail</div>
          <div className="optimizer-table-wrap">
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
                    <tr key={r.age} style={survivorRowStyle(r, netSpendable < -2000 ? { background: '#FFF5F5' } : undefined)}>
                      <td>{r.age}<SurvivorTag age={r.age} /></td>
                      <td>{salary > 0 ? fmt(salary) : '—'}</td>
                      <td>{r.ss + r.spouseSs > 0 ? fmt(r.ss + r.spouseSs) : '—'}</td>
                      <td>{r.pension > 0 ? fmt(r.pension) : '—'}</td>
                      <td>{r.rmd > 0 ? fmt(r.rmd) : '—'}</td>
                      <td>{r.conv > 0 ? fmt(r.conv) : '—'}</td>
                      <td>{r.tradW > 0 ? fmt(r.tradW) : '—'}</td>
                      <td>{r.rothW > 0 ? fmt(r.rothW) : '—'}</td>
                      <td>{r.taxableW > 0 ? fmt(r.taxableW) : '—'}</td>
                      <td>{r.hsaW > 0 ? fmt(r.hsaW) : '—'}</td>
                      <td style={{ fontWeight: 500 }}>{fmt(totalIn)}</td>
                      <td>{fmt(r.totalSpending)}</td>
                      <td>{fmt(r.totalTax)}</td>
                      <td style={{ color: net < -500 ? '#C0392B' : net > 500 ? '#1D9E75' : undefined }}>
                        {net >= 0 ? '+' : ''}{fmt(net)}
                      </td>
                      <td style={{ color: netSpendable < -2000 ? '#C0392B' : netSpendable > 500 ? '#1D9E75' : undefined, fontWeight: 500 }}>
                        {netSpendable >= 0 ? '+' : ''}{fmt(netSpendable)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="note">
            <strong>Net Spendable</strong> = Total In − Roth Conversion − Spending − Taxes. This is actual cash flow: conversions are trad→Roth transfers, not money you can spend.
            <strong> Net</strong> includes conversions as income (for tax accounting). A negative Net Spendable means the portfolio couldn't fully cover real expenses that year.
          </div>
        </div>
      )}

      {activeTab === 'rmd' && (
        <div className="chart-card">
          <div className="chart-title">RMDs and Roth conversions</div>
          <div className="legend">
            <span className="li"><span className="ls" style={{ background: '#BA7517' }}></span>RMD required</span>
            <span className="li"><span className="ls" style={{ background: '#378ADD' }}></span>Roth conversion</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <Bar data={rmdData()} options={baseOpts(true)} />
          </div>
          {renderRMDDetail()}
        </div>
      )}

      {activeTab === 'tax' && (
        <div className="chart-card">
          <div className="chart-title">Tax analysis over retirement</div>

          <div className="chart-subtitle" style={{ marginTop: '0.25rem' }}>Tax rates</div>
          <div className="legend">
            <span className="li"><span className="ls" style={{ background: '#E74C3C' }}></span>Marginal rate</span>
            <span className="li"><span className="ls" style={{ background: '#3498DB' }}></span>Effective rate</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '180px' }}>
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
              <div className="detail-item detail-highlight">
                <div className="detail-label">Lifetime total tax</div>
                <div className="detail-value">{fmt(allRows.reduce((s, r) => s + r.totalTax, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Federal tax</div>
                <div className="detail-value">{fmt(allRows.reduce((s, r) => s + r.federalTax, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">State tax</div>
                <div className="detail-value">{fmt(allRows.reduce((s, r) => s + r.stateTax, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">IRMAA (Part B + D)</div>
                <div className="detail-value">{fmt(allRows.reduce((s, r) => s + r.irmaaPartB + r.irmaaPartD, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Avg marginal rate</div>
                <div className="detail-value">{pct(allRows.reduce((s, r) => s + r.marginalRate, 0) / Math.max(1, allRows.length))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Peak marginal rate</div>
                <div className="detail-value">{pct(Math.max(...allRows.map(r => r.marginalRate)))}</div>
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

          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Year-by-year tax detail</div>
          <div className="optimizer-table-wrap">
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
                  <tr key={r.age} style={survivorRowStyle(r)}>
                    <td>{r.age}<SurvivorTag age={r.age} /></td>
                    <td>{fmt(r.ordinaryIncome)}</td>
                    <td>{fmt(r.standardDeduction)}</td>
                    <td>{fmt(r.taxableIncome)}</td>
                    <td>{fmt(r.federalTax)}</td>
                    <td>{r.stateTax > 0 ? fmt(r.stateTax) : '—'}</td>
                    <td>{r.irmaaPartB + r.irmaaPartD > 0 ? fmt(r.irmaaPartB + r.irmaaPartD) : '—'}</td>
                    <td style={{ fontWeight: 600 }}>{fmt(r.totalTax)}</td>
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
                  <td>{fmt(allRows.reduce((s, r) => s + r.federalTax, 0))}</td>
                  <td>{fmt(allRows.reduce((s, r) => s + r.stateTax, 0))}</td>
                  <td>{fmt(allRows.reduce((s, r) => s + r.irmaaPartB + r.irmaaPartD, 0))}</td>
                  <td>{fmt(allRows.reduce((s, r) => s + r.totalTax, 0))}</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="note">
            Marginal rate is color-coded: 22%+ is amber, 24%+ is red. Effective rate = (federal + state tax) ÷ gross income.
            IRMAA is based on income from 2 years prior and applies at age 65+.
          </div>
        </div>
      )}

      {activeTab === 'cashflow' && (
        <div className="chart-card">
          <div className="chart-title">Cash flow: income vs spending vs tax</div>
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
                <div className="detail-value">{fmt(allRows[allRows.length - 1]?.total ?? 0)}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Peak withdrawal rate</div>
                <div className="detail-value">
                  {pct(Math.max(...allRows.filter(r => r.portfolioValue > 0).map(r => r.withdrawalRate)))}
                </div>
              </div>
            </div>
          </div>

          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Year-by-year cash flow</div>
          <div className="optimizer-table-wrap">
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
                    <tr key={r.age} style={survivorRowStyle(r, depleted ? { background: '#FFF5F5' } : undefined)}>
                      <td>{r.age}<SurvivorTag age={r.age} /></td>
                      <td>{fmt(totalIn)}</td>
                      <td>{fmt(r.totalSpending)}</td>
                      <td>{fmt(r.totalTax)}</td>
                      <td>{fmt(totalOut)}</td>
                      <td style={{ color: net < -500 ? '#C0392B' : net > 500 ? '#1D9E75' : undefined, fontWeight: 500 }}>
                        {net >= 0 ? '+' : ''}{fmt(net)}
                      </td>
                      <td style={{ color: r.withdrawalRate > 0.06 ? '#C0392B' : r.withdrawalRate > 0.04 ? '#BA7517' : undefined }}>
                        {r.portfolioValue > 0 ? pct(r.withdrawalRate) : '—'}
                      </td>
                      <td style={{ color: depleted ? '#C0392B' : undefined, fontWeight: depleted ? 600 : undefined }}>
                        {fmt(r.portfolioValue)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
                    onChange={e => setOptMinStartAge(Number(e.target.value))}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#1A5276', minWidth: '28px' }}>{optMinStartAge}</span>
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

                {/* Comparison table */}
                <div className="optimizer-table-wrap">
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
                    <>
                      <div className="chart-subtitle" style={{ marginTop: '1.5rem' }}>Conversion start age analysis</div>
                      <div className="note" style={{ marginBottom: '0.5rem' }}>
                        Each row tests all 4 brackets × 4 until-ages (16 combos) and shows the independently optimized best for each metric. Apply uses the schedule matching your current goal.
                      </div>
                      <div className="optimizer-table-wrap">
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
                      </div>
                    </>
                  );
                })()}

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

                {/* Year-by-year conversion schedule for active strategy */}
                <div className="chart-subtitle" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Recommended conversion schedule</span>
                  {conversionSchedule ? (
                    <span style={{ fontSize: '11px', color: '#27AE60', fontWeight: 600 }}>
                      ✓ Applied to projection —{' '}
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
        const N = 1000;
        const startBal = rows[retireIn]?.total ?? 0;
        const years = allRows.length;

        // Run all simulations in one pass, tracking balance at each year
        const balsByYear: number[][] = Array.from({ length: years }, () => []);
        for (let sim = 0; sim < N; sim++) {
          let bal = startBal;
          for (let y = 0; y < years; y++) {
            const randReturn = inputs.r + (Math.random() + Math.random() + Math.random() - 1.5) * 0.15;
            const row = allRows[y];
            const net = (row?.ss ?? 0) + (row?.spouseSs ?? 0) - (row?.totalSpending ?? 0) - (row?.totalTax ?? 0);
            bal = Math.max(0, bal * (1 + randReturn) + net);
            balsByYear[y].push(bal);
          }
        }

        const ptile = (arr: number[], p: number) => {
          const s = [...arr].sort((a, b) => a - b);
          return s[Math.max(0, Math.floor(p * s.length) - 1)];
        };

        const successRates = balsByYear.map(ys => Math.round((ys.filter(v => v > 0).length / N) * 100));
        const p10 = balsByYear.map(ys => ptile(ys, 0.10));
        const p25 = balsByYear.map(ys => ptile(ys, 0.25));
        const p50 = balsByYear.map(ys => ptile(ys, 0.50));
        const p75 = balsByYear.map(ys => ptile(ys, 0.75));
        const p90 = balsByYear.map(ys => ptile(ys, 0.90));
        const labels = allRows.map(r => String(r.age));

        const finalSR = successRates[successRates.length - 1] ?? 0;
        const medianFinal = p50[p50.length - 1] ?? 0;
        const p10Final = p10[p10.length - 1] ?? 0;
        const p90Final = p90[p90.length - 1] ?? 0;

        const keyAges = [70, 75, 80, 85, 90, inputs.lifeExp]
          .filter((a, i, arr) => arr.indexOf(a) === i && a >= inputs.retireAge && a <= inputs.lifeExp);

        const srColor = (sr: number) => sr >= 90 ? '#1D9E75' : sr >= 75 ? '#BA7517' : '#C0392B';

        return (
          <div className="chart-card">
            <div className="chart-title">Monte Carlo — {N} simulated retirements</div>

            <div className="detail-panel" style={{ marginBottom: '1rem' }}>
              <div className="detail-grid">
                <div className="detail-item" style={{ background: finalSR >= 90 ? '#EBF5FB' : finalSR >= 75 ? '#FEF9E7' : '#FDEDEC' }}>
                  <div className="detail-label">Success rate at {inputs.lifeExp}</div>
                  <div className="detail-value" style={{ color: srColor(finalSR), fontSize: '1.3rem' }}>{finalSR}%</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Median portfolio at {inputs.lifeExp}</div>
                  <div className="detail-value">{fmt(medianFinal)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Worst 10% at {inputs.lifeExp}</div>
                  <div className="detail-value" style={{ color: p10Final <= 0 ? '#C0392B' : undefined }}>{fmt(p10Final)}</div>
                </div>
                <div className="detail-item">
                  <div className="detail-label">Best 10% at {inputs.lifeExp}</div>
                  <div className="detail-value">{fmt(p90Final)}</div>
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
                    const idx = allRows.findIndex(r => r.age === age);
                    if (idx === -1) return null;
                    const sr = successRates[idx];
                    return (
                      <tr key={age}>
                        <td style={{ fontWeight: age === inputs.lifeExp ? 600 : undefined }}>
                          {age}{age === inputs.lifeExp ? ' ★' : ''}
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
              <strong>How this works:</strong> Each simulation runs your full retirement using the same projected spending, taxes, and Social Security, but with a different random sequence of investment returns (average {pct(inputs.r)}, standard deviation ~15% — roughly matching historical stock/bond mix volatility).
              <br /><strong>Success</strong> = portfolio still has money at that age.
              <strong> Percentiles</strong> show the spread of outcomes — "Worst 10%" means 9 out of 10 simulations did better than this number.
              Only returns are randomized; spending shocks, sequence-of-returns risk in early retirement, and inflation variability are not modeled.
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Main;