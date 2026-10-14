import { useMemo, useState } from "react";
import { Plus, Wallet, CalendarDays, Check, Search, Pencil, X } from "lucide-react";
import { localDateKey } from "../dates";
import { useMoney } from "../currency";
import type { Debt } from "../types";

const blankDebt = () => ({ name: "", lender: "", principal: "", interestRate: "", startedOn: localDateKey() });
const blankPlan = () => ({ name: "", amount: "", frequency: "monthly", nextDueOn: localDateKey() });
const blankPayment = () => ({ amount: "", paidOn: localDateKey(), note: "", planId: "" });

export default function DebtPage({ debts, selectedDebtId, onSelectDebt, onAddDebt, onAddPlan, onUpdatePlan, onAddPayment, onUpdatePayment }: {
  debts: Debt[];
  selectedDebtId: number | null;
  onSelectDebt: (id: number) => void;
  onAddDebt: (payload: Record<string, unknown>) => Promise<void>;
  onAddPlan: (debtId: number, payload: Record<string, unknown>) => Promise<void>;
  onUpdatePlan: (debtId: number, planId: number, payload: Record<string, unknown>) => Promise<void>;
  onAddPayment: (debtId: number, payload: Record<string, unknown>) => Promise<void>;
  onUpdatePayment: (debtId: number, paymentId: number, payload: Record<string, unknown>) => Promise<void>;
}) {
  const money = useMoney();
  const [debtForm, setDebtForm] = useState(blankDebt);
  const [planForm, setPlanForm] = useState(blankPlan);
  const [paymentForm, setPaymentForm] = useState(blankPayment);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const debt = debts.find((entry) => entry.id === selectedDebtId) ?? debts[0];
  const visibleDebts = useMemo(() => debts.filter((item) => `${item.name} ${item.lender}`.toLowerCase().includes(search.toLowerCase())), [debts, search]);
  const paidTotal = (item: Debt) => item.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const submit = async (event: React.FormEvent, action: () => Promise<void>, reset: () => void) => {
    event.preventDefault(); setError("");
    const formElement = event.currentTarget as HTMLFormElement;
    try { await action(); reset(); formElement.closest("details")?.removeAttribute("open"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save this entry"); }
  };

  return <>
    <div className="page-heading"><div><p className="eyebrow">Borrowing and repayments</p><h1>Debt</h1><p className="subheading">Track what you owe, plan repayments, and record payments.</p></div></div>
    {error && <div className="closed-plan-notice" role="alert">{error}</div>}
    <div className="cash-summary planner-summary debt-summary">
      <div><span>Debts</span><strong>{debts.length}</strong><small>Tracked in this workspace</small></div>
      <div><span>Original amount</span><strong>{money(debts.reduce((sum, item) => sum + item.principal, 0))}</strong><small>Across all debts</small></div>
      <div><span>Total repaid</span><strong>{money(debts.reduce((sum, item) => sum + paidTotal(item), 0))}</strong><small>Recorded payments</small></div>
    </div>

    <div className="debt-workspace">
      <aside className="panel debt-directory">
        <div className="debt-directory-heading"><div><p className="eyebrow">Your accounts</p><h2>Debts <span>{debts.length}</span></h2></div></div>
        <label className="debt-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search debts" aria-label="Search debts" /></label>
        <div className="debt-list" role="list" aria-label="Debt accounts">
          {visibleDebts.map((item) => <div role="listitem" key={item.id}><button type="button" className={`debt-item${debt?.id === item.id ? " selected" : ""}`} onClick={() => onSelectDebt(item.id)}>
            <span className="debt-item-icon"><Wallet size={17} /></span><span className="debt-item-copy"><strong>{item.name}</strong><small>{item.lender || "Lender not specified"}</small></span><span className="debt-item-amount"><strong>{money(item.principal)}</strong><small>{money(paidTotal(item))} paid</small></span>
          </button></div>)}
          {!visibleDebts.length && <p className="debt-empty">{debts.length ? "No matching debts." : "No debts yet. Add your first debt below."}</p>}
        </div>
        <details className="debt-disclosure">
          <summary><Plus size={16} /> Add debt</summary>
          <form className="debt-form" onSubmit={(event) => void submit(event, () => onAddDebt(debtForm), () => setDebtForm(blankDebt()))}>
            <label className="form-field"><span>Name</span><input required value={debtForm.name} onChange={(e) => setDebtForm({ ...debtForm, name: e.target.value })} placeholder="Car finance" /></label>
            <label className="form-field"><span>Lender</span><input value={debtForm.lender} onChange={(e) => setDebtForm({ ...debtForm, lender: e.target.value })} placeholder="Bank or person" /></label>
            <label className="form-field"><span>Original amount</span><input required type="number" min="0.01" step="0.01" value={debtForm.principal} onChange={(e) => setDebtForm({ ...debtForm, principal: e.target.value })} /></label>
            <label className="form-field"><span>Interest rate (%)</span><input type="number" min="0" step="0.01" value={debtForm.interestRate} onChange={(e) => setDebtForm({ ...debtForm, interestRate: e.target.value })} /></label>
            <label className="form-field"><span>Start date</span><input required type="date" value={debtForm.startedOn} onChange={(e) => setDebtForm({ ...debtForm, startedOn: e.target.value })} /></label>
            <button className="primary-button" type="submit"><Plus size={16} /> Save debt</button>
          </form>
        </details>
      </aside>

      {debt ? <section className="debt-detail">
        <section className="panel debt-overview"><div><p className="eyebrow">{debt.lender || "Lender not specified"} · {debt.interest_rate}% interest · Started {debt.started_on}</p><h2>{debt.name}</h2></div><div className="debt-overview-amount"><small>Original amount</small><strong>{money(debt.principal)}</strong><small>{money(paidTotal(debt))} repaid</small></div></section>
        <div className="debt-sections">
          <section className="panel debt-section">
            <div className="debt-section-heading"><div><CalendarDays size={18} /><div><p className="eyebrow">{debt.name}</p><h3>Repayment plans <span>{debt.repayment_plans.length}</span></h3></div></div></div>
            <div className="debt-record-list">
              {debt.repayment_plans.map((plan) => editingPlanId === plan.id ? <form className="debt-inline-edit" key={plan.id} onSubmit={(event) => void submit(event, () => onUpdatePlan(debt.id, plan.id, planForm), () => { setPlanForm(blankPlan()); setEditingPlanId(null); })}>
                <label className="form-field"><span>Plan name</span><input required value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} /></label>
                <label className="form-field"><span>Amount</span><input required type="number" min="0.01" step="0.01" value={planForm.amount} onChange={(e) => setPlanForm({ ...planForm, amount: e.target.value })} /></label>
                <label className="form-field"><span>Frequency</span><select value={planForm.frequency} onChange={(e) => setPlanForm({ ...planForm, frequency: e.target.value })}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option><option value="one-time">One time</option></select></label>
                <label className="form-field"><span>Next due date</span><input required type="date" value={planForm.nextDueOn} onChange={(e) => setPlanForm({ ...planForm, nextDueOn: e.target.value })} /></label>
                <div className="debt-edit-actions"><button className="primary-button" type="submit">Save changes</button><button className="icon-button" type="button" aria-label="Cancel editing plan" onClick={() => setEditingPlanId(null)}><X size={16} /></button></div>
              </form> : <div className="debt-record" key={plan.id}><div><strong>{plan.name}</strong><small>{plan.frequency} · Due {plan.next_due_on}</small></div><strong>{money(plan.amount)}</strong><button className="icon-button debt-edit-button" type="button" aria-label={`Edit ${plan.name}`} onClick={() => { setEditingPlanId(plan.id); setEditingPaymentId(null); setPlanForm({ name: plan.name, amount: String(plan.amount), frequency: plan.frequency, nextDueOn: plan.next_due_on }); }}><Pencil size={14} /></button></div>)}
              {!debt.repayment_plans.length && <p className="debt-empty">No plans added yet.</p>}
            </div>
            <details className="debt-disclosure"><summary><Plus size={15} /> Add repayment plan</summary>
              <form className="debt-form" onSubmit={(event) => void submit(event, () => onAddPlan(debt.id, planForm), () => setPlanForm(blankPlan()))}>
                <label className="form-field"><span>Plan name</span><input required value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="Monthly instalment" /></label>
                <label className="form-field"><span>Payment amount</span><input required type="number" min="0.01" step="0.01" value={planForm.amount} onChange={(e) => setPlanForm({ ...planForm, amount: e.target.value })} /></label>
                <label className="form-field"><span>Frequency</span><select value={planForm.frequency} onChange={(e) => setPlanForm({ ...planForm, frequency: e.target.value })}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annually">Annually</option><option value="one-time">One time</option></select></label>
                <label className="form-field"><span>Next due date</span><input required type="date" value={planForm.nextDueOn} onChange={(e) => setPlanForm({ ...planForm, nextDueOn: e.target.value })} /></label>
                <button className="primary-button" type="submit">Save plan</button>
              </form>
            </details>
          </section>

          <section className="panel debt-section">
            <div className="debt-section-heading"><div><Check size={18} /><div><p className="eyebrow">{debt.name}</p><h3>Payments made <span>{debt.payments.length}</span></h3></div></div></div>
            <div className="debt-record-list">
              {debt.payments.map((payment) => editingPaymentId === payment.id ? <form className="debt-inline-edit" key={payment.id} onSubmit={(event) => void submit(event, () => onUpdatePayment(debt.id, payment.id, paymentForm), () => { setPaymentForm(blankPayment()); setEditingPaymentId(null); })}>
                <label className="form-field"><span>Amount paid</span><input required type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label>
                <label className="form-field"><span>Payment date</span><input required type="date" value={paymentForm.paidOn} onChange={(e) => setPaymentForm({ ...paymentForm, paidOn: e.target.value })} /></label>
                <label className="form-field"><span>Repayment plan</span><select value={paymentForm.planId} onChange={(e) => setPaymentForm({ ...paymentForm, planId: e.target.value })}><option value="">Unplanned payment</option>{debt.repayment_plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
                <label className="form-field"><span>Note</span><input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} /></label>
                <div className="debt-edit-actions"><button className="primary-button" type="submit">Save changes</button><button className="icon-button" type="button" aria-label="Cancel editing payment" onClick={() => setEditingPaymentId(null)}><X size={16} /></button></div>
              </form> : <div className="debt-record" key={payment.id}><div><strong>{money(payment.amount)}</strong><small>{payment.paid_on}{payment.plan_id ? ` · ${debt.repayment_plans.find((plan) => plan.id === payment.plan_id)?.name || "Plan payment"}` : " · Unplanned"}{payment.note ? ` · ${payment.note}` : ""}</small></div><button className="icon-button debt-edit-button" type="button" aria-label={`Edit payment ${payment.paid_on}`} onClick={() => { setEditingPaymentId(payment.id); setEditingPlanId(null); setPaymentForm({ amount: String(payment.amount), paidOn: payment.paid_on, note: payment.note, planId: payment.plan_id ? String(payment.plan_id) : "" }); }}><Pencil size={14} /></button></div>)}
              {!debt.payments.length && <p className="debt-empty">No payments recorded yet.</p>}
            </div>
            <details className="debt-disclosure"><summary><Plus size={15} /> Record a payment</summary>
              <form className="debt-form" onSubmit={(event) => void submit(event, () => onAddPayment(debt.id, paymentForm), () => setPaymentForm(blankPayment()))}>
                <label className="form-field"><span>Amount paid</span><input required type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></label>
                <label className="form-field"><span>Payment date</span><input required type="date" value={paymentForm.paidOn} onChange={(e) => setPaymentForm({ ...paymentForm, paidOn: e.target.value })} /></label>
                <label className="form-field"><span>Repayment plan</span><select value={paymentForm.planId} onChange={(e) => setPaymentForm({ ...paymentForm, planId: e.target.value })}><option value="">Unplanned payment</option>{debt.repayment_plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
                <label className="form-field"><span>Note</span><input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} placeholder="Optional" /></label>
                <button className="primary-button" type="submit">Save payment</button>
              </form>
            </details>
          </section>
        </div>
      </section> : <div className="panel debt-no-selection"><Wallet size={24} /><h2>Select a debt account</h2><p>Choose an account from the list, or add one to get started.</p></div>}
    </div>
  </>;
}
