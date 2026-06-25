import { useEffect, useState } from "react";
import {
  api, type Fundamentals, type RatioEntry, type FundCheck,
} from "../api";
import { SearchBox } from "../components/SearchBox";
import { MiniBars, MiniLines, ValuationBar } from "../components/FundamentalCharts";
import { useTicker } from "../TickerContext";
import "../components/fundamental.css";

/**
 * Motor de Análisis Fundamental — informe institucional generado al introducir
 * un ticker: perfil, ratios, calidad, valoración (DCF + relativa + IA),
 * Piotroski, Altman Z, Buffett, sentimiento de noticias, competidores,
 * decisión de inversión y horizontes. Solo análisis, sin ejecución.
 */

// ── Formateadores ───────────────────────────────────────────────────────────
function fmtMoney(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)} B`;   // billón (10^12)
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)} MM`;     // mil millones
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)} M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(2)} K`;
  return `$${v.toFixed(2)}`;
}
function fmtNum(v: number | null | undefined, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
function fmtPct(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(d)}%`;
}
function fmtSigned(v: number | null | undefined, d = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

// Métricas que se muestran como porcentaje
const PCT_KEYS = new Set([
  "roe", "roa", "margenBruto", "margenOperativo", "margenNeto",
]);

const RATIO_LABELS: Record<string, string> = {
  ratioCorriente: "Ratio corriente",
  ratioRapido: "Ratio rápido",
  ratioEfectivo: "Ratio de efectivo",
  deudaPatrimonio: "Deuda / Patrimonio",
  ratioDeuda: "Ratio de deuda",
  coberturaIntereses: "Cobertura de intereses",
  rotacionInventario: "Rotación de inventario",
  diasInventario: "Días de inventario",
  rotacionActivos: "Rotación de activos",
  rotacionCobrar: "Rotación de cuentas por cobrar",
  roe: "ROE",
  roa: "ROA",
  margenBruto: "Margen bruto",
  margenOperativo: "Margen operativo",
  margenNeto: "Margen neto",
  pe: "PER (P/E)",
  ps: "P/S",
  pb: "P/B",
  pcf: "P/FCF",
  evEbitda: "EV / EBITDA",
  peg: "PEG",
};

const CATEGORY_LABELS: Record<string, string> = {
  liquidez: "A · Liquidez",
  solvencia: "B · Solvencia y Riesgo",
  eficiencia: "C · Eficiencia",
  rentabilidad: "D · Rentabilidad",
  valoracion: "E · Valoración",
};

function ratioDisplay(key: string, v: number | null): string {
  if (v == null) return "—";
  if (PCT_KEYS.has(key)) return fmtPct(v, 1);
  return fmtNum(v, 2);
}

function ratioColor(key: string, entry: RatioEntry): string {
  const v = entry.actual;
  const bm = entry.promedioIndustria;
  if (v == null || bm == null) return "";
  // Para deuda/valoración, menor es mejor
  const lowerBetter = ["deudaPatrimonio", "ratioDeuda", "diasInventario",
    "pe", "ps", "pb", "pcf", "evEbitda", "peg"].includes(key);
  const ratio = v / bm;
  const good = lowerBetter ? ratio <= 1 : ratio >= 1;
  if (lowerBetter ? ratio <= 0.8 : ratio >= 1.2) return "fa-pos";
  if (lowerBetter ? ratio >= 1.3 : ratio <= 0.7) return "fa-neg";
  return good ? "fa-pos-soft" : "fa-neutral-c";
}

// ── Subcomponentes ──────────────────────────────────────────────────────────
function ScoreRing({ score, size = 132 }: { score: number; size?: number }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - score / 100);
  const color =
    score >= 75 ? "var(--pos)" : score >= 50 ? "var(--accent)" :
    score >= 33 ? "#e0a83b" : "var(--neg)";
  return (
    <svg width={size} height={size} className="fa-ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke="var(--surface-3)" strokeWidth="9" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="46%" textAnchor="middle" className="fa-ring-num"
        fill={color}>{score}</text>
      <text x="50%" y="63%" textAnchor="middle" className="fa-ring-den">/ 100</text>
    </svg>
  );
}

