"""
Capa de datos de mercado — QuantFlow.

Una sola responsabilidad: traer datos limpios y normalizados de cualquier ticker
(acción, ETF, cripto o futuro) usando yfinance como backbone. Sin keys.

Todo lo que sale de aquí ya viene en formato JSON-friendly y con el tipo de activo
clasificado, para que el resto de la app no tenga que saber nada de yfinance.
"""
from __future__ import annotations

import math
import time
from typing import Any

import yfinance as yf

from app.data import alphavantage, finnhub, fmp

# --- Caché en memoria con TTL -------------------------------------------------
# Evita martillar a Yahoo cuando el usuario pide el mismo ticker varias veces.
_CACHE: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str, ttl: float) -> Any | None:
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < ttl:
        return hit[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.time(), value)


def _clean(x: Any) -> Any:
    """NaN/inf -> None para que el JSON no reviente en el frontend."""
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    return x


# --- Clasificación de activo --------------------------------------------------
def classify(ticker: str, info: dict) -> str:
    """Devuelve: stock | etf | crypto | future | forex | index | unknown."""
    qt = (info.get("quoteType") or "").upper()
    mapping = {
        "EQUITY": "stock",
        "ETF": "etf",
        "CRYPTOCURRENCY": "crypto",
        "FUTURE": "future",
        "CURRENCY": "forex",
        "INDEX": "index",
        "MUTUALFUND": "etf",
    }
    if qt in mapping:
        return mapping[qt]
    # Heurística por símbolo cuando Yahoo no da quoteType
    t = ticker.upper()
    if t.endswith("=F"):
        return "future"
    if t.endswith("=X"):
        return "forex"
    if "-USD" in t or "-USDT" in t:
        return "crypto"
    if t.startswith("^"):
        return "index"
    return "unknown"


def _classify_fmp(ticker: str, row: dict) -> str:
    """Clasifica usando el exchange de FMP + heurística por símbolo."""
    exch = (row.get("exchange") or "").upper()
    if exch in ("CRYPTO", "CCC"):
        return "crypto"
    if exch in ("COMMODITY", "FUTURES"):
        return "future"
    if exch == "FOREX":
        return "forex"
    # Heurística por símbolo como respaldo
    t = ticker.upper()
    if t.endswith("=F"):
        return "future"
    if t.endswith("=X") or t.endswith("USD") and len(t) == 6:
        return "forex"
    if "-USD" in t or t.endswith("USD"):
        return "crypto"
    if t.startswith("^"):
        return "index"
    return "stock"


