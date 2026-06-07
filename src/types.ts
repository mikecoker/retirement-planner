// Types for the retirement planner
export interface InputParams {
  // Personal
  age: number;
  retireAge: number;
  lifeExp: number;
  filingStatus: 'single' | 'married';
  spouseAge?: number;
  spouseLifeExp?: number;
  spouseSsType?: 'own' | 'spousal' | 'combined';  // 'own' = own record only; 'spousal' = 50% of primary PIA; 'combined' = max(own, spousal)
  spouseSs?: number;     // monthly benefit (own record, at claim age)
  spouseSs62?: number;   // own record estimate at 62
  spouseSs67?: number;   // own record estimate at 67
  spouseSs70?: number;   // own record estimate at 70
  spouseSsAge?: number;

  // Accounts
  tradBal: number;
  rothBal: number;
  taxableBal: number;
  taxableBasis?: number;
  hsaBal: number;
  tradContrib: number;
  rothContrib: number;
  taxableContrib: number;
  hsaContrib: number;
  employerMatch: number;
  matchLimit: number; // % of salary

  // Social Security
  ss: number;
  ssAge: number;
  ss62?: number;   // monthly benefit if claimed at 62
  ss67?: number;   // monthly benefit if claimed at 67 (FRA)
  ss70?: number;   // monthly benefit if claimed at 70

  // Spending
  expenses: number;
  healthcareExpenses: number;
  ltcExpenses: number; // long-term care
  discretionaryExpenses: number;
  expenseInflationRate: number; // separate from general inflation
  healthcareInflationRate: number;

  // Roth conversions
  rothConv: number;
  convUntil: number;
  targetConvBracket: 0 | 1 | 2 | 3; // 0=10%, 1=12%, 2=22%, 3=24%

  // Returns (nominal)
  r: number; // traditional/roth return
  taxableReturn: number;
  hsaReturn: number;

  // Inflation
  inf: number;

  // Tax
  stateTaxRate: number;
  stateTaxBrackets?: string; // JSON string

  // Assumptions
  includeIRMAA: boolean;
  includeStateTax: boolean;
  ssCOLA: number; // Social Security cost of living adjustment
}

export interface ProjectionRow {
  age: number;
  // Balances
  trad: number;
  roth: number;
  taxable: number;
  hsa: number;
  total: number;
  // Income sources
  rmd: number;
  conv: number;
  tradW: number;      // traditional withdrawal for spending
  rothW: number;      // roth withdrawal for spending
  taxableW: number;   // taxable account withdrawal
  hsaW: number;       // HSA withdrawal
  ss: number;         // Social Security (primary)
  spouseSs: number;   // Social Security (spouse)
  pension: number;    // pension income
  // Tax breakdown
  ordinaryIncome: number;   // RMD + conversion + pension + taxable SS
  qualifiedDividends: number;
  ltcg: number;             // long-term capital gains
  ssTaxable: number;        // taxable portion of SS
  standardDeduction: number;
  taxableIncome: number;
  federalTax: number;
  stateTax: number;
  totalTax: number;
  convTax: number;          // incremental tax attributable to the Roth conversion this year
  marginalRate: number;
  effectiveRate: number;
  // IRMAA
  irmaaPartB: number;
  irmaaPartD: number;
  // Spending
  expenses: number;
  healthcareExpenses: number;
  ltcExpenses: number;
  discretionaryExpenses: number;
  totalSpending: number;
  // Metrics
  withdrawalRate: number;
  portfolioValue: number;
}

export interface TaxBreakdown {
  brackets: Array<{
    bracket: string;
    income: number;
    tax: number;
    rate: number;
  }>;
  ordinaryIncome: number;
  qualifiedDividends: number;
  ltcg: number;
  ssTaxable: number;
  standardDeduction: number;
  taxableIncome: number;
  federalTax: number;
  stateTax: number;
  totalTax: number;
  marginalRate: number;
  effectiveRate: number;
  irmaaPartB: number;
  irmaaPartD: number;
}

export interface ChartData {
  labels: number[];
  datasets: Array<{
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
    fill?: boolean;
    pointRadius?: number;
    tension?: number;
    borderWidth?: number;
    type?: 'line' | 'bar';
    stack?: string;
    order?: number;
  }>;
}

export interface ChartOptions {
  responsive: boolean;
  maintainAspectRatio: boolean;
  animation: boolean;
  plugins: {
    legend: { display: boolean };
    tooltip: { callbacks: { label: (context: any) => string } };
  };
  scales: {
    x: {
      stacked?: boolean;
      ticks: { maxTicksLimit: number; font: { size: number } };
      grid: { display: boolean };
    };
    y: {
      stacked?: boolean;
      ticks: { callback: (value: number) => string; font: { size: number }; maxTicksLimit: number };
      grid: { color: string };
    };
  };
}