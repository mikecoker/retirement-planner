# Retirement Planner

**Live:** https://mikecoker.github.io/retirement-planner/

A client-side retirement planning tool built with React and TypeScript. All calculations run in the browser — no data is sent to any server.

## Features

- **Multiple plans** — create, rename, duplicate, and switch between plans; each plan stores its own inputs, Roth conversion schedule, and optimizer state
- **Year-by-year projection** from current age through life expectancy, covering traditional, Roth, taxable brokerage, and HSA balances
- **Roth conversion optimizer** — explores a bracket × until-age strategy grid plus a greedy per-year optimizer; recommends the schedule that minimizes lifetime taxes, maximizes terminal portfolio, or smooths income
- **Social Security estimator** — enter SSA.gov estimates at 62/67/70; slider interpolates using the actual SSA piecewise reduction formula with COLA applied annually after claim age
- **Tax analysis** — 2026 federal brackets extrapolated forward by inflation, correct SS provisional income formula, IRMAA surcharges, 65+ standard deduction, optional flat or bracketed state tax
- **Monte Carlo simulation** — 1,000 full projection reruns with randomized return assumptions, showing success rate
- **Expense modeling** — basic monthly categories (base, healthcare, discretionary, LTC reserve) or advanced itemized expense editor with recurring, loan, and one-time entries
- **Account modeling** — basic balance/contribution fields or advanced account editor for granular investment accounts with custom returns and guaranteed income streams
- **Export** — JSON plan file or Excel spreadsheet with year-by-year projection data

## Sample Data

Importable sample plans live in [`sample-data`](sample-data/). They cover single and married scenarios, different Social Security options, basic and advanced account setups, baseline expenses, Roth conversions, QCDs, and reduced Social Security assumptions.

## Documentation

Detailed user documentation is drafted in [`docs/wiki`](docs/wiki/) so it can be reviewed in pull requests and then published to the GitHub Wiki.

- [`Home`](docs/wiki/Home.md) — wiki landing page and recommended first workflow
- [`User Guide`](docs/wiki/User-Guide.md) — detailed walkthrough of plans, setup, results, optimizer, Monte Carlo, import, and export
- [`Model Assumptions`](docs/wiki/Model-Assumptions.md) — tax, RMD, Social Security, return, and projection assumptions

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

To test from another device on the same Wi-Fi network, run:

```bash
npm run dev:lan
```

Open one of the printed `Network` URLs on the other device. Pass a different fixed port with `npm run dev:lan -- --port 5174`.

## Scripts

```bash
npm run dev      # start local-only dev server
npm run dev:lan  # start dev server and print same-network URLs for phone/tablet testing
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

- Tax brackets use 2026 values, extrapolated forward by the model's inflation rate
- RMDs follow SECURE 2.0 rules using prior year-end balance; optional QCDs and an estimated joint-life adjustment are supported
- Roth conversion taxes are modeled as paid from the taxable account
- IRMAA surcharges based on MAGI from 2 years prior (approximated from current-year income)

## Contributing

Issues and pull requests are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for bug report guidance, PR expectations, and calculation-change notes.

## Support

If this app is useful, you can support ongoing development through the repository's Sponsor button.

<a href="https://www.buymeacoffee.com/mikecoker">
  <img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=&slug=mikecoker&button_colour=FFDD00&font_colour=000000&font_family=Inter&outline_colour=000000&coffee_colour=ffffff" alt="Buy me a coffee" height="40">
</a>

## License

MIT License. See [`LICENSE`](LICENSE).

## Disclaimer

This project is an open-source planning tool. It is not financial, tax, legal, or investment advice. Validate important decisions with qualified professionals and official sources.
