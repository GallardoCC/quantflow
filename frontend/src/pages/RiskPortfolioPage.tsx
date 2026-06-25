import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTicker } from "../TickerContext";
import { fetchRiskPortfolio, type RiskPortfolio } from "../api";
import "../components/risk.css";

// Map correlation value (-1..1) to a CSS rgba color
function corrToColor(v: number): string {
  if (v >= 0.999) return "rgba(91,130,240,0.85)";   // self-diagonal
  if (v > 0)  return `rgba(91,130,240,${Math.min(v * 0.7, 0.7)})`;
  if (v < 0)  return `rgba(239,68,68,${Math.min(Math.abs(v) * 0.7, 0.7)})`;
  return "transparent";
}

function corrTextColor(v: number): string {
  const abs = Math.abs(v);
  if (abs > 0.5) return "var(--text)";
  return "var(--text-2)";
}

export default function RiskPortfolioPage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskPortfolio | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickersInput, setTickersInput] = useState("");
  const [submittedTickers, setSubmittedTickers] = useState("");

  // Set default tickers when global ticker changes
  useEffect(() => {
    if (ticker) {
      const def = `${ticker},SPY,QQQ`;
      setTickersInput(def);
    }
  }, [ticker]);

  useEffect(() => {
    if (!submittedTickers) return;
    setLoading(true); setError(null);
    fetchRiskPortfolio(submittedTickers)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? "Sin datos para uno o más tickers" : "Error al analizar portfolio"))
      .finally(() => setLoading(false));
  }, [submittedTickers]);

  const handleAnalizar = () => {
    const val = tickersInput.trim();
    if (!val) return;
    setSubmittedTickers(val);
  };

  const divScore = data?.diversification_score ?? 0;
  const divLabel = divScore >= 70 ? "Bien diversificado" : divScore >= 40 ? "Diversificación moderada" : "Poco diversificado";
  const divColor = divScore >= 70 ? "#22c55e" : divScore >= 40 ? "#eab308" : "#ef4444";

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">Portfolio Intelligence</h1>
        <p className="risk-subtitle">
          Análisis de correlación, beta, diversificación y métricas de riesgo multi-activo.
        </p>
      </div>

      {!ticker && !submittedTickers && (
        <div className="risk-disclaimer">Ingresa un ticker para comenzar el análisis de portfolio.</div>
      )}

      {/* Portfolio input */}
      <div className="risk-section">
        <div className="risk-section-title">Tickers del portfolio</div>
        <div className="portfolio-input-row">
          <input
            type="text"
            className="portfolio-ticker-input"
            placeholder="Ej: AAPL,MSFT,SPY,QQQ"
            value={tickersInput}
            onChange={(e) => setTickersInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAnalizar()}
          />
          <button className="sizing-btn" onClick={handleAnalizar} disabled={loading}>
            {loading ? "Analizando…" : "Analizar"}
          </button>
        </div>
        <div style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
          Ingresa tickers separados por comas. Beta se calcula vs SPY si está incluido.
        </div>
      </div>

      {loading && (
        <div>
          <div className="risk-skeleton" style={{ height: 80, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 300 }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* Warnings */}
          {data.warnings.map((w, i) => (
            <div key={i} className="risk-warning">{w}</div>
          ))}

          {/* Diversification KPIs */}
          <div className="risk-kpi-grid">
            <div className="risk-kpi">
              <div className="risk-kpi-label">Tickers</div>
              <div className="risk-kpi-val">{data.n_tickers}</div>
              <div className="risk-kpi-sub">En el análisis</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Correlación Prom.</div>
              <div className="risk-kpi-val">{data.avg_correlation.toFixed(3)}</div>
              <div className="risk-kpi-sub">-1 = perfecta divers.</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Observaciones</div>
              <div className="risk-kpi-val">{data.n_obs}</div>
              <div className="risk-kpi-sub">Días de datos</div>
            </div>
          </div>

          {/* Diversification score */}
          <div className="risk-section">
            <div className="risk-section-title">Score de Diversificación</div>
            <div className="diversification-score-wrap">
              <div className="diversification-score-num" style={{ color: divColor }}>
                {divScore.toFixed(0)}
              </div>
              <div>
                <div style={{ font: "600 1rem var(--sans)", color: divColor }}>{divLabel}</div>
                <div className="diversification-score-label">
                  Score 0-100. Mayor = mejor diversificación.
                </div>
              </div>
            </div>
            <div className="capital-bar-track" style={{ height: 10 }}>
              <div
                style={{
                  height: "100%", borderRadius: 5,
                  width: `${divScore}%`,
                  background: divColor,
                  transition: "width 0.8s ease",
                }}
              />
            </div>
          </div>

          {/* Correlation matrix */}
          <div className="risk-section">
            <div className="risk-section-title">Matriz de Correlación</div>
            <div className="corr-matrix-wrap">
              <table className="corr-matrix">
                <thead>
                  <tr>
                    <th></th>
                    {data.tickers.map((t) => <th key={t}>{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.correlation_matrix.map((row, i) => (
                    <tr key={data.tickers[i]}>
                      <th style={{ textAlign: "right", paddingRight: 12, color: "var(--text-3)" }}>
                        {data.tickers[i]}
                      </th>
                      {row.map((v, j) => (
                        <td
                          key={j}
                          style={{
                            backgroundColor: corrToColor(v),
                            color: corrTextColor(v),
                            fontWeight: i === j ? 700 : 400,
                          }}
                        >
                          {v.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Metrics table */}
          <div className="risk-section">
            <div className="risk-section-title">Métricas por Activo</div>
            <table className="risk-metrics-table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Vol. Anual</th>
                  <th>Beta</th>
                  <th>Sharpe</th>
                </tr>
              </thead>
              <tbody>
                {data.metrics.map((m) => (
                  <tr key={m.ticker}>
                    <td style={{ fontWeight: 600, color: "var(--text)", fontFamily: "var(--mono)" }}>{m.ticker}</td>
                    <td>{m.vol_anual.toFixed(1)}%</td>
                    <td>
                      {m.beta !== null ? (
                        <span style={{ color: m.beta > 1.2 ? "#ef4444" : m.beta < 0.8 ? "#22c55e" : "var(--text)" }}>
                          {m.beta.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-3)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ color: m.sharpe >= 1 ? "#22c55e" : m.sharpe >= 0 ? "var(--text)" : "#ef4444" }}>
                        {m.sharpe.toFixed(2)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="risk-disclaimer">
            Beta calculado vs SPY cuando está incluido en el análisis · {data.n_obs} observaciones ·
            Solo análisis cuantitativo — no constituye asesoría de inversión.
          </p>
        </>
      )}
    </div>
  );
}
