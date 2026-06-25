// Perfil de riesgo de la opción: P/L al vencimiento (intrínseco − prima) vs.
// valor teórico actual, a lo largo del precio del subyacente. Marca el spot, el
// strike y el break-even. SVG puro.
import type { OptionSpotPoint } from "../api";

interface Props {
  curve: OptionSpotPoint[];
  spot: number;
  strike: number;
  breakeven: number;
}

const W = 900, H = 320;
const P = { t: 18, r: 20, b: 40, l: 60 };
const pw = W - P.l - P.r;
const ph = H - P.t - P.b;

export function OptionRiskProfile({ curve, spot, strike, breakeven }: Props) {
  if (curve.length < 2) return null;

  const xMin = curve[0].spot, xMax = curve[curve.length - 1].spot;
  const xR = xMax - xMin || 1;
  const vals = curve.flatMap((p) => [p.value, p.payoff]);
  let yMin = Math.min(...vals), yMax = Math.max(...vals);
  const pad = (yMax - yMin) * 0.08 || 1;
  yMin -= pad; yMax += pad;
  const yR = yMax - yMin || 1;

  const xs = (v: number) => P.l + ((v - xMin) / xR) * pw;
  const ys = (v: number) => P.t + ph - ((v - yMin) / yR) * ph;

  const line = (key: "value" | "payoff") =>
    curve.map((p, i) => `${i ? "L" : "M"}${xs(p.spot).toFixed(1)},${ys(p[key]).toFixed(1)}`).join(" ");

  const zeroY = ys(0);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yR * i) / 4);
  const xTicks = Array.from({ length: 7 }, (_, i) => xMin + (xR * i) / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className=" og-svg" aria-label="Perfil de riesgo">
      <defs>
        <linearGradient id="og-pos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2ebd85" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#2ebd85" stopOpacity="0" />
        </linearGradient>
      </defs>
      {yTicks.map((v, i) => (
        <line key={i} x1={P.l} y1={ys(v)} x2={W - P.r} y2={ys(v)} stroke="rgba(255,255,255,0.04)" />
      ))}
      {/* línea de break-even (P/L = 0) */}
      <line x1={P.l} y1={zeroY} x2={W - P.r} y2={zeroY} stroke="rgba(255,255,255,0.25)" strokeDasharray="4,4" />
      <text x={P.l + 4} y={zeroY - 5} fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">P/L 0</text>

      {/* área de ganancia bajo el payoff por encima de 0 */}
      <path d={`${line("payoff")} L${xs(xMax).toFixed(1)},${zeroY.toFixed(1)} L${xs(xMin).toFixed(1)},${zeroY.toFixed(1)} Z`}
            fill="url(#og-pos)" opacity="0.6" />

      {/* strike */}
      <line x1={xs(strike)} y1={P.t} x2={xs(strike)} y2={P.t + ph} stroke="rgba(224,169,59,0.5)" strokeDasharray="3,3" />
      <text x={xs(strike)} y={P.t + 10} fontSize="10" fill="var(--amber)" fontFamily="var(--mono)" textAnchor="middle">K {strike}</text>
      {/* break-even */}
      <line x1={xs(breakeven)} y1={P.t} x2={xs(breakeven)} y2={P.t + ph} stroke="rgba(124,155,255,0.5)" strokeDasharray="2,3" />
      {/* spot actual */}
      <line x1={xs(spot)} y1={P.t} x2={xs(spot)} y2={P.t + ph} stroke="rgba(255,255,255,0.35)" />
      <text x={xs(spot)} y={H - 24} fontSize="10" fill="var(--text-2)" fontFamily="var(--mono)" textAnchor="middle">spot</text>

      {/* curvas */}
      <path d={line("payoff")} fill="none" stroke="#7c9bff" strokeWidth="1.6" strokeDasharray="5,4" />
      <path d={line("value")} fill="none" stroke="#5b82f0" strokeWidth="2.4" />

      {yTicks.map((v, i) => (
        <text key={i} x={P.l - 6} y={ys(v) + 3} textAnchor="end" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">
          {v >= 0 ? "+" : ""}{v.toFixed(1)}
        </text>
      ))}
      {xTicks.map((v, i) => (
        <text key={i} x={xs(v)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)" fontFamily="var(--mono)">
          {v.toFixed(0)}
        </text>
      ))}
    </svg>
  );
}
