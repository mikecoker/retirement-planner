import React from 'react';
import type { InputParams } from '../types';
import { ssInterpolate } from '../financial';
import TipLabel from './TipLabel';

interface SidebarProps {
  inputs: InputParams;
  onInputChange: (field: keyof InputParams, value: string | number | boolean) => void;
  conversionSchedule: Record<number, number> | null;
  onClearSchedule: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ inputs, onInputChange, conversionSchedule, onClearSchedule }) => {
  const handleRangeChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, Number((e.target as HTMLInputElement).value));
  };

  const handleNumberChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    const val = Number((e.target as HTMLInputElement).value);
    // Optional spouse fields should be undefined when empty, not 0
    const optionalFields: (keyof InputParams)[] = ['spouseAge', 'spouseLifeExp', 'spouseSs62', 'spouseSs67', 'spouseSs70'];
    onInputChange(field, val || (optionalFields.includes(field) ? undefined as any : 0));
  };

  const handleSelectChange = (field: keyof InputParams, e: React.FormEvent<HTMLSelectElement>) => {
    onInputChange(field, (e.target as HTMLSelectElement).value as 'single' | 'married');
  };

  const handleRateChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, Number((e.target as HTMLInputElement).value) / 100);
  };

  const handleBracketChange = (e: React.FormEvent<HTMLSelectElement>) => {
    onInputChange('targetConvBracket', Number((e.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3);
  };

  const handleCheckboxChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, (e.target as HTMLInputElement).checked);
  };

  return (
    <div className="sidebar">
      {/* Personal */}
      <div>
        <div className="section-label">About you</div>
        <div className="field">
          <TipLabel text="Current age" />
          <div className="range-row">
            <input type="range" min={20} max={70} value={inputs.age} step={1}
              onInput={(e) => handleRangeChange('age', e)} />
            <span className="range-val">{inputs.age}</span>
          </div>
        </div>
        <div className="field">
          <TipLabel text="Retirement age" />
          <div className="range-row">
            <input type="range" min={40} max={75} value={inputs.retireAge} step={1}
              onInput={(e) => handleRangeChange('retireAge', e)} />
            <span className="range-val">{inputs.retireAge}</span>
          </div>
        </div>
        <div className="field">
          <TipLabel text="Life expectancy" />
          <div className="range-row">
            <input type="range" min={70} max={100} value={inputs.lifeExp} step={1}
              onInput={(e) => handleRangeChange('lifeExp', e)} />
            <span className="range-val">{inputs.lifeExp}</span>
          </div>
        </div>
        <div className="field">
          <TipLabel text="Filing status" />
          <select value={inputs.filingStatus}
            onChange={(e) => handleSelectChange('filingStatus', e)}>
            <option value="single">Single</option>
            <option value="married">Married filing jointly</option>
          </select>
        </div>
        {inputs.filingStatus === 'married' && (
          <>
            <div className="field">
              <TipLabel text="Spouse age" />
              <input type="number" value={inputs.spouseAge ?? ''}
                step={1} placeholder="e.g. 48"
                onInput={(e) => handleNumberChange('spouseAge', e)} />
            </div>
            <div className="field">
              <TipLabel text="Spouse life expectancy" />
              <input type="number" value={inputs.spouseLifeExp ?? ''}
                step={1} placeholder="e.g. 90"
                onInput={(e) => handleNumberChange('spouseLifeExp', e)} />
            </div>
            {/* Spouse SS type selector */}
            <div className="field">
              <TipLabel text="Spouse SS benefit type" />
              <select
                value={inputs.spouseSsType ?? 'own'}
                onChange={(e) => onInputChange('spouseSsType', e.target.value as 'own' | 'spousal' | 'combined')}
              >
                <option value="own">Own work record</option>
                <option value="spousal">Spousal benefit (50% of your PIA)</option>
                <option value="combined">Own record + spousal top-up (SSA deemed filing)</option>
              </select>
              {(inputs.spouseSsType ?? 'own') === 'combined' && (
                <div style={{ fontSize: '10px', color: '#777', marginTop: '3px' }}>
                  SSA automatically pays whichever is higher: spouse's own benefit or 50% of your PIA. They are not added together.
                </div>
              )}
            </div>
            {(() => {
              const ssType = inputs.spouseSsType ?? 'own';
              const claimAge = inputs.spouseSsAge ?? 67;
              const showOwn = ssType === 'own' || ssType === 'combined';
              const showSpousal = ssType === 'spousal' || ssType === 'combined';

              // Spousal benefit helper
              const primaryPIA = inputs.ss67 || inputs.ss;
              const spousalAt = (a: number) => {
                const effAge = Math.min(a, 67);
                const mo = Math.max(0, (67 - effAge) * 12);
                const f = Math.min(mo, 36) * (25 / 36) / 100;
                const x = Math.max(0, mo - 36) * (5 / 12) / 100;
                return Math.round(primaryPIA * 0.5 * (1 - f - x));
              };

              return (
                <>
                  {/* Own-record SSA estimate inputs */}
                  {showOwn && (
                    <div className="field">
                      <TipLabel text="Spouse SSA estimates ($/mo)" />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginTop: '4px' }}>
                        {(['spouseSs62', 'spouseSs67', 'spouseSs70'] as const).map((f, i) => (
                          <div key={f} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '10px', color: '#888', textAlign: 'center' }}>{['At 62','At 67','At 70'][i]}</span>
                            <input type="number" value={inputs[f] || ''} step={50} placeholder="0"
                              style={{ textAlign: 'center', padding: '3px 4px' }}
                              onInput={(e) => onInputChange(f, Number((e.target as HTMLInputElement).value) || undefined as any)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Claim age slider */}
                  <div className="field">
                    <TipLabel text="Spouse claim age" />
                    <div className="range-row">
                      <input type="range" min={62} max={ssType === 'spousal' ? 67 : 70}
                        value={ssType === 'spousal' ? Math.min(claimAge, 67) : claimAge} step={1}
                        onInput={(e) => handleRangeChange('spouseSsAge', e)} />
                      <span className="range-val">{ssType === 'spousal' ? Math.min(claimAge, 67) : claimAge}</span>
                    </div>
                    {showSpousal && (
                      <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                        Spousal benefit doesn't increase past FRA (age 67).
                      </div>
                    )}
                  </div>

                  {/* Spousal benefit breakdown */}
                  {showSpousal && (primaryPIA > 0) && (() => {
                    const effClaimAge = Math.min(claimAge, 67);
                    const fraMonthly = Math.round(primaryPIA * 0.5);
                    const monthly = spousalAt(effClaimAge);
                    const monthsBefore = Math.max(0, (67 - effClaimAge) * 12);
                    const f = Math.min(monthsBefore, 36) * (25 / 36) / 100;
                    const x = Math.max(0, monthsBefore - 36) * (5 / 12) / 100;
                    const reductionPct = ((f + x) * 100).toFixed(1);
                    return (
                      <div className="field">
                        <div style={{ fontSize: '11px', color: '#555', background: '#FFF8E7', border: '1px solid #F0D080', borderRadius: '4px', padding: '6px 8px' }}>
                          <div style={{ fontWeight: 600, marginBottom: '3px' }}>Spousal benefit (50% of your PIA)</div>
                          <div>At FRA (67): <strong>${fraMonthly.toLocaleString()}/mo</strong></div>
                          {monthsBefore > 0
                            ? <div>At age {effClaimAge}: <strong>${monthly.toLocaleString()}/mo</strong> <span style={{ color: '#888' }}>(−{reductionPct}% early claim)</span></div>
                            : null}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Benefit summary display */}
                  {showOwn && inputs.spouseSs62 && inputs.spouseSs67 && inputs.spouseSs70 && (() => {
                    const ownBenefit = ssInterpolate(inputs.spouseSs62, inputs.spouseSs67, inputs.spouseSs70, claimAge);
                    const spousalBenefit = spousalAt(Math.min(claimAge, 67));
                    if (ssType === 'combined') {
                      const ownWins = ownBenefit >= spousalBenefit;
                      return (
                        <div className="field">
                          <div style={{ fontSize: '11px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>SSA effective benefit at age {claimAge}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', background: ownWins ? '#E8F5E9' : undefined, borderRadius: '3px', padding: '2px 4px' }}>
                                <span>Own record{ownWins ? ' ✓' : ''}</span>
                                <strong>${ownBenefit.toLocaleString()}/mo</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', background: !ownWins ? '#E8F5E9' : undefined, borderRadius: '3px', padding: '2px 4px' }}>
                                <span>Spousal (50% PIA){!ownWins ? ' ✓' : ''}</span>
                                <strong>${spousalBenefit.toLocaleString()}/mo</strong>
                              </div>
                            </div>
                            <div style={{ marginTop: '5px', borderTop: '1px solid #ccc', paddingTop: '4px', color: '#1A5276', fontWeight: 600 }}>
                              Pays: ${Math.max(ownBenefit, spousalBenefit).toLocaleString()}/mo
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="field">
                        <div style={{ fontSize: '12px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
                          <span style={{ fontWeight: 600, color: '#1A5276' }}>${ownBenefit.toLocaleString()}/mo</span>
                          <span style={{ marginLeft: 6, color: '#888' }}>at age {claimAge} (auto-calculated)</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Own-record comparison table (own or combined) */}
                  {showOwn && inputs.spouseSs62 && inputs.spouseSs67 && inputs.spouseSs70 && (() => {
                    const s62 = inputs.spouseSs62!;
                    const s67 = inputs.spouseSs67!;
                    const s70 = inputs.spouseSs70!;
                    const ownAt = (a: number) => ssInterpolate(s62, s67, s70, a);
                    const breakeven = (a: number): string => {
                      if (a === 67) return '—';
                      const mo = ownAt(a);
                      if (a < 67) {
                        const diff = s67 - mo;
                        if (diff <= 0) return '—';
                        return `~${(67 + ((67 - a) * 12 * mo) / diff / 12).toFixed(1)}`;
                      }
                      const diff = mo - s67;
                      if (diff <= 0) return '—';
                      return `~${(a + ((a - 67) * 12 * s67) / diff / 12).toFixed(1)}`;
                    };
                    return (
                      <div style={{ marginTop: '2px', overflowX: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                              <th style={{ textAlign: 'left', padding: '3px 4px', fontWeight: 500 }}>Age</th>
                              <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>Own</th>
                              {ssType === 'combined' && <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>Spousal</th>}
                              {ssType === 'combined' && <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500, color: '#1A5276' }}>Pays</th>}
                              {ssType === 'own' && <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>$/yr</th>}
                              {ssType === 'own' && <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>Break-even</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(a => {
                              const own = ownAt(a);
                              const spousal = spousalAt(Math.min(a, 67));
                              const effective = ssType === 'combined' ? Math.max(own, spousal) : own;
                              const isSelected = a === (inputs.spouseSsAge ?? 67);
                              const isFRA = a === 67;
                              return (
                                <tr key={a}
                                  style={{ background: isSelected ? '#EBF5FB' : isFRA ? '#F0FFF8' : undefined, fontWeight: isSelected || isFRA ? 600 : undefined, cursor: 'pointer' }}
                                  onClick={() => onInputChange('spouseSsAge', a)}>
                                  <td style={{ padding: '3px 4px' }}>{a}{isFRA ? ' ★' : ''}{isSelected && !isFRA ? ' ←' : ''}</td>
                                  <td style={{ textAlign: 'right', padding: '3px 4px', color: ssType === 'combined' && own < spousal ? '#aaa' : undefined }}>${own.toLocaleString()}</td>
                                  {ssType === 'combined' && <td style={{ textAlign: 'right', padding: '3px 4px', color: spousal < own ? '#aaa' : undefined }}>${spousal.toLocaleString()}</td>}
                                  {ssType === 'combined' && <td style={{ textAlign: 'right', padding: '3px 4px', color: '#1A5276', fontWeight: 600 }}>${effective.toLocaleString()}</td>}
                                  {ssType === 'own' && <td style={{ textAlign: 'right', padding: '3px 4px' }}>${Math.round(own * 12 / 1000)}K</td>}
                                  {ssType === 'own' && <td style={{ textAlign: 'right', padding: '3px 4px', color: '#666' }}>{breakeven(a)}</td>}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                          {ssType === 'combined' ? 'Dimmed column = lower amount (SSA pays the higher). Click a row to select.' : 'Break-even vs FRA. Click a row to select.'}
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </>
        )}
      </div>

      <hr className="divider" />

      {/* Accounts */}
      <div>
        <div className="section-label">Accounts</div>
        <div className="two-col">
          <div className="field">
            <TipLabel text="Traditional ($)" />
            <input type="number" value={inputs.tradBal} step={5000}
              onInput={(e) => handleNumberChange('tradBal', e)} />
          </div>
          <div className="field">
            <TipLabel text="Roth ($)" />
            <input type="number" value={inputs.rothBal} step={5000}
              onInput={(e) => handleNumberChange('rothBal', e)} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <TipLabel text="Taxable ($)" />
            <input type="number" value={inputs.taxableBal} step={5000}
              onInput={(e) => handleNumberChange('taxableBal', e)} />
          </div>
          <div className="field">
            <TipLabel text="HSA ($)" />
            <input type="number" value={inputs.hsaBal} step={1000}
              onInput={(e) => handleNumberChange('hsaBal', e)} />
          </div>
        </div>
        <div className="field">
          <TipLabel text="Taxable cost basis ($)" />
          <input type="number" value={inputs.taxableBasis ?? ''} step={5000}
            placeholder={`${inputs.taxableBal} (no gains)`}
            onInput={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              onInputChange('taxableBasis', v || undefined as any);
            }} />
        </div>
        <div className="field">
          <TipLabel text="Monthly contributions" />
          <div className="two-col">
            <input type="number" value={inputs.tradContrib} step={100}
              placeholder="Traditional"
              onInput={(e) => handleNumberChange('tradContrib', e)} />
            <input type="number" value={inputs.rothContrib} step={100}
              placeholder="Roth"
              onInput={(e) => handleNumberChange('rothContrib', e)} />
          </div>
        </div>
        <div className="two-col">
          <div className="field">
            <TipLabel text="Taxable contrib ($/mo)" />
            <input type="number" value={inputs.taxableContrib} step={100}
              onInput={(e) => handleNumberChange('taxableContrib', e)} />
          </div>
          <div className="field">
            <TipLabel text="HSA contrib ($/mo)" />
            <input type="number" value={inputs.hsaContrib} step={50}
              onInput={(e) => handleNumberChange('hsaContrib', e)} />
          </div>
        </div>
      </div>

      <hr className="divider" />

      {/* Social Security */}
      <div>
        <div className="section-label">Social Security</div>

        {/* SSA estimates */}
        <div className="field">
          <TipLabel text="SSA estimates ($/mo from ssa.gov)" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px', marginTop: '4px' }}>
            {(['ss62', 'ss67', 'ss70'] as const).map((field, i) => {
              const labels = ['At 62', 'At 67', 'At 70'];
              return (
                <div key={field} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '10px', color: '#888', textAlign: 'center' }}>{labels[i]}</span>
                  <input
                    type="number"
                    value={inputs[field] || ''}
                    step={50}
                    placeholder="0"
                    style={{ textAlign: 'center', padding: '3px 4px' }}
                    onInput={(e) => onInputChange(field, Number((e.target as HTMLInputElement).value) || 0)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* Claim age slider */}
        <div className="field">
          <TipLabel text="Claim age" />
          <div className="range-row">
            <input type="range" min={62} max={70} value={inputs.ssAge} step={1}
              onInput={(e) => handleRangeChange('ssAge', e)} />
            <span className="range-val">{inputs.ssAge}</span>
          </div>
        </div>

        {/* Benefit display / manual entry */}
        <div className="field">
          {inputs.ss62 && inputs.ss67 && inputs.ss70 ? (
            <div style={{ fontSize: '12px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
              <span style={{ fontWeight: 600, color: '#1A5276' }}>${inputs.ss.toLocaleString()}/mo</span>
              <span style={{ marginLeft: 6, color: '#888' }}>at age {inputs.ssAge} (auto-calculated)</span>
            </div>
          ) : (
            <>
              <TipLabel text="Monthly benefit at claim age ($)" />
              <input type="number" value={inputs.ss} step={100}
                onInput={(e) => onInputChange('ss', Number((e.target as HTMLInputElement).value) || 0)} />
            </>
          )}
        </div>

        {/* Comparison table — only when all three estimates are entered */}
        {inputs.ss62 && inputs.ss67 && inputs.ss70 && (() => {
          const ss62 = inputs.ss62!;
          const ss67 = inputs.ss67!;
          const ss70 = inputs.ss70!;

          const benefitAt = (age: number) => ssInterpolate(ss62, ss67, ss70, age);

          const breakeven = (age: number): string => {
            if (age === 67) return '—';
            const mo = benefitAt(age);
            if (age < 67) {
              const diff = ss67 - mo;
              if (diff <= 0) return '—';
              const be = 67 + ((67 - age) * 12 * mo) / diff / 12;
              return `~${be.toFixed(1)}`;
            }
            const diff = mo - ss67;
            if (diff <= 0) return '—';
            const be = age + ((age - 67) * 12 * ss67) / diff / 12;
            return `~${be.toFixed(1)}`;
          };

          return (
            <div style={{ marginTop: '6px', overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ddd', color: '#666' }}>
                    <th style={{ textAlign: 'left', padding: '3px 4px', fontWeight: 500 }}>Age</th>
                    <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>$/mo</th>
                    <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>$/yr</th>
                    <th style={{ textAlign: 'right', padding: '3px 4px', fontWeight: 500 }}>Break-even</th>
                  </tr>
                </thead>
                <tbody>
                  {[62, 63, 64, 65, 66, 67, 68, 69, 70].map(age => {
                    const mo = benefitAt(age);
                    const isSelected = age === inputs.ssAge;
                    const isFRA = age === 67;
                    return (
                      <tr
                        key={age}
                        style={{
                          background: isSelected ? '#EBF5FB' : isFRA ? '#F0FFF8' : undefined,
                          fontWeight: isSelected || isFRA ? 600 : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => onInputChange('ssAge', age)}
                      >
                        <td style={{ padding: '3px 4px' }}>
                          {age}{isFRA ? ' ★' : ''}{isSelected && !isFRA ? ' ←' : ''}
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 4px' }}>${mo.toLocaleString()}</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px' }}>${Math.round(mo * 12 / 1000)}K</td>
                        <td style={{ textAlign: 'right', padding: '3px 4px', color: '#666' }}>{breakeven(age)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ fontSize: '10px', color: '#999', marginTop: '4px' }}>
                Break-even = age when cumulative benefit equals claiming at 67. Click a row to select.
              </div>
            </div>
          );
        })()}

        <div className="field">
          <TipLabel text="SS COLA (%)" />
          <div className="range-row">
            <input type="range" min={0} max={5} value={(inputs.ssCOLA ?? 0.025) * 100} step={0.25}
              onInput={(e) => handleRateChange('ssCOLA', e)} />
            <span className="range-val">{((inputs.ssCOLA ?? 0.025) * 100).toFixed(2)}%</span>
          </div>
        </div>
      </div>

      <hr className="divider" />

      {/* Spending */}
      <div>
        <div className="section-label">Spending</div>
        <div className="field">
          <TipLabel text="Base monthly expenses ($)" />
          <input type="number" value={inputs.expenses} step={100}
            onInput={(e) => handleNumberChange('expenses', e)} />
        </div>
        <div className="two-col">
          <div className="field">
            <TipLabel text="Healthcare ($/mo)" />
            <input type="number" value={inputs.healthcareExpenses} step={50}
              onInput={(e) => handleNumberChange('healthcareExpenses', e)} />
          </div>
          <div className="field">
            <TipLabel text="Discretionary ($/mo)" />
            <input type="number" value={inputs.discretionaryExpenses} step={50}
              onInput={(e) => handleNumberChange('discretionaryExpenses', e)} />
          </div>
        </div>
        <div className="field">
          <TipLabel text="LTC reserve ($/mo, from age 80)" />
          <input type="number" value={inputs.ltcExpenses} step={100}
            onInput={(e) => handleNumberChange('ltcExpenses', e)} />
        </div>
        <div className="field">
          <TipLabel text="Expense inflation (%)" />
          <div className="range-row">
            <input type="range" min={1} max={6} value={inputs.expenseInflationRate * 100} step={0.25}
              onInput={(e) => handleRateChange('expenseInflationRate', e)} />
            <span className="range-val">{(inputs.expenseInflationRate * 100).toFixed(2)}%</span>
          </div>
        </div>
        <div className="field">
          <TipLabel text="Healthcare inflation (%)" />
          <div className="range-row">
            <input type="range" min={2} max={10} value={inputs.healthcareInflationRate * 100} step={0.5}
              onInput={(e) => handleRateChange('healthcareInflationRate', e)} />
            <span className="range-val">{(inputs.healthcareInflationRate * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <hr className="divider" />

      {/* Roth conversions */}
      <div>
        <div className="section-label">Roth conversions</div>
        {conversionSchedule ? (
          <div style={{ background: '#EAF4FB', border: '1px solid #AED6F1', borderRadius: '5px', padding: '8px 10px', fontSize: '11px', color: '#1A5276' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              Optimizer schedule active
            </div>
            <div style={{ color: '#555', marginBottom: '6px' }}>
              {Object.keys(conversionSchedule).length} year schedule (ages {Math.min(...Object.keys(conversionSchedule).map(Number))}–{Math.max(...Object.keys(conversionSchedule).map(Number))}). Sidebar settings below are overridden.
            </div>
            <button
              onClick={onClearSchedule}
              style={{ fontSize: '11px', padding: '2px 8px', background: '#1A5276', color: '#fff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
            >
              Reset to sidebar settings
            </button>
          </div>
        ) : (
          <>
            <div className="field">
              <TipLabel text="Max annual conversion ($)" />
              <input type="number" value={inputs.rothConv} step={1000}
                onInput={(e) => handleNumberChange('rothConv', e)} />
            </div>
            <div className="field">
              <TipLabel text="Convert until age" />
              <div className="range-row">
                <input type="range" min={60} max={80} value={inputs.convUntil} step={1}
                  onInput={(e) => handleRangeChange('convUntil', e)} />
                <span className="range-val">{inputs.convUntil}</span>
              </div>
            </div>
            <div className="field">
              <TipLabel text="Target conversion bracket" />
              <select value={inputs.targetConvBracket} onChange={handleBracketChange}>
                <option value={0}>10% bracket</option>
                <option value={1}>12% bracket</option>
                <option value={2}>22% bracket</option>
                <option value={3}>24% bracket</option>
              </select>
            </div>
          </>
        )}
      </div>

      <hr className="divider" />

      {/* Tax */}
      <div>
        <div className="section-label">Tax settings</div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={inputs.includeIRMAA}
            onChange={(e) => handleCheckboxChange('includeIRMAA', e)} />
          <TipLabel text="Include IRMAA surcharges" />
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={inputs.includeStateTax}
            onChange={(e) => handleCheckboxChange('includeStateTax', e)} />
          <TipLabel text="Include state tax" />
        </div>
        {inputs.includeStateTax && (
          <div className="field">
            <TipLabel text="State tax rate (%)" />
            <div className="range-row">
              <input type="range" min={0} max={13} value={inputs.stateTaxRate * 100} step={0.25}
                onInput={(e) => handleRateChange('stateTaxRate', e)} />
              <span className="range-val">{(inputs.stateTaxRate * 100).toFixed(2)}%</span>
            </div>
          </div>
        )}
      </div>

      <hr className="divider" />

      {/* Assumptions */}
      <div>
        <div className="section-label">Assumptions</div>
        <div className="field">
          <TipLabel text="Annual return (%)" />
          <div className="range-row">
            <input type="range" min={1} max={12} value={inputs.r * 100} step={0.5}
              onInput={(e) => handleRateChange('r', e)} />
            <span className="range-val">{(inputs.r * 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className="field">
          <TipLabel text="Taxable account return (%)" />
          <div className="range-row">
            <input type="range" min={1} max={12} value={inputs.taxableReturn * 100} step={0.5}
              onInput={(e) => handleRateChange('taxableReturn', e)} />
            <span className="range-val">{(inputs.taxableReturn * 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className="field">
          <TipLabel text="Inflation (%)" />
          <div className="range-row">
            <input type="range" min={1} max={6} value={inputs.inf * 100} step={0.5}
              onInput={(e) => handleRateChange('inf', e)} />
            <span className="range-val">{(inputs.inf * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;