import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { api, type MonteCarloResult } from "../api";

/**
 * Monte Carlo deep page — final price distribution histogram + full risk tables.
 * Reached via "Full Risk Distribution →" button on MonteCarloPage.
 * Reuses the cached backend result (same endpoint, instant response).
 */

function fmtPrice(v: number): string {
  if (v >= 10000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1000)  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 100)   return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}
function fmtPct(v: number) { return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`; }

/* ---------- Histogram SVG ---------- */
interface HistogramProps {
  data: MonteCarloResult;
}

function Histogram({ data }: HistogramProps) {
  const { distribution: bins, current_price: cur, metrics: m } = data;
  const maxCount = Math.max(...bins.map((b) => b.count));

  const W = 900, H = 280;
  const P = { t: 20, r: 20, b: 44, l: 56 };
  const pw = W - P.l - P.r;
  const ph = H - P.t - P.b;
  const n = bins.length;
  const bw = pw / n;

  // VaR price thresholds (price levels, not returns)
  const varPrices = {
    v90: cur * (1 + m.var_90 / 100),
    v95: cur * (1 + m.var_95 / 100),
    v99: cur * (1 + m.var_99 / 100),
  };

  const lo = bins[0].lo, hi = bins[n - 1].hi;
  const xRange = hi - lo;

  const xs = (price: number) => P.l + ((price - lo) / xRange) * pw;
  const ys = (count: number) => P.t + ph - (count / maxCount) * ph;

  const barColor = (mid: number) =>
    mid >= cur
      ? "rgba(46,189,133,0.55)"   // gain – green
      : "rgba(240,86,107,0.55)";  // loss – red

  const varLines = [
    { price: varPrices.v99, label: "VaR 99", color: "#e0a93b" },
    { price: varPrices.v95, label: "VaR 95", color: "#f0566b" },
    { price: varPrices.v90, label: "VaR 90", color: "#ff8a65" },
    { price: cur,           label: "Ahora",  color: "rgba(255,255,255,0.6)" },
  ];

  // X-axis labels: sample 8 price ticks
  const N_TICKS = 8;
  const xTicks = Array.from({ length: N_TICKS }, (_, i) =>
    lo + (xRange * i) / (N_TICKS - 1)
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="mc-hist-svg">
      {/* Grid */}
      {[0.25, 0.5, 0.75, 1].map((f, i) => (
        <line key={i}
          x1={P.l} y1={(P.t + ph - f * ph).toFixed(1)}
          x2={W - P.r} y2={(P.t + ph - f * ph).toFixed(1)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"
        />
      ))}

      {/* Bars */}
      {bins.map((b, i) => {
        const bh = (b.count / maxCount) * ph;
        return (
          <rect
            key={i}
            x={(P.l + i * bw + 0.5).toFixed(1)}
            y={(ys(b.count)).toFixed(1)}
            width={Math.max(bw - 1, 1).toFixed(1)}
            height={bh.toFixed(1)}
            fill={barColor(b.mid)}
            rx="1"
          />
        );
      })}

      {/* VaR / reference lines */}
      {varLines.map(({ price, label, color }) => {
        const x = xs(price);
        if (x < P.l || x > W - P.r) return null;
        return (
          <g key={label}>
            <line
              x1={x.toFixed(1)} y1={P.t.toFixed(1)}
              x2={x.toFixed(1)} y2={(P.t + ph).toFixed(1)}
              stroke={color} strokeWidth={label === "Ahora" ? 1.5 : 1}
              strokeDasharray={label === "Ahora" ? "5,4" : "3,3"}
            />
            <text
              x={x.toFixed(1)} y={(P.t - 6).toFixed(1)}
              textAnchor="middle" fill={color}
              fontSize="10" fontFamily="var(--mono)"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* X-axis labels */}
      {xTicks.map((v, i) => (
        <text key={i}
          x={xs(v).toFixed(1)} y={(H - 6).toFixed(1)}
          textAnchor="middle" fill="var(--muted)"
          fontSize="11" fontFamily="var(--mono)"
        >
          {fmtPrice(v)}
        </text>
      ))}

      {/* Y-axis: percentage labels */}
      {[0, 0.5, 1].map((f, i) => (
        <text key={i}
          x={(P.l - 6).toFixed(1)} y={(P.t + ph - f * ph + 4).toFixed(1)}
          textAnchor="end" fill="var(--muted)"
          fontSize="10" fontFamily="var(--mono)"
        >
          {(f * 100).toFixed(0)}%
        </text>
      ))}
    </svg>
  );
}

/* ---------- Page ---------- */

export default function MonteCarloDistributionPage() {
  const { ticker } = useParams<{ ticker: string }>();
  const [sp] = useSearchParams();
  const days = parseInt(sp.get("days") ?? "252", 10);

  const [data, setData] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    api
      .monteCarlo(ticker, days)
      .then((r) => { setData(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }, [ticker, days]);

  if (loading) {
    return (
      <div className="mc mc-dist">
        <Link to="/monte-carlo" className="mc-back">← Volver a Monte Carlo</Link>
        <div className="mc-skel mc-skel-chart" style={{ marginTop: 24 }} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mc mc-dist">
        <Link to="/monte-carlo" className="mc-back">← Volver a Monte Carlo</Link>
        <div className="banner error mc-banner">⚠ {error ?? "Error desconocido"}</div>
      </div>
    );
  }

  const m = data.metrics;
  const f = data.final;

  const varRows = [
    { cl: 90, v: m.var_90, cv: m.cvar_90 },
    { cl: 95, v: m.var_95, cv: m.cvar_95 },
    { cl: 99, v: m.var_99, cv: m.cvar_99 },
  ];

  const scenRows: [string, string, number, number][] = [
    ["Bajista", "P10",  f.p10,  (f.p10  / data.current_price - 1) * 100],
    ["Base",    "P50",  f.p50,  (f.p50  / data.current_price - 1) * 100],
    ["Alcista", "P90",  f.p90,  (f.p90  / data.current_price - 1) * 100],
    ["Media",   "μ",    f.mean, m.expected_return],
  ];

  const pctRows: [string, number][] = [
    ["P5",  f.p5],  ["P10", f.p10], ["P25", f.p25],
    ["P50", f.p50], ["P75", f.p75], ["P90", f.p90], ["P95", f.p95],
    ["Media", f.mean],
  ];

  return (
    <div className="mc mc-dist">
      <Link to="/monte-carlo" className="mc-back">← Volver a Monte Carlo</Link>

      {/* Header */}
      <header className="mc-dist-head">
        <div>
          <h2 className="mc-dist-ticker">{data.ticker}</h2>
          <p className="mc-dist-sub">{data.name} · {fmtPrice(data.current_price)}</p>
        </div>
        <div className="mc-dist-meta">
          Distribución de riesgo · {data.days}d · {data.sims.toLocaleString()} sims
        </div>
      </header>

      {/* Histogram */}
      <section className="mc-card mc-hist-card">
        <div className="mc-hist-title">
          <span className="mc-section-label">Distribución del precio final</span>
          <span className="mc-hist-legend-row">
            <span className="mc-leg-item mc-leg-gain">Zona de ganancia</span>
            <span className="mc-leg-item mc-leg-loss">Zona de pérdida</span>
          </span>
        </div>
        <Histogram data={data} />
        <p className="mc-hist-note">
          Cada barra es un rango de precio; la altura = proporción de {data.sims.toLocaleString()}{" "}
          simulaciones que terminan en ese rango. Las líneas VaR marcan los umbrales de pérdida.
        </p>
      </section>

      {/* Analysis grid: scenarios + VaR */}
      <div className="mc-dist-grid">
        {/* Scenarios */}
        <section className="mc-card">
          <span className="mc-section-label">Análisis de escenarios</span>
          <table className="mc-risk-table">
            <thead>
              <tr>
                <th>Escenario</th>
                <th>Pctil</th>
                <th>Precio</th>
                <th>Retorno</th>
              </tr>
            </thead>
            <tbody>
              {scenRows.map(([scenario, pctile, price, ret]) => (
                <tr key={scenario}>
                  <td className="mc-scen-label">{scenario}</td>
                  <td className="mc-td-muted">{pctile}</td>
                  <td className="mc-td-price">{fmtPrice(price)}</td>
                  <td className={ret >= 0 ? "mc-pos" : "mc-neg"}>{fmtPct(ret)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* VaR table */}
        <section className="mc-card">
          <span className="mc-section-label">Valor en Riesgo (VaR)</span>
          <table className="mc-risk-table">
            <thead>
              <tr>
                <th>Confianza</th>
                <th>VaR</th>
                <th>CVaR</th>
                <th>VaR abs.</th>
              </tr>
            </thead>
            <tbody>
              {varRows.map(({ cl, v, cv }) => (
                <tr key={cl}>
                  <td className="mc-td-muted">{cl}%</td>
                  <td className="mc-neg">{fmtPct(v)}</td>
                  <td className="mc-neg">{fmtPct(cv)}</td>
                  <td className="mc-neg">{fmtPrice(data.current_price * (1 + v / 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mc-var-note">
            VaR = pérdida máxima esperada al nivel de confianza dado.
            CVaR (Expected Shortfall) = pérdida media en la cola más allá del VaR.
          </p>
        </section>
      </div>

      {/* Full percentile distribution table */}
      <section className="mc-card mc-pct-card">
        <span className="mc-section-label">Distribución completa por percentiles</span>
        <div className="mc-pct-grid">
          {pctRows.map(([label, price]) => {
            const ret = (price / data.current_price - 1) * 100;
            return (
              <div key={label} className="mc-pct-item">
                <span className="mc-pct-label">{label}</span>
                <span className="mc-pct-price">{fmtPrice(price)}</span>
                <span className={`mc-pct-ret ${ret >= 0 ? "mc-pos" : "mc-neg"}`}>
                  {fmtPct(ret)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
