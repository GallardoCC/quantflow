import { createContext, useContext, useState, type ReactNode } from "react";
import type { OFTimeframe, OFSession } from "../../api";

/** Parámetros globales compartidos por todos los módulos de Order Flow:
 *  timeframe, sesión y modo live. El ticker vive en TickerContext (global app). */
interface OFParams {
  tf: OFTimeframe;
  session: OFSession;
  live: boolean;
  setTf: (tf: OFTimeframe) => void;
  setSession: (s: OFSession) => void;
  setLive: (v: boolean) => void;
}

const Ctx = createContext<OFParams | null>(null);

export function OFParamsProvider({ children }: { children: ReactNode }) {
  const [tf, setTf] = useState<OFTimeframe>("1D");
  const [session, setSession] = useState<OFSession>("24h");
  const [live, setLive] = useState(false);
  return (
    <Ctx.Provider value={{ tf, session, live, setTf, setSession, setLive }}>
      {children}
    </Ctx.Provider>
  );
}

export function useOFParams(): OFParams {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOFParams fuera de OFParamsProvider");
  return v;
}
