import {
  BarChart3,
  BookOpen,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Trade } from "../types";
import { useMoney } from "../currency";
import ListToolbar, { matchesSearch, uniqueOptions } from "./ListToolbar";

export default function ForexJournalPage({
  trades,
  onAdd,
  onEdit,
  onDelete,
}: {
  trades: Trade[];
  onAdd: () => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
}) {
  const money = useMoney();
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const wins = trades.filter((trade) => trade.result > 0).length;
  const net = trades.reduce((sum, trade) => sum + trade.result, 0);
  const entries = useMemo(
    () =>
      trades.filter((trade) => {
        const matchesDirection =
          direction === "all" ||
          trade.direction.toLowerCase() === direction.toLowerCase();
        const matchesOutcome =
          outcome === "all" ||
          (outcome === "win" && trade.result > 0) ||
          (outcome === "loss" && trade.result < 0) ||
          (outcome === "breakeven" && trade.result === 0);
        return (
          matchesDirection &&
          matchesOutcome &&
          matchesSearch(
            search,
            trade.pair,
            trade.setup,
            trade.direction,
            trade.notes,
            trade.traded_on,
          )
        );
      }),
    [trades, direction, outcome, search],
  );
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
        <Metric
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
        <Metric
          label="Net P&L"
          value={money(net)}
          meta="From logged trades"
          icon={<TrendingUp size={20} />}
          tone="gold"
        />
        <Metric
          label="Average trade"
          value={trades.length ? money(net / trades.length) : money(0)}
          meta="Across the journal"
          icon={<BarChart3 size={20} />}
          tone="lavender"
        />
        <Metric
          label="Best pair"
          value={trades[0]?.pair || "—"}
          meta="Most recently logged"
          icon={<Sparkles size={20} />}
          tone="coral"
        />
      </div>
      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Recent entries</span>
            <h2>Read your own tape</h2>
          </div>
          <ListToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Search trades"
            searchLabel="Search trades"
            filters={[
              {
                id: "direction",
                value: direction,
                ariaLabel: "Filter by direction",
                onChange: setDirection,
                options: [
                  { value: "all", label: "All directions" },
                  ...uniqueOptions(trades.map((trade) => trade.direction)),
                ],
              },
              {
                id: "outcome",
                value: outcome,
                ariaLabel: "Filter by outcome",
                onChange: setOutcome,
                options: [
                  { value: "all", label: "All results" },
                  { value: "win", label: "Wins" },
                  { value: "loss", label: "Losses" },
                  { value: "breakeven", label: "Break even" },
                ],
              },
            ]}
          />
        </div>
        <div className="journal-list">
          {entries.map((trade) => (
            <div
              className="journal-row"
              key={trade.id ?? `${trade.pair}-${trade.traded_on}`}
            >
              <div className="pair-icon">{trade.pair.slice(0, 1)}</div>
              <div>
                <strong>{trade.pair}</strong>
                <span>
                  {trade.setup} · {trade.direction}
                </span>
              </div>
              <time>{trade.traded_on}</time>
              <strong className={trade.result >= 0 ? "positive" : "negative"}>
                {money(trade.result)}
              </strong>
              <div className="row-actions">
                <button
                  className="icon-button"
                  onClick={() => onEdit(trade)}
                  aria-label={`Edit ${trade.pair}`}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-button danger"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete ${trade.pair} trade from ${trade.traded_on}?`,
                      )
                    ) {
                      onDelete(trade);
                    }
                  }}
                  aria-label={`Delete ${trade.pair}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {!entries.length && (
          <div className="empty-list">
            <BookOpen size={18} />{" "}
            {trades.length ? "No trades match this search." : "No trades logged yet."}
          </div>
        )}
      </section>
    </>
  );
}
function Metric({
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
