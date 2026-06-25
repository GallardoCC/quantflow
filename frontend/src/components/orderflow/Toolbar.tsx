import { useOFParams } from "./context";
import { useTicker } from "../../TickerContext";
import { SearchBox } from "../SearchBox";
import type { OFTimeframe, OFSession, OFTier } from "../../api";
import { TierBadge } from "./Badges";

const TFS: OFTimeframe[] = ["1D", "1W", "1M", "1Y", "5Y"];
const SESSIONS: OFSession[] = ["Asia", "London", "NY", "RTH", "24h"];

/** Barra superior común a todos los módulos: ticker · timeframe · sesión · live · tier. */
export function OFToolbar({ tier, busy, onRefresh }: { tier?: OFTier; busy?: boolean; onRefresh?: () => void }) {
  const { ticker, setTicker } = useTicker();
  const { tf, session, live, setTf, setSession, setLive } = useOFParams();

  return (
    <div className="ofx-toolbar">
      <div className="ofx-tb-left">
        <SearchBox onSelect={setTicker} />
        <span className="ofx-tk">{ticker}</span>
        {tier && <TierBadge tier={tier} />}
      </div>

      <div className="ofx-tb-mid">
        <div className="ofx-seg" role="group" aria-label="Timeframe">
          {TFS.map((x) => (
            <button key={x} className={x === tf ? "on" : ""} onClick={() => setTf(x)}>{x}</button>
          ))}
        </div>
        <div className="ofx-seg" role="group" aria-label="Sesión">
          {SESSIONS.map((x) => (
            <button key={x} className={x === session ? "on" : ""} onClick={() => setSession(x)}>{x}</button>
          ))}
        </div>
      </div>

      <div className="ofx-tb-right">
        <button className={`ofx-live ${live ? "on" : ""}`} onClick={() => setLive(!live)}
          title="Refresco automático periódico">
          <span className="ofx-live-dot" /> {live ? "LIVE" : "live"}
        </button>
        <button className="ofx-refresh" onClick={onRefresh} disabled={busy}>
          {busy ? "…" : "↻"}
        </button>
      </div>
    </div>
  );
}
