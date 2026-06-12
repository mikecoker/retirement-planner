import React, { useState } from 'react';
import type { InputParams, Account, AccountType } from '../types';
import { computeGuaranteedIncome } from '../financial';
import TipLabel from './TipLabel';

interface AccountsTabProps {
  inputs: InputParams;
  onAccountsChange: (accounts: Account[]) => void;
  onInputChange: (field: keyof InputParams, value: string | number | boolean) => void;
}

const INVESTMENT_TYPES: AccountType[] = ['traditional', 'roth', 'taxable', 'hsa'];
const GUARANTEED_TYPES: AccountType[] = ['annuity', 'pension', 'bond_tips'];

const TYPE_LABELS: Record<AccountType, string> = {
  traditional: 'Traditional (401k/IRA)',
  roth: 'Roth (IRA/401k)',
  taxable: 'Taxable/Brokerage',
  hsa: 'HSA',
  annuity: 'Annuity',
  pension: 'Pension',
  bond_tips: 'Bond/TIPS',
};

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (n: number) => '$' + Math.round(n).toLocaleString();
const defaultGrowthForType = (inputs: InputParams, type: AccountType): number => {
  if (type === 'taxable') return inputs.taxableReturn;
  if (type === 'hsa') return inputs.hsaReturn;
  return inputs.r;
};

const inputStyle: React.CSSProperties = {
  padding: '5px 7px', fontSize: '12px', border: '1px solid var(--border-strong)',
  borderRadius: '6px', width: '100%', background: 'var(--panel-3)', color: 'var(--text)',
};
const btnStyle = (color: string): React.CSSProperties => ({
  padding: '4px 9px', fontSize: '11px', background: color, color: '#fff',
  border: 'none', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
});

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

const numInput = (value: number | undefined, step: number, placeholder: string | undefined, onChange: (v: number) => void) => (
  <input
    type="number"
    value={value ?? ''}
    step={step}
    placeholder={placeholder}
    style={{ padding: '0.78rem 0.9rem', fontSize: '16px', border: '1px solid var(--border-strong)', borderRadius: '11px', width: '100%', background: 'var(--panel-3)', color: 'var(--text)' }}
    onInput={(e) => onChange(Number((e.target as HTMLInputElement).value) || 0)}
  />
);

