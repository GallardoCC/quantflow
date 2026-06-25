import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createChart, ColorType, LineSeries } from "lightweight-charts";
import { useTicker } from "../TickerContext";
import { fetchRiskRegime, type RiskRegime } from "../api";
import "../components/risk.css";

function regimeLineColor(regime: string): string {
  switch (regime) {
    case "ALCISTA": return "#22c55e";
    case "BAJISTA": return "#ef4444";
    case "ALTA_VOLATILIDAD": return "#f59e0b";
    default: return "var(--text-3)";
  }
}

export default function RiskRegimePage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskRegime | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null); setData(null);
    fetchRiskRegime(ticker)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al detectar régimen"))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    if (!chartRef.current || !data?.regime_history?.length) return;
    const lineColor = regimeLineColor(data.regime);
    const chart = createChart(chartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "var(--text-2)" },
      grid: { vertLines: { color: "var(--border)" }, horzLines: { color: "var(--border)" } },
      height: 280,
    });

    // Price line
    const priceSeries = chart.addSeries(LineSeries, { color: lineColor, lineWidth: 2 });
    priceSeries.setData(
      data.regime_history.map((d) => ({ time: d.time as string, value: d.price }))
    );

    // SMA50 line
    const sma50Points = data.regime_history.filter((d) => d.sma50 !== null);
    if (sma50Points.length > 0) {
      const smaSeries = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 1 });
      smaSeries.setData(
        sma50Points.map((d) => ({ time: d.time as string, value: d.sma50 as number }))
      );
    }

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data]);

  const confidencePct = data ? Math.round(data.confidence * 100) : 0;

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">
          Detección de Régimen de Mercado IA{ticker ? ` — ${ticker}` : ""}
        </h1>
        <p className="risk-subtitle">
          Clasificación algorítmica del régimen vigente: alcista, bajista, lateral o alta volatilidad.
        </p>
      </div>

      {!ticker && (
        <div className="risk-disclaimer">Ingresa un ticker para ver el régimen de mercado.</div>
      )}

      {loading && (
        <div>
          <div className="risk-skeleton" style={{ height: 100, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 280 }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* Regime badge + confidence */}
          <div className="risk-section" style={{ textAlign: "center" }}>
            <span className={`regime-badge regime-${data.regime}`} style={{ fontSize: "1.1rem", padding: "8px 28px" }}>
              {data.regime.replace("_", " ")}
            </span>

            <div className="confidence-bar-wrap" style={{ maxWidth: 400, margin: "var(--s3) auto 0" }}>
              <div className="confidence-label">
                Confianza del modelo: {confidencePct}%
              </div>
              <div className="confidence-bar-track">
                <div className="confidence-bar-fill" style={{ width: `${confidencePct}%` }} />
              </div>
            </div>
          </div>

          {/* Trading implication */}
          <div className="trading-implication">
            <strong style={{ color: "var(--accent)" }}>Implicación para trading: </strong>
            {data.trading_implication}
          </div>

          {/* KPI grid */}
          <div className="risk-kpi-grid">
            <div className="risk-kpi">
              <div className="risk-kpi-label">Momentum 20d</div>
              <div className={`risk-kpi-val ${data.momentum_20d >= 0 ? "text-pos" : "text-neg"}`}>
                {data.momentum_20d >= 0 ? "+" : ""}{data.momentum_20d.toFixed(1)}%
              </div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Momentum 60d</div>
              <div className={`risk-kpi-val ${data.momentum_60d >= 0 ? "text-pos" : "text-neg"}`}>
                {data.momentum_60d >= 0 ? "+" : ""}{data.momentum_60d.toFixed(1)}%
              </div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Fuerza Tendencia</div>
              <div className="risk-kpi-val">{data.trend_strength.toFixed(0)}%</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Volatilidad Actual</div>
              <div className="risk-kpi-val">{data.hist_vol.toFixed(1)}%</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Vol vs Promedio</div>
              <div className={`risk-kpi-val ${data.vol_vs_avg > 1.2 ? "text-neg" : data.vol_vs_avg < 0.8 ? "text-pos" : "text-neutral"}`}>
                {data.vol_vs_avg.toFixed(2)}x
              </div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Precio Actual</div>
              <div className="risk-kpi-val">${data.current_price.toFixed(2)}</div>
            </div>
          </div>

          {/* Moving averages */}
          <div className="risk-section">
            <div className="risk-section-title">Medias Móviles</div>
            <div className="ma-grid">
              <div className="ma-card">
                <div className="ma-label">Precio</div>
                <div className="ma-price">${data.current_price.toFixed(2)}</div>
                <div className="ma-indicator" style={{ color: "var(--accent)" }}>Actual</div>
              </div>
              <div className="ma-card">
                <div className="ma-label">SMA 20</div>
                <div className="ma-price">${data.sma_20.toFixed(2)}</div>
                <div className={`ma-indicator ${data.current_price >= data.sma_20 ? "ma-above" : "ma-below"}`}>
                  {data.current_price >= data.sma_20 ? "▲ Por encima" : "▼ Por debajo"}
                </div>
              </div>
              <div className="ma-card">
                <div className="ma-label">SMA 50</div>
                <div className="ma-price">${data.sma_50.toFixed(2)}</div>
                <div className={`ma-indicator ${data.above_sma50 ? "ma-above" : "ma-below"}`}>
                  {data.above_sma50 ? "▲ Por encima" : "▼ Por debajo"}
                </div>
              </div>
              <div className="ma-card">
                <div className="ma-label">SMA 200</div>
                <div className="ma-price">${data.sma_200.toFixed(2)}</div>
                <div className={`ma-indicator ${data.above_sma200 ? "ma-above" : "ma-below"}`}>
                  {data.above_sma200 ? "▲ Por encima" : "▼ Por debajo"}
                </div>
              </div>
            </div>
          </div>

          {/* Price history chart */}
          <div className="risk-section">
            <div className="risk-section-title">
              <span>Historial de Precios</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-3)", marginLeft: "auto", display: "flex", gap: "var(--s3)" }}>
                <span style={{ color: regimeLineColor(data.regime) }}>— Precio</span>
                <span style={{ color: "#f59e0b" }}>— SMA50</span>
              </span>
            </div>
            <div ref={chartRef} />
          </div>

          <p className="risk-disclaimer">
            Régimen detectado con {(data.confidence * 100).toFixed(0)}% de confianza mediante análisis de
            medias móviles, momentum y volatilidad relativa. Solo análisis cuantitativo.
          </p>
        </>
      )}
    </div>
  );
}
