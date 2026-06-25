// Sección REVERSIÓN A LA MEDIA — regresión lineal log + canal de bandas σ.
// Solo análisis. Incluye bloque educativo de matemáticas al pie.
import { useCallback, useEffect, useState } from "react";
import {
  api,
  type MeanReversion,
  type MeanReversionVerdict,
  type MeanReversionSignal,
} from "../api";
import { SearchBox } from "./SearchBox";
import { MeanReversionChart } from "./MeanReversionChart";
import { ZScorePanel } from "./ZScorePanel";
import { useTicker } from "../TickerContext";

const RANGES = ["1mo", "3mo", "6mo", "1y", "5y"];

const VERDICT_CLASS: Record<MeanReversionVerdict, string> = {
  INFRAVALORADO: "mr-good",
  BARATO:        "mr-good",
  EQUILIBRIO:    "mr-neutral",
  CARO:          "mr-bad",
  SOBREVALORADO: "mr-bad",
};

const SIGNAL_LABEL: Record<MeanReversionSignal, string> = {
  BUY:        "COMPRA",
  WATCH_BUY:  "VIGILAR COMPRA",
  NEUTRAL:    "NEUTRAL",
  WATCH_SELL: "VIGILAR VENTA",
  SELL:       "VENTA",
};

const SIGNAL_CLASS: Record<MeanReversionSignal, string> = {
  BUY:        "mr-good",
  WATCH_BUY:  "mr-good",
  NEUTRAL:    "mr-neutral",
  WATCH_SELL: "mr-bad",
  SELL:       "mr-bad",
};

function fmt(n: number | null, opts: Intl.NumberFormatOptions = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, ...opts });
}