export const AccountsTab: React.FC<AccountsTabProps> = ({ inputs, onAccountsChange, onInputChange }) => {
  const accounts = inputs.accounts ?? [];
  const hasAccounts = accounts.length > 0;
  const [subTab, setSubTab] = useState<'basic' | 'advanced'>(() => hasAccounts ? 'advanced' : 'basic');
  const [growthDrafts, setGrowthDrafts] = useState<Record<string, string>>({});
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});

  const investmentAccounts = accounts.filter(a => INVESTMENT_TYPES.includes(a.type));
  const guaranteedAccounts = accounts.filter(a => GUARANTEED_TYPES.includes(a.type));

  const update = (id: string, patch: Partial<Account>) =>
    onAccountsChange(accounts.map(a => a.id === id ? { ...a, ...patch } : a));

  const remove = (id: string) => onAccountsChange(accounts.filter(a => a.id !== id));

  const addInvestment = () => onAccountsChange([...accounts, {
    id: newId(),
    name: 'New Account',
    type: 'traditional' as AccountType,
    balance: 0,
    growthRate: inputs.r,
  }]);

  const addGuaranteed = () => onAccountsChange([...accounts, {
    id: newId(),
    name: 'New Income Source',
    type: 'pension' as AccountType,
    balance: 0,
    monthlyIncome: 0,
    incomeStartAge: inputs.retireAge,
    inflationAdjusted: false,
  }]);
  const formatGrowthRate = (acct: Account) =>
    acct.growthRate !== undefined ? (acct.growthRate * 100).toFixed(1) : '';
  const updateGrowthRate = (acct: Account, raw: string) => {
    setGrowthDrafts(prev => ({ ...prev, [acct.id]: raw }));
    if (raw === '') {
      update(acct.id, { growthRate: undefined });
      return;
    }
    const value = Number(raw);
    if (Number.isFinite(value)) update(acct.id, { growthRate: value / 100 });
  };
  const finishGrowthEdit = (acct: Account) => {
    setGrowthDrafts(prev => {
      const { [acct.id]: _discard, ...rest } = prev;
      return rest;
    });
  };
  const updateRateDraft = (field: keyof InputParams, raw: string) => {
    setRateDrafts(prev => ({ ...prev, [field]: raw }));
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return;
    const value = Number(raw);
    if (Number.isFinite(value)) onInputChange(field, value / 100);
  };
  const finishRateDraft = (field: keyof InputParams) => {
    setRateDrafts(prev => {
      const { [field]: _discard, ...rest } = prev;
      return rest;
    });
  };

  // Summary totals from accounts
  const tradTotal = investmentAccounts.filter(a => a.type === 'traditional').reduce((s, a) => s + a.balance, 0);
  const rothTotal = investmentAccounts.filter(a => a.type === 'roth').reduce((s, a) => s + a.balance, 0);
  const taxableTotal = investmentAccounts.filter(a => a.type === 'taxable').reduce((s, a) => s + a.balance, 0);
  const hsaTotal = investmentAccounts.filter(a => a.type === 'hsa').reduce((s, a) => s + a.balance, 0);
  const annualGuaranteedAtRetire = computeGuaranteedIncome(inputs, inputs.retireAge);

  const renderBasic = () => {
    const disabled = hasAccounts;
    return (
      <div>
        {disabled && (
          <div style={{ fontSize: '11px', color: '#1A5276', background: '#EAF4FB', border: '1px solid #AED6F1', borderRadius: '4px', padding: '8px 10px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span><strong>{accounts.length} account{accounts.length !== 1 ? 's' : ''} active</strong> — these fields are overridden by the Advanced account manager.</span>
            <button onClick={() => setSubTab('advanced')} style={{ fontSize: '11px', padding: '2px 8px', background: '#1A5276', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer', whiteSpace: 'nowrap', marginLeft: '10px' }}>
              View accounts
            </button>
          </div>
        )}
        <div style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
          <div className="detail-section-title">Current Balances</div>
          <div className="two-col">
            <div className="field">
              <TipLabel text="Traditional ($)" />
              {numInput(inputs.tradBal, 5000, undefined, v => onInputChange('tradBal', v))}
            </div>
            <div className="field">
              <TipLabel text="Roth ($)" />
              {numInput(inputs.rothBal, 5000, undefined, v => onInputChange('rothBal', v))}
            </div>
          </div>
          <div className="field">
            <TipLabel text="Roth basis ($)" />
            <input
              type="number"
              value={inputs.rothBasis ?? ''}
              step={5000}
              placeholder={`${inputs.rothBal} (all basis)`}
              style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
              onInput={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                onInputChange('rothBasis', raw === '' ? undefined as any : Number(raw));
              }}
            />
          </div>
          <div className="two-col">
            <div className="field">
              <TipLabel text="Taxable ($)" />
              {numInput(inputs.taxableBal, 5000, undefined, v => onInputChange('taxableBal', v))}
            </div>
            <div className="field">
              <TipLabel text="HSA ($)" />
              {numInput(inputs.hsaBal, 1000, undefined, v => onInputChange('hsaBal', v))}
            </div>
          </div>
          <div className="field">
            <TipLabel text="Taxable cost basis ($)" />
            <input
              type="number"
              value={inputs.taxableBasis ?? ''}
              step={5000}
              placeholder={`${inputs.taxableBal} (no gains)`}
              style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
              onInput={(e) => {
                const raw = (e.target as HTMLInputElement).value;
                onInputChange('taxableBasis', raw === '' ? undefined as any : Number(raw));
              }}
            />
          </div>

          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Monthly Contributions</div>
          <div className="field">
            <TipLabel text="Monthly contributions" />
            <div className="two-col" style={{ marginTop: '4px' }}>
              {numInput(inputs.tradContrib, 100, 'Traditional', v => onInputChange('tradContrib', v))}
              {numInput(inputs.rothContrib, 100, 'Roth', v => onInputChange('rothContrib', v))}
            </div>
          </div>
          <div className="two-col">
            <div className="field">
              <TipLabel text="Taxable contrib ($/mo)" />
              {numInput(inputs.taxableContrib, 100, undefined, v => onInputChange('taxableContrib', v))}
            </div>
            <div className="field">
              <TipLabel text="HSA contrib ($/mo)" />
              {numInput(inputs.hsaContrib, 50, undefined, v => onInputChange('hsaContrib', v))}
            </div>
          </div>

          <div className="detail-section-title" style={{ marginTop: '1.2rem' }}>Employer Match (Traditional)</div>
          <div className="two-col">
            <div className="field">
              <TipLabel text="Match (%)" />
              <input
                type="number"
                value={inputs.employerMatch !== undefined ? (inputs.employerMatch * 100).toFixed(1) : ''}
                step={0.5}
                placeholder="0"
                style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
                onInput={(e) => onInputChange('employerMatch', Number((e.target as HTMLInputElement).value) / 100 || 0)}
              />
            </div>
            <div className="field">
              <TipLabel text="Limit (% of salary)" />
              {numInput(inputs.matchLimit, 1, '6', v => onInputChange('matchLimit', v))}
            </div>
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
            <div className="detail-label">Traditional balance</div>
            <div className="detail-value">{fmt(tradTotal)}</div>
          </div>
          <div className="detail-item detail-highlight">
            <div className="detail-label">Roth balance</div>
            <div className="detail-value">{fmt(rothTotal)}</div>
          </div>
          <div className="detail-item detail-highlight">
            <div className="detail-label">Taxable balance</div>
            <div className="detail-value">{fmt(taxableTotal)}</div>
          </div>
          <div className="detail-item detail-highlight">
            <div className="detail-label">HSA balance</div>
            <div className="detail-value">{fmt(hsaTotal)}</div>
          </div>
          {annualGuaranteedAtRetire > 0 && (
            <div className="detail-item">
              <div className="detail-label">Annual guaranteed income at retirement (age {inputs.retireAge})</div>
              <div className="detail-value" style={{ color: '#1D9E75' }}>{fmt(annualGuaranteedAtRetire)}/yr</div>
            </div>
          )}
        </div>
        {hasAccounts && (
          <div className="note" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
            When accounts are defined here, they override the Basic account balances and contributions.
          </div>
        )}
      </div>

      {/* Investment Accounts */}
      <div className="detail-section-title">Investment Accounts</div>
      {investmentAccounts.length > 0 && (
        <div className="optimizer-table-wrap" style={{ marginBottom: '0.5rem' }}>
          <table className="optimizer-table opt-schedule-table">
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>Name</th>
                <th>Type</th>
                <th>Balance ($)</th>
                <th>Annual Contrib ($)</th>
                <th>Growth (%)</th>
                <th>Employer Match / Cost Basis</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {investmentAccounts.map(acct => (
                <tr key={acct.id}>
                  <td>
                    <input style={inputStyle} value={acct.name} onChange={e => update(acct.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <select
                      style={inputStyle}
                      value={acct.type}
                      onChange={e => {
                        const nextType = e.target.value as AccountType;
                        update(acct.id, { type: nextType });
                      }}
                    >
                      {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </td>
                  <td>
                    <input style={inputStyle} type="number" value={acct.balance || ''} step={1000}
                      onChange={e => update(acct.id, { balance: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input style={inputStyle} type="number" value={acct.annualContrib || ''} step={500} placeholder="0"
                      onChange={e => update(acct.id, { annualContrib: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <TipLabel text="Nominal annual growth (%)" />
                      <input
                        style={inputStyle}
                        type="number"
                        value={growthDrafts[acct.id] ?? formatGrowthRate(acct)}
                        step={0.25}
                        placeholder={`${(defaultGrowthForType(inputs, acct.type) * 100).toFixed(1)}%`}
                        onChange={e => updateGrowthRate(acct, e.target.value)}
                        onBlur={() => finishGrowthEdit(acct)}
                      />
                    </div>
                  </td>
                  <td>
                    {acct.type === 'taxable' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '10px', color: '#888' }}>Cost Basis ($)</span>
                        <input style={inputStyle} type="number" value={acct.costBasis ?? ''} step={1000}
                          placeholder={String(acct.balance)}
                          onChange={e => update(acct.id, { costBasis: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      </div>
                    ) : acct.type === 'traditional' ? (
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '10px', color: '#888', display: 'block' }}>Match %</span>
                          <input style={inputStyle} type="number"
                            value={acct.employerMatch !== undefined ? (acct.employerMatch * 100).toFixed(1) : ''}
                            step={0.5} placeholder="0"
                            onChange={e => update(acct.id, { employerMatch: Number(e.target.value) / 100 || undefined })} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '10px', color: '#888', display: 'block' }}>Limit % salary</span>
                          <input style={inputStyle} type="number" value={acct.matchLimit ?? ''} step={1} placeholder="6"
                            onChange={e => update(acct.id, { matchLimit: Number(e.target.value) || undefined })} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#aaa' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button style={btnStyle('#C0392B')} onClick={() => remove(acct.id)}>&#x2715;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button style={{ ...btnStyle('#1A5276'), marginBottom: '1.2rem' }} onClick={addInvestment}>
        + Add Investment Account
      </button>

      {/* Guaranteed Income */}
      <div className="detail-section-title">Guaranteed Income Sources</div>
      <div className="note" style={{ marginBottom: '0.4rem' }}>
        Annuities, pensions, and Bond/TIPS ladders that provide fixed income at specified ages.
        Treated as fully taxable ordinary income.
      </div>
      {guaranteedAccounts.length > 0 && (
        <div className="optimizer-table-wrap" style={{ marginBottom: '0.5rem' }}>
          <table className="optimizer-table opt-schedule-table">
            <thead>
              <tr>
                <th style={{ minWidth: 130 }}>Name</th>
                <th>Type</th>
                <th>Monthly ($)</th>
                <th>Start Age</th>
                <th>End Age</th>
                <th>COLA</th>
                <th>Rate (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {guaranteedAccounts.map(acct => (
                <tr key={acct.id}>
                  <td>
                    <input style={inputStyle} value={acct.name} onChange={e => update(acct.id, { name: e.target.value })} />
                  </td>
                  <td>
                    <select style={inputStyle} value={acct.type} onChange={e => update(acct.id, { type: e.target.value as AccountType })}>
                      {GUARANTEED_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                    </select>
                  </td>
                  <td>
                    <input style={inputStyle} type="number" value={acct.monthlyIncome || ''} step={100} placeholder="0"
                      onChange={e => update(acct.id, { monthlyIncome: Number(e.target.value) || 0 })} />
                  </td>
                  <td>
                    <input style={{ ...inputStyle, width: 52 }} type="number"
                      value={acct.incomeStartAge ?? inputs.retireAge}
                      onChange={e => update(acct.id, { incomeStartAge: Number(e.target.value) || inputs.retireAge })} />
                  </td>
                  <td>
                    <input style={{ ...inputStyle, width: 52 }} type="number" value={acct.incomeEndAge ?? ''}
                      placeholder={String(inputs.lifeExp)}
                      onChange={e => update(acct.id, { incomeEndAge: Number(e.target.value) || undefined })} />
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={acct.inflationAdjusted ?? false}
                      onChange={e => update(acct.id, { inflationAdjusted: e.target.checked })} />
                  </td>
                  <td>
                    {acct.inflationAdjusted ? (
                      <input style={{ ...inputStyle, width: 55 }} type="number"
                        value={((acct.inflationRate ?? inputs.inf) * 100).toFixed(1)} step={0.1}
                        onChange={e => update(acct.id, { inflationRate: Number(e.target.value) / 100 })} />
                    ) : (
                      <span style={{ fontSize: '11px', color: '#aaa' }}>—</span>
                    )}
                  </td>
                  <td>
                    <button style={btnStyle('#C0392B')} onClick={() => remove(acct.id)}>&#x2715;</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button style={{ ...btnStyle('#1A5276'), marginBottom: '1.2rem' }} onClick={addGuaranteed}>
        + Add Income Source
      </button>

      {accounts.length === 0 && (
        <div className="note" style={{ marginTop: '0.5rem' }}>
          No accounts defined yet. Add investment accounts to override Basic balances and contributions,
          or add guaranteed income sources (pension, annuity, Bond/TIPS) to include fixed income in the projection.
        </div>
      )}
    </>
  );

  const rateSlider = (
    tipText: string,
    field: keyof InputParams,
    value: number,
    min: number,
    max: number,
    step: number,
    decimals: number,
  ) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
        <TipLabel text={tipText} />
        <div className="range-number-wrap" style={{ maxWidth: 96 }}>
          <input
            className="range-number"
            type="number"
            min={min}
            max={max}
            step={step}
            value={rateDrafts[field] ?? String(Number((value * 100).toFixed(decimals)))}
            onInput={(e) => updateRateDraft(field, (e.target as HTMLInputElement).value)}
            onBlur={() => finishRateDraft(field)}
            aria-label={`${tipText} value`}
          />
          <span className="range-number-suffix">%</span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value * 100}
        step={step}
        style={{ width: '100%' }}
        onInput={(e) => {
          finishRateDraft(field);
          onInputChange(field, Number((e.target as HTMLInputElement).value) / 100);
        }}
      />
    </div>
  );

  return (
    <div className="chart-card">
      {/* Salary — always visible */}
      <div className="field" style={{ marginBottom: '1rem' }}>
        <TipLabel text="Annual salary / wages" />
        <input
          type="number"
          value={inputs.salary ?? ''}
          step={5000}
          placeholder="0 (gross annual wages during working years)"
          style={{ padding: '4px 6px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '3px', width: '100%' }}
          onInput={(e) => {
            const v = Number((e.target as HTMLInputElement).value);
            onInputChange('salary', v || undefined as any);
          }}
        />
      </div>

      {/* Assumptions — always visible, independent of sub-tab */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1.5rem', padding: '10px 14px', background: '#F8F9FA', border: '1px solid #E8E8E8', borderRadius: '6px', marginBottom: '1.2rem' }}>
        {rateSlider('Annual return (%)', 'r', inputs.r, 1, 12, 0.5, 1)}
        {rateSlider('Taxable account return (%)', 'taxableReturn', inputs.taxableReturn, 1, 12, 0.5, 1)}
        {rateSlider('HSA return (%)', 'hsaReturn', inputs.hsaReturn, 1, 12, 0.5, 1)}
        {rateSlider('Inflation (%)', 'inf', inputs.inf, 1, 6, 0.5, 1)}
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', padding: '10px 14px', background: '#F8F9FA', border: '1px solid #E8E8E8', borderRadius: '6px', marginBottom: '1.2rem' }}>
        {rateSlider('Taxable ordinary yield (%)', 'taxableOrdinaryYield', inputs.taxableOrdinaryYield ?? 0, 0, 8, 0.25, 2)}
        {rateSlider('Qualified dividend yield (%)', 'taxableQualifiedDividendYield', inputs.taxableQualifiedDividendYield ?? 0, 0, 8, 0.25, 2)}
        {rateSlider('Realized LTCG yield (%)', 'taxableRealizedGainYield', inputs.taxableRealizedGainYield ?? 0, 0, 8, 0.25, 2)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.6rem', marginBottom: '1rem' }}>
        <div className="chart-title" style={{ margin: 0 }}>Accounts</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button style={subTabBtn(subTab === 'basic')} onClick={() => setSubTab('basic')}>Basic</button>
          <button style={subTabBtn(subTab === 'advanced')} onClick={() => setSubTab('advanced')}>
            Advanced{hasAccounts ? ` (${accounts.length})` : ''}
          </button>
        </div>
      </div>

      {subTab === 'basic' ? renderBasic() : renderAdvanced()}
    </div>
  );
};

export default AccountsTab;
