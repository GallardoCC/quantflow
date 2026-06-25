import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTicker } from "../TickerContext";
import { fetchRiskVar, type RiskVar } from "../api";
import "../components/risk.css";

const CONFIDENCE_OPTIONS = [
  { label: "90%", value: 0.90 },
  { label: "95%", value: 0.95 },
  { label: "99%", value: 0.99 },
];

const HORIZON_OPTIONS = [
  { label: "1 día", value: 1 },
  { label: "5 días", value: 5 },
  { label: "10 días", value: 10 },
  { label: "21 días", value: 21 },
];

export default function RiskVarPage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskVar | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0.95);
  const [horizon, setHorizon] = useState(1);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null); setData(null);
    fetchRiskVar(ticker, confidence, horizon)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al calcular VaR"))
      .finally(() => setLoading(false));
  }, [ticker, confidence, horizon]);

  // SVG histogram
  const renderHistogram = (dist: RiskVar["distribucion"]) => {
    if (!dist.length) return null;
    const W = 600, H = 180, padL = 40, padB = 30, padT = 10, padR = 10;
    const innerW = W - padL - padR;
    const innerH = H - padB - padT;
    const maxCount = Math.max(...dist.map((b) => b.count), 1);
    const minMid = Math.min(...dist.map((b) => b.bucket_mid));
    const maxMid = Math.max(...dist.map((b) => b.bucket_mid));
    const range = maxMid - minMid || 1;
    const barW = innerW / dist.length;

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }} preserveAspectRatio="none">
        {dist.map((b, i) => {
          const bh = (b.count / maxCount) * innerH;
          const bx = padL + i * barW;
          const by = padT + innerH - bh;
          const fill = b.is_loss ? "#ef4444" : "#22c55e";
          return (
            <g key={i}>
              <rect x={bx + 1} y={by} width={barW - 2} height={bh} fill={fill} opacity={0.75} />
            </g>
          );
        })}
        {/* X axis */}
        <line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="var(--border)" strokeWidth={1} />
        {/* Zero line */}
        {(() => {
          const zeroX = padL + ((0 - minMid) / range) * innerW;
          return zeroX > padL && zeroX < padL + innerW ? (
            <line x1={zeroX} y1={padT} x2={zeroX} y2={padT + innerH} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="4,3" />
          ) : null;
        })()}
        {/* Labels */}
        <text x={padL} y={H - 5} fontSize="9" fill="var(--text-3)" textAnchor="middle">{minMid.toFixed(1)}%</text>
        <text x={padL + innerW} y={H - 5} fontSize="9" fill="var(--text-3)" textAnchor="middle">{maxMid.toFixed(1)}%</text>
        <text x={padL + innerW / 2} y={H - 5} fontSize="9" fill="var(--text-3)" textAnchor="middle">0%</text>
      </svg>
    );
  };

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">
          Simulación de Pérdidas — Value at Risk{ticker ? ` — ${ticker}` : ""}
        </h1>
        <p className="risk-subtitle">
          VaR histórico y Monte Carlo. Distribución de retornos y escenarios probabilísticos.
        </p>
      </div>

      {!ticker && (
        <div className="risk-disclaimer">Ingresa un ticker para ver la simulación de pérdidas.</div>
      )}

      {/* Controls */}
      {ticker && (
        <div className="risk-controls">
          <div className="risk-control-group">
            <label className="risk-control-label">Confianza</label>
            <select
              className="risk-control-select"
              value={confidence}
              onChange={(e) => setConfidence(Number(e.target.value))}
            >
              {CONFIDENCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="risk-control-group">
            <label className="risk-control-label">Horizonte</label>
            <select
              className="risk-control-select"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            >
              {HORIZON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading && (
        <div>
          <div className="risk-skeleton" style={{ height: 80, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 200, marginBottom: "var(--s3)" }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* KPI cards */}
          <div className="risk-kpi-grid">
            <div className="risk-kpi">
              <div className="risk-kpi-label">VaR Histórico 1d</div>
              <div className="risk-kpi-val text-neg">{data.hist_var_1d.toFixed(2)}%</div>
              <div className="risk-kpi-sub">Conf. {(data.confidence * 100).toFixed(0)}%</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">VaR Hist. {data.horizon}d</div>
              <div className="risk-kpi-val text-neg">{data.hist_var_Td.toFixed(2)}%</div>
              <div className="risk-kpi-sub">{data.horizon} días</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">CVaR (ES)</div>
              <div className="risk-kpi-val text-neg">{data.cvar.toFixed(2)}%</div>
              <div className="risk-kpi-sub">Expected Shortfall</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">VaR Monte Carlo</div>
              <div className="risk-kpi-val text-neg">{data.mc_var_1d.toFixed(2)}%</div>
              <div className="risk-kpi-sub">Simulación MC</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Pérdida Máx. 1d</div>
              <div className="risk-kpi-val text-neg">{data.max_perdida_1d.toFixed(2)}%</div>
              <div className="risk-kpi-sub">Histórico</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Observaciones</div>
              <div className="risk-kpi-val">{data.n_obs}</div>
              <div className="risk-kpi-sub">Días de datos</div>
            </div>
          </div>

          {/* Scenario cards */}
          <div className="var-scenarios">
            <div className="var-scenario-card" style={{ borderColor: "rgba(34,197,94,0.3)" }}>
              <div className="var-scenario-title">Mejor escenario</div>
              <div className="var-scenario-return text-pos">
                +{data.scenarios.mejor.retorno_pct.toFixed(2)}%
              </div>
              <div className="var-scenario-desc">{data.scenarios.mejor.descripcion}</div>
            </div>
            <div className="var-scenario-card" style={{ borderColor: "rgba(91,130,240,0.3)" }}>
              <div className="var-scenario-title">Escenario esperado</div>
              <div className="var-scenario-return" style={{ color: "var(--accent)" }}>
                {data.scenarios.promedio.retorno_pct >= 0 ? "+" : ""}{data.scenarios.promedio.retorno_pct.toFixed(2)}%
              </div>
              <div className="var-scenario-desc">{data.scenarios.promedio.descripcion}</div>
            </div>
            <div className="var-scenario-card" style={{ borderColor: "rgba(239,68,68,0.3)" }}>
              <div className="var-scenario-title">Peor escenario</div>
              <div className="var-scenario-return text-neg">
                {data.scenarios.peor.retorno_pct.toFixed(2)}%
              </div>
              <div className="var-scenario-desc">{data.scenarios.peor.descripcion}</div>
            </div>
          </div>

          {/* Distribution histogram */}
          <div className="risk-section">
            <div className="risk-section-title">Distribución de Retornos</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: "var(--s2)" }}>
              Verde = retornos positivos · Rojo = pérdidas · Línea punteada = cero
            </div>
            <div className="var-histogram">
              {renderHistogram(data.distribucion)}
            </div>
          </div>

          <p className="risk-disclaimer">
            VaR calculado con {data.n_obs} observaciones históricas. Nivel de confianza: {(data.confidence * 100).toFixed(0)}%.
            El VaR es una estimación estadística, no una garantía. Solo análisis cuantitativo.
          </p>
        </>
      )}
    </div>
  );
}
