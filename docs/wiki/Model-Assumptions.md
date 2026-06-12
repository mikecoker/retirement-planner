# Model Assumptions

This page documents the major assumptions in Retirement Planner. It should be updated whenever calculation logic changes.

## General Projection

The app projects year by year from the current age through the modeled household horizon. The household horizon is normally the primary user's life expectancy. For married scenarios, spouse-only survivor years may extend the projection if the spouse's remaining life expectancy is longer.

The model is deterministic unless Monte Carlo is used. Deterministic results use the configured return and inflation assumptions.

## Inflation

Inflation affects future spending, tax bracket extrapolation, and some modeled values. A single long-term inflation assumption cannot represent every real-world category. Healthcare, housing, insurance, and taxes may inflate differently.

## Account Types

The model tracks:

- Traditional retirement accounts.
- Roth accounts.
- Taxable brokerage.
- HSA.

Traditional withdrawals and Roth conversions are generally taxable as ordinary income. Roth withdrawals are modeled as tax-free. Taxable accounts can generate ordinary yield, qualified dividends, and long-term capital gains depending on settings.

Advanced account entries can be assigned to you, your spouse, or jointly. Investment balances are still modeled as household assets for withdrawal purposes. Guaranteed income sources use ownership directly: start and end ages are interpreted as the owner's age, owner-specific income stops when that owner dies, and survivor pension/annuity benefits continue only when a survivor benefit is configured.

## Withdrawal Order

The projection draws from accounts according to the app's internal withdrawal logic. Review `src/financial.ts` for exact implementation. Important outputs to inspect are taxable depletion, traditional withdrawals, Roth withdrawals, and HSA withdrawals.

## Roth Conversions

Roth conversions are modeled as taxable income in the year of conversion. Conversion tax is modeled as paid from the taxable account. If the taxable account cannot cover taxes and spending, the app can show additional traditional withdrawals, which may increase taxable income.

The optimizer searches strategies; it does not prove a globally perfect plan for every possible real-world tax rule or future law change.

## Required Minimum Distributions

RMDs follow the app's implementation of SECURE 2.0 style age rules and use prior year-end balances. Qualified charitable distributions are supported. A joint-life RMD estimate can be enabled, but it is an approximation and not a full replacement for IRS tables.

## Social Security

The app estimates Social Security based on entered claiming-age estimates and claiming age. It also models taxable Social Security using provisional income concepts.

Social Security law and benefit estimates can change. Use SSA.gov estimates where possible.

## Federal Taxes

Federal tax brackets use 2026 values and are extrapolated forward by the model's inflation assumption. The model includes standard deduction behavior, 65+ additional standard deduction, Social Security taxation, preferential income tax treatment where modeled, and IRMAA estimates.

This is not a full tax filing engine. It does not replace tax software or professional tax advice.

## State Taxes

The app supports state tax settings, including flat and bracketed approaches depending on user input. State tax treatment varies widely and can include exclusions, credits, deductions, local taxes, retirement income rules, and filing-status rules not represented in full.

## IRMAA

IRMAA surcharges are estimated based on income from two years prior. Real IRMAA determinations depend on Medicare rules, MAGI, appeal rights, and life-changing events.

## Investment Returns

Deterministic projections use configured return assumptions. Monte Carlo varies returns based on selected method and options.

Returns are not forecasts. Sequence risk can matter more than average return, especially near retirement.

## Monte Carlo

Monte Carlo reruns the full projection under varied returns and reports success rate. It is a stress-testing tool, not a guarantee. The output depends on method, run count, seed, allocation assumptions, and return history or distribution parameters.

## Known Limitations

- Future law changes are not modeled.
- Tax calculations are approximations.
- Healthcare and long-term care costs are simplified unless manually itemized.
- Estate, inheritance, and beneficiary tax treatment are not modeled in detail.
- Roth five-year rules and early withdrawal edge cases may not cover every personal situation.
- State-specific tax complexity is simplified.
- Investment fees, asset location, and rebalancing details are simplified.

## Best Use

Use the app to compare scenarios and understand sensitivity. Use professionals and official sources before acting on tax, investment, or retirement claiming decisions.
