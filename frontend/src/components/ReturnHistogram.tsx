// Histograma de retornos diarios (%) con curva normal teórica superpuesta —
// revela colas gruesas / asimetría frente a la gaussiana. SVG puro.
import type { GarchHistBin } from "../api";

interface Props {
  bins: GarchHistBin[];
  returns: number[];   // retornos crudos (%) para μ y σ de la normal
}

const W = 900, H = 280;
const P = { t: 16, r: 18, b: 38, l: 46 };
const pw = W - P.l - P.r;
const ph = H - P.t - P.b;

export function ReturnHistogram({ bins, returns }: Props) {
  if (!bins.length) return null;

  const maxPct = Math.max(...bins.map((b) => b.pct), 0.01);
  const xMin = bins[0].mid;
  const xMax = bins[bins.length - 1].mid;
  const xRange = xMax - xMin || 1;
  const bw = pw / bins.length;

  const xs = (v: number) => P.l + ((v - xMin) / xRange) * pw;
  const ys = (pct: number) => P.t + ph - (pct / maxPct) * ph;

  // Normal teórica (misma μ y σ) escalada a % por bin.
  const n = returns.length;
  const mu = returns.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(returns.reduce((a, b) => a + (b - mu) ** 2, 0) / (n - 1)) || 1;
  const binWidth = bins.length > 1 ? bins[1].mid - bins[0].mid : 1;
  const normalPctAt = (x: number) => {
    const z = (x - mu) / sd;
    const pdf = Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
    return pdf * binWidth * 100; // densidad → % esperado en un bin
  };

  const SAMPLES = 80;
  const normalPath = Array.from({ length: SAMPLES + 1 }, (_, i) => {
    const x = xMin + (xRange * i) / SAMPLES;
    return `${i === 0 ? "M" : "L"}${xs(x).toFixed(1)},${ys(normalPctAt(x)).toFixed(1)}`;
  }).join(" ");

  const zeroX = xMin <= 0 && xMax >= 0 ? xs(0) : null;
  const xTicks = Array.from({ length: 7 }, (_, i) => xMin + (xRange * i) / 6);
  const yTicks = Array.from({ length: 4 }, (_, i) => (maxPct * i) / 3);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="gk-hist-svg"
         aria-label="Histograma de retornos">
      {/* rejilla horizontal */}
      {yTicks.map((p, i) => (
        <line key={i} x1={P.l} y1={ys(p)} x2={W - P.r} y2={ys(p)}
              stroke="rgba(255,255,255,0.04)" />
      ))}
      {/* barras */}
      {bins.map((b, i) => {
        const x = xs(b.mid) - bw / 2 + 0.5;
        const y = ys(b.pct);
        const neg = b.mid < 0;
        return (
          <rect key={i} x={x.toFixed(1)} y={y.toFixed(1)}
                width={Math.max(bw - 1, 0.5).toFixed(1)}
                height={(P.t + ph - y).toFixed(1)} rx="1"
                fill={neg ? "rgba(240,86,107,0.55)" : "rgba(46,189,133,0.55)"} />
        );
      })}
      {/* curva normal */}
      <path d={normalPath} fill="none" stroke="#7c9bff" strokeWidth="2"
            strokeDasharray="4,3" opacity="0.9" />
      {/* eje cero */}
      {zeroX != null && (
        <line x1={zeroX} y1={P.t} x2={zeroX} y2={P.t + ph}
              stroke="rgba(255,255,255,0.22)" strokeDasharray="3,3" />
      )}
      {/* ejes */}
      {yTicks.map((p, i) => (
        <text key={i} x={P.l - 6} y={ys(p) + 3} textAnchor="end"
              fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">
          {p.toFixed(1)}%
        </text>
      ))}
      {xTicks.map((v, i) => (
        <text key={i} x={xs(v)} y={H - 8} textAnchor="middle"
              fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">
          {v >= 0 ? "+" : ""}{v.toFixed(1)}
        </text>
      ))}
    </svg>
  );
}
