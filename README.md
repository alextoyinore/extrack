# Extrack

Extrack is a responsive income planner and wealth tracker for personal cash flow, investments, and forex journaling.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite client and the Express SQLite API together. The app is available at `http://127.0.0.1:5173` and the API runs at `http://localhost:8787`.

The current persistence layer uses SQLite through `sql.js`, with the database file stored at `server/extrack.sqlite`. It uses normalized tables for transactions, assets, trades, goals, calendar events, cash-flow plans, and cash-flow items. The REST endpoints keep the frontend independent of the database driver, so the repository can move to Postgres or MySQL by replacing the server adapter without rewriting the screens.

The current prototype uses local demo data and browser state. It includes:

- Overview dashboard with net worth, surplus, runway, cash-flow chart, allocation, recent activity, and goals
- Cash flow planner for income and upcoming expenses, with working add forms
- Cash flow plans for an expected income period, savings target, planned expenses, spent expenses, remaining income, available balance, and saved/reserved totals
- Portfolio holdings for stocks, ETFs, bonds, and forex, with working add forms
- Forex journal with trade metrics, setups, results, reflections, and persisted trade entries
- Goals page with targets, current progress, and persisted goal creation
- Calendar page with income, expense, investment, and goal events
- Reports page with cash flow, portfolio, goals, and trading summaries
