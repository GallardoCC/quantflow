import type { OFVolumeProfile } from "../api";

/** Perfil de volumen horizontal: barras por nivel de precio con split compra/venta,
 *  POC resaltado y banda del Value Area (VAL–VAH). SVG puro. */
export function VolumeProfileChart({ vp, height = 360 }: { vp: OFVolumeProfile; height?: number }) {
  const bins = vp.bins;
  if (!bins.length) return <div className="of-sub">Sin datos de perfil.</div>;
  const W = 560, H = height, padL = 64, padR = 12, padT = 8, padB = 8;
  const maxVol = Math.max(...bins.map((b) => b.volume), 1);
  const n = bins.length;
  const rowH = (H - padT - padB) / n;
  const plotW = W - padL - padR;

  return (
    <div className="of-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {bins.map((b, i) => {
          const y = padT + i * rowH;
          const buyW = (b.buyVol / maxVol) * plotW;
          const sellW = (b.sellVol / maxVol) * plotW;
          const inVA = b.inValueArea;
          return (
            <g key={b.price} opacity={inVA ? 1 : 0.55}>
              {inVA && <rect x={0} y={y} width={padL - 6} height={rowH} fill="color-mix(in srgb, var(--accent) 8%, transparent)" />}
              <rect x={padL} y={y + rowH * 0.12} width={sellW} height={rowH * 0.76} fill="var(--neg)" rx={1} />
              <rect x={padL + sellW} y={y + rowH * 0.12} width={buyW} height={rowH * 0.76} fill="var(--pos)" rx={1} />
              {b.isPOC && (
                <>
                  <rect x={padL} y={y} width={plotW} height={rowH} fill="none" stroke="var(--accent)" strokeWidth={1.2} />
                  <text x={W - padR} y={y + rowH * 0.7} textAnchor="end" fontSize={9} fill="var(--accent)" fontWeight={700}>POC</text>
                </>
              )}
              {(i % Math.ceil(n / 12) === 0 || b.isPOC) && (
                <text x={padL - 8} y={y + rowH * 0.72} textAnchor="end" fontSize={9}
                  fill={b.isPOC ? "var(--accent)" : "var(--text-3)"} fontVariant="tabular-nums">
                  {b.price}
                </text>
              )}
              {b.node && (
                <text x={padL + 4} y={y + rowH * 0.72} fontSize={8}
                  fill={b.node === "HVN" ? "var(--text-2)" : "var(--text-3)"} fontWeight={600}>{b.node}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="of-legend">
        <span><i className="of-dot" style={{ background: "var(--pos)" }} /> Volumen comprador</span>
        <span><i className="of-dot" style={{ background: "var(--neg)" }} /> Volumen vendedor</span>
        <span><i className="of-dot" style={{ background: "var(--accent)" }} /> POC {vp.poc}</span>
        <span>Value Area: {vp.val} – {vp.vah}</span>
      </div>
    </div>
  );
}
