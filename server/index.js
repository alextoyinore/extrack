import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { prisma } from "./prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 8787);
const scrypt = promisify(scryptCallback);
app.use(express.json({ limit: "2mb" }));

const cents = (value) => Math.round(Number(value || 0) * 100);
const dateOnly = (value) => {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : value;
};
const snake = (key) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const legacy = (row) => row && Object.fromEntries(Object.entries(row).filter(([key]) => key !== "userId").map(([key, value]) => [snake(key), value]));
const money = (row) => {
  if (!row) return row;
  const record = legacy(row);
  return {
    ...record,
    amount: (record.amount_cents || 0) / 100,
    value: (record.value_cents || 0) / 100,
    target: (record.target_cents || 0) / 100,
    current: (record.current_cents || 0) / 100,
    result: (record.result_cents || 0) / 100,
    recurring: Boolean(record.recurring),
  };
};
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const requestToken = (req) => {
  const cookie = String(req.headers.cookie || "").split(";").map((item) => item.trim()).find((item) => item.startsWith("extrack_session="));
  return cookie ? decodeURIComponent(cookie.slice("extrack_session=".length)) : "";
};
const setSessionCookie = (res, req, token, maxAge = 30 * 24 * 60 * 60) => {
  res.setHeader("Set-Cookie", `extrack_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure ? "; Secure" : ""}`);
};
const clearSessionCookie = (res, req) => setSessionCookie(res, req, "", 0);
const hashPassword = async (password) => {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
};
const verifyPassword = async (password, stored) => {
  const [saltHex, keyHex] = String(stored || "").split(":");
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
const authenticate = asyncRoute(async (req, res, next) => {
  const token = requestToken(req);
  const tokenHash = token && hashToken(token);
  const session = tokenHash ? await prisma.session.findUnique({ where: { tokenHash } }) : null;
  if (!session || Number(session.expiresAt) < Date.now()) {
    if (session) await prisma.session.delete({ where: { tokenHash } });
    clearSessionCookie(res, req);
    return res.status(401).json({ error: "Authentication required" });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { id: true, email: true } });
  if (!user) {
    clearSessionCookie(res, req);
    return res.status(401).json({ error: "Authentication required" });
  }
  req.user = user;
  req.sessionTokenHash = tokenHash;
  next();
});
const issueSession = async (userId, res, req) => {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt: BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
  setSessionCookie(res, req, token);
};

const upsertEventBySource = async (userId, { title, eventType, amount, eventDate, notes, source }, tx = prisma) => {
  const where = { userId, source };
  const data = { title, eventType, amountCents: cents(amount), eventDate: dateOnly(eventDate), notes: notes || "" };
  const existing = await tx.event.findFirst({ where, select: { id: true } });
  if (existing) return tx.event.update({ where: { id: existing.id }, data });
  return tx.event.create({ data: { ...where, ...data } });
};

const refreshAssetMetrics = async (userId, tx = prisma) => {
  const assets = await tx.asset.findMany({ where: { userId }, select: { id: true, valueCents: true, costBasisCents: true } });
  const total = assets.reduce((sum, asset) => sum + asset.valueCents, 0);
  for (const asset of assets) {
    const allocation = total ? (asset.valueCents / total) * 100 : 0;
    const changePercent = asset.costBasisCents ? ((asset.valueCents - asset.costBasisCents) / asset.costBasisCents) * 100 : 0;
    await tx.asset.update({ where: { id: asset.id }, data: { allocation, changePercent, dayChangeCents: asset.valueCents - asset.costBasisCents } });
  }
};

const cashflow = async (userId, planId, tx = prisma) => {
  const plan = await tx.cashflowPlan.findFirst({ where: { id: planId, userId }, include: { income: true, items: { orderBy: [{ dueOn: "asc" }, { id: "asc" }] } } });
  if (!plan) return null;
  const items = plan.items.map((item) => ({ ...legacy(item), planned: item.plannedCents / 100, spent: item.spentCents / 100 }));
  const unique = new Map();
  for (const item of items) {
    const key = `${item.label.trim().toLocaleLowerCase()}\u0000${item.category.trim().toLocaleLowerCase()}`;
    const current = unique.get(key) || { planned: 0, spent: 0 };
    current.planned = Math.max(current.planned, item.planned);
    if (item.status === "spent") current.spent = Math.max(current.spent, item.spent);
    unique.set(key, current);
  }
  const plannedExpenses = [...unique.values()].reduce((sum, item) => sum + item.planned, 0);
  const planSpent = [...unique.values()].reduce((sum, item) => sum + item.spent, 0);
  const reserved = [...unique.values()].reduce((sum, item) => sum + Math.max(0, item.planned - item.spent), 0);
  const closed = plan.isClosed;
  const income = plan.income;
  const expectedIncome = closed ? 0 : (income?.expectedIncomeCents ?? plan.expectedIncomeCents) / 100;
  const savingsTarget = closed ? 0 : plan.savingsTargetCents / 100;
  let spentAcrossIncome = planSpent;
  if (income) {
    const activePlanIds = (await tx.cashflowPlan.findMany({ where: { userId, incomeId: income.id, isClosed: false }, select: { id: true } })).map((entry) => entry.id);
    const familyItems = await tx.cashflowItem.findMany({ where: { userId, planId: { in: activePlanIds }, status: "spent" }, select: { label: true, category: true, spentCents: true } });
    const family = new Map();
    for (const item of familyItems) {
      const key = `${item.label.trim().toLocaleLowerCase()}\u0000${item.category.trim().toLocaleLowerCase()}`;
      family.set(key, Math.max(family.get(key) || 0, item.spentCents));
    }
    spentAcrossIncome = [...family.values()].reduce((sum, value) => sum + value, 0) / 100;
  }
  const { income: _income, items: _items, ...planFields } = plan;
  return {
    ...legacy(planFields), is_closed: closed, incomeName: income?.name || plan.name,
    expectedIncome, savingsTarget, items,
    plannedExpenses: closed ? 0 : plannedExpenses,
    spent: closed ? planSpent : spentAcrossIncome,
    planSpent, reserved: closed ? 0 : reserved,
    remaining: expectedIncome - (closed ? 0 : plannedExpenses) - savingsTarget,
    available: closed ? 0 : expectedIncome - spentAcrossIncome - savingsTarget,
    saved: savingsTarget,
  };
};

