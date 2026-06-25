import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTicker } from "../TickerContext";
import { fetchRiskStress, type RiskStress } from "../api";
import "../components/risk.css";

export default function RiskStressPage() {
  const { ticker } = useTicker();
  const [data, setData] = useState<RiskStress | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!ticker) return;
    setLoading(true); setError(null); setData(null);
    fetchRiskStress(ticker)
      .then(setData)
      .catch((e) => setError(e.message === "404" ? `Sin datos para ${ticker}` : "Error al cargar escenarios de stress"))
      .finally(() => setLoading(false));
  }, [ticker]);

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // Sort: negative shocks first (most negative first), then positive
  const sortedScenarios = data
    ? [...data.escenarios].sort((a, b) => a.shock_mercado_pct - b.shock_mercado_pct)
    : [];

  // SVG horizontal bar chart
  const renderBarChart = () => {
    if (!sortedScenarios.length) return null;
    const BAR_H = 28, GAP = 8, PAD_L = 130, PAD_R = 20, PAD_T = 10, PAD_B = 10;
    const maxAbs = Math.max(...sortedScenarios.map((s) => Math.abs(s.impacto_activo_pct)), 1);
    const innerW = 500;
    const totalH = PAD_T + PAD_B + sortedScenarios.length * (BAR_H + GAP);
    const zeroX = PAD_L + innerW / 2;

    return (
      <svg viewBox={`0 0 ${PAD_L + innerW + PAD_R} ${totalH}`} style={{ width: "100%", height: totalH }}>
        {/* Zero line */}
        <line x1={zeroX} y1={PAD_T} x2={zeroX} y2={totalH - PAD_B} stroke="var(--border)" strokeWidth={1} />

        {sortedScenarios.map((s, i) => {
          const y = PAD_T + i * (BAR_H + GAP);
          const pct = s.impacto_activo_pct / (maxAbs * 2);
          const barW = Math.abs(pct) * innerW;
          const isNeg = s.impacto_activo_pct < 0;
          const barX = isNeg ? zeroX - barW : zeroX;
          const fill = isNeg ? "#ef4444" : "#22c55e";

          return (
            <g key={i}>
              <text
                x={PAD_L - 8}
                y={y + BAR_H / 2 + 4}
                fontSize="10"
                fill="var(--text-2)"
                textAnchor="end"
              >
                {s.nombre.length > 18 ? s.nombre.slice(0, 18) + "…" : s.nombre}
              </text>
              <rect x={barX} y={y} width={barW} height={BAR_H} fill={fill} opacity={0.75} rx={3} />
              <text
                x={isNeg ? barX - 4 : barX + barW + 4}
                y={y + BAR_H / 2 + 4}
                fontSize="10"
                fill={fill}
                textAnchor={isNeg ? "end" : "start"}
                fontFamily="var(--mono)"
                fontWeight="600"
              >
                {s.impacto_activo_pct > 0 ? "+" : ""}{s.impacto_activo_pct.toFixed(1)}%
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  return (
    <div className="risk-page">
      <Link to="/riesgo" className="risk-back">← Volver a Riesgo IA</Link>

      <div className="risk-header">
        <h1 className="risk-title">
          Simulación de Crisis{ticker ? ` — ${ticker}` : ""}
        </h1>
        <p className="risk-subtitle">
          Escenarios extremos aplicados al activo: crash, recesión, alza de tasas, shock inflacionario y más.
        </p>
      </div>

      {!ticker && (
        <div className="risk-disclaimer">Ingresa un ticker para ver los escenarios de stress.</div>
      )}

      {loading && (
        <div>
          <div className="risk-skeleton" style={{ height: 80, marginBottom: "var(--s3)" }} />
          <div className="risk-skeleton" style={{ height: 300 }} />
        </div>
      )}

      {error && <div className="risk-disclaimer">{error}</div>}

      {data && (
        <>
          {/* Header KPIs */}
          <div className="risk-kpi-grid">
            <div className="risk-kpi">
              <div className="risk-kpi-label">Precio Actual</div>
              <div className="risk-kpi-val">${data.current_price.toFixed(2)}</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Beta</div>
              <div className="risk-kpi-val"
                style={{ color: data.beta > 1.5 ? "#ef4444" : data.beta < 0.8 ? "#22c55e" : "var(--text)" }}>
                {data.beta.toFixed(2)}
              </div>
              <div className="risk-kpi-sub">vs mercado</div>
            </div>
            <div className="risk-kpi">
              <div className="risk-kpi-label">Drawdown Máx. Hist.</div>
              <div className="risk-kpi-val text-neg">{data.drawdown_historico_max.toFixed(1)}%</div>
              <div className="risk-kpi-sub">Caída máxima histórica</div>
            </div>
          </div>

          {/* Scenario rows */}
          <div className="risk-section">
            <div className="risk-section-title">Escenarios de Crisis</div>

            {/* Table header */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 90px 100px 80px",
                gap: "var(--s3)",
                padding: "4px var(--s3) 8px",
                fontSize: "0.72rem",
                color: "var(--text-3)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              <span>Escenario</span>
              <span style={{ textAlign: "center" }}>Shock</span>
              <span style={{ textAlign: "center" }}>Impacto</span>
              <span style={{ textAlign: "center" }}>Precio</span>
              <span style={{ textAlign: "center" }}>Prob.</span>
            </div>

            <div className="stress-scenarios">
              {sortedScenarios.map((s, i) => {
                const isNeg = s.impacto_activo_pct < 0;
                const isOpen = expanded.has(i);
                return (
                  <div key={i} className="stress-row-wrap">
                    <div
                      className="stress-row-header"
                      onClick={() => toggleExpand(i)}
                      style={{ cursor: "pointer" }}
                    >
                      <span className="stress-name">
                        {isOpen ? "▼ " : "▶ "}{s.nombre}
                      </span>
                      <span className={`stress-shock ${s.shock_mercado_pct < 0 ? "text-neg" : "text-pos"}`}
                        style={{ textAlign: "center" }}>
                        {s.shock_mercado_pct > 0 ? "+" : ""}{s.shock_mercado_pct.toFixed(1)}%
                      </span>
                      <span className={`stress-impact ${isNeg ? "text-neg" : "text-pos"}`}
                        style={{ textAlign: "center" }}>
                        {s.impacto_activo_pct > 0 ? "+" : ""}{s.impacto_activo_pct.toFixed(1)}%
                      </span>
                      <span className="stress-price" style={{ textAlign: "center" }}>
                        ${s.precio_esperado.toFixed(2)}
                      </span>
                      <span className="stress-prob" style={{ textAlign: "center" }}>
                        {s.probabilidad}
                      </span>
                    </div>
                    {isOpen && (
                      <div className="stress-row-desc">{s.descripcion}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bar chart */}
          <div className="risk-section">
            <div className="risk-section-title">Impacto por Escenario</div>
            <div className="stress-chart-wrap">
              {renderBarChart()}
            </div>
          </div>

          {data.nota && (
            <p className="risk-disclaimer">{data.nota}</p>
          )}
          <p className="risk-disclaimer">
            Solo análisis cuantitativo — los escenarios son simulaciones, no predicciones.
          </p>
        </>
      )}
    </div>
  );
}
