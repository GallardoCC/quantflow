"""
Cliente FRED (Federal Reserve Economic Data) — macro EE.UU. + calendario.

Rol en QuantFlow: el estándar de oro para datos macro de EE.UU. (lo que más
mueve el mercado) y el CALENDARIO de publicaciones económicas (cuándo sale el
próximo CPI, NFP, decisión de la Fed, etc.).

Requiere API key gratis (FRED_API_KEY en .env). Si no hay key, degrada a []
sin romper el resto de la sección MACRO.
Free tier muy generoso: 120 req/min.
"""
from __future__ import annotations

import os
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_KEY = os.getenv("FRED_API_KEY", "")
_BASE = "https://api.stlouisfed.org/fred"

# Indicadores macro clave de EE.UU.: series_id -> (etiqueta, unidad, units_FRED, topic).
# `units` controla la transformación del lado de FRED: "lin" = nivel tal cual,
# "pc1" = % de cambio interanual (YoY). Para el IPC mostramos YoY (lo que la gente
# llama "inflación"), no el número índice. `topic` enlaza el KPI con su deep page.
_SERIES: dict[str, tuple[str, str, str, str | None]] = {
    "CPIAUCSL": ("Inflación (IPC interanual)", "%", "pc1", "inflation"),
    "FEDFUNDS": ("Tasa de la Fed", "%", "lin", "rates"),
    "DGS10": ("Bono 10A EE.UU.", "%", "lin", "rates"),
    "T10Y2Y": ("Spread 10A-2A", "pp", "lin", "rates"),
    "UNRATE": ("Desempleo", "%", "lin", "employment"),
    "GDPC1": ("PIB real", "Bn$", "lin", "gdp"),
}

# Lectura de mercado de cada serie (capa de impacto). Texto curado y cualitativo
# —relaciones económicas reales, no cifras inventadas— mostrado bajo cada KPI.
_IMPACT: dict[str, str] = {
    "CPIAUCSL": "Una inflación más baja eleva las probabilidades de recortes de tasas — apoya bonos largos, oro y acciones de crecimiento.",
    "FEDFUNDS": "La tasa de política ancla toda la curva. Los recortes relajan las condiciones financieras y suben los activos de riesgo; las subidas, lo contrario.",
    "DGS10": "El bono a 10 años es la tasa de descuento del mundo. Rendimientos más altos presionan al tech de larga duración y suben el dólar.",
    "T10Y2Y": "Un spread negativo (inversión) ha precedido a la mayoría de recesiones de EE.UU.; su re-empinamiento suele avisar que el ciclo cambia.",
    "UNRATE": "Un desempleo al alza señala enfriamiento y empuja a la Fed a recortar; lecturas muy bajas pueden mantener la política restrictiva.",
    "GDPC1": "El crecimiento real enmarca el ciclo — un PIB fuerte apoya beneficios y apetito por riesgo; la contracción avisa de recesión.",
}


def available() -> bool:
    return bool(_KEY)


def _get(path: str, params: dict[str, Any]) -> Any:
    params = {**params, "api_key": _KEY, "file_type": "json"}
    r = requests.get(f"{_BASE}/{path}", params=params, timeout=12)
    r.raise_for_status()
    return r.json()


def _to_float(v: Any) -> float | None:
    try:
        return float(v) if v not in (".", "", None) else None
    except (TypeError, ValueError):
        return None


def observations(
    series_id: str,
    limit: int = 24,
    units: str = "lin",
    frequency: str | None = None,
) -> list[dict]:
    """Serie histórica cruda de FRED (ascendente). [{date, value}].

    `units` aplica la transformación de FRED (lin/pc1/...); `frequency` permite
    submuestrear (p. ej. "m" para una serie diaria). Degrada a [] si falla.
    """
    if not _KEY:
        return []
    params: dict[str, Any] = {
        "series_id": series_id,
        "sort_order": "desc",
        "limit": limit,
        "units": units,
    }
    if frequency:
        params["frequency"] = frequency
    try:
        d = _get("series/observations", params)
    except Exception:
        return []
    obs = d.get("observations", [])
    out = []
    for o in obs:
        v = _to_float(o.get("value"))
        if v is not None:
            out.append({"date": o["date"], "value": round(v, 2)})
    out.reverse()  # cronológico ascendente para graficar
    return out


