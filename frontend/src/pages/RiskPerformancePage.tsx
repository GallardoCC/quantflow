import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTicker } from "../TickerContext";
import { fetchRiskPerformance, type RiskPerformance } from "../api";
import "../components/risk.css";

const RANGE_OPTIONS = [
  { label: "1 año", value: "1y" },
  { label: "2 años", value: "2y" },
  { label: "3 años", value: "3y" },
];

function RatioCard({ label, value, sub, colorFn }: {
  label: string;
  value: string;
  sub?: string;
  colorFn?: (v: number) => string;
}) {
  const num = parseFloat(value);
  const color = colorFn ? colorFn(num) : "var(--text)";
  return (
    <div className="risk-kpi">
      <div className="risk-kpi-label">{label}</div>
      <div className="risk-kpi-val" style={{ color }}>{value}</div>
      {sub && <div className="risk-kpi-sub">{sub}</div>}
    </div>
  );
}

function ratioColor(v: number): string {
  if (v >= 1.5) return "#22c55e";
  if (v >= 0.5) return "#eab308";
  return "#ef4444";
}

function winRateColor(v: number): string {
  if (v >= 55) return "#22c55e";
  if (v >= 45) return "var(--text)";
  return "#ef4444";
}

function pfColor(v: number): string {
  if (v >= 1.5) return "#22c55e";
  if (v >= 1.0) return "#eab308";
  return "#ef4444";
}

function ddColor(v: number): string {
  if (v <= 15) return "#22c55e";
  if (v <= 30) return "#eab308";
  return "#ef4444";
}

function insightBorderColor(tipo: string): string {
  switch (tipo) {
    case "POSITIVO": return "rgba(34,197,94,0.3)";
    case "ALERTA": return "rgba(239,68,68,0.3)";
    default: return "rgba(148,163,184,0.3)";
  }
}

function insightBgColor(tipo: string): string {
  switch (tipo) {
    case "POSITIVO": return "rgba(34,197,94,0.06)";
    case "ALERTA": return "rgba(239,68,68,0.06)";
    default: return "rgba(148,163,184,0.06)";
  }
}

function insightTextColor(tipo: string): string {
  switch (tipo) {
    case "POSITIVO": return "#22c55e";
    case "ALERTA": return "#ef4444";
    default: return "var(--text-2)";
  }
}

function insightIcon(tipo: string): string {
  switch (tipo) {
    case "POSITIVO": return "▲";
    case "ALERTA": return "▼";
    default: return "◆";
  }
}

