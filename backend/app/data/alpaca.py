"""
Cliente Alpaca Markets — datos de microestructura para el módulo ORDERFLOW.

Rol en QuantFlow: la fuente de *order flow* (flujo de órdenes). Alpaca es el único
proveedor conectado que da granularidad de trades individuales y, para cripto,
el libro de órdenes (orderbook) real. Eso habilita footprint, delta, perfil de
volumen y heatmap de liquidez — cosas imposibles con quotes EOD de FMP/yfinance.

Honestidad de datos (importante):
- ACCIONES/ETF: plan free = feed IEX (una sola bolsa, ~2-3% del volumen consolidado)
  con ~15 min de retardo. Suficiente para *estructura* de flujo, no es el tape completo.
  IEX NO da profundidad L2 real → el heatmap de acciones es una APROXIMACIÓN del
  volumen-por-precio (liquidez en reposo inferida), etiquetada como tal.
- CRIPTO: feed `us` sin restricción + **orderbook real** (`/latest/orderbooks`) →
  heatmap de liquidez auténtico.

Solo lectura / solo análisis. Degrada a None/[] si falta la key o falla la API,
para no obstruir al resto de la terminal. Sin numpy.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_KEY = os.getenv("ALPACA_API_KEY", "")
_SECRET = os.getenv("ALPACA_SECRET_KEY", "")
_DATA = "https://data.alpaca.markets"

_HEADERS = {
    "APCA-API-KEY-ID": _KEY,
    "APCA-API-SECRET-KEY": _SECRET,
    "accept": "application/json",
}


def available() -> bool:
    return bool(_KEY and _SECRET)


def _get(url: str, params: dict[str, Any]) -> Any:
    r = requests.get(url, params=params, headers=_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


# --- Normalización de símbolo -------------------------------------------------
def is_crypto(ticker: str) -> bool:
    t = ticker.upper()
    return t.endswith("-USD") or t.endswith("-USDT") or t.endswith("/USD") or "/USDT" in t


def crypto_pair(ticker: str) -> str:
    """BTC-USD / BTCUSD -> BTC/USD (formato que exige Alpaca crypto)."""
    t = ticker.upper().replace("-", "/")
    if "/" not in t:
        # BTCUSD -> BTC/USD
        if t.endswith("USDT"):
            t = t[:-4] + "/USDT"
        elif t.endswith("USD"):
            t = t[:-3] + "/USD"
    return t


def _utc_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- ACCIONES / ETF -----------------------------------------------------------
def stock_bars(symbol: str, timeframe: str = "1Min", lookback_min: int = 1500,
               limit: int = 10000) -> list[dict]:
    """Barras OHLCV intradía (feed IEX). lookback_min = ventana hacia atrás en minutos."""
    start = _utc_iso(datetime.now(timezone.utc) - timedelta(minutes=lookback_min))
    try:
        j = _get(f"{_DATA}/v2/stocks/{symbol.upper()}/bars", {
            "timeframe": timeframe, "start": start, "limit": limit, "feed": "iex",
            "adjustment": "raw", "sort": "asc",
        })
    except Exception:
        return []
    return j.get("bars") or []


def stock_trades(symbol: str, lookback_min: int = 390, limit: int = 10000) -> list[dict]:
    """Trades individuales (feed IEX). Cada uno: t(time), p(price), s(size), x(exch)."""
    start = _utc_iso(datetime.now(timezone.utc) - timedelta(minutes=lookback_min))
    out: list[dict] = []
    token: str | None = None
    try:
        for _ in range(5):  # hasta 5 páginas
            params: dict[str, Any] = {
                "start": start, "limit": limit, "feed": "iex", "sort": "asc",
            }
            if token:
                params["page_token"] = token
            j = _get(f"{_DATA}/v2/stocks/{symbol.upper()}/trades", params)
            out.extend(j.get("trades") or [])
            token = j.get("next_page_token")
            if not token or len(out) >= limit:
                break
    except Exception:
        return out
    return out


def stock_snapshot(symbol: str) -> dict | None:
    try:
        return _get(f"{_DATA}/v2/stocks/{symbol.upper()}/snapshot", {"feed": "iex"})
    except Exception:
        return None


# --- CRIPTO -------------------------------------------------------------------
def crypto_bars(ticker: str, timeframe: str = "1Min", lookback_min: int = 1500,
                limit: int = 10000) -> list[dict]:
    pair = crypto_pair(ticker)
    start = _utc_iso(datetime.now(timezone.utc) - timedelta(minutes=lookback_min))
    try:
        j = _get(f"{_DATA}/v1beta3/crypto/us/bars", {
            "symbols": pair, "timeframe": timeframe, "start": start,
            "limit": limit, "sort": "asc",
        })
    except Exception:
        return []
    return (j.get("bars") or {}).get(pair) or []


def crypto_trades(ticker: str, lookback_min: int = 120, limit: int = 10000) -> list[dict]:
    pair = crypto_pair(ticker)
    start = _utc_iso(datetime.now(timezone.utc) - timedelta(minutes=lookback_min))
    out: list[dict] = []
    token: str | None = None
    try:
        for _ in range(5):
            params: dict[str, Any] = {
                "symbols": pair, "start": start, "limit": limit, "sort": "asc",
            }
            if token:
                params["page_token"] = token
            j = _get(f"{_DATA}/v1beta3/crypto/us/trades", params)
            out.extend((j.get("trades") or {}).get(pair) or [])
            token = j.get("next_page_token")
            if not token or len(out) >= limit:
                break
    except Exception:
        return out
    return out


def crypto_orderbook(ticker: str) -> dict | None:
    """Libro de órdenes REAL (snapshot). Devuelve {'b':[{p,s}...], 'a':[{p,s}...]}."""
    pair = crypto_pair(ticker)
    try:
        j = _get(f"{_DATA}/v1beta3/crypto/us/latest/orderbooks", {"symbols": pair})
    except Exception:
        return None
    return (j.get("orderbooks") or {}).get(pair)