const syncPlanCalendar = async (userId, planId, tx = prisma) => {
  const plan = await tx.cashflowPlan.findFirst({ where: { id: planId, userId }, include: { income: true, items: true } });
  if (!plan) return;
  const income = plan.income;
  if (income) await upsertEventBySource(userId, {
    title: income.name, eventType: "Income", amount: income.expectedIncomeCents / 100,
    eventDate: income.periodStart, notes: "Expected income", source: `cashflow-income:${income.id}`,
  }, tx);
  for (const item of plan.items) await upsertEventBySource(userId, {
    title: item.label, eventType: "Expense", amount: item.plannedCents / 100,
    eventDate: item.dueOn, notes: `${item.category} · ${plan.name}`, source: `cashflow-item:${item.id}`,
  }, tx);
  const events = await tx.event.findMany({ where: { userId, source: { startsWith: "cashflow-item:" } }, select: { id: true, source: true } });
  const itemIds = new Set((await tx.cashflowItem.findMany({ where: { userId }, select: { id: true } })).map((item) => `cashflow-item:${item.id}`));
  const staleIds = events.filter((event) => !itemIds.has(event.source)).map((event) => event.id);
  if (staleIds.length) await tx.event.deleteMany({ where: { userId, id: { in: staleIds } } });
};

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return res.status(400).json({ error: "Enter a valid email and a password with at least 8 characters." });
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return res.status(409).json({ error: "An account with that email already exists." });
  try {
    const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password) }, select: { id: true, email: true } });
    await issueSession(user.id, res, req);
    res.status(201).json({ user });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "An account with that email already exists." });
    throw error;
  }
}));
app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(String(req.body.password || ""), user.passwordHash))) return res.status(401).json({ error: "Email or password is incorrect." });
  await issueSession(user.id, res, req);
  res.json({ user: { id: user.id, email: user.email } });
}));
app.get("/api/auth/session", asyncRoute(async (req, res) => {
  const token = requestToken(req);
  const session = token ? await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, email: true } } } }) : null;
  res.json({ user: session && Number(session.expiresAt) >= Date.now() ? session.user : null });
}));
app.post("/api/auth/logout", asyncRoute(async (req, res) => {
  const token = requestToken(req);
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  clearSessionCookie(res, req);
  res.status(204).end();
}));
app.use("/api", authenticate);