export default function RiskPerformancePage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskPerformance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("1y");

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null); setData(null);
    fetchRiskPerformance(ticker, range)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al calcular performance"))
      .finally(() => setLoading(false));
  }, [ticker, range]);

  const signColor = (v: number) => v >= 0 ? "#22c55e" : "#ef4444";
  const sign = (v: number) => v >= 0 ? "+" : "";

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">
          Performance Intelligence{ticker ? ` — ${ticker}` : ""}
        </h1>
        <p className="risk-subtitle">
          Análisis cuantitativo del rendimiento ajustado por riesgo. Sharpe, Sortino, Calmar, Win Rate, Profit Factor y diagnóstico IA.
        </p>
      </div>

      {!ticker && (
        <div className="risk-disclaimer">Ingresa un ticker para analizar su performance histórico.</div>
      )}

      {/* Range selector */}
      {ticker && (
        <div className="risk-controls">
          <div className="risk-control-group">
            <label className="risk-control-label">Período</label>
            <select
              className="risk-control-select"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading && (
        <div>
          <div className="risk-skeleton" style={{ height: 90, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 90, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 220 }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* Ratios de riesgo/retorno */}
          <div className="risk-section">
            <div className="risk-section-title">Ratios de Riesgo / Retorno</div>
            <div className="risk-kpi-grid">
              <RatioCard
                label="Sharpe Ratio"
                value={data.sharpe_ratio.toFixed(3)}
                sub="Riesgo total anualizado"
                colorFn={ratioColor}
              />
              <RatioCard
                label="Sortino Ratio"
                value={data.sortino_ratio.toFixed(3)}
                sub="Solo desviación a la baja"
                colorFn={ratioColor}
              />
              <RatioCard
                label="Calmar Ratio"
                value={data.calmar_ratio.toFixed(3)}
                sub="Retorno / Max Drawdown"
                colorFn={ratioColor}
              />
              <RatioCard
                label="Sharpe 90d"
                value={data.sharpe_90d.toFixed(3)}
                sub="Reciente (últimos 90 días)"
                colorFn={ratioColor}
              />
            </div>
          </div>

          {/* Métricas de retorno */}
          <div className="risk-section">
            <div className="risk-section-title">Métricas de Retorno</div>
            <div className="risk-kpi-grid">
              <div className="risk-kpi">
                <div className="risk-kpi-label">Retorno Anualizado</div>
                <div className="risk-kpi-val" style={{ color: signColor(data.ann_return_pct) }}>
                  {sign(data.ann_return_pct)}{data.ann_return_pct.toFixed(2)}%
                </div>
                <div className="risk-kpi-sub">Estimado continuo</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Expectativa Diaria</div>
                <div className="risk-kpi-val" style={{ color: signColor(data.expectancy_daily_pct) }}>
                  {sign(data.expectancy_daily_pct)}{data.expectancy_daily_pct.toFixed(3)}%
                </div>
                <div className="risk-kpi-sub">Retorno medio diario</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Win Rate</div>
                <div className="risk-kpi-val" style={{ color: winRateColor(data.win_rate_pct) }}>
                  {data.win_rate_pct.toFixed(1)}%
                </div>
                <div className="risk-kpi-sub">Días positivos</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Profit Factor</div>
                <div className="risk-kpi-val" style={{ color: pfColor(data.profit_factor) }}>
                  {data.profit_factor >= 9.99 ? ">10" : data.profit_factor.toFixed(3)}
                </div>
                <div className="risk-kpi-sub">Ganancias / Pérdidas brutas</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Ganancia Prom.</div>
                <div className="risk-kpi-val text-pos">+{data.avg_win_pct.toFixed(3)}%</div>
                <div className="risk-kpi-sub">Por día ganador</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Pérdida Prom.</div>
                <div className="risk-kpi-val text-neg">{data.avg_loss_pct.toFixed(3)}%</div>
                <div className="risk-kpi-sub">Por día perdedor</div>
              </div>
            </div>
          </div>

          {/* Métricas de riesgo */}
          <div className="risk-section">
            <div className="risk-section-title">Métricas de Riesgo</div>
            <div className="risk-kpi-grid">
              <div className="risk-kpi">
                <div className="risk-kpi-label">Max Drawdown</div>
                <div className="risk-kpi-val" style={{ color: ddColor(data.max_drawdown_pct) }}>
                  -{data.max_drawdown_pct.toFixed(1)}%
                </div>
                <div className="risk-kpi-sub">Caída máxima histórica</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Volatilidad Anual</div>
                <div className="risk-kpi-val">{data.ann_vol_pct.toFixed(1)}%</div>
                <div className="risk-kpi-sub">Desv. estándar anualizada</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Ulcer Index</div>
                <div className="risk-kpi-val" style={{ color: data.ulcer_index > 10 ? "#ef4444" : data.ulcer_index > 5 ? "#eab308" : "#22c55e" }}>
                  {data.ulcer_index.toFixed(2)}
                </div>
                <div className="risk-kpi-sub">Profundidad de drawdowns</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Racha Gan. Máx.</div>
                <div className="risk-kpi-val text-pos">{data.max_consec_wins}d</div>
                <div className="risk-kpi-sub">Días consecutivos</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Racha Pérd. Máx.</div>
                <div className="risk-kpi-val text-neg">{data.max_consec_losses}d</div>
                <div className="risk-kpi-sub">Días consecutivos</div>
              </div>
              <div className="risk-kpi">
                <div className="risk-kpi-label">Observaciones</div>
                <div className="risk-kpi-val">{data.n_obs}</div>
                <div className="risk-kpi-sub">Días de datos</div>
              </div>
            </div>
          </div>

          {/* Análisis IA */}
          <div className="risk-section">
            <div className="risk-section-title">Diagnóstico IA</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s2)" }}>
              {data.insights.map((ins, i) => (
                <div
                  key={i}
                  style={{
                    background: insightBgColor(ins.tipo),
                    border: `1px solid ${insightBorderColor(ins.tipo)}`,
                    borderRadius: "var(--r-lg)",
                    padding: "var(--s3) var(--s4)",
                    display: "flex",
                    gap: "var(--s3)",
                    alignItems: "flex-start",
                  }}
                >
                  <span style={{
                    color: insightTextColor(ins.tipo),
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    flexShrink: 0,
                    marginTop: 2,
                    minWidth: 20,
                  }}>
                    {insightIcon(ins.tipo)}
                  </span>
                  <div>
                    <span style={{
                      fontWeight: 700,
                      fontSize: "0.75rem",
                      color: insightTextColor(ins.tipo),
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      marginRight: "var(--s2)",
                    }}>
                      {ins.tipo}
                    </span>
                    <span style={{ fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.5 }}>
                      {ins.mensaje}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla resumen */}
          <div className="risk-section">
            <div className="risk-section-title">Tabla Comparativa</div>
            <table className="risk-metrics-table">
              <thead>
                <tr>
                  <th>Métrica</th>
                  <th>Valor</th>
                  <th>Referencia</th>
                  <th>Evaluación</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Sharpe Ratio", value: data.sharpe_ratio.toFixed(2), ref: "> 1.0 = bueno", ok: data.sharpe_ratio >= 1.0 },
                  { label: "Sortino Ratio", value: data.sortino_ratio.toFixed(2), ref: "> 1.0 = bueno", ok: data.sortino_ratio >= 1.0 },
                  { label: "Calmar Ratio", value: data.calmar_ratio.toFixed(2), ref: "> 0.5 = bueno", ok: data.calmar_ratio >= 0.5 },
                  { label: "Win Rate", value: `${data.win_rate_pct.toFixed(1)}%`, ref: "> 50% = positivo", ok: data.win_rate_pct >= 50 },
                  { label: "Profit Factor", value: data.profit_factor >= 9.99 ? ">10" : data.profit_factor.toFixed(2), ref: "> 1.0 = viable", ok: data.profit_factor >= 1.0 },
                  { label: "Max Drawdown", value: `-${data.max_drawdown_pct.toFixed(1)}%`, ref: "< 20% = controlado", ok: data.max_drawdown_pct <= 20 },
                  { label: "Ulcer Index", value: data.ulcer_index.toFixed(2), ref: "< 5 = bajo", ok: data.ulcer_index <= 5 },
                ].map((row) => (
                  <tr key={row.label}>
                    <td style={{ color: "var(--text)", fontWeight: 500, fontFamily: "var(--sans)" }}>{row.label}</td>
                    <td style={{ fontWeight: 700 }}>{row.value}</td>
                    <td style={{ color: "var(--text-3)", fontFamily: "var(--sans)", fontSize: "0.8rem" }}>{row.ref}</td>
                    <td>
                      <span style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: "var(--r-full)",
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        background: row.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                        color: row.ok ? "#22c55e" : "#ef4444",
                      }}>
                        {row.ok ? "✓ OK" : "✗ Revisar"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="risk-disclaimer">
            Análisis basado en {data.n_obs} observaciones históricas ({data.range}) · Fuente: yfinance ·
            Métricas calculadas sobre retornos logarítmicos diarios · Solo análisis cuantitativo — no constituye asesoría de inversión.
          </p>
        </>
      )}
    </div>
  );
}
