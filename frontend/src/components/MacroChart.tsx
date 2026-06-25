// Gráfico de línea/área para series macro (FRED) con lightweight-charts v5.
// Tiempo en formato 'yyyy-mm-dd' (datos de día/mes), una serie por tarjeta.
import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { MacroSeriesPoint } from "../api";

interface Props {
  points: MacroSeriesPoint[];
  color?: string;
  height?: number;
}

export function MacroChart({ points, color = "#5b82f0", height = 200 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#7a8597",
        fontFamily: "ui-monospace, 'Geist Mono', monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.025)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.07)" },
      timeScale: { borderColor: "rgba(255,255,255,0.07)", timeVisible: false },
      crosshair: { mode: 1 },
      autoSize: true,
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: color + "55",
      bottomColor: color + "05",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    const valid = points.filter((p) => Number.isFinite(p.value));
    series.setData(valid.map((p) => ({ time: p.date as Time, value: p.value })));
    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [points, color]);

  return (
    <div className="mx-chart" style={{ height }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
