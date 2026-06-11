import React, { useState } from 'react';
import type { InputParams, ExpenseItem, ExpenseCategory, ExpenseInflationType } from '../types';
import { computeLoanPayoffMonths } from '../financial';
import TipLabel from './TipLabel';

interface Props {
  inputs: InputParams;
  onItemsChange: (items: ExpenseItem[]) => void;
  onInputChange: (field: keyof InputParams, value: string | number | boolean) => void;
}

const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'housing', label: 'Housing' },
  { value: 'transport', label: 'Transportation' },
  { value: 'food', label: 'Food & Living' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'discretionary', label: 'Discretionary' },
  { value: 'loan', label: 'Loan (other)' },
  { value: 'other', label: 'Other' },
];

const INFL_OPTS: { value: ExpenseInflationType; label: string }[] = [
  { value: 'general', label: 'Expense infl.' },
  { value: 'healthcare', label: 'HC infl.' },
  { value: 'cpi', label: 'General CPI' },
  { value: 'fixed', label: 'Fixed' },
];

const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
const newId = () => Math.random().toString(36).slice(2, 10);

const subTabBtn = (active: boolean): React.CSSProperties => ({
  padding: '7px 18px',
  fontSize: '13px',
  fontWeight: 600,
  border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  borderRadius: '8px',
  background: active ? 'rgba(103,212,197,0.14)' : 'var(--panel-2)',
  color: active ? 'var(--accent)' : 'var(--text-muted)',
  cursor: 'pointer',
});

