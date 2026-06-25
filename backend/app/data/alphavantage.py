"""
Cliente Alpha Vantage — indicadores técnicos (pedestal futuro).

Rol en QuantFlow: la fuente de *indicadores cuantitativos* lista para cuando
montemos análisis técnico/matemático encima de los datos. Alpha Vantage calcula
los indicadores en su servidor (RSI, SMA, EMA, MACD, BBANDS, ...), así que no
tenemos que reimplementar fórmulas todavía.

Free tier MUY limitado: 25 req/día. Por eso se cachea agresivamente y NO se usa
en el camino caliente (quote/velas) — solo bajo demanda en /api/indicator.
Degrada a None/[] si no hay key o falla, sin obstruir al resto de fuentes.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_KEY = os.getenv("ALPHAVANTAGE_API_KEY", "")
_BASE = "https://www.alphavantage.co/query"

# Indicadores soportados -> función de Alpha Vantage.
INDICATORS = {
    "rsi": "RSI",
    "sma": "SMA",
    "ema": "EMA",
    "macd": "MACD",
    "bbands": "BBANDS",
    "adx": "ADX",
    "stoch": "STOCH",
}

# Caché en memoria (clave -> (ts, valor)). TTL largo: el free tier da 25/día.
_CACHE: dict[str, tuple[float, Any]] = {}
_TTL = 60 * 30  # 30 min


def available() -> bool:
    return bool(_KEY)


def _get(params: dict[str, Any]) -> dict | None:
    params = {**params, "apikey": _KEY}
    r = requests.get(_BASE, params=params, timeout=15)
    r.raise_for_status()
    data = r.json()
    # Alpha Vantage no usa códigos HTTP: avisa por estos campos.
    if "Note" in data or "Information" in data or "Error Message" in data:
        return None
    return data


def indicator(
    symbol: str,
    name: str,
    interval: str = "daily",
    time_period: int = 14,
    series_type: str = "close",
    points: int = 120,
) -> dict | None:
    """Serie temporal de un indicador técnico, normalizada para graficar.

    Devuelve {"indicator","symbol","interval","series":[{time,...valores}]} o None.
    """
    name = name.lower()
    if not _KEY or name not in INDICATORS:
        return None

    key = f"{name}:{symbol.upper()}:{interval}:{time_period}:{series_type}"
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < _TTL:
        return hit[1]

    func = INDICATORS[name]
    params = {
        "function": func,
        "symbol": symbol.upper(),
        "interval": interval,
        "series_type": series_type,
    }
    # MACD/BBANDS/STOCH no usan time_period igual; los demás sí.
    if name not in ("macd", "stoch"):
        params["time_period"] = time_period

    data = _get(params)
    if not data:
        return None

    # La clave de datos varía: "Technical Analysis: RSI", etc.
    ta_key = next((k for k in data if k.startswith("Technical Analysis")), None)
    if not ta_key:
        return None

    series = []
    for date_str, values in data[ta_key].items():
        row: dict[str, Any] = {"time": date_str}
        for vk, vv in values.items():
            try:
                row[vk.lower()] = float(vv)
            except (TypeError, ValueError):
                row[vk.lower()] = None
        series.append(row)
    series.sort(key=lambda r: r["time"])
    series = series[-points:]

    result = {
        "indicator": name,
        "symbol": symbol.upper(),
        "interval": interval,
        "timePeriod": time_period,
        "series": series,
    }
    _CACHE[key] = (time.time(), result)
    return result
