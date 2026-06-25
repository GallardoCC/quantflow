/**
 * TecnicosPage — Análisis técnico profesional.
 *
 * Indicadores calculados en el cliente desde datos OHLCV (yfinance vía
 * api.history) sin consumir Alpha Vantage, evitando el límite de 25 req/día.
 *
 * Incluye: Precio + EMA 3/9 · RSI(14) · ATR(14) · Perfil de Volumen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Candle, type History } from "../api";
import { SearchBox } from "../components/SearchBox";
import { PriceEmaChart } from "../components/PriceEmaChart";
import { useTicker } from "../TickerContext";
import "../components/technicals.css";

// ─── Cálculo de indicadores ──────────────────────────────────────────────────

function computeEMA(values: number[], period: number): (number | null)[] {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) result.push(null);
    else if (i === period - 1) result.push(ema);
    else { ema = values[i] * k + ema * (1 - k); result.push(ema); }
  }
  return result;
}

function computeRSI(closes: number[], period = 14): (number | null)[] {
  if (closes.length <= period) return closes.map(() => null);
  const result: (number | null)[] = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = 0; i < period; i++) result.push(null);
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, d)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -d)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

function computeATR(candles: Candle[], period = 14): (number | null)[] {
  if (candles.length < period + 1) return candles.map(() => null);
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const p = candles[i - 1], c = candles[i];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const result: (number | null)[] = [null];
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = 0; i < trs.length; i++) {
    if (i < period - 1) result.push(null);
    else if (i === period - 1) result.push(atr);
    else { atr = (atr * (period - 1) + trs[i]) / period; result.push(atr); }
  }
  return result;
}

interface VolumeBar { price: number; volume: number; pct: number }

function computeVolumeProfile(candles: Candle[], buckets = 28): VolumeBar[] {
  if (candles.length === 0) return [];
  const minP = Math.min(...candles.map((c) => c.low));
  const maxP = Math.max(...candles.map((c) => c.high));
  const range = maxP - minP;
  if (range === 0) return [];
  const sz = range / buckets;
  const vols = new Array(buckets).fill(0);
  candles.forEach((c) => {
    const mid = (c.high + c.low) / 2;
    const idx = Math.min(Math.floor((mid - minP) / sz), buckets - 1);
    vols[idx] += c.volume;
  });
  const maxV = Math.max(...vols, 1);
  return vols
    .map((v, i) => ({ price: minP + (i + 0.5) * sz, volume: v, pct: (v / maxV) * 100 }))
    .reverse();
}

// ─── Subcomponentes SVG ──────────────────────────────────────────────────────

function RsiChart({ times, values }: { times: number[]; values: (number | null)[] }) {
  const W = 800, H = 130, PL = 6, PR = 44, PT = 12, PB = 22;
  const cw = W - PL - PR, ch = H - PT - PB;
  const n = values.length;
  if (n === 0) return null;

  const pts = values
    .map((v, i) => (v !== null ? { x: i, y: v } : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (pts.length < 2) return null;

  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * cw : 0);
  const yOf = (v: number) => PT + ch - (v / 100) * ch;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const tickDates = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (times.length - 1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {/* zonas */}
      <rect x={PL} y={PT} width={cw} height={(30 / 100) * ch} fill="rgba(46,189,133,0.05)" />
      <rect x={PL} y={PT + (70 / 100) * ch} width={cw} height={(30 / 100) * ch} fill="rgba(240,86,107,0.05)" />
      {/* niveles */}
      {[30, 50, 70].map((lvl) => (
        <g key={lvl}>
          <line x1={PL} y1={yOf(lvl)} x2={PL + cw} y2={yOf(lvl)}
            stroke={lvl === 50 ? "rgba(255,255,255,0.06)" : lvl === 70 ? "rgba(240,86,107,0.3)" : "rgba(46,189,133,0.3)"}
            strokeDasharray="4 4" strokeWidth="1" />
          <text x={PL + cw + 4} y={yOf(lvl) + 4} fill={lvl === 70 ? "rgba(240,86,107,0.7)" : lvl === 30 ? "rgba(46,189,133,0.7)" : "rgba(255,255,255,0.25)"}
            fontSize="9" fontFamily="monospace">{lvl}</text>
        </g>
      ))}
      {/* línea RSI */}
      <path d={path} fill="none" stroke="#5b82f0" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {/* punto actual */}
      {last && (
        <circle cx={xOf(last.x)} cy={yOf(last.y)} r="3" fill="#5b82f0"
          stroke="var(--surface)" strokeWidth="1.5" />
      )}
      {/* eje tiempo */}
      {tickDates.map((idx) => {
        if (idx >= times.length) return null;
        const d = new Date(times[idx] * 1000);
        const lbl = d.toLocaleDateString("es-PE", { month: "short", day: "numeric" });
        return (
          <text key={idx} x={xOf(idx)} y={H - 5} fill="#4a5260" fontSize="8"
            fontFamily="monospace" textAnchor="middle">{lbl}</text>
        );
      })}
    </svg>
  );
}

