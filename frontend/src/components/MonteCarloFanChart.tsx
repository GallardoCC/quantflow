import type { MonteCarloFan } from "../api";

interface Props {
  fan: MonteCarloFan;
  currentPrice: number;
}

const W = 900, H = 300;
const P = { t: 20, r: 24, b: 46, l: 76 };
const pw = W - P.l - P.r;
const ph = H - P.t - P.b;

function fmtPrice(v: number): string {
  if (v >= 10000) return `$${(v / 1000).toFixed(1)}k`;
  if (v >= 1000)  return `$${(v / 1000).toFixed(2)}k`;
  if (v >= 100)   return `$${v.toFixed(0)}`;
  return `$${v.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function MonteCarloFanChart({ fan, currentPrice }: Props) {
  const n = fan.dates.length;
  if (n < 2) return null;

  const allVals = [...fan.p5, ...fan.p95];
  const yMin = Math.min(...allVals) * 0.97;
  const yMax = Math.max(...allVals) * 1.03;
  const yRange = yMax - yMin;

  const xs = (i: number) => P.l + (i / (n - 1)) * pw;
  const ys = (v: number) => P.t + ph - ((v - yMin) / yRange) * ph;

  function polyPoints(top: number[], bot: number[]): string {
    const fwd = top.map((v, i) => `${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
    const rev = [...bot]
      .reverse()
      .map((v, i) => `${xs(n - 1 - i).toFixed(1)},${ys(v).toFixed(1)}`)
      .join(" ");
    return `${fwd} ${rev}`;
  }

  const medPath = fan.p50
    .map((v, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`)
    .join(" ");

  const curY = ys(currentPrice);

  // Y-axis: 5 evenly-spaced ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (yRange * i) / 4);

  // X-axis: 7 sampled labels
  const N_LABELS = 7;
  const xIdxs = Array.from({ length: N_LABELS }, (_, i) =>
    Math.round((i * (n - 1)) / (N_LABELS - 1))
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      className="mc-fan-svg"
      aria-label="Monte Carlo fan chart"
    >
      <defs>
        <linearGradient id="mc-grad-outer" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b82f0" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#5b82f0" stopOpacity="0.03" />
        </linearGradient>
        <linearGradient id="mc-grad-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b82f0" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#5b82f0" stopOpacity="0.10" />
        </linearGradient>
        <filter id="mc-blur">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>

      {/* Horizontal grid */}
      {yTicks.map((v, i) => (
        <line
          key={i}
          x1={P.l} y1={ys(v).toFixed(1)}
          x2={W - P.r} y2={ys(v).toFixed(1)}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1"
        />
      ))}

      {/* Current price reference */}
      <line
        x1={P.l} y1={curY.toFixed(1)}
        x2={W - P.r} y2={curY.toFixed(1)}
        stroke="rgba(255,255,255,0.20)"
        strokeWidth="1"
        strokeDasharray="5,4"
      />
      <text
        x={(W - P.r + 4).toFixed(1)}
        y={(curY + 4).toFixed(1)}
        fontSize="10" fill="rgba(255,255,255,0.45)"
        fontFamily="var(--mono)" textAnchor="start"
      >
        now
      </text>

      {/* Outer band: P5 – P95 (blurred for glow) */}
      <polygon
        points={polyPoints(fan.p95, fan.p5)}
        fill="url(#mc-grad-outer)"
        filter="url(#mc-blur)"
      />
      <polygon
        points={polyPoints(fan.p95, fan.p5)}
        fill="url(#mc-grad-outer)"
      />

      {/* Inner band: P25 – P75 */}
      <polygon
        points={polyPoints(fan.p75, fan.p25)}
        fill="url(#mc-grad-inner)"
      />

      {/* Median line with glow */}
      <path
        d={medPath} fill="none"
        stroke="rgba(91,130,240,0.35)" strokeWidth="6" strokeLinecap="round"
        filter="url(#mc-blur)"
      />
      <path
        d={medPath} fill="none"
        stroke="#5b82f0" strokeWidth="2" strokeLinecap="round"
      />

      {/* Origin dot */}
      <circle
        cx={xs(0).toFixed(1)} cy={ys(fan.p50[0]).toFixed(1)}
        r="4" fill="#5b82f0"
      />
      {/* End dot on median */}
      <circle
        cx={xs(n - 1).toFixed(1)} cy={ys(fan.p50[n - 1]).toFixed(1)}
        r="3" fill="#5b82f0" fillOpacity="0.6"
      />

      {/* Y-axis labels */}
      {yTicks.map((v, i) => (
        <text
          key={i}
          x={(P.l - 8).toFixed(1)}
          y={(ys(v) + 4).toFixed(1)}
          textAnchor="end" fill="var(--muted)"
          fontSize="11" fontFamily="var(--mono)"
        >
          {fmtPrice(v)}
        </text>
      ))}

      {/* X-axis labels */}
      {xIdxs.map((idx, i) => (
        <text
          key={i}
          x={xs(idx).toFixed(1)}
          y={(H - 6).toFixed(1)}
          textAnchor="middle" fill="var(--muted)"
          fontSize="11" fontFamily="var(--mono)"
        >
          {fmtDate(fan.dates[idx])}
        </text>
      ))}
    </svg>
  );
}
