import React from 'react';
import type { InputParams, ProjectionRow } from '../types';
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
  activeTab: 'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer';
  setActiveTab: (tab: 'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer') => void;
  rows: ProjectionRow[];
  metrics: { m1: string; m2: string; m3: string; m4: string };
  optimization: import('../optimizer').OptimizationOutput | null;
  optTimestamp: number;
}

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1000) return sign + '$' + Math.round(abs / 1000) + 'K';
  return sign + '$' + Math.round(abs);
};

const pct = (n: number): string => (n * 100).toFixed(1) + '%';

const Main: React.FC<MainProps> = ({ inputs, activeTab, setActiveTab, rows, metrics, optimization, optTimestamp }) => {
  const retireIn = Math.max(1, inputs.retireAge - inputs.age);
  const retRows = rows.slice(retireIn);

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
    labels: retRows.map(r => String(r.age)),
    datasets: [
      { label: 'RMD', data: retRows.map(r => r.rmd), backgroundColor: '#BA7517', stack: 'income', type: 'bar' as const },
      { label: 'Conversion', data: retRows.map(r => r.conv), backgroundColor: '#378ADD', stack: 'income', type: 'bar' as const },
      { label: 'Traditional IRA withdrawal', data: retRows.map(r => r.tradW), backgroundColor: '#5DADE2', stack: 'income', type: 'bar' as const },
      { label: 'Roth IRA withdrawal', data: retRows.map(r => r.rothW), backgroundColor: '#1D9E75', stack: 'income', type: 'bar' as const },
      { label: 'Taxable account withdrawal', data: retRows.map(r => r.taxableW), backgroundColor: '#9B59B6', stack: 'income', type: 'bar' as const },
      { label: 'HSA withdrawal', data: retRows.map(r => r.hsaW), backgroundColor: '#F39C12', stack: 'income', type: 'bar' as const },
      { label: 'SS (primary)', data: retRows.map(r => r.ss), backgroundColor: '#9FE1CB', stack: 'income', type: 'bar' as const },
      { label: 'SS (spouse)', data: retRows.map(r => r.spouseSs), backgroundColor: '#76D7C4', stack: 'income', type: 'bar' as const },
      { label: 'Taxes', data: retRows.map(r => -r.totalTax), backgroundColor: '#F09595', stack: 'tax', type: 'bar' as const },
      { label: 'Expenses', data: retRows.map(r => r.totalSpending), type: 'line' as const, borderColor: '#D85A30', backgroundColor: 'transparent', pointRadius: 0, tension: 0.3, borderWidth: 2, order: 0 },
    ] as any,
  });

  // ----- RMD Chart -----
  const rmdData = (): ChartData<'bar', number[], string> => ({
    labels: retRows.map(r => String(r.age)),
    datasets: [
      { label: 'RMD required', data: retRows.map(r => r.rmd), backgroundColor: '#BA7517', stack: 'a', type: 'bar' },
      { label: 'Roth conversion', data: retRows.map(r => r.conv), backgroundColor: '#378ADD', stack: 'a', type: 'bar' },
    ],
  });

  // ----- Tax Chart (marginal + effective rate) -----
  const taxData = (): ChartData<'line', number[], string> => ({
    labels: retRows.map(r => String(r.age)),
    datasets: [
      { label: 'Marginal rate', data: retRows.map(r => r.marginalRate * 100), borderColor: '#E74C3C', backgroundColor: 'rgba(231,76,60,0.08)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'Effective rate', data: retRows.map(r => r.effectiveRate * 100), borderColor: '#3498DB', backgroundColor: 'rgba(52,152,219,0.08)', fill: true, pointRadius: 0, tension: 0.3, borderWidth: 2 },
      { label: 'Federal tax', data: retRows.map(r => r.federalTax), borderColor: '#E67E22', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3, borderWidth: 1.5, yAxisID: 'yTax' },
      { label: 'State tax', data: retRows.map(r => r.stateTax), borderColor: '#F39C12', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3, borderWidth: 1.5, yAxisID: 'yTax' },
      { label: 'IRMAA (B+D)', data: retRows.map(r => r.irmaaPartB + r.irmaaPartD), borderColor: '#8E44AD', backgroundColor: 'transparent', fill: false, pointRadius: 0, tension: 0.3, borderWidth: 1.5, borderDash: [3, 3], yAxisID: 'yTax' },
    ],
  });

  // ----- Cashflow Chart -----
  const cashflowData = (): ChartData<'bar', number[], string> => ({
    labels: retRows.map(r => String(r.age)),
    datasets: [
      { label: 'Total income', data: retRows.map(r => r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW + r.ss + r.spouseSs), backgroundColor: '#27AE60', stack: 'cf', type: 'bar' as const },
      { label: 'Total spending', data: retRows.map(r => -r.totalSpending), backgroundColor: '#E74C3C', stack: 'cf', type: 'bar' as const },
      { label: 'Total tax', data: retRows.map(r => -r.totalTax), backgroundColor: '#F09595', stack: 'cf', type: 'bar' as const },
    ] as any,
  });

  // Monte Carlo is computed inline in the tab render to keep all data in one place.

  // ----- Chart Options -----
  const baseOpts = (stacked = false, yMin?: number, yMax?: number, y2 = false): ChartOptions<'bar' | 'line'> => {
    const opts: any = {
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
              if (ctx.dataset.yAxisID === 'yTax') {
                l += fmt(ctx.parsed.y);
              } else if (activeTab === 'tax' && ctx.datasetIndex < 2) {
                l += ctx.parsed.y.toFixed(1) + '%';
              } else if (activeTab === 'mc') {
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
    };
    if (y2) {
      opts.scales.yTax = {
        position: 'right',
        ticks: { callback: (v: number | string) => fmt(Number(v)), font: { size: 10 }, maxTicksLimit: 5 },
        grid: { display: false },
      };
    }
    return opts;
  };

  // ----- RMD/SS interaction detail panel -----
  const renderRMDDetail = () => {
    const rmdRows = retRows.filter(r => r.rmd > 0 || r.conv > 0 || r.ss > 0);
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
          const convRows = retRows.filter(r => r.conv > 0);
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
                      <tr key={r.age} style={r.tradW > 0 ? { background: '#FFF5F5' } : undefined}>
                        <td>{r.age}</td>
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

  const tabs = [
    { key: 'balance' as const, label: 'Balances' },
    { key: 'income' as const, label: 'Income' },
    { key: 'rmd' as const, label: 'RMDs & Conversions' },
    { key: 'tax' as const, label: 'Tax Analysis' },
    { key: 'cashflow' as const, label: 'Cash Flow' },
    { key: 'optimizer' as const, label: 'Roth Optimizer' },
    { key: 'mc' as const, label: 'Monte Carlo' },
  ];

  return (
    <div className="main">
      <div className="metrics">
        <div className="metric-card">
          <div className="mlabel">Total at retirement</div>
          <div className="mval">{metrics.m1}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">Est. tax drag/yr</div>
          <div className="mval">{metrics.m2}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">Peak RMD (est.)</div>
          <div className="mval">{metrics.m3}</div>
        </div>
        <div className="metric-card">
          <div className="mlabel">Monthly gap at SS</div>
          <div className="mval">{metrics.m4}</div>
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${activeTab === t.key ? 'active' : ''}`} onClick={() => setActiveTab(t.key)}>
            {t.label}
          </button>
        ))}
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
                    <tr key={r.age} style={r.age === inputs.retireAge ? { borderTop: '2px solid #378ADD' } : undefined}>
                      <td>
                        {r.age}
                        {r.age === inputs.retireAge && <span style={{ marginLeft: 6, fontSize: 10, color: '#378ADD', fontWeight: 600 }}>RETIRE</span>}
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
            <span className="li"><span className="ls" style={{ background: '#BA7517' }}></span>RMD</span>
            <span className="li"><span className="ls" style={{ background: '#378ADD' }}></span>Conversion</span>
            <span className="li"><span className="ls" style={{ background: '#5DADE2' }}></span>Traditional IRA withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#1D9E75' }}></span>Roth IRA withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#9B59B6' }}></span>Taxable account withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#F39C12' }}></span>HSA withdrawal</span>
            <span className="li"><span className="ls" style={{ background: '#9FE1CB' }}></span>SS (primary)</span>
            <span className="li"><span className="ls" style={{ background: '#76D7C4' }}></span>SS (spouse)</span>
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
                  <th>Social Security</th>
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
                  <th title="Net excluding Roth conversion (conversion is a trad→Roth transfer, not spendable cash)">Net Spendable</th>
                </tr>
              </thead>
              <tbody>
                {retRows.map(r => {
                  const totalIn = r.ss + r.spouseSs + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW;
                  const net = totalIn - r.totalSpending - r.totalTax;
                  const netSpendable = totalIn - r.conv - r.totalSpending - r.totalTax;
                  return (
                    <tr key={r.age} style={netSpendable < -500 ? { background: '#FFF5F5' } : undefined}>
                      <td>{r.age}</td>
                      <td>{r.ss + r.spouseSs > 0 ? fmt(r.ss + r.spouseSs) : '—'}</td>
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
                      <td style={{ color: netSpendable < -500 ? '#C0392B' : netSpendable > 500 ? '#1D9E75' : undefined, fontWeight: 500 }}>
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
          <div className="legend">
            <span className="li"><span className="ls" style={{ background: '#E74C3C' }}></span>Marginal rate</span>
            <span className="li"><span className="ls" style={{ background: '#3498DB' }}></span>Effective rate</span>
            <span className="li"><span className="ls" style={{ background: '#E67E22' }}></span>Federal tax</span>
            <span className="li"><span className="ls" style={{ background: '#F39C12' }}></span>State tax</span>
            <span className="li"><span className="ls" style={{ background: '#8E44AD', height: '3px', borderRadius: 0, width: '14px' }}></span>IRMAA (B+D)</span>
          </div>
          <div style={{ position: 'relative', width: '100%', height: '280px' }}>
            <Line data={taxData()} options={baseOpts(false, undefined, undefined, true)} />
          </div>
          <div className="detail-panel">
            <div className="detail-grid">
              <div className="detail-item detail-highlight">
                <div className="detail-label">Lifetime total tax</div>
                <div className="detail-value">{fmt(retRows.reduce((s, r) => s + r.totalTax, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Federal tax</div>
                <div className="detail-value">{fmt(retRows.reduce((s, r) => s + r.federalTax, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">State tax</div>
                <div className="detail-value">{fmt(retRows.reduce((s, r) => s + r.stateTax, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">IRMAA (Part B + D)</div>
                <div className="detail-value">{fmt(retRows.reduce((s, r) => s + r.irmaaPartB + r.irmaaPartD, 0))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Avg marginal rate (retirement)</div>
                <div className="detail-value">{pct(retRows.reduce((s, r) => s + r.marginalRate, 0) / Math.max(1, retRows.length))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Peak marginal rate</div>
                <div className="detail-value">{pct(Math.max(...retRows.map(r => r.marginalRate)))}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Avg taxable SS %</div>
                <div className="detail-value">
                  {(() => {
                    const withSS = retRows.filter(r => r.ss > 0);
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
                {retRows.map(r => (
                  <tr key={r.age}>
                    <td>{r.age}</td>
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
                  <td>{fmt(retRows.reduce((s, r) => s + r.federalTax, 0))}</td>
                  <td>{fmt(retRows.reduce((s, r) => s + r.stateTax, 0))}</td>
                  <td>{fmt(retRows.reduce((s, r) => s + r.irmaaPartB + r.irmaaPartD, 0))}</td>
                  <td>{fmt(retRows.reduce((s, r) => s + r.totalTax, 0))}</td>
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
                    const depleted = retRows.find(r => r.total <= 0);
                    return depleted ? depleted.age : 'Never (funded)';
                  })()}
                </div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Final portfolio value</div>
                <div className="detail-value">{fmt(retRows[retRows.length - 1]?.total ?? 0)}</div>
              </div>
              <div className="detail-item">
                <div className="detail-label">Peak withdrawal rate</div>
                <div className="detail-value">
                  {pct(Math.max(...retRows.filter(r => r.portfolioValue > 0).map(r => r.withdrawalRate)))}
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
                {retRows.map(r => {
                  const totalIn = r.ss + r.spouseSs + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW;
                  const totalOut = r.totalSpending + r.totalTax;
                  const net = totalIn - totalOut;
                  const depleted = r.total <= 0;
                  return (
                    <tr key={r.age} style={depleted ? { background: '#FFF5F5' } : undefined}>
                      <td>{r.age}</td>
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

      {activeTab === 'optimizer' && (
        <div className="chart-card">
          <div className="chart-title">Roth Conversion Optimizer <span className="opt-timestamp">Updated {new Date(optTimestamp).toLocaleTimeString()}</span></div>
          {optimization ? (
            <>
              {/* Recommendation banner */}
              <div className="optimizer-banner">
                <div className="optimizer-rec-label">Recommended strategy</div>
                <div className="optimizer-rec-name">{optimization.best.strategy.name}</div>
                <div className="optimizer-rec-desc">{optimization.best.strategy.description}</div>
                <div className="optimizer-rec-params">
                  <span className="opt-param">Target bracket: <strong>{['10%','12%','22%','24%'][optimization.recommendedBracket]}</strong></span>
                  <span className="opt-param">Convert until age: <strong>{optimization.recommendedUntilAge || 'N/A'}</strong></span>
                  <span className="opt-param">Avg annual: <strong>{fmt(optimization.recommendedAvgAnnual)}/yr</strong></span>
                </div>
                <div className="optimizer-savings">
                  {optimization.savingsVsCurrent > 0
                    ? `Saves ${fmt(optimization.savingsVsCurrent)} in lifetime taxes vs your current settings`
                    : optimization.savingsVsBaseline > 0
                    ? `Saves ${fmt(optimization.savingsVsBaseline)} vs no conversions`
                    : 'No conversion strategy beats the no-conversion baseline'}
                </div>
              </div>

              {/* Comparison table */}
              <div className="optimizer-table-wrap">
                <table className="optimizer-table">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th>Lifetime Tax</th>
                      <th>Federal</th>
                      <th>IRMAA</th>
                      <th>Peak Marginal</th>
                      <th>Terminal Trad</th>
                      <th>Terminal Roth</th>
                      <th>Terminal Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optimization.strategies.map((s, i) => {
                      const isBest = s.strategy.name === optimization.best.strategy.name;
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
                          <td>{fmt(s.lifetimeFederalTax)}</td>
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

              {/* Lifetime tax comparison chart */}
              <div className="chart-subtitle">Lifetime total tax comparison</div>
              <div style={{ position: 'relative', width: '100%', height: '200px' }}>
                <Bar
                  data={{
                    labels: optimization.strategies.map(s => s.strategy.name),
                    datasets: [{
                      label: 'Lifetime tax',
                      data: optimization.strategies.map(s => s.lifetimeTotalTax),
                      backgroundColor: optimization.strategies.map(s =>
                        s.strategy.name === optimization.best.strategy.name
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
                      tooltip: {
                        callbacks: {
                          label: (ctx: any) => fmt(ctx.parsed.x),
                        },
                      },
                    },
                    scales: {
                      x: {
                        ticks: { callback: (v: number | string) => fmt(Number(v)), font: { size: 10 } },
                        grid: { color: 'rgba(128,128,128,0.1)' },
                      },
                      y: {
                        ticks: { font: { size: 10 } },
                        grid: { display: false },
                      },
                    },
                  } as any}
                />
              </div>

              {/* Year-by-year conversion schedule for recommended strategy */}
              <div className="chart-subtitle">Recommended conversion schedule</div>
              {(() => {
                const schedule = optimization.recommendedSchedule;
                const ages = Object.keys(schedule).map(Number).sort((a, b) => a - b);
                if (ages.length === 0) {
                  return <div className="note">No conversions recommended for this scenario.</div>;
                }
                return (
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
                        {ages.map((age, i) => {
                          const cum = ages.slice(0, i + 1).reduce((s, a) => s + schedule[a], 0);
                          const tradEst = optimization.best.rows.find(r => r.age === age)?.trad ?? 0;
                          return (
                            <tr key={age}>
                              <td>{age}</td>
                              <td>{fmt(schedule[age])}</td>
                              <td>{fmt(cum)}</td>
                              <td>{fmt(tradEst)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Savings breakdown */}
              {optimization.savingsVsBaseline > 0 && (
                <div className="detail-panel" style={{ marginTop: '1rem' }}>
                  <div className="detail-section-title">Where the savings come from</div>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <div className="detail-label">Federal tax saved</div>
                      <div className="detail-value">
                        {fmt(optimization.baseline.lifetimeFederalTax - optimization.best.lifetimeFederalTax)}
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">IRMAA saved</div>
                      <div className="detail-value">
                        {fmt(optimization.baseline.lifetimeIRMAA - optimization.best.lifetimeIRMAA)}
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Peak marginal rate reduction</div>
                      <div className="detail-value">
                        {pct(optimization.baseline.peakMarginalRate)} → {pct(optimization.best.peakMarginalRate)}
                      </div>
                    </div>
                    <div className="detail-item">
                      <div className="detail-label">Roth at death</div>
                      <div className="detail-value">
                        {fmt(optimization.baseline.terminalRoth)} → {fmt(optimization.best.terminalRoth)}
                      </div>
                    </div>
                  </div>
                  <div className="note">
                    Converting early at lower rates reduces future RMDs, which lowers marginal rates during RMD years,
                    which reduces SS taxation and IRMAA surcharges. The optimal strategy fills brackets when current
                    rates are lower than expected future rates.
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="note">Optimizer is computing...</div>
          )}
        </div>
      )}

      {activeTab === 'mc' && (() => {
        const N = 500;
        const startBal = rows[retireIn]?.total ?? 0;
        const years = retRows.length;

        // Run all simulations in one pass, tracking balance at each year
        const balsByYear: number[][] = Array.from({ length: years }, () => []);
        for (let sim = 0; sim < N; sim++) {
          let bal = startBal;
          for (let y = 0; y < years; y++) {
            const randReturn = inputs.r + (Math.random() + Math.random() + Math.random() - 1.5) * 0.15;
            const row = retRows[y];
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
        const labels = retRows.map(r => String(r.age));

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
                    const idx = retRows.findIndex(r => r.age === age);
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