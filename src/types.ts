// Types for the retirement planner
export interface InputParams {
  // Personal
  age: number;
  birthYear?: number;
  retireAge: number;
  lifeExp: number;
  filingStatus: 'single' | 'married';
  spouseAge?: number;
  spouseBirthYear?: number;
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
  rothBasis?: number;
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
  ssBenefitFactor?: number; // fraction of scheduled Social Security benefits paid, 0-1

  // Spending
  expenses: number;
  healthcareExpenses: number;
  ltcExpenses: number; // long-term care
  discretionaryExpenses: number;
  expenseInflationRate: number; // separate from general inflation
  healthcareInflationRate: number;
  spendingSmileEnabled?: boolean;
  earlyRetirementSpendingChange?: number; // decimal adjustment to base/discretionary spending before lateRetirementAge
  lateRetirementSpendingChange?: number;  // decimal adjustment to base/discretionary spending from lateRetirementAge onward
  lateRetirementAge?: number;

  // Income during working years
  salary?: number; // annual gross wages — used to compute bracket headroom for pre-retirement conversions

  // Roth conversions
  rothConv: number;
  convStart: number;
  convUntil: number;
  targetConvBracket: 0 | 1 | 2 | 3; // 0=10%, 1=12%, 2=22%, 3=24%
  qcdAnnual: number;
  qcdStartAge: number;
  useJointLifeRmd: boolean;

  // Returns (nominal)
  r: number; // traditional/roth return
  taxableReturn: number;
  taxableOrdinaryYield: number;
  taxableQualifiedDividendYield: number;
  taxableRealizedGainYield: number;
  hsaReturn: number;

  // Inflation
  inf: number;

  // Tax
  stateTaxPreset?: string;
  stateTaxRate: number;
  stateLocalTaxRate?: number;
  stateTaxBrackets?: string; // JSON string

  // Assumptions
  includeIRMAA: boolean;
  includeMedicarePremiums: boolean;
  includeAcaPremiumCredits: boolean;
  acaMonthlyPremium: number;
  acaMonthlyCredit: number;
  includeStateTax: boolean;
  ssCOLA: number; // Social Security cost of living adjustment

  // Detailed expense items (optional; if present, replaces sidebar spending fields in projection)
  expenseItems?: ExpenseItem[];

  // Detailed accounts (optional; if present, overrides sidebar balance/contribution fields)
  accounts?: Account[];
}

export type AccountType = 'traditional' | 'roth' | 'taxable' | 'hsa' | 'annuity' | 'pension' | 'bond_tips';
export type AccountOwner = 'primary' | 'spouse' | 'joint';
export type SurvivorBenefitType = 'none' | 'percent' | 'fixed';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  owner?: AccountOwner;      // default: primary
  balance: number;
  costBasis?: number;        // taxable accounts only
  annualContrib?: number;    // pre-retirement annual contribution
  growthRate?: number;       // nominal annual growth rate; defaults by account type
  employerMatch?: number;    // decimal e.g. 0.04 = 4% match rate
  matchLimit?: number;       // % of salary ceiling e.g. 6 = 6% of salary
  // Guaranteed income fields (annuity, pension, bond_tips)
  monthlyIncome?: number;    // in today's dollars at incomeStartAge
  incomeStartAge?: number;   // default: params.retireAge
  incomeEndAge?: number;     // default: params.lifeExp (undefined = for life)
  survivorBenefitType?: SurvivorBenefitType; // pension/annuity survivor income after owner dies
  survivorPercent?: number;  // decimal e.g. 0.5 = 50% survivor benefit
  survivorMonthlyIncome?: number; // fixed monthly survivor benefit in today's dollars
  inflationAdjusted?: boolean;
  inflationRate?: number;    // default: params.inf
}

export type ExpenseCategory = 'housing' | 'transport' | 'food' | 'healthcare' | 'insurance' | 'loan' | 'discretionary' | 'other';
export type ExpenseInflationType = 'general' | 'healthcare' | 'fixed' | 'cpi';

export interface ExpenseItem {
  id: string;
  name: string;
  category: ExpenseCategory;
  monthly: number;           // in today's dollars
  inflationType: ExpenseInflationType;
  startAge?: number;         // default = params.age
  endAge?: number;           // default = params.lifeExp; auto-computed for loans
  isLoan?: boolean;
  loanBalance?: number;      // remaining principal
  loanRate?: number;         // annual e.g. 0.065
  isOneTime?: boolean;
  atAge?: number;
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
  qcd: number;
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

export interface ScenarioYear {
  age: number;
  portfolioReturn?: number;
  taxableReturn?: number;
  hsaReturn?: number;
  inflation?: number;
  expenseInflation?: number;
  healthcareInflation?: number;
  ssCOLA?: number;
  spendingShock?: number;
}

export interface ProjectionOptions {
  returnRate?: number;
  conversionSchedule?: Record<number, number>;
  scenarioPath?: ScenarioYear[];
}

export type PlannerPage =
  | 'about'
  | 'social'
  | 'conversions'
  | 'accounts'
  | 'expenses'
  | 'balance'
  | 'income'
  | 'rmd'
  | 'tax'
  | 'cashflow'
  | 'optimizer'
  | 'mc';

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
