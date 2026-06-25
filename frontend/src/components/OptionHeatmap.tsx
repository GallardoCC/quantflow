// Mapa de calor de una superficie de griega (vega o gamma) en la malla
// (precio del subyacente × días al vencimiento). Rampa azul-índigo.
import { Fragment } from "react";

interface Props {
  spots: number[];
  days: number[];
  matrix: number[][]; // [fila=día][col=spot]
  title: string;
  strike: number;
}

function color(t: number): string {
  // t en [0,1] → rampa oscuro→índigo→cian
  const a = Math.max(0, Math.min(1, t));
  const r = Math.round(20 + a * (91 - 20));
  const g = Math.round(26 + a * (160 - 26));
  const b = Math.round(46 + a * (240 - 46));
  return `rgb(${r},${g},${b})`;
}

export function OptionHeatmap({ spots, days, matrix, title, strike }: Props) {
  const flat = matrix.flat();
  const min = Math.min(...flat), max = Math.max(...flat);
  const rng = max - min || 1;

  const cols = spots.length;

  return (
    <div className="og-heat">
      <div className="og-mini-h">{title}</div>
      <div className="og-heat-grid" style={{ gridTemplateColumns: `34px repeat(${cols}, 1fr)` }}>
        <span className="og-heat-corner">d \ S</span>
        {spots.map((s, i) => (
          <span key={i} className={`og-heat-col ${Math.abs(s - strike) < (spots[1] - spots[0]) / 2 ? "k" : ""}`}>
            {s.toFixed(0)}
          </span>
        ))}
        {matrix.map((row, r) => (
          <Fragment key={r}>
            <span className="og-heat-row">{days[r].toFixed(0)}d</span>
            {row.map((v, c) => (
              <span
                key={`${r}-${c}`}
                className="og-heat-cell"
                style={{ background: color((v - min) / rng) }}
                title={`S=${spots[c]}, ${days[r]}d → ${v}`}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div className="og-heat-scale">
        <span>{min.toFixed(2)}</span>
        <span className="og-heat-bar" />
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  );
}
