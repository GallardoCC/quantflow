"""
Indicador de REGRESIÓN A LA MEDIA (mean reversion) — QuantFlow.

Matemática pura sobre los cierres históricos de un ticker. Trabaja sobre el
log-precio y = ln(p), ajusta una tendencia lineal por mínimos cuadrados, mide la
desviación residual y construye bandas (±1σ, ±2σ) alrededor de la línea de
equilibrio. Sobre los residuos ajusta un AR(1) para estimar la half-life de
reversión y decidir si el activo realmente revierte a la media o solo tiene
tendencia.

Solo ANÁLISIS: emite un veredicto y una señal (BARATO/CARO, BUY/SELL...) pero
nunca ejecuta órdenes ni habla con ningún broker.

Sin dependencias extra: todo en Python puro (módulo math). Reutiliza
market.get_history para obtener los precios (no llama a yfinance directo).
"""
from __future__ import annotations

import math
import time
from typing import Any

from app.data import market

# --- Caché en memoria con TTL (mismo patrón que market.py) --------------------
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


def _round(x: float | None) -> float | None:
    """Redondea a 4 decimales saneando NaN/inf -> None."""
    if x is None:
        return None
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    return round(float(x), 4)


# --- Periodos por año según el interval (para anualizar la deriva y half-life) -
# El interval lo decide market.get_history a partir del rango pedido.
_PERIODS_PER_YEAR = {
    "5m": 252,    # intradía: aproximamos a barras diarias (252 por año)
    "15m": 252,
    "1d": 252,
    "1wk": 52,
    "1mo": 12,
}

# Días de calendario que representa una barra de cada interval (para half-life).
_BAR_DAYS = {
    "5m": 1.0,    # intradía -> tratamos cada barra como fracción diaria aprox.
    "15m": 1.0,
    "1d": 1.0,
    "1wk": 7.0,
    "1mo": 30.0,
}


def mean_reversion(ticker: str, range_: str = "1y") -> dict:
    """Análisis de regresión a la media sobre los cierres del rango pedido.

    Devuelve la serie punto a punto (precio, línea de equilibrio, bandas ±1σ/±2σ
    y z-score) más un bloque de estadísticas con el veredicto y la señal.
    """
    key = f"meanrev:{ticker.upper()}:{range_}"
    cached = _cache_get(key, ttl=60)
    if cached:
        return cached

    hist = market.get_history(ticker, range_)
    interval = hist["interval"]
    candles = hist["candles"]

    # 1) Filtrar cierres válidos: nada de None/NaN/<=0 (ln no admite <=0).
    times: list[int] = []
    prices: list[float] = []
    for c in candles:
        px = c.get("close")
        if px is None:
            continue
        if isinstance(px, float) and (math.isnan(px) or math.isinf(px)):
            continue
        if px <= 0:
            continue
        times.append(int(c["time"]))
        prices.append(float(px))

    n = len(prices)
    if n < 10:
        raise ValueError(f"Pocos datos para regresión a la media: {ticker}")

    # Log-precio: trabajamos toda la regresión sobre y = ln(p).
    ys = [math.log(p) for p in prices]

    # 2) Regresión lineal por mínimos cuadrados de y sobre t = 0,1,...,N-1.
    t_mean = (n - 1) / 2.0          # media de 0..N-1
    y_mean = sum(ys) / n
    sxx = 0.0  # Σ(t-t̄)²
    sxy = 0.0  # Σ(t-t̄)(y-ȳ)
    for t in range(n):
        dt = t - t_mean
        sxx += dt * dt
        sxy += dt * (ys[t] - y_mean)
    b = sxy / sxx                   # pendiente
    a = y_mean - b * t_mean         # intercepto

    # 3) Residuos r_t = y_t - (a + b·t) y desviación residual σ (dof = N-2).
    resid = [ys[t] - (a + b * t) for t in range(n)]
    sse = sum(r * r for r in resid)                 # Σ r²
    sigma = math.sqrt(sse / (n - 2)) if n > 2 else 0.0

    # 5) R² del ajuste de tendencia: 1 - Σr² / Σ(y-ȳ)².
    sst = sum((y - y_mean) ** 2 for y in ys)        # Σ(y-ȳ)²
    r_squared = (1.0 - sse / sst) if sst > 0 else 0.0

    # 6) Deriva anualizada: pendiente · periodos/año (fracción, p.ej. 0.12=12%/año).
    periods_per_year = _PERIODS_PER_YEAR.get(interval, 252)
    slope_annual = b * periods_per_year

    # 7) Half-life vía AR(1) sobre los residuos: r_t = φ·r_{t-1} + ε (sin intercepto).
    num = 0.0  # Σ r_{t-1}·r_t
    den = 0.0  # Σ r_{t-1}²
    for t in range(1, n):
        num += resid[t - 1] * resid[t]
        den += resid[t - 1] * resid[t - 1]
    phi = num / den if den > 0 else 0.0

    if 0.0 < phi < 1.0:
        half_life_bars = -math.log(2) / math.log(phi)   # en nº de barras
        bar_days = _BAR_DAYS.get(interval, 1.0)
        half_life_days = half_life_bars * bar_days
        is_mean_reverting = True
    else:
        # φ ≥ 1 -> tendencia (no revierte); φ ≤ 0 -> sin estructura AR(1) válida.
        half_life_bars = None
        half_life_days = None
        is_mean_reverting = False

    # 4) z-score por punto: z_t = r_t / σ.  z actual = último punto.
    if sigma > 0:
        zscores = [r / sigma for r in resid]
    else:
        zscores = [0.0 for _ in resid]
    z_now = zscores[-1]

    # 8) Veredicto y señal según el z actual.
    if z_now <= -2:
        verdict, verdict_score, signal = "INFRAVALORADO", -2, "BUY"
    elif z_now <= -1:
        verdict, verdict_score, signal = "BARATO", -1, "WATCH_BUY"
    elif z_now < 1:
        verdict, verdict_score, signal = "EQUILIBRIO", 0, "NEUTRAL"
    elif z_now < 2:
        verdict, verdict_score, signal = "CARO", 1, "WATCH_SELL"
    else:
        verdict, verdict_score, signal = "SOBREVALORADO", 2, "SELL"

    # Serie punto a punto: precio real + línea de equilibrio + bandas ±1σ/±2σ.
    points = []
    for t in range(n):
        center = a + b * t  # en log
        points.append(
            {
                "time": times[t],
                "price": _round(prices[t]),
                "mean": _round(math.exp(center)),
                "upper1": _round(math.exp(center + sigma)),
                "lower1": _round(math.exp(center - sigma)),
                "upper2": _round(math.exp(center + 2 * sigma)),
                "lower2": _round(math.exp(center - 2 * sigma)),
                "z": _round(zscores[t]),
            }
        )

    result = {
        "ticker": ticker.upper(),
        "range": hist["range"],
        "interval": interval,
        "points": points,
        "stats": {
            "zScore": _round(z_now),
            "halfLife": _round(half_life_days),
            "halfLifeBars": _round(half_life_bars),
            "sigma": _round(sigma),
            "slopeAnnual": _round(slope_annual),
            "rSquared": _round(r_squared),
            "phi": _round(phi),
            "isMeanReverting": is_mean_reverting,
            "verdict": verdict,
            "verdictScore": verdict_score,
            "signal": signal,
        },
    }
    _cache_set(key, result)
    return result
