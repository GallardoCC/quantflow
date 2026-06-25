import { useEffect, useState } from "react";
import { api } from "../api";

// Símbolos fijos de la cinta bursátil superior.
const SYMBOLS = [
  "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "SPY",
  "QQQ", "BTC-USD", "ETH-USD", "ES=F", "CL=F", "GC=F",
];

// Datos mínimos que la cinta necesita de cada cotización.
interface TickItem {
  ticker: string;
  price: number | null;
  changePercent: number | null;
}

function fmtPrice(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtPct(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(2);
}

/**
 * Cinta bursátil animada que recorre la parte superior.
 * Pide cotizaciones cada ~30s con Promise.allSettled y descarta las
 * que fallen, para que la franja nunca se rompa.
 */
export function TickerTape({ navHidden }: { navHidden?: boolean }) {
  const [items, setItems] = useState<TickItem[]>([]);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const results = await Promise.allSettled(SYMBOLS.map((s) => api.quote(s)));
      if (!alive) return;
      const ok: TickItem[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") {
          const q = r.value;
          ok.push({
            ticker: q.ticker,
            price: q.price,
            changePercent: q.changePercent,
          });
        }
      }
      if (ok.length) setItems(ok);
    };

    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // Skeleton mientras no hay datos: franja con shimmer, sin romper layout.
  if (!items.length) {
    return (
      <div className={`ticker${navHidden ? " nav-hidden" : ""}`} aria-label="Cinta bursátil" aria-busy="true">
        <div className="ticker-track ticker-skeleton">
          {Array.from({ length: 10 }).map((_, i) => (
            <span className="ticker-item skeleton" key={i}>
              <b>•••••</b> ••••• ••••
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Render del contenido de la cinta (una pasada de items).
  const row = items.map((it) => {
    const up = (it.changePercent ?? 0) >= 0;
    return (
      <span className="ticker-item" key={it.ticker}>
        <b>{it.ticker}</b> {fmtPrice(it.price)}{" "}
        <span className={up ? "up" : "down"}>
          {up ? "▲" : "▼"} {fmtPct(it.changePercent)}%
        </span>
      </span>
    );
  });

  return (
    <div className={`ticker${navHidden ? " nav-hidden" : ""}`} aria-label="Cinta bursátil">
      {/* Items DOS VECES para un loop perfecto (translateX -50%). */}
      <div className="ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}
