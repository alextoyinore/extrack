export type View =
  | "Overview"
  | "Cash flow"
  | "Portfolio"
  | "Forex journal"
  | "Goals"
  | "Calendar"
  | "Reports"
  | "Settings";
export type Asset = {
  id?: number;
  symbol: string;
  name: string;
  type: string;
  value: any;
  changePercent: number;
  dayChange: number;
  costBasis: number;
  allocation: number;
};
export type CashItem = {
  id?: number;
  label: string;
  category: string;
  amount: number;
  date: string;
  recurring?: boolean;
};
export type Goal = {
  id?: number;
  name: string;
  target: number;
  current: number;
  target_date: string;
  color: string;
};
export type GoalContribution = {
  id: number;
  goal_id: number;
  amount: number;
  funded_on: string;
  note: string;
  created_at: string;
};
export type CalendarEvent = {
  id?: number;
  title: string;
  event_type: string;
  amount: number;
  event_date: string;
  notes: string;
};
export type Trade = {
  id?: number;
  pair: string;
  setup: string;
  direction: string;
  result: number;
  status: "open" | "closed";
  traded_on: string;
  notes: string;
};
export type CashflowItem = {
  id: number;
  label: string;
  category: string;
  planned: number;
  spent: number;
  due_on: string;
  status: "planned" | "spent";
};
export type CashflowIncome = {
  id: number;
  name: string;
  expectedIncome: number;
  period_start: string;
  period_end: string;
  favorite_plan_id: number | null;
};
export type CashflowPlan = {
  id: number;
  income_id: number;
  incomeName: string;
  name: string;
  period_start: string;
  period_end: string;
  expectedIncome: number;
  savingsTarget: number;
  is_closed: boolean;
  plannedExpenses: number;
  spent: number;
  reserved: number;
  remaining: number;
  available: number;
  saved: number;
  items: CashflowItem[];
};
export type Settings = {
  id?: number;
  displayName: string;
  workspaceName: string;
  currency: string;
  weekStartsOn: string;
  notifications: boolean;
  profilePicture?: string;
};
export type Appearance = "system" | "light" | "dark";
export type BootstrapData = {
  transactions: Array<{
    kind: string;
    label: string;
    category: string;
    amount: number;
    occurred_on: string;
    recurring: boolean;
  }>;
  assets: Asset[];
  trades: Trade[];
  goals: Goal[];
  events: CalendarEvent[];
  cashflowPlans: CashflowPlan[];
  cashflowIncomes: CashflowIncome[];
  settings: Settings;
};
export type AddMode =
  | "expense"
  | "income"
  | "asset"
  | "trade"
  | "goal"
  | "event"
  | "cashflow-plan"
  | "cashflow-income"
  | null;
