import { useEffect, useState, useCallback } from "react";
import { api, type Quote, type History } from "../api";
import { CandleChart } from "../components/CandleChart";
import { NewsPanel } from "../components/NewsPanel";

const RANGES = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "5y", "max"];

const ASSET_LABELS: Record<string, string> = {
  stock: "ACCIÓN", etf: "ETF", crypto: "CRIPTO", future: "FUTURO",
  forex: "FOREX", index: "ÍNDICE", unknown: "—",
};

function fmt(n: number | null, opts: Intl.NumberFormatOptions = {}): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2, ...opts });
}

function fmtBig(n: number | null): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return fmt(n);
}

export function OverviewPage({ ticker }: { ticker: string }) {
  const [range, setRange] = useState("1y");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tk: string, rg: string) => {
    setLoading(true);
    setError(null);
    try {
      const [q, h] = await Promise.all([api.quote(tk), api.history(tk, rg)]);
      setQuote(q);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setQuote(null);
      setHistory(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(ticker, range);
  }, [ticker, range, load]);

  const up = (quote?.change ?? 0) >= 0;
  const stats = quote
    ? [
        { label: "Apertura", value: fmt(quote.open) },
        { label: "Máx día", value: fmt(quote.dayHigh) },
        { label: "Mín día", value: fmt(quote.dayLow) },
        { label: "Cierre ant.", value: fmt(quote.previousClose) },
        { label: "Volumen", value: fmtBig(quote.volume) },
        { label: "Cap. mercado", value: fmtBig(quote.marketCap) },
        { label: "Máx 52sem", value: fmt(quote.fiftyTwoWeekHigh) },
        { label: "Mín 52sem", value: fmt(quote.fiftyTwoWeekLow) },
        { label: "Media 50d", value: fmt(quote.priceAvg50) },
        { label: "Media 200d", value: fmt(quote.priceAvg200) },
        { label: "P/E", value: fmt(quote.peRatio) },
      ]
    : [];

  return (
    <>
      {error && <div className="banner error">⚠ {error}</div>}
      {loading && !quote && <div className="banner">Cargando {ticker}…</div>}

      {quote && (
        <main className="content">
          <section className="asset-head">
            <div className="asset-id">
              <span className={`badge badge-${quote.assetType}`}>
                {ASSET_LABELS[quote.assetType] ?? quote.assetType}
              </span>
              <h1>{quote.ticker}</h1>
              <span className="asset-name">{quote.name}</span>
              <span className="exch">{quote.exchange}</span>
            </div>
            <div className="asset-price">
              <span className="price">
                {fmt(quote.price)} <span className="cur">{quote.currency}</span>
              </span>
              <span className={`change ${up ? "pos" : "neg"}`}>
                {up ? "▲" : "▼"} {fmt(quote.change)} ({fmt(quote.changePercent)}%)
              </span>
            </div>
          </section>

          <section className="chart-card">
            <div className="ranges">
              {RANGES.map((r) => (
                <button
                  key={r}
                  className={r === range ? "active" : ""}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
              {history && (
                <span className="interval">
                  {history.candles.length} velas · {history.interval}
                </span>
              )}
            </div>
            <div className="chart-wrap">
              {history && <CandleChart candles={history.candles} />}
            </div>
          </section>

          <section className="stats">
            {stats.map((s) => (
              <div className="stat" key={s.label}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value">{s.value}</span>
              </div>
            ))}
          </section>

          <NewsPanel ticker={quote.ticker} />
        </main>
      )}
    </>
  );
}
