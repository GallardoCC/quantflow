import type { OFDelta2 } from "../../api";

/** Delta / CVD: histograma de delta por barra (verde/rojo) + línea de CVD acumulado,
 *  con divergencias precio↔CVD marcadas y zonas de acumulación sombreadas. */
export function DeltaCVDView({ d }: { d: OFDelta2 }) {
  const bars = d.bars;
  if (!bars.length) return <div className="ofx-empty">Sin datos de delta.</div>;

  const W = 860, H = 360, padL = 8, padR = 56, padT = 14, padB = 20;
  const n = bars.length;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const histH = plotH * 0.34, cvdH = plotH * 0.58, gap = plotH * 0.08;

  const maxAbsDelta = Math.max(...bars.map((b) => Math.abs(b.delta)), 1);
  const cvds = bars.map((b) => b.cvd);
  const cMin = Math.min(...cvds), cMax = Math.max(...cvds);
  const cRange = cMax - cMin || 1;
  const bw = plotW / n;

  const t0 = bars[0].t, t1 = bars[n - 1].t, tSpan = t1 - t0 || 1;
  const xOf = (t: number) => padL + ((t - t0) / tSpan) * plotW;

  const cvdY = (v: number) => padT + (1 - (v - cMin) / cRange) * cvdH;
  const cvdPath = bars.map((b, i) => `${i ? "L" : "M"}${padL + i * bw + bw / 2},${cvdY(b.cvd)}`).join(" ");

  const histTop = padT + cvdH + gap;
  const zeroY = histTop + histH / 2;

  return (
    <div className="ofx-delta">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {/* zonas de acumulación */}
        {d.accumulationZones.map((z, i) => (
          <rect key={"z" + i} x={xOf(z.tStart)} y={padT} width={Math.max(2, xOf(z.tEnd) - xOf(z.tStart))}
            height={cvdH} fill="var(--accent-dim)" opacity={0.6} />
        ))}

        {/* CVD línea */}
        <path d={cvdPath} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
        <text x={W - padR + 4} y={cvdY(cMax) + 4} fontSize={9} fill="var(--text-3)">{Math.round(cMax).toLocaleString()}</text>
        <text x={W - padR + 4} y={cvdY(cMin) + 4} fontSize={9} fill="var(--text-3)">{Math.round(cMin).toLocaleString()}</text>
        <text x={padL} y={padT - 3} fontSize={9} fill="var(--text-3)">CVD acumulado</text>

        {/* divergencias */}
        {d.divergences.map((dv, i) => (
          <g key={"d" + i}>
            <circle cx={xOf(dv.t)} cy={cvdY(bars.find((b) => b.t === dv.t)?.cvd ?? 0)} r={4}
              fill="none" stroke={dv.type === "bull" ? "var(--pos)" : "var(--neg)"} strokeWidth={1.6} />
            <text x={xOf(dv.t)} y={cvdY(bars.find((b) => b.t === dv.t)?.cvd ?? 0) - 8} fontSize={8}
              textAnchor="middle" fill={dv.type === "bull" ? "var(--pos)" : "var(--neg)"}>
              {dv.type === "bull" ? "▲" : "▼"}
            </text>
          </g>
        ))}

        {/* histograma de delta */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border)" strokeWidth={1} />
        <text x={padL} y={histTop - 2} fontSize={9} fill="var(--text-3)">Δ por barra</text>
        {bars.map((b, i) => {
          const h = (Math.abs(b.delta) / maxAbsDelta) * (histH / 2);
          const x = padL + i * bw + bw * 0.15;
          return <rect key={i} x={x} y={b.delta >= 0 ? zeroY - h : zeroY} width={bw * 0.7} height={h}
            fill={b.delta >= 0 ? "var(--pos)" : "var(--neg)"} rx={0.5} />;
        })}
      </svg>

      <div className="ofx-legend">
        <span><i style={{ background: "var(--accent)" }} /> CVD</span>
        <span><i style={{ background: "var(--pos)" }} /> delta+</span>
        <span><i style={{ background: "var(--neg)" }} /> delta−</span>
        {d.divergences.length > 0 && <span>{d.divergences.length} divergencia(s)</span>}
        {d.accumulationZones.length > 0 && <span><i style={{ background: "var(--accent-dim)" }} /> acumulación ({d.accumulationZones.length})</span>}
        <span>Δ total {d.totalDelta >= 0 ? "+" : ""}{Math.round(d.totalDelta).toLocaleString()}</span>
      </div>
    </div>
  );
}
