import type { OFTier } from "../../api";

const TIER_TXT: Record<OFTier, string> = {
  T1: "L2 + trades con agresor (datos reales)",
  T2: "trades reales sin profundidad (DOM/heatmap aprox.)",
  T3: "solo OHLCV — reconstruido por regla del tick",
};

export function TierBadge({ tier }: { tier: OFTier }) {
  const cls = tier === "T1" ? "ofx-pos" : tier === "T2" ? "ofx-warn" : "ofx-neu";
  return <span className={`ofx-badge ${cls}`} title={TIER_TXT[tier]}>TIER {tier}</span>;
}

export function ApproxBadge({ approx }: { approx: boolean }) {
  return approx
    ? <span className="ofx-badge ofx-warn" title="Datos reconstruidos, no L2 real">approx</span>
    : <span className="ofx-badge ofx-pos" title="Datos reales">real</span>;
}

export function MetricBadge({ k, v, tone }: { k: string; v: string; tone?: "pos" | "neg" | "neu" }) {
  return (
    <div className="ofx-metric">
      <div className="ofx-metric-k">{k}</div>
      <div className={`ofx-metric-v ${tone ? "t-" + tone : ""}`}>{v}</div>
    </div>
  );
}