def indicators() -> list[dict]:
    """Valor actual + anterior + delta de cada indicador macro de EE.UU.

    Incluye la lectura de mercado (`impact`) y el `topic` que enlaza el KPI con su
    deep page. Capa de impacto: current/previous/change sin inventar consenso.
    """
    if not _KEY:
        return []
    out: list[dict] = []
    for sid, (label, unit, units, topic) in _SERIES.items():
        try:
            d = _get(
                "series/observations",
                {"series_id": sid, "sort_order": "desc", "limit": 2, "units": units},
            )
            obs = d.get("observations", [])
            cur = _to_float(obs[0]["value"]) if len(obs) >= 1 else None
            prev = _to_float(obs[1]["value"]) if len(obs) >= 2 else None
            cur = round(cur, 2) if cur is not None else None
            prev = round(prev, 2) if prev is not None else None
            change = round(cur - prev, 2) if cur is not None and prev is not None else None
            out.append(
                {
                    "series": sid,
                    "label": label,
                    "unit": unit,
                    "value": cur,
                    "previous": prev,
                    "change": change,
                    "date": obs[0]["date"] if obs else None,
                    "topic": topic,
                    "impact": _IMPACT.get(sid),
                }
            )
        except Exception:
            out.append(
                {
                    "series": sid, "label": label, "unit": unit, "value": None,
                    "previous": None, "change": None, "date": None,
                    "topic": topic, "impact": _IMPACT.get(sid),
                }
            )
    return out


def calendar(days_ahead: int = 14) -> list[dict]:
    """Próximas fechas de publicación de datos económicos (releases de FRED)."""
    if not _KEY:
        return []
    today = date.today()
    end = today + timedelta(days=days_ahead)
    try:
        d = _get(
            "releases/dates",
            {
                "realtime_start": today.isoformat(),
                "realtime_end": end.isoformat(),
                "include_release_dates_with_no_data": "true",
                "sort_order": "asc",
                "limit": 60,
            },
        )
    except Exception:
        return []
    out: list[dict] = []
    for r in d.get("release_dates", []):
        out.append(
            {
                "date": r.get("date"),
                "event": r.get("release_name"),
                "country": "US",
                "impact": "—",
            }
        )
    return out


# --------------------------------------------------------------------------- #
#  Calendario económico CURADO (de alto impacto), con cifras reales.
#  FRED no entrega un "calendario tipo Bloomberg" con consenso; entrega fechas
#  de publicación por release + las observaciones reales. Aquí seleccionamos los
#  releases que MUEVEN el mercado y los unimos a su serie de datos para mostrar
#  Anterior / Actual / Δ reales. El consenso no existe en FRED → no se inventa.
# --------------------------------------------------------------------------- #
# event: nombre ES · rel: release_id · series: serie de datos · units: transform
# FRED · unit: etiqueta · dec: decimales · scale: factor · imp: importancia ·
# period: días entre publicaciones (para estimar la próxima) · cat · why (ES).
_CAL_INDICATORS: list[dict] = [
    {"event": "IPC — Inflación al consumidor (interanual)", "rel": 10, "series": "CPIAUCSL",
     "units": "pc1", "unit": "%", "dec": 2, "scale": 1, "imp": "High", "period": 31,
     "cat": "Inflación",
     "why": "El dato que más pesa en la Fed. Si enfría hacia el 2% abre la puerta a recortes "
            "(apoya bonos largos, oro y growth); si recalienta, mantiene la política restrictiva."},
    {"event": "PCE — Inflación preferida de la Fed (interanual)", "rel": 54, "series": "PCEPI",
     "units": "pc1", "unit": "%", "dec": 2, "scale": 1, "imp": "High", "period": 31,
     "cat": "Inflación",
     "why": "El índice de precios que la Fed mira de verdad para fijar tasas. Sorpresas al alza "
            "elevan rendimientos y el dólar."},
    {"event": "IPP — Precios al productor (interanual)", "rel": 46, "series": "PPIACO",
     "units": "pc1", "unit": "%", "dec": 2, "scale": 1, "imp": "Medium", "period": 31,
     "cat": "Inflación",
     "why": "Inflación 'aguas arriba': anticipa presión sobre el IPC futuro y los márgenes."},
    {"event": "Nóminas no agrícolas (NFP)", "rel": 50, "series": "PAYEMS",
     "units": "chg", "unit": "k", "dec": 0, "scale": 1, "imp": "High", "period": 31,
     "cat": "Empleo",
     "why": "El termómetro del mercado laboral. Empleo fuerte sostiene consumo e inflación y "
            "retrasa recortes; débil acerca el alivio de la Fed."},
    {"event": "Tasa de desempleo", "rel": 50, "series": "UNRATE",
     "units": "lin", "unit": "%", "dec": 1, "scale": 1, "imp": "High", "period": 31,
     "cat": "Empleo",
     "why": "Desempleo al alza señala enfriamiento y empuja a la Fed a recortar (alcista para "
            "bonos largos y defensivas)."},
    {"event": "Peticiones iniciales de desempleo", "rel": 180, "series": "ICSA",
     "units": "lin", "unit": "k", "dec": 0, "scale": 0.001, "imp": "Medium", "period": 7,
     "cat": "Empleo",
     "why": "Señal semanal más temprana del empleo: adelanta al NFP en 4–6 semanas."},
    {"event": "PIB real (anualizado)", "rel": 53, "series": "A191RL1Q225SBEA",
     "units": "lin", "unit": "%", "dec": 1, "scale": 1, "imp": "High", "period": 91,
     "cat": "Crecimiento",
     "why": "La medida más amplia de la economía. Dos trimestres negativos = recesión técnica; "
            "sorpresas al alza suben el apetito por riesgo."},
    {"event": "Ventas minoristas (interanual)", "rel": 9, "series": "RSAFS",
     "units": "pc1", "unit": "%", "dec": 1, "scale": 1, "imp": "High", "period": 31,
     "cat": "Consumo",
     "why": "El consumo es ~70% del PIB de EE.UU.; mide la salud real del gasto."},
    {"event": "Producción industrial (interanual)", "rel": 13, "series": "INDPRO",
     "units": "pc1", "unit": "%", "dec": 1, "scale": 1, "imp": "Medium", "period": 31,
     "cat": "Crecimiento",
     "why": "Pulso del sector manufacturero; lidera el ciclo industrial."},
    {"event": "Confianza del consumidor (U. Michigan)", "rel": 91, "series": "UMCSENT",
     "units": "lin", "unit": "", "dec": 1, "scale": 1, "imp": "Medium", "period": 31,
     "cat": "Sentimiento",
     "why": "Sentimiento del hogar; anticipa el gasto futuro y las expectativas de inflación."},
    {"event": "Inicios de construcción de viviendas", "rel": 27, "series": "HOUST",
     "units": "lin", "unit": "k", "dec": 0, "scale": 1, "imp": "Low", "period": 31,
     "cat": "Vivienda",
     "why": "Sector sensible a tasas; uno de los primeros en reaccionar a la política monetaria."},
]


