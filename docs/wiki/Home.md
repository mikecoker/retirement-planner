# Retirement Planner Wiki

Retirement Planner is a browser-based planning tool for exploring retirement balances, income, taxes, required minimum distributions, Roth conversions, cash flow, and Monte Carlo outcomes. It is designed for personal scenario planning and transparency: the app runs locally in the browser, and plan data is stored locally unless you choose to export it.

This wiki explains how to use the app, what the major results mean, and what assumptions are built into the model.

## Quick Links

- [User Guide](User-Guide)
- [Model Assumptions](Model-Assumptions)
- [Screenshots to Capture](Screenshots-To-Capture)
- [Publishing This Wiki](Publishing-The-Wiki)

## What the App Is For

Use Retirement Planner to answer questions like:

- How long might my portfolio last under a given spending plan?
- How do traditional IRA, Roth IRA, taxable, and HSA balances change over time?
- When do RMDs begin, and how large might they become?
- What happens if I run Roth conversions before RMD age?
- How much tax might I pay over the full projection?
- Does a Roth conversion strategy reduce lifetime tax or improve terminal portfolio value?
- How sensitive is my plan to market returns?

The app is most useful as a comparison tool. A single projection should not be treated as a prediction. Change one assumption at a time, save or duplicate plans, and compare outcomes.

## Privacy Model

The app is client-side. Calculations run in the browser. Your plan data is stored in browser local storage and can be exported as JSON or Excel when you choose. There is no server-side account system and no backend database.

Because local browser storage can be cleared by browser settings, privacy tools, or device cleanup, export important plans regularly.

## Suggested First Workflow

1. Create or rename a plan.
2. Fill in About You: age, retirement age, life expectancy, filing status, inflation, and tax settings.
3. Enter Social Security estimates from SSA.gov.
4. Enter account balances and return assumptions.
5. Enter spending assumptions.
6. Review Balances, Income, RMDs & Conversions, Tax Analysis, and Cash Flow.
7. Run the Roth Optimizer if Roth conversions are relevant.
8. Run Monte Carlo to test sensitivity to return assumptions.
9. Export JSON as a backup and Excel if you want to inspect the projection outside the app.

## Important Disclaimer

Retirement Planner is an open-source educational planning model, not professional financial, tax, legal, or investment advice. Tax law, market behavior, Social Security rules, healthcare costs, and personal circumstances can change. Validate important decisions with qualified professionals.
