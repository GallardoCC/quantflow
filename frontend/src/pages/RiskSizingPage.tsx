import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTicker } from "../TickerContext";
import { fetchRiskSizing, type RiskSizing } from "../api";
import "../components/risk.css";

export default function RiskSizingPage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskSizing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capital, setCapital] = useState(10000);
  const [riskPct, setRiskPct] = useState(2);
  const [capitalInput, setCapitalInput] = useState("10000");
  const [riskInput, setRiskInput] = useState("2");

  const doFetch = (cap: number, risk: number) => {
    if (!ticker) return;
    setLoading(true); setError(null);
    fetchRiskSizing(ticker, cap, risk / 100)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al calcular sizing"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!ticker) return;
    doFetch(capital, riskPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const handleCalcular = () => {
    const cap = parseFloat(capitalInput) || 10000;
    const risk = parseFloat(riskInput) || 2;
    setCapital(cap);
    setRiskPct(risk);
    doFetch(cap, risk);
  };

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">
          Tamaño Óptimo de Posición{ticker ? ` — ${ticker}` : ""}
        </h1>
        <p className="risk-subtitle">
          Criterio de Kelly ajustado + ATR + ajuste dinámico por régimen de volatilidad.
        </p>
      </div>

      {!ticker && (
        <div className="risk-disclaimer">Ingresa un ticker para calcular el tamaño de posición.</div>
      )}

      {/* Input controls */}
      {ticker && (
        <div className="risk-section">
          <div className="risk-section-title">Parámetros</div>
          <div className="sizing-inputs">
            <div className="sizing-input-group">
              <label className="sizing-input-label">Capital ($)</label>
              <input
                type="number"
                className="sizing-input"
                value={capitalInput}
                onChange={(e) => setCapitalInput(e.target.value)}
                min={100}
                step={1000}
              />
            </div>
            <div className="sizing-input-group">
              <label className="sizing-input-label">Riesgo por operación (%)</label>
              <input
                type="number"
                className="sizing-input"
                value={riskInput}
                onChange={(e) => setRiskInput(e.target.value)}
                min={0.1}
                max={10}
                step={0.1}
              />
            </div>
            <div className="sizing-input-group">
              <button className="sizing-btn" onClick={handleCalcular} disabled={loading}>
                {loading ? "Calculando…" : "Calcular"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="risk-skeleton" style={{ height: 200 }} />
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* KPI grid */}
          <div className="risk-kpi-grid">
            <div className="risk-kpi">
              <div className="risk-kpi-label">Precio Actual</div>
              <div className="risk-kpi-val">${data.current_price.toFixed(2)}</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">ATR-14</div>
              <div className="risk-kpi-val">${data.atr_14.toFixed(2)}</div>
              <div className="risk-kpi-sub">Average True Range</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Volatilidad</div>
              <div className="risk-kpi-val">{data.hist_vol_pct.toFixed(1)}%</div>
              <div className="risk-kpi-sub">Anualizada</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Kelly Fraction</div>
              <div className="risk-kpi-val">{(data.kelly_fraction * 100).toFixed(1)}%</div>
              <div className="risk-kpi-sub">Criterio de Kelly</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Unidades Recom.</div>
              <div className="risk-kpi-val" style={{ color: "var(--accent)" }}>{data.recommended_units}</div>
              <div className="risk-kpi-sub">Ajustado por régimen</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">% del Capital</div>
              <div className="risk-kpi-val" style={{ color: "var(--accent)" }}>
                {data.recommended_pct_capital.toFixed(1)}%
              </div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Exposición Máx.</div>
              <div className="risk-kpi-val">{data.max_exposure_pct.toFixed(1)}%</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Riesgo por Oper.</div>
              <div className="risk-kpi-val text-neg">${data.risk_per_trade.toFixed(2)}</div>
              <div className="risk-kpi-sub">{data.risk_pct_input.toFixed(1)}% del capital</div>
            </div>
          </div>

          {/* Stop loss */}
          <div className="risk-section">
            <div className="risk-section-title">Stop Loss</div>
            <div className="stop-loss-display">
              <div>
                <div className="stop-loss-label">Precio de Stop</div>
                <div className="stop-loss-price">${data.stop_loss_price.toFixed(2)}</div>
              </div>
              <div>
                <div className="stop-loss-label">Distancia</div>
                <div className="stop-loss-pct">{data.stop_loss_pct.toFixed(1)}%</div>
              </div>
              <div>
                <div className="stop-loss-label">Distancia $</div>
                <div className="stop-loss-pct">${data.stop_loss_distance.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* Regime adjustment */}
          <div className="risk-section">
            <div className="risk-section-title">Ajuste por Régimen</div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--s3)", marginBottom: "var(--s3)" }}>
              <span className={`regime-adj-badge regime-adj-${data.regime_adjustment}`}>
                {data.regime_adjustment}
              </span>
              <span style={{ fontSize: "0.875rem", color: "var(--text-2)" }}>
                {data.regime_adjustment === "REDUCIR"
                  ? "Régimen desfavorable: reducir exposición"
                  : data.regime_adjustment === "AUMENTAR"
                  ? "Régimen favorable: se puede aumentar exposición"
                  : "Condiciones normales de mercado"}
              </span>
            </div>

            {/* Capital allocation bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                  Posición recomendada: {data.recommended_pct_capital.toFixed(1)}%
                </span>
                <span style={{ fontSize: "0.78rem", color: "#ef4444" }}>
                  Máx: {data.max_exposure_pct.toFixed(1)}%
                </span>
              </div>
              <div className="capital-bar-track">
                <div
                  className="capital-bar-fill"
                  style={{ width: `${Math.min(data.recommended_pct_capital / data.max_exposure_pct, 1) * 100}%` }}
                />
                <div
                  className="capital-bar-max"
                  style={{ left: "100%" }}
                />
              </div>
              <div className="capital-bar-labels">
                <span>0%</span>
                <span>Máx exposición</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="risk-section">
            <div className="risk-section-title">Metodología</div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-2)", lineHeight: 1.6 }}>
              <p style={{ marginBottom: "var(--s2)" }}>
                <strong style={{ color: "var(--text)" }}>Criterio de Kelly:</strong> Optimiza el crecimiento del capital a largo plazo basándose en la probabilidad de ganancia y la relación riesgo/recompensa histórica. Se aplica un factor de ajuste conservador (fracción de Kelly).
              </p>
              <p style={{ marginBottom: "var(--s2)" }}>
                <strong style={{ color: "var(--text)" }}>Método ATR:</strong> El Average True Range define la distancia del stop loss basándose en la volatilidad real del mercado, permitiendo que el precio "respire" sin activar el stop prematuramente.
              </p>
              <p>
                <strong style={{ color: "var(--text)" }}>Ajuste por volatilidad:</strong> Factor de ajuste aplicado: {data.vol_adjustment.toFixed(2)}x. Las unidades por ATR sin ajuste: {data.atr_size_units.toFixed(0)}.
              </p>
            </div>
          </div>

          <p className="risk-disclaimer">
            Capital analizado: ${data.capital.toLocaleString()} · Riesgo por operación: {data.risk_pct_input.toFixed(1)}%.
            Solo análisis cuantitativo — no constituye asesoría de inversión.
          </p>
        </>
      )}
    </div>
  );
}

