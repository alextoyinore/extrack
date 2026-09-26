import {
  BriefcaseBusiness,
  ChevronDown,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import type { Asset } from "../types";
import { useMoney } from "../currency";

export default function PortfolioPage({
  assets,
  onAdd,
  onEdit,
  onDelete,
  notify,
}: {
  assets: Asset[];
  onAdd: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (asset: Asset) => void;
  notify: (message: string) => void;
}) {
  const money = { format: useMoney() };
  const totalValue = assets.reduce((sum, asset) => sum + Number(asset.value || 0), 0);
  const totalCost = assets.reduce(
    (sum, asset) => sum + Number(asset.costBasis || 0),
    0,
  );
  const totalReturn = totalValue - totalCost;
  const returnPercent = totalCost ? (totalReturn / totalCost) * 100 : 0;
  const formatSigned = (value: number, percent = false) =>
    `${value >= 0 ? "+" : ""}${
      percent ? `${value.toFixed(1)}%` : money.format(value)
    }`;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Your portfolio</p>
          <h1>Own your direction.</h1>
          <p className="subheading">
            A calm home for every position, from ETFs to FX.
          </p>
        </div>
        <button className="primary-button" onClick={onAdd}>
          <Plus size={18} /> Add position
        </button>
      </div>
      <div className="portfolio-hero">
        <div>
          <span>Total portfolio value</span>
          <strong>{money.format(totalValue)}</strong>
          <small className={totalReturn >= 0 ? "green-text" : "negative"}>
            {totalCost
              ? `${formatSigned(totalReturn)} (${formatSigned(returnPercent, true)}) overall`
              : "Add positions to track returns"}
          </small>
        </div>
        <div className="portfolio-stat">
          <span>Amount invested</span>
          <strong>{money.format(totalCost)}</strong>
          <small>
            {assets.length
              ? "What you put into these positions"
              : "Add an investment to begin"}
          </small>
        </div>
        <div className="portfolio-stat">
          <span>Overall growth</span>
          <strong className={totalReturn >= 0 ? "green-text" : "negative"}>
            {assets.length ? formatSigned(returnPercent, true) : "—"}
          </strong>
          <small>
            {assets.length
              ? `${formatSigned(totalReturn)} vs invested`
              : "Calculated from invested vs current value"}
          </small>
        </div>
      </div>
      {assets.length ? (
        <section className="panel holdings-panel">
          <div className="panel-header">
            <div>
              <span className="eyebrow">Holdings</span>
              <h2>Everything in one view</h2>
            </div>
            <div className="table-actions">
              <button
                className="icon-button"
                onClick={() => notify("Search holdings")}
                aria-label="Search holdings"
              >
                <Search size={17} />
              </button>
              <button className="select-button">
                All assets <ChevronDown size={14} />
              </button>
            </div>
          </div>
          <div className="holdings-table">
            <div className="holding-head">
              <span>Asset</span>
              <span>Type</span>
              <span>Invested</span>
              <span>Current</span>
              <span>Change</span>
              <span>Allocation</span>
              <span>Actions</span>
            </div>
            {assets.map((asset) => {
              const invested = Number(asset.costBasis || 0);
              const value = Number(asset.value || 0);
              const gain = value - invested;
              const changePercent = invested ? (gain / invested) * 100 : 0;
              const allocation = totalValue ? (value / totalValue) * 100 : 0;
              return (
              <div className="holding-row" key={asset.id ?? asset.symbol}>
                <div className="asset-name">
                  <div className="asset-symbol">{asset.symbol.slice(0, 2)}</div>
                  <div>
                    <strong>{asset.symbol}</strong>
                    <span>{asset.name}</span>
                  </div>
                </div>
                <span className="asset-type">{asset.type}</span>
                <strong className="holding-invested">
                  {money.format(invested)}
                </strong>
                <strong className="holding-value">{money.format(value)}</strong>
                <strong
                  className={`holding-return ${changePercent >= 0 ? "positive" : "negative"}`}
                >
                  {formatSigned(changePercent, true)}
                  <small>{formatSigned(gain)}</small>
                </strong>
                <div className="allocation-bar">
                  <div className="allocation-track">
                    <span style={{ width: `${Math.min(allocation, 100)}%` }} />
                  </div>
                  <em>{allocation.toFixed(1)}%</em>
                </div>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    onClick={() => onEdit(asset)}
                    aria-label={`Edit ${asset.symbol}`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete ${asset.symbol} from your portfolio?`,
                        )
                      ) {
                        onDelete(asset);
                      }
                    }}
                    aria-label={`Delete ${asset.symbol}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        </section>
      ) : (
        <div className="empty-state panel">
          <div className="empty-icon">
            <BriefcaseBusiness size={24} />
          </div>
          <span className="eyebrow">Portfolio</span>
          <h1>Your positions belong here.</h1>
          <p>
            Add stocks, ETFs, mutual funds, bonds, or forex positions. Portfolio
            totals will be calculated from the records you save.
          </p>
          <button className="primary-button" onClick={onAdd}>
            <Plus size={18} /> Add position
          </button>
        </div>
      )}
    </>
  );
}