export const ExpenseTab: React.FC<Props> = ({ inputs, onItemsChange, onInputChange }) => {
  const items = inputs.expenseItems ?? [];
  const hasItems = items.length > 0;
  const [subTab, setSubTab] = useState<'basic' | 'advanced'>(() => hasItems ? 'advanced' : 'basic');

  const { age, retireAge, lifeExp, expenseInflationRate, healthcareInflationRate, inf } = inputs;

  // ---- Advanced tab state ----
  const recurring = items.filter(i => !i.isLoan && !i.isOneTime);
  const loans = items.filter(i => i.isLoan);
  const oneTimeItems = items.filter(i => i.isOneTime);

  const update = (id: string, patch: Partial<ExpenseItem>) =>
    onItemsChange(items.map(i => i.id === id ? { ...i, ...patch } : i));

  const remove = (id: string) => onItemsChange(items.filter(i => i.id !== id));

  const addRecurring = () => onItemsChange([...items, {
    id: newId(), name: 'New expense', category: 'housing' as ExpenseCategory,
    monthly: 0, inflationType: 'general' as ExpenseInflationType, startAge: age,
  }]);

  const addLoan = () => onItemsChange([...items, {
    id: newId(), name: 'New loan', category: 'loan' as ExpenseCategory,
    monthly: 0, inflationType: 'fixed' as ExpenseInflationType,
    isLoan: true, loanBalance: 0, loanRate: 0.065,
  }]);

  const addOneTime = () => onItemsChange([...items, {
    id: newId(), name: 'One-time expense', category: 'other' as ExpenseCategory,
    monthly: 0, inflationType: 'general' as ExpenseInflationType,
    isOneTime: true, atAge: retireAge,
  }]);

  const getInfl = (type: ExpenseInflationType, years: number) => {
    if (type === 'general') return Math.pow(1 + expenseInflationRate, years);
    if (type === 'healthcare') return Math.pow(1 + healthcareInflationRate, years);
    if (type === 'cpi') return Math.pow(1 + inf, years);
    return 1;
  };

  const loanPayoffAge = (item: ExpenseItem): number | null => {
    if (!item.loanBalance || !item.monthly || item.loanBalance <= 0) return null;
    const m = computeLoanPayoffMonths(item.loanBalance, item.monthly, item.loanRate ?? 0);
    return isFinite(m) ? age + m / 12 : null;
  };

  // Summary for advanced tab
  const yearsToRetire = Math.max(0, retireAge - age);
  let totalNow = 0, totalAtRetire = 0;
  for (const item of recurring) {
    const start = item.startAge ?? age;
    const end = item.endAge ?? lifeExp;
    if (age >= start && age <= end) totalNow += item.monthly;
    if (retireAge >= start && retireAge <= end) totalAtRetire += item.monthly * getInfl(item.inflationType, yearsToRetire);
  }
  for (const item of loans) {
    if (!item.loanBalance || !item.monthly) continue;
    const payoff = loanPayoffAge(item);
    if (payoff === null || age <= payoff) totalNow += item.monthly;
    if (payoff === null || retireAge <= payoff) totalAtRetire += item.monthly;
  }

  const catBreakdown: Partial<Record<string, number>> = {};
  for (const item of recurring) {
    const start = item.startAge ?? age;
    const end = item.endAge ?? lifeExp;
    if (retireAge >= start && retireAge <= end) {
      const cat = CATEGORIES.find(c => c.value === item.category)?.label ?? item.category;
      catBreakdown[cat] = (catBreakdown[cat] ?? 0) + item.monthly * getInfl(item.inflationType, yearsToRetire);
    }
  }
  for (const item of loans) {
    if (!item.monthly) continue;
    const payoff = loanPayoffAge(item);
    if (payoff === null || retireAge <= payoff) {
      catBreakdown['Loans'] = (catBreakdown['Loans'] ?? 0) + item.monthly;
    }
  }

  const inputStyle: React.CSSProperties = { padding: '5px 7px', fontSize: '12px', border: '1px solid var(--border-strong)', borderRadius: '6px', width: '100%', background: 'var(--panel-3)', color: 'var(--text)' };
  const selectStyle: React.CSSProperties = { ...inputStyle };
  const btnStyle = (color: string): React.CSSProperties => ({
    padding: '4px 9px', fontSize: '11px', background: color, color: '#fff',
    border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
  });

  const renderBasic = () => {
    const disabled = hasItems;
    return (
      <div>
        {disabled && (
          <div style={{ fontSize: '11px', color: '#1A5276', background: '#EAF4FB', border: '1px solid #AED6F1', borderRadius: '4px', padding: '8px 10px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>{items.length} expense item{items.length !== 1 ? 's' : ''} active</strong> — these fields are overridden by the Advanced expense items.</span>
            <button onClick={() => setSubTab('advanced')} style={{ fontSize: '11px', padding: '2px 8px', background: '#1A5276', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: '10px' }}>
              View items
            </button>
          </div>
        )}
        <div style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
          <div className="detail-section-title">Monthly Spending</div>
          <div className="field">
            <TipLabel text="Base monthly expenses ($)" />
            <input type="number" value={inputs.expenses} step={100} style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
              onInput={(e) => onInputChange('expenses', Number((e.target as HTMLInputElement).value) || 0)} />
          </div>
          <div className="two-col">
            <div className="field">
              <TipLabel text="Healthcare ($/mo)" />
              <input type="number" value={inputs.healthcareExpenses} step={50} style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
                onInput={(e) => onInputChange('healthcareExpenses', Number((e.target as HTMLInputElement).value) || 0)} />
            </div>
            <div className="field">
              <TipLabel text="Discretionary ($/mo)" />
              <input type="number" value={inputs.discretionaryExpenses} step={50} style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
                onInput={(e) => onInputChange('discretionaryExpenses', Number((e.target as HTMLInputElement).value) || 0)} />
            </div>
          </div>
          <div className="field">
            <TipLabel text="LTC reserve ($/mo, from age 80)" />
            <input type="number" value={inputs.ltcExpenses} step={100} style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
              onInput={(e) => onInputChange('ltcExpenses', Number((e.target as HTMLInputElement).value) || 0)} />
          </div>

          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Inflation Rates</div>
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <TipLabel text="Expense inflation (%)" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A5276' }}>{(inputs.expenseInflationRate * 100).toFixed(2)}%</span>
            </div>
            <input type="range" min={1} max={6} value={inputs.expenseInflationRate * 100} step={0.25} style={{ width: '100%' }}
              onInput={(e) => onInputChange('expenseInflationRate', Number((e.target as HTMLInputElement).value) / 100)} />
          </div>
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
              <TipLabel text="Healthcare inflation (%)" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A5276' }}>{(inputs.healthcareInflationRate * 100).toFixed(1)}%</span>
            </div>
            <input type="range" min={2} max={10} value={inputs.healthcareInflationRate * 100} step={0.5} style={{ width: '100%' }}
              onInput={(e) => onInputChange('healthcareInflationRate', Number((e.target as HTMLInputElement).value) / 100)} />
          </div>
        </div>
      </div>
    );
  };

  const renderAdvanced = () => (
    <>
      {/* Summary */}
      <div className="detail-panel" style={{ marginBottom: '1.2rem' }}>
        <div className="detail-grid">
          <div className="detail-item detail-highlight">
            <div className="detail-label">Total monthly now</div>
            <div className="detail-value">{fmt(totalNow)}/mo</div>
          </div>
          <div className="detail-item detail-highlight">
            <div className="detail-label">Monthly at retirement (age {retireAge})</div>
            <div className="detail-value">{fmt(totalAtRetire)}/mo</div>
          </div>
          <div className="detail-item detail-highlight">
            <div className="detail-label">Annual at retirement</div>
            <div className="detail-value">{fmt(totalAtRetire * 12)}/yr</div>
          </div>
          {hasItems && (
            <div className="detail-item">
              <div className="detail-label">Status</div>
              <div className="detail-value" style={{ color: '#1D9E75', fontWeight: 600 }}>Active in projection</div>
            </div>
          )}
        </div>
        {Object.keys(catBreakdown).length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#555', marginBottom: '4px' }}>Retirement spending by category (monthly)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.entries(catBreakdown).map(([cat, amt]) => (
                <div key={cat} style={{ background: '#F5F5F5', borderRadius: '4px', padding: '3px 8px', fontSize: '11px' }}>
                  <span style={{ color: '#666' }}>{cat}:</span> <strong>{fmt(amt!)}/mo</strong>
                </div>
              ))}
            </div>
          </div>
        )}
        {hasItems && (
          <div className="note" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            These expense items are active in your projection and replace the Basic spending fields.
            LTC reserve (Basic tab) still applies independently.
          </div>
        )}
      </div>

      {/* Recurring Expenses */}
      <div className="detail-section-title">Recurring Expenses</div>
      {recurring.length > 0 && (
        <div className="optimizer-table-wrap" style={{ marginBottom: '0.5rem' }}>
          <table className="optimizer-table opt-schedule-table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Name</th>
                <th>Category</th>
                <th>Monthly ($)</th>
                <th>Inflation</th>
                <th>Start age</th>
                <th>End age</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recurring.map(item => (
                <tr key={item.id}>
                  <td><input style={inputStyle} value={item.name} onChange={e => update(item.id, { name: e.target.value })} /></td>
                  <td>
                    <select style={selectStyle} value={item.category} onChange={e => update(item.id, { category: e.target.value as ExpenseCategory })}>
                      {CATEGORIES.filter(c => c.value !== 'loan').map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </td>
                  <td><input style={inputStyle} type="number" value={item.monthly || ''} step={50} onChange={e => update(item.id, { monthly: Number(e.target.value) || 0 })} /></td>
                  <td>
                    <select style={selectStyle} value={item.inflationType} onChange={e => update(item.id, { inflationType: e.target.value as ExpenseInflationType })}>
                      {INFL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td><input style={{ ...inputStyle, width: 52 }} type="number" value={item.startAge ?? age} onChange={e => update(item.id, { startAge: Number(e.target.value) || age })} /></td>
                  <td><input style={{ ...inputStyle, width: 52 }} type="number" value={item.endAge ?? ''} placeholder={String(lifeExp)} onChange={e => update(item.id, { endAge: Number(e.target.value) || undefined })} /></td>
                  <td><button style={btnStyle('#C0392B')} onClick={() => remove(item.id)}>&#x2715;</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button style={{ ...btnStyle('#1A5276'), marginBottom: '1.2rem' }} onClick={addRecurring}>+ Add expense</button>

      {/* Loans */}
      <div className="detail-section-title">Loans</div>
      {loans.length > 0 && (
        <div className="optimizer-table-wrap" style={{ marginBottom: '0.5rem' }}>
          <table className="optimizer-table opt-schedule-table">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Name</th>
                <th>Balance ($)</th>
                <th>Monthly payment ($)</th>
                <th>Interest rate (%)</th>
                <th>Payoff age</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loans.map(item => {
                const payoff = loanPayoffAge(item);
                const payoffDisplay = payoff !== null
                  ? `Age ${payoff.toFixed(1)} (${Math.round((payoff - age) * 12)} mo)`
                  : item.monthly > 0 && item.loanBalance && item.loanBalance > 0
                    ? 'Payment too low'
                    : '—';
                const payoffColor = payoff !== null && payoff > retireAge ? '#BA7517' : '#1D9E75';
                return (
                  <tr key={item.id}>
                    <td><input style={inputStyle} value={item.name} onChange={e => update(item.id, { name: e.target.value })} /></td>
                    <td><input style={inputStyle} type="number" value={item.loanBalance || ''} step={1000} onChange={e => update(item.id, { loanBalance: Number(e.target.value) || 0 })} /></td>
                    <td><input style={inputStyle} type="number" value={item.monthly || ''} step={50} onChange={e => update(item.id, { monthly: Number(e.target.value) || 0 })} /></td>
                    <td><input style={{ ...inputStyle, width: 60 }} type="number" value={((item.loanRate ?? 0) * 100).toFixed(2)} step={0.125} onChange={e => update(item.id, { loanRate: Number(e.target.value) / 100 })} /></td>
                    <td style={{ color: payoffColor, fontWeight: 600, fontSize: '11px' }}>{payoffDisplay}</td>
                    <td><button style={btnStyle('#C0392B')} onClick={() => remove(item.id)}>&#x2715;</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button style={{ ...btnStyle('#1A5276'), marginBottom: '1.2rem' }} onClick={addLoan}>+ Add loan</button>

      {/* One-Time Expenses */}
      <div className="detail-section-title">One-Time Expenses</div>
      <div className="note" style={{ marginBottom: '0.4rem' }}>
        Amounts in today's dollars — inflated to the target age using expense inflation rate.
      </div>
      {oneTimeItems.length > 0 && (
        <div className="optimizer-table-wrap" style={{ marginBottom: '0.5rem' }}>
          <table className="optimizer-table opt-schedule-table">
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Description</th>
                <th>Amount (today $)</th>
                <th>At age</th>
                <th>Inflated amount</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {oneTimeItems.map(item => {
                const targetAge = item.atAge ?? retireAge;
                const yearsOut = Math.max(0, targetAge - age);
                const inflated = item.monthly * Math.pow(1 + expenseInflationRate, yearsOut);
                return (
                  <tr key={item.id}>
                    <td><input style={inputStyle} value={item.name} onChange={e => update(item.id, { name: e.target.value })} /></td>
                    <td><input style={inputStyle} type="number" value={item.monthly || ''} step={1000} onChange={e => update(item.id, { monthly: Number(e.target.value) || 0 })} /></td>
                    <td><input style={{ ...inputStyle, width: 55 }} type="number" value={item.atAge ?? retireAge} onChange={e => update(item.id, { atAge: Number(e.target.value) || retireAge })} /></td>
                    <td style={{ fontWeight: 500 }}>{inflated > 0 ? fmt(inflated) : '—'}</td>
                    <td><button style={btnStyle('#C0392B')} onClick={() => remove(item.id)}>&#x2715;</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <button style={{ ...btnStyle('#1A5276'), marginBottom: '1.2rem' }} onClick={addOneTime}>+ Add one-time expense</button>

      {!hasItems && (
        <div className="note" style={{ marginTop: '0.5rem' }}>
          No expense items yet. Add expenses above to override the Basic spending fields with detailed line items.
        </div>
      )}
    </>
  );

  return (
    <div className="chart-card">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '1rem' }}>
        <div className="chart-title" style={{ margin: 0 }}>Expenses</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button style={subTabBtn(subTab === 'basic')} onClick={() => setSubTab('basic')}>Basic</button>
          <button style={subTabBtn(subTab === 'advanced')} onClick={() => setSubTab('advanced')}>
            Advanced{hasItems ? ` (${items.length})` : ''}
          </button>
        </div>
      </div>

      {subTab === 'basic' ? renderBasic() : renderAdvanced()}
    </div>
  );
};

export default ExpenseTab;