# --- API pública de la capa ---------------------------------------------------
def get_quote(ticker: str) -> dict:
    """Snapshot actual: precio, cambio, rango del día, métricas clave.

    Fuente principal: FMP (datos ricos en una llamada). Respaldo: yfinance.
    """
    key = f"quote:{ticker.upper()}"
    cached = _cache_get(key, ttl=15)  # cotizaciones: 15s
    if cached:
        return cached

    # 1) Intento FMP (mejor cobertura y datos en una sola llamada)
    row = fmp.quote(ticker)
    if row and row.get("price") is not None:
        result = {
            "ticker": ticker.upper(),
            "name": row.get("name") or ticker.upper(),
            "assetType": _classify_fmp(ticker, row),
            "currency": row.get("currency") or "USD",
            "exchange": row.get("exchange"),
            "price": _clean(row.get("price")),
            "previousClose": _clean(row.get("previousClose")),
            "change": _clean(row.get("change")),
            "changePercent": _clean(row.get("changePercentage")),
            "dayHigh": _clean(row.get("dayHigh")),
            "dayLow": _clean(row.get("dayLow")),
            "open": _clean(row.get("open")),
            "volume": _clean(row.get("volume")),
            "marketCap": _clean(row.get("marketCap")),
            "fiftyTwoWeekHigh": _clean(row.get("yearHigh")),
            "fiftyTwoWeekLow": _clean(row.get("yearLow")),
            # FMP `stable/quote` NO incluye P/E (sus claves no traen 'pe').
            # El P/E TTM vive en `stable/ratios-ttm` -> priceToEarningsRatioTTM.
            "peRatio": _clean(fmp.pe_ratio(ticker)),
            "priceAvg50": _clean(row.get("priceAvg50")),
            "priceAvg200": _clean(row.get("priceAvg200")),
            "sector": None,
            "industry": None,
            "source": "fmp",
        }
        _cache_set(key, result)
        return result

    # 2) Respaldo intermedio: Finnhub (rápido, en vivo). Sirve sobre todo para
    #    acciones US cuando FMP no responde. No trae nombre/marketCap.
    fh = finnhub.quote(ticker)
    if fh and fh.get("price"):
        change = fh.get("change")
        result = {
            "ticker": ticker.upper(),
            "name": ticker.upper(),
            "assetType": classify(ticker, {}),
            "currency": "USD",
            "exchange": None,
            "price": _clean(fh.get("price")),
            "previousClose": _clean(fh.get("previousClose")),
            "change": _clean(change),
            "changePercent": _clean(fh.get("changePercentage")),
            "dayHigh": _clean(fh.get("dayHigh")),
            "dayLow": _clean(fh.get("dayLow")),
            "open": _clean(fh.get("open")),
            "volume": None,
            "marketCap": None,
            "fiftyTwoWeekHigh": None,
            "fiftyTwoWeekLow": None,
            "peRatio": None,
            "priceAvg50": None,
            "priceAvg200": None,
            "sector": None,
            "industry": None,
            "source": "finnhub",
        }
        _cache_set(key, result)
        return result

    # 3) Respaldo final: yfinance
    tk = yf.Ticker(ticker)
    info = tk.info or {}
    if not info or info.get("quoteType") is None:
        raise ValueError(f"Ticker no encontrado: {ticker}")

    price = info.get("currentPrice") or info.get("regularMarketPrice")
    prev = info.get("previousClose") or info.get("regularMarketPreviousClose")
    change = (price - prev) if (price is not None and prev is not None) else None
    change_pct = (change / prev * 100) if (change is not None and prev) else None

    result = {
        "ticker": ticker.upper(),
        "name": info.get("shortName") or info.get("longName") or ticker.upper(),
        "assetType": classify(ticker, info),
        "currency": info.get("currency"),
        "exchange": info.get("fullExchangeName") or info.get("exchange"),
        "price": _clean(price),
        "previousClose": _clean(prev),
        "change": _clean(change),
        "changePercent": _clean(change_pct),
        "dayHigh": _clean(info.get("dayHigh")),
        "dayLow": _clean(info.get("dayLow")),
        "open": _clean(info.get("open") or info.get("regularMarketOpen")),
        "volume": _clean(info.get("volume") or info.get("regularMarketVolume")),
        "marketCap": _clean(info.get("marketCap")),
        "fiftyTwoWeekHigh": _clean(info.get("fiftyTwoWeekHigh")),
        "fiftyTwoWeekLow": _clean(info.get("fiftyTwoWeekLow")),
        "peRatio": _clean(info.get("trailingPE")),
        "priceAvg50": _clean(info.get("fiftyDayAverage")),
        "priceAvg200": _clean(info.get("twoHundredDayAverage")),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "source": "yfinance",
    }
    _cache_set(key, result)
    return result


# rango -> (period, interval) para yfinance
_RANGES = {
    "1d": ("1d", "5m"),
    "5d": ("5d", "15m"),
    "1mo": ("1mo", "1d"),
    "3mo": ("3mo", "1d"),
    "6mo": ("6mo", "1d"),
    "1y": ("1y", "1d"),
    "2y": ("2y", "1d"),
    "3y": ("3y", "1d"),
    "5y": ("5y", "1wk"),
    "max": ("max", "1mo"),
}


def get_history(ticker: str, range_: str = "1y") -> dict:
    """OHLCV normalizado para graficar velas."""
    range_ = range_ if range_ in _RANGES else "1y"
    key = f"hist:{ticker.upper()}:{range_}"
    cached = _cache_get(key, ttl=60)  # histórico: 60s
    if cached:
        return cached

    period, interval = _RANGES[range_]
    df = yf.Ticker(ticker).history(period=period, interval=interval)
    if df.empty:
        raise ValueError(f"Sin datos históricos para: {ticker}")

    candles = []
    for idx, row in df.iterrows():
        o, h, l, c = row["Open"], row["High"], row["Low"], row["Close"]
        # Saltar velas con cualquier OHLC nulo: rompen el gráfico ("bug" al digitar).
        if any(v is None or (isinstance(v, float) and math.isnan(v)) for v in (o, h, l, c)):
            continue
        vol = row["Volume"]
        candles.append(
            {
                "time": int(idx.timestamp()),
                "open": round(float(o), 4),
                "high": round(float(h), 4),
                "low": round(float(l), 4),
                "close": round(float(c), 4),
                "volume": int(vol) if not (isinstance(vol, float) and math.isnan(vol)) else 0,
            }
        )

    if not candles:
        raise ValueError(f"Sin datos válidos para: {ticker}")

    result = {"ticker": ticker.upper(), "range": range_, "interval": interval, "candles": candles}
    _cache_set(key, result)
    return result


