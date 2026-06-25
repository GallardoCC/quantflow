import { useEffect, useMemo, useState } from "react";
import { api, type CalendarEvent, type ImpactLevel, type MacroCalendar } from "../api";

// ── Datos estáticos ──────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: "US", flag: "🇺🇸", name: "EE.UU." },
  { code: "EU", flag: "🇪🇺", name: "Eurozona" },
  { code: "GB", flag: "🇬🇧", name: "Reino Unido" },
  { code: "JP", flag: "🇯🇵", name: "Japón" },
  { code: "CN", flag: "🇨🇳", name: "China" },
  { code: "DE", flag: "🇩🇪", name: "Alemania" },
  { code: "FR", flag: "🇫🇷", name: "Francia" },
  { code: "CA", flag: "🇨🇦", name: "Canadá" },
  { code: "AU", flag: "🇦🇺", name: "Australia" },
  { code: "CH", flag: "🇨🇭", name: "Suiza" },
  { code: "KR", flag: "🇰🇷", name: "Corea" },
  { code: "BR", flag: "🇧🇷", name: "Brasil" },
  { code: "PE", flag: "🇵🇪", name: "Perú" },
];

const FLAG_MAP: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.flag])
);

const IMPACT_OPTS: { v: ImpactLevel | "All"; label: string; cls: string }[] = [
  { v: "All",    label: "Todos",  cls: "" },
  { v: "High",   label: "Alto",   cls: "imp-High" },
  { v: "Medium", label: "Medio",  cls: "imp-Medium" },
  { v: "Low",    label: "Bajo",   cls: "imp-Low" },
];

const IMPACT_ES: Record<string, string> = { High: "Alto", Medium: "Medio", Low: "Bajo" };

