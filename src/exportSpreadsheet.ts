import * as XLSX from 'xlsx';
import type { InputParams, ProjectionRow } from './types';
import { activeSalaryAt } from './financial';
import { getStateTaxPreset } from './stateTaxPresets';

function pct(v: number) { return `${(v * 100).toFixed(2)}%`; }
function dollar(v: number) { return Math.round(v); }

function inputsSheet(inputs: InputParams): XLSX.WorkSheet {
  const stateTaxPreset = getStateTaxPreset(inputs.stateTaxPreset);
  const rows: (string | number | boolean | undefined)[][] = [
    ['Parameter', 'Value'],
    [],
    ['── Personal ──', ''],
    ['Current age', inputs.age],
    ['Birth year', inputs.birthYear ?? ''],
    ['Retirement age', inputs.retireAge],
    ['Life expectancy', inputs.lifeExp],
    ['Filing status', inputs.filingStatus],
    ['Annual salary / wages ($)', inputs.salary ?? ''],
    [],
    ['── Spouse ──', ''],
    ['Spouse age', inputs.spouseAge ?? ''],
    ['Spouse birth year', inputs.spouseBirthYear ?? ''],
    ['Spouse retirement age', inputs.spouseRetireAge ?? ''],
    ['Spouse life expectancy', inputs.spouseLifeExp ?? ''],
    ['Spouse annual salary / wages ($)', inputs.spouseSalary ?? ''],
    ['Spouse SS benefit type', inputs.spouseSsType ?? 'own'],
    ['Spouse SS claim age', inputs.spouseSsAge ?? 67],
    ['Spouse SS at 62 ($/mo)', inputs.spouseSs62 ?? ''],
    ['Spouse SS at 67 ($/mo)', inputs.spouseSs67 ?? ''],
    ['Spouse SS at 70 ($/mo)', inputs.spouseSs70 ?? ''],
    [],
    ['── Accounts ──', ''],
    ['Traditional IRA/401k balance ($)', inputs.tradBal],
    ['Roth IRA balance ($)', inputs.rothBal],
    ['Roth basis ($)', inputs.rothBasis ?? ''],
    ['Taxable account balance ($)', inputs.taxableBal],
    ['Taxable cost basis ($)', inputs.taxableBasis ?? ''],
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
    ['SS benefit paid (%)', pct(inputs.ssBenefitFactor ?? 1)],
    ['SS COLA (%/yr)', pct(inputs.ssCOLA)],
    [],
    ['── Spending ──', ''],
    ['Base monthly expenses ($)', inputs.expenses],
    ['Healthcare expenses ($/mo)', inputs.healthcareExpenses],
    ['LTC reserve ($/mo, from age 80)', inputs.ltcExpenses],
    ['Discretionary expenses ($/mo)', inputs.discretionaryExpenses],
    ['Expense inflation rate (%/yr)', pct(inputs.expenseInflationRate)],
    ['Healthcare inflation rate (%/yr)', pct(inputs.healthcareInflationRate)],
    ['Retirement spending smile enabled', inputs.spendingSmileEnabled ?? false],
    ['Early retirement spending change (%)', pct(inputs.earlyRetirementSpendingChange ?? 0)],
    ['Late retirement age', inputs.lateRetirementAge ?? ''],
    ['Late retirement spending change (%)', pct(inputs.lateRetirementSpendingChange ?? 0)],
    [],
    ['── Roth Conversions ──', ''],
    ['Max annual conversion ($)', inputs.rothConv],
    ['Convert start age', inputs.convStart],
    ['Convert until age', inputs.convUntil],
    ['Target bracket', ['10%','12%','22%','24%'][inputs.targetConvBracket]],
    [],
    ['── Returns & Inflation ──', ''],
    ['Portfolio return (nominal %/yr)', pct(inputs.r)],
    ['Taxable account return (%/yr)', pct(inputs.taxableReturn)],
    ['Taxable ordinary yield (%/yr)', pct(inputs.taxableOrdinaryYield ?? 0)],
    ['Qualified dividend yield (%/yr)', pct(inputs.taxableQualifiedDividendYield ?? 0)],
    ['Realized LTCG yield (%/yr)', pct(inputs.taxableRealizedGainYield ?? 0)],
    ['HSA return (%/yr)', pct(inputs.hsaReturn)],
    ['Inflation rate (%/yr)', pct(inputs.inf)],
    [],
    ['── Tax ──', ''],
    ['Include IRMAA surcharges', inputs.includeIRMAA],
    ['Include Medicare base premiums', inputs.includeMedicarePremiums],
    ['Include ACA premiums/credits', inputs.includeAcaPremiumCredits],
    ['ACA monthly premium ($)', inputs.acaMonthlyPremium],
    ['ACA monthly credit ($)', inputs.acaMonthlyCredit],
    ['Include state tax', inputs.includeStateTax],
    ['State tax preset', inputs.stateTaxPreset ?? 'CUSTOM'],
    ['State tax preset confidence', stateTaxPreset?.confidence ?? 'custom'],
    ['State tax preset rates pulled', stateTaxPreset?.ratesAsOf ?? ''],
    ['State tax preset source', stateTaxPreset?.sourceUrl ?? ''],
    ['State tax rate (%)', pct(inputs.stateTaxRate)],
    ['Additional local tax rate (%)', pct(inputs.stateLocalTaxRate ?? 0)],
    ['State tax brackets JSON', inputs.stateTaxBrackets ?? ''],
    ['Annual QCD ($)', inputs.qcdAnnual],
    ['QCD start age', inputs.qcdStartAge],
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

function accountsSheet(inputs: InputParams): XLSX.WorkSheet {
  const header = [
    'Name',
    'Type',
    'Owner',
    'Balance ($)',
    'Cost Basis ($)',
    'Annual Contribution ($)',
    'Growth Rate (%)',
    'Monthly Income ($)',
    'Income Start Age',
    'Income End Age',
    'Survivor Benefit',
    'Survivor Percent (%)',
    'Survivor Monthly ($)',
    'COLA',
    'COLA Rate (%)',
  ];
  const data = (inputs.accounts ?? []).map(account => [
    account.name,
    account.type,
    account.owner ?? 'primary',
    dollar(account.balance),
    account.costBasis !== undefined ? dollar(account.costBasis) : '',
    account.annualContrib !== undefined ? dollar(account.annualContrib) : '',
    account.growthRate !== undefined ? pct(account.growthRate) : '',
    account.monthlyIncome !== undefined ? dollar(account.monthlyIncome) : '',
    account.incomeStartAge ?? '',
    account.incomeEndAge ?? '',
    account.survivorBenefitType ?? '',
    account.survivorPercent !== undefined ? pct(account.survivorPercent) : '',
    account.survivorMonthlyIncome !== undefined ? dollar(account.survivorMonthlyIncome) : '',
    account.inflationAdjusted ?? '',
    account.inflationRate !== undefined ? pct(account.inflationRate) : '',
  ]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(h.length, 12) + 2 }));
  return ws;
}

