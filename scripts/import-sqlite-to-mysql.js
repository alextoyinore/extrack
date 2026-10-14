import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverDir = path.join(root, "server");
const SQL = await initSqlJs({
  locateFile: (file) => path.join(root, "node_modules", "sql.js", "dist", file),
});
const readDb = (name) => {
  const file = path.join(serverDir, name);
  if (!fs.existsSync(file)) throw new Error(`Missing source database: ${file}`);
  return new SQL.Database(fs.readFileSync(file));
};
const records = (db, table) => {
  const result = db.exec(`SELECT * FROM ${table}`)[0];
  return (result?.values || []).map((values) =>
    Object.fromEntries(result.columns.map((column, index) => [column, values[index]])),
  );
};
const asDate = (value) => value ? new Date(String(value).replace(" ", "T") + (String(value).includes("Z") ? "" : "Z")) : new Date();

const url = new URL(process.env.DATABASE_URL || "");
if (!url.hostname || !url.pathname || url.pathname === "/") {
  throw new Error("Set DATABASE_URL in .env before importing.");
}
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: decodeURIComponent(url.pathname.slice(1)),
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });
const authDb = readDb("auth.sqlite");
const workspaceDb = readDb("extrack.sqlite");

try {
  const existing = await prisma.$transaction([
    prisma.user.count(), prisma.session.count(), prisma.settings.count(),
    prisma.transaction.count(), prisma.asset.count(), prisma.trade.count(),
    prisma.goal.count(), prisma.goalContribution.count(), prisma.event.count(),
    prisma.cashflowIncome.count(), prisma.cashflowPlan.count(), prisma.cashflowItem.count(),
  ]);
  if (existing.some(Boolean)) {
    throw new Error("Target MySQL database is not empty. Import stopped to prevent duplicate data.");
  }

  await prisma.$transaction(async (tx) => {
    const users = records(authDb, "users");
    await tx.user.createMany({ data: users.map((row) => ({
      id: row.id, email: row.email, passwordHash: row.password_hash,
      createdAt: asDate(row.created_at),
    })) });
    const sessions = records(authDb, "sessions");
    if (sessions.length) await tx.session.createMany({ data: sessions.map((row) => ({
      tokenHash: row.token_hash, userId: row.user_id, expiresAt: BigInt(row.expires_at),
    })) });

    const userId = users[0]?.id;
    if (!userId) throw new Error("No user account found in auth.sqlite.");
    const scoped = (table) => records(workspaceDb, table).map((row) => ({ ...row, userId }));
    const settings = records(workspaceDb, "settings");
    if (settings.length) await tx.settings.createMany({ data: settings.map((r) => ({
      id: r.id, userId, displayName: r.display_name, workspaceName: r.workspace_name,
      currency: r.currency, weekStartsOn: r.week_starts_on,
      notifications: Boolean(r.notifications), profilePicture: r.profile_picture || "",
    })) });
    await tx.transaction.createMany({ data: scoped("transactions").map((r) => ({
      id: r.id, userId, kind: r.kind, label: r.label, category: r.category,
      amountCents: r.amount_cents, occurredOn: r.occurred_on,
      recurring: Boolean(r.recurring), createdAt: asDate(r.created_at),
    })) });
    await tx.asset.createMany({ data: scoped("assets").map((r) => ({
      id: r.id, userId, symbol: r.symbol, name: r.name, type: r.type,
      valueCents: r.value_cents, changePercent: r.change_percent, allocation: r.allocation,
      costBasisCents: r.cost_basis_cents, dayChangeCents: r.day_change_cents,
      createdAt: asDate(r.created_at),
    })) });
    await tx.trade.createMany({ data: scoped("trades").map((r) => ({
      id: r.id, userId, pair: r.pair, setup: r.setup, direction: r.direction,
      resultCents: r.result_cents, tradedOn: r.traded_on, notes: r.notes,
      tradeStatus: r.trade_status, createdAt: asDate(r.created_at),
    })) });
    await tx.goal.createMany({ data: scoped("goals").map((r) => ({
      id: r.id, userId, name: r.name, targetCents: r.target_cents,
      currentCents: r.current_cents, targetDate: r.target_date, color: r.color,
      createdAt: asDate(r.created_at),
    })) });
    await tx.goalContribution.createMany({ data: scoped("goal_contributions").map((r) => ({
      id: r.id, userId, goalId: r.goal_id, amountCents: r.amount_cents,
      fundedOn: r.funded_on, note: r.note, createdAt: asDate(r.created_at),
    })) });
    await tx.event.createMany({ data: scoped("events").map((r) => ({
      id: r.id, userId, title: r.title, eventType: r.event_type, amountCents: r.amount_cents,
      eventDate: r.event_date, notes: r.notes, source: r.source,
      createdAt: asDate(r.created_at),
    })) });
    await tx.cashflowIncome.createMany({ data: scoped("cashflow_incomes").map((r) => ({
      id: r.id, userId, name: r.name, expectedIncomeCents: r.expected_income_cents,
      periodStart: r.period_start, periodEnd: r.period_end,
      favoritePlanId: r.favorite_plan_id, createdAt: asDate(r.created_at),
    })) });
    await tx.cashflowPlan.createMany({ data: scoped("cashflow_plans").map((r) => ({
      id: r.id, userId, incomeId: r.income_id, name: r.name, periodStart: r.period_start,
      periodEnd: r.period_end, expectedIncomeCents: r.expected_income_cents,
      savingsTargetCents: r.savings_target_cents, isClosed: Boolean(r.is_closed),
      createdAt: asDate(r.created_at),
    })) });
    await tx.cashflowItem.createMany({ data: scoped("cashflow_items").map((r) => ({
      id: r.id, userId, planId: r.plan_id, label: r.label, category: r.category,
      plannedCents: r.planned_cents, spentCents: r.spent_cents, dueOn: r.due_on,
      status: r.status, createdAt: asDate(r.created_at),
    })) });
  }, { timeout: 30000 });

  console.log("SQLite data imported successfully. Source SQLite files were read only.");
} finally {
  authDb.close();
  workspaceDb.close();
  await prisma.$disconnect();
}
