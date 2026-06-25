import type { OFLiquidity } from "../api";

/** Escalera de liquidez tipo Bookmap: profundidad de bids (verde) y asks (rojo)
 *  por nivel de precio, con intensidad por tamaño. Orderbook real en cripto;
 *  aproximación por volumen-en-precio en acciones. SVG puro. */
export function LiquidityHeatmap({ liq, height = 380 }: { liq: OFLiquidity; height?: number }) {
  const asks = [...liq.asks].sort((a, b) => b.price - a.price);
  const bids = [...liq.bids].sort((a, b) => b.price - a.price);
  const rows = [...asks, ...bids];
  if (!rows.length) return <div className="of-sub">Sin datos de liquidez.</div>;
  const maxSize = Math.max(...rows.map((r) => r.size), 1e-9);
  const W = 560, padL = 70, padR = 60;
  const rowH = Math.max(8, Math.min(20, (height - 20) / rows.length));
  const H = rows.length * rowH + 12;
  const plotW = W - padL - padR;
  const wallSet = new Set(liq.walls.map((w) => w.price));

  return (
    <div className="of-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {rows.map((r, i) => {
          const side = i < asks.length ? "ask" : "bid";
          const w = (r.size / maxSize) * plotW;
          const y = 6 + i * rowH;
          const color = side === "ask" ? "var(--neg)" : "var(--pos)";
          const isWall = wallSet.has(r.price);
          return (
            <g key={`${side}-${r.price}-${i}`}>
              <rect x={padL} y={y} width={w} height={rowH - 1.5} fill={color}
                opacity={0.25 + 0.65 * (r.size / maxSize)} rx={1} />
              {isWall && <rect x={padL} y={y} width={w} height={rowH - 1.5} fill="none" stroke="var(--accent)" strokeWidth={1.2} rx={1} />}
              <text x={padL - 6} y={y + rowH * 0.72} textAnchor="end" fontSize={9}
                fill={isWall ? "var(--accent)" : "var(--text-3)"} fontWeight={isWall ? 700 : 400}>{r.price}</text>
              <text x={padL + w + 5} y={y + rowH * 0.72} fontSize={9} fill="var(--text-3)">
                {r.size >= 1000 ? (r.size / 1000).toFixed(1) + "k" : r.size.toFixed(2)}
              </text>
            </g>
          );
        })}
        {/* línea del mid/precio entre asks y bids */}
        <line x1={0} y1={6 + asks.length * rowH} x2={W} y2={6 + asks.length * rowH}
          stroke="var(--accent)" strokeWidth={1} strokeDasharray="4 3" />
      </svg>
      <div className="of-legend">
        <span><i className="of-dot" style={{ background: "var(--neg)" }} /> Oferta (asks)</span>
        <span><i className="of-dot" style={{ background: "var(--pos)" }} /> Demanda (bids)</span>
        <span><i className="of-dot" style={{ border: "1.5px solid var(--accent)", background: "transparent" }} /> Muro de liquidez</span>
        {liq.spread != null && <span>Spread {liq.spread}</span>}
      </div>
    </div>
  );
}
