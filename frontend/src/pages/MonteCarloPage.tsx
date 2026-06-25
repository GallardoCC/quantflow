import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MonteCarloResult } from "../api";
import { SearchBox } from "../components/SearchBox";
import { MonteCarloFanChart } from "../components/MonteCarloFanChart";
import { useTicker } from "../TickerContext";

/**
 * Monte Carlo simulation — GBM price fan chart + risk metrics.
 * Analysis only (no execution). Ticker search + horizon selector.
 */

const HORIZONS: { label: string; days: number }[] = [
  { label: "1M",  days: 21  },
  { label: "3M",  days: 63  },
  { label: "6M",  days: 126 },
  { label: "1Y",  days: 252 },
  { label: "2Y",  days: 504 },
];

function pctClass(v: number) { return v >= 0 ? "mc-pos" : "mc-neg"; }
function fmtPct(v: number, decimals = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}
function fmtPrice(v: number): string {
  if (v >= 10000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1000)  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v >= 100)   return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}
function fmtProb(v: number) { return `${(v * 100).toFixed(1)}%`; }

interface MetricCard {
  label: string;
  value: string;
  sub?: string;
  className?: string;
  big?: boolean;
}

function KpiCard({ label, value, sub, className, big }: MetricCard) {
  return (
    <div className={`mc-kpi${big ? " mc-kpi-big" : ""}`}>
      <span className="mc-kpi-label">{label}</span>
      <span className={`mc-kpi-value${className ? " " + className : ""}`}>{value}</span>
      {sub && <span className="mc-kpi-sub">{sub}</span>}
    </div>
  );
}

