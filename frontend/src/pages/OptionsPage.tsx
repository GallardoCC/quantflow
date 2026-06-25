import { useEffect, useRef, useState } from "react";
import { api, type OptionsResult, type OptionsParams } from "../api";
import { SearchBox } from "../components/SearchBox";
import { OptionRiskProfile } from "../components/OptionRiskProfile";
import { GreekCurve } from "../components/GreekCurve";
import { OptionHeatmap } from "../components/OptionHeatmap";
import { useTicker } from "../TickerContext";
import "../components/options.css";

/**
 * Griegas de opciones — motor Black-Scholes. Valor teórico, Δ/Γ/Θ/Vega/Ρ,
 * probabilidad ITM, simulador de escenarios y gráficos. Solo análisis: no hay
 * entrada de órdenes ni conexión con broker.
 */

function n(v: number | null | undefined, d = 2) {
  return v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);
}
function signed(v: number, d = 2) { return `${v >= 0 ? "+" : ""}${v.toFixed(d)}`; }

const EXPIRIES = [7, 14, 30, 60, 90, 180];

export default function OptionsPage() {
  const { ticker, setTicker } = useTicker();
  const [kind, setKind] = useState<"call" | "put">("call");
  const [expiry, setExpiry] = useState(30);
  const [strikeInput, setStrikeInput] = useState("");   // vacío = ATM
  const [ivInput, setIvInput] = useState("");           // vacío = histórica
  const [data, setData] = useState<OptionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const init = useRef(false);

  function run(tk = ticker) {
    if (!tk.trim()) return;
    setLoading(true); setError(null);
    const p: OptionsParams = { kind, expiry_days: expiry };
    if (strikeInput.trim()) p.strike = parseFloat(strikeInput);
    if (ivInput.trim()) p.iv = parseFloat(ivInput) / 100;
    api.options(tk, p)
      .then((r) => { setData(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }

  // Recalcular al cambiar el ticker global o los parámetros (no el strike/iv
  // libres hasta pulsar Calcular).
  useEffect(() => { run(ticker); init.current = true; /* eslint-disable-next-line */ }, [ticker, kind, expiry]);

  const g = data?.greeks;
  const curve = data?.spot_curve ?? [];

  return (
    <div className="og">
      <header className="og-intro">
        <h2 className="og-intro-title">Griegas de opciones</h2>
        <p className="og-intro-sub">
          Motor Black-Scholes-Merton — valor teórico, sensibilidades (Δ, Γ, Θ, Vega, Ρ),
          probabilidad ITM y simulador de escenarios. El subyacente es dato real de mercado;
          la volatilidad por defecto es la histórica. Solo análisis.
        </p>
      </header>

      <div className="og-toolbar">
        <SearchBox onSelect={setTicker} />
        <div className="og-seg">
          <button className={kind === "call" ? "on call" : ""} onClick={() => setKind("call")}>CALL</button>
          <button className={kind === "put" ? "on put" : ""} onClick={() => setKind("put")}>PUT</button>
        </div>
        <label className="og-field">
          <span>Strike</span>
          <input value={strikeInput} placeholder="ATM" inputMode="decimal"
            onChange={(e) => setStrikeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        </label>
        <label className="og-field">
          <span>IV %</span>
          <input value={ivInput} placeholder="hist." inputMode="decimal"
            onChange={(e) => setIvInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        </label>
        <div className="og-exp">
          {EXPIRIES.map((d) => (
            <button key={d} className={d === expiry ? "on" : ""} onClick={() => setExpiry(d)}>{d}d</button>
          ))}
        </div>
        <button className="og-run" onClick={() => run()} disabled={loading}>
          {loading ? "Calculando…" : "Calcular ↻"}
        </button>
      </div>

      {error && !loading && <div className="banner error og-banner">⚠ {error}</div>}

      {data && g && (
        <>
          <div className="og-hdr">
            <span className="og-hdr-tk">{data.ticker}</span>
            <span className="og-hdr-name">{data.name}</span>
            <span className={`og-hdr-kind ${data.kind}`}>{data.kind.toUpperCase()}</span>
            <span className="og-hdr-meta">
              Spot {n(data.spot)} · Strike {n(data.strike)} · {data.expiry_days}d ·
              IV {n(data.iv * 100, 1)}% ({data.iv_source}) ·
              <span className={`og-mny og-mny-${data.moneyness.toLowerCase()}`}> {data.moneyness}</span>
            </span>
          </div>

          {/* Valor teórico + griegas */}
          <div className="og-greeks">
            <div className="og-kpi og-kpi-big">
              <span className="og-kpi-l">Valor teórico (prima)</span>
              <span className="og-kpi-v accent">{n(data.premium)}</span>
              <span className="og-kpi-s">Intrínseco {n(g.intrinsic)} · Temporal {n(g.time_value)}</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Delta (Δ)</span>
              <span className="og-kpi-v">{n(g.delta, 3)}</span>
              <span className="og-kpi-s">Por $1 del subyacente</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Gamma (Γ)</span>
              <span className="og-kpi-v">{n(g.gamma, 4)}</span>
              <span className="og-kpi-s">Aceleración de Δ</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Theta (Θ)</span>
              <span className="og-kpi-v neg">{n(g.theta, 3)}</span>
              <span className="og-kpi-s">Decaimiento por día</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Vega</span>
              <span className="og-kpi-v">{n(g.vega, 3)}</span>
              <span className="og-kpi-s">Por +1% de vol</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Rho (Ρ)</span>
              <span className="og-kpi-v">{n(g.rho, 3)}</span>
              <span className="og-kpi-s">Por +1% de tasa</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Prob. ITM</span>
              <span className="og-kpi-v">{n(g.prob_itm * 100, 1)}%</span>
              <span className="og-kpi-s">Riesgo-neutral N(d₂)</span>
            </div>
            <div className="og-kpi">
              <span className="og-kpi-l">Break-even</span>
              <span className="og-kpi-v">{n(data.breakeven)}</span>
              <span className="og-kpi-s">Al vencimiento</span>
            </div>
          </div>

          {/* Perfil de riesgo */}
          <section className="og-card">
            <span className="og-section">Perfil de riesgo — P/L vs. precio del subyacente</span>
            <OptionRiskProfile curve={curve} spot={data.spot} strike={data.strike} breakeven={data.breakeven} />
            <div className="og-legend">
              <span className="og-lg og-lg-now">Valor teórico hoy</span>
              <span className="og-lg og-lg-exp">P/L al vencimiento</span>
              <span className="og-lg og-lg-k">Strike</span>
              <span className="og-lg og-lg-be">Break-even</span>
            </div>
          </section>

          {/* Simulador de escenarios */}
          <section className="og-card">
            <span className="og-section">Simulador de escenarios — movimientos del subyacente</span>
            <table className="og-table">
              <thead>
                <tr>
                  <th>Mov.</th><th className="ta-r">Subyacente</th><th className="ta-r">Precio opción</th>
                  <th className="ta-r">P/L</th><th className="ta-r">P/L %</th>
                  <th className="ta-r">Δ</th><th className="ta-r">Γ</th><th className="ta-r">Θ/día</th>
                </tr>
              </thead>
              <tbody>
                {data.scenarios.map((s) => (
                  <tr key={s.move_pct} className={s.move_pct === 0 ? "og-row-base" : ""}>
                    <td className={s.move_pct > 0 ? "pos" : s.move_pct < 0 ? "neg" : ""}>
                      {s.move_pct > 0 ? "+" : ""}{s.move_pct}%
                    </td>
                    <td className="ta-r">{n(s.spot)}</td>
                    <td className="ta-r">{n(s.price)}</td>
                    <td className={`ta-r ${s.pnl >= 0 ? "pos" : "neg"}`}>{signed(s.pnl)}</td>
                    <td className={`ta-r ${(s.pnl_pct ?? 0) >= 0 ? "pos" : "neg"}`}>
                      {s.pnl_pct == null ? "—" : `${s.pnl_pct > 0 ? "+" : ""}${s.pnl_pct}%`}
                    </td>
                    <td className="ta-r dim">{n(s.delta, 3)}</td>
                    <td className="ta-r dim">{n(s.gamma, 4)}</td>
                    <td className="ta-r dim">{n(s.theta, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Curvas de griegas */}
          <section className="og-card">
            <span className="og-section">Sensibilidades vs. precio del subyacente</span>
            <div className="og-mini-grid">
              <GreekCurve label="Delta (Δ)" color="#5b82f0" spot={data.spot}
                points={curve.map((p) => ({ spot: p.spot, v: p.delta }))} fmt={(v) => v.toFixed(2)} />
              <GreekCurve label="Gamma (Γ)" color="#4fc3e8" spot={data.spot}
                points={curve.map((p) => ({ spot: p.spot, v: p.gamma }))} fmt={(v) => v.toFixed(3)} />
              <GreekCurve label="Vega" color="#2ebd85" spot={data.spot}
                points={curve.map((p) => ({ spot: p.spot, v: p.vega }))} fmt={(v) => v.toFixed(2)} />
              <GreekCurve label="Theta (Θ)" color="#f0566b" spot={data.spot}
                points={curve.map((p) => ({ spot: p.spot, v: p.theta }))} fmt={(v) => v.toFixed(3)} />
            </div>
          </section>

          {/* Superficies (heatmaps) */}
          <div className="og-detail-row">
            <section className="og-card">
              <span className="og-section">Superficie de Vega — precio × vencimiento</span>
              <OptionHeatmap spots={data.surface.spots} days={data.surface.days}
                matrix={data.surface.vega} title="Vega (por +1% de vol)" strike={data.strike} />
            </section>
            <section className="og-card">
              <span className="og-section">Exposición a Gamma — precio × vencimiento</span>
              <OptionHeatmap spots={data.surface.spots} days={data.surface.days}
                matrix={data.surface.gamma} title="Gamma" strike={data.strike} />
            </section>
          </div>

          {/* Cadena teórica */}
          <section className="og-card">
            <span className="og-section">Cadena teórica de opciones (modelo Black-Scholes, no datos de mercado)</span>
            <table className="og-table og-chain">
              <thead>
                <tr>
                  <th className="ta-r">Call P.ITM</th><th className="ta-r">Call Δ</th><th className="ta-r">Call precio</th>
                  <th className="ta-c">Strike</th>
                  <th className="ta-r">Put precio</th><th className="ta-r">Put Δ</th><th className="ta-r">Put P.ITM</th>
                </tr>
              </thead>
              <tbody>
                {data.chain.map((row) => {
                  const atm = Math.abs(row.strike - data.spot) / data.spot < 0.013;
                  return (
                    <tr key={row.strike} className={atm ? "og-row-base" : ""}>
                      <td className="ta-r dim">{n(row.call.prob_itm * 100, 0)}%</td>
                      <td className="ta-r dim">{n(row.call.delta, 2)}</td>
                      <td className="ta-r pos">{n(row.call.price)}</td>
                      <td className="ta-c og-chain-k">{n(row.strike)}<span className="og-chain-mny">{signed(row.moneyness, 1)}%</span></td>
                      <td className="ta-r neg">{n(row.put.price)}</td>
                      <td className="ta-r dim">{n(row.put.delta, 2)}</td>
                      <td className="ta-r dim">{n(row.put.prob_itm * 100, 0)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="og-note">
              La cadena se calcula con el modelo a partir del spot y la IV; sirve para comparar
              strikes. No incluye volumen/interés abierto reales porque las fuentes gratuitas
              actuales no proveen cadena de opciones en vivo — no se inventan esos datos.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
