import { useEffect, useMemo, useRef, useState } from "react";
import type { OFFootprint2 } from "../../api";

type Mode = "bidask" | "delta" | "volume";

/** Footprint en canvas: columnas = buckets temporales, filas = niveles de precio.
 *  Cada celda muestra bid×ask, color por delta, borde en imbalances diagonales,
 *  VPOC marcado y footer por vela (delta/volumen/maxΔ). Modos bid/ask · delta · volume. */
export function FootprintCanvas({ fp }: { fp: OFFootprint2 }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("bidask");
  const [zoom, setZoom] = useState(1);
  const [hl, setHl] = useState<string>(""); // "bi:price"

  const levels = fp.priceLevels;
  const buckets = fp.buckets;
  const colW = 88 * zoom, rowH = 22 * zoom, padL = 64, padT = 22, footH = 56;

  // índice rápido precio→celda por bucket
  const cellMap = useMemo(() => {
    return buckets.map((b) => {
      const m = new Map<number, typeof b.cells[number]>();
      for (const c of b.cells) m.set(c.price, c);
      const imb = new Set(b.imbalances.map((x) => x.price + ":" + x.side));
      return { m, imb };
    });
  }, [buckets]);

  const maxCellVol = useMemo(() => {
    let mx = 1;
    for (const b of buckets) for (const c of b.cells) mx = Math.max(mx, c.bidVol + c.askVol, Math.abs(c.delta));
    return mx;
  }, [buckets]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = padL + buckets.length * colW;
    const H = padT + levels.length * rowH + footH;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.font = `${10 * Math.min(zoom, 1.3)}px ui-monospace, monospace`;
    ctx.textBaseline = "middle";

    const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const pos = css("--pos") || "#2ebd85", neg = css("--neg") || "#f0566b";
    const txt = css("--text-2") || "#aab1c2", txt3 = css("--text-3") || "#6b7686";
    const acc = css("--accent") || "#5b82f0";

    // cabecera de tiempo
    ctx.fillStyle = txt3; ctx.textAlign = "center";
    buckets.forEach((b, bi) => {
      const x = padL + bi * colW + colW / 2;
      ctx.fillText(new Date(b.t * 1000).toLocaleTimeString("es-PE",
        { hour: "2-digit", minute: "2-digit", hour12: false }), x, padT / 2);
    });

    // filas de precio
    levels.forEach((price, li) => {
      const y = padT + li * rowH;
      ctx.fillStyle = txt3; ctx.textAlign = "right";
      ctx.fillText(String(price), padL - 6, y + rowH / 2);
      buckets.forEach((b, bi) => {
        const c = cellMap[bi].m.get(price);
        if (!c) return;
        const x = padL + bi * colW;
        const tot = c.bidVol + c.askVol;
        // fondo según modo
        let alpha = 0;
        if (mode === "volume") alpha = tot / maxCellVol * 0.6;
        else alpha = Math.abs(c.delta) / maxCellVol * 0.75;
        const base = mode === "volume" ? acc : (c.delta >= 0 ? pos : neg);
        if (alpha > 0.02) { ctx.fillStyle = hexA(base, alpha); ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2); }

        // imbalances diagonales
        if (cellMap[bi].imb.has(price + ":ask")) { ctx.strokeStyle = pos; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1.5, y + 1.5, colW - 3, rowH - 3); }
        if (cellMap[bi].imb.has(price + ":bid")) { ctx.strokeStyle = neg; ctx.lineWidth = 1.5; ctx.strokeRect(x + 1.5, y + 1.5, colW - 3, rowH - 3); }
        if (b.vpoc === price) { ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, colW - 1, rowH - 1); }

        // texto
        if (mode === "delta") {
          ctx.fillStyle = c.delta >= 0 ? pos : neg; ctx.textAlign = "center";
          ctx.fillText((c.delta >= 0 ? "+" : "") + Math.round(c.delta), x + colW / 2, y + rowH / 2);
        } else if (mode === "volume") {
          ctx.fillStyle = txt; ctx.textAlign = "center";
          ctx.fillText(String(Math.round(tot)), x + colW / 2, y + rowH / 2);
        } else {
          ctx.textAlign = "left"; ctx.fillStyle = neg;
          ctx.fillText(String(Math.round(c.bidVol)), x + 6, y + rowH / 2);
          ctx.textAlign = "right"; ctx.fillStyle = pos;
          ctx.fillText(String(Math.round(c.askVol)), x + colW - 6, y + rowH / 2);
        }
      });
    });

    // footer por vela
    const fy = padT + levels.length * rowH;
    ctx.strokeStyle = hexA(txt3, 0.3); ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillStyle = txt3;
    ["Δ barra", "volumen", "maxΔ"].forEach((lbl, r) => ctx.fillText(lbl, padL - 6, fy + 12 + r * 15));
    buckets.forEach((b, bi) => {
      const x = padL + bi * colW + colW / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = b.barDelta >= 0 ? pos : neg;
      ctx.fillText((b.barDelta >= 0 ? "+" : "") + Math.round(b.barDelta), x, fy + 12);
      ctx.fillStyle = txt; ctx.fillText(String(Math.round(b.vol)), x, fy + 27);
      ctx.fillStyle = txt3; ctx.fillText("+" + Math.round(b.maxDelta), x, fy + 42);
    });
  }, [fp, mode, zoom, cellMap, maxCellVol, levels, buckets, colW, rowH, hl]);

  return (
    <div className="ofx-fp">
      <div className="ofx-fp-ctrls">
        <div className="ofx-seg">
          {(["bidask", "delta", "volume"] as Mode[]).map((m) => (
            <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
              {m === "bidask" ? "bid×ask" : m}
            </button>
          ))}
        </div>
        <div className="ofx-seg">
          <button onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}>−</button>
          <button onClick={() => setZoom((z) => Math.min(2, z + 0.2))}>+</button>
        </div>
        <span className="ofx-fp-hint">borde verde/rojo = imbalance diagonal apilado · marco azul = VPOC</span>
      </div>
      <div className="ofx-fp-scroll">
        <canvas ref={ref} onMouseLeave={() => setHl("")} />
      </div>
    </div>
  );
}

function hexA(color: string, a: number): string {
  // acepta #rrggbb o nombres ya resueltos; cae a rgba con alpha
  if (color.startsWith("#")) {
    const r = parseInt(color.slice(1, 3), 16), g = parseInt(color.slice(3, 5), 16), b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  return color;
}