app.post("/api/debts", asyncRoute(async (req, res) => {
  const { name, lender = "", principal, interestRate = 0, startedOn } = req.body;
  if (!String(name || "").trim() || !startedOn || !Number.isFinite(Number(principal)) || Number(principal) <= 0 || !Number.isFinite(Number(interestRate)) || Number(interestRate) < 0) return res.status(400).json({ error: "Enter a debt name, a positive original amount, a valid interest rate, and a start date." });
  const loan = await prisma.loan.create({ data: { userId: req.user.id, name: String(name).trim(), lender: String(lender).trim(), principalCents: cents(principal), interestRate: Number(interestRate), startedOn: dateOnly(startedOn) }, include: { repaymentPlans: true, payments: true } });
  res.status(201).json({ ...legacy(loan), principal: loan.principalCents / 100, repayment_plans: [], payments: [] });
}));
app.post("/api/debts/:loanId/plans", asyncRoute(async (req, res) => {
  const loanId = Number(req.params.loanId);
  if (!await prisma.loan.findFirst({ where: { id: loanId, userId: req.user.id }, select: { id: true } })) return res.status(404).json({ error: "Debt not found" });
  const { name, amount, frequency, nextDueOn } = req.body;
  if (!String(name || "").trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !["weekly", "biweekly", "monthly", "quarterly", "annually", "one-time"].includes(frequency) || !nextDueOn) return res.status(400).json({ error: "Enter a plan name, payment amount, frequency, and next due date." });
  const plan = await prisma.loanRepaymentPlan.create({ data: { userId: req.user.id, loanId, name: String(name).trim(), amountCents: cents(amount), frequency, nextDueOn: dateOnly(nextDueOn) } });
  res.status(201).json({ ...legacy(plan), amount: plan.amountCents / 100 });
}));
app.post("/api/debts/:loanId/payments", asyncRoute(async (req, res) => {
  const loanId = Number(req.params.loanId);
  if (!await prisma.loan.findFirst({ where: { id: loanId, userId: req.user.id }, select: { id: true } })) return res.status(404).json({ error: "Debt not found" });
  const { amount, paidOn, note = "", planId } = req.body;
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !paidOn) return res.status(400).json({ error: "Enter a positive payment amount and payment date." });
  const parsedPlanId = planId ? Number(planId) : null;
  if (parsedPlanId && !await prisma.loanRepaymentPlan.findFirst({ where: { id: parsedPlanId, loanId, userId: req.user.id }, select: { id: true } })) return res.status(400).json({ error: "Choose a repayment plan belonging to this debt." });
  const payment = await prisma.loanPayment.create({ data: { userId: req.user.id, loanId, planId: parsedPlanId, amountCents: cents(amount), paidOn: dateOnly(paidOn), note: String(note).trim() } });
  res.status(201).json({ ...legacy(payment), amount: payment.amountCents / 100 });
}));
app.patch("/api/debts/:debtId/plans/:planId", asyncRoute(async (req, res) => {
  const debtId = Number(req.params.debtId);
  const planId = Number(req.params.planId);
  const existing = await prisma.loanRepaymentPlan.findFirst({ where: { id: planId, loanId: debtId, userId: req.user.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Repayment plan not found for this debt" });
  const { name, amount, frequency, nextDueOn } = req.body;
  if (!String(name || "").trim() || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !["weekly", "biweekly", "monthly", "quarterly", "annually", "one-time"].includes(frequency) || !nextDueOn) return res.status(400).json({ error: "Enter a plan name, payment amount, frequency, and next due date." });
  const plan = await prisma.loanRepaymentPlan.update({ where: { id: planId }, data: { name: String(name).trim(), amountCents: cents(amount), frequency, nextDueOn: dateOnly(nextDueOn) } });
  res.json({ ...legacy(plan), amount: plan.amountCents / 100 });
}));
app.patch("/api/debts/:debtId/payments/:paymentId", asyncRoute(async (req, res) => {
  const debtId = Number(req.params.debtId);
  const paymentId = Number(req.params.paymentId);
  const existing = await prisma.loanPayment.findFirst({ where: { id: paymentId, loanId: debtId, userId: req.user.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: "Payment not found for this debt" });
  const { amount, paidOn, note = "", planId } = req.body;
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0 || !paidOn) return res.status(400).json({ error: "Enter a positive payment amount and payment date." });
  const parsedPlanId = planId ? Number(planId) : null;
  if (parsedPlanId && !await prisma.loanRepaymentPlan.findFirst({ where: { id: parsedPlanId, loanId: debtId, userId: req.user.id }, select: { id: true } })) return res.status(400).json({ error: "Choose a repayment plan belonging to this debt." });
  const payment = await prisma.loanPayment.update({ where: { id: paymentId }, data: { amountCents: cents(amount), paidOn: dateOnly(paidOn), note: String(note).trim(), planId: parsedPlanId } });
  res.json({ ...legacy(payment), amount: payment.amountCents / 100 });
}));

app.post("/api/auth/password", asyncRoute(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!(await verifyPassword(String(currentPassword || ""), user.passwordHash))) return res.status(400).json({ error: "Current password is incorrect." });
  if (String(newPassword || "").length < 8) return res.status(400).json({ error: "New password must have at least 8 characters." });
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: await hashPassword(String(newPassword || "")) } }),
    prisma.session.deleteMany({ where: { userId: req.user.id, tokenHash: { not: req.sessionTokenHash } } }),
  ]);
  res.json({ success: true });
}));

app.get("/api/bootstrap", asyncRoute(async (req, res) => {
  const userId = req.user.id;
  await refreshAssetMetrics(userId);
  const incomes = await prisma.cashflowIncome.findMany({ where: { userId } });
  for (const income of incomes) await upsertEventBySource(userId, {
    title: income.name, eventType: "Income", amount: income.expectedIncomeCents / 100,
    eventDate: income.periodStart, notes: "Expected income", source: `cashflow-income:${income.id}`,
  });
  const planIds = (await prisma.cashflowPlan.findMany({ where: { userId }, select: { id: true } })).map(({ id }) => id);
  for (const id of planIds) await syncPlanCalendar(userId, id);
  const settings = await prisma.settings.findUnique({ where: { userId } });
  const plans = await prisma.cashflowPlan.findMany({ where: { userId }, orderBy: [{ periodStart: "desc" }, { id: "desc" }] });
  res.json({
    transactions: (await prisma.transaction.findMany({ where: { userId }, orderBy: [{ occurredOn: "desc" }, { id: "desc" }] })).map(money),
    assets: (await prisma.asset.findMany({ where: { userId }, orderBy: { valueCents: "desc" } })).map((asset) => ({ ...money(asset), costBasis: asset.costBasisCents / 100, dayChange: asset.dayChangeCents / 100, changePercent: asset.changePercent })),
    trades: (await prisma.trade.findMany({ where: { userId }, orderBy: [{ tradedOn: "desc" }, { id: "desc" }] })).map((trade) => ({ ...money(trade), status: trade.tradeStatus || "closed" })),
    goals: (await prisma.goal.findMany({ where: { userId }, orderBy: { targetDate: "asc" } })).map(money),
    events: (await prisma.event.findMany({ where: { userId }, orderBy: [{ eventDate: "asc" }, { id: "asc" }] })).map(money),
    cashflowPlans: (await Promise.all(plans.map((plan) => cashflow(userId, plan.id)))).filter(Boolean),
    cashflowIncomes: incomes.sort((a, b) => b.periodStart.localeCompare(a.periodStart) || b.id - a.id).map((income) => ({ ...legacy(income), expectedIncome: income.expectedIncomeCents / 100 })),
    debts: await Promise.all((await prisma.loan.findMany({ where: { userId }, orderBy: [{ startedOn: "desc" }, { id: "desc" }], include: { repaymentPlans: { orderBy: [{ nextDueOn: "asc" }, { id: "asc" }] }, payments: { orderBy: [{ paidOn: "desc" }, { id: "desc" }] } } })).map(async (loan) => ({
      ...legacy(loan), principal: loan.principalCents / 100,
      repayment_plans: loan.repaymentPlans.map((plan) => ({ ...legacy(plan), amount: plan.amountCents / 100 })),
      payments: loan.payments.map((payment) => ({ ...legacy(payment), amount: payment.amountCents / 100 })),
    }))),
    settings: settings ? {
      id: settings.id, displayName: settings.displayName, workspaceName: settings.workspaceName,
      currency: settings.currency, weekStartsOn: settings.weekStartsOn,
      notifications: Boolean(settings.notifications), profilePicture: settings.profilePicture,
    } : { displayName: "Alex Morgan", workspaceName: "Personal workspace", currency: "USD", weekStartsOn: "Sunday", notifications: true, profilePicture: "" },
  });
}));

