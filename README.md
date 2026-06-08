# Retirement Planner

**Live:** https://mikecoker.github.io/retirement-planner/

A client-side retirement planning tool built with React and TypeScript. All calculations run in the browser — no data is sent to any server.

## Features

- **Multiple plans** — create, rename, duplicate, and switch between plans; each plan stores its own inputs, Roth conversion schedule, and optimizer state
- **Year-by-year projection** from current age through life expectancy, covering traditional, Roth, taxable brokerage, and HSA balances
- **Roth conversion optimizer** — explores a bracket × until-age strategy grid plus a greedy per-year optimizer; recommends the schedule that minimizes lifetime taxes, maximizes terminal portfolio, or smooths income
- **Social Security estimator** — enter SSA.gov estimates at 62/67/70; slider interpolates using the actual SSA piecewise reduction formula with COLA applied annually after claim age
- **Tax analysis** — 2025 federal brackets extrapolated forward by inflation, correct SS provisional income formula, IRMAA surcharges, 65+ standard deduction, optional state tax
- **Monte Carlo simulation** — 1,000 scenarios with randomized returns, showing success rate
- **Expense modeling** — basic monthly categories (base, healthcare, discretionary, LTC reserve) or advanced itemized expense editor with recurring, loan, and one-time entries
- **Account modeling** — basic balance/contribution fields or advanced account editor for granular investment accounts with custom returns and guaranteed income streams
- **Export** — JSON plan file or Excel spreadsheet with year-by-year projection data

### Tabs

| Tab | Category | Description |
|-----|----------|-------------|
| Accounts | Setup | Balances, contributions, salary, return assumptions |
| Expenses | Setup | Spending categories and itemized expense editor |
| Balances | Results | Portfolio balance by account type over time |
| Income | Results | Income sources: SS, withdrawals, conversions |
| RMDs & Conversions | Results | Required minimum distributions and Roth conversion amounts |
| Tax Analysis | Results | Marginal/effective tax rates and dollar amounts |
| Cash Flow | Results | Net cash flow year by year |
| Roth Optimizer | Tool | Strategy comparison and recommended conversion schedule |
| Monte Carlo | Tool | Success rate simulation |

## Stack

- React 19 + TypeScript
- Vite
- Chart.js + react-chartjs-2
- Vitest (tests)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Scripts

```bash
npm run dev      # start dev server
npm run build    # type-check + Vite bundle → dist/
npm run preview  # serve the dist/ build locally
npm test         # run unit tests
```

## Deployment

Pushing to `main` automatically deploys to GitHub Pages via `.github/workflows/deploy.yml`. The workflow builds with `VITE_BASE_PATH=/retirement-planner/` and deploys `dist/` using the GitHub Pages API.

To enable on a new repo: **Settings → Pages → Source → GitHub Actions**.

## Project Structure

```
src/
  financial.ts          Core projection engine, tax calculations, SS interpolation
  optimizer.ts          Roth conversion strategy optimizer
  exportSpreadsheet.ts  Excel export
  types.ts              InputParams, ProjectionRow, Account, ExpenseItem interfaces
  App.tsx               Multi-plan state, localStorage persistence, file import/export
  components/
    Sidebar.tsx         Personal info, Social Security, filing status
    Main.tsx            Tab bar, charts, and detail tables
    AccountsTab.tsx     Account balances, contributions, return assumptions (Basic/Advanced)
    ExpenseTab.tsx      Spending categories and itemized expenses (Basic/Advanced)
    TipLabel.tsx        Inline tooltip component
  __tests__/
    financial.test.ts   Projection engine unit tests
    optimizer.test.ts   Optimizer unit tests
```

## Key Assumptions

- Tax brackets use 2025 values, extrapolated forward by the model's inflation rate
- RMDs follow SECURE 2.0 rules (start at age 73, IRS Uniform Lifetime Table)
- Roth conversion taxes are modeled as paid from the taxable account
- IRMAA surcharges based on MAGI from 2 years prior (approximated from current-year income)
