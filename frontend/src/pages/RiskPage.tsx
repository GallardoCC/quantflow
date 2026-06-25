import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTicker } from "../TickerContext";
import { RiskGauge } from "../components/RiskGauge";
import { fetchRiskScore, type RiskScore } from "../api";
import "../components/risk.css";

export default function RiskPage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null); setData(null);
    fetchRiskScore(ticker)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al calcular el score de riesgo"))
      .finally(() => setLoading(false));
  }, [ticker]);

  type ComponentKey = "volatilidad" | "drawdown" | "momentum" | "liquidez" | "correlacion" | "regimen";
  const SUBPAGES: { to: string; icon: string; title: string; desc: string; metricKey?: ComponentKey }[] = [
    { to: "/riesgo/volatilidad", icon: "📊", title: "Volatilidad IA", desc: "Análisis EWMA + modelo de predicción heurístico de expansión de volatilidad.", metricKey: "volatilidad" },
    { to: "/riesgo/var", icon: "📉", title: "Simulación de Pérdidas", desc: "Value at Risk histórico y Monte Carlo. Escenarios mejor/promedio/peor.", metricKey: "drawdown" },
    { to: "/riesgo/sizing", icon: "⚖️", title: "Tamaño Óptimo de Posición", desc: "Criterio de Kelly, ATR y ajuste dinámico por volatilidad.", metricKey: "liquidez" },
    { to: "/riesgo/portfolio", icon: "🗂️", title: "Portfolio Intelligence", desc: "Matriz de correlación, beta, score de diversificación y alertas.", metricKey: "correlacion" },
    { to: "/riesgo/stress", icon: "⚡", title: "Simulación de Crisis", desc: "Escenarios extremos: crash, recesión, alza de tasas, shock inflacionario.", metricKey: "momentum" },
    { to: "/riesgo/regimen", icon: "🎯", title: "Régimen de Mercado", desc: "Detección IA de régimen alcista, bajista, lateral o alta volatilidad.", metricKey: "regimen" },
    { to: "/riesgo/performance", icon: "🏆", title: "Performance Intelligence", desc: "Sharpe, Sortino, Calmar, Win Rate, Profit Factor y diagnóstico IA de rendimiento." },
  ];

  const getBarClass = (score: number) =>
    score < 30 ? "low" : score < 70 ? "mid" : "high";

  if (!ticker) {
    return (
      <div className="risk-page">
        <div className="risk-header">
          <h1 className="risk-title">Gestión de Riesgo IA</h1>
          <p className="risk-subtitle">Ingresa un ticker para analizar el riesgo.</p>
        </div>
        <div className="risk-nav-grid">
          {SUBPAGES.map((p) => (
            <Link key={p.to} to={p.to} className="risk-nav-card">
              <span className="risk-nav-card-icon">{p.icon}</span>
              <span className="risk-nav-card-title">{p.title}</span>
              <span className="risk-nav-card-desc">{p.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="risk-page">
      <div className="risk-header">
        <h1 className="risk-title">Gestión de Riesgo IA — {ticker}</h1>
        <p className="risk-subtitle">Motor algorítmico de análisis de riesgo. Solo análisis, sin ejecución de órdenes.</p>
      </div>

      {loading && (
        <div className="risk-score-section">
          <div className="risk-skeleton" style={{ width: 260, height: 145 }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* Gauge + recommendation */}
          <div className="risk-score-section">
            <div className="risk-gauge-wrap">
              <RiskGauge score={data.score} level={data.level} />
              <span className={`risk-level-badge risk-level-${data.level}`}>
                Riesgo {data.level === "bajo" ? "Bajo" : data.level === "moderado" ? "Moderado" : "Alto"}
              </span>
            </div>
            <p className="risk-recommendation">{data.recommendation}</p>
          </div>

          {/* Component scores */}
          <div className="risk-components">
            {Object.entries(data.components).map(([key, comp]) => (
              <div key={key} className="risk-comp-card">
                <div className="risk-comp-label">{comp.label}</div>
                <div className="risk-comp-value">{comp.valor}{comp.unidad}</div>
                <div className="risk-comp-bar">
                  <div
                    className={`risk-comp-bar-fill ${getBarClass(comp.score)}`}
                    style={{ width: `${comp.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Sub-page navigation cards */}
      <h2 style={{ fontSize: "0.875rem", color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--s3)", fontFamily: "var(--sans)" }}>
        Módulos de análisis
      </h2>
      <div className="risk-nav-grid">
        {SUBPAGES.map((p) => (
          <Link key={p.to} to={p.to} className="risk-nav-card">
            <span className="risk-nav-card-icon">{p.icon}</span>
            <span className="risk-nav-card-title">{p.title}</span>
            <span className="risk-nav-card-desc">{p.desc}</span>
            {data && p.metricKey && (
              <span className="risk-nav-card-metric">
                Score: {data.components[p.metricKey].score.toFixed(0)}/100
              </span>
            )}
            <span className="risk-nav-card-arrow">Ver análisis →</span>
          </Link>
        ))}
      </div>

      {data && (
        <p className="risk-disclaimer">
          Actualizado: {data.updated} · {data.n_obs} observaciones · Fuentes: yfinance · Solo análisis cuantitativo.
        </p>
      )}
    </div>
  );
}
