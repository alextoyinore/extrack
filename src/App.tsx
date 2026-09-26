import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  FileText,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createRecord,
  deleteRecord,
  getBootstrap,
  patchRecord,
  updateRecord,
  updateSettings,
} from "./api";
import PortfolioPage from "./components/PortfolioPage";
import SettingsPage from "./components/SettingsPage";
import CalendarPage from "./components/CalendarPage";
import OverviewPage from "./components/OverviewPage";
import CashFlowPage from "./components/CashFlowPage";
import ForexJournalPage from "./components/ForexJournalPage";
import GoalsPage from "./components/GoalsPage";
import ReportsPage from "./components/ReportsPage";
import { CurrencyProvider, formatMoney, useMoney } from "./currency";
import { dateKeyFromValue, localDateKey } from "./dates";
import { withPortfolioMetrics } from "./portfolio";
import type {
  AddMode,
  Asset,
  BootstrapData,
  CalendarEvent,
  CashItem,
  CashflowItem,
  CashflowPlan,
  Goal,
  Settings,
  Trade,
  View,
} from "./types";

const initialAssets: Asset[] = [];
const initialExpenses: CashItem[] = [];
const defaultSettings: Settings = {
  displayName: "Alex Morgan",
  workspaceName: "Personal workspace",
  currency: "USD",
  weekStartsOn: "Sunday",
  notifications: true,
};

const money = { format: (value: number) => formatMoney(value, "USD") };

