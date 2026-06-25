import { useEffect, useRef, useState } from "react";
import { api, type GarchResult } from "../api";
import { SearchBox } from "../components/SearchBox";
import { GarchVolChart } from "../components/GarchVolChart";
import { ReturnHistogram } from "../components/ReturnHistogram";
import { useTicker } from "../TickerContext";
import "../components/garch.css";

/**
 * Módulo de volatilidad GARCH — ajusta GARCH(1,1), EGARCH(1,1) y GJR/TGARCH
 * por máxima verosimilitud y muestra volatilidad condicional, pronóstico,
 * clustering, comparación de modelos y métricas de riesgo. Solo análisis.
 */

const RANGES: { label: string; value: string }[] = [
  { label: "1A", value: "1y" },
  { label: "2A", value: "2y" },
  { label: "3A", value: "3y" },
  { label: "5A", value: "5y" },
];

const REGIME_CLASS: Record<number, string> = {
  [-2]: "gk-pos", [-1]: "gk-pos", 0: "gk-neutral", 1: "gk-warn", 2: "gk-neg",
};

function fmtPct(v: number | null, d = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(d)}%`;
}
function fmtSigned(v: number | null, d = 2) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

interface KpiProps {
  label: string; value: string; sub?: string; cls?: string; big?: boolean;
}
function Kpi({ label, value, sub, cls, big }: KpiProps) {
  return (
    <div className={`gk-kpi${big ? " gk-kpi-big" : ""}`}>
      <span className="gk-kpi-label">{label}</span>
      <span className={`gk-kpi-value${cls ? " " + cls : ""}`}>{value}</span>
      {sub && <span className="gk-kpi-sub">{sub}</span>}
    </div>
  );
}

export default function GarchPage() {
  const { ticker, setTicker } = useTicker();
  const [range, setRange] = useState("2y");
  const [data, setData] = useState<GarchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ranRef = useRef<string>("");

  function run(tk: string, rg: string) {
    if (!tk.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    ranRef.current = `${tk}|${rg}`;
    api
      .garch(tk, rg)
      .then((r) => { setData(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }

  function handleSelect(tk: string) { setTicker(tk); }
  function handleRange(rg: string) { setRange(rg); }

  // Re-consulta al cambiar el ticker global o el rango.
  useEffect(() => { run(ticker, range); /* eslint-disable-next-line */ }, [ticker, range]);

  const risk = data?.risk;
  const returns = data?.timeline.map((p) => p.ret) ?? [];
  const regimeCls = risk ? REGIME_CLASS[risk.regime_score] ?? "gk-neutral" : "gk-neutral";

  // Posición del medidor de régimen (-2..2 → 0..100%).
  const gaugePos = risk ? ((risk.regime_score + 2) / 4) * 100 : 50;

  return (
    <div className="gk">
      <header className="gk-intro">
        <h2 className="gk-intro-title">Volatilidad GARCH</h2>
        <p className="gk-intro-sub">
          Modelado de varianza condicional por máxima verosimilitud —
          GARCH(1,1) · EGARCH(1,1) · GJR/TGARCH. Volatilidad histórica vs.
          condicional, pronóstico, clustering y riesgo. Solo análisis.
        </p>
      </header>

      <div className="gk-toolbar">
        <SearchBox onSelect={handleSelect} />
        <div className="gk-range-sel">
          {RANGES.map((r) => (
            <button key={r.value}
              className={`gk-rg-btn${r.value === range ? " on" : ""}`}
              onClick={() => handleRange(r.value)}>
              {r.label}
            </button>
          ))}
        </div>
        <button className="gk-run-btn" onClick={() => run(ticker, range)} disabled={loading}>
          {loading ? "Calculando…" : "Calcular ↻"}
        </button>
      </div>

      {loading && (
        <div className="gk-loading">
          <div className="gk-skel gk-skel-card" />
          <div className="gk-skel gk-skel-chart" />
          <div className="gk-skel-row">
            {[...Array(6)].map((_, i) => <div key={i} className="gk-skel gk-skel-kpi" />)}
          </div>
        </div>
      )}

      {error && !loading && <div className="banner error gk-banner">⚠ {error}</div>}

      {data && !loading && risk && (
        <>
          <div className="gk-asset-hdr">
            <span className="gk-asset-ticker">{data.ticker}</span>
            <span className="gk-asset-name">{data.name}</span>
            <span className="gk-asset-meta">
              {data.n_obs} retornos diarios · rango {data.range} · mejor modelo:{" "}
              <strong>{data.best_model}</strong>
            </span>
          </div>

          {/* Veredicto de régimen + medidor */}
          <section className="gk-card gk-verdict">
            <div className="gk-verdict-main">
              <span className="gk-verdict-label">Régimen de volatilidad</span>
              <span className={`gk-verdict-tag ${regimeCls}`}>{risk.regime}</span>
              <span className="gk-verdict-desc">
                Vol. condicional actual <strong>{fmtPct(risk.current_vol, 1)}</strong> anual ·
                largo plazo <strong>{fmtPct(risk.longrun_vol, 1)}</strong> · tendencia{" "}
                <strong>{risk.trend}</strong>
                {risk.vol_ratio != null && <> · ratio {risk.vol_ratio}×</>}
              </span>
            </div>
            <div className="gk-gauge">
              <div className="gk-gauge-track">
                <span className="gk-gauge-fill" style={{ left: `${gaugePos}%` }} />
              </div>
              <div className="gk-gauge-scale">
                <span>Baja</span><span>Normal</span><span>Elevada</span>
              </div>
            </div>
          </section>

          {/* KPIs */}
          <div className="gk-metrics">
            <Kpi label="Vol. condicional" value={fmtPct(risk.current_vol, 1)}
                 sub="actual, anualizada" cls={regimeCls} big />
            <Kpi label="Vol. largo plazo" value={fmtPct(risk.longrun_vol, 1)}
                 sub="incondicional ω/(1−α−β)" />
            <Kpi label="Vol. pronóstico" value={fmtPct(risk.forecast_vol, 1)}
                 sub={`a ${data.forecast.horizon} días`} cls="gk-amber" />
            <Kpi label="Persistencia" value={risk.persistence.toFixed(3)}
                 sub="α+β — cercano a 1 = choques duraderos" />
            <Kpi label="VaR 95% (1 día)" value={fmtSigned(-risk.var_95)}
                 sub="pérdida máx. esperada" cls="gk-neg" />
            <Kpi label="VaR 99% (1 día)" value={fmtSigned(-risk.var_99)}
                 sub={`ES 95%: ${fmtSigned(-risk.es_95)}`} cls="gk-neg" />
          </div>

          {/* Línea temporal de volatilidad + pronóstico */}
          <section className="gk-card gk-chart-card">
            <span className="gk-section-label">
              Volatilidad condicional vs. realizada · pronóstico {data.forecast.horizon}d
            </span>
            <GarchVolChart timeline={data.timeline} forecast={data.forecast} />
          </section>

          {/* Comparación de modelos */}
          <section className="gk-card gk-models-card">
            <span className="gk-section-label">Comparación de modelos (menor AIC gana)</span>
            <table className="gk-models-table">
              <thead>
                <tr>
                  <th>Modelo</th><th>Log-verosim.</th><th>AIC</th><th>BIC</th>
                  <th>Persistencia</th><th>Vol L.P.</th><th>Apalancamiento</th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((m) => (
                  <tr key={m.name} className={m.is_best ? "gk-best-row" : ""}>
                    <td className="gk-m-name">
                      {m.name}{m.is_best && <span className="gk-best-badge">MEJOR</span>}
                    </td>
                    <td>{m.loglik.toFixed(1)}</td>
                    <td>{m.aic.toFixed(1)}</td>
                    <td>{m.bic.toFixed(1)}</td>
                    <td>{m.persistence.toFixed(3)}</td>
                    <td>{m.longrun_vol != null ? fmtPct(m.longrun_vol, 1) : "—"}</td>
                    <td className={m.leverage != null ? "gk-amber" : ""}>
                      {m.leverage != null ? m.leverage.toFixed(3) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="gk-models-note">
              <strong>Apalancamiento:</strong> en GJR, γ&gt;0 indica que las caídas
              elevan más la volatilidad que las subidas; en EGARCH, γ&lt;0 captura el
              mismo efecto asimétrico. <strong>Persistencia (α+β)</strong> mide cuánto
              tardan los choques en disiparse.
            </p>
          </section>

          {/* Distribución de retornos + clustering */}
          <div className="gk-detail-row">
            <section className="gk-card gk-hist-card">
              <span className="gk-section-label">
                Distribución de retornos diarios vs. normal
              </span>
              <ReturnHistogram bins={data.histogram} returns={returns} />
              <p className="gk-hist-note">
                Las barras sobre la curva azul en los extremos indican{" "}
                <strong>colas gruesas</strong> (eventos extremos más frecuentes que
                la gaussiana) — la motivación de usar GARCH.
              </p>
            </section>

            <section className="gk-card gk-clust-card">
              <span className="gk-section-label">Clustering de volatilidad — ACF(retorno²)</span>
              <div className="gk-acf">
                {data.clustering_acf.map((v, i) => (
                  <div key={i} className="gk-acf-col" title={`Lag ${i + 1}: ${v}`}>
                    <div className="gk-acf-bar"
                         style={{ height: `${Math.min(Math.abs(v) * 240, 100)}%`,
                                  background: v >= 0 ? "var(--accent)" : "var(--neg)" }} />
                    <span className="gk-acf-lag">{i + 1}</span>
                  </div>
                ))}
              </div>
              <p className="gk-hist-note">
                Autocorrelación positiva y persistente de los retornos al cuadrado =
                los periodos de alta volatilidad se agrupan. Esto justifica el modelo.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
