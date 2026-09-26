import { ArrowDownLeft, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { localDateKey } from "../dates";
import type { CashflowItem, CashflowPlan } from "../types";
import { useMoney } from "../currency";

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
  plan,
  onCreatePlan,
  onEditPlan,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onMarkSpent,
}: {
  plan?: CashflowPlan;
  onCreatePlan: () => void;
  onEditPlan: () => void;
  onAddItem: (payload: Record<string, unknown>) => Promise<void>;
  onUpdateItem: (
    itemId: number,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onDeleteItem: (itemId: number) => Promise<void>;
  onMarkSpent: (item: CashflowItem) => Promise<void>;
}) {
  const money = useMoney();
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (item: CashflowItem) => {
    setEditingId(item.id);
    setForm({
      label: item.label,
      category: item.category,
      planned: String(item.planned),
      dueOn: item.due_on,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.label || !form.category || !form.planned) return;
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
          Create a plan for a pay period or month, enter expected income, then
          assign expenses and savings.
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
            Plan income, assign outflow, and keep the remainder visible.
          </p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={onEditPlan}>
            <Pencil size={16} /> Edit plan
          </button>
          <button className="secondary-button" onClick={onCreatePlan}>
            <Plus size={16} /> New plan
          </button>
        </div>
      </div>
      <div className="cash-summary planner-summary">
        <div>
          <span>Expected income</span>
          <strong>{money(plan.expectedIncome)}</strong>
          <small>What you expect to receive</small>
        </div>
        <div>
          <span>Planned expenses</span>
          <strong>{money(plan.plannedExpenses)}</strong>
          <small>{money(plan.spent)} spent so far</small>
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
            <span className="plan-status">
              {money(plan.available)} available
            </span>
          </div>
          <div className="expense-list">
            {plan.items.length === 0 && (
              <div className="empty-list">No expenses yet.</div>
            )}
            {plan.items.map((item, index) => (
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
                <strong>{money(item.planned)}</strong>
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
                  <button
                    className="icon-button"
                    onClick={() => startEdit(item)}
                    aria-label={`Edit ${item.label}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => {
                      if (
                        window.confirm(`Delete “${item.label}” from this plan?`)
                      ) {
                        onDeleteItem(item.id);
                      }
                    }}
                    aria-label={`Delete ${item.label}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel add-expense-panel" style={{'maxHeight':'470px'}}>
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
        </section>
      </div>
    </>
  );
}
