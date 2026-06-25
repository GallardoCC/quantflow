// Mini-gráfico SVG de una griega (o del precio) a lo largo del precio del
// subyacente, con marca del spot actual. Reutilizable para Δ, Γ, Vega, Θ.
interface Pt { spot: number; v: number; }
interface Props {
  points: Pt[];
  spot: number;
  color: string;
  label: string;
  fmt?: (v: number) => string;
}

const W = 360, H = 150;
const P = { t: 14, r: 12, b: 22, l: 40 };
const pw = W - P.l - P.r;
const ph = H - P.t - P.b;

export function GreekCurve({ points, spot, color, label, fmt }: Props) {
  if (points.length < 2) return null;
  const f = fmt ?? ((v: number) => v.toFixed(2));
  const xMin = points[0].spot, xMax = points[points.length - 1].spot;
  const xR = xMax - xMin || 1;
  let yMin = Math.min(...points.map((p) => p.v));
  let yMax = Math.max(...points.map((p) => p.v));
  const pad = (yMax - yMin) * 0.1 || Math.abs(yMax) * 0.1 || 1;
  yMin -= pad; yMax += pad;
  const yR = yMax - yMin || 1;

  const xs = (v: number) => P.l + ((v - xMin) / xR) * pw;
  const ys = (v: number) => P.t + ph - ((v - yMin) / yR) * ph;
  const d = points.map((p, i) => `${i ? "L" : "M"}${xs(p.spot).toFixed(1)},${ys(p.v).toFixed(1)}`).join(" ");
  const zeroIn = yMin <= 0 && yMax >= 0;

  return (
    <div className="og-mini">
      <div className="og-mini-h"><span className="og-mini-dot" style={{ background: color }} />{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {zeroIn && <line x1={P.l} y1={ys(0)} x2={W - P.r} y2={ys(0)} stroke="rgba(255,255,255,0.12)" strokeDasharray="3,3" />}
        <line x1={xs(spot)} y1={P.t} x2={xs(spot)} y2={P.t + ph} stroke="rgba(255,255,255,0.3)" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" />
        <text x={P.l - 5} y={ys(yMax - pad) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{f(yMax - pad)}</text>
        <text x={P.l - 5} y={ys(yMin + pad) + 3} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--mono)">{f(yMin + pad)}</text>
        <text x={xs(spot)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-2)" fontFamily="var(--mono)">spot</text>
      </svg>
    </div>
  );
}
