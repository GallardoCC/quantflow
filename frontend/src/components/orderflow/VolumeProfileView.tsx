import { useState } from "react";
import type { OFVolumeProfile2 } from "../../api";

/** Volume Profile horizontal: barras split compra/venta por nivel, banda Value Area,
 *  POC resaltado, marcas HVN/LVN y naked POCs. SVG integrado al tema. */
export function VolumeProfileView({ vp }: { vp: OFVolumeProfile2 }) {
  const [hover, setHover] = useState<number | null>(null);
  const bins = vp.bins;
  if (!bins.length) return <div className="ofx-empty">Sin datos de perfil.</div>;

  const W = 640, padL = 70, padR = 16, padT = 8, padB = 8;
  const n = bins.length;
  const rowH = Math.max(6, Math.min(22, 520 / n));
  const H = padT + padB + n * rowH;
  const plotW = W - padL - padR;
  const maxVol = Math.max(...bins.map((b) => b.vol), 1);
  const naked = new Set(vp.nakedPocs.map((p) => p.toFixed(6)));

  return (
    <div className="ofx-vp">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin meet" style={{ width: "100%", height: "auto" }}>
        {bins.map((b, i) => {
          const y = padT + i * rowH;
          const buyW = (b.buyVol / maxVol) * plotW;
          const sellW = (b.sellVol / maxVol) * plotW;
          const inVA = vp.val != null && vp.vah != null && b.price >= vp.val && b.price <= vp.vah;
          const isPOC = b.price === vp.poc;
          const isHVN = vp.hvn.includes(b.price);
          const isLVN = vp.lvn.includes(b.price);
          const isNaked = naked.has(b.price.toFixed(6));
          return (
            <g key={b.price} opacity={inVA ? 1 : 0.5}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {inVA && <rect x={0} y={y} width={W} height={rowH} fill="var(--accent-dim)" />}
              <rect x={padL} y={y + rowH * 0.14} width={sellW} height={rowH * 0.72} fill="var(--neg)" rx={1} />
              <rect x={padL + sellW} y={y + rowH * 0.14} width={buyW} height={rowH * 0.72} fill="var(--pos)" rx={1} />
              {isPOC && <rect x={padL} y={y} width={plotW} height={rowH} fill="none" stroke="var(--accent)" strokeWidth={1.4} />}
              {(i % Math.ceil(n / 16) === 0 || isPOC) && (
                <text x={padL - 8} y={y + rowH * 0.74} textAnchor="end" fontSize={9}
                  fill={isPOC ? "var(--accent)" : "var(--text-3)"}>{b.price}</text>
              )}
              {isPOC && <text x={W - padR} y={y + rowH * 0.74} textAnchor="end" fontSize={9} fontWeight={700} fill="var(--accent)">POC</text>}
              {isHVN && !isPOC && <text x={padL + 3} y={y + rowH * 0.74} fontSize={7.5} fontWeight={600} fill="var(--text-2)">HVN</text>}
              {isLVN && <text x={padL + 3} y={y + rowH * 0.74} fontSize={7.5} fill="var(--text-3)">LVN</text>}
              {isNaked && <circle cx={W - padR - 4} cy={y + rowH / 2} r={2.5} fill="#caa24a" />}
            </g>
          );
        })}
      </svg>

      {hover != null && bins[hover] && (
        <div className="ofx-vp-tip">
          <b>{bins[hover].price}</b> · vol {Math.round(bins[hover].vol).toLocaleString()} ·
          <span style={{ color: "var(--pos)" }}> compra {Math.round(bins[hover].buyVol).toLocaleString()}</span> /
          <span style={{ color: "var(--neg)" }}> venta {Math.round(bins[hover].sellVol).toLocaleString()}</span>
        </div>
      )}

      <div className="ofx-legend">
        <span><i style={{ background: "var(--pos)" }} /> compra</span>
        <span><i style={{ background: "var(--neg)" }} /> venta</span>
        <span><i style={{ background: "var(--accent)" }} /> POC {vp.poc ?? "—"}</span>
        <span>VA {vp.val ?? "—"}–{vp.vah ?? "—"}</span>
        {vp.nakedPocs.length > 0 && <span><i style={{ background: "#caa24a" }} /> naked POC ({vp.nakedPocs.length})</span>}
      </div>
    </div>
  );
}
