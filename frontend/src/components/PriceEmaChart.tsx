// Gráfico de velas con líneas EMA superpuestas (lightweight-charts v5).
import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "../api";

export interface EmaLine {
  values: (number | null)[];
  color: string;
  label: string;
}

interface Props {
  candles: Candle[];
  emaLines?: EmaLine[];
}

export function PriceEmaChart({ candles, emaLines = [] }: Props) {
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

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00d084",
      downColor: "#ff3b5c",
      borderUpColor: "#00d084",
      borderDownColor: "#ff3b5c",
      wickUpColor: "#00d084",
      wickDownColor: "#ff3b5c",
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }))
    );

    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(0,208,132,0.30)"
            : "rgba(255,59,92,0.30)",
      }))
    );

    // Líneas EMA superpuestas
    for (const ema of emaLines) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: ema.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
      });
      const pts = candles
        .map((c, i) =>
          ema.values[i] != null
            ? { time: c.time as UTCTimestamp, value: ema.values[i] as number }
            : null
        )
        .filter((d): d is { time: UTCTimestamp; value: number } => d !== null);
      lineSeries.setData(pts);
    }

    chart.timeScale().fitContent();

    return () => chart.remove();
  }, [candles, emaLines]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