app.patch("/api/cashflow/incomes/:incomeId/favorite", asyncRoute(async (req, res) => {
  const incomeId = Number(req.params.incomeId);
  const planId = Number(req.body.planId);
  const income = await prisma.cashflowIncome.findFirst({ where: { id: incomeId, userId: req.user.id } });
  if (!income) return res.status(404).json({ error: "Income not found" });
  if (!await prisma.cashflowPlan.findFirst({ where: { id: planId, incomeId, userId: req.user.id, isClosed: false }, select: { id: true } })) return res.status(400).json({ error: "Choose a plan belonging to this income" });
  await prisma.cashflowIncome.update({ where: { id: incomeId }, data: { favoritePlanId: planId } });
  res.json({ incomeId, favorite_plan_id: planId });
}));
app.patch("/api/cashflow/plans/:planId/closed", asyncRoute(async (req, res) => {
  const planId = Number(req.params.planId);
  const plan = await prisma.cashflowPlan.findFirst({ where: { id: planId, userId: req.user.id } });
  if (!plan) return res.status(404).json({ error: "Plan not found" });
  const isClosed = Boolean(req.body.isClosed);
  await prisma.$transaction(async (tx) => {
    await tx.cashflowPlan.update({ where: { id: planId }, data: { isClosed } });
    if (isClosed) {
      const income = plan.incomeId ? await tx.cashflowIncome.findFirst({ where: { id: plan.incomeId, userId: req.user.id } }) : null;
      if (income?.favoritePlanId === planId) {
        const replacement = await tx.cashflowPlan.findFirst({ where: { incomeId: plan.incomeId, userId: req.user.id, id: { not: planId }, isClosed: false }, orderBy: { id: "asc" }, select: { id: true } });
        await tx.cashflowIncome.update({ where: { id: income.id }, data: { favoritePlanId: replacement?.id ?? null } });
      }
      const unspent = await tx.cashflowItem.findMany({ where: { planId, userId: req.user.id, status: { not: "spent" } }, select: { id: true } });
      if (unspent.length) await tx.event.deleteMany({ where: { userId: req.user.id, source: { in: unspent.map(({ id }) => `cashflow-item:${id}`) } } });
    } else await syncPlanCalendar(req.user.id, planId, tx);
  });
  res.json(await cashflow(req.user.id, planId));
}));
app.post("/api/cashflow/incomes", asyncRoute(async (req, res) => {
  const { name, expectedIncome, periodStart, periodEnd } = req.body;
  if (!name || !periodStart || !periodEnd || !Number.isFinite(Number(expectedIncome)) || Number(expectedIncome) <= 0) return res.status(400).json({ error: "Name, expected income, and period dates are required" });
  const income = await prisma.cashflowIncome.create({ data: { userId: req.user.id, name: name.trim(), expectedIncomeCents: cents(expectedIncome), periodStart: dateOnly(periodStart), periodEnd: dateOnly(periodEnd) } });
  await upsertEventBySource(req.user.id, { title: income.name, eventType: "Income", amount: income.expectedIncomeCents / 100, eventDate: income.periodStart, notes: "Expected income", source: `cashflow-income:${income.id}` });
  res.status(201).json({ ...legacy(income), expectedIncome: income.expectedIncomeCents / 100 });
}));
app.patch("/api/cashflow/incomes/:incomeId", asyncRoute(async (req, res) => {
  const incomeId = Number(req.params.incomeId);
  const existing = await prisma.cashflowIncome.findFirst({ where: { id: incomeId, userId: req.user.id } });
  if (!existing) return res.status(404).json({ error: "Income not found" });
  const { name, expectedIncome, periodStart, periodEnd } = req.body;
  if (!name || !periodStart || !periodEnd || !Number.isFinite(Number(expectedIncome)) || Number(expectedIncome) <= 0) return res.status(400).json({ error: "Name, expected income, and period dates are required" });
  const updated = await prisma.$transaction(async (tx) => {
    const income = await tx.cashflowIncome.update({ where: { id: incomeId }, data: { name: name.trim(), expectedIncomeCents: cents(expectedIncome), periodStart: dateOnly(periodStart), periodEnd: dateOnly(periodEnd) } });
    await tx.cashflowPlan.updateMany({ where: { incomeId, userId: req.user.id }, data: { expectedIncomeCents: cents(expectedIncome), periodStart: dateOnly(periodStart), periodEnd: dateOnly(periodEnd) } });
    await upsertEventBySource(req.user.id, { title: name.trim(), eventType: "Income", amount: Number(expectedIncome), eventDate: dateOnly(periodStart), notes: "Expected income", source: `cashflow-income:${incomeId}` }, tx);
    return income;
  });
  res.json({ ...legacy(updated), expectedIncome: Number(expectedIncome) });
}));
app.post("/api/cashflow/plans", asyncRoute(async (req, res) => {
  const { incomeId, name, savingsTarget } = req.body;
  const income = await prisma.cashflowIncome.findFirst({ where: { id: Number(incomeId), userId: req.user.id } });
  if (!income || !name) return res.status(400).json({ error: "Select an income and name this plan" });
  const plan = await prisma.cashflowPlan.create({ data: { userId: req.user.id, incomeId: income.id, name: name.trim(), periodStart: income.periodStart, periodEnd: income.periodEnd, expectedIncomeCents: income.expectedIncomeCents, savingsTargetCents: cents(savingsTarget) } });
  await syncPlanCalendar(req.user.id, plan.id);
  res.status(201).json(await cashflow(req.user.id, plan.id));
}));
app.patch("/api/cashflow/plans/:planId", asyncRoute(async (req, res) => {
  const planId = Number(req.params.planId);
  const existing = await prisma.cashflowPlan.findFirst({ where: { id: planId, userId: req.user.id } });
  if (!existing) return res.status(404).json({ error: "Plan not found" });
  const { name, savingsTarget } = req.body;
  if (!name) return res.status(400).json({ error: "Plan name is required" });
  await prisma.cashflowPlan.update({ where: { id: planId }, data: { name: name.trim(), savingsTargetCents: cents(savingsTarget ?? existing.savingsTargetCents / 100) } });
  await syncPlanCalendar(req.user.id, planId);
  res.json(await cashflow(req.user.id, planId));
}));

