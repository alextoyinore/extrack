import express from "express";
import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseFile = path.join(__dirname, "extrack.sqlite");
const SQL = await initSqlJs({
  locateFile: (file) =>
    path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
});
const db = fs.existsSync(databaseFile)
  ? new SQL.Database(fs.readFileSync(databaseFile))
  : new SQL.Database();
const cents = (value) => Math.round(Number(value || 0) * 100);
const money = (record) =>
  record
    ? {
        ...record,
        amount: (record.amount_cents || 0) / 100,
        value: (record.value_cents || 0) / 100,
        target: (record.target_cents || 0) / 100,
        current: (record.current_cents || 0) / 100,
        result: (record.result_cents || 0) / 100,
        recurring: Boolean(record.recurring),
      }
    : record;
const schema = `
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')), label TEXT NOT NULL, category TEXT NOT NULL, amount_cents INTEGER NOT NULL DEFAULT 0, occurred_on TEXT NOT NULL, recurring INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS assets (id INTEGER PRIMARY KEY AUTOINCREMENT, symbol TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL, value_cents INTEGER NOT NULL DEFAULT 0, change_percent REAL NOT NULL DEFAULT 0, allocation REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, pair TEXT NOT NULL, setup TEXT NOT NULL, direction TEXT NOT NULL, result_cents INTEGER NOT NULL DEFAULT 0, traded_on TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, target_cents INTEGER NOT NULL DEFAULT 0, current_cents INTEGER NOT NULL DEFAULT 0, target_date TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'mint', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, event_type TEXT NOT NULL, amount_cents INTEGER NOT NULL DEFAULT 0, event_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cashflow_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, expected_income_cents INTEGER NOT NULL DEFAULT 0, savings_target_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cashflow_items (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL REFERENCES cashflow_plans(id) ON DELETE CASCADE, label TEXT NOT NULL, category TEXT NOT NULL, planned_cents INTEGER NOT NULL DEFAULT 0, spent_cents INTEGER NOT NULL DEFAULT 0, due_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'spent')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`;
db.run(schema);
for (const statement of [
  "ALTER TABLE assets ADD COLUMN cost_basis_cents INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE assets ADD COLUMN day_change_cents INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.run(statement);
  } catch {
    /* Existing databases already have the column. */
  }
}
db.run(
  "CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id = 1), display_name TEXT NOT NULL DEFAULT 'Alex Morgan', workspace_name TEXT NOT NULL DEFAULT 'Personal workspace', currency TEXT NOT NULL DEFAULT 'USD', week_starts_on TEXT NOT NULL DEFAULT 'Sunday', notifications INTEGER NOT NULL DEFAULT 1)",
);

const rows = (sql, params = []) => {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  return result[0].values.map((values) =>
    Object.fromEntries(
      result[0].columns.map((column, index) => [column, values[index]]),
    ),
  );
};
const record = (sql, params = []) => rows(sql, params)[0];
const persist = () => fs.writeFileSync(databaseFile, Buffer.from(db.export()));
const insert = (sql, params) => {
  db.run(sql, params);
  persist();
};
const cashflow = (planId) => {
  const plan = record("SELECT * FROM cashflow_plans WHERE id = ?", [planId]);
  if (!plan) return null;
  const items = rows(
    "SELECT * FROM cashflow_items WHERE plan_id = ? ORDER BY due_on ASC, id ASC",
    [planId],
  ).map((item) => ({
    ...item,
    planned: item.planned_cents / 100,
    spent: item.spent_cents / 100,
  }));
  const plannedExpenses = items.reduce((sum, item) => sum + item.planned, 0);
  const spent = items.reduce((sum, item) => sum + item.spent, 0);
  const expectedIncome = plan.expected_income_cents / 100;
  const savingsTarget = plan.savings_target_cents / 100;
  return {
    ...plan,
    expectedIncome,
    savingsTarget,
    items,
    plannedExpenses,
    spent,
    reserved: Math.max(0, plannedExpenses - spent),
    remaining: expectedIncome - plannedExpenses - savingsTarget,
    available: expectedIncome - spent - savingsTarget,
    saved: savingsTarget,
  };
};

