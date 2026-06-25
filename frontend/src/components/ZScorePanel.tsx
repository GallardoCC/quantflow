// Mini-panel del z-score en el tiempo: histograma con líneas de referencia
// en ±1σ y ±2σ. Verde por debajo (barato), rojo por encima (caro).
import { useEffect, useRef } from "react";
import {
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { MeanReversionPoint } from "../api";

interface Props {
  points: MeanReversionPoint[];
}

export function ZScorePanel({ points }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#5c6675",
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.03)" },
      },
      rightPriceScale: { borderColor: "#20262f" },
      timeScale: { borderColor: "#20262f", timeVisible: true },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;

    const valid = points.filter((p) => Number.isFinite(p.z));

    // Histograma del z-score (color por signo/intensidad).
    const zSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: true,
    });
    zSeries.setData(
      valid.map((p) => {
        const az = Math.abs(p.z);
        // Verde abajo (barato), rojo arriba (caro); ámbar en zona neutra.
        let color = "rgba(232,179,57,0.55)";
        if (p.z <= -1) color = az >= 2 ? "#00d084" : "rgba(0,208,132,0.55)";
        else if (p.z >= 1) color = az >= 2 ? "#ff3b5c" : "rgba(255,59,92,0.55)";
        return { time: p.time as UTCTimestamp, value: p.z, color };
      })
    );

    // Líneas de referencia en 0, ±1, ±2.
    const refs: { value: number; color: string; style: LineStyle }[] = [
      { value: 0, color: "rgba(255,107,0,0.5)", style: LineStyle.Solid },
      { value: 1, color: "rgba(25,195,255,0.3)", style: LineStyle.Dashed },
      { value: -1, color: "rgba(25,195,255,0.3)", style: LineStyle.Dashed },
      { value: 2, color: "rgba(255,59,92,0.4)", style: LineStyle.Dotted },
      { value: -2, color: "rgba(255,59,92,0.4)", style: LineStyle.Dotted },
    ];
    for (const r of refs) {
      const line = chart.addSeries(LineSeries, {
        color: r.color,
        lineWidth: 1,
        lineStyle: r.style,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      line.setData(
        valid.map((p) => ({ time: p.time as UTCTimestamp, value: r.value }))
      );
    }

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [points]);

  return (
    <div className="mr-zwrap">
      <div className="mr-zhead">
        <span className="mr-ztitle">Z-SCORE · σ DESDE LA MEDIA</span>
        <span className="mr-zref">REF ±1 ±2</span>
      </div>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