def search(query: str) -> list[dict]:
    """Búsqueda de símbolos para autocompletado. FMP principal, yfinance respaldo."""
    if not query.strip():
        return []
    # 1) FMP (mejores nombres y cobertura)
    fmp_results = fmp.search(query, limit=10)
    if fmp_results:
        return [
            {
                "symbol": r["symbol"],
                "name": r.get("name"),
                "type": "",
                "exchange": r.get("exchange"),
            }
            for r in fmp_results
        ]
    # 2) Respaldo yfinance
    try:
        res = yf.Search(query, max_results=10)
        out = []
        for q in res.quotes:
            out.append(
                {
                    "symbol": q.get("symbol"),
                    "name": q.get("shortname") or q.get("longname"),
                    "type": (q.get("quoteType") or "").lower(),
                    "exchange": q.get("exchDisp"),
                }
            )
        return [o for o in out if o["symbol"]]
    except Exception:
        return []


# --- Tiempo real (Finnhub) ----------------------------------------------------
def get_realtime(ticker: str) -> dict:
    """Snapshot en vivo y ligero para refrescos frecuentes (precio/cambio/OHLC día).

    Fuente: Finnhub. Pensado para hacer polling cada pocos segundos sin gastar el
    cupo de FMP. Cache muy corta (3s) para amortiguar ráfagas de clics.
    """
    key = f"rt:{ticker.upper()}"
    cached = _cache_get(key, ttl=3)
    if cached:
        return cached
    fh = finnhub.quote(ticker)
    if not fh or not fh.get("price"):
        raise ValueError(f"Sin tiempo real para: {ticker}")
    result = {
        "ticker": ticker.upper(),
        "price": _clean(fh.get("price")),
        "change": _clean(fh.get("change")),
        "changePercent": _clean(fh.get("changePercentage")),
        "dayHigh": _clean(fh.get("dayHigh")),
        "dayLow": _clean(fh.get("dayLow")),
        "open": _clean(fh.get("open")),
        "previousClose": _clean(fh.get("previousClose")),
        "timestamp": fh.get("timestamp"),
        "source": "finnhub",
    }
    _cache_set(key, result)
    return result


# --- Noticias (Finnhub) -------------------------------------------------------
def get_news(ticker: str | None = None, days: int = 7, limit: int = 20) -> dict:
    """Noticias por ticker; si no se pasa ticker, titulares generales del mercado."""
    if ticker:
        key = f"news:{ticker.upper()}:{days}"
        cached = _cache_get(key, ttl=300)  # 5 min
        if cached:
            return cached
        items = finnhub.company_news(ticker, days=days, limit=limit)
        result = {"scope": "company", "ticker": ticker.upper(), "items": items}
        _cache_set(key, result)
        return result
    key = "news:market"
    cached = _cache_get(key, ttl=300)
    if cached:
        return cached
    items = finnhub.market_news(limit=limit)
    result = {"scope": "market", "ticker": None, "items": items}
    _cache_set(key, result)
    return result


# --- Indicadores técnicos (Alpha Vantage) -------------------------------------
def get_indicator(
    ticker: str,
    name: str,
    interval: str = "daily",
    time_period: int = 14,
    series_type: str = "close",
) -> dict:
    """Serie de un indicador técnico (RSI, SMA, EMA, MACD, BBANDS, ADX, STOCH).

    Fuente: Alpha Vantage (calcula en su servidor). Free tier 25/día -> uso bajo
    demanda y cacheado en el cliente alphavantage.
    """
    if name.lower() not in alphavantage.INDICATORS:
        raise ValueError(
            f"Indicador no soportado: {name}. Disponibles: "
            + ", ".join(sorted(alphavantage.INDICATORS))
        )
    data = alphavantage.indicator(
        ticker, name, interval=interval, time_period=time_period, series_type=series_type
    )
    if data is None:
        raise ValueError(
            f"Sin datos de indicador para {ticker} ({name}). "
            "Puede ser límite diario de Alpha Vantage (25/día) o símbolo no soportado."
        )
    return data


# --- Estado de las fuentes ----------------------------------------------------
def sources_status() -> dict:
    """Qué fuentes están configuradas (para /api/health y diagnóstico)."""
    return {
        "fmp": fmp.available(),
        "finnhub": finnhub.available(),
        "alphavantage": alphavantage.available(),
        "yfinance": True,  # no requiere key
    }
