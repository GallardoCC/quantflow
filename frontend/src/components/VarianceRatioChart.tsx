// Razón de varianzas VR(q) vs. horizonte q. La referencia 1.0 = paseo aleatorio
// (mercado eficiente). VR>1 sugiere momentum; VR<1, reversión a la media.
import type { AnomVRRow } from "../api";

interface Props { rows: AnomVRRow[]; }

const W = 760, H = 240;
const P = { t: 18, r: 18, b: 34, l: 46 };
const pw = W - P.l - P.r, ph = H - P.t - P.b;

export function VarianceRatioChart({ rows }: Props) {
  if (!rows.length) return null;
  const qs = rows.map((r) => r.q);
  const xMinL = Math.log2(Math.min(...qs)), xMaxL = Math.log2(Math.max(...qs));
  const xR = xMaxL - xMinL || 1;
  const vals = rows.map((r) => r.vr);
  let yMin = Math.min(...vals, 1), yMax = Math.max(...vals, 1);
  const pad = (yMax - yMin) * 0.25 || 0.3;
  yMin -= pad; yMax += pad;
  const yR = yMax - yMin;

  const xs = (q: number) => P.l + ((Math.log2(q) - xMinL) / xR) * pw;
  const ys = (v: number) => P.t + ph - ((v - yMin) / yR) * ph;
  const path = rows.map((r, i) => `${i ? "L" : "M"}${xs(r.q).toFixed(1)},${ys(r.vr).toFixed(1)}`).join(" ");
  const oneY = ys(1);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yR * i) / 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" aria-label="Razón de varianzas">
      {yTicks.map((v, i) => (
        <text key={i} x={P.l - 6} y={ys(v) + 3} textAnchor="end" fontSize="9.5" fill="var(--muted)" fontFamily="var(--mono)">
          {v.toFixed(2)}
        </text>
      ))}
      {/* referencia 1.0 = paseo aleatorio */}
      <line x1={P.l} y1={oneY} x2={W - P.r} y2={oneY} stroke="rgba(46,189,133,0.5)" strokeDasharray="5,4" />
      <text x={W - P.r} y={oneY - 5} textAnchor="end" fontSize="9.5" fill="var(--pos)" fontFamily="var(--mono)">
        1.0 — paseo aleatorio
      </text>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.4" />
      {rows.map((r, i) => (
        <g key={i}>
          <circle cx={xs(r.q)} cy={ys(r.vr)} r={r.reject ? 6 : 4.5}
                  fill={r.reject ? "var(--neg)" : "var(--accent)"} stroke="var(--bg)" strokeWidth="1.5" />
          <text x={xs(r.q)} y={H - 9} textAnchor="middle" fontSize="10" fill="var(--text-2)" fontFamily="var(--mono)">
            q={r.q}
          </text>
        </g>
      ))}
    </svg>
  );
}
