import React, { useState, useEffect, useMemo } from 'react';
import type { InputParams, ProjectionRow, Account } from './types';
import { runProjection, fmt, ssInterpolate } from './financial';
import { runOptimizer } from './optimizer';
import type { OptimizationOutput } from './optimizer';
import { exportToSpreadsheet } from './exportSpreadsheet';
import Sidebar from './components/Sidebar';
import Main from './components/Main';

const PLANS_KEY = 'retirement-planner-plans-v2';
const LEGACY_KEY = 'retirement-planner-inputs';

const DEFAULTS: InputParams = {
  // Personal
  age: 30,
  retireAge: 67,
  lifeExp: 95,
  filingStatus: 'single',
  spouseAge: undefined,
  spouseLifeExp: undefined,
  spouseSsType: 'own',
  spouseSs: undefined,
  spouseSs62: undefined,
  spouseSs67: undefined,
  spouseSs70: undefined,
  spouseSsAge: 67,

  // Accounts
  tradBal: 0,
  rothBal: 0,
  taxableBal: 0,
  taxableBasis: undefined,
  hsaBal: 0,
  tradContrib: 0,
  rothContrib: 0,
  taxableContrib: 0,
  hsaContrib: 0,
  employerMatch: 0,
  matchLimit: 0,

  // Social Security
  ss: 0,
  ssAge: 67,
  ss62: 0,
  ss67: 0,
  ss70: 0,

  // Spending
  expenses: 0,
  healthcareExpenses: 0,
  ltcExpenses: 0,
  discretionaryExpenses: 0,
  expenseInflationRate: 0.03,
  healthcareInflationRate: 0.055,

  // Income during working years
  salary: undefined,

  // Roth conversions
  rothConv: 0,
  convStart: 67,
  convUntil: 72,
  targetConvBracket: 1,

  // Returns (nominal)
  r: 0.07,
  taxableReturn: 0.07,
  hsaReturn: 0.07,

  // Inflation
  inf: 0.03,

  // Tax
  stateTaxRate: 0,
  stateTaxBrackets: undefined,

  // Assumptions
  includeIRMAA: true,
  includeStateTax: false,
  ssCOLA: 0.025,

  expenseItems: undefined,
  accounts: undefined,
};

interface StoredPlan {
  id: string;
  name: string;
  inputs: InputParams;
  conversionSchedule: Record<number, number> | null;
  optMinStartAge?: number;
}

const newPlanId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function createPlan(name: string, inputs: InputParams = DEFAULTS): StoredPlan {
  return { id: newPlanId(), name, inputs, conversionSchedule: null };
}

function loadPlans(): { plans: StoredPlan[]; activePlanId: string } {
  try {
    const stored = localStorage.getItem(PLANS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed.plans) && parsed.plans.length > 0) {
        const activeExists = parsed.plans.some((p: StoredPlan) => p.id === parsed.activePlanId);
        return { plans: parsed.plans, activePlanId: activeExists ? parsed.activePlanId : parsed.plans[0].id };
      }
    }
    // Migrate from legacy single-plan storage
    const legacy = localStorage.getItem(LEGACY_KEY);
    const plan = legacy
      ? createPlan('My Plan', { ...DEFAULTS, ...JSON.parse(legacy) })
      : createPlan('My Plan');
    return { plans: [plan], activePlanId: plan.id };
  } catch {
    const plan = createPlan('My Plan');
    return { plans: [plan], activePlanId: plan.id };
  }
}

function savePlans(plans: StoredPlan[], activePlanId: string): void {
  try {
    localStorage.setItem(PLANS_KEY, JSON.stringify({ plans, activePlanId }));
  } catch {
    // ignore quota errors
  }
}

