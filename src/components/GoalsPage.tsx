import { CalendarDays, Check, ChevronLeft, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Goal, GoalContribution } from "../types";
import { useMoney } from "../currency";
import { localDateKey } from "../dates";
import ListToolbar, { matchesSearch } from "./ListToolbar";

function goalProgress(goal: Goal) {
  if (!goal.target) return 0;
  return Math.min(100, Math.round((goal.current / goal.target) * 100));
}
function goalStatus(goal: Goal) {
  if (goal.current >= goal.target) return "funded";
  if (goal.current <= 0) return "not-started";
  return "in-progress";
}

type FundingInput = { amount: number; fundedOn: string; note: string };
type Props = {
  goals: Goal[];
  onAdd: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => Promise<void> | void;
  onLoadFunding: (goalId: number) => Promise<GoalContribution[]>;
  onAddFunding: (goalId: number, funding: FundingInput) => Promise<{ goal: Goal; contribution: GoalContribution }>;
};

export default function GoalsPage({ goals, onAdd, onEdit, onDelete, onLoadFunding, onAddFunding }: Props) {
  const money = useMoney();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [history, setHistory] = useState<GoalContribution[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [fundedOn, setFundedOn] = useState(localDateKey());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedGoal = goals.find((goal) => goal.id === selectedId) ?? null;
  const visibleGoals = useMemo(() => goals.filter((goal) =>
    (status === "all" || goalStatus(goal) === status) && matchesSearch(search, goal.name, goal.target_date, goal.color)), [goals, search, status]);

  useEffect(() => {
    if (!selectedId) return;
    let current = true;
    setHistoryLoading(true);
    setError("");
    onLoadFunding(selectedId).then((items) => { if (current) setHistory(items); })
      .catch((loadError: unknown) => { if (current) setError(loadError instanceof Error ? loadError.message : "Could not load funding history"); })
      .finally(() => { if (current) setHistoryLoading(false); });
    return () => { current = false; };
  }, [selectedId, onLoadFunding]);

  const submitFunding = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedGoal?.id || Number(amount) <= 0 || !fundedOn) return;
    setSaving(true); setError("");
    try {
      const result = await onAddFunding(selectedGoal.id, { amount: Number(amount), fundedOn, note: note.trim() });
      setHistory((items) => [result.contribution, ...items]);
      setAmount(""); setNote("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add funds");
    } finally { setSaving(false); }
  };

  return <>
    <div className="page-heading">
      <div><p className="eyebrow">Planning</p><h1>Give your money a job.</h1><p className="subheading">Turn the things you want into a pace you can actually follow.</p></div>
      <button className="primary-button" onClick={onAdd}><Plus size={18} /> New goal</button>
    </div>
    {selectedGoal ? <>
      <button className="text-button goal-back" onClick={() => { setSelectedId(null); setError(""); }}><ChevronLeft size={16} /> All goals</button>
      <div className="goal-detail-grid">
        <section className="panel goal-detail-summary">
          <div className="goal-detail-title"><div className={`goal-orb ${selectedGoal.color}`}><Target size={20} /></div><button className="icon-button" onClick={() => onEdit(selectedGoal)} aria-label={`Edit ${selectedGoal.name}`}><Pencil size={17} /></button></div>
          <span className="eyebrow">Goal · Target date {selectedGoal.target_date}</span>
          <h2>{selectedGoal.name}</h2>
          <div className="goal-card-amount"><strong>{money(selectedGoal.current)}</strong><span>of {money(selectedGoal.target)}</span></div>
          <div className="progress"><span style={{ width: `${goalProgress(selectedGoal)}%` }} /></div>
          <div className="goal-footer"><span>{goalProgress(selectedGoal)}% funded</span><span>{money(Math.max(0, selectedGoal.target - selectedGoal.current))} to go</span></div>
        </section>
        <div className="goal-funding-column">
          <section className="panel goal-funding-form">
            <h2><Plus size={18} /> Add funds</h2>
            <form onSubmit={submitFunding}>
              <label className="form-field"><span>Amount</span><input type="number" min="0.01" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
              <label className="form-field"><span>Date</span><input type="date" required value={fundedOn} onChange={(event) => setFundedOn(event.target.value)} /></label>
              <label className="form-field"><span>Note <small>Optional</small></span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Monthly contribution" /></label>
              {error && <p className="goal-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={saving}>{saving ? "Adding…" : "Add funds"}</button>
            </form>
          </section>
          <section className="panel goal-history">
            <div className="goal-history-heading"><h2>Funding history</h2><span>{history.length} {history.length === 1 ? "entry" : "entries"}</span></div>
            {historyLoading ? <p className="empty-list">Loading history…</p> : history.length ? <ul>{history.map((entry) => <li key={entry.id}><span className="funding-date"><CalendarDays size={15} />{entry.funded_on}</span><span className="funding-note">{entry.note || "Contribution"}</span><strong><Check size={15} /> {money(entry.amount)}</strong></li>)}</ul> : <p className="empty-list">No funding recorded yet.</p>}
          </section>
        </div>
      </div>
    </> : goals.length ? <>
      <ListToolbar compactSearch className="is-leading" search={search} onSearch={setSearch} searchPlaceholder="Search goals" searchLabel="Search goals" filters={[{ id: "status", value: status, ariaLabel: "Filter by progress", onChange: setStatus, options: [{ value: "all", label: "All goals" }, { value: "in-progress", label: "In progress" }, { value: "funded", label: "Funded" }, { value: "not-started", label: "Not started" }] }]} />
      {visibleGoals.length ? <div className="goal-list">{visibleGoals.map((goal) => <article className="panel goal-list-row" key={goal.id ?? goal.name}>
        <button className="goal-list-open" onClick={() => goal.id && setSelectedId(goal.id)} aria-label={`View ${goal.name} details`}>
          <span className={`goal-orb ${goal.color}`}><Target size={19} /></span>
          <span className="goal-list-name"><strong>{goal.name}</strong><small>Target date · {goal.target_date}</small></span>
          <span className="goal-list-progress"><span className="goal-list-value"><strong>{money(goal.current)}</strong><small>of {money(goal.target)}</small><b>{goalProgress(goal)}%</b></span><span className="progress"><span style={{ width: `${goalProgress(goal)}%` }} /></span></span>
        </button>
        <div className="row-actions"><button className="icon-button" onClick={() => onEdit(goal)} aria-label={`Edit ${goal.name}`}><Pencil size={16} /></button><button className="icon-button danger" onClick={async () => { if (window.confirm(`Delete goal “${goal.name}”?`)) await onDelete(goal); }} aria-label={`Delete ${goal.name}`}><Trash2 size={16} /></button></div>
      </article>)}</div> : <div className="empty-list panel">No goals match this search.</div>}
    </> : <div className="empty-state panel"><div className="empty-icon"><Target size={24} /></div><span className="eyebrow">Goals</span><h1>Give your next milestone a name.</h1><p>Set a target and watch your progress move with the rest of your plan.</p><button className="primary-button" onClick={onAdd}><Plus size={18} /> Create goal</button></div>}
  </>;
}
