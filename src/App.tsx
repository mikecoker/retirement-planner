import React, { useState, useEffect, useMemo } from 'react';
import type { InputParams, ProjectionRow, Account, PlannerPage } from './types';
import { fullRetirementAge, inferredBirthYear, inferredSpouseBirthYear, runProjection, fmt, ssInterpolate } from './financial';
import { DEFAULT_MONTE_CARLO_OPTIONS, type MonteCarloOptions, runMonteCarlo } from './monteCarlo';
import { runOptimizer } from './optimizer';
import type { OptimizationOutput } from './optimizer';
import { exportToSpreadsheet } from './exportSpreadsheet';
import Main from './components/Main';

const PLANS_KEY = 'retirement-planner-plans-v2';
const LEGACY_KEY = 'retirement-planner-inputs';

const DEFAULTS: InputParams = {
  // Personal
  age: 30,
  birthYear: undefined,
  retireAge: 67,
  lifeExp: 95,
  filingStatus: 'single',
  spouseAge: undefined,
  spouseBirthYear: undefined,
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
  rothBasis: undefined,
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
  qcdAnnual: 0,
  qcdStartAge: 70,
  useJointLifeRmd: false,

  // Returns (nominal)
  r: 0.07,
  taxableReturn: 0.07,
  taxableOrdinaryYield: 0,
  taxableQualifiedDividendYield: 0.015,
  taxableRealizedGainYield: 0,
  hsaReturn: 0.07,

  // Inflation
  inf: 0.03,

  // Tax
  stateTaxRate: 0,
  stateTaxBrackets: undefined,

  // Assumptions
  includeIRMAA: true,
  includeMedicarePremiums: false,
  includeAcaPremiumCredits: false,
  acaMonthlyPremium: 0,
  acaMonthlyCredit: 0,
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
  monteCarloSettings?: MonteCarloSettings;
}

type MonteCarloPreset = 'base' | 'stress';
type MonteCarloMethod = 'parametric' | 'historical';

interface MonteCarloSettings {
  runs: number;
  seed: string;
  preset: MonteCarloPreset;
  method: MonteCarloMethod;
  stockAllocation: number;
  bondAllocation: number;
  cashAllocation: number;
  blockSize: number;
}

const DEFAULT_MONTE_CARLO_SETTINGS: MonteCarloSettings = {
  runs: 1000,
  seed: DEFAULT_MONTE_CARLO_OPTIONS.seed,
  preset: 'base',
  method: 'historical',
  stockAllocation: DEFAULT_MONTE_CARLO_OPTIONS.stockAllocation,
  bondAllocation: DEFAULT_MONTE_CARLO_OPTIONS.bondAllocation,
  cashAllocation: DEFAULT_MONTE_CARLO_OPTIONS.cashAllocation,
  blockSize: DEFAULT_MONTE_CARLO_OPTIONS.blockSize,
};

function getMonteCarloOptions(
  preset: MonteCarloPreset,
  runs: number,
  seed: string,
  method: 'parametric' | 'historical',
  stockAllocation: number,
  bondAllocation: number,
  cashAllocation: number,
  blockSize: number,
): MonteCarloOptions {
  const common = {
    method,
    runs,
    seed,
    stockAllocation,
    bondAllocation,
    cashAllocation,
    blockSize,
  };
  return preset === 'stress'
    ? {
        ...common,
        portfolioStdDev: 0.19,
        taxableStdDev: 0.17,
        hsaStdDev: 0.17,
        inflationStdDev: 0.024,
        expenseInflationStdDev: 0.022,
        healthcareInflationStdDev: 0.032,
        bearMarketProbability: 0.12,
        bearMarketReturnDrag: -0.22,
        bearMarketInflationShock: 0.015,
        spendingShockProbability: 0.08,
        spendingShockPct: 0.35,
      }
    : common;
}