export default function MonteCarloPage() {
  const { ticker, setTicker } = useTicker();
  const [horizon, setHorizon] = useState(HORIZONS[3]); // 1Y default
  const [data, setData] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Track the ticker that was actually simulated (may differ from input while typing)
  const simRef = useRef<{ ticker: string; days: number } | null>(null);

  function runSim(tk: string, days: number) {
    if (!tk.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    simRef.current = { ticker: tk, days };
    api
      .monteCarlo(tk, days)
      .then((r) => {
        setData(r);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }

  // El buscador interno escribe en el ticker global.
  function handleSelect(tk: string) { setTicker(tk); }

  // Horizon change re-runs if we have a ticker
  function handleHorizon(h: typeof horizon) {
    setHorizon(h);
    if (ticker) runSim(ticker, h.days);
  }

  // Re-simula al cambiar el ticker global (o en el primer render).
  useEffect(() => {
    runSim(ticker, horizon.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const m = data?.metrics;
  const f = data?.final;

  return (
    <div className="mc">
      {/* Header */}
      <header className="mc-intro">
        <h2 className="mc-intro-title">Monte Carlo</h2>
        <p className="mc-intro-sub">
          Simulación de Movimiento Browniano Geométrico (GBM) — {data?.sims.toLocaleString() ?? "1,000"} trayectorias,
          calibrada con 2 años de retornos diarios. Solo análisis.
        </p>
      </header>

      {/* Controls */}
      <div className="mc-toolbar">
        <SearchBox onSelect={handleSelect} />
        <div className="mc-horizon-sel">
          {HORIZONS.map((h) => (
            <button
              key={h.days}
              className={`mc-hz-btn${h.days === horizon.days ? " on" : ""}`}
              onClick={() => handleHorizon(h)}
            >
              {h.label}
            </button>
          ))}
        </div>
        <button
          className="mc-run-btn"
          onClick={() => runSim(ticker, horizon.days)}
          disabled={loading}
        >
          {loading ? "Simulando…" : "Simular ↻"}
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mc-loading">
          <div className="mc-skel mc-skel-chart" />
          <div className="mc-skel-row">
            {[...Array(6)].map((_, i) => <div key={i} className="mc-skel mc-skel-kpi" />)}
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="banner error mc-banner">⚠ {error}</div>
      )}

      {/* Results */}
      {data && !loading && (
        <>
          {/* Asset header */}
          <div className="mc-asset-hdr">
            <span className="mc-asset-ticker">{data.ticker}</span>
            <span className="mc-asset-name">{data.name}</span>
            <span className="mc-asset-price">{fmtPrice(data.current_price)}</span>
            <span className="mc-asset-meta">
              Horizonte {data.days}d · {data.sims.toLocaleString()} simulaciones
            </span>
          </div>

          {/* Fan chart */}
          <section className="mc-card mc-fan-card">
            <MonteCarloFanChart fan={data.fan} currentPrice={data.current_price} />
            <div className="mc-fan-legend">
              <span className="mc-leg-item mc-leg-outer">P5 – P95</span>
              <span className="mc-leg-item mc-leg-inner">P25 – P75</span>
              <span className="mc-leg-item mc-leg-med">Mediana (P50)</span>
              <span className="mc-leg-item mc-leg-now">Precio actual</span>
            </div>
          </section>

          {/* Core metrics */}
          <div className="mc-metrics">
            <KpiCard
              label="Prob. de ganancia"
              value={fmtProb(m!.prob_gain)}
              sub={`P(precio > ${fmtPrice(data.current_price)} en ${data.days}d)`}
              className={m!.prob_gain >= 0.5 ? "mc-pos" : "mc-neg"}
              big
            />
            <KpiCard
              label="Retorno esperado"
              value={fmtPct(m!.expected_return)}
              sub={`Media final: ${fmtPrice(f!.mean)}`}
              className={pctClass(m!.expected_return)}
            />
            <KpiCard
              label="VaR 95%"
              value={fmtPct(m!.var_95)}
              sub="Pérdida máx. (95% confianza)"
              className="mc-neg"
            />
            <KpiCard
              label="CVaR 95%"
              value={fmtPct(m!.cvar_95)}
              sub="Pérdida esperada más allá del VaR"
              className="mc-neg"
            />
            <KpiCard
              label="Mejor caso"
              value={fmtPct(m!.best_case_pct)}
              sub={`P95: ${fmtPrice(f!.p95)}`}
              className="mc-pos"
            />
            <KpiCard
              label="Peor caso"
              value={fmtPct(m!.worst_case_pct)}
              sub={`P5: ${fmtPrice(f!.p5)}`}
              className="mc-neg"
            />
          </div>

          {/* Model stats + price scenarios */}
          <div className="mc-detail-row">
            {/* Model parameters */}
            <section className="mc-card mc-model-card">
              <span className="mc-section-label">Parámetros del modelo</span>
              <div className="mc-model-grid">
                <div className="mc-model-item">
                  <span className="mc-model-key">Método</span>
                  <span className="mc-model-val">Mov. Browniano Geométrico</span>
                </div>
                <div className="mc-model-item">
                  <span className="mc-model-key">Deriva histórica</span>
                  <span className={`mc-model-val ${pctClass(data.annualized_return)}`}>
                    {fmtPct(data.annualized_return)} / año
                  </span>
                </div>
                <div className="mc-model-item">
                  <span className="mc-model-key">Vol. histórica</span>
                  <span className="mc-model-val mc-amber">
                    {data.annualized_vol.toFixed(1)}% / año
                  </span>
                </div>
                <div className="mc-model-item">
                  <span className="mc-model-key">Ventana de calibración</span>
                  <span className="mc-model-val">2 años de retornos diarios</span>
                </div>
                <div className="mc-model-item">
                  <span className="mc-model-key">Simulaciones</span>
                  <span className="mc-model-val">{data.sims.toLocaleString()}</span>
                </div>
                <div className="mc-model-item">
                  <span className="mc-model-key">Horizonte</span>
                  <span className="mc-model-val">{data.days} días hábiles</span>
                </div>
              </div>
              <p className="mc-model-note">
                El GBM asume deriva y volatilidad constantes, retornos log-normales y sin
                saltos. Captura la magnitud de la incertidumbre, no la dirección.
              </p>
            </section>

            {/* Final price scenarios */}
            <section className="mc-card mc-scenarios-card">
              <span className="mc-section-label">Escenarios de precio final</span>
              <table className="mc-scen-table">
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th>Precio</th>
                    <th>Retorno</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ["Bajista (P5)", f!.p5,   m!.worst_case_pct],
                    ["P25",          f!.p25,  null],
                    ["Base (P50)",   f!.p50,  null],
                    ["P75",          f!.p75,  null],
                    ["Alcista (P95)", f!.p95, m!.best_case_pct],
                    ["Media",        f!.mean, m!.expected_return],
                  ] as [string, number, number | null][]).map(([label, price, ret]) => (
                    <tr key={label}>
                      <td className="mc-scen-label">{label}</td>
                      <td className="mc-scen-price">{fmtPrice(price)}</td>
                      <td className={`mc-scen-ret ${pctClass(price - data.current_price)}`}>
                        {ret !== null
                          ? fmtPct(ret)
                          : fmtPct((price / data.current_price - 1) * 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {/* CTA: deep risk page */}
          <button
            className="mc-cta"
            onClick={() =>
              navigate(`/monte-carlo/${data.ticker}?days=${data.days}`)
            }
          >
            <span className="mc-cta-main">Distribución completa de riesgo →</span>
            <span className="mc-cta-sub">
              Histograma · VaR al 90 / 95 / 99% · Tabla de escenarios
            </span>
          </button>
        </>
      )}
    </div>
  );
}
