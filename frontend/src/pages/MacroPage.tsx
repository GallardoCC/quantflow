import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type NewsItem,
  type MacroIndicators,
  type UsMacro,
  type CountryMacro,
  type MapValue,
} from "../api";
import { GlobeMap } from "../components/GlobeMap";

// ── Constantes ──────────────────────────────────────────────────────────────

const STREAMS: { label: string; channel: string }[] = [
  { label: "Bloomberg",    channel: "UCIALMKvObZNtJ6AmdCLP7Lg" },
  { label: "Yahoo Finance", channel: "UCEAZeUIeJs0IjQiqTCdVSIg" },
  { label: "CNBC",         channel: "UCvJJ_dzjViJCoLf5uKUTwoA" },
];

const NEWS_CATS: { id: string; label: string }[] = [
  { id: "general", label: "Destacado" },
  { id: "forex",   label: "Divisas"   },
  { id: "crypto",  label: "Cripto"    },
  { id: "merger",  label: "Fusiones"  },
];

const TOPICS: { key: string; label: string; icon: string; available: boolean }[] = [
  { key: "inflation", label: "Inflación / IPC", icon: "📈", available: true  },
  { key: "rates",     label: "Tasas de interés", icon: "💵",  available: true  },
  { key: "gdp",       label: "PIB",              icon: "🏭",  available: true  },
  { key: "employment",label: "Empleo",            icon: "👷",  available: true  },
  { key: "liquidity", label: "Liquidez",          icon: "💧",  available: true  },
  { key: "pmi",       label: "PMI",               icon: "🔧",  available: false },
  { key: "trade",     label: "Comercio ext.",     icon: "🌐",  available: false },
];


const METRIC_DEFS: { key: string; label: string; unit: string; desc: string }[] = [
  { key: "gdp",           label: "Crecimiento PIB",   unit: "%",   desc: "Variación anual del producto interior bruto real (Banco Mundial)" },
  { key: "inflation",     label: "Inflación (IPC)",    unit: "%",   desc: "Tasa de inflación interanual de precios al consumidor" },
  { key: "unemployment",  label: "Desempleo",          unit: "%",   desc: "Tasa de desempleo (% de la fuerza laboral, OIT)" },
  { key: "gdp_per_capita",label: "PIB per cápita",     unit: "USD", desc: "PIB per cápita en dólares corrientes (Banco Mundial)" },
];

// ISO3 → flag emoji (para los países más comunes del globo)
const FLAG_BY_ISO3: Record<string, string> = {
  USA:"🇺🇸",CHN:"🇨🇳",JPN:"🇯🇵",DEU:"🇩🇪",GBR:"🇬🇧",FRA:"🇫🇷",IND:"🇮🇳",ITA:"🇮🇹",
  BRA:"🇧🇷",CAN:"🇨🇦",KOR:"🇰🇷",AUS:"🇦🇺",ESP:"🇪🇸",MEX:"🇲🇽",IDN:"🇮🇩",NLD:"🇳🇱",
  CHE:"🇨🇭",SAU:"🇸🇦",ARG:"🇦🇷",POL:"🇵🇱",BEL:"🇧🇪",SWE:"🇸🇪",NOR:"🇳🇴",NGA:"🇳🇬",
  ZAF:"🇿🇦",TUR:"🇹🇷",RUS:"🇷🇺",PER:"🇵🇪",COL:"🇨🇴",CHL:"🇨🇱",THA:"🇹🇭",PHL:"🇵🇭",
  VNM:"🇻🇳",PAK:"🇵🇰",MYS:"🇲🇾",ARE:"🇦🇪",SGP:"🇸🇬",EGY:"🇪🇬",QAT:"🇶🇦",PRT:"🇵🇹",
  GRC:"🇬🇷",CZE:"🇨🇿",ROU:"🇷🇴",HUN:"🇭🇺",AUT:"🇦🇹",DNK:"🇩🇰",FIN:"🇫🇮",ISR:"🇮🇱",
  NZL:"🇳🇿",IRN:"🇮🇷",KAZ:"🇰🇿",UKR:"🇺🇦",VEN:"🇻🇪",CUB:"🇨🇺",ETH:"🇪🇹",KEN:"🇰🇪",
  GHA:"🇬🇭",MAR:"🇲🇦",DZA:"🇩🇿",TZA:"🇹🇿",SDN:"🇸🇩",MOZ:"🇲🇿",AGO:"🇦🇴",CMR:"🇨🇲",
  SEN:"🇸🇳",CIV:"🇨🇮",ECU:"🇪🇨",URY:"🇺🇾",BOL:"🇧🇴",PRY:"🇵🇾",HRV:"🇭🇷",SVK:"🇸🇰",
};

