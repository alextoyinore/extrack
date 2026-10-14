# Extrack

Extrack is a responsive income planner and wealth tracker for personal cash flow, investments, and forex journaling.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite client and Express API together. The app is available at `http://127.0.0.1:5173` and the API runs at `http://localhost:8787`.

The API uses Prisma with MySQL/MariaDB. Copy `.env.example` to `.env`, set `DATABASE_URL` to your database connection, then initialize it with:

```bash
npm run db:generate
npm run db:migrate
```

If you are migrating an existing local SQLite workspace, run `npm run db:import-sqlite` once after the MySQL schema is ready. The importer reads `server/auth.sqlite` and `server/extrack.sqlite` without changing them, and stops if the target MySQL database already contains app data. Do not run it again after a successful import.

For hosted deployment, configure `DATABASE_URL` as an environment variable in the host's Node.js app settings and run `npm run db:migrate` during deployment. The database account needs permission to create and alter tables. Prisma is the data access layer; switching database engines still requires a schema migration and data transfer, but API routes and UI components do not issue engine-specific SQL.

The current prototype uses local demo data and browser state. It includes:

- Overview dashboard with net worth, surplus, runway, cash-flow chart, allocation, recent activity, and goals
- Cash flow planner for income and upcoming expenses, with working add forms
- Cash flow plans for an expected income period, savings target, planned expenses, spent expenses, remaining income, available balance, and saved/reserved totals
- Portfolio holdings for stocks, ETFs, bonds, and forex, with working add forms
- Forex journal with trade metrics, setups, results, reflections, and persisted trade entries
- Goals page with targets, current progress, and persisted goal creation
- Calendar page with income, expense, investment, and goal events
- Reports page with cash flow, portfolio, goals, and trading summaries