const newPlanId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function createPlan(name: string, inputs: InputParams = DEFAULTS): StoredPlan {
  return { id: newPlanId(), name, inputs, conversionSchedule: null, monteCarloSettings: DEFAULT_MONTE_CARLO_SETTINGS };
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
    monteCarloSettings: plan.monteCarloSettings ?? DEFAULT_MONTE_CARLO_SETTINGS,
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

function importPlanFromFile(file: File): Promise<{ inputs: InputParams; conversionSchedule: Record<number, number> | null; optMinStartAge?: number; monteCarloSettings?: MonteCarloSettings }> {
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
            monteCarloSettings: { ...DEFAULT_MONTE_CARLO_SETTINGS, ...(parsed.monteCarloSettings ?? {}) },
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

type NavItem = { key: PlannerPage; label: string; section: 'SETUP' | 'RESULTS' | 'TOOLS'; configured?: boolean };

const App: React.FC = () => {
  const [plans, setPlans] = useState<StoredPlan[]>(() => loadPlans().plans);
  const [activePlanId, setActivePlanId] = useState<string>(() => loadPlans().activePlanId);
  const [activeTab, setActiveTab] = useState<PlannerPage>('about');
  const [rows, setRows] = useState<ProjectionRow[]>([]);
  const [planMenuOpen, setPlanMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [metrics, setMetrics] = useState<{ m1: string; m2: string; m3: string; m4: string; m5: string }>({
    m1: '—', m2: '—', m3: '—', m4: '—', m5: '—',
  });

  // Derived from active plan
  const activePlan = plans.find(p => p.id === activePlanId) ?? plans[0];
  const inputs = activePlan.inputs;
  const conversionSchedule = activePlan.conversionSchedule;
  const optMinStartAge = activePlan.optMinStartAge ?? inputs.age;
  const monteCarloSettings = { ...DEFAULT_MONTE_CARLO_SETTINGS, ...(activePlan.monteCarloSettings ?? {}) };
  const accountsConfigured =
    (inputs.accounts?.length ?? 0) > 0 ||
    inputs.tradBal > 0 || inputs.rothBal > 0 || inputs.taxableBal > 0 || inputs.hsaBal > 0 ||
    inputs.tradContrib > 0 || inputs.rothContrib > 0 || inputs.taxableContrib > 0 || inputs.hsaContrib > 0 ||
    !!inputs.salary;
  const expensesConfigured =
    (inputs.expenseItems?.length ?? 0) > 0 ||
    inputs.expenses > 0 || inputs.healthcareExpenses > 0 ||
    inputs.discretionaryExpenses > 0 || inputs.ltcExpenses > 0;
  const navItems: NavItem[] = [
    { key: 'about', label: 'About You', section: 'SETUP', configured: true },
    { key: 'social', label: 'Social Security', section: 'SETUP', configured: inputs.ss > 0 || !!inputs.ss62 || !!inputs.ss67 || !!inputs.ss70 },
    { key: 'conversions', label: 'Roth Conversions', section: 'SETUP', configured: inputs.rothConv > 0 || !!conversionSchedule },
    { key: 'taxsettings', label: 'Tax Settings', section: 'SETUP', configured: inputs.includeIRMAA || inputs.includeStateTax || inputs.includeMedicarePremiums || inputs.includeAcaPremiumCredits || inputs.qcdAnnual > 0 },
    { key: 'accounts', label: 'Accounts', section: 'SETUP', configured: accountsConfigured },
    { key: 'expenses', label: 'Expenses', section: 'SETUP', configured: expensesConfigured },
    { key: 'balance', label: 'Balances', section: 'RESULTS' },
    { key: 'income', label: 'Income', section: 'RESULTS' },
    { key: 'rmd', label: 'RMDs & Conversions', section: 'RESULTS' },
    { key: 'tax', label: 'Tax Analysis', section: 'RESULTS' },
    { key: 'cashflow', label: 'Cash Flow', section: 'RESULTS' },
    { key: 'optimizer', label: 'Roth Optimizer', section: 'TOOLS' },
    { key: 'mc', label: 'Monte Carlo', section: 'TOOLS' },
  ];

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
    const peakRmd = projectionRows.reduce((mx, r) => (r.rmd > mx ? r.rmd : mx), 0);
    const m3 = peakRmd > 0 ? `${fmt(peakRmd)}/yr` : 'None';

    const lastRow = projectionRows[projectionRows.length - 1];
    const m4 = lastRow ? fmt(lastRow.total) : '—';

    const m5 = `${runMonteCarlo(inputs, conversionSchedule, getMonteCarloOptions(
      monteCarloSettings.preset,
      monteCarloSettings.runs,
      monteCarloSettings.seed,
      monteCarloSettings.method,
      monteCarloSettings.stockAllocation,
      monteCarloSettings.bondAllocation,
      monteCarloSettings.cashAllocation,
      monteCarloSettings.blockSize,
    )).finalSuccessRate}%`;

    setMetrics({ m1, m2, m3, m4, m5 });
  }, [
    inputs,
    conversionSchedule,
    monteCarloSettings.preset,
    monteCarloSettings.runs,
    monteCarloSettings.seed,
    monteCarloSettings.method,
    monteCarloSettings.stockAllocation,
    monteCarloSettings.bondAllocation,
    monteCarloSettings.cashAllocation,
    monteCarloSettings.blockSize,
  ]);

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

  const updateMonteCarloSettings = (patch: Partial<MonteCarloSettings>) =>
    updateActivePlan({ monteCarloSettings: { ...monteCarloSettings, ...patch } });

  const handleInputChange = (field: keyof InputParams, value: string | number | boolean) => {
    setPlans(prev => prev.map(p => {
      if (p.id !== activePlanId) return p;
      const next = { ...p.inputs, [field]: value };
      const { ss62, ss67, ss70 } = next;
      if (ss62 && ss67 && ss70 && (field === 'ssAge' || field === 'ss62' || field === 'ss67' || field === 'ss70' || field === 'birthYear' || field === 'age')) {
        next.ss = ssInterpolate(ss62, ss67, ss70, next.ssAge, fullRetirementAge(inferredBirthYear(next)));
      }
      const { spouseSs62, spouseSs67, spouseSs70 } = next;
      if (spouseSs62 && spouseSs67 && spouseSs70 &&
          (field === 'spouseSsAge' || field === 'spouseSs62' || field === 'spouseSs67' || field === 'spouseSs70' || field === 'spouseBirthYear' || field === 'spouseAge')) {
        const spouseBirthYear = inferredSpouseBirthYear(next);
        next.spouseSs = ssInterpolate(
          spouseSs62,
          spouseSs67,
          spouseSs70,
          next.spouseSsAge ?? 67,
          spouseBirthYear !== undefined ? fullRetirementAge(spouseBirthYear) : 67,
        );
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
    setActiveTab('about');
    setPlanMenuOpen(false);
  };

  const duplicatePlan = () => {
    const plan: StoredPlan = { ...activePlan, id: newPlanId(), name: `${activePlan.name} (copy)` };
    setPlans(prev => [...prev, plan]);
    setActivePlanId(plan.id);
    setPlanMenuOpen(false);
  };

  const renamePlan = () => {
    const name = window.prompt('Rename plan:', activePlan.name);
    if (name?.trim()) updateActivePlan({ name: name.trim() });
    setPlanMenuOpen(false);
  };

  const resetPlan = () => {
    if (!window.confirm(`Reset "${activePlan.name}" to blank defaults? All data in this plan will be lost.`)) return;
    updateActivePlan({
      inputs: DEFAULTS,
      conversionSchedule: null,
      optMinStartAge: undefined,
      monteCarloSettings: DEFAULT_MONTE_CARLO_SETTINGS,
    });
    setPlanMenuOpen(false);
  };

  const deletePlan = () => {
    if (plans.length <= 1) return;
    if (!window.confirm(`Delete "${activePlan.name}"? This cannot be undone.`)) return;
    const remaining = plans.filter(p => p.id !== activePlanId);
    setPlans(remaining);
    setActivePlanId(remaining[remaining.length - 1].id);
    setPlanMenuOpen(false);
  };

  // ---- File I/O ----

  const handleExport = () => exportPlanToFile(activePlan);
  const handleExportSpreadsheet = () => exportToSpreadsheet(inputs, rows);
  const handleImport = async (file: File) => {
    try {
      const {
        inputs: imported,
        conversionSchedule: importedSchedule,
        optMinStartAge: importedOptAge,
        monteCarloSettings: importedMonteCarloSettings,
      } = await importPlanFromFile(file);
      const name = file.name.replace(/\.json$/i, '').replace(/[-_]/g, ' ');
      const plan: StoredPlan = {
        ...createPlan(name || 'Imported Plan', imported),
        conversionSchedule: importedSchedule,
        optMinStartAge: importedOptAge,
        monteCarloSettings: importedMonteCarloSettings ?? DEFAULT_MONTE_CARLO_SETTINGS,
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
        <div className="plan-menu">
          <button
            className={`plan-trigger ${planMenuOpen ? 'open' : ''}`}
            onClick={() => setPlanMenuOpen(open => !open)}
            aria-haspopup="menu"
            aria-expanded={planMenuOpen}
          >
            <span className="plan-trigger-dot" />
            <span>
              <span className="plan-trigger-label">Active plan</span>
              <span className="plan-trigger-name">{activePlan.name}</span>
            </span>
            <span className="plan-trigger-chevron">{planMenuOpen ? '⌃' : '⌄'}</span>
          </button>
          {planMenuOpen && (
            <div className="plan-dropdown" role="menu">
              <div className="plan-list">
                {plans.map(plan => (
                  <button
                    key={plan.id}
                    className={`plan-row ${plan.id === activePlanId ? 'active' : ''}`}
                    onClick={() => { setActivePlanId(plan.id); setPlanMenuOpen(false); }}
                  >
                    <span className="plan-row-dot" />
                    <span>{plan.name}</span>
                  </button>
                ))}
              </div>
              <div className="plan-menu-divider" />
              <button className="plan-action" onClick={addPlan}>New plan</button>
              <button className="plan-action" onClick={renamePlan}>Rename plan</button>
              <button className="plan-action" onClick={duplicatePlan}>Duplicate plan</button>
              <button className="plan-action" onClick={resetPlan}>Reset to defaults</button>
              <button className="plan-action danger" onClick={deletePlan} disabled={plans.length <= 1}>Delete plan</button>
            </div>
          )}
        </div>

        {/* File I/O — right */}
        <div className="file-actions">
          <label className="file-import">
            <span className="file-icon">⇧</span>
            <span>Import</span>
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.[0]) { handleImport(e.target.files[0]); e.target.value = ''; } }}
            />
          </label>
          <div className="export-menu">
            <button
              className={`export-trigger ${exportMenuOpen ? 'open' : ''}`}
              onClick={() => setExportMenuOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
            >
              <span>Export</span>
              <span className="export-chevron">{exportMenuOpen ? '⌃' : '⌄'}</span>
            </button>
            {exportMenuOpen && (
              <div className="export-dropdown" role="menu">
                <button className="export-row" onClick={() => { handleExport(); setExportMenuOpen(false); }}>
                  <span>Export as JSON</span>
                  <span>.json</span>
                </button>
                <button className="export-row" onClick={() => { handleExportSpreadsheet(); setExportMenuOpen(false); }}>
                  <span>Export to Excel</span>
                  <span>.xls</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <nav className="left-nav">
        {(['SETUP', 'RESULTS', 'TOOLS'] as const).map(section => (
          <div key={section} className="nav-section">
            <div className="nav-section-label">{section}</div>
            {navItems.filter(item => item.section === section).map(item => (
              <button
                key={item.key}
                className={`nav-item ${activeTab === item.key ? 'active' : ''}`}
                onClick={() => setActiveTab(item.key)}
              >
                <span className={`nav-dot ${item.configured === false ? 'missing' : ''}`} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <Main
        inputs={inputs}
        activeTab={activeTab}
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
        mcRuns={monteCarloSettings.runs}
        setMcRuns={runs => updateMonteCarloSettings({ runs })}
        mcSeed={monteCarloSettings.seed}
        setMcSeed={seed => updateMonteCarloSettings({ seed })}
        mcPreset={monteCarloSettings.preset}
        setMcPreset={preset => updateMonteCarloSettings({ preset })}
        mcMethod={monteCarloSettings.method}
        setMcMethod={method => updateMonteCarloSettings({ method })}
        mcStockAllocation={monteCarloSettings.stockAllocation}
        setMcStockAllocation={stockAllocation => updateMonteCarloSettings({ stockAllocation })}
        mcBondAllocation={monteCarloSettings.bondAllocation}
        setMcBondAllocation={bondAllocation => updateMonteCarloSettings({ bondAllocation })}
        mcCashAllocation={monteCarloSettings.cashAllocation}
        setMcCashAllocation={cashAllocation => updateMonteCarloSettings({ cashAllocation })}
        mcBlockSize={monteCarloSettings.blockSize}
        setMcBlockSize={blockSize => updateMonteCarloSettings({ blockSize })}
        getMonteCarloOptions={getMonteCarloOptions}
      />
    </div>
  );
};

export default App;
