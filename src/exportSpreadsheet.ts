import * as XLSX from 'xlsx';
import type { InputParams, ProjectionRow } from './types';

function pct(v: number) { return `${(v * 100).toFixed(2)}%`; }
function dollar(v: number) { return Math.round(v); }

function inputsSheet(inputs: InputParams): XLSX.WorkSheet {
  const rows: (string | number | boolean | undefined)[][] = [
    ['Parameter', 'Value'],
    [],
    ['── Personal ──', ''],
    ['Current age', inputs.age],
    ['Retirement age', inputs.retireAge],
    ['Life expectancy', inputs.lifeExp],
    ['Filing status', inputs.filingStatus],
    [],
    ['── Spouse ──', ''],
    ['Spouse age', inputs.spouseAge ?? ''],
    ['Spouse life expectancy', inputs.spouseLifeExp ?? ''],
    ['Spouse SS benefit type', inputs.spouseSsType ?? 'own'],
    ['Spouse SS claim age', inputs.spouseSsAge ?? 67],
    ['Spouse SS at 62 ($/mo)', inputs.spouseSs62 ?? ''],
    ['Spouse SS at 67 ($/mo)', inputs.spouseSs67 ?? ''],
    ['Spouse SS at 70 ($/mo)', inputs.spouseSs70 ?? ''],
    [],
    ['── Accounts ──', ''],
    ['Traditional IRA/401k balance ($)', inputs.tradBal],
    ['Roth IRA balance ($)', inputs.rothBal],
    ['Taxable account balance ($)', inputs.taxableBal],
    ['HSA balance ($)', inputs.hsaBal],
    ['Traditional contribution ($/mo)', inputs.tradContrib],
    ['Roth contribution ($/mo)', inputs.rothContrib],
    ['Taxable contribution ($/mo)', inputs.taxableContrib],
    ['HSA contribution ($/mo)', inputs.hsaContrib],
    ['Employer match (%)', pct(inputs.employerMatch)],
    ['Match limit (% of salary)', inputs.matchLimit],
    [],
    ['── Social Security ──', ''],
    ['SS monthly benefit at claim age ($)', inputs.ss],
    ['SS claim age', inputs.ssAge],
    ['SS estimate at 62 ($/mo)', inputs.ss62 || ''],
    ['SS estimate at 67 ($/mo)', inputs.ss67 || ''],
    ['SS estimate at 70 ($/mo)', inputs.ss70 || ''],
    ['SS COLA (%/yr)', pct(inputs.ssCOLA)],
    [],
    ['── Spending ──', ''],
    ['Base monthly expenses ($)', inputs.expenses],
    ['Healthcare expenses ($/mo)', inputs.healthcareExpenses],
    ['LTC reserve ($/mo, from age 80)', inputs.ltcExpenses],
    ['Discretionary expenses ($/mo)', inputs.discretionaryExpenses],
    ['Expense inflation rate (%/yr)', pct(inputs.expenseInflationRate)],
    ['Healthcare inflation rate (%/yr)', pct(inputs.healthcareInflationRate)],
    [],
    ['── Roth Conversions ──', ''],
    ['Max annual conversion ($)', inputs.rothConv],
    ['Convert until age', inputs.convUntil],
    ['Target bracket', ['10%','12%','22%','24%'][inputs.targetConvBracket]],
    [],
    ['── Returns & Inflation ──', ''],
    ['Portfolio return (nominal %/yr)', pct(inputs.r)],
    ['Taxable account return (%/yr)', pct(inputs.taxableReturn)],
    ['HSA return (%/yr)', pct(inputs.hsaReturn)],
    ['Inflation rate (%/yr)', pct(inputs.inf)],
    [],
    ['── Tax ──', ''],
    ['Include IRMAA surcharges', inputs.includeIRMAA],
    ['Include state tax', inputs.includeStateTax],
    ['State tax rate (%)', pct(inputs.stateTaxRate)],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 20 }];
  return ws;
}

