"""
Cliente FMP (Financial Modeling Prep) — endpoints "stable".

Fuente principal de QuantFlow para cotización y búsqueda: devuelve datos ricos
(nombre, marketCap, máx/mín año, medias) en una sola llamada, y para todas las
clases de activo (acción, ETF, futuro, cripto). Histórico de velas lo sigue
dando yfinance (intradía OHLC).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_KEY = os.getenv("FMP_API_KEY", "")
_BASE = "https://financialmodelingprep.com/stable"


def available() -> bool:
    return bool(_KEY)


def _get(path: str, params: dict[str, Any]) -> Any:
    params = {**params, "apikey": _KEY}
    r = requests.get(f"{_BASE}/{path}", params=params, timeout=10)
    r.raise_for_status()
    data = r.json()
    if isinstance(data, dict) and data.get("Error Message"):
        raise RuntimeError(data["Error Message"])
    return data


def quote(symbol: str) -> dict | None:
    """Cotización rica de FMP. None si no hay datos o no hay key."""
    if not _KEY:
        return None
    try:
        data = _get("quote", {"symbol": symbol})
    except Exception:
        return None
    if not data:
        return None
    return data[0]


def pe_ratio(symbol: str) -> float | None:
    """P/E (TTM) de FMP. None si no hay datos o no hay key.

    El endpoint `stable/quote` NO trae P/E (sus claves son: symbol, name, price,
    change, changePercentage, dayHigh/Low, yearHigh/Low, open, previousClose,
    volume, marketCap, priceAvg50/200, exchange, timestamp). El P/E vive en
    `stable/ratios-ttm` bajo la clave `priceToEarningsRatioTTM`.
    """
    if not _KEY:
        return None
    try:
        data = _get("ratios-ttm", {"symbol": symbol})
    except Exception:
        return None
    if not data:
        return None
    row = data[0] if isinstance(data, list) else data
    if not isinstance(row, dict):
        return None
    return row.get("priceToEarningsRatioTTM")


def economic_calendar(date_from: str, date_to: str) -> list[dict]:
    """Calendario económico REAL de FMP (stable/economic-calendar).

    A diferencia de las fechas de release de FRED (solo nombre+fecha), FMP trae la
    capa de impacto de mercado que pide la sección Macro: valor `previous`,
    consenso `estimate` y `actual`, además del país y el nivel de `impact`
    (High/Medium/Low). Esto alimenta el calendario rediseñado.

    Devuelve [] si no hay key o si el endpoint no está disponible en el plan
    (entonces el orquestador cae al calendario de FRED). NUNCA inventa cifras.
    """
    if not _KEY:
        return []
    try:
        rows = _get("economic-calendar", {"from": date_from, "to": date_to})
    except Exception:
        return []
    if not isinstance(rows, list):
        return []
    out: list[dict] = []
    for r in rows:
        out.append(
            {
                "date": r.get("date"),
                "country": r.get("country"),
                "event": r.get("event"),
                "currency": r.get("currency"),
                "previous": r.get("previous"),
                "estimate": r.get("estimate"),
                "actual": r.get("actual"),
                "change": r.get("change"),
                "changePercent": r.get("changePercentage"),
                "impact": r.get("impact"),
                "unit": r.get("unit"),
            }
        )
    return out


def search(query: str, limit: int = 10) -> list[dict]:
    """Sugerencias para autocompletado: símbolo + nombre + exchange.

    Combina búsqueda por símbolo y por nombre para cubrir 'BTC' y 'bitcoin'.
    """
    if not _KEY or not query.strip():
        return []
    seen: set[str] = set()
    out: list[dict] = []
    for endpoint in ("search-symbol", "search-name"):
        try:
            rows = _get(endpoint, {"query": query, "limit": limit})
        except Exception:
            rows = []
        for row in rows:
            sym = row.get("symbol")
            if not sym or sym in seen:
                continue
            seen.add(sym)
            out.append(
                {
                    "symbol": sym,
                    "name": row.get("name"),
                    "exchange": row.get("exchange") or row.get("exchangeFullName"),
                    "currency": row.get("currency"),
                }
            )
        if len(out) >= limit:
            break

    # Ranking de relevancia: match exacto primero, luego listados primarios
    # (sin sufijo .XX como .DE/.MX), luego los que empiezan por la query.
    q = query.upper()
    primary_exch = {"NASDAQ", "NYSE", "AMEX", "CRYPTO", "CBOE", "COMMODITY", "FOREX"}

    def rank(r: dict) -> tuple:
        sym = (r["symbol"] or "").upper()
        return (
            sym != q,                       # exacto primero
            "." in sym,                     # listados extranjeros después
            (r.get("exchange") or "").upper() not in primary_exch,
            not sym.startswith(q),          # prefijo de la query
            len(sym),                       # símbolos cortos primero
        )

    out.sort(key=rank)
    return out[:limit]
