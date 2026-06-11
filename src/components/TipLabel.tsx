import React, { useState, useRef, useCallback } from 'react';

const DEFINITIONS: Record<string, string> = {
  'Current age': 'Your age today. This sets the starting point for the year-by-year projection.',
  'Birth year': 'Used to determine your Social Security full retirement age and RMD starting age. Leave blank to infer it from current age.',
  'Retirement age': 'The age when you stop working and begin drawing from your retirement accounts. Also when contributions end.',
  'Life expectancy': 'The age the projection runs until for you. If a spouse is set with a longer remaining life expectancy, the projection extends to cover their lifetime too — those rows are marked "SPOUSE" in the tables.',
  'Filing status': 'Your IRS tax filing status. This determines your tax brackets, standard deduction, and Social Security taxation thresholds.',
  'Spouse age': 'Your spouse\'s current age, used to model spousal Social Security benefits and joint tax calculations.',
  'Spouse birth year': 'Used to determine your spouse\'s Social Security full retirement age. Leave blank to infer it from spouse age.',
  'Spouse life expectancy': 'Your spouse\'s expected age at death. The projection runs until the later of your two life expectancies to ensure the portfolio covers both lifetimes.',
  'Spouse SS ($/mo)': 'Manual fallback for your spouse\'s estimated monthly Social Security benefit at their claim age. If spouse SSA estimates at 62/67/70 are entered, those estimates are used instead.',
  'Spouse SS claim age': 'The age when your spouse starts collecting Social Security. Same rules as yours: 62 reduces benefits, 70 maximizes them.',
  'Traditional ($)': 'Balance in traditional tax-deferred accounts (401k, 403b, traditional IRA). Withdrawals are taxed as ordinary income.',
  'Roth ($)': 'Balance in Roth accounts (Roth IRA, Roth 401k). Withdrawals are tax-free if account is at least 5 years old and you\'re 59.5+.',
  'Roth basis ($)': 'Amount of the Roth balance treated as already-taxed contributions/conversion principal. Before age 60, withdrawals above basis are modeled as taxable earnings with a 10% penalty.',
  'Taxable ($)': 'Balance in taxable brokerage accounts. Investment gains are taxed as capital gains (short-term at ordinary rates, long-term at preferential rates).',
  'HSA ($)': 'Balance in a Health Savings Account. Withdrawals for qualified medical expenses are tax-free. After 65, non-medical withdrawals are taxed like a traditional IRA (no penalty).',
  'Monthly contributions': 'Amount you contribute each month to traditional and Roth accounts during the accumulation phase (before retirement).',
  'Taxable contrib ($/mo)': 'Monthly contributions to your taxable brokerage account during the accumulation phase.',
  'HSA contrib ($/mo)': 'Monthly contributions to your HSA. The 2026 annual limit is modeled as $4,400 single or $8,750 family, with a $1,000 catch-up at age 55+.',
  'Claim age': 'The age when you start collecting Social Security. Claiming at 62 reduces benefits by ~30%; waiting until 70 increases them by ~24% vs. full retirement age.',
  'Monthly benefit at claim age ($)': 'Your estimated monthly Social Security benefit at your chosen claim age. Use your SSA.gov estimate for the most accurate number.',
  'Benefit paid (%)': 'Fraction of scheduled Social Security benefits to model as actually paid. Use 100% for current-law scheduled benefits or a lower value to stress-test future benefit reductions.',
  'SS COLA (%)': 'Cost of Living Adjustment — the annual increase applied to Social Security benefits. The historical average is ~2.5%, but it varies year to year (was 8.7% in 2023, 3.2% in 2024).',
  'Base monthly expenses ($)': 'Your core living expenses in retirement (housing, food, utilities, insurance, transportation) — before healthcare and discretionary.',
  'Healthcare ($/mo)': 'Estimated monthly healthcare costs in retirement (Medicare premiums, supplemental insurance, prescriptions, out-of-pocket). Medicare Part B baseline is $202.90/mo for 2026.',
  'Discretionary ($/mo)': 'Non-essential spending: travel, dining out, hobbies, gifts. This is the budget category most flexible if you need to cut costs.',
  'LTC reserve ($/mo, from age 80)': 'Long-Term Care reserve — monthly amount set aside starting at age 80 for potential nursing home, assisted living, or in-home care costs. National average: $9-10K/mo for a nursing home.',
  'Expense inflation (%)': 'The annual rate at which your base expenses grow. General inflation (~3%) is the baseline, but you may want a higher rate if your lifestyle costs more over time.',
  'Healthcare inflation (%)': 'The annual rate at which healthcare costs grow. Historically ~5-6%, well above general inflation. This affects Medicare premiums, drug costs, and long-term care.',
  'Max annual conversion ($)': 'The maximum amount you\'d convert from traditional to Roth each year. The actual conversion may be less — the engine stops at your target bracket ceiling to avoid higher tax rates.',
  'Convert until age': 'Stop doing Roth conversions at this age. Converting after RMDs begin is less impactful since RMDs already push income up. RMD start age depends on your birth year: 72 (born 1949–1950), 73 (born 1951–1959), or 75 (born 1960+).',
  'Target conversion bracket': 'The highest tax bracket you\'re willing to fill with Roth conversions. The engine converts up to the ceiling of this bracket, then stops. 12% is common for early retirees; 22% if you want aggressive conversion.',
  'Include IRMAA surcharges': 'IRMAA = Income-Related Monthly Adjustment Amount. High-income retirees pay extra for Medicare Part B and Part D. Based on your MAGI from 2 years prior. 2026 thresholds start at $109K single / $218K married.',
  'Include Medicare base premiums': 'Adds the standard Medicare Part B premium to healthcare spending for each modeled person age 65 or older. Leave off if your healthcare expense already includes Medicare premiums.',
  'Include ACA premiums/credits': 'Adds pre-Medicare marketplace health insurance premiums net of premium tax credits for modeled people under age 65.',
  'ACA premium ($/mo)': 'Gross monthly ACA marketplace premium per covered person before any premium tax credit.',
  'ACA credit ($/mo)': 'Monthly ACA premium tax credit per covered person. The model subtracts this from the gross premium.',
  'Include state tax': 'Add a flat state income tax rate to the federal tax calculation. State taxes vary widely (0% in FL/TX to ~13% in CA).',
  'State tax rate (%)': 'Your state\'s effective income tax rate. Use your state\'s top marginal rate or an effective rate based on your income. 0% for states with no income tax.',
  'State tax brackets JSON': 'Optional progressive state tax table as JSON: [[ceiling, rate], ...]. Use null as the final ceiling. If provided, this overrides the flat state tax rate.',
  'Annual QCD ($)': 'Qualified Charitable Distribution amount sent directly from a traditional IRA to charity each year. It can satisfy RMDs while excluding that amount from taxable income.',
  'QCD start age': 'Age to begin qualified charitable distributions. Current law allows QCDs beginning at age 70.5; this model uses whole ages.',
  'Use joint life RMD estimate': 'Estimates the larger RMD divisor allowed when your spouse is the sole beneficiary and more than 10 years younger. Uses an approximation, not the full IRS two-dimensional table.',
  'Annual return (%)': 'Expected nominal annual return on traditional and Roth accounts (typically stock-heavy). Historical S&P 500 average is ~10% nominal, ~7% real. Use 6-8% for conservative estimates.',
  'Taxable account return (%)': 'Expected nominal annual return on taxable brokerage accounts. May be lower if holding more bonds or cash. Long-term stock returns average ~10% nominal.',
  'Taxable ordinary yield (%)': 'Annual taxable-account yield taxed as ordinary income, such as interest and nonqualified dividends.',
  'Qualified dividend yield (%)': 'Annual taxable-account qualified dividend yield, taxed at long-term capital gains rates federally.',
  'Realized LTCG yield (%)': 'Annual taxable-account long-term gain realization rate. Unrealized appreciation remains deferred until withdrawals.',
  'Inflation (%)': 'General inflation rate used to inflate Social Security (via COLA) and expenses. Historical CPI average is ~3%. Use 2.5-3.5% for typical scenarios.',
  'Annual salary / wages': 'Gross W-2 wages during working years. Used to compute your current tax bracket, headroom for Roth conversions before retirement, and employer match calculations.',
};

interface TipLabelProps {
  text: string;
}

const TipLabel: React.FC<TipLabelProps> = ({ text }) => {
  const tip = DEFINITIONS[text];
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLSpanElement>(null);

  const handleEnter = useCallback(() => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPos({
        top: rect.top,
        left: rect.right + 10,
      });
    }
    setShow(true);
  }, []);

  const handleLeave = useCallback(() => {
    setShow(false);
  }, []);

  if (!tip) return <label>{text}</label>;

  return (
    <label className="tip-label">
      {text}
      <span
        ref={iconRef}
        className="tip-icon"
        tabIndex={0}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
      >
        ⓘ
      </span>
      {show && (
        <span
          className="tip-text"
          style={{ top: pos.top, left: pos.left }}
        >
          {tip}
        </span>
      )}
    </label>
  );
};

export default TipLabel;
export { DEFINITIONS };