// Links externos por evento (basados en series ID de FRED o nombre del evento)
const SERIES_LINKS: Record<string, { label: string; url: string }[]> = {
  CPIAUCSL: [
    { label: "BLS CPI", url: "https://www.bls.gov/cpi/" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/CPIAUCSL" },
  ],
  PCEPI: [
    { label: "BEA PCE", url: "https://www.bea.gov/data/personal-consumption-expenditures-price-index" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/PCEPI" },
  ],
  PPIACO: [
    { label: "BLS PPI", url: "https://www.bls.gov/ppi/" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/PPIACO" },
  ],
  PAYEMS: [
    { label: "BLS Jobs", url: "https://www.bls.gov/bls/newsrels.htm" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/PAYEMS" },
  ],
  UNRATE: [
    { label: "BLS Desempleo", url: "https://www.bls.gov/cps/" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/UNRATE" },
  ],
  ICSA: [
    { label: "DOL Claims", url: "https://www.dol.gov/ui/data.pdf" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/ICSA" },
  ],
  A191RL1Q225SBEA: [
    { label: "BEA GDP", url: "https://www.bea.gov/data/gdp/gross-domestic-product" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/A191RL1Q225SBEA" },
  ],
  RSAFS: [
    { label: "Census Retail", url: "https://www.census.gov/retail/index.html" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/RSAFS" },
  ],
  INDPRO: [
    { label: "Fed Industrial", url: "https://www.federalreserve.gov/releases/g17/" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/INDPRO" },
  ],
  UMCSENT: [
    { label: "U. Michigan", url: "https://data.sca.isr.umich.edu/" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/UMCSENT" },
  ],
  HOUST: [
    { label: "Census Housing", url: "https://www.census.gov/construction/nrc/index.html" },
    { label: "FRED", url: "https://fred.stlouisfed.org/series/HOUST" },
  ],
};

const INVESTING_CAL = "https://www.investing.com/economic-calendar/";
const TRADING_ECON  = "https://tradingeconomics.com/calendar";

// ── Utilidades ───────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().split("T")[0]; }

function relLabel(iso: string): { text: string; cls: "today" | "past" | "future" } {
  const t = todayISO();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
  const tomorrow  = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  if (iso === t) return { text: "HOY", cls: "today" };
  if (iso === yesterday) return { text: "AYER", cls: "past" };
  if (iso === tomorrow)  return { text: "MAÑANA", cls: "future" };
  const d = new Date(iso + "T12:00:00");
  const label = d.toLocaleDateString("es-PE", {
    weekday: "long", day: "2-digit", month: "short",
  });
  return { text: label.charAt(0).toUpperCase() + label.slice(1), cls: iso < t ? "past" : "future" };
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
}

function fmtVal(v: number | string | null | undefined, unit: string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  const num = typeof v === "number" ? v : parseFloat(String(v));
  if (!Number.isFinite(num)) return String(v);
  return unit ? `${num}${unit === "%" ? "%" : " " + unit}` : String(num);
}

function deltaClass(ch: number | null | undefined): string {
  if (ch == null) return "";
  return ch > 0 ? "pos" : ch < 0 ? "neg" : "";
}

function actualClass(e: CalendarEvent): string {
  if (e.status === "estimado") return "pending";
  if (e.change == null) return "flat";
  // For unemployment/claims a LOWER value is positive
  const inv = ["Tasa de desempleo", "Peticiones"].some((k) => e.event.includes(k));
  const good = inv ? (e.change ?? 0) < 0 : (e.change ?? 0) > 0;
  return good ? "pos" : "neg";
}

// ── Componente fila ──────────────────────────────────────────────────────────

function EventRow({ e, isOpen, onToggle }: {
  e: CalendarEvent; isOpen: boolean; onToggle: () => void;
}) {
  const today = todayISO();
  const isToday   = e.date === today;
  const isPast    = e.date < today;
  const isPending = e.status === "estimado";

  const externalLinks = e.series ? (SERIES_LINKS[e.series] ?? []) : [];
  const rdg = !isPending && e.change != null ? (
    e.change > 0
      ? `${fmtVal(e.actual, e.unit)} actual — Subió +${e.change} vs. anterior — acelerando.`
      : e.change < 0
        ? `${fmtVal(e.actual, e.unit)} actual — Bajó ${e.change} vs. anterior — desacelerando.`
        : `${fmtVal(e.actual, e.unit)} actual — Sin cambio frente al periodo anterior.`
  ) : null;
  const rdgCls = e.change != null ? (e.change > 0 ? "pos" : e.change < 0 ? "neg" : "flat") : "";

  return (
    <li className={`calp-row-wrap${isOpen ? " expanded" : ""}${isPast ? " past-event" : ""}${isToday ? " today-event" : ""}`}>
      <button className="calp-row" onClick={onToggle} aria-expanded={isOpen}>
        <span className="calp-row-flag">{FLAG_MAP[e.country] ?? "🌐"}</span>
        <span className="calp-row-country">{e.country}</span>
        <span className={`calp-row-name${isPending ? " future-event" : ""}`}>{e.event}</span>
        <span className={`calp-row-actual ${actualClass(e)}`}>
          {isPending ? "Pendiente" : fmtVal(e.actual, e.unit)}
        </span>
        <span className={`calp-row-delta ${deltaClass(e.change)}`}>
          {e.change != null ? `${e.change > 0 ? "+" : ""}${e.change}` : "—"}
        </span>
        <span className="calp-row-prev">{fmtVal(e.previous, e.unit)}</span>
        <span className="calp-row-impact">
          <span className={`mx-imp imp-${e.impact}`}>{IMPACT_ES[e.impact] ?? e.impact}</span>
        </span>
        <span className="calp-row-chevron">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="calp-detail">
          {e.why && <p className="calp-detail-why">📌 {e.why}</p>}
          {rdg && <p className={`calp-detail-reading ${rdgCls}`}>📊 {rdg}</p>}
          {isPending && (
            <p className="calp-detail-pending">
              Próxima publicación estimada. Anterior: {fmtVal(e.previous, e.unit)}.
              El consenso de mercado no está disponible en esta fuente (FRED / gratuita).
            </p>
          )}
          <div className="calp-detail-links">
            <span className="calp-detail-links-label">Fuentes</span>
            {externalLinks.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="calp-ext-link">
                {l.label} <span className="calp-ext-link-icon">↗</span>
              </a>
            ))}
            <a href={INVESTING_CAL} target="_blank" rel="noreferrer" className="calp-ext-link">
              Investing.com <span className="calp-ext-link-icon">↗</span>
            </a>
            <a href={TRADING_ECON} target="_blank" rel="noreferrer" className="calp-ext-link">
              Trading Economics <span className="calp-ext-link-icon">↗</span>
            </a>
          </div>
        </div>
      )}
    </li>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CalendarioPage() {
  const [cal,        setCal]       = useState<MacroCalendar | null>(null);
  const [loading,    setLoading]   = useState(true);
  const [countries,  setCountries] = useState<string[]>([]);
  const [impact,     setImpact]    = useState<ImpactLevel | "All">("All");
  const [cat,        setCat]       = useState("Todas");
  const [openIdx,    setOpenIdx]   = useState<string | null>(null);

  // Carga (recarga cuando cambian países; [] = todos los países via FMP)
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.macroCalendarPro(45, 30, countries.length ? countries : undefined)
      .then((d) => { if (alive) { setCal(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [countries]);

  // Toggle país: [] significa "todos"
  const toggleCountry = (code: string) => {
    setCountries((prev) => {
      if (prev.length === 0) return [code];
      return prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code];
    });
  };

  // Categorías disponibles
  const cats = useMemo(() => {
    const set = new Set<string>();
    (cal?.events ?? []).forEach((e) => e.category && set.add(e.category));
    return ["Todas", ...Array.from(set).sort()];
  }, [cal]);

  // Eventos filtrados
  const filtered = useMemo(() => {
    let ev = cal?.events ?? [];
    if (impact !== "All") ev = ev.filter((e) => e.impact === impact);
    if (cat !== "Todas") ev = ev.filter((e) => e.category === cat);
    return ev;
  }, [cal, impact, cat]);

  // Agrupar por fecha
  const grouped = useMemo(() => {
    const g: Record<string, CalendarEvent[]> = {};
    for (const e of filtered) {
      const key = e.date.split("T")[0];
      if (!g[key]) g[key] = [];
      g[key].push(e);
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Stats
  const highCount = (cal?.events ?? []).filter((e) => e.impact === "High").length;
  const futureCount = (cal?.events ?? []).filter((e) => e.status === "estimado").length;

  const today = todayISO();
  const todayEvents = (cal?.events ?? []).filter((e) => e.date === today).length;

  return (
    <div className="calp">

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <div className="calp-hero">
        <p className="calp-hero-eyebrow">Macro Intelligence</p>
        <h1 className="calp-hero-title">Calendario Económico</h1>
        <p className="calp-hero-sub">
          Releases macroeconómicos de alto impacto — cifras reales, historial y contexto
          para cada dato. Fuente: FRED (EE.UU.) · FMP (internacional si disponible).
          Selecciona países, filtra por importancia y expande cualquier evento para ver
          por qué mueve el mercado y acceder a fuentes oficiales.
        </p>
        {!loading && cal && (
          <div className="calp-hero-stats">
            <div className="calp-hero-stat">
              <span className="calp-hero-stat-val">{cal.events.length}</span>
              <span className="calp-hero-stat-label">Eventos totales</span>
            </div>
            <div className="calp-hero-stat">
              <span className="calp-hero-stat-val" style={{ color: "var(--neg)" }}>{highCount}</span>
              <span className="calp-hero-stat-label">Alto impacto</span>
            </div>
            <div className="calp-hero-stat">
              <span className="calp-hero-stat-val" style={{ color: "var(--amber)" }}>{futureCount}</span>
              <span className="calp-hero-stat-label">Próximos</span>
            </div>
            <div className="calp-hero-stat">
              <span className="calp-hero-stat-val" style={{ color: "var(--accent-2)" }}>{todayEvents}</span>
              <span className="calp-hero-stat-label">Hoy</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="calp-toolbar">
        {/* Países */}
        <div className="calp-toolbar-row">
          <span className="calp-toolbar-label">Países</span>
          <div className="calp-countries">
            <button
              className={`calp-chip${countries.length === 0 ? " on" : ""}`}
              onClick={() => setCountries([])}
              title="Todos los países (FMP global)"
            >
              🌐 Todos
            </button>
            {COUNTRIES.map((c) => (
              <button
                key={c.code}
                className={`calp-chip${countries.includes(c.code) ? " on" : ""}`}
                onClick={() => toggleCountry(c.code)}
                title={c.name}
              >
                <span className="calp-chip-flag">{c.flag}</span>
                {c.code}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="calp-toolbar-row">
          <span className="calp-toolbar-label">Impacto</span>
          <div className="calp-impact-seg">
            {IMPACT_OPTS.map((o) => (
              <button
                key={o.v}
                className={`calp-imp-btn${impact === o.v ? " on " + o.cls : ""}`}
                onClick={() => setImpact(o.v)}
              >
                {o.label}
              </button>
            ))}
          </div>

          {cats.length > 2 && (
            <>
              <span className="calp-toolbar-label" style={{ marginLeft: "var(--s3)" }}>Categoría</span>
              <select
                className="calp-cat-sel"
                value={cat}
                onChange={(e) => setCat(e.target.value)}
              >
                {cats.map((c) => (
                  <option key={c} value={c}>{c === "Todas" ? "Todas las categorías" : c}</option>
                ))}
              </select>
            </>
          )}

          <a
            href={INVESTING_CAL}
            target="_blank"
            rel="noreferrer"
            className="calp-ext-link"
            style={{ marginLeft: "auto" }}
          >
            Investing.com ↗
          </a>
          <a
            href={TRADING_ECON}
            target="_blank"
            rel="noreferrer"
            className="calp-ext-link"
          >
            Trading Economics ↗
          </a>
        </div>
      </div>

      {/* ── Aviso de fuente ─────────────────────────────────────────── */}
      {cal?.note && (
        <div className="calp-note">
          ⚠ {cal.note}
        </div>
      )}

      {/* ── Skeleton carga ──────────────────────────────────────────── */}
      {loading && (
        <div className="calp-skel">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="calp-skel-row" />
          ))}
        </div>
      )}

      {/* ── Tabla header ────────────────────────────────────────────── */}
      {!loading && grouped.length > 0 && (
        <div className="calp-table-head">
          <span></span>
          <span>País</span>
          <span>Evento</span>
          <span>Actual</span>
          <span>Δ</span>
          <span>Anterior</span>
          <span>Impacto</span>
          <span></span>
        </div>
      )}

      {/* ── Grupos por fecha ────────────────────────────────────────── */}
      {!loading && grouped.length === 0 && (
        <div className="calp-empty">
          Sin eventos para los filtros seleccionados.
          <br />
          <a href={INVESTING_CAL} target="_blank" rel="noreferrer" style={{ color: "var(--accent-2)" }}>
            Ver calendario completo en Investing.com →
          </a>
        </div>
      )}

      {grouped.map(([dateKey, events]) => {
        const { text, cls } = relLabel(dateKey);
        return (
          <div key={dateKey} className="calp-group">
            <div className={`calp-date-divider ${cls}`}>
              <div className="calp-date-line" />
              <span className="calp-date-label">{fmtDate(dateKey)}</span>
              <span className={`calp-date-rel ${cls}`}>{text}</span>
              <div className="calp-date-line" />
            </div>
            <ul className="calp-list">
              {events.map((e, idx) => {
                const key = `${dateKey}-${idx}`;
                return (
                  <EventRow
                    key={key}
                    e={e}
                    isOpen={openIdx === key}
                    onToggle={() => setOpenIdx(openIdx === key ? null : key)}
                  />
                );
              })}
            </ul>
          </div>
        );
      })}

      {/* ── Footer ──────────────────────────────────────────────────── */}
      {!loading && (
        <div style={{ marginTop: "var(--s7)", borderTop: "1px solid var(--border-soft)", paddingTop: "var(--s4)", fontSize: "11px", color: "var(--muted)", lineHeight: 1.7 }}>
          <strong style={{ color: "var(--text-2)" }}>Fuentes:</strong>{" "}
          FRED (Federal Reserve Bank of St. Louis) para datos de EE.UU. ·
          FMP (Financial Modeling Prep) para internacional cuando disponible ·
          BLS · BEA · Census Bureau · U. Michigan.{" "}
          <br />
          Consenso de mercado no disponible en fuentes gratuitas — se muestra el dato real Anterior / Actual.{" "}
          Para consenso y cobertura global completa:{" "}
          <a href={INVESTING_CAL} target="_blank" rel="noreferrer" style={{ color: "var(--accent-2)" }}>
            Investing.com
          </a>{" · "}
          <a href={TRADING_ECON} target="_blank" rel="noreferrer" style={{ color: "var(--accent-2)" }}>
            Trading Economics
          </a>{" · "}
          <a href="https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" target="_blank" rel="noreferrer" style={{ color: "var(--accent-2)" }}>
            Fed FOMC
          </a>{" · "}
          <a href="https://www.ecb.europa.eu/press/govcdec/html/index.en.html" target="_blank" rel="noreferrer" style={{ color: "var(--accent-2)" }}>
            ECB
          </a>
        </div>
      )}
    </div>
  );
}
