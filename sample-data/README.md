# Sample Import Files

These JSON files can be imported through the app's **Import** button. They are synthetic examples intended to show how different parts of the planner behave. They are not recommendations.

## Files

- `single-basic-early-retirement.json`  
  Single filer with basic account balances, SSA estimates, reduced Social Security payout assumption, basic expenses, and manual Roth conversion settings.

- `single-near-retirement-hsa-taxable.json`  
  Single filer close to retirement with larger taxable/HSA balances, conservative returns, QCDs, and no Roth conversions.

- `married-combined-spouse-advanced-accounts.json`  
  Married household with advanced account entries, spouse combined Social Security option, pension income, and an optimizer-style conversion schedule.

- `married-spousal-benefit-basic.json`  
  Married household using the spousal-only Social Security option, basic account balances, and basic expenses.

- `married-spousal-top-up-example.json`  
  Married household using the combined Social Security option where the spouse starts with their own benefit at 62 and receives an excess spousal top-up after the primary files at 67. COLA is set to 0% so the top-up behavior is easy to inspect.

- `married-manual-spouse-benefit.json`  
  Married household using the spouse manual monthly benefit fallback instead of spouse SSA 62/67/70 estimates.

## How to Use

1. Open the app.
2. Click **Import**.
3. Select one of these JSON files.
4. Review the setup tabs first, then results.

The app names imported plans from the filename, so imported samples will appear with readable plan names in the plan selector.
