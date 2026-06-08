import React, { useState, useEffect, useMemo } from 'react';
import type { InputParams, ProjectionRow, Account } from './types';
import { runProjection, fmt, ssInterpolate } from './financial';
import { runOptimizer } from './optimizer';
import type { OptimizationOutput } from './optimizer';
import { exportToSpreadsheet } from './exportSpreadsheet';
import Sidebar from './components/Sidebar';
import Main from './components/Main';

const STORAGE_KEY = 'retirement-planner-inputs';

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
  targetConvBracket: 1, // 12% bracket

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

function loadFromStorage(): InputParams {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return DEFAULTS;
}

function saveToStorage(inputs: InputParams): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    // ignore quota errors
  }
}

function exportToFile(inputs: InputParams): void {
  const data = JSON.stringify(inputs, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'retirement-plan.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importFromFile(file: File): Promise<InputParams> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        resolve({ ...DEFAULTS, ...parsed });
      } catch {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

function shareViaURL(inputs: InputParams): void {
  const params = new URLSearchParams();
  Object.entries(inputs).forEach(([key, value]) => {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  });
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  navigator.clipboard.writeText(url).then(() => {
    alert('Shareable link copied to clipboard!');
  }).catch(() => {
    prompt('Copy this link:', url);
  });
}

function loadFromURL(): InputParams | null {
  const params = new URLSearchParams(window.location.search);
  if (params.size === 0) return null;
  const inputs: Partial<Record<keyof InputParams, string>> = {};
  params.forEach((value, key) => {
    inputs[key as keyof InputParams] = value;
  });
  const parsed: Partial<InputParams> = {};
  (Object.keys(inputs) as Array<keyof InputParams>).forEach(k => {
    const value = inputs[k];
    if (value !== undefined) {
      if (k === 'filingStatus') {
        parsed[k] = value as 'single' | 'married';
      } else if (k === 'spouseSsType') {
        parsed[k] = value as 'own' | 'spousal' | 'combined';
      } else if (k === 'targetConvBracket') {
        parsed[k] = parseInt(value) as 0 | 1 | 2 | 3;
      } else if (k === 'includeIRMAA' || k === 'includeStateTax') {
        parsed[k] = value === 'true';
      } else {
        const num = parseFloat(value);
        if (!isNaN(num)) (parsed as any)[k] = num;
      }
    }
  });
  return { ...DEFAULTS, ...parsed };
}

const App: React.FC = () => {
  const [inputs, setInputs] = useState<InputParams>(() => {
    const fromURL = loadFromURL();
    if (fromURL) return fromURL;
    return loadFromStorage();
  });
  const [activeTab, setActiveTab] = useState<'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer' | 'expenses' | 'accounts'>('balance');
  const [conversionSchedule, setConversionSchedule] = useState<Record<number, number> | null>(null);
  const [rows, setRows] = useState<ProjectionRow[]>([]);
  const [metrics, setMetrics] = useState<{ m1: string; m2: string; m3: string; m4: string; m5: string }>({
    m1: '—',
    m2: '—',
    m3: '—',
    m4: '—',
    m5: '—',
  });

  // Save to localStorage whenever inputs change
  useEffect(() => {
    saveToStorage(inputs);
  }, [inputs]);

  // Run projection whenever inputs change
  useEffect(() => {
    const r = inputs.r;
    const projectionRows = runProjection(inputs, r, conversionSchedule ?? undefined);
    setRows(projectionRows);

    const retireIn = Math.max(1, inputs.retireAge - inputs.age);
    const retireRow = projectionRows[retireIn] || projectionRows[projectionRows.length - 1];
    const m1 = fmt(retireRow.total);

    const allProjectionRows = projectionRows.slice(1); // all years from current age, matching Tax Analysis tab
    const lifetimeTax = Math.round(allProjectionRows.reduce((s, r) => s + r.totalTax, 0));
    const m2 = fmt(lifetimeTax);
    const retireRows = projectionRows.slice(retireIn); // retirement rows only (for MC sim)

    const peakRmd = projectionRows.reduce((mx, r) => (r.rmd > mx ? r.rmd : mx), 0);
    const m3 = peakRmd > 0 ? `${fmt(peakRmd)}/yr` : 'None';

    const lastRow = projectionRows[projectionRows.length - 1];
    const m4 = lastRow ? fmt(lastRow.total) : '—';

    // Monte Carlo success rate — 1000 sims, tracks whether balance stays positive to life expectancy
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

  const [optMinStartAge, setOptMinStartAge] = useState(() => inputs.age);

  // Run optimizer (memoized, only recompute when inputs or min start age change)
  const optimization: OptimizationOutput | null = useMemo(() => {
    try {
      return runOptimizer(inputs, optMinStartAge);
    } catch {
      return null;
    }
  }, [inputs, optMinStartAge]);

  // Timestamp so Optimizer tab can show it re-ran
  const [optTimestamp, setOptTimestamp] = useState(Date.now());
  useEffect(() => {
    if (optimization) setOptTimestamp(Date.now());
  }, [optimization]);

  const handleInputChange = (field: keyof InputParams, value: string | number | boolean) => {
    setInputs(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calculate primary ss from estimates
      const { ss62, ss67, ss70 } = next;
      if (ss62 && ss67 && ss70 && (field === 'ssAge' || field === 'ss62' || field === 'ss67' || field === 'ss70')) {
        next.ss = ssInterpolate(ss62, ss67, ss70, next.ssAge);
      }
      // Auto-calculate spouse ss from estimates (own record)
      const { spouseSs62, spouseSs67, spouseSs70 } = next;
      if (spouseSs62 && spouseSs67 && spouseSs70 &&
          (field === 'spouseSsAge' || field === 'spouseSs62' || field === 'spouseSs67' || field === 'spouseSs70')) {
        next.spouseSs = ssInterpolate(spouseSs62, spouseSs67, spouseSs70, next.spouseSsAge ?? 67);
      }
      return next;
    });
  };

  const handleExpenseItemsChange = (items: import('./types').ExpenseItem[]) => {
    setInputs(prev => ({ ...prev, expenseItems: items.length > 0 ? items : undefined }));
  };

  const handleAccountsChange = (accounts: Account[]) => {
    setInputs(prev => ({ ...prev, accounts: accounts.length > 0 ? accounts : undefined }));
  };

  const handleExport = () => exportToFile(inputs);
  const handleExportSpreadsheet = () => exportToSpreadsheet(inputs, rows);
  const handleShare = () => shareViaURL(inputs);
  const handleImport = async (file: File) => {
    try {
      const imported = await importFromFile(file);
      setInputs(imported);
    } catch {
      alert('Failed to import. Please select a valid JSON file.');
    }
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Retirement Planner</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="tab" onClick={handleExport} style={{ padding: '4px 10px', fontSize: '11px' }}>
            Export JSON
          </button>
          <button className="tab" onClick={handleExportSpreadsheet} style={{ padding: '4px 10px', fontSize: '11px' }}>
            Export Excel
          </button>
          <button className="tab" onClick={handleShare} style={{ padding: '4px 10px', fontSize: '11px' }}>
            Share Link
          </button>
          <label className="tab" style={{ padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }}>
            Import
            <input
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
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