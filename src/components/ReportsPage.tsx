import { BarChart3, BookOpen, FileText } from "lucide-react";
import type { Asset, CashItem, CashflowIncome, CashflowPlan, Goal, Trade } from "../types";
import { useMoney } from "../currency";

export default function ReportsPage({
  expenses,
  income,
  assets,
  trades,
  goals,
  cashflowIncomes,
  cashflowPlans,
}: {
  expenses: CashItem[];
  income: CashItem[];
  assets: Asset[];
  trades: Trade[];
  goals: Goal[];
  cashflowIncomes: CashflowIncome[];
  cashflowPlans: CashflowPlan[];
}) {
  const money = useMoney();
  const planSpends = new Map<string, number>();
  for (const plan of cashflowPlans) {
    for (const item of plan.items) {
      if (item.status !== "spent") continue;
      const key = `${plan.income_id}:${item.label.trim().toLocaleLowerCase()}:${item.category.trim().toLocaleLowerCase()}`;
      planSpends.set(key, Math.max(planSpends.get(key) || 0, item.spent));
    }
  }
  const planSpent = [...planSpends.values()].reduce((sum, amount) => sum + amount, 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0) + planSpent;
  const uniqueIncomes = [...new Map(cashflowIncomes.map((item) => [
    `${item.name.trim().toLocaleLowerCase()}:${item.period_start}:${item.period_end}:${item.expectedIncome}`,
    item,
  ])).values()];
  const hasRecordedIncome = (expected: CashflowIncome) => income.some((item) =>
    item.label.trim().toLocaleLowerCase() === expected.name.trim().toLocaleLowerCase() &&
    item.date >= expected.period_start && item.date <= expected.period_end);
  const expectedOnlyIncome = uniqueIncomes
    .filter((item) => !hasRecordedIncome(item))
    .reduce((sum, item) => sum + item.expectedIncome, 0);
  const totalIncome = income.reduce((sum, item) => sum + item.amount, 0) + expectedOnlyIncome;
  const portfolio = assets.reduce((sum, asset) => sum + asset.value, 0);
  const wins = trades.filter((trade) => trade.result > 0).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Reports</p>
          <h1>Make the pattern visible.</h1>
          <p className="subheading">
            A simple read on cash flow, investing, and progress.
          </p>
        </div>
        <button className="secondary-button" onClick={() => window.print()}>
          <FileText size={16} /> Export report
        </button>
      </div>
      <div className="report-highlight">
        <div>
          <span>Net cash flow</span>
          <strong>{money(totalIncome - totalExpenses)}</strong>
          <small>Recorded and expected income less expenses, including plan items marked spent</small>
        </div>
        <div>
          <span>Portfolio tracked</span>
          <strong>{money(portfolio)}</strong>
          <small>{assets.length} positions</small>
        </div>
        <div>
          <span>Goal progress</span>
          <strong>
            {goals.length
              ? `${Math.round((goals.reduce((sum, goal) => sum + goal.current / goal.target, 0) / goals.length) * 100)}%`
              : "0%"}
          </strong>
          <small>Average active goal progress</small>
        </div>
      </div>
      <div className="reports-grid">
        <section className="panel report-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Cash flow</span>
              <h2>Income allocation</h2>
            </div>
            <BarChart3 size={18} color="#1878b8" />
          </div>
          <ReportBar
            label="Income"
            amount={money(totalIncome)}
            width="100%"
            tone="income"
          />
          <ReportBar
            label="Expenses"
            amount={money(totalExpenses)}
            width={`${Math.min(100, (totalExpenses / Math.max(totalIncome, 1)) * 100)}%`}
            tone="expense"
          />
          <ReportBar
            label="Available"
            amount={money(Math.max(0, totalIncome - totalExpenses))}
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
                ? `${Math.round((wins / trades.length) * 100)}%`
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
              {money(trades.reduce((sum, trade) => sum + trade.result, 0))}
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