function App() {
  const [activeView, setActiveView] = useState<View>("Overview");
  const [assets, setAssets] = useState(initialAssets);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [income, setIncome] = useState<CashItem[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [cashflowPlans, setCashflowPlans] = useState<CashflowPlan[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string> | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);

  useEffect(() => {
    getBootstrap()
      .then((data: BootstrapData) => {
        setExpenses(
          data.transactions
            .filter((item: { kind: string }) => item.kind === "expense")
            .map(
              (item: {
                label: string;
                category: string;
                amount: number;
                occurred_on: string;
                recurring: boolean;
              }) => ({
                label: item.label,
                category: item.category,
                amount: item.amount,
                date: item.occurred_on,
                recurring: item.recurring,
              }),
            ),
        );
        setIncome(
          data.transactions
            .filter((item: { kind: string }) => item.kind === "income")
            .map(
              (item: {
                label: string;
                category: string;
                amount: number;
                occurred_on: string;
                recurring: boolean;
              }) => ({
                label: item.label,
                category: item.category,
                amount: item.amount,
                date: item.occurred_on,
                recurring: item.recurring,
              }),
            ),
        );
        setAssets(withPortfolioMetrics(data.assets));
        setGoals(data.goals);
        setEvents(data.events);
        setTrades(data.trades);
        setCashflowPlans(data.cashflowPlans);
        setSettings(data.settings || defaultSettings);
      })
      .catch(() =>
        notify(
          "Could not connect to the local database. Run npm run dev or npm start after building.",
        ),
      );
  }, []);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  };

  const mergePlan = (updated: CashflowPlan) => {
    setCashflowPlans((plans) => {
      const exists = plans.some((plan) => plan.id === updated.id);
      return exists
        ? plans.map((plan) => (plan.id === updated.id ? updated : plan))
        : [updated, ...plans];
    });
  };

  const closeRecordModal = () => {
    setAddMode(null);
    setEditingId(null);
    setEditValues(null);
  };

  const openCreate = (mode: Exclude<AddMode, null>) => {
    setEditingId(null);
    setEditValues(null);
    setAddMode(mode);
  };

  const openEdit = (
    mode: Exclude<AddMode, null>,
    id: number,
    values: Record<string, string>,
  ) => {
    setEditingId(id);
    setEditValues(values);
    setAddMode(mode);
  };

  const reloadCalendar = async () => {
    const data = await getBootstrap();
    setEvents(data.events);
  };

  const addExpense = () => {
    setShowQuickAdd(false);
    openCreate("expense");
  };

  const addRecord = async (
    mode: Exclude<AddMode, null>,
    payload: Record<string, unknown>,
  ) => {
    const endpoint =
      mode === "expense" || mode === "income"
        ? "transactions"
        : mode === "cashflow-plan"
          ? "cashflow/plans"
          : `${mode}s`;
    try {
      if (
        editingId &&
        (mode === "asset" ||
          mode === "trade" ||
          mode === "goal" ||
          mode === "event" ||
          mode === "cashflow-plan")
      ) {
        if (mode === "cashflow-plan") {
          const item = await patchRecord(
            `cashflow/plans/${editingId}`,
            payload,
          );
          mergePlan(item);
          await reloadCalendar();
          closeRecordModal();
          notify("Plan updated");
          return;
        }
        const item = await updateRecord(`${endpoint}/${editingId}`, payload);
        if (mode === "asset")
          setAssets((items) =>
            withPortfolioMetrics(
              items.map((entry) => (entry.id === editingId ? item : entry)),
            ),
          );
        if (mode === "trade")
          setTrades((items) =>
            items.map((entry) => (entry.id === editingId ? item : entry)),
          );
        if (mode === "goal")
          setGoals((items) =>
            items.map((entry) => (entry.id === editingId ? item : entry)),
          );
        if (mode === "event")
          setEvents((items) =>
            items
              .map((entry) => (entry.id === editingId ? item : entry))
              .sort((a, b) => a.event_date.localeCompare(b.event_date)),
          );
        closeRecordModal();
        notify(`${mode[0].toUpperCase()}${mode.slice(1)} updated`);
        return;
      }
      const item = await createRecord(
        endpoint,
        mode === "expense" || mode === "income"
          ? { ...payload, kind: mode }
          : payload,
      );
      if (mode === "expense")
        setExpenses((items) => [
          {
            label: item.label,
            category: item.category,
            amount: item.amount,
            date: item.occurred_on,
            recurring: item.recurring,
          },
          ...items,
        ]);
      if (mode === "income")
        setIncome((items) => [
          {
            label: item.label,
            category: item.category,
            amount: item.amount,
            date: item.occurred_on,
            recurring: item.recurring,
          },
          ...items,
        ]);
      if (mode === "asset")
        setAssets((items) => withPortfolioMetrics([...items, item]));
      if (mode === "goal") setGoals((items) => [...items, item]);
      if (mode === "event")
        setEvents((items) =>
          [...items, item].sort((a, b) =>
            a.event_date.localeCompare(b.event_date),
          ),
        );
      if (mode === "trade") setTrades((items) => [item, ...items]);
      if (mode === "cashflow-plan") {
        setCashflowPlans((items) => [item, ...items]);
        await reloadCalendar();
      }
      closeRecordModal();
      notify(`${mode[0].toUpperCase()}${mode.slice(1)} saved to SQLite`);
    } catch {
      notify("Please complete the required fields");
    }
  };

  return (
    <CurrencyProvider currency={settings.currency}>
      <div className="app-shell">
        <aside className={`sidebar ${sidebarOpen ? "is-open" : ""}`}>
          <div className="brand">
            <div className="brand-mark">
              <Sparkles size={17} />
            </div>
            <span>Extrack</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
          <div className="workspace-switcher">
            <div className="avatar small">
              {settings.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <strong>{settings.displayName}</strong>
              <span>{settings.workspaceName}</span>
            </div>
            <ChevronDown size={15} />
          </div>
          <p className="nav-label">Workspace</p>
          <nav>
            <NavItem
              icon={<LayoutDashboard size={18} />}
              label="Overview"
              active={activeView === "Overview"}
              onClick={() => {
                setActiveView("Overview");
                setSidebarOpen(false);
              }}
            />
            <NavItem
              icon={<Wallet size={18} />}
              label="Cash flow"
              active={activeView === "Cash flow"}
              onClick={() => {
                setActiveView("Cash flow");
                setSidebarOpen(false);
              }}
            />
            <NavItem
              icon={<BriefcaseBusiness size={18} />}
              label="Portfolio"
              active={activeView === "Portfolio"}
              onClick={() => {
                setActiveView("Portfolio");
                setSidebarOpen(false);
              }}
              badge={`${assets.length}`}
            />
            <NavItem
              icon={<BookOpen size={18} />}
              label="Forex journal"
              active={activeView === "Forex journal"}
              onClick={() => {
                setActiveView("Forex journal");
                setSidebarOpen(false);
              }}
            />
          </nav>
          <p className="nav-label">Planning</p>
          <nav>
            <NavItem
              icon={<Target size={18} />}
              label="Goals"
              active={activeView === "Goals"}
              onClick={() => {
                setActiveView("Goals");
                setSidebarOpen(false);
              }}
            />
            <NavItem
              icon={<CalendarDays size={18} />}
              label="Calendar"
              active={activeView === "Calendar"}
              onClick={() => {
                setActiveView("Calendar");
                setSidebarOpen(false);
              }}
            />
            <NavItem
              icon={<FileText size={18} />}
              label="Reports"
              active={activeView === "Reports"}
              onClick={() => {
                setActiveView("Reports");
                setSidebarOpen(false);
              }}
            />
          </nav>
          <div className="sidebar-bottom">
            <NavItem
              icon={<Settings2 size={18} />}
              label="Settings"
              active={activeView === "Settings"}
              onClick={() => {
                setActiveView("Settings");
                setSidebarOpen(false);
              }}
            />
            <div className="pro-card">
              <div className="pro-icon">
                <Sparkles size={15} />
              </div>
              <div>
                <strong>Build your runway</strong>
                <span>Set a target and make it real.</span>
              </div>
              <ArrowUpRight size={15} />
            </div>
          </div>
        </aside>
        {sidebarOpen && (
          <button
            className="scrim"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <main className="main-content">
          <header className="topbar">
            <button
              className="mobile-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={21} />
            </button>
            <div className="breadcrumb">
              <span>{settings.workspaceName}</span>
              <span>/</span>
              <strong>{activeView}</strong>
            </div>
            <div className="top-actions">
              <button
                className={`icon-button ${searchOpen ? "is-active" : ""}`}
                onClick={() => {
                  setSearchOpen((open) => !open);
                  setNotificationOpen(false);
                }}
                aria-label="Search"
              >
                <Search size={18} />
              </button>
              <button
                className={`icon-button notification ${notificationOpen ? "is-active" : ""}`}
                onClick={() => {
                  setNotificationOpen((open) => !open);
                  setSearchOpen(false);
                }}
                aria-label="Notifications"
              >
                <Bell size={18} />
                <i />
              </button>
              <div className="avatar">
                {settings.displayName.slice(0, 2).toUpperCase()}
              </div>
            </div>
            {searchOpen && (
              <SearchPopover
                onNavigate={(view) => {
                  setActiveView(view);
                  setSearchOpen(false);
                }}
              />
            )}
            {notificationOpen && (
              <NotificationPopover
                plan={cashflowPlans[0]}
                goals={goals}
                events={events}
              />
            )}
          </header>
          <div className="page-content">
            {activeView === "Overview" && (
              <OverviewPage
                expenses={expenses}
                income={income}
                assets={assets}
                goals={goals}
                plan={cashflowPlans[0]}
                onAdd={() => setShowQuickAdd(true)}
                onNavigate={setActiveView}
              />
            )}
            {activeView === "Cash flow" && (
              <CashFlowPage
                plan={cashflowPlans[0]}
                onCreatePlan={() => openCreate("cashflow-plan")}
                onEditPlan={() => {
                  const plan = cashflowPlans[0];
                  if (!plan) return;
                  openEdit("cashflow-plan", plan.id, {
                    name: plan.name,
                    expectedIncome: String(plan.expectedIncome ?? ""),
                    savingsTarget: String(plan.savingsTarget ?? ""),
                    periodStart: plan.period_start,
                    periodEnd: plan.period_end,
                  });
                }}
                onAddItem={async (payload) => {
                  const plan = cashflowPlans[0];
                  if (!plan) return;
                  try {
                    const updated = await createRecord(
                      `cashflow/plans/${plan.id}/items`,
                      payload,
                    );
                    mergePlan(updated);
                    await reloadCalendar();
                    notify("Expense added to your plan");
                  } catch {
                    notify("Please complete the expense details");
                  }
                }}
                onUpdateItem={async (itemId, payload) => {
                  try {
                    const updated = await patchRecord(
                      `cashflow/items/${itemId}`,
                      payload,
                    );
                    mergePlan(updated);
                    await reloadCalendar();
                    notify("Expense updated");
                  } catch {
                    notify("Could not update expense");
                  }
                }}
                onDeleteItem={async (itemId) => {
                  try {
                    const response = await fetch(
                      `/api/cashflow/items/${itemId}`,
                      { method: "DELETE" },
                    );
                    if (!response.ok) throw new Error("delete failed");
                    mergePlan(await response.json());
                    await reloadCalendar();
                    notify("Expense deleted");
                  } catch {
                    notify("Could not delete expense");
                  }
                }}
                onMarkSpent={async (item) => {
                  try {
                    const updated = await patchRecord(
                      `cashflow/items/${item.id}`,
                      { spent: item.planned, status: "spent" },
                    );
                    mergePlan(updated);
                    notify("Expense marked as spent");
                  } catch {
                    notify("Could not update expense");
                  }
                }}
              />
            )}
            {activeView === "Portfolio" && (
              <PortfolioPage
                assets={assets}
                onAdd={() => openCreate("asset")}
                onEdit={(asset) => {
                  if (!asset.id) return;
                  openEdit("asset", asset.id, {
                    symbol: asset.symbol,
                    name: asset.name,
                    type: asset.type,
                    costBasis: String(asset.costBasis ?? ""),
                    value: String(asset.value ?? ""),
                  });
                }}
                onDelete={async (asset) => {
                  if (!asset.id) return;
                  try {
                    await deleteRecord(`assets/${asset.id}`);
                    setAssets((items) =>
                      withPortfolioMetrics(
                        items.filter((entry) => entry.id !== asset.id),
                      ),
                    );
                    notify("Position deleted");
                  } catch {
                    notify("Could not delete position");
                  }
                }}
              />
            )}
            {activeView === "Forex journal" && (
              <ForexJournalPage
                trades={trades}
                onAdd={() => openCreate("trade")}
                onEdit={(trade) => {
                  if (!trade.id) return;
                  openEdit("trade", trade.id, {
                    pair: trade.pair,
                    setup: trade.setup,
                    direction: trade.direction,
                    result: String(trade.result ?? ""),
                    tradedOn: trade.traded_on,
                    notes: trade.notes || "",
                  });
                }}
                onDelete={async (trade) => {
                  if (!trade.id) return;
                  try {
                    await deleteRecord(`trades/${trade.id}`);
                    setTrades((items) =>
                      items.filter((entry) => entry.id !== trade.id),
                    );
                    notify("Trade deleted");
                  } catch {
                    notify("Could not delete trade");
                  }
                }}
              />
            )}
            {activeView === "Goals" && (
              <GoalsPage
                goals={goals}
                onAdd={() => openCreate("goal")}
                onEdit={(goal) => {
                  if (!goal.id) return;
                  openEdit("goal", goal.id, {
                    name: goal.name,
                    target: String(goal.target ?? ""),
                    current: String(goal.current ?? ""),
                    targetDate: goal.target_date,
                  });
                }}
                onDelete={async (goal) => {
                  if (!goal.id) return;
                  try {
                    await deleteRecord(`goals/${goal.id}`);
                    setGoals((items) =>
                      items.filter((entry) => entry.id !== goal.id),
                    );
                    notify("Goal deleted");
                  } catch {
                    notify("Could not delete goal");
                  }
                }}
              />
            )}
            {activeView === "Calendar" && (
              <CalendarPage
                events={events}
                weekStartsOn={settings.weekStartsOn}
                onAdd={() => openCreate("event")}
                onEdit={(event) => {
                  if (!event.id) return;
                  openEdit("event", event.id, {
                    title: event.title,
                    eventType: event.event_type,
                    amount: String(event.amount ?? ""),
                    eventDate: dateKeyFromValue(event.event_date),
                    notes: event.notes || "",
                  });
                }}
                onDelete={async (event) => {
                  if (!event.id) return;
                  try {
                    await deleteRecord(`events/${event.id}`);
                    setEvents((items) =>
                      items.filter((entry) => entry.id !== event.id),
                    );
                    notify("Event deleted");
                  } catch {
                    notify("Could not delete event");
                  }
                }}
              />
            )}
            {activeView === "Reports" && (
              <ReportsPage
                expenses={expenses}
                income={income}
                assets={assets}
                trades={trades}
                goals={goals}
              />
            )}
            {activeView === "Settings" && (
              <SettingsPage
                settings={settings}
                onSave={async (nextSettings) => {
                  const saved = await updateSettings(nextSettings);
                  setSettings(saved);
                }}
                notify={notify}
              />
            )}
          </div>
        </main>
        {showQuickAdd && (
          <div
            className="modal-backdrop"
            onClick={() => setShowQuickAdd(false)}
          >
            <div
              className="quick-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-heading">
                <div>
                  <span className="eyebrow">Quick add</span>
                  <h2>Keep the plan current.</h2>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setShowQuickAdd(false)}
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="quick-options">
                <button onClick={addExpense}>
                  <div className="option-icon coral">
                    <ArrowDownLeft size={19} />
                  </div>
                  <span>
                    <strong>Expense</strong>
                    <small>Log a purchase or bill</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    openCreate("income");
                  }}
                >
                  <div className="option-icon gold">
                    <ArrowUpRight size={19} />
                  </div>
                  <span>
                    <strong>Income</strong>
                    <small>Plan a deposit or paycheque</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    openCreate("asset");
                  }}
                >
                  <div className="option-icon mint">
                    <TrendingUp size={19} />
                  </div>
                  <span>
                    <strong>Investment</strong>
                    <small>Add an asset to your portfolio</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowQuickAdd(false);
                    openCreate("trade");
                  }}
                >
                  <div className="option-icon lavender">
                    <BookOpen size={19} />
                  </div>
                  <span>
                    <strong>Trade journal</strong>
                    <small>Capture the why behind a trade</small>
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        {addMode && (
          <AddRecordModal
            key={`${addMode}-${editingId ?? "new"}`}
            mode={addMode}
            initialValues={editValues || undefined}
            isEditing={Boolean(editingId)}
            onClose={closeRecordModal}
            onSave={addRecord}
          />
        )}
        {toast && (
          <div className="toast">
            <Sparkles size={16} />
            {toast}
          </div>
        )}
      </div>
    </CurrencyProvider>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button className={`nav-item ${active ? "active" : ""}`} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge && <em>{badge}</em>}
    </button>
  );
}

