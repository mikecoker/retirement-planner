# Retirement Planner

**Live:** https://mikecoker.github.io/retirement-planner/

A client-side retirement planning tool built with React and TypeScript. All calculations run in the browser — no data is sent to any server.

## Features

- **Year-by-year projection** from current age through life expectancy, covering traditional IRA, Roth IRA, taxable account, and HSA balances
- **Roth conversion optimizer** — explores bracket × until-age strategy grid plus a greedy per-year optimizer to minimize lifetime taxes
- **Social Security estimator** — enter SSA.gov estimates at 62/67/70, slider interpolates using the actual SSA piecewise reduction formula, with break-even analysis vs claiming at FRA
- **Tax analysis** — 2025 federal brackets extrapolated forward by inflation each year, correct SS provisional income formula, IRMAA surcharges, 65+ standard deduction per eligible spouse
- **Monte Carlo simulation** — 500 scenarios with randomized returns, showing success rate and portfolio value percentiles at key ages
- **Tabs**: Balances, Income, RMDs & Conversions, Tax Analysis, Cash Flow, Optimizer, Monte Carlo — each with a year-by-year detail table

## Stack

- React 19 + TypeScript
- Vite
- Chart.js + react-chartjs-2

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build    # type-check + Vite bundle → dist/
npm run preview  # serve the dist/ build locally
```

## Deployment

Pushing to `main` automatically deploys to GitHub Pages via the workflow in `.github/workflows/deploy.yml`. The workflow builds with `VITE_BASE_PATH=/retirement-planner/` and deploys the `dist/` output using the GitHub Pages API.

To enable GitHub Pages on a new repo: **Settings → Pages → Source → GitHub Actions**.

## Project Structure

```
src/
  financial.ts     Core projection engine, tax calculations, SS interpolation
  optimizer.ts     Roth conversion strategy optimizer
  types.ts         InputParams and ProjectionRow interfaces
  App.tsx          State management, localStorage persistence, URL sharing
  components/
    Sidebar.tsx    All user inputs
    Main.tsx       Charts and detail tables for each tab
    TipLabel.tsx   Tooltip label component
```

## Key Assumptions

- Tax brackets use 2025 values and are extrapolated forward using the model's inflation rate
- RMDs follow SECURE 2.0 rules (start at age 73, IRS Uniform Lifetime Table)
- Social Security COLA applies annually after the claim age
- Roth conversion taxes are modeled as paid from the taxable account
