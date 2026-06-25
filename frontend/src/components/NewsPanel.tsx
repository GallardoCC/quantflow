import { useEffect, useState } from "react";
import { api, type NewsItem } from "../api";

/**
 * Inteligencia de mercado — feed editorial de noticias en vivo.
 * Por defecto muestra titulares de la empresa; cae a cobertura general del
 * mercado para que el panel nunca quede vacío. El usuario puede cambiar el
 * ámbito a mano. Solo análisis: no inventamos comentario que el dato no trae.
 */

function domainFromNews(n: NewsItem): string | null {
  try {
    if (n.url) return new URL(n.url).hostname.replace(/^www\./, "");
  } catch {}
  return null;
}
function faviconUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function ago(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `hace ${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)}h`;
  return `hace ${Math.floor(s / 86400)}d`;
}

// Logo with graceful favicon → DuckDuckGo → monogram fallback.
function SourceLogo({ item, className }: { item: NewsItem; className: string }) {
  const dom = domainFromNews(item);
  return (
    <span className={className}>
      {dom && (
        <img
          className="mi-logo-img"
          src={faviconUrl(dom)}
          alt=""
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            const ddg = `https://icons.duckduckgo.com/ip3/${dom}.ico`;
            if (img.src !== ddg) {
              img.src = ddg;
            } else {
              img.style.display = "none";
              const fb = img.nextElementSibling as HTMLElement | null;
              if (fb) fb.style.display = "";
            }
          }}
        />
      )}
      <span className="mi-logo-fallback" style={{ display: dom ? "none" : "" }}>
        {(item.source ?? "?").charAt(0).toUpperCase()}
      </span>
    </span>
  );
}

type Scope = "company" | "market";

export function NewsPanel({ ticker }: { ticker: string }) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [scope, setScope] = useState<Scope>("company");
  // Whether the current scope was chosen by the user (sticky) or auto-derived.
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        if (pinned && scope === "market") {
          const mkt = await api.marketNews();
          if (alive) setItems(mkt.items);
          return;
        }
        const co = await api.news(ticker);
        if (!alive) return;
        if (co.items.length > 0) {
          setItems(co.items);
          if (!pinned) setScope("company");
        } else {
          const mkt = await api.marketNews();
          if (!alive) return;
          setItems(mkt.items);
          if (!pinned) setScope("market");
        }
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ticker, scope, pinned]);

  const pick = (s: Scope) => {
    setPinned(true);
    setScope(s);
  };

  const [lead, ...rest] = items;

  return (
    <section className="news-card mi">
      <header className="mi-head">
        <div className="mi-titles">
          <h2 className="mi-title">Inteligencia de mercado</h2>
          <p className="mi-sub">
            {scope === "company"
              ? `Titulares que mueven ${ticker}`
              : "Eventos y señales macro de los mercados"}
          </p>
        </div>
        <div className="mi-controls">
          <span className="mi-live">
            <span className="mi-live-dot" /> En vivo
          </span>
          <div className="mi-seg" role="tablist" aria-label="Ámbito de noticias">
            <button
              role="tab"
              aria-selected={scope === "company"}
              className={scope === "company" ? "on" : ""}
              onClick={() => pick("company")}
            >
              {ticker}
            </button>
            <button
              role="tab"
              aria-selected={scope === "market"}
              className={scope === "market" ? "on" : ""}
              onClick={() => pick("market")}
            >
              Mercado
            </button>
          </div>
        </div>
      </header>

      {loading && items.length === 0 && (
        <div className="mi-empty">Cargando noticias…</div>
      )}
      {!loading && items.length === 0 && (
        <div className="mi-empty">Sin cobertura disponible ahora mismo.</div>
      )}

      {lead && (
        <a
          className="mi-lead"
          href={lead.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          style={lead.image ? { ["--mi-img" as string]: `url(${lead.image})` } : undefined}
        >
          {lead.image && <span className="mi-lead-img" />}
          <span className="mi-lead-body">
            {lead.category && <span className="mi-tag">{lead.category}</span>}
            <span className="mi-lead-hl">{lead.headline}</span>
            <span className="mi-meta">
              <SourceLogo item={lead} className="mi-logo mi-logo-sm" />
              <span className="mi-src">{lead.source}</span>
              <span className="mi-dot">·</span>
              <span className="mi-time">{ago(lead.datetime)}</span>
            </span>
          </span>
        </a>
      )}

      {rest.length > 0 && (
        <ul className="mi-list">
          {rest.map((n, i) => (
            <li key={n.id ?? n.url ?? i} className="mi-row-li">
              <a
                className="mi-row"
                href={n.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <SourceLogo item={n} className="mi-logo" />
                <span className="mi-row-body">
                  <span className="mi-row-hl">{n.headline}</span>
                  <span className="mi-meta">
                    <span className="mi-src">{n.source}</span>
                    <span className="mi-dot">·</span>
                    <span className="mi-time">{ago(n.datetime)}</span>
                    {n.category && <span className="mi-tag mi-tag-sm">{n.category}</span>}
                  </span>
                </span>
                {n.image && (
                  <img
                    className="mi-thumb"
                    src={n.image}
                    alt=""
                    loading="lazy"
                    onError={(e) =>
                      ((e.currentTarget as HTMLImageElement).style.display = "none")
                    }
                  />
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