// ISO3 → link de Banco Mundial y Trading Economics
function countryLinks(iso3: string, name: string) {
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z-]/g, "");
  return {
    worldBank: `https://data.worldbank.org/country/${iso3}`,
    tradingEcon: `https://tradingeconomics.com/${slug}/indicators`,
    investing: "https://www.investing.com/economic-calendar/",
  };
}

// ── Utilidades ───────────────────────────────────────────────────────────────

function domainFromNews(n: NewsItem): string | null {
  try { if (n.url) return new URL(n.url).hostname.replace(/^www\./, ""); } catch {}
  return null;
}
function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}
function ago(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
function fmtNum(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ── KPI card FRED (EE.UU.) ───────────────────────────────────────────────────

function UsKpiCard({ u, onOpen }: { u: UsMacro; onOpen: (t: string) => void }) {
  const clickable = !!u.topic;
  const up = (u.change ?? 0) >= 0;
  return (
    <button
      className={`mx-kpi mx-kpi-btn${clickable ? " linkable" : ""}`}
      onClick={() => clickable && onOpen(u.topic!)}
      disabled={!clickable}
      title={clickable ? "Ver análisis a fondo" : undefined}
    >
      <span className="mx-kpi-top">
        <span className="mx-kpi-label">{u.label}</span>
        {clickable && <span className="mx-kpi-arrow">→</span>}
      </span>
      <span className="kpi-value">
        {u.value === null ? "—" : fmtNum(u.value)}
        <i>{u.unit}</i>
      </span>
      <span className="mx-kpi-delta-row">
        {u.change !== null && (
          <span className={`mx-kpi-delta ${up ? "pos" : "neg"}`}>
            {up ? "▲" : "▼"} {fmtNum(Math.abs(u.change))} {u.unit}
          </span>
        )}
        {u.previous !== null && (
          <span className="mx-kpi-prev">ant. {fmtNum(u.previous)}</span>
        )}
      </span>
      {u.impact && <span className="mx-kpi-impact">{u.impact}</span>}
    </button>
  );
}

// ── Tarjeta World Bank ────────────────────────────────────────────────────────

function WbCard({ c }: { c: CountryMacro }) {
  return (
    <div className="mx-wb">
      <div className="mx-wb-name">{c.name}</div>
      <div className="mx-wb-metrics">
        {c.metrics.map((m, i) => (
          <div className="mx-wb-metric" key={i}>
            <span className="mx-wb-label">{m.label}</span>
            <span className="kpi-value mx-wb-val">
              {m.value === null ? "—" : fmtNum(m.value)}
              <i>{m.unit}</i>
            </span>
            {m.year && <span className="mx-wb-year">{m.year}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MacroPage() {
  const navigate = useNavigate();
  const [stream,  setStream]  = useState(STREAMS[0]);
  const [cat,     setCat]     = useState("general");
  const [news,    setNews]    = useState<NewsItem[]>([]);
  const [ind,     setInd]     = useState<MacroIndicators | null>(null);
  const [metric,  setMetric]  = useState("gdp");
  const [sel,     setSel]     = useState<{ iso3: string; name: string; value: number | null } | null>(null);
  const [indErr,  setIndErr]  = useState(false);
  const [allMaps, setAllMaps] = useState<Record<string, Record<string, MapValue>>>({});

  const catRef = useRef(cat);
  useEffect(() => { catRef.current = cat; }, [cat]);

  // Noticias (carga inicial + refresco cada 60 s)
  useEffect(() => {
    let alive = true;
    api.macroNews(cat).then((r) => alive && setNews(r.items)).catch(() => {});
    return () => { alive = false; };
  }, [cat]);

  useEffect(() => {
    // Indicadores macro (una sola carga, no cambian cada minuto)
    api.macroIndicators()
      .then((d) => { setInd(d); setIndErr(false); })
      .catch(() => setIndErr(true));

    // Cargar todos los mapas de métricas para el detalle de país enriquecido
    ["gdp", "inflation", "unemployment", "gdp_per_capita"].forEach((m) => {
      api.macroMap(m).then((d) => {
        setAllMaps((prev) => {
          const map: Record<string, MapValue> = {};
          d.values.forEach((v) => { map[v.iso3] = v; });
          return { ...prev, [m]: map };
        });
      }).catch(() => {});
    });

    const id = setInterval(() => {
      api.macroNews(catRef.current).then((r) => setNews(r.items)).catch(() => {});
    }, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openTopic = (t: string) => navigate(`/macro/${t}`);

  const usData = ind?.us ?? [];
  const indLoading = !ind && !indErr;

  return (
    <div className="mx">
      <header className="mx-intro">
        <h2 className="mx-intro-title">Macro Global</h2>
        <p className="mx-intro-sub">
          Centro de inteligencia macro — el entorno económico mundial, la política de los bancos
          centrales, los eventos que mueven los mercados y el contexto entre activos.
        </p>
      </header>

      {/* ── Análisis a fondo: botones horizontales ─────────────────────────── */}
      <section className="mx-topics-wrap">
        <div className="mx-section-label">Análisis a fondo</div>
        <div className="mx-topics-row">
          {TOPICS.map((t) =>
            t.available ? (
              <button
                key={t.key}
                className="mx-topic-btn"
                onClick={() => openTopic(t.key)}
                title={`Abrir análisis de ${t.label}`}
              >
                <span className="mx-topic-icon">{t.icon}</span>
                <span className="mx-topic-label">{t.label}</span>
                <span className="mx-topic-arrow">→</span>
              </button>
            ) : (
              <span key={t.key} className="mx-topic-btn disabled" title="Próximamente">
                <span className="mx-topic-icon">{t.icon}</span>
                <span className="mx-topic-label">{t.label}</span>
                <span className="mx-topic-soon">próx.</span>
              </span>
            )
          )}
        </div>
      </section>

      {/* ── Panorama económico EE.UU. (FRED) ──────────────────────────────── */}
      <section className="mx-kpis-wrap">
        <div className="mx-section-label">
          Panorama económico EE.UU.
          <span className="mx-source"> · FRED · pulsa una tarjeta para profundizar</span>
        </div>

        {indLoading ? (
          <div className="mx-kpis mx-kpis-skel">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="mx-kpi mx-kpi-skel" />
            ))}
          </div>
        ) : usData.length > 0 ? (
          <div className="mx-kpis">
            {usData.map((u) => (
              <UsKpiCard key={u.series} u={u} onOpen={openTopic} />
            ))}
          </div>
        ) : (
          <div className="mx-kpis">
            {ind?.global?.slice(0, 1).map((c) => <WbCard key={c.country} c={c} />) ?? null}
            <div className="mx-empty mx-empty-soft">
              Datos macro de EE.UU. temporalmente no disponibles. Selecciona un tema arriba para el histórico.
            </div>
          </div>
        )}
      </section>

      {/* ── Indicadores globales (World Bank) ─────────────────────────────── */}
      {ind && (ind.global?.length ?? 0) > 0 && (
        <section className="mx-kpis-wrap">
          <div className="mx-section-label">
            Indicadores globales
            <span className="mx-source"> · World Bank · datos anuales</span>
          </div>
          <div className="mx-kpis">
            {ind.global.map((c) => (
              <WbCard key={c.country} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* ── Transmisión en vivo ────────────────────────────────────────────── */}
      <section className="mx-card mx-stream">
        <header className="mx-h">
          <div>
            <span className="mx-t">Transmisión en vivo</span>
            <span className="mx-sub">TV financiera 24/7</span>
          </div>
          <div className="mx-seg">
            {STREAMS.map((s) => (
              <button
                key={s.channel}
                className={s.channel === stream.channel ? "on" : ""}
                onClick={() => setStream(s)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </header>
        <div className="mx-video">
          <iframe
            title="live"
            src={`https://www.youtube.com/embed/live_stream?channel=${stream.channel}&autoplay=0`}
            allow="encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </section>

      {/* ── Cable en vivo ─────────────────────────────────────────────────── */}
      <section className="mx-card mx-news">
        <header className="mx-h">
          <div>
            <span className="mx-t">Cable en vivo</span>
            <span className="mx-live">
              <span className="mx-live-dot" /> en directo
            </span>
          </div>
          <div className="mx-seg">
            {NEWS_CATS.map((c) => (
              <button
                key={c.id}
                className={c.id === cat ? "on" : ""}
                onClick={() => setCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </header>
        <ul className="mx-feed">
          {news.length === 0 && <li className="mx-empty">Sin titulares</li>}
          {news.map((n, i) => {
            const dom = domainFromNews(n);
            return (
              <li key={n.id ?? i}>
                <a href={n.url ?? "#"} target="_blank" rel="noreferrer">
                  <span className="mx-logo">
                    {dom && (
                      <img
                        className="mx-logo-img"
                        src={faviconUrl(dom)}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          const ddg = `https://icons.duckduckgo.com/ip3/${dom}.ico`;
                          if (img.src !== ddg) img.src = ddg;
                          else {
                            img.style.display = "none";
                            const fb = img.nextElementSibling as HTMLElement | null;
                            if (fb) fb.style.display = "";
                          }
                        }}
                      />
                    )}
                    <span className="mx-logo-fallback" style={{ display: dom ? "none" : "" }}>
                      {(n.source ?? "?").charAt(0).toUpperCase()}
                    </span>
                  </span>
                  <span className="mx-feed-body">
                    <span className="mx-hl">{n.headline}</span>
                    <span className="mx-feed-meta">
                      <span className="mx-src">{n.source}</span>
                      <span className="mi-dot">·</span>
                      <span className="mi-time">{ago(n.datetime)}</span>
                    </span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Mapa 3D ────────────────────────────────────────────────────────── */}
      <GlobeMap metric={metric} onMetric={setMetric} onSelect={setSel} />

      {/* ── Detalle de país (enriquecido) ──────────────────────────────────── */}
      <section className="mx-card mx-country">
        <header className="mx-h">
          <div>
            <span className="mx-t">Análisis de país</span>
            <span className="mx-sub">Indicadores macro · Banco Mundial</span>
          </div>
          {sel && (
            <button className="mx-close" onClick={() => setSel(null)}>✕</button>
          )}
        </header>
        {!sel ? (
          <div className="mx-empty">Haz clic en un país en el mapa para ver su perfil macro completo.</div>
        ) : (() => {
          const flag = FLAG_BY_ISO3[sel.iso3] ?? "🌐";
          const links = countryLinks(sel.iso3, sel.name);
          return (
            <div className="mx-ctry-expanded">
              <div className="mx-ctry-header">
                <span className="mx-ctry-flag">{flag}</span>
                <span className="mx-ctry-name-big">{sel.name}</span>
                <span className="mx-ctry-iso-tag">{sel.iso3}</span>
              </div>
              <div className="mx-ctry-metrics-grid">
                {METRIC_DEFS.map(({ key, label, unit, desc }) => {
                  const v = allMaps[key]?.[sel.iso3];
                  const val = v?.value ?? null;
                  let valCls = "val-na";
                  if (val !== null) {
                    if (key === "inflation" || key === "unemployment") {
                      valCls = val > 10 ? "val-neg" : val < 3 ? "val-pos" : "";
                    } else if (key === "gdp") {
                      valCls = val > 3 ? "val-pos" : val < 0 ? "val-neg" : "";
                    } else {
                      valCls = "";
                    }
                  }
                  return (
                    <div key={key} className="mx-ctry-metric-card" title={desc}>
                      <span className="mx-ctry-metric-label">{label}</span>
                      <span className={`mx-ctry-metric-val ${valCls}`}>
                        {val === null ? "—" : fmtNum(val)}
                        {val !== null && <span className="mx-ctry-metric-unit"> {unit}</span>}
                      </span>
                      {v?.year && <span className="mx-ctry-metric-year">{v.year}</span>}
                    </div>
                  );
                })}
              </div>
              <div className="mx-ctry-links">
                <a href={links.worldBank} target="_blank" rel="noreferrer" className="mx-ctry-link">
                  Banco Mundial <span className="mx-ctry-link-ext">↗</span>
                </a>
                <a href={links.tradingEcon} target="_blank" rel="noreferrer" className="mx-ctry-link">
                  Trading Economics <span className="mx-ctry-link-ext">↗</span>
                </a>
                <a href={links.investing} target="_blank" rel="noreferrer" className="mx-ctry-link">
                  Calendario Investing <span className="mx-ctry-link-ext">↗</span>
                </a>
                <a href="https://www.imf.org/en/countries" target="_blank" rel="noreferrer" className="mx-ctry-link">
                  IMF <span className="mx-ctry-link-ext">↗</span>
                </a>
              </div>
            </div>
          );
        })()}
      </section>
    </div>
  );
}
