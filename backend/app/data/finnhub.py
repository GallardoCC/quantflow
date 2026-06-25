"""
Cliente Finnhub — tiempo real y noticias.

Rol en QuantFlow: la fuente "viva" de la terminal.
- `quote()`  -> snapshot rápido (precio, cambio %, OHLC del día) con latencia baja;
               sirve como respaldo de FMP y para refrescos frecuentes.
- `company_news()` -> noticias por ticker (análisis fundamental).
- `market_news()`  -> titulares generales del mercado en vivo.

Free tier: 60 req/min. Solo lectura. Degrada a None/[] si no hay key o falla,
para no obstruir al resto de fuentes (FMP, yfinance, Alpha Vantage).
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

_KEY = os.getenv("FINNHUB_API_KEY", "")
_BASE = "https://finnhub.io/api/v1"


def available() -> bool:
    return bool(_KEY)


def _get(path: str, params: dict[str, Any]) -> Any:
    params = {**params, "token": _KEY}
    r = requests.get(f"{_BASE}/{path}", params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def quote(symbol: str) -> dict | None:
    """Snapshot en vivo: precio actual, cambio, OHLC del día.

    Devuelve formato normalizado o None. Finnhub responde {c,d,dp,h,l,o,pc,t};
    cuando el símbolo no existe llega todo en 0 -> lo tratamos como None.
    """
    if not _KEY:
        return None
    try:
        d = _get("quote", {"symbol": symbol.upper()})
    except Exception:
        return None
    price = d.get("c")
    if not price:  # 0 o None => sin datos para ese símbolo en free tier
        return None
    return {
        "price": price,
        "change": d.get("d"),
        "changePercentage": d.get("dp"),
        "dayHigh": d.get("h"),
        "dayLow": d.get("l"),
        "open": d.get("o"),
        "previousClose": d.get("pc"),
        "timestamp": d.get("t"),
    }


def _fmt_news(rows: list[dict], limit: int) -> list[dict]:
    out = []
    for r in rows[:limit]:
        out.append(
            {
                "id": r.get("id"),
                "headline": r.get("headline"),
                "summary": r.get("summary"),
                "source": r.get("source"),
                "url": r.get("url"),
                "image": r.get("image") or None,
                "datetime": r.get("datetime"),
                "category": r.get("category"),
                "related": r.get("related"),
            }
        )
    return out


def company_news(symbol: str, days: int = 7, limit: int = 20) -> list[dict]:
    """Noticias de un ticker en los últimos `days` días (solo acciones US en free)."""
    if not _KEY:
        return []
    to = datetime.now(timezone.utc).date()
    frm = to - timedelta(days=days)
    try:
        rows = _get(
            "company-news",
            {"symbol": symbol.upper(), "from": frm.isoformat(), "to": to.isoformat()},
        )
    except Exception:
        return []
    if not isinstance(rows, list):
        return []
    return _fmt_news(rows, limit)


def market_news(category: str = "general", limit: int = 25) -> list[dict]:
    """Titulares generales del mercado en vivo (general, forex, crypto, merger)."""
    if not _KEY:
        return []
    try:
        rows = _get("news", {"category": category})
    except Exception:
        return []
    if not isinstance(rows, list):
        return []
    return _fmt_news(rows, limit)
