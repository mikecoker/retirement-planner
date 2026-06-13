import React from 'react';
import type { InputParams } from '../types';
import { fullRetirementAge, inferredBirthYear, inferredSpouseBirthYear, ssClaimFactor, ssInterpolate } from '../financial';
import TipLabel from './TipLabel';
import TouchSlider from './TouchSlider';

interface SidebarProps {
  inputs: InputParams;
  onInputChange: (field: keyof InputParams, value: string | number | boolean) => void;
  conversionSchedule: Record<number, number> | null;
  onClearSchedule: () => void;
  page?: 'about' | 'social' | 'conversions';
}

const Sidebar: React.FC<SidebarProps> = ({ inputs, onInputChange, conversionSchedule, onClearSchedule, page }) => {
  const showAll = page === undefined;
  const conversionScheduleRows = conversionSchedule
    ? Object.entries(conversionSchedule)
      .map(([age, amount]) => ({ age: Number(age), amount }))
      .sort((a, b) => a.age - b.age)
    : [];
  const conversionScheduleTotal = conversionScheduleRows.reduce((sum, row) => sum + row.amount, 0);
  const formatDollars = (value: number) => `$${Math.round(value).toLocaleString()}`;

  const handleNumberChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    const val = Number((e.target as HTMLInputElement).value);
    // Optional spouse fields should be undefined when empty, not 0
    const optionalFields: (keyof InputParams)[] = ['birthYear', 'spouseAge', 'spouseBirthYear', 'spouseLifeExp', 'spouseSs', 'spouseSs62', 'spouseSs67', 'spouseSs70'];
    onInputChange(field, val || (optionalFields.includes(field) ? undefined as any : 0));
  };

  const handleSelectChange = (field: keyof InputParams, e: React.FormEvent<HTMLSelectElement>) => {
    onInputChange(field, (e.target as HTMLSelectElement).value as 'single' | 'married');
  };

  const handleBracketChange = (e: React.FormEvent<HTMLSelectElement>) => {
    onInputChange('targetConvBracket', Number((e.target as HTMLSelectElement).value) as 0 | 1 | 2 | 3);
  };

  const handleCheckboxChange = (field: keyof InputParams, e: React.FormEvent<HTMLInputElement>) => {
    onInputChange(field, (e.target as HTMLInputElement).checked);
  };

  return (
    <div className={showAll ? 'sidebar' : 'setup-page'}>
      {/* Personal */}
      {(showAll || page === 'about') && <div>
        <div className="section-label">About you</div>
        <div className="field">
          <TipLabel text="Current age" />
          <TouchSlider ariaLabel="Current age" value={inputs.age} min={20} max={70} step={1} onChange={(value) => onInputChange('age', value)} />
        </div>
        <div className="field">
          <TipLabel text="Birth year" />
          <input type="number" value={inputs.birthYear ?? ''}
            step={1} placeholder={String(new Date().getFullYear() - inputs.age)}
            onInput={(e) => handleNumberChange('birthYear', e)} />
        </div>
        <div className="field">
          <TipLabel text="Retirement age" />
          <TouchSlider ariaLabel="Retirement age" value={inputs.retireAge} min={40} max={75} step={1} onChange={(value) => onInputChange('retireAge', value)} />
        </div>
        <div className="field">
          <TipLabel text="Life expectancy" />
          <TouchSlider ariaLabel="Life expectancy" value={inputs.lifeExp} min={70} max={100} step={1} onChange={(value) => onInputChange('lifeExp', value)} />
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
              <TouchSlider ariaLabel="Spouse age" value={inputs.spouseAge ?? inputs.age} min={20} max={100} step={1} onChange={(value) => onInputChange('spouseAge', value)} />
            </div>
            <div className="field">
              <TipLabel text="Spouse birth year" />
              <input type="number" value={inputs.spouseBirthYear ?? ''}
                step={1} placeholder={inputs.spouseAge !== undefined ? String(new Date().getFullYear() - inputs.spouseAge) : 'e.g. 1978'}
                onInput={(e) => handleNumberChange('spouseBirthYear', e)} />
            </div>
            <div className="field">
              <TipLabel text="Spouse life expectancy" />
              <TouchSlider ariaLabel="Spouse life expectancy" value={inputs.spouseLifeExp ?? inputs.lifeExp} min={70} max={100} step={1} onChange={(value) => onInputChange('spouseLifeExp', value)} />
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" checked={inputs.useJointLifeRmd}
                onChange={(e) => handleCheckboxChange('useJointLifeRmd', e)} />
              <TipLabel text="Use joint life RMD estimate" />
            </div>
          </>
        )}
      </div>}

      {showAll && <hr className="divider" />}

      {/* Social Security */}
      {(showAll || page === 'social') && <div>
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
          <TouchSlider ariaLabel="Social Security claim age" value={inputs.ssAge} min={62} max={70} step={1} onChange={(value) => onInputChange('ssAge', value)} />
        </div>

        {/* Benefit display / manual entry */}
        <div className="field">
          {inputs.ss62 && inputs.ss67 && inputs.ss70 ? (
            <div style={{ fontSize: '12px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
              <span style={{ fontWeight: 600, color: '#1A5276' }}>${Math.round(inputs.ss * (inputs.ssBenefitFactor ?? 1)).toLocaleString()}/mo</span>
              <span style={{ marginLeft: 6, color: '#888' }}>at age {inputs.ssAge} (auto-calculated)</span>
              {(inputs.ssBenefitFactor ?? 1) < 1 && (
                <span style={{ marginLeft: 6, color: '#888' }}>
                  from ${inputs.ss.toLocaleString()} scheduled
                </span>
              )}
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
          const fraAge = fullRetirementAge(inferredBirthYear(inputs));
          const fraDisplayAge = Math.round(fraAge);

          const benefitAt = (age: number) => ssInterpolate(ss62, ss67, ss70, age, fraAge);

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
                    const isFRA = age === fraDisplayAge;
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
                Break-even = age when cumulative benefit equals claiming at 67. Full retirement age is {fraAge.toFixed(1)}. Click a row to select.
              </div>
            </div>
          );
        })()}

        <div className="field">
          <TipLabel text="Benefit paid (%)" />
          <TouchSlider
            ariaLabel="Social Security benefit paid percent"
            value={(inputs.ssBenefitFactor ?? 1) * 100}
            min={0}
            max={100}
            step={1}
            suffix="%"
            onChange={(value) => onInputChange('ssBenefitFactor', value / 100)}
          />
          <div className="note" style={{ marginTop: '3px' }}>
            Models reduced Social Security payouts across primary, spouse, and survivor benefits.
          </div>
        </div>

        <div className="field">
          <TipLabel text="SS COLA (%)" />
          <TouchSlider
            ariaLabel="Social Security COLA percent"
            value={(inputs.ssCOLA ?? 0.025) * 100}
            min={0}
            max={5}
            step={0.25}
            suffix="%"
            decimals={2}
            onChange={(value) => onInputChange('ssCOLA', value / 100)}
          />
        </div>

        {inputs.filingStatus === 'married' && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '0.5px solid rgba(0,0,0,0.1)' }}>
            <div className="section-label">Spouse Social Security</div>
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
              const hasSpouseEstimates = !!(inputs.spouseSs62 && inputs.spouseSs67 && inputs.spouseSs70);
              const primaryFra = fullRetirementAge(inferredBirthYear(inputs));
              const spouseFra = fullRetirementAge(inferredSpouseBirthYear(inputs) ?? inferredBirthYear(inputs));
              const primaryPIA = inputs.ss67
                ? inputs.ss67 / ssClaimFactor(67, primaryFra)
                : inputs.ss / ssClaimFactor(inputs.ssAge, primaryFra);
              const spouseAgeAtPrimaryFiling = inputs.spouseAge !== undefined
                ? inputs.spouseAge + (inputs.ssAge - inputs.age)
                : claimAge;
              const spousalReductionAt = (a: number) => {
                const effAge = Math.min(a, spouseFra);
                const mo = Math.max(0, Math.round((spouseFra - effAge) * 12));
                const f = Math.min(mo, 36) * (25 / 36) / 100;
                const x = Math.max(0, mo - 36) * (5 / 12) / 100;
                return 1 - f - x;
              };
              const spousalAt = (a: number) => Math.round(primaryPIA * 0.5 * spousalReductionAt(a));
              const spouseOwnPiaAt = (ownBenefit: number) => {
                if (inputs.spouseSs67) return inputs.spouseSs67 / ssClaimFactor(67, spouseFra);
                return ownBenefit / ssClaimFactor(claimAge, spouseFra);
              };

              return (
                <>
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

                  {showOwn && (
                    <div className="field">
                      <TipLabel text="Spouse SS ($/mo)" />
                      <input
                        type="number"
                        value={inputs.spouseSs || ''}
                        step={100}
                        placeholder={hasSpouseEstimates ? 'Optional fallback' : 'Monthly benefit at claim age'}
                        onInput={(e) => onInputChange('spouseSs', Number((e.target as HTMLInputElement).value) || undefined as any)}
                      />
                      <div className="note" style={{ marginTop: '3px' }}>
                        {hasSpouseEstimates
                          ? 'Using spouse SSA estimates above. Manual amount is only a fallback if estimates are cleared.'
                          : 'Using this manual spouse benefit because all three spouse SSA estimates are not entered.'}
                      </div>
                    </div>
                  )}

                  <div className="field">
                    <TipLabel text="Spouse claim age" />
                    <TouchSlider
                      ariaLabel="Spouse Social Security claim age"
                      value={ssType === 'spousal' ? Math.min(claimAge, 67) : claimAge}
                      min={62}
                      max={ssType === 'spousal' ? 67 : 70}
                      step={1}
                      onChange={(value) => onInputChange('spouseSsAge', value)}
                    />
                    {showSpousal && (
                      <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                        Spousal benefit doesn't increase past FRA (age {spouseFra.toFixed(1)}).
                      </div>
                    )}
                  </div>

                  {showSpousal && primaryPIA > 0 && (() => {
                    const startAge = Math.max(claimAge, spouseAgeAtPrimaryFiling);
                    const fraMonthly = Math.round(primaryPIA * 0.5);
                    const monthly = spousalAt(startAge);
                    const reductionPct = ((1 - spousalReductionAt(startAge)) * 100).toFixed(1);
                    return (
                      <div className="field">
                        <div style={{ fontSize: '11px', color: '#555', background: '#FFF8E7', border: '1px solid #F0D080', borderRadius: '4px', padding: '6px 8px' }}>
                          <div style={{ fontWeight: 600, marginBottom: '3px' }}>Spousal benefit (50% of your PIA)</div>
                          <div>At FRA ({spouseFra.toFixed(1)}): <strong>${fraMonthly.toLocaleString()}/mo</strong></div>
                          {startAge > claimAge && (
                            <div style={{ color: '#888' }}>Starts at spouse age {startAge} after your benefit begins.</div>
                          )}
                          {Number(reductionPct) > 0
                            ? <div>At age {startAge}: <strong>${monthly.toLocaleString()}/mo</strong> <span style={{ color: '#888' }}>(-{reductionPct}% early claim)</span></div>
                            : null}
                        </div>
                      </div>
                    );
                  })()}

                  {showOwn && hasSpouseEstimates && (() => {
                    const ownBenefit = ssInterpolate(inputs.spouseSs62!, inputs.spouseSs67!, inputs.spouseSs70!, claimAge, spouseFra);
                    const ownPia = spouseOwnPiaAt(ownBenefit);
                    const topUpStartAge = Math.max(claimAge, spouseAgeAtPrimaryFiling);
                    const spousalExcess = Math.round(Math.max(0, primaryPIA * 0.5 - ownPia) * spousalReductionAt(topUpStartAge));
                    if (ssType === 'combined') {
                      return (
                        <div className="field">
                          <div style={{ fontSize: '11px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>SSA effective benefit at age {claimAge}</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderRadius: '3px', padding: '2px 4px' }}>
                                <span>Own record</span>
                                <strong>${ownBenefit.toLocaleString()}/mo</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderRadius: '3px', padding: '2px 4px' }}>
                                <span>Excess spousal top-up</span>
                                <strong>${spousalExcess.toLocaleString()}/mo</strong>
                              </div>
                            </div>
                            {topUpStartAge > claimAge && (
                              <div style={{ marginTop: '4px', color: '#888' }}>
                                Top-up starts at spouse age {topUpStartAge} after your benefit begins.
                              </div>
                            )}
                            <div style={{ marginTop: '5px', borderTop: '1px solid #ccc', paddingTop: '4px', color: '#1A5276', fontWeight: 600 }}>
                              Pays after top-up: ${(ownBenefit + spousalExcess).toLocaleString()}/mo
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

                  {showOwn && !hasSpouseEstimates && inputs.spouseSs && (() => {
                    const ownBenefit = inputs.spouseSs;
                    const ownPia = spouseOwnPiaAt(ownBenefit);
                    const topUpStartAge = Math.max(claimAge, spouseAgeAtPrimaryFiling);
                    const spousalExcess = Math.round(Math.max(0, primaryPIA * 0.5 - ownPia) * spousalReductionAt(topUpStartAge));

                    if (ssType === 'combined') {
                      return (
                        <div className="field">
                          <div style={{ fontSize: '11px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
                            <div style={{ fontWeight: 600, marginBottom: '4px' }}>SSA effective benefit from manual spouse amount</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderRadius: '3px', padding: '2px 4px' }}>
                                <span>Own record</span>
                                <strong>${ownBenefit.toLocaleString()}/mo</strong>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderRadius: '3px', padding: '2px 4px' }}>
                                <span>Excess spousal top-up</span>
                                <strong>${spousalExcess.toLocaleString()}/mo</strong>
                              </div>
                            </div>
                            {topUpStartAge > claimAge && (
                              <div style={{ marginTop: '4px', color: '#888' }}>
                                Top-up starts at spouse age {topUpStartAge} after your benefit begins.
                              </div>
                            )}
                            <div style={{ marginTop: '5px', borderTop: '1px solid #ccc', paddingTop: '4px', color: '#1A5276', fontWeight: 600 }}>
                              Pays after top-up: ${(ownBenefit + spousalExcess).toLocaleString()}/mo
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="field">
                        <div style={{ fontSize: '12px', color: '#555', background: '#F0F4FF', borderRadius: '4px', padding: '6px 8px' }}>
                          <span style={{ fontWeight: 600, color: '#1A5276' }}>${ownBenefit.toLocaleString()}/mo</span>
                          <span style={{ marginLeft: 6, color: '#888' }}>manual spouse benefit at age {claimAge}</span>
                        </div>
                      </div>
                    );
                  })()}
                </>
              );
            })()}
          </div>
        )}
      </div>}

      {showAll && <hr className="divider" />}

      {/* Roth conversions */}
      {(showAll || page === 'conversions') && <div>
        <div className="section-label">Roth conversions</div>
        {conversionSchedule ? (
          <div style={{ background: '#EAF4FB', border: '1px solid #AED6F1', borderRadius: '5px', padding: '10px 12px', fontSize: '12px', color: '#1A5276' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: '3px' }}>
                  Optimizer schedule active
                </div>
                <div style={{ color: '#555' }}>
                  Manual conversion settings are hidden while this optimizer schedule is applied.
                </div>
              </div>
              <button
                onClick={onClearSchedule}
                style={{ flexShrink: 0, fontSize: '12px', padding: '4px 10px', background: '#1A5276', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                Switch to manual
              </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid rgba(26,82,118,0.18)', borderRadius: '4px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#F4F8FB', color: '#666', borderBottom: '1px solid rgba(26,82,118,0.12)' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Age</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>Conversion</th>
                  </tr>
                </thead>
                <tbody>
                  {conversionScheduleRows.map(({ age, amount }) => (
                    <tr key={age} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '5px 8px', color: '#333' }}>{age}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#333', fontWeight: 600 }}>{formatDollars(amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: '#F8FAFB' }}>
                    <td style={{ padding: '6px 8px', color: '#333', fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: '#333', fontWeight: 700 }}>{formatDollars(conversionScheduleTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <>
            <div className="field">
              <TipLabel text="Max annual conversion ($)" />
              <input type="number" value={inputs.rothConv} step={1000}
                onInput={(e) => handleNumberChange('rothConv', e)} />
            </div>
            <div className="field">
              <TipLabel text="Convert from age" />
              <TouchSlider
                ariaLabel="Roth conversion start age"
                value={inputs.convStart ?? inputs.retireAge}
                min={inputs.age}
                max={inputs.convUntil}
                step={1}
                onChange={(value) => onInputChange('convStart', value)}
              />
            </div>
            <div className="field">
              <TipLabel text="Convert until age" />
              <TouchSlider
                ariaLabel="Roth conversion end age"
                value={inputs.convUntil}
                min={inputs.convStart ?? inputs.retireAge}
                max={80}
                step={1}
                onChange={(value) => onInputChange('convUntil', value)}
              />
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
      </div>}

    </div>
  );
};

export default Sidebar;
