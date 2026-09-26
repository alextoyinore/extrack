import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { Goal } from "../types";
import { useMoney } from "../currency";
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

export default function GoalsPage({
  goals,
  onAdd,
  onEdit,
  onDelete,
}: {
  goals: Goal[];
  onAdd: () => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}) {
  const money = useMoney();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const visibleGoals = useMemo(
    () =>
      goals.filter((goal) => {
        const matchesStatus = status === "all" || goalStatus(goal) === status;
        return (
          matchesStatus &&
          matchesSearch(search, goal.name, goal.target_date, goal.color)
        );
      }),
    [goals, search, status],
  );
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
      {goals.length ? (
        <>
          <ListToolbar
            className="is-leading"
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search goals"
            searchLabel="Search goals"
            filters={[
              {
                id: "status",
                value: status,
                ariaLabel: "Filter by progress",
                onChange: setStatus,
                options: [
                  { value: "all", label: "All goals" },
                  { value: "in-progress", label: "In progress" },
                  { value: "funded", label: "Funded" },
                  { value: "not-started", label: "Not started" },
                ],
              },
            ]}
          />
          {visibleGoals.length ? (
            <div className="goals-grid">
              {visibleGoals.map((goal) => {
                const progress = goalProgress(goal);
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
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          onClick={() => onEdit(goal)}
                          aria-label={`Edit ${goal.name}`}
                        >
                          <Pencil size={17} />
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => {
                            if (window.confirm(`Delete goal “${goal.name}”?`)) {
                              onDelete(goal);
                            }
                          }}
                          aria-label={`Delete ${goal.name}`}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </div>
                    <div className="goal-card-amount">
                      <strong>{money(goal.current)}</strong>
                      <span>of {money(goal.target)}</span>
                    </div>
                    <div className="progress">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                    <div className="goal-footer">
                      <span>{progress}% funded</span>
                      <button
                        className="text-button"
                        onClick={() => onEdit(goal)}
                      >
                        Edit goal <Plus size={14} />
                      </button>
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="empty-list panel">No goals match this search.</div>
          )}
        </>
      ) : (
        <div className="empty-state panel">
          <div className="empty-icon">
            <Target size={24} />
          </div>
          <span className="eyebrow">Goals</span>
          <h1>Give your next milestone a name.</h1>
          <p>
            Set a target and watch your progress move with the rest of your
            plan.
          </p>
          <button className="primary-button" onClick={onAdd}>
            <Plus size={18} /> Create goal
          </button>
        </div>
      )}
    </>
  );
}