function Overview({
  expenses,
  income,
  assets,
  goals,
  plan,
  onAdd,
  onNavigate,
  notify,
}: {
  expenses: CashItem[];
  income: CashItem[];
  assets: Asset[];
  goals: Goal[];
  plan?: CashflowPlan;
  onAdd: () => void;
  onNavigate: (view: View) => void;
  notify: (message: string) => void;
}) {
  const money = { format: useMoney() };
  const incomeTotal = income.reduce((sum, item) => sum + item.amount, 0);
  const expenseTotal = expenses.reduce((sum, item) => sum + item.amount, 0);
  const portfolioTotal = assets.reduce((sum, asset) => sum + asset.value, 0);
  const overviewChart = plan
    ? [
        {
          month: plan.name,
          income: plan.expectedIncome,
          spend: plan.plannedExpenses,
        },
      ]
    : [];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1>Your money, in motion.</h1>
          <p className="subheading">
            A clear view of where you are and where you’re going.
          </p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> Quick add
        </button>
      </div>
      <div className="metrics-grid">
        <MetricCard
          label="Tracked income"
          value={money.format(plan?.expectedIncome || incomeTotal)}
          meta={plan ? "From your active plan" : "Create a plan to begin"}
          icon={<CircleDollarSign size={20} />}
          tone="gold"
        />
        <MetricCard
          label="Planned surplus"
          value={money.format(
            plan?.remaining || Math.max(0, incomeTotal - expenseTotal),
          )}
          meta={
            plan
              ? "After planned expenses and savings"
              : "Based on tracked records"
          }
          icon={<ArrowUpRight size={20} />}
          tone="mint"
        />
        <MetricCard
          label="Invested"
          value={money.format(portfolioTotal)}
          meta={`${assets.length} positions tracked`}
          icon={<TrendingUp size={20} />}
          tone="lavender"
        />
        <MetricCard
          label="Active goals"
          value={`${goals.length}`}
          meta="Keep your next target visible"
          icon={<Target size={20} />}
          tone="coral"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel cash-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Cash flow</span>
              <h2>Income vs. spending</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("Cash flow")}
            >
              Open planner <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot income" />
              Income
            </span>
            <span>
              <i className="legend-dot spend" />
              Spending
            </span>
            <strong>
              {plan ? `${money.format(plan.remaining)} left` : "No plan yet"}
            </strong>
          </div>
          <div className="chart-wrap">
            {overviewChart.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={overviewChart}
                  margin={{ top: 8, right: 2, left: -18, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="#e8e5dd" />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9a988f", fontSize: 12 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#9a988f", fontSize: 12 }}
                    tickFormatter={(value) => `$${value / 1000}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      border: "1px solid #e3dfd4",
                      borderRadius: 10,
                    }}
                    formatter={(value) => money.format(Number(value))}
                  />
                  <Area
                    type="monotone"
                    dataKey="income"
                    stroke="#50af8d"
                    fill="#dff2e8"
                    strokeWidth={2.5}
                  />
                  <Area
                    type="monotone"
                    dataKey="spend"
                    stroke="#df836b"
                    fill="#fae3dc"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-chart">
                <Wallet size={20} />
                <span>Create an income plan to see your cash flow here.</span>
              </div>
            )}
          </div>
        </section>
        <section className="panel allocation-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Portfolio</span>
              <h2>Where it lives</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("Portfolio")}
            >
              View all <ArrowUpRight size={15} />
            </button>
          </div>
          {assets.length ? (
            <div className="allocation-visual">
              <div className="donut">
                <div>
                  <strong>{money.format(portfolioTotal)}</strong>
                  <span>invested</span>
                </div>
              </div>
              <div className="allocation-list">
                {assets.slice(0, 4).map((asset, index) => (
                  <Allocation
                    key={asset.symbol}
                    label={asset.symbol}
                    value={`${asset.allocation}%`}
                    color={["green", "orange", "blue", "purple"][index]}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-chart">
              <BriefcaseBusiness size={20} />
              <span>Add an asset to start tracking your portfolio.</span>
            </div>
          )}
          <div className="mini-note">
            <div className="note-check">
              <TrendingUp size={14} />
            </div>
            <span>
              {assets.length
                ? "Your portfolio is ready for more detail."
                : "Your financial picture starts with one record."}
            </span>
          </div>
        </section>
      </div>
      <div className="lower-grid">
        <section className="panel activity-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Recent activity</span>
              <h2>What’s happening</h2>
            </div>
            <button
              className="text-button"
              onClick={() => onNavigate("Cash flow")}
            >
              See all <ArrowUpRight size={15} />
            </button>
          </div>
          {expenses.length || income.length ? (
            <>
              {expenses.slice(0, 2).map((item) => (
                <Activity
                  key={item.label}
                  icon={<ArrowDownLeft size={17} />}
                  title={item.label}
                  detail={`${item.category} · ${item.date}`}
                  amount={`-${money.format(item.amount)}`}
                  tone="coral"
                />
              ))}
              {income.slice(0, 2).map((item) => (
                <Activity
                  key={item.label}
                  icon={<ArrowUpRight size={17} />}
                  title={item.label}
                  detail={`${item.category} · ${item.date}`}
                  amount={`+${money.format(item.amount)}`}
                  tone="mint"
                />
              ))}
            </>
          ) : (
            <div className="empty-list">
              No activity yet. Add income or create a plan.
            </div>
          )}
        </section>
        <section className="panel goal-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Your north star</span>
              <h2>{goals[0]?.name || "Set your first goal"}</h2>
            </div>
            <button className="icon-button" onClick={() => onNavigate("Goals")}>
              <Settings2 size={17} />
            </button>
          </div>
          {goals[0] ? (
            <>
              <div className="goal-amount">
                <strong>{money.format(goals[0].current)}</strong>
                <span>of {money.format(goals[0].target)}</span>
              </div>
              <div className="progress">
                <span
                  style={{
                    width: `${Math.min(100, (goals[0].current / goals[0].target) * 100)}%`,
                  }}
                />
              </div>
              <div className="goal-footer">
                <span>
                  {Math.round((goals[0].current / goals[0].target) * 100)}%
                  funded
                </span>
                <button
                  className="text-button"
                  onClick={() => onNavigate("Goals")}
                >
                  Open goals <Plus size={14} />
                </button>
              </div>
            </>
          ) : (
            <div className="empty-list">
              A goal gives your surplus somewhere meaningful to go.
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  meta,
  icon,
  tone,
}: {
  label: string;
  value: string;
  meta: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}
function Allocation({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="allocation-item">
      <i className={`allocation-dot ${color}`} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Activity({
  icon,
  title,
  detail,
  amount,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  amount: string;
  tone: string;
}) {
  return (
    <div className="activity-row">
      <div className={`activity-icon ${tone}`}>{icon}</div>
      <div className="activity-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      <strong className={amount.startsWith("+") ? "positive" : "negative"}>
        {amount}
      </strong>
    </div>
  );
}

function CashFlowPlanner({
  plan,
  onCreatePlan,
  onAddItem,
  onMarkSpent,
}: {
  plan?: CashflowPlan;
  onCreatePlan: () => void;
  onAddItem: (payload: Record<string, unknown>) => Promise<void>;
  onMarkSpent: (item: CashflowItem) => Promise<void>;
}) {
  const money = { format: useMoney() };
  const [form, setForm] = useState({
    label: "",
    category: "",
    planned: "",
    dueOn: new Date().toISOString().slice(0, 10),
  });
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.label || !form.category || !form.planned) return;
    await onAddItem({ ...form, spent: 0, status: "planned" });
    setForm({
      label: "",
      category: "",
      planned: "",
      dueOn: new Date().toISOString().slice(0, 10),
    });
  };
  if (!plan)
    return (
      <div className="empty-state panel">
        <div className="empty-icon">
          <Wallet size={24} />
        </div>
        <span className="eyebrow">Cash flow planner</span>
        <h1>Start with the money coming in.</h1>
        <p>
          Create a plan for a pay period or month, enter what you expect to
          earn, then assign expenses and savings until every dollar has a place.
        </p>
        <button className="primary-button" onClick={onCreatePlan}>
          <Plus size={18} /> Create income plan
        </button>
      </div>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {plan.period_start} to {plan.period_end}
          </p>
          <h1>{plan.name}</h1>
          <p className="subheading">
            Plan the income, assign the outflow, and keep the remainder visible.
          </p>
        </div>
        <button className="secondary-button" onClick={onCreatePlan}>
          <Plus size={16} /> New plan
        </button>
      </div>
      <div className="cash-summary planner-summary">
        <div>
          <span>Expected income</span>
          <strong>{money.format(plan.expectedIncome)}</strong>
          <small>What you expect to receive</small>
        </div>
        <div>
          <span>Planned expenses</span>
          <strong>{money.format(plan.plannedExpenses)}</strong>
          <small>{money.format(plan.spent)} spent so far</small>
        </div>
        <div>
          <span>Left to assign</span>
          <strong className={plan.remaining >= 0 ? "green-text" : "negative"}>
            {money.format(plan.remaining)}
          </strong>
          <small>After your savings target</small>
        </div>
        <div>
          <span>Saved target</span>
          <strong className="green-text">{money.format(plan.saved)}</strong>
          <small>{money.format(plan.reserved)} reserved for expenses</small>
        </div>
      </div>
      <div className="content-grid planner-grid">
        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Expense plan</span>
              <h2>Where the income goes</h2>
            </div>
            <span className="plan-status">
              {money.format(plan.available)} available
            </span>
          </div>
          <div className="expense-list">
            {plan.items.length === 0 && (
              <div className="empty-list">
                No expenses yet. Add the first one beside this list.
              </div>
            )}
            {plan.items.map((item, index) => (
              <div className="expense-row" key={item.id}>
                <div className="expense-category">
                  <div className={`category-icon category-${index % 4}`}>
                    <Wallet size={16} />
                  </div>
                  <div>
                    <strong>{item.label}</strong>
                    <span>
                      {item.category} · Due {item.due_on}
                    </span>
                  </div>
                </div>
                <span className="expense-date">
                  {item.status === "spent" ? "Spent" : "Planned"}
                </span>
                <strong>{money.format(item.planned)}</strong>
                {item.status === "planned" ? (
                  <button
                    className="text-button"
                    onClick={() => onMarkSpent(item)}
                  >
                    Mark spent
                  </button>
                ) : (
                  <span className="spent-check">Done</span>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="panel add-expense-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Assign income</span>
              <h2>Add an expense</h2>
            </div>
            <ArrowDownLeft size={18} color="#c66f58" />
          </div>
          <form className="planner-form" onSubmit={submit}>
            <label className="form-field">
              <span>Expense name</span>
              <input
                value={form.label}
                onChange={(event) =>
                  setForm({ ...form, label: event.target.value })
                }
                placeholder="Rent, groceries, utilities"
                required
              />
            </label>
            <label className="form-field">
              <span>Category</span>
              <input
                value={form.category}
                onChange={(event) =>
                  setForm({ ...form, category: event.target.value })
                }
                placeholder="Home, food, transport"
                required
              />
            </label>
            <label className="form-field">
              <span>Planned amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.planned}
                onChange={(event) =>
                  setForm({ ...form, planned: event.target.value })
                }
                placeholder="0.00"
                required
              />
            </label>
            <label className="form-field">
              <span>Due date</span>
              <input
                type="date"
                value={form.dueOn}
                onChange={(event) =>
                  setForm({ ...form, dueOn: event.target.value })
                }
                required
              />
            </label>
            <button className="primary-button form-submit" type="submit">
              <Plus size={17} /> Add to plan
            </button>
          </form>
        </section>
      </div>
    </>
  );
}

function CashFlow({
  expenses,
  onAdd,
  notify,
}: {
  expenses: CashItem[];
  onAdd: () => void;
  notify: (message: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Cash flow planner</p>
          <h1>Make every dollar count.</h1>
          <p className="subheading">
            Plan ahead, then stay honest about what actually happened.
          </p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> Add expense
        </button>
      </div>
      <div className="cash-summary">
        <div>
          <span>Planned income</span>
          <strong>$6,800</strong>
          <small>Next pay day in 8 days</small>
        </div>
        <div>
          <span>Planned spending</span>
          <strong>$3,960</strong>
          <small>58.2% of monthly income</small>
        </div>
        <div>
          <span>Available to assign</span>
          <strong className="green-text">$2,840</strong>
          <small>Looking healthy this month</small>
        </div>
      </div>
      <div className="content-grid">
        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">October 2024</span>
              <h2>Upcoming expenses</h2>
            </div>
            <button className="select-button">
              All categories <ChevronDown size={14} />
            </button>
          </div>
          <div className="expense-list">
            {expenses.map((expense, index) => (
              <div className="expense-row" key={`${expense.label}-${index}`}>
                <div className="expense-category">
                  <div className={`category-icon category-${index % 4}`}>
                    <Wallet size={16} />
                  </div>
                  <div>
                    <strong>{expense.label}</strong>
                    <span>
                      {expense.category}
                      {expense.recurring ? " · Recurring" : ""}
                    </span>
                  </div>
                </div>
                <span className="expense-date">{expense.date}</span>
                <strong>{money.format(expense.amount)}</strong>
                <button
                  className="icon-button"
                  onClick={() => notify("Expense details opened")}
                  aria-label="Open expense"
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel insight-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">A small nudge</span>
              <h2>Spending rhythm</h2>
            </div>
            <Sparkles size={18} color="#c49525" />
          </div>
          <div className="insight-number">
            24<span>%</span>
          </div>
          <p>
            You spend 24% less in the first half of each month. Your plan is on
            track to match that rhythm.
          </p>
          <div className="bars">
            <i style={{ height: "42%" }} />
            <i style={{ height: "68%" }} />
            <i style={{ height: "51%" }} />
            <i style={{ height: "86%" }} />
            <i style={{ height: "62%" }} />
            <i style={{ height: "74%" }} />
            <i style={{ height: "48%" }} />
          </div>
        </section>
      </div>
    </>
  );
}

function ForexJournal({
  trades,
  onAdd,
  notify,
}: {
  trades: Trade[];
  onAdd: () => void;
  notify: (message: string) => void;
}) {
  const money = { format: useMoney() };
  const wins = trades.filter((trade) => trade.result > 0).length;
  const net = trades.reduce((sum, trade) => sum + trade.result, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Trading journal</p>
          <h1>Trade with intention.</h1>
          <p className="subheading">Track the setup, not just the outcome.</p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> Log a trade
        </button>
      </div>
      <div className="journal-stats">
        <MetricCard
          label="Win rate"
          value={
            trades.length
              ? `${Math.round((wins / trades.length) * 100)}%`
              : "0%"
          }
          meta={`${wins} wins across ${trades.length} trades`}
          icon={<Target size={20} />}
          tone="mint"
        />
        <MetricCard
          label="Net P&L"
          value={money.format(net)}
          meta="From logged trades"
          icon={<TrendingUp size={20} />}
          tone="gold"
        />
        <MetricCard
          label="Average trade"
          value={trades.length ? money.format(net / trades.length) : "$0"}
          meta="Across the journal"
          icon={<BarChart3 size={20} />}
          tone="lavender"
        />
        <MetricCard
          label="Best pair"
          value={trades[0]?.pair || "—"}
          meta="Most recently logged"
          icon={<Sparkles size={20} />}
          tone="coral"
        />
      </div>
      <div className="content-grid journal-grid">
        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Recent entries</span>
              <h2>Read your own tape</h2>
            </div>
            <button
              className="text-button"
              onClick={() => notify("Journal filters opened")}
            >
              Filter <ChevronDown size={14} />
            </button>
          </div>
          <div className="journal-list">
            {trades.map((trade) => (
              <JournalEntry
                key={trade.id ?? `${trade.pair}-${trade.traded_on}`}
                pair={trade.pair}
                setup={`${trade.setup} · ${trade.direction}`}
                date={trade.traded_on}
                result={money.format(trade.result)}
                positive={trade.result >= 0}
              />
            ))}
          </div>
        </section>
        <section className="panel note-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Your edge</span>
              <h2>Pattern to keep</h2>
            </div>
            <BookOpen size={18} color="#7972b9" />
          </div>
          <div className="quote-mark">“</div>
          <blockquote>
            My best trades give me time to be right. When I feel rushed, I am
            usually forcing the setup.
          </blockquote>
          <span className="note-date">
            Keep this reflection close to the tape.
          </span>
          <button
            className="secondary-button"
            onClick={() => notify("Reflection editor opened")}
          >
            Edit reflection
          </button>
        </section>
      </div>
    </>
  );
}
function JournalEntry({
  pair,
  setup,
  date,
  result,
  positive,
}: {
  pair: string;
  setup: string;
  date: string;
  result: string;
  positive: boolean;
}) {
  return (
    <div className="journal-row">
      <div className="pair-icon">
        {pair.split("/")[0].slice(0, 1)}
        <span>{pair.split("/")[1]?.slice(0, 1)}</span>
      </div>
      <div>
        <strong>{pair}</strong>
        <span>{setup}</span>
      </div>
      <time>{date}</time>
      <strong className={positive ? "positive" : "negative"}>{result}</strong>
      <ArrowUpRight size={16} color="#9a988f" />
    </div>
  );
}

function Goals({
  goals,
  onAdd,
  notify,
}: {
  goals: Goal[];
  onAdd: () => void;
  notify: (message: string) => void;
}) {
  const money = { format: useMoney() };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Planning</p>
          <h1>Give your money a job.</h1>
          <p className="subheading">
            Turn the things you want into a pace you can actually follow.
          </p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> New goal
        </button>
      </div>
      <div className="goals-grid">
        {goals.map((goal) => {
          const progress = Math.min(
            100,
            Math.round((goal.current / goal.target) * 100),
          );
          return (
            <section className="panel goal-card" key={goal.id ?? goal.name}>
              <div className={`goal-orb ${goal.color}`}>
                <Target size={20} />
              </div>
              <div className="goal-card-heading">
                <div>
                  <span className="eyebrow">Target {goal.target_date}</span>
                  <h2>{goal.name}</h2>
                </div>
                <button
                  className="icon-button"
                  onClick={() => notify("Goal details opened")}
                  aria-label="Open goal"
                >
                  <ArrowUpRight size={17} />
                </button>
              </div>
              <div className="goal-card-amount">
                <strong>{money.format(goal.current)}</strong>
                <span>of {money.format(goal.target)}</span>
              </div>
              <div className="progress">
                <span style={{ width: `${progress}%` }} />
              </div>
              <div className="goal-footer">
                <span>{progress}% funded</span>
                <button
                  className="text-button"
                  onClick={() => notify("Contribution flow opened")}
                >
                  Add money <Plus size={14} />
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function CalendarView({
  events,
  onAdd,
  notify,
}: {
  events: CalendarEvent[];
  onAdd: () => void;
  notify: (message: string) => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">October 2024</p>
          <h1>See the month clearly.</h1>
          <p className="subheading">
            Income, bills, investments, and the moments that need your
            attention.
          </p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> Add event
        </button>
      </div>
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <button
            className="secondary-button"
            onClick={() => notify("Previous month")}
          >
            ‹
          </button>
          <strong>October 2024</strong>
          <button
            className="secondary-button"
            onClick={() => notify("Next month")}
          >
            ›
          </button>
          <button className="select-button">
            Month view <ChevronDown size={14} />
          </button>
        </div>
        <div className="calendar-grid">
          <div className="calendar-week">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-days">
            {Array.from({ length: 31 }, (_, index) => {
              const day = index + 1;
              const dayEvents = events.filter(
                (event) => Number(event.event_date.slice(-2)) === day,
              );
              return (
                <div
                  className={`calendar-day ${day === 8 ? "today" : ""}`}
                  key={day}
                >
                  <strong>{day}</strong>
                  {dayEvents.map((event) => (
                    <button
                      key={event.id ?? event.title}
                      className={`calendar-event ${event.event_type.toLowerCase()}`}
                      onClick={() => notify(event.notes || event.title)}
                    >
                      {event.title}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function Reports({
  expenses,
  income,
  assets,
  trades,
  goals,
}: {
  expenses: CashItem[];
  income: CashItem[];
  assets: Asset[];
  trades: Trade[];
  goals: Goal[];
}) {
  const money = { format: useMoney() };
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
  const totalIncome = income.reduce((sum, item) => sum + item.amount, 0);
  const tradeWins = trades.filter((trade) => trade.result > 0).length;
  const portfolioTotal = assets.reduce((sum, asset) => sum + asset.value, 0);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Make the pattern visible.</h1>
          <p className="subheading">
            A simple monthly read on cash flow, investing, and progress.
          </p>
        </div>
        <button className="secondary-button" onClick={() => window.print()}>
          <FileText size={16} /> Export report
        </button>
      </div>
      <div className="report-highlight">
        <div>
          <span>October net cash flow</span>
          <strong>{money.format(totalIncome - totalExpenses)}</strong>
          <small>Income less tracked expenses</small>
        </div>
        <div>
          <span>Portfolio tracked</span>
          <strong>
            {money.format(
              assets.reduce(
                (sum, asset) => sum + Number(asset.value.replace(/[$,]/g, "")),
                0,
              ),
            )}
          </strong>
          <small>{assets.length} positions across asset classes</small>
        </div>
        <div>
          <span>Goal progress</span>
          <strong>
            {goals.length
              ? `${Math.round((goals.reduce((sum, goal) => sum + goal.current / goal.target, 0) / goals.length) * 100)}%`
              : "0%"}
          </strong>
          <small>Average across active goals</small>
        </div>
      </div>
      <div className="reports-grid">
        <section className="panel report-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Cash flow</span>
              <h2>Where October went</h2>
            </div>
            <BarChart3 size={18} color="#4a9a76" />
          </div>
          <ReportBar
            label="Income"
            amount={money.format(totalIncome)}
            width="100%"
            tone="income"
          />
          <ReportBar
            label="Expenses"
            amount={money.format(totalExpenses)}
            width={`${Math.min(100, (totalExpenses / Math.max(totalIncome, 1)) * 100)}%`}
            tone="expense"
          />
          <ReportBar
            label="Available"
            amount={money.format(Math.max(0, totalIncome - totalExpenses))}
            width={`${Math.min(100, ((totalIncome - totalExpenses) / Math.max(totalIncome, 1)) * 100)}%`}
            tone="available"
          />
        </section>
        <section className="panel report-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Trading discipline</span>
              <h2>Journal snapshot</h2>
            </div>
            <BookOpen size={18} color="#7972b9" />
          </div>
          <div className="report-stat-row">
            <span>Win rate</span>
            <strong>
              {trades.length
                ? `${Math.round((tradeWins / trades.length) * 100)}%`
                : "0%"}
            </strong>
          </div>
          <div className="report-stat-row">
            <span>Trades logged</span>
            <strong>{trades.length}</strong>
          </div>
          <div className="report-stat-row">
            <span>Net result</span>
            <strong
              className={
                trades.reduce((sum, trade) => sum + trade.result, 0) >= 0
                  ? "positive"
                  : "negative"
              }
            >
              {money.format(
                trades.reduce((sum, trade) => sum + trade.result, 0),
              )}
            </strong>
          </div>
        </section>
      </div>
    </>
  );
}

function ReportBar({
  label,
  amount,
  width,
  tone,
}: {
  label: string;
  amount: string;
  width: string;
  tone: string;
}) {
  return (
    <div className="report-bar-row">
      <div>
        <span>{label}</span>
        <strong>{amount}</strong>
      </div>
      <div className="report-bar">
        <i className={tone} style={{ width }} />
      </div>
    </div>
  );
}

function AddRecordModal({
  mode,
  initialValues,
  isEditing,
  onClose,
  onSave,
}: {
  mode: Exclude<AddMode, null>;
  initialValues?: Record<string, string>;
  isEditing?: boolean;
  onClose: () => void;
  onSave: (
    mode: Exclude<AddMode, null>,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const today = localDateKey();
  const [form, setForm] = useState<Record<string, string>>({
    occurredOn: today,
    targetDate: today,
    tradedOn: today,
    eventDate: today,
    periodStart: today,
    periodEnd: today,
    ...initialValues,
  });
  const update = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const title = isEditing
    ? mode === "asset"
      ? "Edit investment"
      : mode === "trade"
        ? "Edit trade"
        : mode === "goal"
          ? "Edit goal"
          : mode === "event"
            ? "Edit calendar event"
            : mode === "cashflow-plan"
              ? "Edit income plan"
            : "Edit record"
    : mode === "expense"
      ? "Log an expense"
      : mode === "income"
        ? "Plan income"
        : mode === "asset"
          ? "Add an investment"
          : mode === "trade"
            ? "Log a trade"
            : mode === "goal"
              ? "Create a goal"
              : mode === "cashflow-plan"
                ? "Create an income plan"
                : "Add calendar event";
  const field = (
    key: string,
    label: string,
    type = "text",
    placeholder = "",
  ) => (
    <label className="form-field">
      <span>{label}</span>
      <input
        type={type}
        value={form[key] || ""}
        placeholder={placeholder}
        onChange={(event) => update(key, event.target.value)}
        required={key !== "notes"}
      />
    </label>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="quick-modal record-form"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave(mode, {
            ...form,
            eventDate: form.eventDate
              ? dateKeyFromValue(form.eventDate)
              : form.eventDate,
            occurredOn: form.occurredOn
              ? dateKeyFromValue(form.occurredOn)
              : form.occurredOn,
            tradedOn: form.tradedOn
              ? dateKeyFromValue(form.tradedOn)
              : form.tradedOn,
            targetDate: form.targetDate
              ? dateKeyFromValue(form.targetDate)
              : form.targetDate,
            periodStart: form.periodStart
              ? dateKeyFromValue(form.periodStart)
              : form.periodStart,
            periodEnd: form.periodEnd
              ? dateKeyFromValue(form.periodEnd)
              : form.periodEnd,
          });
        }}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">
              {isEditing ? "Edit record" : "SQLite record"}
            </span>
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="form-grid">
          {(mode === "expense" || mode === "income") && (
            <>
              {field("label", "Name", "text", "e.g. Freelance invoice")}
              {field("category", "Category", "text", "e.g. Salary")}
              {field("amount", "Amount", "number", "0.00")}
              {field("occurredOn", "Date", "date")}
            </>
          )}
          {mode === "cashflow-plan" && (
            <>
              {field("name", "Plan name", "text", "October income plan")}
              {field("expectedIncome", "Expected income", "number", "0.00")}
              {field("savingsTarget", "Savings target", "number", "0.00")}
              {field("periodStart", "Starts", "date")}
              {field("periodEnd", "Ends", "date")}
            </>
          )}
          {mode === "asset" && (
            <>
              {field("symbol", "Ticker", "text", "VOO")}
              {field("name", "Name", "text", "Vanguard S&P 500 ETF")}
              {field("type", "Type", "text", "ETF, stock, bond, forex")}
              {field("costBasis", "Amount invested", "number", "0.00")}
              {field("value", "Current value", "number", "0.00")}
            </>
          )}
          {mode === "trade" && (
            <>
              {field("pair", "Pair", "text", "EUR/USD")}
              {field("setup", "Setup", "text", "London breakout")}
              {field("direction", "Direction", "text", "Long or short")}
              {field("result", "Result", "number", "0.00")}
              {field("tradedOn", "Trade date", "date")}
              {field("notes", "Notes", "text", "What did you learn?")}
            </>
          )}
          {mode === "goal" && (
            <>
              {field("name", "Goal name", "text", "Emergency fund")}
              {field("target", "Target amount", "number", "12000")}
              {field("current", "Already saved", "number", "0")}
              {field("targetDate", "Target date", "date")}
            </>
          )}
          {mode === "event" && (
            <>
              {field("title", "Event name", "text", "Rent & utilities")}
              {field(
                "eventType",
                "Type",
                "text",
                "Income, expense, investment, goal",
              )}
              {field("amount", "Amount", "number", "0.00")}
              {field("eventDate", "Event date", "date")}
              {field("notes", "Notes", "text", "Optional detail")}
            </>
          )}
        </div>
        <button className="primary-button form-submit" type="submit">
          <Plus size={17} />{" "}
          {isEditing
            ? "Save changes"
            : `Save ${mode === "cashflow-plan" ? "plan" : mode}`}
        </button>
      </form>
    </div>
  );
}

function SearchPopover({ onNavigate }: { onNavigate: (view: View) => void }) {
  const [query, setQuery] = useState("");
  const options: Array<{ label: string; description: string; view: View }> = [
    {
      label: "Overview",
      description: "Your financial snapshot",
      view: "Overview",
    },
    {
      label: "Cash flow",
      description: "Income plans and expenses",
      view: "Cash flow",
    },
    {
      label: "Portfolio",
      description: "Stocks, ETFs, bonds, and forex",
      view: "Portfolio",
    },
    {
      label: "Forex journal",
      description: "Trades and reflections",
      view: "Forex journal",
    },
    { label: "Goals", description: "Targets and progress", view: "Goals" },
    {
      label: "Calendar",
      description: "Income, bills, and events",
      view: "Calendar",
    },
    { label: "Reports", description: "Financial summaries", view: "Reports" },
    {
      label: "Settings",
      description: "Workspace preferences",
      view: "Settings",
    },
  ];
  const filtered = options.filter((option) =>
    `${option.label} ${option.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div className="header-popover search-popover">
      <div className="popover-search">
        <Search size={16} />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Extrack"
        />
      </div>
      <div className="search-results">
        {filtered.length ? (
          filtered.map((option) => (
            <button key={option.view} onClick={() => onNavigate(option.view)}>
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
              <ArrowUpRight size={15} />
            </button>
          ))
        ) : (
          <div className="popover-empty">No matching pages.</div>
        )}
      </div>
    </div>
  );
}

function NotificationPopover({
  plan,
  goals,
  events,
}: {
  plan?: CashflowPlan;
  goals: Goal[];
  events: CalendarEvent[];
}) {
  const money = { format: useMoney() };
  const upcoming = events
    .filter(
      (event) => event.event_date >= new Date().toISOString().slice(0, 10),
    )
    .slice(0, 2);
  const notifications = [
    ...(plan && plan.remaining < 0
      ? [
          {
            title: "Plan is over-assigned",
            detail: `${money.format(Math.abs(plan.remaining))} needs attention`,
            tone: "coral",
          },
        ]
      : []),
    ...(goals.length === 0
      ? [
          {
            title: "Set your first goal",
            detail: "Give your surplus somewhere to go",
            tone: "mint",
          },
        ]
      : []),
    ...upcoming.map((event) => ({
      title: event.title,
      detail: `${event.event_date} · ${event.event_type}`,
      tone: "lavender",
    })),
  ];
  return (
    <div className="header-popover notification-popover">
      <div className="popover-heading">
        <span className="eyebrow">Notifications</span>
        <strong>
          {notifications.length
            ? `${notifications.length} to review`
            : "All clear"}
        </strong>
      </div>
      {notifications.length ? (
        notifications.map((item, index) => (
          <div className="notification-row" key={`${item.title}-${index}`}>
            <span className={`notification-dot ${item.tone}`} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        ))
      ) : (
        <div className="popover-empty">No new planning signals.</div>
      )}
    </div>
  );
}

export default App;
