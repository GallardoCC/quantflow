import { useEffect, useState } from "react";
import { api, type AnomResult } from "../api";
import { SearchBox } from "../components/SearchBox";
import { VarianceRatioChart } from "../components/VarianceRatioChart";
import { BarSeries } from "../components/BarSeries";
import { useTicker } from "../TickerContext";
import "../components/anomalies.css";

/**
 * Anomalías de mercado y test de la Hipótesis de Mercados Eficientes (HME).
 * Razón de varianzas, ACF, rachas, Ljung-Box y efectos de calendario. El
 * veredicto resume cuántos contrastes rechazan el paseo aleatorio. Solo análisis.
 */

const RANGES = [
  { label: "1A", value: "1y" }, { label: "2A", value: "2y" },
  { label: "3A", value: "3y" }, { label: "5A", value: "5y" },
];

function pct(v: number, d = 3) { return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`; }

const VERDICT_CLASS: Record<number, string> = {
  0: "an-pos", 1: "an-pos", 2: "an-warn", 3: "an-neg",
};

export default function AnomaliesPage() {
  const { ticker, setTicker } = useTicker();
  const [range, setRange] = useState("3y");
  const [data, setData] = useState<AnomResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(tk = ticker, rg = range) {
    if (!tk.trim()) return;
    setLoading(true); setError(null);
    api.anomalies(tk, rg)
      .then((r) => { setData(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }
  // Re-consulta al cambiar el ticker global o el rango.
  useEffect(() => { run(ticker, range); /* eslint-disable-next-line */ }, [ticker, range]);

  return (
    <div className="an">
      <header className="an-intro">
        <h2 className="an-intro-title">Anomalías y eficiencia de mercado</h2>
        <p className="an-intro-sub">
          ¿Siguen los precios un paseo aleatorio (Hipótesis de Mercados Eficientes en forma
          débil) o hay estructura explotable? Batería de contrastes estadísticos: razón de
          varianzas, autocorrelación, rachas, Ljung-Box y efectos de calendario. Solo análisis.
        </p>
      </header>

      <div className="an-toolbar">
        <SearchBox onSelect={setTicker} />
        <div className="an-range">
          {RANGES.map((r) => (
            <button key={r.value} className={r.value === range ? "on" : ""}
              onClick={() => setRange(r.value)}>{r.label}</button>
          ))}
        </div>
        <button className="an-run" onClick={() => run()} disabled={loading}>
          {loading ? "Calculando…" : "Calcular ↻"}
        </button>
      </div>

      {error && !loading && <div className="banner error an-banner">⚠ {error}</div>}

      {data && (
        <>
          {/* Veredicto global */}
          <section className="an-card an-verdict">
            <div className="an-verdict-main">
              <span className="an-verdict-lbl">Veredicto sobre la HME</span>
              <span className={`an-verdict-tag ${VERDICT_CLASS[data.score]}`}>{data.verdict}</span>
              <span className="an-verdict-desc">
                <strong>{data.ticker}</strong> · {data.n_obs} retornos diarios ·
                {" "}{data.rejections}/{data.total_tests} contrastes rechazan el paseo aleatorio ·
                sesgo: <strong>{data.bias}</strong>
              </span>
            </div>
            <div className="an-score">
              <div className="an-score-track">
                {["Eficiente", "Mayormente", "Débil", "Ineficiente"].map((l, i) => (
                  <span key={i} className={`an-score-seg ${i === data.score ? "on s" + i : ""}`}>{l}</span>
                ))}
              </div>
            </div>
          </section>

          {/* Razón de varianzas */}
          <section className="an-card">
            <div className="an-h">
              <span className="an-section">Test de razón de varianzas (Lo-MacKinlay)</span>
              <span className={`an-badge ${data.variance_ratio.reject ? "an-neg" : "an-pos"}`}>
                {data.variance_ratio.reject ? "Rechaza paseo aleatorio" : "Compatible con paseo aleatorio"}
              </span>
            </div>
            <VarianceRatioChart rows={data.variance_ratio.rows} />
            <table className="an-table">
              <thead><tr><th>Horizonte q</th><th className="ta-r">VR(q)</th><th className="ta-r">z robusto</th><th className="ta-r">p-valor</th><th className="ta-r">Lectura</th></tr></thead>
              <tbody>
                {data.variance_ratio.rows.map((r) => (
                  <tr key={r.q}>
                    <td>{r.q} días</td>
                    <td className="ta-r">{r.vr.toFixed(3)}</td>
                    <td className="ta-r">{r.z >= 0 ? "+" : ""}{r.z.toFixed(2)}</td>
                    <td className={`ta-r ${r.reject ? "neg" : "dim"}`}>{r.p.toFixed(3)}</td>
                    <td className="ta-r">{r.vr > 1.05 ? "Momentum" : r.vr < 0.95 ? "Reversión" : "Neutral"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="an-note">
              VR=1 ⇒ paseo aleatorio. <strong>VR&gt;1</strong> indica persistencia (momentum);
              <strong> VR&lt;1</strong>, reversión a la media. Un z robusto |z|&gt;1.96 (p&lt;0.05)
              rechaza la eficiencia en ese horizonte.
            </p>
          </section>

          {/* Autocorrelación */}
          <section className="an-card">
            <div className="an-h">
              <span className="an-section">Autocorrelación de retornos (ACF)</span>
              <span className={`an-badge ${data.acf.n_significant ? "an-neg" : "an-pos"}`}>
                {data.acf.n_significant} de 10 rezagos significativos
              </span>
            </div>
            <BarSeries
              bars={data.acf.rows.map((a) => ({ label: String(a.lag), value: a.rho, highlight: a.significant }))}
              band={data.acf.band} height={200} />
            <p className="an-note">
              La banda sombreada es ±{data.acf.band.toFixed(3)} (significancia 95%, ≈ 1.96/√N).
              Barras fuera de la banda = autocorrelación significativa ⇒ retornos predecibles a
              ese rezago, una violación de la eficiencia débil.
            </p>
          </section>

          {/* Rachas + Ljung-Box */}
          <div className="an-row">
            <section className="an-card">
              <span className="an-section">Test de rachas (aleatoriedad del signo)</span>
              <div className="an-stat-grid">
                <div><span className="an-k">Rachas observadas</span><span className="an-v">{data.runs.runs}</span></div>
                <div><span className="an-k">Esperadas (aleatorio)</span><span className="an-v">{data.runs.expected}</span></div>
                <div><span className="an-k">z</span><span className="an-v">{data.runs.z >= 0 ? "+" : ""}{data.runs.z.toFixed(2)}</span></div>
                <div><span className="an-k">p-valor</span><span className="an-v">{data.runs.p.toFixed(3)}</span></div>
              </div>
              <span className={`an-badge ${data.runs.random ? "an-pos" : "an-neg"}`}>
                {data.runs.random ? "Secuencia aleatoria" : "Secuencia NO aleatoria"}
              </span>
              <p className="an-note">Contrasta si la sucesión de signos (+/−) es aleatoria. Pocas
                rachas ⇒ persistencia; demasiadas ⇒ reversión sistemática.</p>
            </section>
            <section className="an-card">
              <span className="an-section">Q de Ljung-Box (autocorrelación conjunta)</span>
              <div className="an-stat-grid">
                <div><span className="an-k">Q (10 rezagos)</span><span className="an-v">{data.ljung_box.q.toFixed(1)}</span></div>
                <div><span className="an-k">Crítico χ² 5%</span><span className="an-v">{data.ljung_box.crit.toFixed(1)}</span></div>
              </div>
              <span className={`an-badge ${data.ljung_box.reject ? "an-neg" : "an-pos"}`}>
                {data.ljung_box.reject ? "Rechaza independencia" : "No rechaza independencia"}
              </span>
              <p className="an-note">Prueba conjunta de que TODAS las autocorrelaciones (1–10) son
                cero. Q &gt; crítico ⇒ hay dependencia temporal en los retornos.</p>
            </section>
          </div>

          {/* Efecto día de la semana */}
          <section className="an-card">
            <div className="an-h">
              <span className="an-section">Anomalía de calendario — efecto día de la semana</span>
              <span className={`an-badge ${data.day_of_week.significant ? "an-neg" : "an-pos"}`}>
                {data.day_of_week.significant ? "Efecto significativo detectado" : "Sin efecto significativo"}
              </span>
            </div>
            <BarSeries
              bars={data.day_of_week.rows.map((d) => ({ label: d.label.slice(0, 3), value: d.mean, highlight: d.significant }))}
              unit="%" height={190} colorPos="var(--pos)" colorNeg="var(--neg)" />
            <table className="an-table">
              <thead><tr><th>Día</th><th className="ta-r">Retorno medio</th><th className="ta-r">t-stat</th><th className="ta-r">p-valor</th><th className="ta-r">n</th></tr></thead>
              <tbody>
                {data.day_of_week.rows.map((d) => (
                  <tr key={d.label} className={d.significant ? "an-sig-row" : ""}>
                    <td>{d.label}</td>
                    <td className={`ta-r ${d.mean >= 0 ? "pos" : "neg"}`}>{pct(d.mean)}</td>
                    <td className="ta-r">{d.t >= 0 ? "+" : ""}{d.t.toFixed(2)}</td>
                    <td className={`ta-r ${d.significant ? "neg" : "dim"}`}>{d.p.toFixed(3)}</td>
                    <td className="ta-r dim">{d.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="an-note">Bajo la HME, el rendimiento medio no debería depender del día.
              Un día con t-stat |t|&gt;1.96 marca una anomalía persistente (p. ej. el clásico “efecto lunes”).</p>
          </section>

          {/* Efecto mes + cambio de mes */}
          <div className="an-row">
            <section className="an-card">
              <span className="an-section">Efecto mes del año (enero / “sell in May”)</span>
              <BarSeries
                bars={data.month_of_year.rows.map((m) => ({ label: m.label, value: m.mean, highlight: m.significant }))}
                unit="%" height={190} colorPos="var(--pos)" colorNeg="var(--neg)" />
              <p className="an-note">
                Enero {pct(data.month_of_year.january)} vs. media del resto {pct(data.month_of_year.rest_avg)}.
                {data.month_of_year.january_effect
                  ? " Se observa un “efecto enero” (enero supera claramente al resto)."
                  : " Sin un “efecto enero” claro en esta muestra."}
              </p>
            </section>
            <section className="an-card">
              <span className="an-section">Efecto cambio de mes (turn-of-month)</span>
              <div className="an-tom">
                <div className="an-tom-bars">
                  <div className="an-tom-bar">
                    <span className="an-tom-lbl">Cambio de mes</span>
                    <div className="an-tom-track"><span className={`an-tom-fill ${data.turn_of_month.tom_mean >= 0 ? "pos" : "neg"}`}
                      style={{ width: `${Math.min(Math.abs(data.turn_of_month.tom_mean) * 400, 100)}%` }} /></div>
                    <span className="an-tom-val">{pct(data.turn_of_month.tom_mean)}</span>
                  </div>
                  <div className="an-tom-bar">
                    <span className="an-tom-lbl">Resto de días</span>
                    <div className="an-tom-track"><span className={`an-tom-fill ${data.turn_of_month.rest_mean >= 0 ? "pos" : "neg"}`}
                      style={{ width: `${Math.min(Math.abs(data.turn_of_month.rest_mean) * 400, 100)}%` }} /></div>
                    <span className="an-tom-val">{pct(data.turn_of_month.rest_mean)}</span>
                  </div>
                </div>
              </div>
              <span className={`an-badge ${data.turn_of_month.effect ? "an-neg" : "an-pos"}`}>
                {data.turn_of_month.effect ? "Efecto cambio de mes presente" : "Sin efecto claro"}
              </span>
              <p className="an-note">Compara los últimos/primeros días hábiles del mes frente al resto.
                Históricamente concentran buena parte del rendimiento (flujos de fin de mes).</p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