function balancesSheet(rows: ProjectionRow[]): XLSX.WorkSheet {
  const header = ['Age', 'Traditional ($)', 'Roth ($)', 'Taxable ($)', 'HSA ($)', 'Total ($)'];
  const data = rows.map(r => [r.age, dollar(r.trad), dollar(r.roth), dollar(r.taxable), dollar(r.hsa), dollar(r.total)]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
  return ws;
}

function incomeSheet(rows: ProjectionRow[]): XLSX.WorkSheet {
  const header = [
    'Age',
    'SS – You ($)',
    'SS – Spouse ($)',
    'Trad Withdrawal ($)',
    'Roth Withdrawal ($)',
    'Taxable Withdrawal ($)',
    'HSA Withdrawal ($)',
    'Roth Conversion ($)',
    'Pension ($)',
    'Total Income ($)',
    'Total Tax ($)',
    'Net Spendable ($)',
  ];
  const data = rows.map(r => {
    const totalIn = r.tradW + r.rothW + r.taxableW + r.hsaW + r.ss + r.spouseSs + r.pension;
    const netSpendable = totalIn - r.conv - r.totalSpending - r.totalTax;
    return [
      r.age,
      dollar(r.ss),
      dollar(r.spouseSs),
      dollar(r.tradW),
      dollar(r.rothW),
      dollar(r.taxableW),
      dollar(r.hsaW),
      dollar(r.conv),
      dollar(r.pension),
      dollar(totalIn),
      dollar(r.totalTax),
      dollar(netSpendable),
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length, 10) + 2 }));
  return ws;
}

function rmdsSheet(rows: ProjectionRow[]): XLSX.WorkSheet {
  const header = [
    'Age',
    'Traditional Balance ($)',
    'RMD Required ($)',
    'Roth Conversion ($)',
    'Marginal Rate (%)',
    'Conv Tax ($)',
  ];
  const data = rows.map(r => [
    r.age,
    dollar(r.trad),
    dollar(r.rmd),
    dollar(r.conv),
    pct(r.marginalRate),
    dollar(r.convTax),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length, 10) + 2 }));
  return ws;
}

function taxSheet(rows: ProjectionRow[]): XLSX.WorkSheet {
  const header = [
    'Age',
    'Ordinary Income ($)',
    'SS Taxable ($)',
    'Qualified Dividends ($)',
    'Standard Deduction ($)',
    'Taxable Income ($)',
    'Federal Tax ($)',
    'State Tax ($)',
    'IRMAA Part B ($)',
    'IRMAA Part D ($)',
    'Total Tax ($)',
    'Marginal Rate (%)',
    'Effective Rate (%)',
  ];
  const data = rows.map(r => [
    r.age,
    dollar(r.ordinaryIncome),
    dollar(r.ssTaxable),
    dollar(r.qualifiedDividends),
    dollar(r.standardDeduction),
    dollar(r.taxableIncome),
    dollar(r.federalTax),
    dollar(r.stateTax),
    dollar(r.irmaaPartB),
    dollar(r.irmaaPartD),
    dollar(r.totalTax),
    pct(r.marginalRate),
    pct(r.effectiveRate),
  ]);
  // Totals row
  const sum = (fn: (r: ProjectionRow) => number) => dollar(rows.reduce((s, r) => s + fn(r), 0));
  data.push([
    'TOTAL',
    sum(r => r.ordinaryIncome), sum(r => r.ssTaxable), sum(r => r.qualifiedDividends),
    '', '',
    sum(r => r.federalTax), sum(r => r.stateTax),
    sum(r => r.irmaaPartB), sum(r => r.irmaaPartD),
    sum(r => r.totalTax), '', '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length, 10) + 2 }));
  return ws;
}

function spendingSheet(rows: ProjectionRow[]): XLSX.WorkSheet {
  const header = [
    'Age',
    'Base Expenses ($)',
    'Healthcare ($)',
    'LTC ($)',
    'Discretionary ($)',
    'Total Spending ($)',
    'Withdrawal Rate (%)',
  ];
  const data = rows.map(r => [
    r.age,
    dollar(r.expenses),
    dollar(r.healthcareExpenses),
    dollar(r.ltcExpenses),
    dollar(r.discretionaryExpenses),
    dollar(r.totalSpending),
    pct(r.withdrawalRate),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length, 10) + 2 }));
  return ws;
}

export function exportToSpreadsheet(inputs: InputParams, rows: ProjectionRow[]): void {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, inputsSheet(inputs), 'Inputs');
  XLSX.utils.book_append_sheet(wb, balancesSheet(rows), 'Balances');
  XLSX.utils.book_append_sheet(wb, incomeSheet(rows), 'Income');
  XLSX.utils.book_append_sheet(wb, rmdsSheet(rows), 'RMDs & Conversions');
  XLSX.utils.book_append_sheet(wb, taxSheet(rows), 'Tax');
  XLSX.utils.book_append_sheet(wb, spendingSheet(rows), 'Spending');
  XLSX.writeFile(wb, 'retirement-plan.xlsx');
}
