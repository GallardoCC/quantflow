import type { OFMl } from "../../api";
import { RegimeRibbon } from "./RegimeRibbon";
import { MetricBadge } from "./Badges";

function hhmm(t: number) {
  return new Date(t * 1000).toLocaleString("es-PE", { day: "2-digit", month: "short", hour12: false });
}

/** Gauge semicircular de probabilidad direccional calibrada. */
function ProbGauge({ p, experimental }: { p: number; experimental: boolean }) {
  const pct = Math.round(p * 100);
  const angle = -90 + p * 180;
  const col = experimental ? "var(--text-3)" : p >= 0.55 ? "var(--pos)" : p <= 0.45 ? "var(--neg)" : "var(--accent)";
  return (
    <div className="ofx-ml-gauge">
      <svg viewBox="0 0 120 70">
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke="var(--surface-3)" strokeWidth={9} strokeLinecap="round" />
        <path d="M10 60 A50 50 0 0 1 110 60" fill="none" stroke={col} strokeWidth={9} strokeLinecap="round"
          strokeDasharray={`${(p * Math.PI * 50)} 999`} />
        <line x1={60} y1={60} x2={60 + 42 * Math.cos((angle * Math.PI) / 180)} y2={60 + 42 * Math.sin((angle * Math.PI) / 180)}
          stroke={col} strokeWidth={2.5} />
        <circle cx={60} cy={60} r={3.5} fill={col} />
      </svg>
      <div className="ofx-ml-gauge-val" style={{ color: col }}>{pct}%</div>
      <div className="ofx-ml-gauge-lbl">P(alza · {""}horizonte)</div>
    </div>
  );
}

/** Curva de calibración (reliability): predicho vs observado. */
function Calibration({ pts }: { pts: { bin: number; predicted: number; observed: number; n: number }[] }) {
  if (!pts.length) return <div className="ofx-sub">Sin datos de calibración.</div>;
  const S = 160, pad = 22;
  const xy = (v: number) => pad + v * (S - 2 * pad);
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="ofx-calib">
      <line x1={pad} y1={S - pad} x2={S - pad} y2={pad} stroke="var(--border)" strokeDasharray="3 3" />
      <line x1={pad} y1={S - pad} x2={S - pad} y2={S - pad} stroke="var(--border)" />
      <line x1={pad} y1={pad} x2={pad} y2={S - pad} stroke="var(--border)" />
      <polyline fill="none" stroke="var(--accent)" strokeWidth={1.6}
        points={pts.map((p) => `${xy(p.predicted)},${S - xy(p.observed)}`).join(" ")} />
      {pts.map((p, i) => <circle key={i} cx={xy(p.predicted)} cy={S - xy(p.observed)} r={2.5} fill="var(--accent)" />)}
      <text x={S / 2} y={S - 4} fontSize={7} textAnchor="middle" fill="var(--text-3)">predicho</text>
      <text x={6} y={S / 2} fontSize={7} fill="var(--text-3)" transform={`rotate(-90 6 ${S / 2})`}>observado</text>
    </svg>
  );
}

export function MLView({ ml }: { ml: OFMl }) {
  const d = ml.directional;
  return (
    <div className="ofx-ml">
      {/* RÉGIMEN */}
      <div className="ofx-ml-block">
        <div className="ofx-ml-head">
          <span className="ofx-ml-title">Régimen de mercado (GMM no supervisado)</span>
          <span className="ofx-badge ofx-pos">{ml.regime.current.label} · {ml.regime.current.confidence}%</span>
        </div>
        <RegimeRibbon ribbon={ml.regime.ribbon} />
      </div>

      {/* DIRECCIONAL */}
      <div className="ofx-ml-block">
        <div className="ofx-ml-head">
          <span className="ofx-ml-title">Modelo direccional (triple-barrier · walk-forward)</span>
          {d.available && (
            <span className={`ofx-badge ${d.experimental ? "ofx-warn" : "ofx-pos"}`}>
              {d.experimental ? "EXPERIMENTAL — no opera" : "validado out-of-sample"}
            </span>
          )}
        </div>
        {!d.available ? (
          <div className="ofx-state">{d.note}</div>
        ) : (
          <div className="ofx-ml-dir">
            <ProbGauge p={d.probUp ?? 0.5} experimental={!!d.experimental} />
            <div className="ofx-ml-metrics">
              <MetricBadge k="log-loss" v={`${d.metrics?.logloss}`} tone={d.metrics && d.metrics.logloss < d.metrics.baselineLogloss ? "pos" : "neg"} />
              <MetricBadge k="baseline" v={`${d.metrics?.baselineLogloss}`} tone="neu" />
              <MetricBadge k="precisión" v={`${((d.metrics?.precision ?? 0) * 100).toFixed(0)}%`} />
              <MetricBadge k="recall" v={`${((d.metrics?.recall ?? 0) * 100).toFixed(0)}%`} />
              <MetricBadge k="Sharpe (c/costos)" v={`${d.backtest?.sharpe}`} tone={(d.backtest?.sharpe ?? 0) > 0.3 ? "pos" : "neg"} />
              <MetricBadge k="win rate" v={`${((d.backtest?.winRate ?? 0) * 100).toFixed(0)}%`} />
              <MetricBadge k="ret. backtest" v={`${((d.backtest?.totalReturn ?? 0) * 100).toFixed(1)}%`} tone={(d.backtest?.totalReturn ?? 0) > 0 ? "pos" : "neg"} />
              <MetricBadge k="muestras OOS" v={`${d.metrics?.nSamples}`} tone="neu" />
            </div>
            <div className="ofx-ml-calib">
              <div className="ofx-sub" style={{ marginBottom: 4 }}>Calibración</div>
              <Calibration pts={d.calibration ?? []} />
            </div>
          </div>
        )}
        <p className="ofx-note">{d.note}</p>
        {d.importance && d.importance.length > 0 && (
          <div className="ofx-imp">
            {d.importance.slice(0, 6).map((f) => (
              <div key={f.name} className="ofx-imp-row">
                <span className="ofx-imp-name">{f.name}</span>
                <span className="ofx-imp-bar"><i style={{ width: `${f.importance * 100}%` }} /></span>
                <span className="ofx-imp-val">{(f.importance * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ANOMALÍAS */}
      <div className="ofx-ml-block">
        <div className="ofx-ml-head">
          <span className="ofx-ml-title">Anomalías de microestructura (Isolation Forest)</span>
          <span className="ofx-badge ofx-neu">{ml.anomalies.items.length} eventos</span>
        </div>
        {ml.anomalies.items.length === 0 ? (
          <div className="ofx-sub">Sin anomalías relevantes en la ventana.</div>
        ) : (
          <div className="ofx-events">
            {ml.anomalies.items.map((a, i) => (
              <div key={i} className="ofx-event">
                <span className="ofx-badge ofx-warn">score {a.score}</span> {a.note}
                <span className="ofx-event-meta"> · {hhmm(a.t)} @ {a.price}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="ofx-disclaimer">{ml.disclaimer}</p>
    </div>
  );
}
