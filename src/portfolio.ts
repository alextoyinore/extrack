import type { Asset } from "./types";

export function withPortfolioMetrics(assets: Asset[]): Asset[] {
  const totalValue = assets.reduce(
    (sum, asset) => sum + Number(asset.value || 0),
    0,
  );
  return assets.map((asset) => {
    const invested = Number(asset.costBasis || 0);
    const value = Number(asset.value || 0);
    const gain = value - invested;
    return {
      ...asset,
      changePercent: invested ? (gain / invested) * 100 : 0,
      allocation: totalValue ? (value / totalValue) * 100 : 0,
    };
  });
}