_CAL_CACHE: dict[tuple, tuple[float, list[dict]]] = {}


def _date_plus(iso: str, days: int) -> str:
    y, m, d = (int(x) for x in iso.split("-"))
    return (date(y, m, d) + timedelta(days=days)).isoformat()


def _release_dates(rid: int, lo: str, hi: str) -> list[str]:
    """Fechas reales de publicación de un release en [lo, hi]."""
    try:
        d = _get("release/dates", {
            "release_id": rid, "realtime_start": lo, "realtime_end": hi,
            "include_release_dates_with_no_data": "false",
            "sort_order": "asc", "limit": 60,
        })
    except Exception:
        return []
    return [x["date"] for x in d.get("release_dates", []) if x.get("date")]


def curated_calendar(days_back: int = 45, days_ahead: int = 21) -> list[dict]:
    """Calendario económico de alto impacto con cifras reales de FRED.

    Para cada indicador clave: toma su última publicación dentro de la ventana
    (con Actual/Anterior/Δ reales) y estima la próxima fecha (Anterior conocido,
    Actual pendiente). Consenso = None (FRED no lo provee; no se inventa).
    """
    if not _KEY:
        return []
    ck = (days_back, days_ahead, date.today().isoformat())
    hit = _CAL_CACHE.get(ck)
    if hit and time.time() - hit[0] < 1800:   # TTL 30 min
        return hit[1]
    today = date.today()
    today_s = today.isoformat()
    win_lo = (today - timedelta(days=days_back)).isoformat()
    win_hi = (today + timedelta(days=days_ahead)).isoformat()
    rel_cache: dict[int, list[str]] = {}
    out: list[dict] = []

    for c in _CAL_INDICATORS:
        rid = c["rel"]
        if rid not in rel_cache:
            # Pedimos histórico amplio para poder estimar la próxima fecha.
            rel_cache[rid] = _release_dates(rid, (today - timedelta(days=160)).isoformat(), today_s)
        dates = rel_cache[rid]

        obs = observations(c["series"], limit=4, units=c["units"])
        sc = c["scale"]
        actual = round(obs[-1]["value"] * sc, c["dec"]) if obs else None
        prev = round(obs[-2]["value"] * sc, c["dec"]) if len(obs) >= 2 else None
        change = (round(actual - prev, c["dec"])
                  if actual is not None and prev is not None else None)

        def row(d, p, a, ch, status):
            return {
                "date": d, "country": "US", "event": c["event"],
                "previous": p, "estimate": None, "actual": a,
                "change": ch, "impact": c["imp"], "unit": c["unit"] or None,
                "category": c["cat"], "status": status, "why": c["why"],
                "series": c["series"],
            }

        # Publicación reciente dentro de la ventana (con cifras reales).
        recent = [d for d in dates if win_lo <= d <= today_s]
        if recent:
            out.append(row(recent[-1], prev, actual, change, "publicado"))

        # Próxima publicación estimada (Anterior = último Actual conocido).
        if dates:
            nxt = _date_plus(dates[-1], c["period"])
            if today_s < nxt <= win_hi:
                out.append(row(nxt, actual, None, None, "estimado"))

    rank = {"High": 0, "Medium": 1, "Low": 2}
    out.sort(key=lambda e: (e["date"], rank.get(e["impact"], 3)))
    # Solo cacheamos un resultado sano: un fallo transitorio de FRED (que deja
    # casi todo vacío) no debe envenenar la caché durante 30 min.
    if len(out) >= 6:
        _CAL_CACHE[ck] = (time.time(), out)
    return out
