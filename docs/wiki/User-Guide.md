# User Guide

This guide walks through the major workflows in Retirement Planner.

## Plans

The plan selector in the sidebar lets you switch between scenarios. Each plan stores its own inputs, Roth conversion settings, optimizer state, and results.

Typical use:

- Keep one plan as your baseline.
- Duplicate it before testing a major change.
- Rename plans after the question they answer, such as `Retire at 60`, `Work to 65`, or `Aggressive Roth conversions`.
- Export JSON after major edits so you have a portable backup.

## Import and Export

Use Import to load a previously exported JSON plan file.

Use Export for:

- JSON: best for backing up and restoring app state.
- Excel: best for auditing year-by-year outputs or sharing a static scenario.

The JSON export is the app-native backup format. The Excel export is a reporting format.

## Setup: About You

Use About You to enter the projection frame:

- Current age.
- Retirement age.
- Life expectancy.
- Filing status.
- Inflation rate.
- Federal and state tax settings.
- Spouse details when applicable.

Life expectancy controls how long the projection runs. If spouse information extends the household horizon beyond the primary user's life expectancy, the projection includes spouse-only survivor years.

## Setup: Social Security

Enter your Social Security estimates from SSA.gov when possible. The app supports estimates at common claiming ages and interpolates benefits when you change the claiming age.

The Social Security section matters because it affects:

- Annual income.
- Taxable Social Security.
- Provisional income.
- Cash flow needs.
- RMD and Roth conversion interactions.

For married scenarios, enter spouse Social Security information separately so survivor-period projections remain meaningful.

## Setup: Roth Conversions

Roth conversions move money from traditional retirement accounts into Roth accounts. The model treats conversion amounts as taxable income in the year of conversion.

Use manual Roth conversion settings when you already know the schedule you want to test. Use Roth Optimizer when you want the app to search for candidate strategies.

Key concept: conversion taxes are modeled as paid from the taxable account. If the taxable account cannot cover the tax and spending need, the app flags years where additional traditional withdrawals are needed.

## Setup: Accounts

The Accounts tab supports both simple and advanced account modeling.

Basic mode is useful when you want a quick projection:

- Traditional retirement balance.
- Roth balance.
- Taxable brokerage balance.
- HSA balance.
- Contributions.
- Return assumptions.

Advanced mode is useful when you want more granular accounts, custom return assumptions, or guaranteed income streams. Investment accounts and guaranteed income sources can be marked as owned by you, your spouse, or jointly. Guaranteed income sources such as pensions can also define whether a survivor receives no benefit, a percentage benefit, or a fixed monthly benefit after the owner dies.

Use realistic return assumptions. Small changes in long-term returns can dominate results over multi-decade projections.

## Setup: Expenses

The Expenses tab supports basic spending categories and advanced itemized expenses.

Basic mode is useful for high-level planning:

- Base monthly spending.
- Healthcare.
- Discretionary spending.
- Long-term care reserve.

Advanced mode is useful for specific expense timing:

- Recurring expenses.
- Loan-style expenses.
- One-time expenses.
- Expenses with custom start and end ages.

When stress-testing a plan, duplicate the plan and increase expenses before changing investment assumptions. This makes it easier to isolate which assumption drove the result.

## Results: Balances

Balances shows portfolio values over time by account type:

- Traditional.
- Roth.
- Taxable.
- HSA.
- Total.

The year-by-year table can be expanded when you want exact values. It starts collapsed to keep the results page readable, and your open/closed setting is saved in the browser.

Watch for:

- When the taxable account is depleted.
- Whether Roth assets grow or are spent down.
- How much traditional balance remains near RMD age.
- Whether terminal value depends heavily on one account type.

## Results: Income

Income shows annual income sources compared with spending and taxes.

Income sources can include:

- Salary before retirement.
- Social Security.
- Pension or annuity income.
- RMDs.
- Roth conversions.
- Traditional IRA withdrawals.
- Roth IRA withdrawals.
- Taxable withdrawals.
- HSA withdrawals.

The `Net Spendable` column is usually more useful than simple net income because Roth conversions are transfers, not money available for spending.

## Results: RMDs & Conversions

RMDs & Conversions focuses on required minimum distributions, qualified charitable distributions, Roth conversions, and the remaining traditional balance.

Use this page to answer:

- When do RMDs begin?
- How large is the first RMD?
- What is the peak RMD?
- How much traditional balance remains after conversions?
- Are conversions happening before RMDs begin?
- How much tax is attributable to conversions?

The Conversion tax cost section is collapsible. Expand it when you want to audit each conversion year.

## Results: Tax Analysis

Tax Analysis shows marginal rates, effective rates, federal tax, state tax, IRMAA, and total tax over time.

Use it to identify:

- High marginal-rate years.
- Years where RMDs push income into a higher bracket.
- IRMAA exposure.
- Whether Roth conversions smooth taxes or create tax spikes.
- Lifetime tax differences between scenarios.

The year-by-year tax table starts collapsed and persists your preference.

## Results: Cash Flow

Cash Flow compares total income, spending, taxes, total outflow, withdrawal rate, and portfolio value.

Use it to identify:

- The first year the portfolio is depleted.
- Whether withdrawals are concentrated early or late.
- Whether spending is covered by guaranteed income.
- How withdrawal rates change over time.

Net cash flow near zero can be normal because the model draws what is needed to meet spending and tax needs.

## Tool: Roth Optimizer

The Roth Optimizer compares candidate conversion strategies and can recommend a schedule based on the selected goal.

Goals may include:

- Reducing lifetime taxes.
- Maximizing terminal portfolio value.
- Smoothing high future tax rates.
- Evaluating per-year opportunistic conversions.

Review optimizer output carefully. A strategy that minimizes lifetime taxes may not maximize terminal wealth, and a strategy that maximizes terminal wealth may require paying more tax earlier.

After applying an optimizer schedule, return to Results pages to inspect balances, taxes, RMDs, and cash flow.

## Tool: Monte Carlo

Monte Carlo runs many projection simulations with varied returns and reports success rate. Use it to test whether a plan is fragile under market variation.

Interpret success rate as a stress signal, not a guarantee. A high success rate does not remove sequence-of-returns risk, tax-law risk, healthcare risk, or behavioral risk.

## Reading Collapsible Tables

Several result pages have collapsible year-by-year tables. These tables start collapsed by default and remember your preference per table in browser local storage.

Use collapsed mode for scanning charts and summaries. Expand tables when you need to audit exact annual values or export-like detail.

## Good Scenario Practice

- Change one assumption at a time.
- Duplicate plans before major edits.
- Name plans after the scenario question.
- Export JSON before experimenting heavily.
- Compare lifetime tax, terminal value, depletion age, and Monte Carlo success together.
- Do not optimize only one metric unless that metric really is the decision goal.
