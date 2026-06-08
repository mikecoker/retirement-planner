import React, { useState, useRef, useCallback } from 'react';

const DEFINITIONS: Record<string, string> = {
  'Current age': 'Your age today. This sets the starting point for the year-by-year projection.',
  'Retirement age': 'The age when you stop working and begin drawing from your retirement accounts. Also when contributions end.',
  'Life expectancy': 'The age the projection runs until. If your portfolio reaches zero before this age, you have a funding gap.',
  'Filing status': 'Your IRS tax filing status. This determines your tax brackets, standard deduction, and Social Security taxation thresholds.',
  'Spouse age': 'Your spouse\'s current age, used to model spousal Social Security benefits and joint tax calculations.',
  'Spouse life expectancy': 'Your spouse\'s expected age at death. The projection runs until the later of your two life expectancies to ensure the portfolio covers both lifetimes.',
  'Spouse SS ($/mo)': 'Your spouse\'s estimated monthly Social Security benefit at their claim age.',
  'Spouse SS claim age': 'The age when your spouse starts collecting Social Security. Same rules as yours: 62 reduces benefits, 70 maximizes them.',
  'Traditional ($)': 'Balance in traditional tax-deferred accounts (401k, 403b, traditional IRA). Withdrawals are taxed as ordinary income.',
  'Roth ($)': 'Balance in Roth accounts (Roth IRA, Roth 401k). Withdrawals are tax-free if account is at least 5 years old and you\'re 59.5+.',
  'Taxable ($)': 'Balance in taxable brokerage accounts. Investment gains are taxed as capital gains (short-term at ordinary rates, long-term at preferential rates).',
  'HSA ($)': 'Balance in a Health Savings Account. Withdrawals for qualified medical expenses are tax-free. After 65, non-medical withdrawals are taxed like a traditional IRA (no penalty).',
  'Monthly contributions': 'Amount you contribute each month to traditional and Roth accounts during the accumulation phase (before retirement).',
  'Taxable contrib ($/mo)': 'Monthly contributions to your taxable brokerage account during the accumulation phase.',
  'HSA contrib ($/mo)': 'Monthly contributions to your HSA. The 2024 annual limit is $4,150 (single) or $8,300 (family), with a $1,000 catch-up at age 55+.',
  'Claim age': 'The age when you start collecting Social Security. Claiming at 62 reduces benefits by ~30%; waiting until 70 increases them by ~24% vs. full retirement age.',
  'Monthly benefit at claim age ($)': 'Your estimated monthly Social Security benefit at your chosen claim age. Use your SSA.gov estimate for the most accurate number.',
  'SS COLA (%)': 'Cost of Living Adjustment — the annual increase applied to Social Security benefits. The historical average is ~2.5%, but it varies year to year (was 8.7% in 2023, 3.2% in 2024).',
  'Base monthly expenses ($)': 'Your core living expenses in retirement (housing, food, utilities, insurance, transportation) — before healthcare and discretionary.',
  'Healthcare ($/mo)': 'Estimated monthly healthcare costs in retirement (Medicare premiums, supplemental insurance, prescriptions, out-of-pocket). Medicare Part B baseline is ~$174/mo.',
  'Discretionary ($/mo)': 'Non-essential spending: travel, dining out, hobbies, gifts. This is the budget category most flexible if you need to cut costs.',
  'LTC reserve ($/mo, from age 80)': 'Long-Term Care reserve — monthly amount set aside starting at age 80 for potential nursing home, assisted living, or in-home care costs. National average: $9-10K/mo for a nursing home.',
  'Expense inflation (%)': 'The annual rate at which your base expenses grow. General inflation (~3%) is the baseline, but you may want a higher rate if your lifestyle costs more over time.',
  'Healthcare inflation (%)': 'The annual rate at which healthcare costs grow. Historically ~5-6%, well above general inflation. This affects Medicare premiums, drug costs, and long-term care.',
  'Max annual conversion ($)': 'The maximum amount you\'d convert from traditional to Roth each year. The actual conversion may be less — the engine stops at your target bracket ceiling to avoid higher tax rates.',
  'Convert until age': 'Stop doing Roth conversions at this age. Converting after RMDs start (age 73) is less impactful since RMDs already push income up.',
  'Target conversion bracket': 'The highest tax bracket you\'re willing to fill with Roth conversions. The engine converts up to the ceiling of this bracket, then stops. 12% is common for early retirees; 22% if you want aggressive conversion.',
  'Include IRMAA surcharges': 'IRMAA = Income-Related Monthly Adjustment Amount. High-income retirees pay extra for Medicare Part B and Part D. Based on your MAGI from 2 years prior. Thresholds: $103K single / $206K married.',
  'Include state tax': 'Add a flat state income tax rate to the federal tax calculation. State taxes vary widely (0% in FL/TX to ~13% in CA).',
  'State tax rate (%)': 'Your state\'s effective income tax rate. Use your state\'s top marginal rate or an effective rate based on your income. 0% for states with no income tax.',
  'Annual return (%)': 'Expected nominal annual return on traditional and Roth accounts (typically stock-heavy). Historical S&P 500 average is ~10% nominal, ~7% real. Use 6-8% for conservative estimates.',
  'Taxable account return (%)': 'Expected nominal annual return on taxable brokerage accounts. May be lower if holding more bonds or cash. Long-term stock returns average ~10% nominal.',
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
