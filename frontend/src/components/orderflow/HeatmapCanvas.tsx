import { useEffect, useRef, useState } from "react";
import type { OFHeatmap } from "../../api";

/** Aproximación del colormap "inferno" (negro→púrpura→naranja→amarillo). */
function inferno(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  const stops: [number, number[]][] = [
    [0.0, [0, 0, 4]], [0.25, [60, 12, 90]], [0.5, [140, 40, 90]],
    [0.75, [230, 100, 40]], [1.0, [252, 255, 164]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (t >= a && t <= b) {
      const k = (t - a) / (b - a);
      return [ca[0] + (cb[0] - ca[0]) * k, ca[1] + (cb[1] - ca[1]) * k, ca[2] + (cb[2] - ca[2]) * k] as [number, number, number];
    }
  }
  return [252, 255, 164];
}

/** Heatmap de liquidez/volumen (precio×tiempo) en canvas. Escala log opcional,
 *  crosshair, tooltip por celda y marcas de trades grandes. Estilo Bookmap. */
export function HeatmapCanvas({ hm }: { hm: OFHeatmap }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [logScale, setLogScale] = useState(hm.scale === "log");
  const [tip, setTip] = useState<{ x: number; y: number; price: number; t: number; val: number } | null>(null);

  const P = hm.priceBins.length, T = hm.tBins.length;

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = cv.clientWidth, cssH = cv.clientHeight;
    cv.width = cssW * dpr; cv.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    let max = 0;
    for (const row of hm.matrix) for (const v of row) if (v > max) max = v;
    const norm = (v: number) => {
      if (max <= 0) return 0;
      return logScale ? Math.log1p(v) / Math.log1p(max) : v / max;
    };

    const cw = cssW / T, ch = cssH / P;
    // matrix[priceIdx][tIdx]; priceIdx 0 = precio bajo → dibujar invertido (precio alto arriba)
    for (let p = 0; p < P; p++) {
      for (let t = 0; t < T; t++) {
        const v = hm.matrix[p][t];
        if (v <= 0) continue;
        const [r, g, b] = inferno(norm(v));
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.fillRect(t * cw, (P - 1 - p) * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }

    // trades grandes
    for (const bt of hm.bigTrades) {
      const ti = Math.round(((bt.t - hm.tBins[0]) / (hm.tBins[T - 1] - hm.tBins[0] || 1)) * (T - 1));
      const loP = hm.priceBins[0], hiP = hm.priceBins[P - 1];
      const pi = Math.round(((bt.price - loP) / (hiP - loP || 1)) * (P - 1));
      const x = ti * cw + cw / 2, y = (P - 1 - pi) * ch + ch / 2;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }, [hm, logScale, P, T]);

  function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const cv = ref.current; if (!cv) return;
    const rect = cv.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const t = Math.min(T - 1, Math.max(0, Math.floor(x / (rect.width / T))));
    const pRow = Math.min(P - 1, Math.max(0, Math.floor(y / (rect.height / P))));
    const p = P - 1 - pRow;
    setTip({ x, y, price: hm.priceBins[p], t: hm.tBins[t], val: hm.matrix[p][t] });
  }

  return (
    <div className="ofx-hm">
      <div className="ofx-hm-ctrls">
        <button className={logScale ? "on" : ""} onClick={() => setLogScale(!logScale)}>
          escala {logScale ? "log" : "lineal"}
        </button>
        <span className="ofx-hm-scale">
          {[0, 0.35, 0.6, 0.8, 1].map((s) => {
            const [r, g, b] = inferno(s);
            return <i key={s} style={{ background: `rgb(${r | 0},${g | 0},${b | 0})` }} />;
          })}
          <small>menos → más liquidez/volumen</small>
        </span>
      </div>
      <div className="ofx-hm-canvas-wrap" onMouseLeave={() => setTip(null)}>
        <canvas ref={ref} className="ofx-hm-canvas" onMouseMove={onMove} />
        {tip && (
          <div className="ofx-hm-tip" style={{ left: Math.min(tip.x + 12, 320), top: tip.y + 12 }}>
            <b>{tip.price.toFixed(2)}</b> · {new Date(tip.t * 1000).toLocaleString("es-PE", { hour12: false })}<br />
            vol {Math.round(tip.val).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