const app = express();
app.use(express.json());
const port = Number(process.env.PORT || 8787);
app.get("/api/bootstrap", (_req, res) => {
  const settings = record(
    "SELECT id, display_name AS displayName, workspace_name AS workspaceName, currency, week_starts_on AS weekStartsOn, notifications FROM settings WHERE id = 1",
  );
  res.json({
    transactions: rows(
      "SELECT * FROM transactions ORDER BY occurred_on DESC, id DESC",
    ).map(money),
    assets: rows(
      "SELECT *, cost_basis_cents / 100.0 AS costBasis, day_change_cents / 100.0 AS dayChange, change_percent AS changePercent FROM assets ORDER BY value_cents DESC",
    ).map(money),
    trades: rows("SELECT * FROM trades ORDER BY traded_on DESC, id DESC").map(
      money,
    ),
    goals: rows("SELECT * FROM goals ORDER BY target_date ASC").map(money),
    events: rows("SELECT * FROM events ORDER BY event_date ASC, id ASC").map(
      money,
    ),
    cashflowPlans: rows(
      "SELECT * FROM cashflow_plans ORDER BY period_start DESC, id DESC",
    ).map((plan) => cashflow(plan.id)),
    settings: settings
      ? { ...settings, notifications: Boolean(settings.notifications) }
      : {
          displayName: "Alex Morgan",
          workspaceName: "Personal workspace",
          currency: "USD",
          weekStartsOn: "Sunday",
          notifications: true,
        },
  });
});
app.post("/api/cashflow/plans", (req, res) => {
  const { name, periodStart, periodEnd, expectedIncome, savingsTarget } =
    req.body;
  if (!name || !periodStart || !periodEnd)
    return res
      .status(400)
      .json({ error: "name, periodStart, and periodEnd are required" });
  insert(
    "INSERT INTO cashflow_plans (name, period_start, period_end, expected_income_cents, savings_target_cents) VALUES (?, ?, ?, ?, ?)",
    [name, periodStart, periodEnd, cents(expectedIncome), cents(savingsTarget)],
  );
  res
    .status(201)
    .json(
      cashflow(
        record("SELECT id FROM cashflow_plans ORDER BY id DESC LIMIT 1").id,
      ),
    );
});
app.post("/api/cashflow/plans/:planId/items", (req, res) => {
  const { label, category, planned, spent, dueOn, status } = req.body;
  const planId = Number(req.params.planId);
  if (
    !record("SELECT id FROM cashflow_plans WHERE id = ?", [planId]) ||
    !label ||
    !category ||
    !dueOn
  )
    return res
      .status(400)
      .json({ error: "plan, label, category, and dueOn are required" });
  insert(
    "INSERT INTO cashflow_items (plan_id, label, category, planned_cents, spent_cents, due_on, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      planId,
      label,
      category,
      cents(planned),
      cents(spent),
      dueOn,
      status === "spent" ? "spent" : "planned",
    ],
  );
  res.status(201).json(cashflow(planId));
});
app.patch("/api/cashflow/items/:itemId", (req, res) => {
  const { label, category, planned, spent, dueOn, status } = req.body;
  const item = record("SELECT * FROM cashflow_items WHERE id = ?", [
    Number(req.params.itemId),
  ]);
  if (!item) return res.status(404).json({ error: "Item not found" });
  db.run(
    "UPDATE cashflow_items SET label = ?, category = ?, planned_cents = ?, spent_cents = ?, due_on = ?, status = ? WHERE id = ?",
    [
      label ?? item.label,
      category ?? item.category,
      planned !== undefined ? cents(planned) : item.planned_cents,
      spent !== undefined ? cents(spent) : item.spent_cents,
      dueOn ?? item.due_on,
      status === "spent" || status === "planned"
        ? status
        : item.status,
      item.id,
    ],
  );
  persist();
  res.json(cashflow(item.plan_id));
});
app.delete("/api/cashflow/items/:itemId", (req, res) => {
  const item = record("SELECT * FROM cashflow_items WHERE id = ?", [
    Number(req.params.itemId),
  ]);
  if (!item) return res.status(404).json({ error: "Item not found" });
  db.run("DELETE FROM cashflow_items WHERE id = ?", [item.id]);
  persist();
  res.json(cashflow(item.plan_id));
});
const assetById = (id) =>
  money(
    record(
      "SELECT *, cost_basis_cents / 100.0 AS costBasis, day_change_cents / 100.0 AS dayChange, change_percent AS changePercent FROM assets WHERE id = ?",
      [id],
    ),
  );
