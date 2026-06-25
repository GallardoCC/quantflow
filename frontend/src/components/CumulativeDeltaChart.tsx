import type { OFDelta } from "../api";

/** Delta acumulada (línea) + delta por bucket (barras). Revela si la presión
 *  agregada de compra/venta confirma o diverge del precio. SVG puro. */
export function CumulativeDeltaChart({ delta, height = 240 }: { delta: OFDelta; height?: number }) {
  const bars = delta.bars;
  if (bars.length < 2) return <div className="of-sub">Sin datos de delta.</div>;
  const W = 760, H = height, padT = 12, padB = 18, padL = 8, padR = 8;
  const n = bars.length;
  const plotW = W - padL - padR;
  const barAreaH = (H - padT - padB) * 0.42;
  const lineAreaH = (H - padT - padB) * 0.58;
  const lineTop = padT;

  const maxAbsDelta = Math.max(...bars.map((b) => Math.abs(b.delta)), 1);
  const cums = bars.map((b) => b.cumDelta);
  const cMin = Math.min(...cums, 0), cMax = Math.max(...cums, 0);
  const cRange = cMax - cMin || 1;
  const bw = plotW / n;

  const yLine = (v: number) => lineTop + (cMax - v) / cRange * lineAreaH;
  const path = bars.map((b, i) => `${i === 0 ? "M" : "L"} ${padL + i * bw + bw / 2} ${yLine(b.cumDelta)}`).join(" ");
  const zeroY = yLine(0);
  const barBase = lineTop + lineAreaH + barAreaH;

  return (
    <div className="of-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        {/* línea cero del cumulativo */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="var(--border)" strokeDasharray="3 3" />
        {/* barras de delta por bucket */}
        {bars.map((b, i) => {
          const h = (Math.abs(b.delta) / maxAbsDelta) * barAreaH;
          const x = padL + i * bw + bw * 0.15;
          const up = b.delta >= 0;
          return <rect key={i} x={x} y={up ? barBase - h : barBase} width={bw * 0.7} height={h}
            fill={up ? "var(--pos)" : "var(--neg)"} opacity={0.8} rx={1} />;
        })}
        <line x1={padL} y1={barBase} x2={W - padR} y2={barBase} stroke="var(--border)" />
        {/* curva de delta acumulada */}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {bars.map((b, i) => (
          <circle key={i} cx={padL + i * bw + bw / 2} cy={yLine(b.cumDelta)} r={1.6} fill="var(--accent)" />
        ))}
      </svg>
      <div className="of-legend">
        <span><i className="of-dot" style={{ background: "var(--accent)" }} /> Delta acumulada (final {delta.totalDelta})</span>
        <span><i className="of-dot" style={{ background: "var(--pos)" }} /> Delta+ </span>
        <span><i className="of-dot" style={{ background: "var(--neg)" }} /> Delta−</span>
        <span>Máx {delta.maxCum} · Mín {delta.minCum}</span>
      </div>
    </div>
  );
}