export function MeanReversionPanel() {
  const { ticker, setTicker } = useTicker();
  const [range,  setRange]  = useState("1y");
  const [data,   setData]   = useState<MeanReversion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const load = useCallback(async (tk: string, rg: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.meanReversion(tk, rg);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(ticker, range); }, [ticker, range, load]);

  const st = data?.stats;
  const z = st?.zScore ?? 0;
  const clampedZ = Math.max(-3, Math.min(3, z));
  const markerPct = ((clampedZ + 3) / 6) * 100;

  // Métricas calculadas desde los puntos históricos
  const lastPt  = data?.points[data.points.length - 1] ?? null;
  const distPct = lastPt
    ? ((lastPt.price - lastPt.mean) / lastPt.mean) * 100
    : null;
  const absZ = Math.abs(st?.zScore ?? 0);
  const extremeCount = data?.points.filter((p) => Math.abs(p.z) >= absZ).length ?? 0;
  const extremePct   = data?.points.length ? (extremeCount / data.points.length) * 100 : 0;

  const stats = st
    ? [
        { label: "Z-Score",            value: fmt(st.zScore), cls: "" },
        {
          label: "Vida media (días)",
          value:
            st.halfLife === null || !st.isMeanReverting
              ? "NO REVIERTE"
              : `${fmt(st.halfLife)} d`,
          cls: st.halfLife === null || !st.isMeanReverting ? "mr-amber" : "",
        },
        { label: "σ residual",         value: fmt(st.sigma),                                    cls: "" },
        {
          label: "Deriva anual",
          value: `${st.slopeAnnual >= 0 ? "+" : ""}${fmt(st.slopeAnnual * 100)}%`,
          cls:   st.slopeAnnual >= 0 ? "mr-pos" : "mr-neg",
        },
        { label: "R² ajuste",          value: `${fmt(st.rSquared * 100)}%`,                     cls: "" },
        { label: "φ (phi)",            value: fmt(st.phi, { maximumFractionDigits: 4 }),         cls: "" },
        {
          label: "Dist. de media",
          value: distPct !== null ? `${distPct >= 0 ? "+" : ""}${fmt(distPct)}%` : "—",
          cls:   distPct !== null ? (distPct > 0 ? "mr-neg" : distPct < 0 ? "mr-pos" : "") : "",
        },
        {
          label: "|Z| ≥ actual (hist.)",
          value: `${extremeCount} / ${data?.points.length ?? 0}`,
          cls:   extremePct < 5 ? "mr-amber" : "",
        },
        { label: "HL en barras",       value: st.halfLifeBars ? `${st.halfLifeBars} barras` : "—", cls: "" },
        {
          label: "Score veredicto",
          value: `${st.verdictScore > 0 ? "+" : ""}${st.verdictScore} / 2`,
          cls:   st.verdictScore >= 1 ? "mr-pos" : st.verdictScore <= -1 ? "mr-neg" : "mr-amber",
        },
      ]
    : [];

  // Texto de interpretación dinámico
  function interpretText(): { signal: string; context: string; risk: string } {
    if (!st) return { signal: "", context: "", risk: "" };
    const z = st.zScore;
    const rev = st.isMeanReverting;
    const hl  = st.halfLife;

    let signal = "";
    if (!rev) {
      signal = "El activo muestra una <strong>tendencia dominante</strong> (φ ≈ 1) — el modelo de reversión no aplica en este rango. Usa análisis de tendencia en su lugar.";
    } else if (z <= -2) {
      signal = `Precio <span class="hi-pos">muy por debajo de la media</span> (Z = ${fmt(z)}). Históricamente extremo — señal de posible recuperación hacia la media, sujeta a confirmación.`;
    } else if (z <= -1) {
      signal = `Precio <span class="hi-pos">por debajo de la media</span> (Z = ${fmt(z)}). Zona de compra estadística moderada — el precio ha recorrido más de 1σ bajo la tendencia.`;
    } else if (z >= 2) {
      signal = `Precio <span class="hi-neg">muy por encima de la media</span> (Z = ${fmt(z)}). Zona de sobreextensión — el mercado está estadísticamente caro respecto a la tendencia.`;
    } else if (z >= 1) {
      signal = `Precio <span class="hi-neg">por encima de la media</span> (Z = ${fmt(z)}). Zona de cuidado — el precio ha recorrido más de 1σ sobre la tendencia.`;
    } else {
      signal = `Precio <span class="hi-amber">cerca de la media</span> (Z = ${fmt(z)}). Sin señal extrema — el activo cotiza dentro del canal de regresión normal.`;
    }

    const context = rev
      ? `El activo revierte a la media con una vida media de <strong>${hl !== null ? fmt(hl) + " días" : "N/D"}</strong>. Solo el ${fmt(extremePct, { maximumFractionDigits: 1 })}% de las sesiones históricas han visto un Z-score de magnitud igual o mayor. El R² de ${fmt(st.rSquared * 100)}% indica que la tendencia explica <strong>${st.rSquared > 0.85 ? "muy bien" : st.rSquared > 0.6 ? "razonablemente bien" : "parcialmente"}</strong> el movimiento del precio.`
      : `El activo NO revierte a la media en el rango seleccionado (φ = ${fmt(st.phi, { maximumFractionDigits: 4 })}). El canal de regresión es meramente descriptivo y no predictivo. Considera cambiar al análisis de tendencia.`;

    const risk = `La deriva anual implícita es <strong>${st.slopeAnnual >= 0 ? "+" : ""}${fmt(st.slopeAnnual * 100)}%</strong> sobre la tendencia. La volatilidad residual (σ = ${fmt(st.sigma)}) define el ancho de las bandas. <strong>Solo análisis</strong> — ninguna señal constituye una recomendación de inversión.`;

    return { signal, context, risk };
  }
  const interp = interpretText();

  return (
    <div className="mr">

      {/* Gradient hero header */}
      <section className="mr-hero">
        <h2 className="mr-hero-title">REVERSIÓN A LA MEDIA</h2>
        <p className="mr-hero-sub">
          Regresión log-lineal sobre precio histórico. Calcula el canal estadístico (Media ± n·σ),
          mide la desviación actual como Z-score y estima la velocidad de reversión mediante AR(1).
          Útil para identificar niveles de precio estadísticamente extremos respecto a la tendencia de largo plazo.
        </p>
        <div className="mr-hero-badges">
          <span className="mr-hero-badge">Regresión OLS</span>
          <span className="mr-hero-badge">Z-Score</span>
          <span className="mr-hero-badge">AR(1) Half-Life</span>
          <span className="mr-hero-badge">Bandas ±1σ ±2σ</span>
          <span className="mr-hero-badge">R² goodness-of-fit</span>
          <span className="mr-hero-badge">Solo análisis</span>
        </div>
      </section>

      {/* Barra de control */}
      <section className="mr-controls">
        <div className="mr-search">
          <SearchBox onSelect={setTicker} />
          <span className="mr-current">{ticker}</span>
        </div>
        <div className="ranges">
          {RANGES.map((r) => (
            <button key={r} className={r === range ? "active" : ""} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
          {data && (
            <span className="interval">
              {data.points.length} barras · {data.interval}
            </span>
          )}
        </div>
      </section>

      {error   && <div className="banner error">⚠ {error}</div>}
      {loading && !data && <div className="banner">Cargando {ticker}…</div>}

      {st && data && (
        <>
          {/* Veredicto + medidor Z */}
          <section className={`mr-verdict ${VERDICT_CLASS[st.verdict]}`}>
            <div className="mr-verdict-left">
              <span className="mr-verdict-label">VEREDICTO</span>
              <span className="mr-verdict-value">{st.verdict}</span>
              <span className={`mr-signal ${SIGNAL_CLASS[st.signal]}`}>
                SEÑAL · {SIGNAL_LABEL[st.signal]}
              </span>
            </div>
            <div className="mr-gauge">
              <div className="mr-gauge-scale">
                <span>-3σ</span><span>-2σ</span><span>-1σ</span>
                <span>0</span>
                <span>+1σ</span><span>+2σ</span><span>+3σ</span>
              </div>
              <div className="mr-gauge-track">
                <div className="mr-gauge-mid" />
                <div className="mr-gauge-marker" style={{ left: `${markerPct}%` }} />
              </div>
              <div className="mr-gauge-foot">
                <span className="mr-gauge-z">Z = {fmt(st.zScore)}</span>
                <span className="mr-gauge-hint">
                  {z <= -1 ? "POR DEBAJO DE LA MEDIA" : z >= 1 ? "POR ENCIMA DE LA MEDIA" : "CERCA DE LA MEDIA"}
                </span>
              </div>
            </div>
          </section>

          {!st.isMeanReverting && (
            <div className="banner mr-warn">
              ⚠ Este activo no revierte a la media en este rango — tendencia dominante detectada (φ ≈ 1).
              Interpreta el canal con cautela.
            </div>
          )}

          {/* Canal de regresión (col 1) — va antes que stats para que ambos
              compartan fila y queden alineados arriba, sin hueco negro. */}
          <section className="mr-chart-card">
            <div className="mr-chart-head">
              <span className="mr-chart-title">◆ CANAL DE REGRESIÓN · {data.ticker}</span>
              <span className="mr-chart-sub">LOG-LINEAL · MEDIA ±1σ ±2σ</span>
            </div>
            <MeanReversionChart points={data.points} />
          </section>

          {/* Estadísticas + niveles de precio (col 2, junto al canal) */}
          <section className="mr-stats">
            {stats.map((s) => (
              <div className="mr-stat" key={s.label}>
                <span className="mr-stat-label">{s.label}</span>
                <span className={`mr-stat-value ${s.cls}`}>{s.value}</span>
              </div>
            ))}
            {/* Niveles de precio del canal — rellena el espacio restante */}
            {lastPt && (() => {
              const levels = [
                { label: "+2σ", price: lastPt.upper2, isMean: false },
                { label: "+1σ", price: lastPt.upper1, isMean: false },
                { label: "MEDIA", price: lastPt.mean, isMean: true },
                { label: "−1σ", price: lastPt.lower1, isMean: false },
                { label: "−2σ", price: lastPt.lower2, isMean: false },
              ];
              return (
                <div className="mr-levels">
                  <div className="mr-levels-head">
                    <span className="mr-levels-title">NIVELES CLAVE</span>
                  </div>
                  {levels.map((lv) => {
                    const dist = lv.price !== 0
                      ? ((lastPt.price - lv.price) / lv.price) * 100
                      : null;
                    const distCls = dist == null ? "flat" : dist > 0.1 ? "pos" : dist < -0.1 ? "neg" : "flat";
                    return (
                      <div key={lv.label} className={`mr-level-row${lv.isMean ? " mr-level-mean" : ""}`}>
                        <span className="mr-level-lbl">{lv.label}</span>
                        <span className="mr-level-price">{fmt(lv.price)}</span>
                        {dist !== null && (
                          <span className={`mr-level-dist ${distCls}`}>
                            {dist > 0 ? "+" : ""}{fmt(dist)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="mr-level-row" style={{ background: "var(--accent-dim)", borderTop: "1px solid rgba(91,130,240,0.2)" }}>
                    <span className="mr-level-lbl">ACTUAL</span>
                    <span className="mr-level-price" style={{ color: "var(--accent-2)" }}>{fmt(lastPt.price)}</span>
                    <span className="mr-level-dist flat" style={{ color: "var(--accent-2)" }}>Z={fmt(z)}</span>
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Histograma Z-score */}
          <section className="mr-z-card">
            <ZScorePanel points={data.points} />
          </section>

          {/* Interpretación automática */}
          {interp.signal && (
            <section className="mr-interp">
              <div className="mr-interp-head">
                <span className="mr-interp-title">◆ ANÁLISIS AUTOMÁTICO · {ticker} · {range}</span>
                <span style={{ fontSize: "10px", color: "var(--muted)" }}>Solo análisis estadístico</span>
              </div>
              <div className="mr-interp-body">
                <div className="mr-interp-block">
                  <span className="mr-interp-block-title">Señal estadística actual</span>
                  <p className="mr-interp-block-text" dangerouslySetInnerHTML={{ __html: interp.signal }} />
                </div>
                <div className="mr-interp-block">
                  <span className="mr-interp-block-title">Contexto del modelo</span>
                  <p className="mr-interp-block-text" dangerouslySetInnerHTML={{ __html: interp.context }} />
                </div>
                <div className="mr-interp-block" style={{ gridColumn: "1 / -1" }}>
                  <span className="mr-interp-block-title">Riesgo y limitaciones</span>
                  <p className="mr-interp-block-text" dangerouslySetInnerHTML={{ __html: interp.risk }} />
                </div>
              </div>
            </section>
          )}

          {/* Resumen histórico de distribución Z */}
          <section className="mr-hist">
            {[
              { label: "Z máx. histórico",    val: fmt(Math.max(...data.points.map((p) => p.z))),  sub: "Sobreextensión máxima al alza",     cls: "mr-neg" },
              { label: "Z mín. histórico",    val: fmt(Math.min(...data.points.map((p) => p.z))),  sub: "Sobreextensión máxima a la baja",   cls: "mr-pos" },
              { label: "Barras > +2σ",        val: String(data.points.filter((p) => p.z >= 2).length),           sub: `${fmt(data.points.filter((p) => p.z >= 2).length / data.points.length * 100)}% del rango`,    cls: "" },
              { label: "Barras < −2σ",        val: String(data.points.filter((p) => p.z <= -2).length),          sub: `${fmt(data.points.filter((p) => p.z <= -2).length / data.points.length * 100)}% del rango`,   cls: "" },
              { label: "Zona neutra (|Z|<1)", val: String(data.points.filter((p) => Math.abs(p.z) < 1).length),  sub: `${fmt(data.points.filter((p) => Math.abs(p.z) < 1).length / data.points.length * 100)}% del rango`, cls: "" },
              { label: "Total barras",         val: String(data.points.length),                                   sub: `${data.interval} · ${range}`,                                                                   cls: "" },
            ].map((item) => (
              <div className="mr-hist-item" key={item.label}>
                <span className="mr-hist-item-label">{item.label}</span>
                <span className={`mr-hist-item-val ${item.cls}`}>{item.val}</span>
                <span className="mr-hist-item-sub">{item.sub}</span>
              </div>
            ))}
          </section>

          {/* Zonas de riesgo Z-score */}
          <section className="mr-zones">
            {([
              { cls: "mr-zone-strong-buy",  label: "COMPRA FUERTE", range: "Z ≤ −2",       desc: "Sobreextensión extrema a la baja — evento raro históricamente",    active: z <= -2 },
              { cls: "mr-zone-buy",         label: "ZONA COMPRA",   range: "−2 < Z ≤ −1",  desc: "Por debajo de media — estadísticamente barato",                     active: z > -2 && z <= -1 },
              { cls: "mr-zone-neutral",     label: "NEUTRO",        range: "−1 < Z < +1",  desc: "Dentro del canal central de regresión",                             active: z > -1 && z < 1 },
              { cls: "mr-zone-sell",        label: "ZONA VENTA",    range: "+1 ≤ Z < +2",  desc: "Por encima de media — estadísticamente caro",                       active: z >= 1 && z < 2 },
              { cls: "mr-zone-strong-sell", label: "VENTA FUERTE",  range: "Z ≥ +2",       desc: "Sobreextensión extrema al alza — evento raro históricamente",       active: z >= 2 },
            ] as const).map((zone) => (
              <div key={zone.cls} className={`mr-zone ${zone.cls}${zone.active ? " mr-zone-active" : ""}`}>
                <span className="mr-zone-label">{zone.label}</span>
                <span className="mr-zone-range">{zone.range}</span>
                <span className="mr-zone-desc">{zone.desc}</span>
              </div>
            ))}
          </section>
        </>
      )}

      {/* ── Bloque educativo: matemáticas del modelo ────────────────────────── */}
      <section className="mr-math">
        <div className="mr-math-title">◆ MODELO: REGRESIÓN LINEAL LOG-PRECIO</div>

        <div className="mr-math-grid">

          {/* ¿Qué es? */}
          <div className="mr-math-card">
            <div className="mr-math-card-title">¿Qué es la regresión lineal?</div>
            <p className="mr-math-text">
              La regresión lineal busca la recta que mejor describe la relación entre dos variables.
              En este modelo, ajustamos el <em>log-precio</em> contra el tiempo para capturar la
              tendencia central del activo. Sobre esa tendencia medimos cuánto se desvía el precio real.
            </p>
          </div>

          {/* Fórmula */}
          <div className="mr-math-card">
            <div className="mr-math-card-title">Fórmula del canal</div>
            <div className="mr-math-formula">
              <div>ln(P<sub>t</sub>) = β₀ + β₁·t + ε<sub>t</sub></div>
              <div className="mr-math-formula-band">Canal: Media ± n·σ_ε</div>
            </div>
            <div className="mr-math-vars">
              <div><span>ln(Pₜ)</span> — Logaritmo natural del precio en tiempo t</div>
              <div><span>β₀</span> — Intercept (nivel base de la tendencia)</div>
              <div><span>β₁</span> — Pendiente (tasa de crecimiento por barra)</div>
              <div><span>ε<sub>t</sub></span> — Residuo (desviación respecto a la tendencia)</div>
              <div><span>σ_ε</span> — Desviación estándar de los residuos</div>
            </div>
          </div>

          {/* R² */}
          <div className="mr-math-card">
            <div className="mr-math-card-title">R² — Bondad de ajuste</div>
            <p className="mr-math-text">
              El R² mide qué proporción de la variación del log-precio explica la línea de tendencia.
            </p>
            <div className="mr-math-scale">
              <div className="mr-math-scale-row">
                <span className="mr-math-scale-val">R² &gt; 0.85</span>
                <span className="mr-math-scale-desc mr-good">Canal muy confiable</span>
              </div>
              <div className="mr-math-scale-row">
                <span className="mr-math-scale-val">0.60 — 0.85</span>
                <span className="mr-math-scale-desc mr-neutral">Canal moderado</span>
              </div>
              <div className="mr-math-scale-row">
                <span className="mr-math-scale-val">R² &lt; 0.60</span>
                <span className="mr-math-scale-desc mr-bad">Canal débil, usar con cautela</span>
              </div>
            </div>
          </div>

          {/* Z-Score */}
          <div className="mr-math-card">
            <div className="mr-math-card-title">Z-Score — posición en el canal</div>
            <div className="mr-math-formula">
              <div>Z = (ln(P) − Media) / σ_ε</div>
            </div>
            <p className="mr-math-text">
              Mide cuántas desviaciones estándar está el precio respecto a su tendencia. Z ≈ 0
              significa precio en la media; Z = +2 indica que el precio está en la banda superior
              extrema (históricamente cara); Z = −2 en la inferior (históricamente barata).
            </p>
          </div>

          {/* Half-Life */}
          <div className="mr-math-card">
            <div className="mr-math-card-title">Vida media (half-life) — ¿cuánto tarda en revertir?</div>
            <div className="mr-math-formula">
              <div>ΔP<sub>t</sub> = φ·P<sub>t−1</sub> + ε<sub>t</sub></div>
              <div className="mr-math-formula-band">Half-life = −ln(2) / ln(1+φ)</div>
            </div>
            <p className="mr-math-text">
              φ (phi) es el coeficiente AR(1) de los residuos. Si φ &lt; 0, el proceso revierte
              a la media: el precio corrige sistemáticamente cuando se aleja de la tendencia.
              La vida media indica cuántos días tarda en recorrer la mitad del camino de vuelta.
            </p>
          </div>

          {/* Limitaciones */}
          <div className="mr-math-card mr-math-card-warn">
            <div className="mr-math-card-title">⚠ Limitaciones del modelo</div>
            <ul className="mr-math-list">
              <li>El canal solo es válido si el activo <em>revierte a la media</em> en el rango analizado (φ &lt; 0). Una tendencia fuerte invalida el modelo.</li>
              <li>Cambios estructurales (splits, crisis, fusiones) rompen el canal histórico.</li>
              <li>El modelo describe el pasado; las bandas no garantizan que el precio regresará.</li>
              <li>Rangos cortos (1mo, 3mo) producen canales ruidosos con R² bajo.</li>
              <li><strong>Solo análisis</strong> — ninguna señal del modelo constituye una recomendación de inversión.</li>
            </ul>
          </div>

        </div>
      </section>
    </div>
  );
}
