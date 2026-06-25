import { useCallback, useEffect, useRef, useState } from "react";
import { useTicker } from "../../TickerContext";
import { useOFParams } from "./context";
import type { OFTimeframe, OFSession } from "../../api";

/** Hook común de carga para módulos de Order Flow. Reacciona a ticker/tf/session,
 *  soporta refresco manual y modo live (polling cada 15s). */
export function useOFData<T>(
  fetcher: (ticker: string, tf: OFTimeframe, session: OFSession) => Promise<T>,
  liveMs = 15000,
) {
  const { ticker } = useTicker();
  const { tf, session, live } = useOFParams();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const run = useCallback(() => {
    if (!ticker.trim()) return;
    const id = ++reqId.current;
    setLoading(true); setError(null);
    fetcher(ticker, tf, session)
      .then((r) => { if (id === reqId.current) { setData(r); setLoading(false); } })
      .catch((e: Error) => { if (id === reqId.current) { setError(e.message); setLoading(false); } });
  }, [ticker, tf, session, fetcher]);

  useEffect(() => { run(); }, [run]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(run, liveMs);
    return () => clearInterval(t);
  }, [live, run, liveMs]);

  return { data, loading, error, refresh: run };
}