app.post("/api/transactions", (req, res) => {
  const { kind, label, category, amount, occurredOn, recurring } = req.body;
  if (
    !["income", "expense"].includes(kind) ||
    !label ||
    !category ||
    !occurredOn
  )
    return res
      .status(400)
      .json({ error: "kind, label, category, and occurredOn are required" });
  insert(
    "INSERT INTO transactions (kind, label, category, amount_cents, occurred_on, recurring) VALUES (?, ?, ?, ?, ?, ?)",
    [kind, label, category, cents(amount), occurredOn, recurring ? 1 : 0],
  );
  res
    .status(201)
    .json(money(record("SELECT * FROM transactions ORDER BY id DESC LIMIT 1")));
});
app.post("/api/assets", (req, res) => {
  const {
    symbol,
    name,
    type,
    value,
    costBasis,
    dayChange,
    changePercent,
    allocation,
  } = req.body;
  if (!symbol || !name || !type)
    return res
      .status(400)
      .json({ error: "symbol, name, and type are required" });
  insert(
    "INSERT INTO assets (symbol, name, type, value_cents, cost_basis_cents, day_change_cents, change_percent, allocation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [
      symbol,
      name,
      type,
      cents(value),
      cents(costBasis),
      cents(dayChange),
      Number(changePercent || 0),
      Number(allocation || 0),
    ],
  );
  res
    .status(201)
    .json(
      assetById(
        record("SELECT id FROM assets ORDER BY id DESC LIMIT 1").id,
      ),
    );
});
app.put("/api/assets/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = record("SELECT * FROM assets WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Asset not found" });
  const {
    symbol,
    name,
    type,
    value,
    costBasis,
    dayChange,
    changePercent,
    allocation,
  } = req.body;
  if (!symbol || !name || !type)
    return res
      .status(400)
      .json({ error: "symbol, name, and type are required" });
  db.run(
    "UPDATE assets SET symbol = ?, name = ?, type = ?, value_cents = ?, cost_basis_cents = ?, day_change_cents = ?, change_percent = ?, allocation = ? WHERE id = ?",
    [
      symbol,
      name,
      type,
      cents(value),
      cents(costBasis ?? existing.cost_basis_cents / 100),
      cents(dayChange ?? existing.day_change_cents / 100),
      Number(changePercent || 0),
      Number(allocation || 0),
      id,
    ],
  );
  persist();
  res.json(assetById(id));
});
app.delete("/api/assets/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM assets WHERE id = ?", [id]))
    return res.status(404).json({ error: "Asset not found" });
  db.run("DELETE FROM assets WHERE id = ?", [id]);
  persist();
  res.status(204).end();
});
app.put("/api/settings", (req, res) => {
  const { displayName, workspaceName, currency, weekStartsOn, notifications } =
    req.body;
  if (!displayName || !workspaceName || !currency || !weekStartsOn)
    return res
      .status(400)
      .json({ error: "Profile and locale fields are required" });
  insert(
    "INSERT INTO settings (id, display_name, workspace_name, currency, week_starts_on, notifications) VALUES (1, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, workspace_name = excluded.workspace_name, currency = excluded.currency, week_starts_on = excluded.week_starts_on, notifications = excluded.notifications",
    [displayName, workspaceName, currency, weekStartsOn, notifications ? 1 : 0],
  );
  res.json({
    displayName,
    workspaceName,
    currency,
    weekStartsOn,
    notifications: Boolean(notifications),
  });
});
app.post("/api/trades", (req, res) => {
  const { pair, setup, direction, result, tradedOn, notes } = req.body;
  if (!pair || !setup || !direction || !tradedOn)
    return res
      .status(400)
      .json({ error: "pair, setup, direction, and tradedOn are required" });
  insert(
    "INSERT INTO trades (pair, setup, direction, result_cents, traded_on, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [pair, setup, direction, cents(result), tradedOn, notes || ""],
  );
  res
    .status(201)
    .json(money(record("SELECT * FROM trades ORDER BY id DESC LIMIT 1")));
});
app.put("/api/trades/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM trades WHERE id = ?", [id]))
    return res.status(404).json({ error: "Trade not found" });
  const { pair, setup, direction, result, tradedOn, notes } = req.body;
  if (!pair || !setup || !direction || !tradedOn)
    return res
      .status(400)
      .json({ error: "pair, setup, direction, and tradedOn are required" });
  db.run(
    "UPDATE trades SET pair = ?, setup = ?, direction = ?, result_cents = ?, traded_on = ?, notes = ? WHERE id = ?",
    [pair, setup, direction, cents(result), tradedOn, notes || "", id],
  );
  persist();
  res.json(money(record("SELECT * FROM trades WHERE id = ?", [id])));
});
app.delete("/api/trades/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM trades WHERE id = ?", [id]))
    return res.status(404).json({ error: "Trade not found" });
  db.run("DELETE FROM trades WHERE id = ?", [id]);
  persist();
  res.status(204).end();
});
app.post("/api/goals", (req, res) => {
  const { name, target, current, targetDate, color } = req.body;
  if (!name || !target || !targetDate)
    return res
      .status(400)
      .json({ error: "name, target, and targetDate are required" });
  insert(
    "INSERT INTO goals (name, target_cents, current_cents, target_date, color) VALUES (?, ?, ?, ?, ?)",
    [name, cents(target), cents(current), targetDate, color || "mint"],
  );
  res
    .status(201)
    .json(money(record("SELECT * FROM goals ORDER BY id DESC LIMIT 1")));
});
app.put("/api/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = record("SELECT * FROM goals WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Goal not found" });
  const { name, target, current, targetDate, color } = req.body;
  if (!name || !target || !targetDate)
    return res
      .status(400)
      .json({ error: "name, target, and targetDate are required" });
  db.run(
    "UPDATE goals SET name = ?, target_cents = ?, current_cents = ?, target_date = ?, color = ? WHERE id = ?",
    [
      name,
      cents(target),
      cents(current),
      targetDate,
      color || existing.color || "mint",
      id,
    ],
  );
  persist();
  res.json(money(record("SELECT * FROM goals WHERE id = ?", [id])));
});
app.delete("/api/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM goals WHERE id = ?", [id]))
    return res.status(404).json({ error: "Goal not found" });
  db.run("DELETE FROM goals WHERE id = ?", [id]);
  persist();
  res.status(204).end();
});
app.post("/api/events", (req, res) => {
  const { title, eventType, amount, eventDate, notes } = req.body;
  if (!title || !eventType || !eventDate)
    return res
      .status(400)
      .json({ error: "title, eventType, and eventDate are required" });
  insert(
    "INSERT INTO events (title, event_type, amount_cents, event_date, notes) VALUES (?, ?, ?, ?, ?)",
    [title, eventType, cents(amount), eventDate, notes || ""],
  );
  res
    .status(201)
    .json(money(record("SELECT * FROM events ORDER BY id DESC LIMIT 1")));
});
app.put("/api/events/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM events WHERE id = ?", [id]))
    return res.status(404).json({ error: "Event not found" });
  const { title, eventType, amount, eventDate, notes } = req.body;
  if (!title || !eventType || !eventDate)
    return res
      .status(400)
      .json({ error: "title, eventType, and eventDate are required" });
  db.run(
    "UPDATE events SET title = ?, event_type = ?, amount_cents = ?, event_date = ?, notes = ? WHERE id = ?",
    [title, eventType, cents(amount), eventDate, notes || "", id],
  );
  persist();
  res.json(money(record("SELECT * FROM events WHERE id = ?", [id])));
});
app.delete("/api/events/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM events WHERE id = ?", [id]))
    return res.status(404).json({ error: "Event not found" });
  db.run("DELETE FROM events WHERE id = ?", [id]);
  persist();
  res.status(204).end();
});
const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api"))
    return res.status(404).json({ error: "Not found" });
  const indexFile = path.join(distDir, "index.html");
  if (!fs.existsSync(indexFile)) {
    return res
      .status(503)
      .send(
        "Frontend build missing. Run `npm run build`, then restart the server.",
      );
  }
  res.sendFile(indexFile);
});
app.listen(port, () => {
  console.log(`Extrack listening on http://localhost:${port}`);
  if (!fs.existsSync(distDir)) {
    console.warn(
      "dist/ not found — run `npm run build` before hosting the UI.",
    );
  }
});