function AtrChart({ times, values }: { times: number[]; values: (number | null)[] }) {
  const W = 800, H = 110, PL = 6, PR = 44, PT = 10, PB = 22;
  const cw = W - PL - PR, ch = H - PT - PB;
  const n = values.length;
  if (n === 0) return null;

  const pts = values
    .map((v, i) => (v !== null ? { x: i, y: v } : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (pts.length < 2) return null;

  const maxV = Math.max(...pts.map((p) => p.y));
  const minV = Math.min(...pts.map((p) => p.y));
  const vr = maxV - minV || 1;
  const xOf = (i: number) => PL + (n > 1 ? (i / (n - 1)) * cw : 0);
  const yOf = (v: number) => PT + ch - ((v - minV) / vr) * ch;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.x).toFixed(1)},${yOf(p.y).toFixed(1)}`).join(" ");
  const avg = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const last = pts[pts.length - 1];
  const tickDates = [0, 0.5, 1].map((f) => Math.round(f * (times.length - 1)));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {/* área rellena */}
      <path
        d={`${path} L${xOf(pts[pts.length - 1].x)},${PT + ch} L${xOf(pts[0].x)},${PT + ch}Z`}
        fill="rgba(224,169,59,0.07)" />
      {/* media */}
      <line x1={PL} y1={yOf(avg)} x2={PL + cw} y2={yOf(avg)}
        stroke="rgba(224,169,59,0.28)" strokeDasharray="4 4" strokeWidth="1" />
      <text x={PL + cw + 4} y={yOf(avg) + 4} fill="rgba(224,169,59,0.6)" fontSize="9" fontFamily="monospace">avg</text>
      {/* línea ATR */}
      <path d={path} fill="none" stroke="#e0a93b" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {/* valor actual */}
      {last && (
        <>
          <circle cx={xOf(last.x)} cy={yOf(last.y)} r="3" fill="#e0a93b"
            stroke="var(--surface)" strokeWidth="1.5" />
          <text x={PL + cw + 4} y={yOf(last.y) + 4} fill="#e0a93b" fontSize="9" fontFamily="monospace">
            {last.y.toFixed(2)}
          </text>
        </>
      )}
      {tickDates.map((idx) => {
        if (idx >= times.length) return null;
        const d = new Date(times[idx] * 1000);
        const lbl = d.toLocaleDateString("es-PE", { month: "short", day: "numeric" });
        return (
          <text key={idx} x={xOf(idx)} y={H - 5} fill="#4a5260" fontSize="8"
            fontFamily="monospace" textAnchor="middle">{lbl}</text>
        );
      })}
    </svg>
  );
}

function VolumeProfileChart({ bars, currentPrice }: { bars: VolumeBar[]; currentPrice: number | null }) {
  if (bars.length === 0) return null;
  const W = 200, BAR_H = 18, PAD_L = 56, PAD_R = 8, PAD_V = 4;
  const H = bars.length * BAR_H + PAD_V * 2;
  const bw = W - PAD_L - PAD_R;
  const priceStep = bars.length > 1 ? Math.abs(bars[0].price - bars[1].price) : Infinity;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
      {bars.map((bar, i) => {
        const y = PAD_V + i * BAR_H;
        const isNear = currentPrice !== null && Math.abs(bar.price - currentPrice) < priceStep * 0.6;
        const barW = Math.max(2, (bar.pct / 100) * bw);
        const isHvn = bar.pct > 55;
        return (
          <g key={i}>
            <rect x={PAD_L} y={y + 1} width={barW} height={BAR_H - 2}
              fill={
                isNear
                  ? "rgba(91,130,240,0.7)"
                  : isHvn
                  ? "rgba(91,130,240,0.32)"
                  : "rgba(91,130,240,0.12)"
              }
              rx="2" />
            <text x={PAD_L - 4} y={y + BAR_H / 2 + 3.5}
              fill={isNear ? "var(--accent-2)" : "#6b7488"}
              fontSize="9" fontFamily="monospace" textAnchor="end"
              fontWeight={isNear ? "700" : "400"}>
              {bar.price.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Rangos disponibles ───────────────────────────────────────────────────────

const RANGES: { label: string; value: string }[] = [
  { label: "1d",  value: "1d"  },
  { label: "5d",  value: "5d"  },
  { label: "1M",  value: "1mo" },
  { label: "3M",  value: "3mo" },
  { label: "6M",  value: "6mo" },
  { label: "1A",  value: "1y"  },
  { label: "2A",  value: "2y"  },
];

function fmt(n: number | null, dec = 2): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props { ticker?: string }

export function TecnicosPage(_props: Props) {
  const { ticker, setTicker } = useTicker();
  const [range, setRange] = useState("3mo");
  const [data, setData] = useState<History | null>(null);
  const [sessionData, setSessionData] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEma3, setShowEma3] = useState(true);
  const [showEma9, setShowEma9] = useState(true);
  const [volMode, setVolMode] = useState<"general" | "session">("general");

  const load = useCallback(async (tk: string, rg: string) => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.history(tk, rg);
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(ticker, range); }, [ticker, range, load]);

  // Datos de sesión (1d, 5m) solo cuando se necesitan
  useEffect(() => {
    if (volMode !== "session" || sessionData) return;
    api.history(ticker, "1d").then(setSessionData).catch(() => {});
  }, [volMode, ticker, sessionData]);

  // Resetear sesión al cambiar ticker
  useEffect(() => { setSessionData(null); }, [ticker]);

  // Velas válidas
  const candles = useMemo(
    () =>
      (data?.candles ?? []).filter(
        (c) =>
          Number.isFinite(c.open) &&
          Number.isFinite(c.high) &&
          Number.isFinite(c.low) &&
          Number.isFinite(c.close)
      ),
    [data]
  );

  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const times  = useMemo(() => candles.map((c) => c.time),  [candles]);

  const ema3All = useMemo(() => computeEMA(closes, 3),  [closes]);
  const ema9All = useMemo(() => computeEMA(closes, 9),  [closes]);
  const rsiVals = useMemo(() => computeRSI(closes),     [closes]);
  const atrVals = useMemo(() => computeATR(candles),    [candles]);

  const profileCandles = useMemo(
    () =>
      volMode === "session" && sessionData
        ? sessionData.candles.filter((c) => Number.isFinite(c.close))
        : candles,
    [volMode, sessionData, candles]
  );
  const volBars = useMemo(() => computeVolumeProfile(profileCandles), [profileCandles]);

  const currentRsi   = useMemo(() => [...rsiVals].reverse().find((v) => v !== null) ?? null, [rsiVals]);
  const currentAtr   = useMemo(() => [...atrVals].reverse().find((v) => v !== null) ?? null, [atrVals]);
  const currentPrice = useMemo(() => closes[closes.length - 1] ?? null, [closes]);

  // Líneas EMA alineadas con candles
  const emaLines = useMemo(() => {
    const lines = [];
    if (showEma3 && ema3All.length === candles.length)
      lines.push({ values: ema3All, color: "#22c39e", label: "EMA 3" });
    if (showEma9 && ema9All.length === candles.length)
      lines.push({ values: ema9All, color: "#e0a93b", label: "EMA 9" });
    return lines;
  }, [showEma3, showEma9, ema3All, ema9All, candles.length]);

  const rsiZone =
    currentRsi === null ? "—"
    : currentRsi >= 70  ? "SOBRECOMPRADO"
    : currentRsi <= 30  ? "SOBREVENDIDO"
    : "NEUTRO";
  const rsiCls =
    currentRsi === null ? ""
    : currentRsi >= 70  ? "tc-bad"
    : currentRsi <= 30  ? "tc-good"
    : "tc-neutral";

  return (
    <div className="tc">

      {/* Barra de controles */}
      <section className="tc-controls">
        <div className="tc-search-wrap">
          <SearchBox onSelect={setTicker} />
          <span className="tc-ticker-label">{ticker}</span>
        </div>
        <div className="tc-ranges">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={range === r.value ? "active" : ""}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="tc-ema-toggles">
          <button className={`tc-toggle${showEma3 ? " on" : ""}`} onClick={() => setShowEma3((v) => !v)}>
            <span className="tc-toggle-dot ema3" /> EMA 3
          </button>
          <button className={`tc-toggle${showEma9 ? " on" : ""}`} onClick={() => setShowEma9((v) => !v)}>
            <span className="tc-toggle-dot ema9" /> EMA 9
          </button>
        </div>
      </section>

      {error && <div className="banner error">⚠ {error}</div>}
      {loading && !data && <div className="banner">Cargando {ticker}…</div>}

      {candles.length > 0 && (
        <>
          {/* ── Gráfico de precio + EMA ─────────────────────────────────────── */}
          <section className="tc-card tc-price-card">
            <header className="tc-card-head">
              <div>
                <span className="tc-card-title">◆ PRECIO · {ticker}</span>
                <span className="tc-card-sub">
                  {data?.interval} · {candles.length} barras
                </span>
              </div>
              <div className="tc-legend">
                {showEma3 && <span className="tc-leg tc-leg-ema3">EMA 3</span>}
                {showEma9 && <span className="tc-leg tc-leg-ema9">EMA 9</span>}
              </div>
            </header>
            <div className="tc-price-chart">
              <PriceEmaChart candles={candles} emaLines={emaLines} />
            </div>
          </section>

          {/* ── RSI + ATR ───────────────────────────────────────────────────── */}
          <div className="tc-row-2">

            {/* RSI */}
            <section className="tc-card">
              <header className="tc-card-head">
                <div>
                  <span className="tc-card-title">RSI (14)</span>
                  <span className="tc-card-sub">Índice de Fuerza Relativa</span>
                </div>
                <div className="tc-kpi-mini">
                  <span className={`tc-kpi-val ${rsiCls}`}>{fmt(currentRsi, 1)}</span>
                  <span className={`tc-kpi-zone ${rsiCls}`}>{rsiZone}</span>
                </div>
              </header>
              <div className="tc-rsi-chart">
                <RsiChart times={times} values={rsiVals} />
              </div>
              <div className="tc-indicator-info">
                <span className="tc-info-tag">
                  <span style={{ color: "rgba(46,189,133,0.9)" }}>▸ &lt;30 Sobrevendido</span>
                  {" · "}
                  <span style={{ color: "rgba(240,86,107,0.9)" }}>▸ &gt;70 Sobrecomprado</span>
                </span>
                <span className="tc-info-desc">
                  Oscilador de momento de Wilder (14 períodos). Mide la velocidad y magnitud de los
                  cambios de precio para detectar agotamiento de tendencia. Valores extremos sugieren
                  posibles reversiones, pero el RSI puede permanecer en zona extrema en tendencias fuertes.
                </span>
              </div>
            </section>

            {/* ATR */}
            <section className="tc-card">
              <header className="tc-card-head">
                <div>
                  <span className="tc-card-title">ATR (14)</span>
                  <span className="tc-card-sub">Rango Verdadero Medio</span>
                </div>
                <div className="tc-kpi-mini">
                  <span className="tc-kpi-val">{fmt(currentAtr)}</span>
                  <span className="tc-kpi-zone">VOLATILIDAD</span>
                </div>
              </header>
              <div className="tc-atr-chart">
                <AtrChart times={times} values={atrVals} />
              </div>
              <div className="tc-indicator-info">
                <span className="tc-info-desc">
                  Mide la volatilidad absoluta en unidades de precio usando el rango verdadero
                  (máx. entre: High−Low, |High−CierrePrev|, |Low−CierrePrev|). ATR alto indica
                  mayor volatilidad; útil para dimensionar posiciones y establecer stops dinámicos
                  proporcionales al riesgo real del activo.
                </span>
              </div>
            </section>
          </div>

          {/* ── Perfil de Volumen ────────────────────────────────────────────── */}
          <section className="tc-card">
            <header className="tc-card-head">
              <div>
                <span className="tc-card-title">PERFIL DE VOLUMEN</span>
                <span className="tc-card-sub">Distribución de volumen por nivel de precio</span>
              </div>
              <div className="tc-seg">
                <button className={volMode === "general" ? "on" : ""} onClick={() => setVolMode("general")}>
                  General
                </button>
                <button className={volMode === "session" ? "on" : ""} onClick={() => setVolMode("session")}>
                  Sesión
                </button>
              </div>
            </header>
            <div className="tc-vol-body">
              <div className="tc-vol-chart">
                <VolumeProfileChart bars={volBars} currentPrice={currentPrice} />
              </div>
              <div className="tc-vol-info">
                <p className="tc-vol-desc">
                  El perfil de volumen muestra qué niveles de precio concentraron mayor actividad de
                  negociación. Las zonas de alto volumen (HVN) actúan como soporte/resistencia porque
                  representan áreas de fuerte consenso entre compradores y vendedores. Las zonas de
                  bajo volumen (LVN) tienden a ser atravesadas rápidamente.
                </p>
                <div className="tc-vol-legend">
                  <div className="tc-vol-leg-item">
                    <span className="tc-vol-dot hvn" />
                    <span>Nodo de alto volumen (HVN) — soporte/resistencia fuerte</span>
                  </div>
                  <div className="tc-vol-leg-item">
                    <span className="tc-vol-dot lvn" />
                    <span>Nodo de bajo volumen (LVN) — zona de tránsito rápido</span>
                  </div>
                  <div className="tc-vol-leg-item">
                    <span className="tc-vol-dot cur" />
                    <span>Precio actual</span>
                  </div>
                </div>
                <div className="tc-vol-mode-note">
                  {volMode === "session"
                    ? "Sesión: velas intradiarias del día actual (intervalo 5m)."
                    : `General: período seleccionado (${data?.interval ?? "diario"}).`}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
