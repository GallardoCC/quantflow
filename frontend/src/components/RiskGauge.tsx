import type { FC } from "react";

interface Props { score: number; level: string; }

export const RiskGauge: FC<Props> = ({ score }) => {
  const W = 260, H = 145, cx = 130, cy = 130, R = 105, stroke = 14;
  const s = Math.max(0, Math.min(100, score)); // clamp 0–100

  const toRad = (deg: number) => deg * Math.PI / 180;

  // A point on the upper semicircle. SVG y grows downward, so we subtract sin.
  //   deg=180 → left (0),  deg=90 → top (50),  deg=0 → right (100)
  const point = (deg: number, r: number) => ({
    x: cx + r * Math.cos(toRad(deg)),
    y: cy - r * Math.sin(toRad(deg)),
  });

  // Score → angle. score 0 ⇒ 180° (left), score 100 ⇒ 0° (right).
  const scoreDeg = (val: number) => 180 - (val / 100) * 180;

  // Upper arc from startDeg to endDeg. Decreasing the angle while passing over
  // the top is the "positive" SVG direction → sweep-flag 1.
  const arcPath = (startDeg: number, endDeg: number, r: number) => {
    const a = point(startDeg, r);
    const b = point(endDeg, r);
    const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${largeArc} 1 ${b.x} ${b.y}`;
  };

  const endDeg = scoreDeg(s);
  const color = s < 30 ? "#22c55e" : s < 70 ? "#eab308" : "#ef4444";

  // Needle: from the pivot toward the arc at the score angle.
  const tip = point(endDeg, R - stroke / 2);

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
      {/* Track */}
      <path d={arcPath(180, 0, R)} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} strokeLinecap="round" />
      {/* Colored arc up to the score */}
      {s > 0 && (
        <path d={arcPath(180, endDeg, R)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />
      )}
      {/* Zone labels */}
      <text x={cx - R - 10} y={cy + 5} fontSize="10" fill="var(--text-3)" textAnchor="middle">0</text>
      <text x={cx} y={cy - R - 8} fontSize="10" fill="var(--text-3)" textAnchor="middle">50</text>
      <text x={cx + R + 10} y={cy + 5} fontSize="10" fill="var(--text-3)" textAnchor="middle">100</text>
      {/* Needle */}
      <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill={color} />
      {/* Score text */}
      <text x={cx} y={cy + 22} fontSize="32" fontWeight="700" fill="var(--text)" textAnchor="middle" fontFamily="var(--mono)">
        {Math.round(s)}
      </text>
    </svg>
  );
};
