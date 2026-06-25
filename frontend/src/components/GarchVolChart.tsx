// Línea temporal de volatilidad (anualizada %): vol condicional del modelo
// GARCH vs. vol realizada móvil, más la curva de pronóstico (punteada) que
// continúa hacia el futuro. lightweight-charts v5.
import { useEffect, useRef } from "react";
import {
  createChart,
  LineSeries,
  LineStyle,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { GarchTimePoint, GarchForecast } from "../api";

interface Props {
  timeline: GarchTimePoint[];
  forecast: GarchForecast;
}

export function GarchVolChart({ timeline, forecast }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7488",
        fontFamily: "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.03)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false },
      crosshair: { mode: 0 },
      autoSize: true,
    });
    chartRef.current = chart;

    // Vol realizada (gris tenue, de fondo).
    const realized = chart.addSeries(LineSeries, {
      color: "rgba(170,177,194,0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      priceLineVisible: false,
      lastValueVisible: false,
      title: "Realizada",
    });
    realized.setData(
      timeline
        .filter((p) => p.realized != null && Number.isFinite(p.realized))
        .map((p) => ({ time: p.time as UTCTimestamp, value: p.realized as number }))
    );

    // Vol condicional GARCH (acento azul, sólida y gruesa).
    const cond = chart.addSeries(LineSeries, {
      color: "#5b82f0",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      title: "Condicional",
    });
    const condData = timeline
      .filter((p) => Number.isFinite(p.cond))
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.cond }));
    cond.setData(condData);

    // Pronóstico (ámbar, punteado) — empalma con el último punto condicional.
    const fc = chart.addSeries(LineSeries, {
      color: "#e0a93b",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: true,
      title: "Pronóstico",
    });
    const fcData: { time: UTCTimestamp; value: number }[] = [];
    if (condData.length) {
      fcData.push(condData[condData.length - 1]); // punto de empalme
    }
    forecast.dates.forEach((iso, i) => {
      const t = Math.floor(new Date(iso + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
      fcData.push({ time: t, value: forecast.values[i] });
    });
    // lightweight-charts exige tiempos estrictamente crecientes y únicos.
    const seen = new Set<number>();
    fc.setData(fcData.filter((d) => (seen.has(d.time) ? false : (seen.add(d.time), true))));

    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [timeline, forecast]);

  return (
    <div className="gk-chart">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="gk-legend">
        <span className="gk-lg gk-lg-cond">Condicional (GARCH)</span>
        <span className="gk-lg gk-lg-real">Realizada 21d</span>
        <span className="gk-lg gk-lg-fc">Pronóstico</span>
      </div>
    </div>
  );
}
