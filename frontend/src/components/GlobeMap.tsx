import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import { api, type MapValue } from "../api";

/**
 * Globo 3D interactivo (estilo World Monitor) para la sección MACRO.
 * Colorea cada país según la métrica elegida (World Bank, todos los países),
 * gira solo, resalta al pasar el mouse y emite el país al hacer click.
 *
 * Solo análisis (sin ejecución): es pura visualización de los datos macro.
 */

type Feature = {
  properties: { ISO_A3?: string; ADM0_A3?: string; ADMIN?: string; NAME?: string };
};

const METRICS: { id: string; label: string }[] = [
  { id: "gdp", label: "PIB %" },
  { id: "inflation", label: "INFLACIÓN %" },
  { id: "unemployment", label: "DESEMPLEO %" },
  { id: "gdp_per_capita", label: "PIB/CÁPITA $" },
];

// Principales bolsas del mundo — anillos pulsantes que dan vida al globo.
const HUBS = [
  { lat: 40.71, lng: -74.0, name: "NYSE" },
  { lat: 51.51, lng: -0.13, name: "LSE" },
  { lat: 35.68, lng: 139.69, name: "TSE" },
  { lat: 22.32, lng: 114.17, name: "HKEX" },
  { lat: 1.29, lng: 103.85, name: "SGX" },
  { lat: 50.11, lng: 8.68, name: "FSE" },
  { lat: -23.55, lng: -46.63, name: "B3" },
  { lat: 19.08, lng: 72.88, name: "BSE" },
];

// iso3 de una feature (Natural Earth pone -99 en ISO_A3 de FRA/NOR → fallback).
function iso3Of(f: Feature): string {
  const a = f.properties.ISO_A3;
  return a && a !== "-99" ? a : f.properties.ADM0_A3 || "";
}

// Rampa de color tipo terminal: cian (bajo) → verde → ámbar → rojo (alto).
// Para desempleo/inflación, "alto = malo" se siente natural en rojo.
function color(t: number): string {
  const stops = [
    [34, 211, 238], // cian
    [38, 208, 124], // verde
    [245, 200, 66], // ámbar
    [246, 70, 93], // rojo
  ];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function GlobeMap({
  metric,
  onMetric,
  onSelect,
}: {
  metric: string;
  onMetric: (m: string) => void;
  onSelect: (c: { iso3: string; name: string; value: number | null }) => void;
}) {
  const globeEl = useRef<GlobeMethods | undefined>(undefined);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [values, setValues] = useState<Record<string, MapValue>>({});
  const [size, setSize] = useState({ w: 600, h: 460 });
  const [hover, setHover] = useState<string | null>(null);

  // Geometría de países (estática en /public).
  useEffect(() => {
    fetch("/countries.geojson")
      .then((r) => r.json())
      .then((d) => setFeatures(d.features))
      .catch(() => setFeatures([]));
  }, []);

  // Datos macro de la métrica seleccionada.
  useEffect(() => {
    let alive = true;
    api
      .macroMap(metric)
      .then((d) => {
        if (!alive) return;
        const map: Record<string, MapValue> = {};
        for (const v of d.values) map[v.iso3] = v;
        setValues(map);
      })
      .catch(() => alive && setValues({}));
    return () => {
      alive = false;
    };
  }, [metric]);

  // Auto-rotación y punto de vista inicial.
  useEffect(() => {
    const g = globeEl.current;
    if (!g) return;
    const c = g.controls();
    c.autoRotate = true;
    c.autoRotateSpeed = 0.55;
    c.enableZoom = true;
    g.pointOfView({ lat: 15, lng: 0, altitude: 2.4 }, 0);
  }, [features]);

  // Tamaño responsivo del contenedor.
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Min/max para normalizar el color.
  const [min, max] = useMemo(() => {
    const vs = Object.values(values).map((v) => v.value);
    if (!vs.length) return [0, 1];
    return [Math.min(...vs), Math.max(...vs)];
  }, [values]);

  const capColor = useCallback(
    (f: object) => {
      const iso = iso3Of(f as Feature);
      const v = values[iso];
      if (!v) return "rgba(60,72,92,0.55)"; // sin dato: gris
      const t = max > min ? (v.value - min) / (max - min) : 0.5;
      const base = color(t);
      return iso === hover ? "#ffffff" : base;
    },
    [values, min, max, hover],
  );

  const label = useCallback(
    (f: object) => {
      const ft = f as Feature;
      const iso = iso3Of(ft);
      const v = values[iso];
      const name = ft.properties.ADMIN || ft.properties.NAME || iso;
      return `<div class="globe-tip"><b>${name}</b><br/>${
        v ? `${v.value} <small>(${v.year})</small>` : "sin dato"
      }</div>`;
    },
    [values],
  );

  return (
    <section className="m-globe">
      <div className="m-head">
        <span className="m-title">🌐 MAPA MACRO GLOBAL</span>
        <div className="m-tabs">
          {METRICS.map((m) => (
            <button
              key={m.id}
              className={m.id === metric ? "on" : ""}
              onClick={() => onMetric(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="globe-wrap" ref={wrapRef}>
        <Globe
          ref={globeEl}
          width={size.w}
          height={size.h}
          backgroundColor="rgba(0,0,0,0)"
          showGlobe
          showAtmosphere
          atmosphereColor="#2b6cff"
          atmosphereAltitude={0.22}
          globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg"
          bumpImageUrl="https://unpkg.com/three-globe/example/img/earth-topology.png"
          polygonsData={features}
          polygonAltitude={(f: object) =>
            iso3Of(f as Feature) === hover ? 0.08 : 0.01
          }
          polygonCapColor={capColor}
          polygonSideColor={() => "rgba(15,20,30,0.6)"}
          polygonStrokeColor={() => "rgba(255,140,40,0.35)"}
          polygonLabel={label}
          // Anillos pulsantes en los principales centros financieros.
          ringsData={HUBS}
          ringLat="lat"
          ringLng="lng"
          ringColor={() => (t: number) => `rgba(255,140,40,${1 - t})`}
          ringMaxRadius={5}
          ringPropagationSpeed={2.5}
          ringRepeatPeriod={1200}
          onPolygonHover={(f: object | null) =>
            setHover(f ? iso3Of(f as Feature) : null)
          }
          onPolygonClick={(f: object) => {
            const ft = f as Feature;
            const iso = iso3Of(ft);
            const v = values[iso];
            onSelect({
              iso3: iso,
              name: ft.properties.ADMIN || ft.properties.NAME || iso,
              value: v ? v.value : null,
            });
          }}
          polygonsTransitionDuration={300}
        />

        {/* Leyenda */}
        <div className="globe-legend">
          <span>{min.toFixed(1)}</span>
          <div className="legend-bar" />
          <span>{max.toFixed(1)}</span>
        </div>
      </div>
    </section>
  );
}
