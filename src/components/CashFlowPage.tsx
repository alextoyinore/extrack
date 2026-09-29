import { ArrowDownLeft, Pencil, Plus, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import { dateKeyFromValue, localDateKey } from "../dates";
import type { CashflowIncome, CashflowItem, CashflowPlan } from "../types";
import { useMoney } from "../currency";
import ListToolbar, { matchesSearch, uniqueOptions } from "./ListToolbar";

type ExpenseForm = {
  label: string;
  category: string;
  planned: string;
  dueOn: string;
};

const emptyForm = (): ExpenseForm => ({
  label: "",
  category: "",
  planned: "",
  dueOn: localDateKey(),
});

export default function CashFlowPage({
  plans,
  incomes,
  income,
  plan,
  favoritePlanId,
  onToggleClosed,
  onSelectIncome,
  onSelectPlan,
  onSetFavorite,
  onCreateIncome,
  onEditIncome,
  onCreatePlan,
  onEditPlan,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onMarkSpent,
  onTransferExpense,
}: {
  plans: CashflowPlan[];
  incomes: CashflowIncome[];
  income?: CashflowIncome;
  plan?: CashflowPlan;
  favoritePlanId?: number | null;
  onSelectIncome: (incomeId: number) => void;
  onSelectPlan: (planId: number) => void;
  onSetFavorite: (planId: number) => Promise<void>;
  onToggleClosed: (planId: number, isClosed: boolean) => Promise<void>;
  onCreateIncome: () => void;
  onEditIncome: () => void;
  onCreatePlan: () => void;
  onEditPlan: () => void;
  onAddItem: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateItem: (
    itemId: number,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onDeleteItem: (itemId: number) => Promise<void>;
  onMarkSpent: (item: CashflowItem) => Promise<void>;
  onTransferExpense: (itemId: number, destinationPlanId: number, mode: "copy" | "move") => Promise<void>;
}) {
  const money = useMoney();
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [transferItemId, setTransferItemId] = useState<number | null>(null);
  const [destinationPlanId, setDestinationPlanId] = useState<number | null>(null);
  const [transferError, setTransferError] = useState("");
  const [formError, setFormError] = useState("");

  const startEdit = (item: CashflowItem) => {
    setEditingId(item.id);
    setForm({
      label: item.label,
      category: item.category,
      planned: String(item.planned),
      dueOn: dateKeyFromValue(item.due_on),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.label || !form.category || !form.planned) return;
    setFormError("");
    try {
      if (editingId) {
        await onUpdateItem(editingId, {
          label: form.label,
          category: form.category,
          planned: form.planned,
          dueOn: form.dueOn,
        });
        cancelEdit();
        return;
      }
      await onAddItem({ ...form, spent: 0, status: "planned" });
      setForm({ ...emptyForm(), dueOn: form.dueOn });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Could not save expense");
    }
  };

  const visibleItems = useMemo(() => {
    if (!plan) return [];
    return plan.items.filter((item) => {
      const matchesCategory = category === "all" || item.category === category;
      const matchesStatus = status === "all" || item.status === status;
      return (
        matchesCategory &&
        matchesStatus &&
        matchesSearch(search, item.label, item.category, item.due_on, item.status)
      );
    });
  }, [plan, category, status, search]);

  if (!income)
    return (
      <div className="empty-state panel">
        <div className="empty-icon">
          <Wallet size={24} />
        </div>
        <span className="eyebrow">Cash flow planner</span>
        <h1>Start with the money coming in.</h1>
        <p>
          Add an expected income once, then compare multiple plans for how to use it.
        </p>
        <button className="primary-button" onClick={onCreateIncome}>
          <Plus size={18} /> Add expected income
        </button>
      </div>
    );

  const incomePlans = plans.filter((entry) => entry.income_id === income.id);
  const transferPlans = incomePlans.filter((entry) => !entry.is_closed && entry.id !== plan?.id);
  if (!plan)
    return <>
      <div className="page-heading">
        <div><p className="eyebrow">{income.period_start} to {income.period_end}</p><h1>{income.name}</h1><p className="subheading">Expected income · {money(income.expectedIncome)} · No plans yet.</p></div>
        <div className="heading-actions">
          <label className="plan-picker"><span>Income</span><select value={income.id} onChange={(event) => onSelectIncome(Number(event.target.value))}>{incomes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <button className="secondary-button" onClick={onEditIncome}><Pencil size={16} /> Edit income</button>
          <button className="primary-button" onClick={onCreatePlan}><Plus size={16} /> Create first plan</button>
        </div>
      </div>
      <section className="panel income-no-plans"><Wallet size={20} /><strong>Start with a plan for this income.</strong><span>You can add another plan later to compare a different way to use the same money.</span></section>
    </>;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {income.period_start} to {income.period_end}
          </p>
          <h1>{income.name}</h1>
          <p className="subheading">
            {plan.name} · compare different ways to use this income.
          </p>
        </div>
        <div className="heading-actions">
          <label className="plan-picker">
            <span>Income</span>
            <select value={income.id} onChange={(event) => onSelectIncome(Number(event.target.value))} aria-label="Select expected income">
              {incomes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {money(entry.expectedIncome)}</option>)}
            </select>
          </label>
          <label className="plan-picker">
            <span>Plan</span>
            <select value={plan.id} onChange={(event) => onSelectPlan(Number(event.target.value))} aria-label="Select cash flow plan">
              {incomePlans.map((entry) => <option key={entry.id} value={entry.id}>{entry.is_closed ? "Closed · " : ""}{entry.id === favoritePlanId ? "★ " : ""}{entry.name}</option>)}
            </select>
          </label>
          <button className="secondary-button" onClick={onEditIncome}>
            <Pencil size={16} /> Edit income
          </button>
          <button className="secondary-button" onClick={onCreatePlan}>
            <Plus size={16} /> New plan
          </button>
          <details className="plan-actions-menu">
            <summary className="icon-button plan-actions-trigger" aria-label="Manage plan" title="Manage plan">⋯</summary>
            <div className="plan-actions-popover">
              <button type="button" onClick={() => void onSetFavorite(plan.id)} disabled={favoritePlanId === plan.id || plan.is_closed}>
                <span aria-hidden="true">{favoritePlanId === plan.id ? "★" : "☆"}</span>{favoritePlanId === plan.id ? "Favourite plan" : "Make favourite"}
              </button>
              <button type="button" onClick={() => void onToggleClosed(plan.id, !plan.is_closed)}>
                {plan.is_closed ? "Reopen plan" : "Close plan"}
              </button>
            </div>
          </details>
          <button className="icon-button" onClick={onEditPlan} aria-label="Rename selected plan" title="Rename plan">
            <Pencil size={15} />
          </button>
        </div>
      </div>
      {plan.is_closed && <div className="closed-plan-notice">This plan is closed. Its planned amounts are excluded from current totals; any amounts already marked spent remain in history.</div>}
      <div className="cash-summary planner-summary">
        <div>
          <span>Expected income</span>
          <strong>{money(plan.expectedIncome)}</strong>
          <small>What you expect to receive</small>
        </div>
        <div>
          <span>Planned expenses</span>
          <strong>{money(plan.plannedExpenses)}</strong>
          <small>{plan.is_closed ? "Historical spending in this plan" : `${money(plan.spent)} spent across active plans for this income`}</small>
        </div>
        <div>
          <span>Left to assign</span>
          <strong className={plan.remaining >= 0 ? "green-text" : "negative"}>
            {money(plan.remaining)}
          </strong>
          <small>After savings target</small>
        </div>
        <div>
          <span>Saved target</span>
          <strong className="green-text">{money(plan.saved)}</strong>
          <small>{money(plan.reserved)} reserved</small>
        </div>
      </div>
      <div className="content-grid planner-grid">
        <section className="panel table-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Expense plan</span>
              <h2>Where the income goes</h2>
            </div>
            <ListToolbar
              compactSearch
              search={search}
              onSearch={setSearch}
              searchPlaceholder="Search expenses"
              searchLabel="Search expenses"
              filters={[
                {
                  id: "category",
                  value: category,
                  ariaLabel: "Filter by category",
                  onChange: setCategory,
                  options: [
                    { value: "all", label: "All categories" },
                    ...uniqueOptions(plan.items.map((item) => item.category)),
                  ],
                },
                {
                  id: "status",
                  value: status,
                  ariaLabel: "Filter by status",
                  onChange: setStatus,
                  options: [
                    { value: "all", label: "All statuses" },
                    { value: "planned", label: "Planned" },
                    { value: "spent", label: "Spent" },
                  ],
                },
              ]}
            />
          </div>
          <div className="expense-list">
            {visibleItems.length === 0 && (
              <div className="empty-list">
                {plan.items.length === 0
                  ? "No expenses yet."
                  : "No expenses match this search."}
              </div>
            )}
            {visibleItems.map((item, index) => (
              <div
                className={`expense-row ${editingId === item.id ? "is-editing" : ""}`}
                key={item.id}
              >
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
                <strong>{money(item.status === "spent" ? item.spent : item.planned)}</strong>
                <div className="row-actions">
                  {item.status === "planned" && (
                    <button
                      className="text-button"
                      onClick={() => onMarkSpent(item)}
                    >
                      Mark spent
                    </button>
                  )}
                  {item.status === "spent" && (
                    <span className="spent-check">Done</span>
                  )}
                  {!plan.is_closed && <>
                    <button className="icon-button expense-transfer-trigger" onClick={() => {
                      const opening = transferItemId !== item.id;
                      setTransferItemId(opening ? item.id : null);
                      setDestinationPlanId(transferPlans[0]?.id ?? null);
                      setTransferError("");
                    }} aria-label={`Copy or move ${item.label}`} title="Copy or move to another plan">⇄</button>
                    <button className="icon-button" onClick={() => startEdit(item)} aria-label={`Edit ${item.label}`}><Pencil size={15} /></button>
                    <button className="icon-button danger" onClick={() => { if (window.confirm(`Delete “${item.label}” from this plan?`)) onDeleteItem(item.id); }} aria-label={`Delete ${item.label}`}><X size={15} /></button>
                  </>}
                </div>
                {transferItemId === item.id && <div className="expense-transfer-popover">
                  <label><span>Destination plan</span><select value={destinationPlanId ?? ""} onChange={(event) => setDestinationPlanId(Number(event.target.value) || null)} disabled={!transferPlans.length}>
                    {transferPlans.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                  </select></label>
                  {!transferPlans.length && <span className="expense-transfer-error">There are no other open plans under this income.</span>}
                  {transferError && <span className="expense-transfer-error">{transferError}</span>}
                  <div><button type="button" className="secondary-button" disabled={!destinationPlanId} onClick={async () => {
                    if (!destinationPlanId) return;
                    try { await onTransferExpense(item.id, destinationPlanId, "copy"); setTransferItemId(null); }
                    catch (error) { setTransferError(error instanceof Error ? error.message : "Could not copy expense"); }
                  }}>Copy</button><button type="button" className="primary-button" disabled={!destinationPlanId} onClick={async () => {
                    if (!destinationPlanId) return;
                    try { await onTransferExpense(item.id, destinationPlanId, "move"); setTransferItemId(null); }
                    catch (error) { setTransferError(error instanceof Error ? error.message : "Could not move expense"); }
                  }}>Move</button><button type="button" className="text-button" onClick={() => setTransferItemId(null)}>Cancel</button></div>
                </div>}
              </div>
            ))}
          </div>
        </section>
        {plan.is_closed ? <section className="panel add-expense-panel closed-plan-archive"><span className="eyebrow">Plan archive</span><h2>Reopen this plan to make changes</h2><p>Closed plans stay available for reference and historical spending.</p></section> : <section className="panel add-expense-panel" style={{'maxHeight':'470px'}}>
          <div className="panel-header">
            <div>
              <span className="eyebrow">
                {editingId ? "Edit expense" : "Assign income"}
              </span>
              <h2>{editingId ? "Update expense" : "Add an expense"}</h2>
            </div>
            <ArrowDownLeft size={18} color="#c66f58" />
          </div>
          <form className="planner-form" onSubmit={submit}>
            {formError && <p className="expense-transfer-error" role="alert">{formError}</p>}
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
              <Plus size={17} /> {editingId ? "Save changes" : "Add to plan"}
            </button>
            {editingId && (
              <button
                className="secondary-button form-submit"
                type="button"
                onClick={cancelEdit}
              >
                Cancel
              </button>
            )}
          </form>
        </section>}
      </div>
    </>
  );
}
