/**
 * Ticker global compartido por TODAS las secciones.
 *
 * El buscador de la barra superior fija el ticker y todas las páginas
 * (Técnicos, Fundamental, Rev. Media, GARCH, Griegas, Anomalías, Monte Carlo)
 * lo leen vía `useTicker()`. Cualquier buscador interno de una página también
 * escribe aquí, de modo que el cambio se propaga a la barra superior y al resto.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

interface TickerCtx {
  ticker: string;
  setTicker: (t: string) => void;
}

const Ctx = createContext<TickerCtx>({ ticker: "AAPL", setTicker: () => {} });

export function TickerProvider({ children }: { children: ReactNode }) {
  const [ticker, setTickerRaw] = useState("AAPL");
  // Normaliza a mayúsculas y descarta vacíos.
  const setTicker = (t: string) => {
    const v = (t || "").trim().toUpperCase();
    if (v) setTickerRaw(v);
  };
  return <Ctx.Provider value={{ ticker, setTicker }}>{children}</Ctx.Provider>;
}

export function useTicker(): TickerCtx {
  return useContext(Ctx);
}
