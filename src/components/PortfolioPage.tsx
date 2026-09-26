import {
  ArrowUpRight,
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
  const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
  const totalCost = assets.reduce((sum, asset) => sum + asset.costBasis, 0);
  const todayChange = assets.reduce((sum, asset) => sum + asset.dayChange, 0);
  const totalReturn = totalValue - totalCost;
  const returnPercent = totalCost ? (totalReturn / totalCost) * 100 : 0;
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
          <small>
            <ArrowUpRight size={14} />{" "}
            {totalCost
              ? `${money.format(totalReturn)} (${returnPercent.toFixed(1)}%) all time`
              : "Add positions to track returns"}
          </small>
        </div>
        <div className="portfolio-stat">
          <span>Today's change</span>
          <strong className={todayChange >= 0 ? "green-text" : "negative"}>
            {todayChange >= 0 ? "+" : ""}
            {money.format(todayChange)}
          </strong>
          <small>
            {assets.length
              ? `${((todayChange / Math.max(totalValue, 1)) * 100).toFixed(2)}% today`
              : "No market data yet"}
          </small>
        </div>
        <div className="portfolio-stat">
          <span>Contributions</span>
          <strong>{money.format(totalCost)}</strong>
          <small>
            {assets.length
              ? "Cost basis across positions"
              : "Add an investment to begin"}
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
              <span>Value</span>
              <span>Return</span>
              <span>Allocation</span>
              <span>Actions</span>
            </div>
            {assets.map((asset) => (
              <div className="holding-row" key={asset.id ?? asset.symbol}>
                <div className="asset-name">
                  <div className="asset-symbol">{asset.symbol.slice(0, 2)}</div>
                  <div>
                    <strong>{asset.symbol}</strong>
                    <span>{asset.name}</span>
                  </div>
                </div>
                <span className="asset-type">{asset.type}</span>
                <strong>{money.format(asset.value)}</strong>
                <strong
                  className={asset.changePercent >= 0 ? "positive" : "negative"}
                >
                  {asset.changePercent >= 0 ? "+" : ""}
                  {asset.changePercent.toFixed(1)}%
                </strong>
                <div className="allocation-bar">
                  <span style={{ width: `${asset.allocation * 2.5}%` }} />
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
            ))}
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