function CheckList({ checks }: { checks: FundCheck[] }) {
  return (
    <ul className="fa-checklist">
      {checks.map((c, i) => (
        <li key={i} className={c.passed === true ? "fa-ck-pass"
          : c.passed === false ? "fa-ck-fail" : "fa-ck-na"}>
          <span className="fa-ck-icon">
            {c.passed === true ? "✓" : c.passed === false ? "✕" : "–"}
          </span>
          <span className="fa-ck-body">
            <strong>{c.label}</strong>
            <span className="fa-ck-detail">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function HorizonCard({ title, h }: {
  title: string; h: { score: number; verdict: string; drivers: string };
}) {
  const cls =
    h.score >= 58 ? "fa-pos" : h.score >= 45 ? "fa-neutral-c" : "fa-neg";
  return (
    <div className="fa-hz-card">
      <span className="fa-hz-title">{title}</span>
      <span className={`fa-hz-verdict ${cls}`}>{h.verdict}</span>
      <div className="fa-hz-bar">
        <span className="fa-hz-fill" style={{ width: `${h.score}%` }} />
      </div>
      <span className="fa-hz-drivers">{h.drivers}</span>
    </div>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────
export default function FundamentalPage() {
  const { ticker, setTicker } = useTicker();
  const [data, setData] = useState<Fundamentals | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(tk: string) {
    if (!tk.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    api.fundamentals(tk)
      .then((r) => { setData(r); setLoading(false); })
      .catch((e: Error) => { setError(e.message); setLoading(false); });
  }

  // El buscador interno escribe en el ticker global; el efecto re-consulta.
  useEffect(() => { run(ticker); /* eslint-disable-next-line */ }, [ticker]);

  return (
    <div className="fa">
      <header className="fa-intro">
        <h2 className="fa-intro-title">Análisis Fundamental</h2>
        <p className="fa-intro-sub">
          Informe de inteligencia de inversión generado automáticamente:
          ratios financieros, calidad del negocio, valor intrínseco, modelos de
          riesgo (Piotroski · Altman Z · Buffett), competidores, sentimiento de
          noticias y decisión por horizontes. Solo análisis, sin ejecución.
        </p>
      </header>

      <div className="fa-toolbar">
        <SearchBox onSelect={setTicker} />
        <button className="fa-run-btn" onClick={() => run(ticker)} disabled={loading}>
          {loading ? "Analizando…" : "Analizar ↻"}
        </button>
      </div>

      {loading && (
        <div className="fa-loading">
          <div className="fa-skel fa-skel-hero" />
          <div className="fa-skel-row">
            {[...Array(4)].map((_, i) => <div key={i} className="fa-skel fa-skel-card" />)}
          </div>
        </div>
      )}

      {error && !loading && <div className="banner error fa-banner">⚠ {error}</div>}

      {data && !loading && <Report d={data} />}
    </div>
  );
}

// ── Informe ─────────────────────────────────────────────────────────────────
function Report({ d }: { d: Fundamentals }) {
  const p = d.profile;
  const dec = d.decision;
  const combined = d.valuation.combined;
  const dcf = d.valuation.dcf;
  const rel = d.valuation.relative;
  const income = [...d.income].reverse();   // cronológico para gráficos
  const cash = [...d.cashflow].reverse();

  const recCls: Record<string, string> = {
    ACUMULAR: "fa-pos", MANTENER: "fa-pos-soft",
    NEUTRAL: "fa-neutral-c", EVITAR: "fa-neg",
  };

  return (
    <>
      {/* Cabecera de empresa */}
      <div className="fa-asset-hdr">
        <div className="fa-asset-id">
          <span className="fa-asset-ticker">{d.ticker}</span>
          <span className="fa-asset-name">{p.longName || p.name}</span>
        </div>
        <div className="fa-asset-tags">
          {p.sector && <span className="fa-tag">{p.sector}</span>}
          {p.industry && <span className="fa-tag">{p.industry}</span>}
          {p.country && <span className="fa-tag fa-tag-ghost">{p.country}</span>}
          {p.exchange && <span className="fa-tag fa-tag-ghost">{p.exchange}</span>}
        </div>
      </div>

      <div className="fa-profile-grid">
        <ProfStat label="Capitalización" value={fmtMoney(p.marketCap)} />
        <ProfStat label="Precio" value={p.price != null ? `$${fmtNum(p.price)}` : "—"} />
        <ProfStat label="Empleados" value={p.employees != null ? p.employees.toLocaleString("es") : "—"} />
        <ProfStat label="Beta" value={fmtNum(p.beta)} />
        <ProfStat label="Dividendo" value={p.dividendYield != null ? fmtPct(p.dividendYield) : "—"} />
        <ProfStat label="CEO" value={p.ceo || "—"} />
      </div>

      {p.description && (
        <section className="fa-card fa-desc">
          <span className="fa-section-label">Modelo de negocio</span>
          <p className="fa-desc-text">{p.description}</p>
        </section>
      )}

      {/* HERO: Decisión de inversión */}
      <section className="fa-card fa-hero">
        <div className="fa-hero-score">
          <ScoreRing score={dec.score} />
          <span className="fa-hero-class">{dec.label}</span>
          <span className={`fa-hero-rec ${recCls[dec.recommendation] || ""}`}>
            {dec.recommendation}
          </span>
        </div>
        <div className="fa-hero-detail">
          <span className="fa-section-label">Score Fundamental ponderado</span>
          <div className="fa-comp-list">
            {Object.entries(dec.components).map(([k, c]) => (
              <div key={k} className="fa-comp-row">
                <span className="fa-comp-name">
                  {RATIO_CAT_NAMES[k] || k} <em>({c.weight}%)</em>
                </span>
                <div className="fa-comp-bar">
                  <span className="fa-comp-fill" style={{ width: `${c.score}%` }} />
                </div>
                <span className="fa-comp-val">{c.score}</span>
              </div>
            ))}
          </div>
          <p className="fa-method">
            {dec.methodology} Ajustes IA — calidad: {fmtSigned(dec.aiAdjustments.calidad)} pts ·
            sentimiento: {fmtSigned(dec.aiAdjustments.sentimiento)} pts.
          </p>
        </div>
      </section>

      {/* Calidad + Valoración */}
      <div className="fa-two-col">
        {/* Calidad */}
        <section className="fa-card">
          <span className="fa-section-label">
            Modelo IA de Calidad Empresarial
          </span>
          <div className="fa-quality-head">
            <span className="fa-quality-score">{d.quality.score}<em>/100</em></span>
            <span className="fa-quality-grade">{d.quality.grade}</span>
            <span className="fa-quality-label">{d.quality.label}</span>
          </div>
          <div className="fa-quality-bd">
            {Object.entries(d.quality.breakdown).map(([k, v]) => (
              <div key={k} className="fa-qbd-item">
                <span className="fa-qbd-val">{v}</span>
                <span className="fa-qbd-lbl">{RATIO_CAT_NAMES[k] || k}</span>
              </div>
            ))}
          </div>
          {d.quality.positiveDrivers.length > 0 && (
            <div className="fa-drivers">
              <span className="fa-drivers-h fa-pos">Fortalezas</span>
              <ul>{d.quality.positiveDrivers.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
          {d.quality.negativeDrivers.length > 0 && (
            <div className="fa-drivers">
              <span className="fa-drivers-h fa-neg">Riesgos</span>
              <ul>{d.quality.negativeDrivers.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </section>

        {/* Valoración */}
        <section className="fa-card">
          <span className="fa-section-label">Valor Intrínseco Inteligente</span>
          <div className="fa-val-head">
            <div className="fa-val-big">
              <span className="fa-val-lbl">Valor justo combinado</span>
              <span className="fa-val-num">{combined.fairValue != null ? `$${fmtNum(combined.fairValue)}` : "—"}</span>
              <span className="fa-val-conf">Confianza {combined.confidence}%</span>
            </div>
            <div className="fa-val-big">
              <span className="fa-val-lbl">Precio actual</span>
              <span className="fa-val-num">{combined.fairValue != null && p.price != null ? `$${fmtNum(p.price)}` : "—"}</span>
              <span className={`fa-val-up ${(combined.upside ?? 0) >= 0 ? "fa-pos" : "fa-neg"}`}>
                {combined.upside != null ? `${fmtSigned(combined.upside)} potencial` : ""}
              </span>
            </div>
          </div>
          <div className={`fa-val-verdict fa-verdict-${combined.label.toLowerCase()}`}>
            {combined.label}
          </div>
          <ValuationBar price={p.price} fair={combined.fairValue}
            rangeMin={combined.rangeMin} rangeMax={combined.rangeMax} />
          <table className="fa-val-table">
            <tbody>
              {dcf && (
                <tr>
                  <td>DCF (flujos descontados)</td>
                  <td>{dcf.intrinsicValue != null ? `$${fmtNum(dcf.intrinsicValue)}` : "—"}</td>
                  <td className="fa-val-meta">WACC {fmtPct(dcf.wacc)} · g {fmtPct(dcf.growthHigh)}→{fmtPct(dcf.terminalGrowth)}</td>
                </tr>
              )}
              {rel && (
                <tr>
                  <td>Valoración relativa (múltiplos)</td>
                  <td>{rel.weightedValue != null ? `$${fmtNum(rel.weightedValue)}` : "—"}</td>
                  <td className="fa-val-meta">PER sector {fmtNum(rel.industryPe)}</td>
                </tr>
              )}
              <tr className="fa-val-combined">
                <td>Valor justo combinado</td>
                <td>{combined.fairValue != null ? `$${fmtNum(combined.fairValue)}` : "—"}</td>
                <td className="fa-val-meta">
                  Rango ${fmtNum(combined.rangeMin)} – ${fmtNum(combined.rangeMax)}
                </td>
              </tr>
            </tbody>
          </table>
          {dcf && (
            <p className="fa-method">
              Margen de seguridad: {fmtSigned(dcf.marginOfSafety)} · FCF base{" "}
              {fmtMoney(dcf.baseFCF)} proyectado a 10 años.
            </p>
          )}
        </section>
      </div>

      {/* Dashboard de ratios */}
      <section className="fa-card">
        <span className="fa-section-label">Dashboard de Ratios Financieros</span>
        {(["liquidez", "solvencia", "eficiencia", "rentabilidad", "valoracion"] as const).map((cat) => {
          const group = d.ratios[cat];
          if (!group) return null;
          return (
            <div key={cat} className="fa-ratio-cat">
              <h4 className="fa-ratio-cat-title">{CATEGORY_LABELS[cat]}</h4>
              <div className="fa-ratio-table-wrap">
                <table className="fa-ratio-table">
                  <thead>
                    <tr>
                      <th>Indicador</th>
                      <th>Empresa</th>
                      <th className="fa-hide-sm">Histórico (5A)</th>
                      <th>Prom. histórico</th>
                      <th>Prom. industria</th>
                      <th>Interpretación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(group).map(([key, entry]) => {
                      const hist = entry.historico.filter((v): v is number => v != null);
                      const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
                      return (
                        <tr key={key}>
                          <td className="fa-ratio-name">{RATIO_LABELS[key] || key}</td>
                          <td className={`fa-ratio-val ${ratioColor(key, entry)}`}>
                            {ratioDisplay(key, entry.actual)}
                          </td>
                          <td className="fa-hide-sm fa-ratio-spark">
                            <Sparkline data={entry.historico} pct={PCT_KEYS.has(key)} />
                          </td>
                          <td>{ratioDisplay(key, avg)}</td>
                          <td className="fa-ratio-bm">{ratioDisplay(key, entry.promedioIndustria)}</td>
                          <td className="fa-ratio-interp">{entry.interpretacion}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </section>

      {/* Modelos avanzados */}
      <div className="fa-three-col">
        {/* Piotroski */}
        <section className="fa-card">
          <span className="fa-section-label">Piotroski F-Score</span>
          <div className="fa-model-head">
            <span className="fa-model-big">{d.piotroski.score}<em>/9</em></span>
            <span className={`fa-model-verdict ${piotCls(d.piotroski.score)}`}>
              {d.piotroski.verdict}
            </span>
          </div>
          <span className="fa-model-label">{d.piotroski.label}</span>
          <CheckList checks={d.piotroski.checks} />
        </section>

        {/* Altman */}
        <section className="fa-card">
          <span className="fa-section-label">Altman Z-Score</span>
          {d.altman ? (
            <>
              <div className="fa-model-head">
                <span className="fa-model-big">{fmtNum(d.altman.z)}</span>
                <span className={`fa-model-verdict ${altmanCls(d.altman.zone)}`}>
                  {d.altman.zone}
                </span>
              </div>
              <span className="fa-model-label">{d.altman.label}</span>
              <div className="fa-altman-scale">
                <div className="fa-altman-zones">
                  <span className="fa-az fa-az-red">Riesgo &lt;1.81</span>
                  <span className="fa-az fa-az-grey">Gris</span>
                  <span className="fa-az fa-az-green">Segura &gt;2.99</span>
                </div>
                <div className="fa-altman-track">
                  <span className="fa-altman-marker"
                    style={{ left: `${Math.max(2, Math.min(98, (d.altman.z / 6) * 100))}%` }} />
                </div>
              </div>
              <p className="fa-method">{d.altman.note}</p>
            </>
          ) : (
            <p className="fa-empty-note">No aplicable (datos de balance insuficientes o sector financiero).</p>
          )}
        </section>

        {/* Buffett */}
        <section className="fa-card">
          <span className="fa-section-label">Análisis Buffett (calidad & foso)</span>
          <div className="fa-model-head">
            <span className="fa-model-big">{d.buffett.passed}<em>/{d.buffett.evaluated}</em></span>
            <span className={`fa-model-verdict ${buffettCls(d.buffett.pct)}`}>
              {d.buffett.verdict}
            </span>
          </div>
          <span className="fa-model-label">{d.buffett.label}</span>
          <CheckList checks={d.buffett.checks} />
        </section>
      </div>

      {/* Competidores */}
      <section className="fa-card">
        <span className="fa-section-label">Inteligencia de Competidores</span>
        <div className="fa-comp-head">
          <div className="fa-comp-adv">
            <span className="fa-comp-adv-num">{d.competitors.advantageScore}<em>/100</em></span>
            <span className="fa-comp-adv-lbl">Ventaja competitiva — {d.competitors.advantageLabel}</span>
          </div>
          {d.competitors.marketShare != null && (
            <div className="fa-comp-share">
              <span className="fa-comp-share-num">{fmtPct(d.competitors.marketShare, 0)}</span>
              <span className="fa-comp-share-lbl">del peer set (por capitalización)</span>
            </div>
          )}
        </div>
        {d.competitors.reasons.length > 0 && (
          <ul className="fa-comp-reasons">
            {d.competitors.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        )}
        <div className="fa-ratio-table-wrap">
          <table className="fa-comp-table">
            <thead>
              <tr>
                <th>Empresa</th><th>Cap.</th><th>PER</th><th>ROE</th>
                <th>M. neto</th><th>M. bruto</th><th>Crec.</th>
                <th>D/P</th><th>Similitud</th>
              </tr>
            </thead>
            <tbody>
              <tr className="fa-comp-self">
                <td>{d.competitors.self.ticker} <em>(esta empresa)</em></td>
                <td>{fmtMoney(d.competitors.self.marketCap)}</td>
                <td>{fmtNum(d.competitors.self.pe)}</td>
                <td>{fmtPct(d.competitors.self.roe)}</td>
                <td>{fmtPct(d.competitors.self.netMargin)}</td>
                <td>{fmtPct(d.competitors.self.grossMargin)}</td>
                <td>{fmtPct(d.competitors.self.revenueGrowth)}</td>
                <td>{fmtNum(d.competitors.self.debtEquity)}</td>
                <td>—</td>
              </tr>
              {d.competitors.peers.map((pe) => (
                <tr key={pe.ticker}>
                  <td title={pe.name}>{pe.ticker}</td>
                  <td>{fmtMoney(pe.marketCap)}</td>
                  <td>{fmtNum(pe.pe)}</td>
                  <td>{fmtPct(pe.roe)}</td>
                  <td>{fmtPct(pe.netMargin)}</td>
                  <td>{fmtPct(pe.grossMargin)}</td>
                  <td>{fmtPct(pe.revenueGrowth)}</td>
                  <td>{fmtNum(pe.debtEquity)}</td>
                  <td>{pe.similarity != null ? `${pe.similarity}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fa-method">{d.competitors.discovery}</p>
      </section>

      {/* Sentimiento + Crecimiento */}
      <div className="fa-two-col">
        {/* Sentimiento */}
        <section className="fa-card">
          <span className="fa-section-label">Sentimiento de Noticias (NLP)</span>
          <div className="fa-sent-head">
            <span className={`fa-sent-score ${sentCls(d.sentiment.score)}`}>
              {d.sentiment.score}<em>/100</em>
            </span>
            <div className="fa-sent-meta">
              <span className={`fa-sent-verdict ${sentCls(d.sentiment.score)}`}>{d.sentiment.verdict}</span>
              <span className="fa-sent-counts">
                {d.sentiment.positive} ▲ · {d.sentiment.negative} ▼ · {d.sentiment.neutral} ●
                ({d.sentiment.analyzed} noticias)
              </span>
            </div>
          </div>
          <p className="fa-sent-summary">{d.sentiment.summary}</p>
          <ul className="fa-sent-list">
            {d.sentiment.headlines.map((h, i) => (
              <li key={i} className={`fa-sent-item fa-sent-${h.tone}`}>
                <span className="fa-sent-dot" />
                {h.url ? (
                  <a href={h.url} target="_blank" rel="noopener noreferrer">{h.headline}</a>
                ) : (
                  <span>{h.headline}</span>
                )}
                {h.source && <em className="fa-sent-src">{h.source}</em>}
              </li>
            ))}
          </ul>
        </section>

        {/* Crecimiento */}
        <section className="fa-card">
          <span className="fa-section-label">Análisis de Crecimiento (CAGR)</span>
          <div className="fa-growth-grid">
            <GrowthStat label="Ingresos (YoY)" value={fmtSigned(d.growth.revenueYoy)} />
            <GrowthStat label="Ingresos (CAGR 3A)" value={fmtSigned(d.growth.revenueCagr3Y)} />
            <GrowthStat label="BPA (YoY)" value={fmtSigned(d.growth.epsYoy)} />
            <GrowthStat label="BPA (CAGR 3A)" value={fmtSigned(d.growth.epsCagr3Y)} />
            <GrowthStat label="FCF (CAGR 3A)" value={fmtSigned(d.growth.fcfCagr3Y)} />
          </div>
          <span className="fa-mini-label">Ingresos por año</span>
          <MiniBars data={income.map((r) => ({ label: r.year, value: r.revenue }))} unit="USD" />
          <span className="fa-mini-label">Beneficio por acción (BPA)</span>
          <MiniBars data={income.map((r) => ({ label: r.year, value: r.eps }))} unit="USD" />
        </section>
      </div>

      {/* Visualización: FCF + márgenes */}
      <div className="fa-two-col">
        <section className="fa-card">
          <span className="fa-section-label">Flujo de Caja Libre</span>
          <MiniBars data={cash.map((r) => ({ label: r.year, value: r.freeCashFlow }))} unit="USD" height={180} />
        </section>
        <section className="fa-card">
          <span className="fa-section-label">Evolución de Márgenes (%)</span>
          <MiniLines
            series={[
              { name: "Margen bruto", color: "var(--accent)",
                data: income.map((r) => ({ label: r.year, value: pctMargin(r.grossProfit, r.revenue) })) },
              { name: "Margen operativo", color: "#e0a83b",
                data: income.map((r) => ({ label: r.year, value: pctMargin(r.operatingIncome, r.revenue) })) },
              { name: "Margen neto", color: "var(--pos)",
                data: income.map((r) => ({ label: r.year, value: pctMargin(r.netIncome, r.revenue) })) },
            ]}
          />
        </section>
      </div>

      {/* Horizontes */}
      {d.horizon?.corto && (
        <section className="fa-card">
          <span className="fa-section-label">Horizontes de Inversión</span>
          <div className="fa-hz-grid">
            <HorizonCard title="Corto plazo" h={d.horizon.corto} />
            <HorizonCard title="Mediano plazo" h={d.horizon.mediano} />
            <HorizonCard title="Largo plazo" h={d.horizon.largo} />
          </div>
        </section>
      )}

      <p className="fa-disclaimer">
        Informe generado a partir de datos públicos (yfinance · FMP · Finnhub).
        Los modelos son heurísticos y cuantitativos, no constituyen recomendación
        de inversión ni ejecución de órdenes.
      </p>
    </>
  );
}

// ── Helpers de presentación ─────────────────────────────────────────────────
const RATIO_CAT_NAMES: Record<string, string> = {
  valoracion: "Valoración", rentabilidad: "Rentabilidad",
  crecimiento: "Crecimiento", saludFinanciera: "Salud financiera",
  ventajaCompetitiva: "Ventaja competitiva", fosoCompetitivo: "Foso competitivo",
};

function pctMargin(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return (num / den) * 100;
}

function piotCls(s: number) { return s >= 7 ? "fa-pos" : s >= 4 ? "fa-neutral-c" : "fa-neg"; }
function altmanCls(z: string) { return z === "SEGURA" ? "fa-pos" : z === "GRIS" ? "fa-neutral-c" : "fa-neg"; }
function buffettCls(p: number) { return p >= 70 ? "fa-pos" : p >= 45 ? "fa-neutral-c" : "fa-neg"; }
function sentCls(s: number) { return s >= 60 ? "fa-pos" : s >= 45 ? "fa-neutral-c" : "fa-neg"; }

function ProfStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="fa-prof-stat">
      <span className="fa-prof-lbl">{label}</span>
      <span className="fa-prof-val">{value}</span>
    </div>
  );
}
function GrowthStat({ label, value }: { label: string; value: string }) {
  const cls = value.startsWith("+") ? "fa-pos" : value.startsWith("-") ? "fa-neg" : "";
  return (
    <div className="fa-growth-stat">
      <span className={`fa-growth-val ${cls}`}>{value}</span>
      <span className="fa-growth-lbl">{label}</span>
    </div>
  );
}

function Sparkline({ data, pct }: { data: (number | null)[]; pct: boolean }) {
  const vals = data.filter((v): v is number => v != null);
  if (vals.length < 2) return <span className="fa-spark-na">—</span>;
  const max = Math.max(...vals), min = Math.min(...vals);
  const range = max - min || 1;
  // Los datos vienen recientes→antiguos; invertir para mostrar antiguo→reciente
  const ordered = [...data].reverse();
  const W = 60, H = 18;
  const n = ordered.length;
  const pts = ordered
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / (n - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean);
  const last = vals[0];   // más reciente
  const first = vals[vals.length - 1];
  const up = last >= first;
  void pct;
  return (
    <svg width={W} height={H} className="fa-spark">
      <polyline points={pts.join(" ")} fill="none"
        stroke={up ? "var(--pos)" : "var(--neg)"} strokeWidth="1.2" />
    </svg>
  );
}