function incomeSheet(rows: ProjectionRow[], inputs: InputParams): XLSX.WorkSheet {
  const header = [
    'Age',
    'Salary ($)',
    'SS – You ($)',
    'SS – Spouse ($)',
    'Pension ($)',
    'RMD ($)',
    'Roth Conversion ($)',
    'Trad Withdrawal ($)',
    'Roth Withdrawal ($)',
    'Taxable Withdrawal ($)',
    'HSA Withdrawal ($)',
    'Total Income ($)',
    'Spending ($)',
    'Taxes ($)',
    'Net ($)',
    'Net Spendable ($)',
  ];
  const data = rows.map(r => {
    const salary = activeSalaryAt(inputs, r.age);
    const totalIn = salary + r.ss + r.spouseSs + r.pension + r.rmd + r.conv + r.tradW + r.rothW + r.taxableW + r.hsaW;
    const net = totalIn - r.totalSpending - r.totalTax;
    const netSpendable = totalIn - r.conv - r.totalSpending - (r.totalTax - r.convTax);
    return [
      r.age,
      dollar(salary),
      dollar(r.ss),
      dollar(r.spouseSs),
      dollar(r.pension),
      dollar(r.rmd),
      dollar(r.conv),
      dollar(r.tradW),
      dollar(r.rothW),
      dollar(r.taxableW),
      dollar(r.hsaW),
      dollar(totalIn),
      dollar(r.totalSpending),
      dollar(r.totalTax),
      dollar(net),
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
    'QCD ($)',
    'Roth Conversion ($)',
    'Marginal Rate (%)',
    'Conv Tax ($)',
  ];
  const data = rows.map(r => [
    r.age,
    dollar(r.trad),
    dollar(r.rmd),
    dollar(r.qcd),
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

export function exportToSpreadsheet(inputs: InputParams, allRows: ProjectionRow[]): void {
  const dataRows = allRows.slice(1); // skip y=0 initial state, match UI behaviour
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, inputsSheet(inputs), 'Inputs');
  if ((inputs.accounts?.length ?? 0) > 0) XLSX.utils.book_append_sheet(wb, accountsSheet(inputs), 'Accounts');
  XLSX.utils.book_append_sheet(wb, balancesSheet(allRows), 'Balances'); // keep initial state for balances
  XLSX.utils.book_append_sheet(wb, incomeSheet(dataRows, inputs), 'Income');
  XLSX.utils.book_append_sheet(wb, rmdsSheet(dataRows), 'RMDs & Conversions');
  XLSX.utils.book_append_sheet(wb, taxSheet(dataRows), 'Tax');
  XLSX.utils.book_append_sheet(wb, spendingSheet(dataRows), 'Spending');
  XLSX.writeFile(wb, 'retirement-plan.xlsx');
}