app.post("/api/cashflow/plans/:planId/items", asyncRoute(async (req, res) => {
  const { label, category, planned, spent, dueOn, status } = req.body;
  const planId = Number(req.params.planId);
  const plan = await prisma.cashflowPlan.findFirst({ where: { id: planId, userId: req.user.id } });
  if (!plan || !label || !category || !dueOn) return res.status(400).json({ error: "plan, label, category, and dueOn are required" });
  if (plan.isClosed) return res.status(409).json({ error: "Reopen this plan before adding expenses" });
  const duplicates = await prisma.cashflowItem.findMany({ where: { planId, userId: req.user.id }, select: { label: true, category: true } });
  if (duplicates.some((item) => item.label.trim().toLowerCase() === label.trim().toLowerCase() && item.category.trim().toLowerCase() === category.trim().toLowerCase())) return res.status(409).json({ error: "An expense with this name and category already exists in this plan" });
  try {
    await prisma.$transaction(async (tx) => {
      const item = await tx.cashflowItem.create({ data: { userId: req.user.id, planId, label: label.trim(), category: category.trim(), plannedCents: cents(planned), spentCents: status === "spent" ? cents(spent ?? planned) : 0, dueOn: dateOnly(dueOn), status: status === "spent" ? "spent" : "planned" } });
      await syncPlanCalendar(req.user.id, planId, tx);
      return item;
    });
  } catch (error) {
    if (error?.code === "P2002") return res.status(409).json({ error: "An expense with this name and category already exists in this plan" });
    throw error;
  }
  res.status(201).json(await cashflow(req.user.id, planId));
}));
app.patch("/api/cashflow/items/:itemId", asyncRoute(async (req, res) => {
  const { label, category, planned, spent, dueOn, status } = req.body;
  const item = await prisma.cashflowItem.findFirst({ where: { id: Number(req.params.itemId), userId: req.user.id } });
  if (!item) return res.status(404).json({ error: "Item not found" });
  const sourcePlan = await prisma.cashflowPlan.findFirst({ where: { id: item.planId, userId: req.user.id } });
  if (sourcePlan?.isClosed && (status !== "spent" || label !== undefined || category !== undefined || planned !== undefined || dueOn !== undefined)) return res.status(409).json({ error: "Reopen this plan before editing its expenses" });
  const nextLabel = String(label ?? item.label).trim();
  const nextCategory = String(category ?? item.category).trim();
  const siblings = await prisma.cashflowItem.findMany({ where: { planId: item.planId, userId: req.user.id, id: { not: item.id } }, select: { label: true, category: true } });
  if (siblings.some((candidate) => candidate.label.trim().toLowerCase() === nextLabel.toLowerCase() && candidate.category.trim().toLowerCase() === nextCategory.toLowerCase())) return res.status(409).json({ error: "An expense with this name and category already exists in this plan" });
  const nextStatus = status === "spent" || status === "planned" ? status : item.status;
  const nextPlannedCents = planned !== undefined ? cents(planned) : item.plannedCents;
  const nextSpentCents = nextStatus === "planned" ? 0 : spent !== undefined ? cents(spent) : item.status === "spent" ? item.spentCents : nextPlannedCents;
  const dueDate = dueOn !== undefined ? dateOnly(dueOn) : item.dueOn;
  const incomeId = sourcePlan?.incomeId;
  let responsePlanId = item.planId;
  await prisma.$transaction(async (tx) => {
    await tx.cashflowItem.update({ where: { id: item.id }, data: { label: nextLabel, category: nextCategory, plannedCents: nextPlannedCents, spentCents: nextSpentCents, dueOn: dueDate, status: nextStatus } });
    if (incomeId) {
      const activePlanIds = (await tx.cashflowPlan.findMany({ where: { userId: req.user.id, incomeId, isClosed: false }, select: { id: true } })).map((entry) => entry.id);
      const linkedCandidates = await tx.cashflowItem.findMany({ where: { userId: req.user.id, id: { not: item.id }, planId: { in: activePlanIds } } });
      const linked = linkedCandidates.filter((candidate) => candidate.label.trim().toLowerCase() === nextLabel.toLowerCase() && candidate.category.trim().toLowerCase() === nextCategory.toLowerCase());
      for (const duplicate of linked) await tx.cashflowItem.update({ where: { id: duplicate.id }, data: { status: nextStatus, spentCents: nextSpentCents } });
      if (nextStatus === "spent") {
        const income = await tx.cashflowIncome.findFirst({ where: { id: incomeId, userId: req.user.id } });
        const favoriteId = income?.favoritePlanId;
        if (favoriteId && favoriteId !== item.planId && await tx.cashflowPlan.findFirst({ where: { id: favoriteId, userId: req.user.id, isClosed: false }, select: { id: true } })) {
          const target = await tx.cashflowItem.findFirst({ where: { userId: req.user.id, planId: favoriteId, label: nextLabel, category: nextCategory } });
          if (target) await tx.cashflowItem.update({ where: { id: target.id }, data: { status: "spent", spentCents: nextSpentCents, dueOn: dueDate } });
          else await tx.cashflowItem.create({ data: { userId: req.user.id, planId: favoriteId, label: nextLabel, category: nextCategory, plannedCents: nextPlannedCents, spentCents: nextSpentCents, dueOn: dueDate, status: "spent" } });
          await tx.cashflowItem.delete({ where: { id: item.id } });
          await tx.event.deleteMany({ where: { userId: req.user.id, source: `cashflow-item:${item.id}` } });
          responsePlanId = favoriteId;
        }
      }
    }
    await syncPlanCalendar(req.user.id, item.planId, tx);
    if (responsePlanId !== item.planId) await syncPlanCalendar(req.user.id, responsePlanId, tx);
  });
  res.json(await cashflow(req.user.id, responsePlanId));
}));
app.delete("/api/cashflow/items/:itemId", asyncRoute(async (req, res) => {
  const item = await prisma.cashflowItem.findFirst({ where: { id: Number(req.params.itemId), userId: req.user.id } });
  if (!item) return res.status(404).json({ error: "Item not found" });
  if (await prisma.cashflowPlan.findFirst({ where: { id: item.planId, userId: req.user.id, isClosed: true }, select: { id: true } })) return res.status(409).json({ error: "Reopen this plan before deleting its expenses" });
  await prisma.$transaction([
    prisma.cashflowItem.delete({ where: { id: item.id } }),
    prisma.event.deleteMany({ where: { userId: req.user.id, source: `cashflow-item:${item.id}` } }),
  ]);
  res.json(await cashflow(req.user.id, item.planId));
}));
app.post("/api/cashflow/items/:itemId/transfer", asyncRoute(async (req, res) => {
  const item = await prisma.cashflowItem.findFirst({ where: { id: Number(req.params.itemId), userId: req.user.id } });
  if (!item) return res.status(404).json({ error: "Expense not found" });
  const sourcePlan = await prisma.cashflowPlan.findFirst({ where: { id: item.planId, userId: req.user.id } });
  const destinationPlanId = Number(req.body.destinationPlanId);
  const destinationPlan = await prisma.cashflowPlan.findFirst({ where: { id: destinationPlanId, userId: req.user.id } });
  const mode = req.body.mode;
  if (!sourcePlan || !destinationPlan || sourcePlan.incomeId !== destinationPlan.incomeId) return res.status(400).json({ error: "Choose a plan attached to the same income" });
  if (sourcePlan.id === destinationPlan.id) return res.status(400).json({ error: "Choose a different destination plan" });
  if (sourcePlan.isClosed || destinationPlan.isClosed) return res.status(409).json({ error: "Reopen both plans before copying or moving expenses" });
  if (mode !== "copy" && mode !== "move") return res.status(400).json({ error: "Choose whether to copy or move the expense" });
  const dupes = await prisma.cashflowItem.findMany({ where: { planId: destinationPlanId, userId: req.user.id }, select: { label: true, category: true } });
  if (dupes.some((candidate) => candidate.label.trim().toLowerCase() === item.label.trim().toLowerCase() && candidate.category.trim().toLowerCase() === item.category.trim().toLowerCase())) return res.status(409).json({ error: "An expense with this name and category already exists in the destination plan" });
  await prisma.$transaction(async (tx) => {
    await tx.cashflowItem.create({ data: { userId: req.user.id, planId: destinationPlanId, label: item.label, category: item.category, plannedCents: item.plannedCents, spentCents: item.spentCents, dueOn: item.dueOn, status: item.status } });
    if (mode === "move") {
      await tx.cashflowItem.delete({ where: { id: item.id } });
      await tx.event.deleteMany({ where: { userId: req.user.id, source: `cashflow-item:${item.id}` } });
    }
    await syncPlanCalendar(req.user.id, destinationPlanId, tx);
    if (mode === "move") await syncPlanCalendar(req.user.id, sourcePlan.id, tx);
  });
  res.json({ mode, sourcePlanId: sourcePlan.id, destinationPlanId });
}));

