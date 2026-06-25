import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createChart, ColorType, LineStyle, LineSeries } from "lightweight-charts";
import { useTicker } from "../TickerContext";
import { fetchRiskVolatility, type RiskVolatility } from "../api";
import "../components/risk.css";

export default function RiskVolatilityPage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskVolatility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null); setData(null);
    fetchRiskVolatility(ticker)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al cargar volatilidad"))
      .finally(() => setLoading(false));
  }, [ticker]);

  useEffect(() => {
    if (!chartRef.current || !data?.chart_data?.length) return;
    const chart = createChart(chartRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "var(--text-2)" },
      grid: { vertLines: { color: "var(--border)" }, horzLines: { color: "var(--border)" } },
      height: 280,
    });
    const histSeries = chart.addSeries(LineSeries, { color: "#5b82f0", lineWidth: 2 });
    const ewmaSeries = chart.addSeries(LineSeries, { color: "#f59e0b", lineWidth: 2, lineStyle: LineStyle.Dashed });
    histSeries.setData(data.chart_data.map((d) => ({ time: d.time as string, value: d.hist_vol })));
    ewmaSeries.setData(data.chart_data.map((d) => ({ time: d.time as string, value: d.ewma_vol })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [data]);

  const FEATURE_LABELS: Record<string, string> = {
    vol_momentum: "Momentum Volat.",
    volume_trend: "Tendencia Volumen",
    atr_ratio: "Ratio ATR",
    ma_ratio: "Ratio MA",
  };

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">
          Análisis de Volatilidad IA{ticker ? ` — ${ticker}` : ""}
        </h1>
        <p className="risk-subtitle">
          Volatilidad histórica, EWMA y señal de expansión de volatilidad basada en features de mercado.
        </p>
      </div>

      {!ticker && (
        <div className="risk-disclaimer">Ingresa un ticker para ver el análisis de volatilidad.</div>
      )}

      {loading && (
        <div>
          <div className="risk-skeleton" style={{ height: 80, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 280 }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* KPI cards */}
          <div className="risk-kpi-grid">
            <div className="risk-kpi">
              <div className="risk-kpi-label">Vol. Histórica</div>
              <div className="risk-kpi-val">{data.hist_vol.toFixed(1)}%</div>
              <div className="risk-kpi-sub">Anualizada</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Vol. EWMA</div>
              <div className="risk-kpi-val">{data.ewma_vol.toFixed(1)}%</div>
              <div className="risk-kpi-sub">Suavizada</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Promedio L/P</div>
              <div className="risk-kpi-val">{data.long_term_avg_vol.toFixed(1)}%</div>
              <div className="risk-kpi-sub">Largo plazo</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Percentil</div>
              <div className="risk-kpi-val">{data.vol_percentile.toFixed(0)}%</div>
              <div className="risk-kpi-sub">vs histórico</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Régimen</div>
              <div className="risk-kpi-val" style={{ fontSize: "0.95rem" }}>{data.vol_regime}</div>
              <div className="risk-kpi-sub">Clasificación</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Tendencia</div>
              <div className="risk-kpi-val" style={{ fontSize: "0.95rem" }}>{data.trend_direction}</div>
              <div className="risk-kpi-sub">Dirección</div>
            </div>
          </div>

          {/* Chart */}
          <div className="risk-section">
            <div className="risk-section-title">
              <span>Evolución de Volatilidad</span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-3)", marginLeft: "auto", display: "flex", gap: "var(--s3)" }}>
                <span style={{ color: "var(--accent)" }}>— Hist.</span>
                <span style={{ color: "#f59e0b" }}>- - EWMA</span>
              </span>
            </div>
            <div ref={chartRef} />
          </div>

          {/* ML Signal */}
          <div className="risk-section">
            <div className="risk-section-title">Señal IA de Expansión de Volatilidad</div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s4)", marginBottom: "var(--s3)" }}>
              <div>
                <div className="risk-kpi-label">Señal</div>
                <div style={{
                  fontSize: "1.2rem", fontWeight: 700, fontFamily: "var(--mono)",
                  color: data.ml_signal === "EXPANSIÓN" ? "#ef4444" : data.ml_signal === "CONTRACCIÓN" ? "#22c55e" : "var(--text-2)"
                }}>
                  {data.ml_signal}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="risk-kpi-label" style={{ marginBottom: 6 }}>
                  Probabilidad de expansión: {(data.ml_prob * 100).toFixed(0)}%
                </div>
                <div className="ml-prob-bar">
                  <div className="ml-prob-fill" style={{ width: `${data.ml_prob * 100}%` }} />
                </div>
              </div>
            </div>

            {/* Feature values */}
            <div className="risk-section-title" style={{ fontSize: "0.875rem", marginTop: "var(--s3)" }}>
              Variables del modelo
            </div>
            <div className="risk-kpi-grid">
              {Object.entries(data.feature_values).map(([key, val]) => (
                <div key={key} className="risk-kpi">
                  <div className="risk-kpi-label">{FEATURE_LABELS[key] ?? key}</div>
                  <div className="risk-kpi-val">{typeof val === "number" ? val.toFixed(4) : val}</div>
                </div>
              ))}
            </div>
          </div>

          {data.disclaimer && (
            <p className="risk-disclaimer">{data.disclaimer}</p>
          )}
        </>
      )}
    </div>
  );
}
