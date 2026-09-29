import express from "express";
import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databaseFile = path.join(__dirname, "extrack.sqlite");
const SQL = await initSqlJs({
  locateFile: (file) =>
    path.join(__dirname, "..", "node_modules", "sql.js", "dist", file),
});
const baseDb = fs.existsSync(databaseFile)
  ? new SQL.Database(fs.readFileSync(databaseFile))
  : new SQL.Database();
const workspaceContext = new AsyncLocalStorage();
const workspaceDbs = new Map();
const db = new Proxy({}, {
  get(_target, property) {
    const activeDb = workspaceContext.getStore()?.db || baseDb;
    const value = activeDb[property];
    return typeof value === "function" ? value.bind(activeDb) : value;
  },
});
const cents = (value) => Math.round(Number(value || 0) * 100);
const dateOnly = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : value;
};
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
CREATE TABLE IF NOT EXISTS goal_contributions (id INTEGER PRIMARY KEY AUTOINCREMENT, goal_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL, funded_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, event_type TEXT NOT NULL, amount_cents INTEGER NOT NULL DEFAULT 0, event_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cashflow_incomes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, expected_income_cents INTEGER NOT NULL DEFAULT 0, period_start TEXT NOT NULL, period_end TEXT NOT NULL, favorite_plan_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cashflow_plans (id INTEGER PRIMARY KEY AUTOINCREMENT, income_id INTEGER, name TEXT NOT NULL, period_start TEXT NOT NULL, period_end TEXT NOT NULL, expected_income_cents INTEGER NOT NULL DEFAULT 0, savings_target_cents INTEGER NOT NULL DEFAULT 0, is_closed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cashflow_items (id INTEGER PRIMARY KEY AUTOINCREMENT, plan_id INTEGER NOT NULL REFERENCES cashflow_plans(id) ON DELETE CASCADE, label TEXT NOT NULL, category TEXT NOT NULL, planned_cents INTEGER NOT NULL DEFAULT 0, spent_cents INTEGER NOT NULL DEFAULT 0, due_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'spent')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`;
const migrations = [
  "ALTER TABLE assets ADD COLUMN cost_basis_cents INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE assets ADD COLUMN day_change_cents INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE events ADD COLUMN source TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE trades ADD COLUMN trade_status TEXT NOT NULL DEFAULT 'closed'",
  "ALTER TABLE cashflow_plans ADD COLUMN income_id INTEGER",
  "ALTER TABLE cashflow_incomes ADD COLUMN favorite_plan_id INTEGER",
  "ALTER TABLE cashflow_plans ADD COLUMN is_closed INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE settings ADD COLUMN profile_picture TEXT NOT NULL DEFAULT ''",
];
const initializeWorkspace = (workspaceDb) => {
  workspaceDb.run(schema);
  workspaceDb.run("CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id = 1), display_name TEXT NOT NULL DEFAULT 'Alex Morgan', workspace_name TEXT NOT NULL DEFAULT 'Personal workspace', currency TEXT NOT NULL DEFAULT 'USD', week_starts_on TEXT NOT NULL DEFAULT 'Sunday', notifications INTEGER NOT NULL DEFAULT 1)");
  for (const statement of migrations) {
    try { workspaceDb.run(statement); } catch { /* Existing databases already have the column. */ }
  }
  const unlinkedResult = workspaceDb.exec("SELECT id, name, expected_income_cents, period_start, period_end FROM cashflow_plans WHERE income_id IS NULL ORDER BY id");
  const unlinkedPlans = unlinkedResult[0]?.values || [];
  for (const [planId, oldName, expectedCents, periodStart, periodEnd] of unlinkedPlans) {
    const matched = String(oldName).match(/^(.*?)\s+plan\s+([a-z0-9]+)$/i);
    const incomeName = (matched?.[1] || String(oldName)).trim();
    const planName = matched ? `Plan ${matched[2].toUpperCase()}` : "Plan 1";
    let incomeResult = workspaceDb.exec("SELECT id FROM cashflow_incomes WHERE name = ? AND expected_income_cents = ? AND period_start = ? AND period_end = ? ORDER BY id LIMIT 1", [incomeName, expectedCents, periodStart, periodEnd]);
    let incomeId = incomeResult[0]?.values[0]?.[0];
    if (!incomeId) {
      workspaceDb.run("INSERT INTO cashflow_incomes (name, expected_income_cents, period_start, period_end) VALUES (?, ?, ?, ?)", [incomeName, expectedCents, periodStart, periodEnd]);
      incomeId = workspaceDb.exec("SELECT last_insert_rowid()")[0].values[0][0];
    }
    workspaceDb.run("UPDATE cashflow_plans SET income_id = ?, name = ? WHERE id = ?", [incomeId, planName, planId]);
  }
  const sharedSpends = workspaceDb.exec(`SELECT p.income_id, lower(trim(i.label)), lower(trim(i.category)),
      MAX(CASE WHEN i.status = 'spent' THEN CASE WHEN i.spent_cents > 0 THEN i.spent_cents ELSE i.planned_cents END ELSE 0 END)
    FROM cashflow_items i JOIN cashflow_plans p ON p.id = i.plan_id
    WHERE p.income_id IS NOT NULL
    GROUP BY p.income_id, lower(trim(i.label)), lower(trim(i.category))
    HAVING MAX(CASE WHEN i.status = 'spent' THEN CASE WHEN i.spent_cents > 0 THEN i.spent_cents ELSE i.planned_cents END ELSE 0 END) > 0`);
  for (const [incomeId, label, category, spentCents] of sharedSpends[0]?.values || []) {
    workspaceDb.run(`UPDATE cashflow_items SET status = 'spent', spent_cents = ?
      WHERE lower(trim(label)) = ? AND lower(trim(category)) = ?
      AND plan_id IN (SELECT id FROM cashflow_plans WHERE income_id = ?)`, [spentCents, label, category, incomeId]);
  }
  const duplicateExpenses = workspaceDb.exec(`SELECT plan_id, lower(trim(label)), lower(trim(category)), MIN(id), MAX(planned_cents),
      MAX(CASE WHEN status = 'spent' THEN 1 ELSE 0 END),
      MAX(CASE WHEN status = 'spent' THEN CASE WHEN spent_cents > 0 THEN spent_cents ELSE planned_cents END ELSE 0 END)
    FROM cashflow_items
    GROUP BY plan_id, lower(trim(label)), lower(trim(category))
    HAVING COUNT(*) > 1`);
  for (const [planId, label, category, keepId, plannedCents, isSpent, spentCents] of duplicateExpenses[0]?.values || []) {
    workspaceDb.run(`UPDATE cashflow_items SET planned_cents = ?, status = ?, spent_cents = ? WHERE id = ?`,
      [plannedCents, isSpent ? "spent" : "planned", spentCents, keepId]);
    workspaceDb.run(`DELETE FROM cashflow_items WHERE plan_id = ? AND lower(trim(label)) = ? AND lower(trim(category)) = ? AND id != ?`,
      [planId, label, category, keepId]);
  }
  workspaceDb.run("CREATE UNIQUE INDEX IF NOT EXISTS cashflow_items_plan_expense_identity ON cashflow_items(plan_id, lower(trim(label)), lower(trim(category)))");
  workspaceDb.run(`INSERT INTO goal_contributions (goal_id, amount_cents, funded_on, note)
    SELECT g.id, g.current_cents, substr(g.created_at, 1, 10), 'Starting balance'
    FROM goals g WHERE g.current_cents > 0 AND NOT EXISTS (
      SELECT 1 FROM goal_contributions c WHERE c.goal_id = g.id
    )`);
};
initializeWorkspace(baseDb);

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
const workspaceFile = (userId) => Number(userId) === 1
  ? databaseFile
  : path.join(__dirname, `workspace-${Number(userId)}.sqlite`);
const persist = () => fs.writeFileSync(workspaceContext.getStore()?.file || databaseFile, Buffer.from(db.export()));
const insert = (sql, params) => {
  db.run(sql, params);
  persist();
};
const refreshAssetMetrics = () => {
  const assets = rows("SELECT id, value_cents, cost_basis_cents FROM assets");
  const total = assets.reduce((sum, asset) => sum + asset.value_cents, 0);
  for (const asset of assets) {
    const allocation = total ? (asset.value_cents / total) * 100 : 0;
    const changePercent = asset.cost_basis_cents
      ? ((asset.value_cents - asset.cost_basis_cents) / asset.cost_basis_cents) *
        100
      : 0;
    db.run(
      "UPDATE assets SET allocation = ?, change_percent = ?, day_change_cents = ? WHERE id = ?",
      [
        allocation,
        changePercent,
        asset.value_cents - asset.cost_basis_cents,
        asset.id,
      ],
    );
  }
};
const upsertEventBySource = ({
  title,
  eventType,
  amount,
  eventDate,
  notes,
  source,
}) => {
  const existing = record("SELECT * FROM events WHERE source = ?", [source]);
  if (existing) {
    db.run(
      "UPDATE events SET title = ?, event_type = ?, amount_cents = ?, event_date = ?, notes = ? WHERE id = ?",
      [title, eventType, cents(amount), dateOnly(eventDate), notes || "", existing.id],
    );
    return;
  }
  db.run(
    "INSERT INTO events (title, event_type, amount_cents, event_date, notes, source) VALUES (?, ?, ?, ?, ?, ?)",
    [title, eventType, cents(amount), dateOnly(eventDate), notes || "", source],
  );
};
const syncPlanCalendar = (planId) => {
  const plan = cashflow(planId);
  if (!plan) return;
  const income = record("SELECT * FROM cashflow_incomes WHERE id = ?", [plan.income_id]);
  upsertEventBySource({
    title: income?.name || `${plan.incomeName} income`,
    eventType: "Income",
    amount: plan.expectedIncome,
    eventDate: income?.period_start || plan.period_start,
    notes: "Expected income",
    source: `cashflow-income:${plan.income_id}`,
  });
  db.run("DELETE FROM events WHERE source = ?", [`cashflow-plan:${planId}`]);
  for (const item of plan.items) {
    upsertEventBySource({
      title: item.label,
      eventType: "Expense",
      amount: item.planned,
      eventDate: item.due_on,
      notes: `${item.category} · ${plan.name}`,
      source: `cashflow-item:${item.id}`,
    });
  }
  for (const event of rows(
    "SELECT id, source FROM events WHERE source LIKE 'cashflow-item:%'",
  )) {
    const itemId = Number(String(event.source).replace("cashflow-item:", ""));
    if (!record("SELECT id FROM cashflow_items WHERE id = ?", [itemId])) {
      db.run("DELETE FROM events WHERE id = ?", [event.id]);
    }
  }
};
const cashflow = (planId) => {
  const plan = record("SELECT * FROM cashflow_plans WHERE id = ?", [planId]);
  if (!plan) return null;
  const income = plan.income_id
    ? record("SELECT * FROM cashflow_incomes WHERE id = ?", [plan.income_id])
    : null;
  const items = rows(
    "SELECT * FROM cashflow_items WHERE plan_id = ? ORDER BY due_on ASC, id ASC",
    [planId],
  ).map((item) => ({
    ...item,
    planned: item.planned_cents / 100,
    spent: item.spent_cents / 100,
  }));
  const planExpenseTotals = new Map();
  for (const item of items) {
    const key = `${item.label.trim().toLocaleLowerCase()}\u0000${item.category.trim().toLocaleLowerCase()}`;
    const total = planExpenseTotals.get(key) || { planned: 0, spent: 0 };
    total.planned = Math.max(total.planned, item.planned);
    if (item.status === "spent") total.spent = Math.max(total.spent, item.spent);
    planExpenseTotals.set(key, total);
  }
  const plannedExpenses = [...planExpenseTotals.values()].reduce((sum, item) => sum + item.planned, 0);
  const spent = [...planExpenseTotals.values()].reduce((sum, item) => sum + item.spent, 0);
  const reserved = [...planExpenseTotals.values()].reduce((sum, item) => sum + Math.max(0, item.planned - item.spent), 0);
  const isClosed = Boolean(plan.is_closed);
  const expectedIncome = isClosed ? 0 : (income?.expected_income_cents ?? plan.expected_income_cents) / 100;
  const savingsTarget = isClosed ? 0 : plan.savings_target_cents / 100;
  const spentAcrossIncome = income
    ? rows(`SELECT COALESCE(SUM(spent_cents), 0) AS spent_cents FROM (
        SELECT MAX(CASE WHEN i.status = 'spent' THEN i.spent_cents ELSE 0 END) AS spent_cents
        FROM cashflow_items i JOIN cashflow_plans p ON p.id = i.plan_id
        WHERE p.income_id = ? AND p.is_closed = 0 GROUP BY lower(trim(i.label)), lower(trim(i.category))
      )`, [income.id])[0].spent_cents / 100
    : spent;
  return {
    ...plan,
    is_closed: isClosed,
    incomeName: income?.name || plan.name,
    expectedIncome,
    savingsTarget,
    items,
    plannedExpenses: isClosed ? 0 : plannedExpenses,
    spent: isClosed ? spent : spentAcrossIncome,
    planSpent: spent,
    reserved: isClosed ? 0 : reserved,
    remaining: expectedIncome - (isClosed ? 0 : plannedExpenses) - savingsTarget,
    available: isClosed ? 0 : expectedIncome - spentAcrossIncome - savingsTarget,
    saved: savingsTarget,
  };
};

const app = express();
app.use(express.json({ limit: "1mb" }));
const port = Number(process.env.PORT || 8787);
const authDatabaseFile = path.join(__dirname, "auth.sqlite");
const authDb = fs.existsSync(authDatabaseFile)
  ? new SQL.Database(fs.readFileSync(authDatabaseFile))
  : new SQL.Database();
authDb.run("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
authDb.run("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)");
const authRows = (sql, params = []) => {
  const result = authDb.exec(sql, params);
  if (!result.length) return [];
  return result[0].values.map((values) => Object.fromEntries(result[0].columns.map((column, index) => [column, values[index]])));
};
const authRecord = (sql, params = []) => authRows(sql, params)[0];
const persistAuth = () => fs.writeFileSync(authDatabaseFile, Buffer.from(authDb.export()));
const scrypt = promisify(scryptCallback);
const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
};
const verifyPassword = async (password, stored) => {
  const [saltHex, keyHex] = String(stored).split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
const seedEmail = "aore8030@gmail.com";
if (!authRecord("SELECT id FROM users WHERE email = ?", [seedEmail])) {
  const seedHash = await hashPassword("12345");
  authDb.run("INSERT INTO users (id, email, password_hash) VALUES (1, ?, ?)", [seedEmail, seedHash]);
  persistAuth();
}
const workspaceForUser = (userId) => {
  if (Number(userId) === 1) return baseDb;
  if (!workspaceDbs.has(Number(userId))) {
    const file = workspaceFile(userId);
    const workspaceDb = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    initializeWorkspace(workspaceDb);
    workspaceDbs.set(Number(userId), workspaceDb);
  }
  return workspaceDbs.get(Number(userId));
};
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const issueSession = (userId, res, req) => {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  authDb.run("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)", [hashToken(token), userId, expiresAt]);
  persistAuth();
  res.setHeader("Set-Cookie", `extrack_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${req.secure ? "; Secure" : ""}`);
};
const clearSessionCookie = (res, req) => res.setHeader("Set-Cookie", `extrack_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${req.secure ? "; Secure" : ""}`);
const requestToken = (req) => {
  const cookie = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith("extrack_session="));
  return cookie ? decodeURIComponent(cookie.slice("extrack_session=".length)) : "";
};
const authenticate = (req, res, next) => {
  const token = requestToken(req);
  const session = token && authRecord("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  if (!session || session.expires_at < Date.now()) {
    if (session) { authDb.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]); persistAuth(); }
    clearSessionCookie(res, req);
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = authRecord("SELECT id, email FROM users WHERE id = ?", [session.user_id]);
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  req.sessionTokenHash = hashToken(token);
  workspaceContext.run({ db: workspaceForUser(user.id), file: workspaceFile(user.id) }, next);
};
app.post("/api/auth/register", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8)
    return res.status(400).json({ error: "Enter a valid email and a password with at least 8 characters." });
  if (authRecord("SELECT id FROM users WHERE email = ?", [email]))
    return res.status(409).json({ error: "An account with that email already exists." });
  const passwordHash = await hashPassword(password);
  authDb.run("INSERT INTO users (email, password_hash) VALUES (?, ?)", [email, passwordHash]);
  const user = authRecord("SELECT id, email FROM users WHERE email = ?", [email]);
  persistAuth();
  const workspaceDb = workspaceForUser(user.id);
  fs.writeFileSync(path.join(__dirname, `workspace-${user.id}.sqlite`), Buffer.from(workspaceDb.export()));
  issueSession(user.id, res, req);
  res.status(201).json({ user });
});
app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = authRecord("SELECT * FROM users WHERE email = ?", [email]);
  if (!user || !(await verifyPassword(String(req.body.password || ""), user.password_hash)))
    return res.status(401).json({ error: "Email or password is incorrect." });
  issueSession(user.id, res, req);
  res.json({ user: { id: user.id, email: user.email } });
});
app.get("/api/auth/session", (req, res) => {
  const token = requestToken(req);
  const session = token && authRecord("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  const user = session && session.expires_at >= Date.now() ? authRecord("SELECT id, email FROM users WHERE id = ?", [session.user_id]) : null;
  res.json({ user: user || null });
});
app.post("/api/auth/logout", (req, res) => {
  const token = requestToken(req);
  if (token) authDb.run("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
  persistAuth();
  clearSessionCookie(res, req);
  res.status(204).end();
});
app.use("/api", authenticate);
app.post("/api/auth/password", async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = authRecord("SELECT * FROM users WHERE id = ?", [req.user.id]);
  if (!(await verifyPassword(String(currentPassword || ""), user.password_hash)))
    return res.status(400).json({ error: "Current password is incorrect." });
  if (String(newPassword || "").length < 8)
    return res.status(400).json({ error: "New password must be at least 8 characters." });
  const newHash = await hashPassword(String(newPassword));
  authDb.run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
  authDb.run("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", [req.user.id, req.sessionTokenHash]);
  persistAuth();
  res.json({ success: true });
});
app.get("/api/bootstrap", (_req, res) => {
  const missingIncomeEvent = rows("SELECT id FROM cashflow_incomes").some(
    (income) =>
      !record("SELECT id FROM events WHERE source = ?", [
        `cashflow-income:${income.id}`,
      ]),
  );
  const missingItemEvent = rows("SELECT id FROM cashflow_items").some(
    (item) =>
      !record("SELECT id FROM events WHERE source = ?", [
        `cashflow-item:${item.id}`,
      ]),
  );
  refreshAssetMetrics();
  if (missingIncomeEvent || missingItemEvent) {
    for (const income of rows("SELECT * FROM cashflow_incomes")) {
      upsertEventBySource({ title: income.name, eventType: "Income", amount: income.expected_income_cents / 100, eventDate: income.period_start, notes: "Expected income", source: `cashflow-income:${income.id}` });
    }
    for (const plan of rows("SELECT id FROM cashflow_plans")) {
      syncPlanCalendar(plan.id);
    }
    for (const event of rows("SELECT id FROM events WHERE source LIKE 'cashflow-plan:%'")) {
      db.run("DELETE FROM events WHERE id = ?", [event.id]);
    }
  }
  persist();
  const settings = record(
    "SELECT id, display_name AS displayName, workspace_name AS workspaceName, currency, week_starts_on AS weekStartsOn, notifications, profile_picture AS profilePicture FROM settings WHERE id = 1",
  );
  res.json({
    transactions: rows(
      "SELECT * FROM transactions ORDER BY occurred_on DESC, id DESC",
    ).map(money),
    assets: rows(
      "SELECT *, cost_basis_cents / 100.0 AS costBasis, day_change_cents / 100.0 AS dayChange, change_percent AS changePercent FROM assets ORDER BY value_cents DESC",
    ).map(money),
    trades: rows("SELECT * FROM trades ORDER BY traded_on DESC, id DESC").map(
      (trade) => ({ ...money(trade), status: trade.trade_status || "closed" }),
    ),
    goals: rows("SELECT * FROM goals ORDER BY target_date ASC").map(money),
    events: rows("SELECT * FROM events ORDER BY event_date ASC, id ASC").map(
      money,
    ),
    cashflowPlans: rows(
      "SELECT * FROM cashflow_plans ORDER BY period_start DESC, id DESC",
    ).map((plan) => cashflow(plan.id)),
    cashflowIncomes: rows("SELECT id, name, expected_income_cents, period_start, period_end, favorite_plan_id FROM cashflow_incomes ORDER BY period_start DESC, id DESC").map((income) => ({
      ...income,
      expectedIncome: income.expected_income_cents / 100,
      favorite_plan_id: income.favorite_plan_id,
    })),
    settings: settings
      ? { ...settings, notifications: Boolean(settings.notifications) }
      : {
          displayName: "Alex Morgan",
          workspaceName: "Personal workspace",
          currency: "USD",
          weekStartsOn: "Sunday",
          notifications: true,
          profilePicture: "",
        },
  });
});
app.patch("/api/cashflow/incomes/:incomeId/favorite", (req, res) => {
  const incomeId = Number(req.params.incomeId);
  const planId = Number(req.body.planId);
  const income = record("SELECT id FROM cashflow_incomes WHERE id = ?", [incomeId]);
  if (!income) return res.status(404).json({ error: "Income not found" });
  if (!record("SELECT id FROM cashflow_plans WHERE id = ? AND income_id = ? AND is_closed = 0", [planId, incomeId]))
    return res.status(400).json({ error: "Choose a plan belonging to this income" });
  db.run("UPDATE cashflow_incomes SET favorite_plan_id = ? WHERE id = ?", [planId, incomeId]);
  persist();
  res.json({ incomeId, favorite_plan_id: planId });
});
app.patch("/api/cashflow/plans/:planId/closed", (req, res) => {
  const planId = Number(req.params.planId);
  const plan = record("SELECT * FROM cashflow_plans WHERE id = ?", [planId]);
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  const isClosed = Boolean(req.body.isClosed);
  db.run("UPDATE cashflow_plans SET is_closed = ? WHERE id = ?", [isClosed ? 1 : 0, planId]);
  if (isClosed) {
    const income = plan.income_id ? record("SELECT * FROM cashflow_incomes WHERE id = ?", [plan.income_id]) : null;
    if (income?.favorite_plan_id === planId) {
      const replacement = record("SELECT id FROM cashflow_plans WHERE income_id = ? AND id != ? AND is_closed = 0 ORDER BY id LIMIT 1", [plan.income_id, planId]);
      db.run("UPDATE cashflow_incomes SET favorite_plan_id = ? WHERE id = ?", [replacement?.id ?? null, plan.income_id]);
    }
    for (const item of rows("SELECT id FROM cashflow_items WHERE plan_id = ? AND status != 'spent'", [planId])) {
      db.run("DELETE FROM events WHERE source = ?", [`cashflow-item:${item.id}`]);
    }
  } else {
    syncPlanCalendar(planId);
  }
  persist();
  res.json(cashflow(planId));
});
app.post("/api/cashflow/incomes", (req, res) => {
  const { name, expectedIncome, periodStart, periodEnd } = req.body;
  if (!name || !periodStart || !periodEnd || !Number.isFinite(Number(expectedIncome)) || Number(expectedIncome) <= 0)
    return res.status(400).json({ error: "Name, expected income, and period dates are required" });
  insert("INSERT INTO cashflow_incomes (name, expected_income_cents, period_start, period_end) VALUES (?, ?, ?, ?)", [name.trim(), cents(expectedIncome), dateOnly(periodStart), dateOnly(periodEnd)]);
  const income = record("SELECT * FROM cashflow_incomes ORDER BY id DESC LIMIT 1");
  upsertEventBySource({ title: income.name, eventType: "Income", amount: income.expected_income_cents / 100, eventDate: income.period_start, notes: "Expected income", source: `cashflow-income:${income.id}` });
  persist();
  res.status(201).json({ ...income, expectedIncome: income.expected_income_cents / 100 });
});
app.patch("/api/cashflow/incomes/:incomeId", (req, res) => {
  const incomeId = Number(req.params.incomeId);
  const existing = record("SELECT * FROM cashflow_incomes WHERE id = ?", [incomeId]);
  if (!existing) return res.status(404).json({ error: "Income not found" });
  const { name, expectedIncome, periodStart, periodEnd } = req.body;
  if (!name || !periodStart || !periodEnd || !Number.isFinite(Number(expectedIncome)) || Number(expectedIncome) <= 0)
    return res.status(400).json({ error: "Name, expected income, and period dates are required" });
  db.run("UPDATE cashflow_incomes SET name = ?, expected_income_cents = ?, period_start = ?, period_end = ? WHERE id = ?", [name.trim(), cents(expectedIncome), dateOnly(periodStart), dateOnly(periodEnd), incomeId]);
  db.run("UPDATE cashflow_plans SET expected_income_cents = ?, period_start = ?, period_end = ? WHERE income_id = ?", [cents(expectedIncome), dateOnly(periodStart), dateOnly(periodEnd), incomeId]);
  upsertEventBySource({ title: name.trim(), eventType: "Income", amount: Number(expectedIncome), eventDate: dateOnly(periodStart), notes: "Expected income", source: `cashflow-income:${incomeId}` });
  persist();
  res.json({ ...record("SELECT * FROM cashflow_incomes WHERE id = ?", [incomeId]), expectedIncome: Number(expectedIncome) });
});
app.post("/api/cashflow/plans", (req, res) => {
  const { incomeId, name, savingsTarget } = req.body;
  const income = record("SELECT * FROM cashflow_incomes WHERE id = ?", [Number(incomeId)]);
  if (!income || !name)
    return res
      .status(400)
      .json({ error: "Select an income and name this plan" });
  insert(
    "INSERT INTO cashflow_plans (income_id, name, period_start, period_end, expected_income_cents, savings_target_cents) VALUES (?, ?, ?, ?, ?, ?)",
    [income.id, name.trim(), income.period_start, income.period_end, income.expected_income_cents, cents(savingsTarget)],
  );
  const planId = record(
    "SELECT id FROM cashflow_plans ORDER BY id DESC LIMIT 1",
  ).id;
  syncPlanCalendar(planId);
  persist();
  res.status(201).json(cashflow(planId));
});
app.patch("/api/cashflow/plans/:planId", (req, res) => {
  const planId = Number(req.params.planId);
  const existing = record("SELECT * FROM cashflow_plans WHERE id = ?", [
    planId,
  ]);
  if (!existing) return res.status(404).json({ error: "Plan not found" });
  const { name, savingsTarget } = req.body;
  if (!name)
    return res
      .status(400)
      .json({ error: "Plan name is required" });
  db.run(
    "UPDATE cashflow_plans SET name = ?, savings_target_cents = ? WHERE id = ?",
    [
      name.trim(),
      cents(savingsTarget ?? existing.savings_target_cents / 100),
      planId,
    ],
  );
  syncPlanCalendar(planId);
  persist();
  res.json(cashflow(planId));
});
app.post("/api/cashflow/plans/:planId/items", (req, res) => {
  const { label, category, planned, spent, dueOn, status } = req.body;
  const planId = Number(req.params.planId);
  const plan = record("SELECT * FROM cashflow_plans WHERE id = ?", [planId]);
  if (
    !plan ||
    !label ||
    !category ||
    !dueOn
  )
    return res
      .status(400)
      .json({ error: "plan, label, category, and dueOn are required" });
  if (plan.is_closed) return res.status(409).json({ error: "Reopen this plan before adding expenses" });
  if (record("SELECT id FROM cashflow_items WHERE plan_id = ? AND lower(trim(label)) = lower(trim(?)) AND lower(trim(category)) = lower(trim(?))", [planId, label, category]))
    return res.status(409).json({ error: "An expense with this name and category already exists in this plan" });
  insert(
    "INSERT INTO cashflow_items (plan_id, label, category, planned_cents, spent_cents, due_on, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      planId,
      label,
      category,
      cents(planned),
      cents(spent),
      dateOnly(dueOn),
      status === "spent" ? "spent" : "planned",
    ],
  );
  syncPlanCalendar(planId);
  persist();
  res.status(201).json(cashflow(planId));
});
app.patch("/api/cashflow/items/:itemId", (req, res) => {
  const { label, category, planned, spent, dueOn, status } = req.body;
  const item = record("SELECT * FROM cashflow_items WHERE id = ?", [
    Number(req.params.itemId),
  ]);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const sourcePlan = record("SELECT * FROM cashflow_plans WHERE id = ?", [item.plan_id]);
  if (sourcePlan?.is_closed && (status !== "spent" || label !== undefined || category !== undefined || planned !== undefined || dueOn !== undefined))
    return res.status(409).json({ error: "Reopen this plan before editing its expenses" });
  const nextLabelValue = label ?? item.label;
  const nextCategoryValue = category ?? item.category;
  if (record("SELECT id FROM cashflow_items WHERE plan_id = ? AND id != ? AND lower(trim(label)) = lower(trim(?)) AND lower(trim(category)) = lower(trim(?))", [item.plan_id, item.id, nextLabelValue, nextCategoryValue]))
    return res.status(409).json({ error: "An expense with this name and category already exists in this plan" });
  const nextStatus = status === "spent" || status === "planned" ? status : item.status;
  const nextPlannedCents = planned !== undefined ? cents(planned) : item.planned_cents;
  const nextSpentCents = nextStatus === "planned"
    ? 0
    : spent !== undefined
      ? cents(spent)
      : item.status === "spent"
        ? item.spent_cents
        : nextPlannedCents;
  db.run(
    "UPDATE cashflow_items SET label = ?, category = ?, planned_cents = ?, spent_cents = ?, due_on = ?, status = ? WHERE id = ?",
    [
      label ?? item.label,
      category ?? item.category,
      nextPlannedCents,
      nextSpentCents,
      dueOn !== undefined ? dateOnly(dueOn) : item.due_on,
      nextStatus,
      item.id,
    ],
  );
  const incomeId = record("SELECT income_id FROM cashflow_plans WHERE id = ?", [item.plan_id])?.income_id;
  if (incomeId) {
    db.run(`UPDATE cashflow_items SET status = ?, spent_cents = ?
      WHERE id != ? AND lower(trim(label)) = lower(trim(?)) AND lower(trim(category)) = lower(trim(?))
      AND plan_id IN (SELECT id FROM cashflow_plans WHERE income_id = ? AND is_closed = 0)`,
    [nextStatus, nextSpentCents, item.id, label ?? item.label, category ?? item.category, incomeId]);
    if (nextStatus === "spent") {
      const favorite = record("SELECT favorite_plan_id FROM cashflow_incomes WHERE id = ?", [incomeId])?.favorite_plan_id;
      if (favorite && favorite !== item.plan_id && record("SELECT id FROM cashflow_plans WHERE id = ? AND is_closed = 0", [favorite])) {
        const nextLabel = label ?? item.label;
        const nextCategory = category ?? item.category;
        const target = record(`SELECT id FROM cashflow_items WHERE plan_id = ? AND lower(trim(label)) = lower(trim(?)) AND lower(trim(category)) = lower(trim(?)) ORDER BY id LIMIT 1`, [favorite, nextLabel, nextCategory]);
        if (target) {
          db.run("UPDATE cashflow_items SET status = 'spent', spent_cents = ?, due_on = ? WHERE id = ?", [nextSpentCents, dueOn !== undefined ? dateOnly(dueOn) : item.due_on, target.id]);
        } else {
          db.run("INSERT INTO cashflow_items (plan_id, label, category, planned_cents, spent_cents, due_on, status) VALUES (?, ?, ?, ?, ?, ?, 'spent')", [favorite, nextLabel, nextCategory, nextPlannedCents, nextSpentCents, dueOn !== undefined ? dateOnly(dueOn) : item.due_on]);
        }
        db.run("DELETE FROM cashflow_items WHERE id = ?", [item.id]);
        db.run("DELETE FROM events WHERE source = ?", [`cashflow-item:${item.id}`]);
        syncPlanCalendar(favorite);
        persist();
        return res.json(cashflow(favorite));
      }
    }
  }
  syncPlanCalendar(item.plan_id);
  persist();
  res.json(cashflow(item.plan_id));
});
app.delete("/api/cashflow/items/:itemId", (req, res) => {
  const item = record("SELECT * FROM cashflow_items WHERE id = ?", [
    Number(req.params.itemId),
  ]);
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (record("SELECT id FROM cashflow_plans WHERE id = ? AND is_closed = 1", [item.plan_id]))
    return res.status(409).json({ error: "Reopen this plan before deleting its expenses" });
  db.run("DELETE FROM cashflow_items WHERE id = ?", [item.id]);
  db.run("DELETE FROM events WHERE source = ?", [`cashflow-item:${item.id}`]);
  persist();
  res.json(cashflow(item.plan_id));
});
app.post("/api/cashflow/items/:itemId/transfer", (req, res) => {
  const item = record("SELECT * FROM cashflow_items WHERE id = ?", [Number(req.params.itemId)]);
  if (!item) return res.status(404).json({ error: "Expense not found" });
  const sourcePlan = record("SELECT * FROM cashflow_plans WHERE id = ?", [item.plan_id]);
  const destinationPlanId = Number(req.body.destinationPlanId);
  const destinationPlan = record("SELECT * FROM cashflow_plans WHERE id = ?", [destinationPlanId]);
  const mode = req.body.mode;
  if (!sourcePlan || !destinationPlan || sourcePlan.income_id !== destinationPlan.income_id)
    return res.status(400).json({ error: "Choose a plan attached to the same income" });
  if (sourcePlan.id === destinationPlan.id)
    return res.status(400).json({ error: "Choose a different destination plan" });
  if (sourcePlan.is_closed || destinationPlan.is_closed)
    return res.status(409).json({ error: "Reopen both plans before copying or moving expenses" });
  if (mode !== "copy" && mode !== "move")
    return res.status(400).json({ error: "Choose whether to copy or move the expense" });
  if (record("SELECT id FROM cashflow_items WHERE plan_id = ? AND lower(trim(label)) = lower(trim(?)) AND lower(trim(category)) = lower(trim(?))", [destinationPlanId, item.label, item.category]))
    return res.status(409).json({ error: "An expense with this name and category already exists in the destination plan" });
  db.run("INSERT INTO cashflow_items (plan_id, label, category, planned_cents, spent_cents, due_on, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [destinationPlanId, item.label, item.category, item.planned_cents, item.spent_cents, item.due_on, item.status]);
  if (mode === "move") {
    db.run("DELETE FROM cashflow_items WHERE id = ?", [item.id]);
    db.run("DELETE FROM events WHERE source = ?", [`cashflow-item:${item.id}`]);
  }
  syncPlanCalendar(destinationPlanId);
  if (mode === "move") syncPlanCalendar(sourcePlan.id);
  persist();
  res.json({ mode, sourcePlanId: sourcePlan.id, destinationPlanId });
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
  refreshAssetMetrics();
  persist();
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
  refreshAssetMetrics();
  persist();
  res.json(assetById(id));
});
app.delete("/api/assets/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM assets WHERE id = ?", [id]))
    return res.status(404).json({ error: "Asset not found" });
  db.run("DELETE FROM assets WHERE id = ?", [id]);
  refreshAssetMetrics();
  persist();
  res.status(204).end();
});
app.put("/api/settings", (req, res) => {
  const { displayName, workspaceName, currency, weekStartsOn, notifications, profilePicture } =
    req.body;
  if (!displayName || !workspaceName || !currency || !weekStartsOn)
    return res
      .status(400)
      .json({ error: "Profile and locale fields are required" });
  insert(
    "INSERT INTO settings (id, display_name, workspace_name, currency, week_starts_on, notifications, profile_picture) VALUES (1, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, workspace_name = excluded.workspace_name, currency = excluded.currency, week_starts_on = excluded.week_starts_on, notifications = excluded.notifications, profile_picture = excluded.profile_picture",
    [displayName, workspaceName, currency, weekStartsOn, notifications ? 1 : 0, profilePicture || ""],
  );
  res.json({
    displayName,
    workspaceName,
    currency,
    weekStartsOn,
    notifications: Boolean(notifications),
    profilePicture: profilePicture || "",
  });
});
app.post("/api/trades", (req, res) => {
  const { pair, setup, direction, result, tradedOn, notes, status } = req.body;
  if (!pair || !setup || !direction || !tradedOn)
    return res
      .status(400)
      .json({ error: "pair, setup, direction, and tradedOn are required" });
  insert(
    "INSERT INTO trades (pair, setup, direction, result_cents, traded_on, notes, trade_status) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [pair, setup, direction, cents(result), tradedOn, notes || "", status === "open" ? "open" : "closed"],
  );
  res
    .status(201)
    .json({ ...money(record("SELECT * FROM trades ORDER BY id DESC LIMIT 1")), status: status === "open" ? "open" : "closed" });
});
app.put("/api/trades/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM trades WHERE id = ?", [id]))
    return res.status(404).json({ error: "Trade not found" });
  const { pair, setup, direction, result, tradedOn, notes, status } = req.body;
  if (!pair || !setup || !direction || !tradedOn)
    return res
      .status(400)
      .json({ error: "pair, setup, direction, and tradedOn are required" });
  db.run(
    "UPDATE trades SET pair = ?, setup = ?, direction = ?, result_cents = ?, traded_on = ?, notes = ?, trade_status = ? WHERE id = ?",
    [pair, setup, direction, cents(result), tradedOn, notes || "", status === "open" ? "open" : "closed", id],
  );
  persist();
  res.json({ ...money(record("SELECT * FROM trades WHERE id = ?", [id])), status: status === "open" ? "open" : "closed" });
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
  const { name, target, targetDate, color } = req.body;
  if (!name || !target || !targetDate)
    return res
      .status(400)
      .json({ error: "name, target, and targetDate are required" });
  insert(
    "INSERT INTO goals (name, target_cents, current_cents, target_date, color) VALUES (?, ?, 0, ?, ?)",
    [name, cents(target), dateOnly(targetDate), color || "mint"],
  );
  res
    .status(201)
    .json(money(record("SELECT * FROM goals ORDER BY id DESC LIMIT 1")));
});
app.put("/api/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = record("SELECT * FROM goals WHERE id = ?", [id]);
  if (!existing) return res.status(404).json({ error: "Goal not found" });
  const { name, target, targetDate, color } = req.body;
  if (!name || !target || !targetDate)
    return res
      .status(400)
      .json({ error: "name, target, and targetDate are required" });
  db.run(
    "UPDATE goals SET name = ?, target_cents = ?, target_date = ?, color = ? WHERE id = ?",
    [
      name,
      cents(target),
      dateOnly(targetDate),
      color || existing.color || "mint",
      id,
    ],
  );
  persist();
  res.json(money(record("SELECT * FROM goals WHERE id = ?", [id])));
});
app.get("/api/goals/:id/funding", (req, res) => {
  const goalId = Number(req.params.id);
  if (!record("SELECT id FROM goals WHERE id = ?", [goalId]))
    return res.status(404).json({ error: "Goal not found" });
  res.json(rows("SELECT * FROM goal_contributions WHERE goal_id = ? ORDER BY funded_on DESC, id DESC", [goalId]).map(money));
});
app.post("/api/goals/:id/funding", (req, res) => {
  const goalId = Number(req.params.id);
  const { amount, fundedOn, note } = req.body;
  if (!record("SELECT id FROM goals WHERE id = ?", [goalId]))
    return res.status(404).json({ error: "Goal not found" });
  const amountCents = cents(amount);
  const fundedDate = dateOnly(fundedOn);
  if (!Number.isFinite(Number(amount)) || amountCents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fundedDate || ""))
    return res.status(400).json({ error: "A positive amount and valid fundedOn date are required" });
  db.run("BEGIN TRANSACTION");
  let contributionId;
  try {
    db.run("INSERT INTO goal_contributions (goal_id, amount_cents, funded_on, note) VALUES (?, ?, ?, ?)", [goalId, amountCents, fundedDate, String(note || "").trim()]);
    contributionId = record("SELECT last_insert_rowid() AS id").id;
    db.run("UPDATE goals SET current_cents = current_cents + ? WHERE id = ?", [amountCents, goalId]);
    db.run("COMMIT");
  } catch (error) {
    try { db.run("ROLLBACK"); } catch { /* The transaction may already have ended. */ }
    console.error("Could not record goal contribution:", error);
    return res.status(500).json({ error: "Could not record this goal contribution." });
  }
  try {
    persist();
  } catch (error) {
    console.error("Could not persist goal contribution:", error);
    const message = process.env.VERCEL
      ? "Goal funding needs a persistent managed database on Vercel; the local SQLite file cannot be saved there."
      : "The contribution was recorded in memory but could not be saved to the SQLite file.";
    return res.status(503).json({ error: message });
  }
  res.status(201).json({
    goal: money(record("SELECT * FROM goals WHERE id = ?", [goalId])),
    contribution: money(record("SELECT * FROM goal_contributions WHERE id = ?", [contributionId])),
  });
});
app.delete("/api/goals/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!record("SELECT id FROM goals WHERE id = ?", [id]))
    return res.status(404).json({ error: "Goal not found" });
  db.run("DELETE FROM goal_contributions WHERE goal_id = ?", [id]);
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
    [title, eventType, cents(amount), dateOnly(eventDate), notes || ""],
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
    [title, eventType, cents(amount), dateOnly(eventDate), notes || "", id],
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