app.post("/api/transactions", asyncRoute(async (req, res) => {
  const { kind, label, category, amount, occurredOn, recurring } = req.body;
  if (!["income", "expense"].includes(kind) || !label || !category || !occurredOn) return res.status(400).json({ error: "kind, label, category, and occurredOn are required" });
  const row = await prisma.transaction.create({ data: { userId: req.user.id, kind, label, category, amountCents: cents(amount), occurredOn: dateOnly(occurredOn), recurring: Boolean(recurring) } });
  res.status(201).json(money(row));
}));
const assetResponse = (asset) => asset && ({ ...money(asset), costBasis: asset.costBasisCents / 100, dayChange: asset.dayChangeCents / 100, changePercent: asset.changePercent });
app.post("/api/assets", asyncRoute(async (req, res) => {
  const { symbol, name, type, value, costBasis, dayChange, changePercent, allocation } = req.body;
  if (!symbol || !name || !type) return res.status(400).json({ error: "symbol, name, and type are required" });
  const row = await prisma.asset.create({ data: { userId: req.user.id, symbol, name, type, valueCents: cents(value), costBasisCents: cents(costBasis), dayChangeCents: cents(dayChange), changePercent: Number(changePercent || 0), allocation: Number(allocation || 0) } });
  await refreshAssetMetrics(req.user.id);
  res.status(201).json(assetResponse(await prisma.asset.findFirst({ where: { id: row.id, userId: req.user.id } })));
}));
app.put("/api/assets/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.asset.findFirst({ where: { id, userId: req.user.id } });
  if (!existing) return res.status(404).json({ error: "Asset not found" });
  const { symbol, name, type, value, costBasis, dayChange, changePercent, allocation } = req.body;
  if (!symbol || !name || !type) return res.status(400).json({ error: "symbol, name, and type are required" });
  await prisma.asset.update({ where: { id }, data: { symbol, name, type, valueCents: cents(value), costBasisCents: cents(costBasis ?? existing.costBasisCents / 100), dayChangeCents: cents(dayChange ?? existing.dayChangeCents / 100), changePercent: Number(changePercent || 0), allocation: Number(allocation || 0) } });
  await refreshAssetMetrics(req.user.id);
  res.json(assetResponse(await prisma.asset.findFirst({ where: { id, userId: req.user.id } })));
}));
app.delete("/api/assets/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const result = await prisma.asset.deleteMany({ where: { id, userId: req.user.id } });
  if (!result.count) return res.status(404).json({ error: "Asset not found" });
  await refreshAssetMetrics(req.user.id);
  res.status(204).end();
}));
app.put("/api/settings", asyncRoute(async (req, res) => {
  const { displayName, workspaceName, currency, weekStartsOn, notifications, profilePicture } = req.body;
  if (!displayName || !workspaceName || !currency || !weekStartsOn) return res.status(400).json({ error: "Profile and locale fields are required" });
  const data = { displayName, workspaceName, currency, weekStartsOn, notifications: Boolean(notifications), profilePicture: profilePicture || "" };
  const settings = await prisma.settings.upsert({ where: { userId: req.user.id }, create: { userId: req.user.id, ...data }, update: data });
  res.json({ ...legacy(settings), notifications: settings.notifications });
}));
app.post("/api/trades", asyncRoute(async (req, res) => {
  const { pair, setup, direction, result, tradedOn, notes, status } = req.body;
  if (!pair || !setup || !direction || !tradedOn) return res.status(400).json({ error: "pair, setup, direction, and tradedOn are required" });
  const trade = await prisma.trade.create({ data: { userId: req.user.id, pair, setup, direction, resultCents: cents(result), tradedOn: dateOnly(tradedOn), notes: notes || "", tradeStatus: status === "open" ? "open" : "closed" } });
  res.status(201).json({ ...money(trade), status: trade.tradeStatus });
}));
app.put("/api/trades/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!await prisma.trade.findFirst({ where: { id, userId: req.user.id }, select: { id: true } })) return res.status(404).json({ error: "Trade not found" });
  const { pair, setup, direction, result, tradedOn, notes, status } = req.body;
  if (!pair || !setup || !direction || !tradedOn) return res.status(400).json({ error: "pair, setup, direction, and tradedOn are required" });
  const row = await prisma.trade.update({ where: { id }, data: { pair, setup, direction, resultCents: cents(result), tradedOn: dateOnly(tradedOn), notes: notes || "", tradeStatus: status === "open" ? "open" : "closed" } });
  res.json({ ...money(row), status: row.tradeStatus });
}));
app.delete("/api/trades/:id", asyncRoute(async (req, res) => {
  const result = await prisma.trade.deleteMany({ where: { id: Number(req.params.id), userId: req.user.id } });
  if (!result.count) return res.status(404).json({ error: "Trade not found" });
  res.status(204).end();
}));
app.post("/api/goals", asyncRoute(async (req, res) => {
  const { name, target, targetDate, color } = req.body;
  if (!name || !target || !targetDate) return res.status(400).json({ error: "name, target, and targetDate are required" });
  const goal = await prisma.goal.create({ data: { userId: req.user.id, name, targetCents: cents(target), currentCents: 0, targetDate: dateOnly(targetDate), color: color || "mint" } });
  res.status(201).json(money(goal));
}));
app.put("/api/goals/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.goal.findFirst({ where: { id, userId: req.user.id } });
  if (!existing) return res.status(404).json({ error: "Goal not found" });
  const { name, target, targetDate, color } = req.body;
  if (!name || !target || !targetDate) return res.status(400).json({ error: "name, target, and targetDate are required" });
  res.json(money(await prisma.goal.update({ where: { id }, data: { name, targetCents: cents(target), targetDate: dateOnly(targetDate), color: color || existing.color || "mint" } })));
}));
app.get("/api/goals/:id/funding", asyncRoute(async (req, res) => {
  const goalId = Number(req.params.id);
  if (!await prisma.goal.findFirst({ where: { id: goalId, userId: req.user.id }, select: { id: true } })) return res.status(404).json({ error: "Goal not found" });
  res.json((await prisma.goalContribution.findMany({ where: { goalId, userId: req.user.id }, orderBy: [{ fundedOn: "desc" }, { id: "desc" }] })).map(money));
}));
app.post("/api/goals/:id/funding", asyncRoute(async (req, res) => {
  const goalId = Number(req.params.id);
  const { amount, fundedOn, note } = req.body;
  const goal = await prisma.goal.findFirst({ where: { id: goalId, userId: req.user.id }, select: { id: true } });
  if (!goal) return res.status(404).json({ error: "Goal not found" });
  const amountCents = cents(amount);
  const fundedDate = dateOnly(fundedOn);
  if (!Number.isFinite(Number(amount)) || amountCents <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fundedDate || "")) return res.status(400).json({ error: "A positive amount and valid fundedOn date are required" });
  const result = await prisma.$transaction(async (tx) => {
    const contribution = await tx.goalContribution.create({ data: { userId: req.user.id, goalId, amountCents, fundedOn: fundedDate, note: String(note || "").trim() } });
    const updatedGoal = await tx.goal.update({ where: { id: goalId }, data: { currentCents: { increment: amountCents } } });
    return { contribution, goal: updatedGoal };
  });
  res.status(201).json({ goal: money(result.goal), contribution: money(result.contribution) });
}));
app.delete("/api/goals/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  const result = await prisma.goal.deleteMany({ where: { id, userId: req.user.id } });
  if (!result.count) return res.status(404).json({ error: "Goal not found" });
  res.status(204).end();
}));
app.post("/api/events", asyncRoute(async (req, res) => {
  const { title, eventType, amount, eventDate, notes } = req.body;
  if (!title || !eventType || !eventDate) return res.status(400).json({ error: "title, eventType, and eventDate are required" });
  const event = await prisma.event.create({ data: { userId: req.user.id, title, eventType, amountCents: cents(amount), eventDate: dateOnly(eventDate), notes: notes || "" } });
  res.status(201).json(money(event));
}));
app.put("/api/events/:id", asyncRoute(async (req, res) => {
  const id = Number(req.params.id);
  if (!await prisma.event.findFirst({ where: { id, userId: req.user.id }, select: { id: true } })) return res.status(404).json({ error: "Event not found" });
  const { title, eventType, amount, eventDate, notes } = req.body;
  if (!title || !eventType || !eventDate) return res.status(400).json({ error: "title, eventType, and eventDate are required" });
  const event = await prisma.event.update({ where: { id }, data: { title, eventType, amountCents: cents(amount), eventDate: dateOnly(eventDate), notes: notes || "" } });
  res.json(money(event));
}));
app.delete("/api/events/:id", asyncRoute(async (req, res) => {
  const result = await prisma.event.deleteMany({ where: { id: Number(req.params.id), userId: req.user.id } });
  if (!result.count) return res.status(404).json({ error: "Event not found" });
  res.status(204).end();
}));

const distDir = path.join(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get("*", (req, res) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ error: "Not found" });
  const indexFile = path.join(distDir, "index.html");
  if (!fs.existsSync(indexFile)) return res.status(503).send("Frontend build missing. Run `npm run build`, then restart the server.");
  res.sendFile(indexFile);
});
app.use((error, _req, res, _next) => {
  console.error("API request failed:", error);
  if (res.headersSent) return;
  res.status(500).json({ error: "The server could not complete this request." });
});
app.listen(port, async () => {
  console.log(`Extrack listening on http://localhost:${port}`);
  if (!fs.existsSync(distDir)) console.warn("dist/ not found — run `npm run build` before hosting the UI.");
  try { await prisma.$connect(); console.log("Connected to MySQL through Prisma."); }
  catch (error) { console.error("Could not connect to MySQL:", error); }
});
