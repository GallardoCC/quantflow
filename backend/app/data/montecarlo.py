"""
Monte Carlo price simulation — Geometric Brownian Motion (GBM).

Uses 2 years of daily log-returns to calibrate μ (drift) and σ (volatility),
then simulates N paths over H future trading days. Pure Python, no numpy.
Results are cached in-process (deterministic seed = 42).
"""
from __future__ import annotations

import math
import random
from datetime import date, timedelta

from app.data import market

_CACHE: dict[tuple, dict] = {}


def _biz_dates(start: date, n: int) -> list[str]:
    out: list[str] = []
    d = start
    while len(out) < n:
        d += timedelta(1)
        if d.weekday() < 5:
            out.append(d.isoformat())
    return out


def _pct(sv: list[float], p: float) -> float:
    """Linear-interpolated percentile of a pre-sorted list."""
    i = (len(sv) - 1) * p / 100
    lo, hi = int(i), min(int(i) + 1, len(sv) - 1)
    return sv[lo] + (sv[hi] - sv[lo]) * (i - lo)


def simulate(ticker: str, days: int = 252, sims: int = 1000) -> dict:
    """
    Run GBM Monte Carlo on `ticker`.

    Returns fan percentile paths, final-price distribution, and risk metrics.
    All monetary values are in the ticker's native currency.
    Return percentages are expressed as % (e.g. -12.3 means −12.3%).
    """
    key = (ticker.upper(), days, sims)
    if key in _CACHE:
        return _CACHE[key]

    # --- Fetch 2y of daily closes for calibration ---
    hist = market.get_history(ticker, "2y")
    prices = [c["close"] for c in hist["candles"] if c.get("close")]
    if len(prices) < 60:
        raise ValueError(f"Not enough price history for {ticker} (need ≥ 60 days)")

    cur = prices[-1]

    # Try to get a human-readable name from the quote
    try:
        q = market.get_quote(ticker)
        name = q.get("name") or ticker.upper()
    except Exception:
        name = ticker.upper()

    # --- Calibrate: mean and std of daily log-returns ---
    log_r = [math.log(prices[i] / prices[i - 1]) for i in range(1, len(prices))]
    N = len(log_r)
    mu = sum(log_r) / N
    var = sum((r - mu) ** 2 for r in log_r) / (N - 1)
    sig = math.sqrt(var)

    # GBM drift-corrected step (Ito correction): (μ − σ²/2)·Δt + σ·√Δt·ε
    drift = mu - 0.5 * var  # Δt = 1 trading day

    rng = random.Random(42)  # deterministic for reproducibility

    def _randn() -> float:
        u = rng.random() or 1e-10
        return math.sqrt(-2.0 * math.log(u)) * math.cos(2.0 * math.pi * rng.random())

    # --- Simulate ---
    paths: list[list[float]] = []
    for _ in range(sims):
        p, path = cur, [cur]
        for _ in range(days):
            p = p * math.exp(drift + sig * _randn())
            path.append(p)
        paths.append(path)

    # --- Fan bands: percentiles at each time step ---
    fan: dict[str, list[float]] = {k: [] for k in ("p5", "p25", "p50", "p75", "p95")}
    for step in range(days + 1):
        col = sorted(paths[s][step] for s in range(sims))
        for k, p in [("p5", 5), ("p25", 25), ("p50", 50), ("p75", 75), ("p95", 95)]:
            fan[k].append(round(_pct(col, p), 2))

    # --- Final price distribution ---
    finals = sorted(paths[s][days] for s in range(sims))
    final = {k: round(_pct(finals, p), 2)
             for k, p in [("p5", 5), ("p10", 10), ("p25", 25), ("p50", 50),
                           ("p75", 75), ("p90", 90), ("p95", 95)]}
    final["mean"] = round(sum(finals) / sims, 2)

    # --- Risk metrics ---
    gains = sum(1 for f in finals if f > cur)
    rets = sorted(f / cur - 1 for f in finals)

    def _vc(cl: float) -> tuple[float, float]:
        idx = max(1, int((1 - cl) * sims))
        v = round(rets[idx] * 100, 2)
        cv = round(sum(rets[:idx]) / idx * 100, 2)
        return v, cv

    v90, c90 = _vc(0.90)
    v95, c95 = _vc(0.95)
    v99, c99 = _vc(0.99)

    # --- Histogram (40 equal-width bins over the final distribution) ---
    lo_b, hi_b = finals[0], finals[-1]
    bw = (hi_b - lo_b) / 40 if hi_b > lo_b else 1.0
    distribution = []
    for i in range(40):
        blo = lo_b + i * bw
        cnt = sum(1 for f in finals if blo <= f < blo + bw)
        distribution.append({
            "lo": round(blo, 2),
            "hi": round(blo + bw, 2),
            "mid": round(blo + bw / 2, 2),
            "count": cnt,
            "pct": round(cnt / sims * 100, 1),
        })

    today = date.today()
    result: dict = {
        "ticker": ticker.upper(),
        "name": name,
        "current_price": round(cur, 2),
        "days": days,
        "sims": sims,
        "annualized_return": round(mu * 252 * 100, 2),   # % / year
        "annualized_vol": round(sig * math.sqrt(252) * 100, 2),  # % / year
        "fan": {"dates": [today.isoformat()] + _biz_dates(today, days), **fan},
        "final": final,
        "distribution": distribution,
        "metrics": {
            "prob_gain": round(gains / sims, 4),
            "expected_return": round((final["mean"] / cur - 1) * 100, 2),
            "var_90": v90, "cvar_90": c90,
            "var_95": v95, "cvar_95": c95,
            "var_99": v99, "cvar_99": c99,
            "best_case_pct": round((final["p95"] / cur - 1) * 100, 2),
            "worst_case_pct": round((final["p5"] / cur - 1) * 100, 2),
        },
    }
    _CACHE[key] = result
    return result
