// Gráfico propio de regresión a la media usando lightweight-charts v5.
// Capas: bandas ±2σ (extremas), bandas ±1σ, media (canal central) y precio.
import { useEffect, useRef } from "react";
import {
  createChart,
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

export function MeanReversionChart({ points }: Props) {
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

    // Defensa: solo puntos con todos los valores numéricos válidos.
    const valid = points.filter(
      (p) =>
        Number.isFinite(p.price) &&
        Number.isFinite(p.mean) &&
        Number.isFinite(p.upper1) &&
        Number.isFinite(p.lower1) &&
        Number.isFinite(p.upper2) &&
        Number.isFinite(p.lower2)
    );

    // Banda extrema +2σ (roja punteada tenue).
    const upper2 = chart.addSeries(LineSeries, {
      color: "rgba(255,59,92,0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const lower2 = chart.addSeries(LineSeries, {
      color: "rgba(255,59,92,0.45)",
      lineWidth: 1,
      lineStyle: LineStyle.Dotted,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Banda ±1σ (cian/gris, aún más tenue, dashed).
    const upper1 = chart.addSeries(LineSeries, {
      color: "rgba(25,195,255,0.30)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const lower1 = chart.addSeries(LineSeries, {
      color: "rgba(25,195,255,0.30)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Media (canal central) — naranja sólida.
    const mean = chart.addSeries(LineSeries, {
      color: "#ff6b00",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Precio — línea blanca brillante por encima de todo.
    const price = chart.addSeries(LineSeries, {
      color: "#eef2f7",
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    upper2.setData(
      valid.map((p) => ({ time: p.time as UTCTimestamp, value: p.upper2 }))
    );
    lower2.setData(
      valid.map((p) => ({ time: p.time as UTCTimestamp, value: p.lower2 }))
    );
    upper1.setData(
      valid.map((p) => ({ time: p.time as UTCTimestamp, value: p.upper1 }))
    );
    lower1.setData(
      valid.map((p) => ({ time: p.time as UTCTimestamp, value: p.lower1 }))
    );
    mean.setData(
      valid.map((p) => ({ time: p.time as UTCTimestamp, value: p.mean }))
    );
    price.setData(
      valid.map((p) => ({ time: p.time as UTCTimestamp, value: p.price }))
    );

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [points]);

  return (
    <div className="mr-chart">
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <div className="mr-legend">
        <span className="mr-lg mr-lg-price">PRECIO</span>
        <span className="mr-lg mr-lg-mean">MEDIA</span>
        <span className="mr-lg mr-lg-s1">±1σ</span>
        <span className="mr-lg mr-lg-s2">±2σ</span>
      </div>
    </div>
  );
}
