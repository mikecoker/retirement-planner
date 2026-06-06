import React, { useState, useEffect, useMemo } from 'react';
import type { InputParams, ProjectionRow } from './types';
import { runProjection, fmt, ssInterpolate } from './financial';
import { runOptimizer } from './optimizer';
import type { OptimizationOutput } from './optimizer';
import { exportToSpreadsheet } from './exportSpreadsheet';
import Sidebar from './components/Sidebar';
import Main from './components/Main';

const STORAGE_KEY = 'retirement-planner-inputs';

const DEFAULTS: InputParams = {
  // Personal
  age: 50,
  retireAge: 62,
  lifeExp: 90,
  filingStatus: 'married',
  spouseAge: undefined,
  spouseLifeExp: undefined,
  spouseSsType: 'own',
  spouseSs: undefined,
  spouseSs62: undefined,
  spouseSs67: undefined,
  spouseSs70: undefined,
  spouseSsAge: 67,

  // Accounts
  tradBal: 400000,
  rothBal: 100000,
  taxableBal: 50000,
  hsaBal: 20000,
  tradContrib: 1500,
  rothContrib: 500,
  taxableContrib: 500,
  hsaContrib: 300,
  employerMatch: 0.04,
  matchLimit: 6,

  // Social Security
  ss: 2200,
  ssAge: 67,
  ss62: 0,
  ss67: 0,
  ss70: 0,

  // Spending
  expenses: 6000,
  healthcareExpenses: 800,
  ltcExpenses: 0,
  discretionaryExpenses: 1000,
  expenseInflationRate: 0.03,
  healthcareInflationRate: 0.055,

  // Roth conversions
  rothConv: 20000,
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
  const [activeTab, setActiveTab] = useState<'balance' | 'income' | 'rmd' | 'mc' | 'tax' | 'cashflow' | 'optimizer'>('balance');
  const [rows, setRows] = useState<ProjectionRow[]>([]);
  const [metrics, setMetrics] = useState<{ m1: string; m2: string; m3: string; m4: string }>({
    m1: '—',
    m2: '—',
    m3: '—',
    m4: '—',
  });

  // Save to localStorage whenever inputs change
  useEffect(() => {
    saveToStorage(inputs);
  }, [inputs]);

  // Run projection whenever inputs change
  useEffect(() => {
    const r = inputs.r;
    const projectionRows = runProjection(inputs, r);
    setRows(projectionRows);

    const retireIn = Math.max(1, inputs.retireAge - inputs.age);
    const retireRow = projectionRows[retireIn] || projectionRows[projectionRows.length - 1];
    const m1 = fmt(retireRow.total);

    const postRetire = projectionRows.filter(r => r.age >= inputs.retireAge && r.totalTax > 0);
    const avgTax = postRetire.length
      ? Math.round(postRetire.reduce((s, r) => s + r.totalTax, 0) / postRetire.length)
      : 0;
    const m2 = fmt(avgTax);

    const peakRmd = projectionRows.reduce((mx, r) => (r.rmd > mx ? r.rmd : mx), 0);
    const m3 = peakRmd > 0 ? `${fmt(peakRmd)}/yr` : 'None';

    const ssIdx = Math.min(inputs.ssAge - inputs.age, projectionRows.length - 1);
    const ssRow = projectionRows[Math.max(ssIdx, retireIn)] || projectionRows[projectionRows.length - 1];
    const totalIncome = (ssRow.tradW + ssRow.rothW + ssRow.taxableW + ssRow.hsaW + ssRow.ss + ssRow.spouseSs + ssRow.pension - ssRow.totalTax) / 12;
    const inflExp = (inputs.expenses + inputs.healthcareExpenses + inputs.discretionaryExpenses) * Math.pow(1 + inputs.inf, Math.max(0, inputs.ssAge - inputs.age));
    const gap = totalIncome - inflExp;
    const m4 = (gap >= 0 ? '+' : '') + fmt(gap) + '/mo';

    setMetrics({ m1, m2, m3, m4 });
  }, [inputs]);

  // Run optimizer (memoized, only recompute when inputs change)
  const optimization: OptimizationOutput | null = useMemo(() => {
    try {
      return runOptimizer(inputs);
    } catch {
      return null;
    }
  }, [inputs]);

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

      <Sidebar inputs={inputs} onInputChange={handleInputChange} />
      <Main
        inputs={inputs}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        rows={rows}
        metrics={metrics}
        optimization={optimization}
        optTimestamp={optTimestamp}
      />
    </div>
  );
};

export default App;