function exportPlanToFile(plan: StoredPlan): void {
  const payload = {
    version: 2,
    name: plan.name,
    inputs: plan.inputs,
    conversionSchedule: plan.conversionSchedule ?? null,
    optMinStartAge: plan.optMinStartAge,
  };
  const data = JSON.stringify(payload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${plan.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importPlanFromFile(file: File): Promise<{ inputs: InputParams; conversionSchedule: Record<number, number> | null; optMinStartAge?: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        // v2 format: { version, name, inputs, conversionSchedule, optMinStartAge }
        if (parsed.version === 2 && parsed.inputs) {
          resolve({
            inputs: { ...DEFAULTS, ...parsed.inputs },
            conversionSchedule: parsed.conversionSchedule ?? null,
            optMinStartAge: parsed.optMinStartAge,
          });
        } else {
          // Legacy format: bare InputParams object
          resolve({ inputs: { ...DEFAULTS, ...parsed }, conversionSchedule: null });
        }
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

const btnStyle: React.CSSProperties = { padding: '4px 10px', fontSize: '11px' };
const dangerStyle: React.CSSProperties = { ...btnStyle, color: '#C0392B', borderColor: 'rgba(192,57,43,0.4)' };

const App: React.FC = () => {
  const [plans, setPlans] = useState<StoredPlan[]>(() => loadPlans().plans);
  const [activePlanId, setActivePlanId] = useState<string>(() => loadPlans().activePlanId);
  const [activeTab, setActiveTab] = useState<'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer' | 'expenses' | 'accounts'>('accounts');
  const [rows, setRows] = useState<ProjectionRow[]>([]);
  const [metrics, setMetrics] = useState<{ m1: string; m2: string; m3: string; m4: string; m5: string }>({
    m1: '—', m2: '—', m3: '—', m4: '—', m5: '—',
  });

  // Derived from active plan
  const activePlan = plans.find(p => p.id === activePlanId) ?? plans[0];
  const inputs = activePlan.inputs;
  const conversionSchedule = activePlan.conversionSchedule;
  const optMinStartAge = activePlan.optMinStartAge ?? inputs.age;

  // Persist whenever plans or active ID change
  useEffect(() => {
    savePlans(plans, activePlanId);
  }, [plans, activePlanId]);

  // Run projection whenever inputs or schedule change
  useEffect(() => {
    const projectionRows = runProjection(inputs, inputs.r, conversionSchedule ?? undefined);
    setRows(projectionRows);

    const retireIn = Math.max(1, inputs.retireAge - inputs.age);
    const retireRow = projectionRows[retireIn] || projectionRows[projectionRows.length - 1];
    const m1 = fmt(retireRow.total);

    const allProjectionRows = projectionRows.slice(1);
    const lifetimeTax = Math.round(allProjectionRows.reduce((s, r) => s + r.totalTax, 0));
    const m2 = fmt(lifetimeTax);
    const retireRows = projectionRows.slice(retireIn);

    const peakRmd = projectionRows.reduce((mx, r) => (r.rmd > mx ? r.rmd : mx), 0);
    const m3 = peakRmd > 0 ? `${fmt(peakRmd)}/yr` : 'None';

    const lastRow = projectionRows[projectionRows.length - 1];
    const m4 = lastRow ? fmt(lastRow.total) : '—';

    const MC_N = 1000;
    const startBal = retireRow.total;
    let mcSuccesses = 0;
    for (let sim = 0; sim < MC_N; sim++) {
      let bal = startBal;
      let failed = false;
      for (let i = 0; i < retireRows.length; i++) {
        const row = retireRows[i];
        const randReturn = inputs.r + (Math.random() + Math.random() + Math.random() - 1.5) * 0.15;
        const net = (row.ss ?? 0) + (row.spouseSs ?? 0) - (row.totalSpending ?? 0) - (row.totalTax ?? 0);
        bal = Math.max(0, bal * (1 + randReturn) + net);
        if (bal === 0) { failed = true; break; }
      }
      if (!failed) mcSuccesses++;
    }
    const m5 = `${Math.round((mcSuccesses / MC_N) * 100)}%`;

    setMetrics({ m1, m2, m3, m4, m5 });
  }, [inputs, conversionSchedule]);

  const optimization: OptimizationOutput | null = useMemo(() => {
    try {
      return runOptimizer(inputs, optMinStartAge);
    } catch {
      return null;
    }
  }, [inputs, optMinStartAge]);

  const [optTimestamp, setOptTimestamp] = useState(Date.now());
  useEffect(() => {
    if (optimization) setOptTimestamp(Date.now());
  }, [optimization]);

  // ---- Plan mutations ----

  const updateActivePlan = (patch: Partial<StoredPlan>) =>
    setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, ...patch } : p));

  const setConversionSchedule = (schedule: Record<number, number> | null) =>
    updateActivePlan({ conversionSchedule: schedule });

  const setOptMinStartAge = (age: number) =>
    updateActivePlan({ optMinStartAge: age });

  const handleInputChange = (field: keyof InputParams, value: string | number | boolean) => {
    setPlans(prev => prev.map(p => {
      if (p.id !== activePlanId) return p;
      const next = { ...p.inputs, [field]: value };
      const { ss62, ss67, ss70 } = next;
      if (ss62 && ss67 && ss70 && (field === 'ssAge' || field === 'ss62' || field === 'ss67' || field === 'ss70')) {
        next.ss = ssInterpolate(ss62, ss67, ss70, next.ssAge);
      }
      const { spouseSs62, spouseSs67, spouseSs70 } = next;
      if (spouseSs62 && spouseSs67 && spouseSs70 &&
          (field === 'spouseSsAge' || field === 'spouseSs62' || field === 'spouseSs67' || field === 'spouseSs70')) {
        next.spouseSs = ssInterpolate(spouseSs62, spouseSs67, spouseSs70, next.spouseSsAge ?? 67);
      }
      return { ...p, inputs: next };
    }));
  };

  const handleExpenseItemsChange = (items: import('./types').ExpenseItem[]) =>
    updateActivePlan({ inputs: { ...inputs, expenseItems: items.length > 0 ? items : undefined } });

  const handleAccountsChange = (accounts: Account[]) =>
    updateActivePlan({ inputs: { ...inputs, accounts: accounts.length > 0 ? accounts : undefined } });

  // ---- Plan management ----

  const addPlan = () => {
    const plan = createPlan(`Plan ${plans.length + 1}`);
    setPlans(prev => [...prev, plan]);
    setActivePlanId(plan.id);
    setActiveTab('accounts');
  };

  const duplicatePlan = () => {
    const plan: StoredPlan = { ...activePlan, id: newPlanId(), name: `${activePlan.name} (copy)` };
    setPlans(prev => [...prev, plan]);
    setActivePlanId(plan.id);
  };

  const renamePlan = () => {
    const name = window.prompt('Rename plan:', activePlan.name);
    if (name?.trim()) updateActivePlan({ name: name.trim() });
  };

  const resetPlan = () => {
    if (!window.confirm(`Reset "${activePlan.name}" to blank defaults? All data in this plan will be lost.`)) return;
    updateActivePlan({ inputs: DEFAULTS, conversionSchedule: null, optMinStartAge: undefined });
  };

  const deletePlan = () => {
    if (plans.length <= 1) return;
    if (!window.confirm(`Delete "${activePlan.name}"? This cannot be undone.`)) return;
    const remaining = plans.filter(p => p.id !== activePlanId);
    setPlans(remaining);
    setActivePlanId(remaining[remaining.length - 1].id);
  };

  // ---- File I/O ----

  const handleExport = () => exportPlanToFile(activePlan);
  const handleExportSpreadsheet = () => exportToSpreadsheet(inputs, rows);
  const handleImport = async (file: File) => {
    try {
      const { inputs: imported, conversionSchedule: importedSchedule, optMinStartAge: importedOptAge } = await importPlanFromFile(file);
      const name = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
      const plan: StoredPlan = {
        ...createPlan(name || 'Imported Plan', imported),
        conversionSchedule: importedSchedule,
        optMinStartAge: importedOptAge,
      };
      setPlans(prev => [...prev, plan]);
      setActivePlanId(plan.id);
    } catch {
      alert('Failed to import. Please select a valid JSON file.');
    }
  };

  return (
    <div className="app">
      <div className="header">
        {/* Plan controls — left */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <select
            value={activePlanId}
            onChange={e => setActivePlanId(e.target.value)}
            style={{ fontSize: '12px', padding: '4px 8px', border: '1px solid rgba(0,0,0,0.18)', borderRadius: '5px', background: '#fff', cursor: 'pointer', maxWidth: '180px' }}
          >
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <button className="tab" onClick={renamePlan} style={btnStyle} title="Rename this plan">
            Rename
          </button>
          <button className="tab" onClick={addPlan} style={btnStyle}>
            + New Plan
          </button>
          <button className="tab" onClick={duplicatePlan} style={btnStyle} title="Duplicate this plan">
            Duplicate
          </button>

          <div style={{ width: '2px', height: '16px', background: 'rgba(0,0,0,0.25)', borderRadius: '1px', margin: '0 2px' }} />

          <button className="tab" onClick={resetPlan} style={dangerStyle} title="Reset to blank defaults">
            Reset
          </button>
          <button className="tab" onClick={deletePlan} disabled={plans.length <= 1}
            style={{ ...dangerStyle, opacity: plans.length <= 1 ? 0.35 : 1 }}
            title={plans.length <= 1 ? 'Cannot delete the only plan' : 'Delete this plan'}>
            Delete
          </button>
        </div>

        {/* File I/O — right */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button className="tab" onClick={handleExport} style={btnStyle}>
            Export JSON
          </button>
          <button className="tab" onClick={handleExportSpreadsheet} style={btnStyle}>
            Export Excel
          </button>
          <label className="tab" style={{ ...btnStyle, cursor: 'pointer' }}>
            Import
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) { handleImport(e.target.files[0]); e.target.value = ''; } }}
            />
          </label>
        </div>
      </div>

      <Sidebar
        inputs={inputs}
        onInputChange={handleInputChange}
        conversionSchedule={conversionSchedule}
        onClearSchedule={() => setConversionSchedule(null)}
      />
      <Main
        inputs={inputs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        rows={rows}
        metrics={metrics}
        optimization={optimization}
        optTimestamp={optTimestamp}
        conversionSchedule={conversionSchedule}
        onApplySchedule={setConversionSchedule}
        onClearSchedule={() => setConversionSchedule(null)}
        onInputChange={handleInputChange}
        onExpenseItemsChange={handleExpenseItemsChange}
        onAccountsChange={handleAccountsChange}
        optMinStartAge={optMinStartAge}
        setOptMinStartAge={setOptMinStartAge}
      />
    </div>
  );
};

export default App;
