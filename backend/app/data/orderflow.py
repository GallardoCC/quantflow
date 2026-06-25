"""
Motor de ORDER FLOW v2 — QuantFlow.

Microestructura de mercado estilo ATAS/Bookmap. Toma la granularidad de Alpaca
(trades + barras intradía + orderbook cripto real) y, para horizontes largos,
barras diarias/semanales de yfinance (market.py). Calcula cada módulo y devuelve
EXACTAMENTE los contratos del §3 del prompt para que el frontend solo consuma JSON.

Arquitectura:
    DATA (alpaca.py / market.py) → LOADER unificado (tier + sesión + modo)
        → MÓDULOS (volume-profile, footprint, delta, heatmap, orderbook)
        → CAPA ML (orderflow_ml.py: régimen, anomalías, direccional)

DETECCIÓN DE TIER (nivel de datos, §1):
    T1  L2/MBO + tick con agresor   → todos los módulos reales   (cripto con orderbook)
    T2  tick/trades sin profundidad → footprint/delta/profile reales; heatmap+DOM approx
    T3  solo OHLCV                  → profile/CVD; footprint/heatmap/DOM por tick-rule (approx)

MODO (según timeframe):
    intraday  1D/1W  → trades/barras 1Min de Alpaca (footprint/heatmap reales si hay tier)
    composite 1M/1Y/5Y → barras diarias/semanales de yfinance, delta por tick-rule (approx)

Regla del tick (delta sin agresor): trade buy si price>prev, sell si <prev, == hereda.

⚠️ Solo análisis. Nunca ejecución ni señales automáticas.
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from typing import Any

from app.data import alpaca, market

_CACHE: dict[str, tuple[float, Any]] = {}


# ── utilidades ────────────────────────────────────────────────────────────────
def _cache_get(key: str, ttl: float) -> Any | None:
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < ttl:
        return hit[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.time(), value)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _ts(t: str | int | float) -> int:
    if isinstance(t, (int, float)):
        return int(t)
    s = str(t).replace("Z", "+00:00")
    try:
        return int(datetime.fromisoformat(s).timestamp())
    except Exception:
        return 0


def _nice_step(price_range: float, target: int = 48) -> float:
    if price_range <= 0:
        return 0.01
    raw = price_range / target
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 2, 2.5, 5, 10):
        if raw <= m * mag:
            return round(m * mag, 10)
    return 10 * mag


def _bin(price: float, step: float) -> float:
    return round(round(price / step) * step, 10)


# ── timeframes y sesiones ─────────────────────────────────────────────────────
# tf → (modo, parámetro). intraday usa lookback en minutos; composite usa rango yf.
_TF = {
    "1D": ("intraday", 1, "1y"),     # 1 sesión de trades + barras 1Min
    "1W": ("intraday", 5, "2y"),     # ~1 semana de barras 1Min
    "1M": ("composite", 30, "1mo"),  # barras diarias
    "1Y": ("composite", 252, "1y"),
    "5Y": ("composite", 1300, "5y"),
}

# sesiones en horas UTC [inicio, fin). NY/RTH = 13:30–20:00 UTC (horario regular EST/EDT aprox).
_SESSIONS = {
    "Asia":   (0.0, 9.0),
    "London": (7.0, 16.0),
    "NY":     (13.5, 20.0),
    "RTH":    (13.5, 20.0),
    "24h":    (0.0, 24.0),
}


def _in_session(epoch: int, session: str) -> bool:
    lo, hi = _SESSIONS.get(session, (0.0, 24.0))
    if lo == 0.0 and hi == 24.0:
        return True
    dt = datetime.fromtimestamp(epoch, tz=timezone.utc)
    h = dt.hour + dt.minute / 60.0
    return lo <= h < hi


# ── clasificación por regla del tick ──────────────────────────────────────────
def _classify(trades: list[dict]) -> list[dict]:
    out: list[dict] = []
    last_p: float | None = None
    sign = 1
    for tr in trades:
        p, s = tr.get("p"), tr.get("s")
        if p is None or s is None:
            continue
        p, s = float(p), float(s)
        if last_p is not None:
            if p > last_p:
                sign = 1
            elif p < last_p:
                sign = -1
        out.append({"t": _ts(tr.get("t")), "p": p, "s": s, "side": sign})
        last_p = p
    return out


# ══════════════════════════════════════════════════════════════════════════════
#  LOADER UNIFICADO — una sola lectura de datos para todos los módulos
# ══════════════════════════════════════════════════════════════════════════════
def load(ticker: str, tf: str = "1D", session: str = "24h") -> dict:
    """Devuelve el contexto de datos común: candles normalizados, trades clasificados
    (si hay), tier detectado, modo, precio de referencia, paso de precio."""
    tf = tf if tf in _TF else "1D"
    session = session if session in _SESSIONS else "24h"
    mode, param, yf_range = _TF[tf]

    key = f"of:load:{ticker.upper()}:{tf}:{session}"
    cached = _cache_get(key, ttl=20 if mode == "intraday" else 120)
    if cached:
        return cached

    is_cx = alpaca.is_crypto(ticker)

    # --- metadatos ---
    try:
        q = market.get_quote(ticker)
        price = float(q["price"]) if q.get("price") else None
        name = q.get("name") or ticker.upper()
        currency = q.get("currency") or "USD"
        asset_type = q.get("assetType") or ("crypto" if is_cx else "stock")
    except Exception:
        price, name, currency, asset_type = None, ticker.upper(), "USD", ("crypto" if is_cx else "stock")

    candles: list[dict] = []   # {t,o,h,l,c,v}
    trades: list[dict] = []    # {t,p,s,side}
    tier = "T3"
    has_book = False

    if mode == "intraday" and alpaca.available():
        look = param * 24 * 60 if is_cx else param * 7 * 60  # min: cripto 24h/día, acciones ~7h
        look = min(look, 4 * 1440)  # cap a ~4 días de barras 1Min
        if is_cx:
            raw_bars = alpaca.crypto_bars(ticker, lookback_min=look)
            raw_trades = alpaca.crypto_trades(ticker, lookback_min=min(look, 240))
            has_book = bool(alpaca.crypto_orderbook(ticker))
        else:
            raw_bars = alpaca.stock_bars(ticker, lookback_min=look)
            raw_trades = alpaca.stock_trades(ticker, lookback_min=min(look, 420))
        candles = [{
            "t": _ts(b["t"]), "o": float(b["o"]), "h": float(b["h"]),
            "l": float(b["l"]), "c": float(b["c"]), "v": float(b.get("v", 0)),
        } for b in raw_bars if _in_session(_ts(b["t"]), session)]
        ctr = [t for t in _classify(raw_trades) if _in_session(t["t"], session)]
        if len(ctr) >= 30:
            trades = ctr
            tier = "T1" if has_book else "T2"
        else:
            tier = "T1" if has_book else "T3"

    if not candles:
        # composite, o intraday sin datos → barras yfinance
        mode = "composite" if mode == "composite" or not candles else mode
        try:
            hist = market.get_history(ticker, yf_range)
            candles = [{
                "t": c["time"], "o": c["open"], "h": c["high"],
                "l": c["low"], "c": c["close"], "v": float(c.get("volume", 0)),
            } for c in hist["candles"]]
        except Exception:
            candles = []
        if not trades:
            tier = "T1" if (is_cx and has_book) else "T3"
        if mode == "intraday":
            mode = "composite"

    if not candles and not trades:
        raise ValueError(
            f"Sin datos de order flow para {ticker} "
            f"(mercado cerrado, símbolo no soportado o sin histórico)."
        )

    # precio de referencia
    if price is None:
        price = candles[-1]["c"] if candles else trades[-1]["p"]

    # paso de precio
    if candles:
        hi = max(c["h"] for c in candles); lo = min(c["l"] for c in candles)
    else:
        ps = [t["p"] for t in trades]; hi, lo = max(ps), min(ps)
    step = _nice_step(hi - lo)

    ctx = {
        "ticker": ticker.upper(), "name": name, "assetType": asset_type,
        "currency": currency, "tf": tf, "session": session,
        "mode": mode, "tier": tier, "isCrypto": is_cx, "hasBook": has_book,
        "price": round(price, 6), "step": step,
        "candles": candles, "trades": trades,
        "tStart": (candles[0]["t"] if candles else trades[0]["t"]),
        "tEnd": (candles[-1]["t"] if candles else trades[-1]["t"]),
        "nBars": len(candles), "nTrades": len(trades),
    }
    _cache_set(key, ctx)
    return ctx


# ══════════════════════════════════════════════════════════════════════════════
#  Agregación bid/ask por nivel — fuente común de profile y footprint
# ══════════════════════════════════════════════════════════════════════════════
def _levels_from_trades(trades: list[dict], step: float) -> dict[float, dict]:
    agg: dict[float, dict] = {}
    for t in trades:
        lv = agg.setdefault(_bin(t["p"], step), {"buyVol": 0.0, "sellVol": 0.0})
        if t["side"] > 0:
            lv["buyVol"] += t["s"]
        else:
            lv["sellVol"] += t["s"]
    return agg


def _levels_from_candle(c: dict, step: float) -> dict[float, dict]:
    """Tick-rule sobre una vela: reparte el volumen por niveles entre low y high,
    con sesgo compra/venta según la posición del cierre en el rango (approx §1)."""
    o, h, l, cl, v = c["o"], c["h"], c["l"], c["c"], c["v"]
    rng = max(h - l, 1e-9)
    buy_frac = _clamp((cl - l) / rng, 0.0, 1.0)
    lo_b, hi_b = _bin(l, step), _bin(h, step)
    n_lv = max(1, int(round((hi_b - lo_b) / step)) + 1)
    per = v / n_lv
    agg: dict[float, dict] = {}
    for k in range(n_lv):
        price = round(lo_b + k * step, 10)
        agg[price] = {"buyVol": per * buy_frac, "sellVol": per * (1 - buy_frac)}
    return agg


# ══════════════════════════════════════════════════════════════════════════════
#  MÓDULO: VOLUME PROFILE  (contrato §3)
# ══════════════════════════════════════════════════════════════════════════════
def _aggregate_profile(ctx: dict) -> dict[float, dict]:
    step = ctx["step"]
    agg: dict[float, dict] = {}
    if ctx["trades"]:
        agg = _levels_from_trades(ctx["trades"], step)
    else:
        for c in ctx["candles"]:
            for p, lv in _levels_from_candle(c, step).items():
                a = agg.setdefault(p, {"buyVol": 0.0, "sellVol": 0.0})
                a["buyVol"] += lv["buyVol"]; a["sellVol"] += lv["sellVol"]
    return agg


def volume_profile(ticker: str, tf: str = "1D", session: str = "24h") -> dict:
    ctx = load(ticker, tf, session)
    agg = _aggregate_profile(ctx)
    approx = not bool(ctx["trades"])
    if not agg:
        return _vp_payload(ctx, [], None, None, None, [], [], [], approx)

    prices = sorted(agg)
    vols = {p: agg[p]["buyVol"] + agg[p]["sellVol"] for p in prices}
    total = sum(vols.values()) or 1.0
    poc = max(prices, key=lambda p: vols[p])

    # value area 70% expandiendo desde el POC al vecino de mayor volumen
    poc_i = prices.index(poc)
    lo_i = hi_i = poc_i
    covered = vols[poc]
    target = 0.70 * total
    while covered < target and (lo_i > 0 or hi_i < len(prices) - 1):
        up = vols[prices[hi_i + 1]] if hi_i < len(prices) - 1 else -1
        dn = vols[prices[lo_i - 1]] if lo_i > 0 else -1
        if up >= dn:
            hi_i += 1; covered += up
        else:
            lo_i -= 1; covered += dn
    val, vah = prices[lo_i], prices[hi_i]

    avg = total / len(prices)
    hvn, lvn = [], []
    bins = []
    for p in prices:
        v = vols[p]
        if v >= 1.5 * avg:
            hvn.append(p)
        elif v <= 0.4 * avg:
            lvn.append(p)
        bins.append({
            "price": p, "vol": round(v, 2),
            "buyVol": round(agg[p]["buyVol"], 2), "sellVol": round(agg[p]["sellVol"], 2),
        })

    # naked POCs: POCs diarios históricos no revisitados después (solo en composite con velas)
    naked = _naked_pocs(ctx) if ctx["mode"] == "composite" else []
    return _vp_payload(ctx, bins, poc, vah, val, hvn, lvn, naked, approx, round(total, 2))


def _naked_pocs(ctx: dict, lookback: int = 60) -> list[float]:
    """POC diario aproximado por vela ((h+l+c)/3) que el precio no volvió a tocar."""
    cs = ctx["candles"][-lookback:]
    out = []
    for i, c in enumerate(cs[:-1]):
        poc = round((c["h"] + c["l"] + c["c"]) / 3, 6)
        revisited = any(later["l"] <= poc <= later["h"] for later in cs[i + 1:])
        if not revisited:
            out.append(poc)
    return out[-8:]


def _vp_payload(ctx, bins, poc, vah, val, hvn, lvn, naked, approx, total=0):
    return {
        "ticker": ctx["ticker"], "name": ctx["name"], "tf": ctx["tf"], "session": ctx["session"],
        "mode": ctx["mode"], "tier": ctx["tier"], "price": ctx["price"], "step": ctx["step"],
        "bins": sorted(bins, key=lambda b: b["price"], reverse=True),
        "poc": poc, "vah": vah, "val": val, "valueAreaPct": 0.7,
        "totalVol": total, "hvn": hvn, "lvn": lvn, "nakedPocs": naked, "approx": approx,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  MÓDULO: FOOTPRINT  (contrato §3)
# ══════════════════════════════════════════════════════════════════════════════
def _footprint_buckets(ctx: dict, n_buckets: int) -> list[dict]:
    step = ctx["step"]
    buckets: list[dict] = []

    if ctx["trades"]:
        tr = ctx["trades"]
        t0, t1 = tr[0]["t"], tr[-1]["t"]
        span = max(t1 - t0, 1)
        bsize = math.ceil(span / n_buckets)
        grouped: dict[int, list[dict]] = {}
        for t in tr:
            bi = min((t["t"] - t0) // bsize, n_buckets - 1)
            grouped.setdefault(bi, []).append(t)
        for bi in sorted(grouped):
            g = grouped[bi]
            agg = _levels_from_trades(g, step)
            o, c = g[0]["p"], g[-1]["p"]
            hi = max(x["p"] for x in g); lo = min(x["p"] for x in g)
            buckets.append(_pack_bucket(t0 + bi * bsize, o, hi, lo, c, agg, step))
    else:
        cs = ctx["candles"]
        group = max(1, math.ceil(len(cs) / n_buckets))
        for bi in range(0, len(cs), group):
            chunk = cs[bi:bi + group]
            agg: dict[float, dict] = {}
            for c in chunk:
                for p, lv in _levels_from_candle(c, step).items():
                    a = agg.setdefault(p, {"buyVol": 0.0, "sellVol": 0.0})
                    a["buyVol"] += lv["buyVol"]; a["sellVol"] += lv["sellVol"]
            o, c0 = chunk[0]["o"], chunk[-1]["c"]
            hi = max(x["h"] for x in chunk); lo = min(x["l"] for x in chunk)
            buckets.append(_pack_bucket(chunk[0]["t"], o, hi, lo, c0, agg, step))
    return buckets


def _pack_bucket(t, o, h, l, c, agg: dict[float, dict], step: float, imb_ratio: float = 3.0) -> dict:
    cells = []
    bar_delta = max_d = min_d = 0.0
    best_price, best_vol = None, -1.0
    for price in sorted(agg, reverse=True):
        bid = round(agg[price]["sellVol"], 2)  # bidVol = vendedores agresivos pegan al bid
        ask = round(agg[price]["buyVol"], 2)   # askVol = compradores agresivos pegan al ask
        delta = round(ask - bid, 2)
        bar_delta += delta
        max_d = max(max_d, delta); min_d = min(min_d, delta)
        tot = bid + ask
        if tot > best_vol:
            best_vol, best_price = tot, price
        cells.append({"price": price, "bidVol": bid, "askVol": ask, "delta": delta})

    # imbalance diagonal: ask[price] vs bid[price-tick]; flag si ratio ≥ U
    imbalances = []
    price_set = {cl["price"]: cl for cl in cells}
    for cl in cells:
        below = price_set.get(round(cl["price"] - step, 10))
        if below:
            if below["bidVol"] > 0 and cl["askVol"] >= imb_ratio * below["bidVol"]:
                imbalances.append({"price": cl["price"], "side": "ask",
                                   "ratio": round(cl["askVol"] / max(below["bidVol"], 1e-9), 1)})
            if cl["askVol"] > 0 and below["bidVol"] >= imb_ratio * cl["askVol"]:
                imbalances.append({"price": below["price"], "side": "bid",
                                   "ratio": round(below["bidVol"] / max(cl["askVol"], 1e-9), 1)})
    vol = round(sum(cl["bidVol"] + cl["askVol"] for cl in cells), 2)
    return {
        "t": t, "open": round(o, 4), "high": round(h, 4), "low": round(l, 4), "close": round(c, 4),
        "cells": cells, "imbalances": imbalances[:24],
        "barDelta": round(bar_delta, 2), "maxDelta": round(max_d, 2), "minDelta": round(min_d, 2),
        "vol": vol, "vpoc": best_price,
    }


def footprint(ticker: str, tf: str = "1D", session: str = "24h", buckets: int = 24) -> dict:
    ctx = load(ticker, tf, session)
    n = _clamp(buckets, 8, 60)
    bk = _footprint_buckets(ctx, int(n))
    prices = sorted({cl["price"] for b in bk for cl in b["cells"]}, reverse=True)
    return {
        "ticker": ctx["ticker"], "name": ctx["name"], "tf": ctx["tf"], "session": ctx["session"],
        "mode": ctx["mode"], "tier": ctx["tier"], "step": ctx["step"], "price": ctx["price"],
        "buckets": bk, "priceLevels": prices, "approx": not bool(ctx["trades"]),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  MÓDULO: DELTA / CVD  (contrato §3)
# ══════════════════════════════════════════════════════════════════════════════
def delta(ticker: str, tf: str = "1D", session: str = "24h", buckets: int = 48) -> dict:
    ctx = load(ticker, tf, session)
    bk = _footprint_buckets(ctx, int(_clamp(buckets, 12, 120)))
    bars = []
    cum = 0.0
    for b in bk:
        cum += b["barDelta"]
        bars.append({"t": b["t"], "delta": b["barDelta"], "cvd": round(cum, 2),
                     "close": b["close"], "vol": b["vol"]})

    divergences = _divergences(bars)
    accum = _accumulation_zones(bk)
    return {
        "ticker": ctx["ticker"], "name": ctx["name"], "tf": ctx["tf"], "session": ctx["session"],
        "mode": ctx["mode"], "tier": ctx["tier"],
        "bars": bars, "totalDelta": round(cum, 2),
        "divergences": divergences, "accumulationZones": accum,
        "approx": not bool(ctx["trades"]),
    }


def _swings(vals: list[float], left: int = 2, right: int = 2) -> tuple[list[int], list[int]]:
    highs, lows = [], []
    for i in range(left, len(vals) - right):
        win = vals[i - left:i + right + 1]
        if vals[i] == max(win):
            highs.append(i)
        if vals[i] == min(win):
            lows.append(i)
    return highs, lows


def _divergences(bars: list[dict]) -> list[dict]:
    """precio HH + CVD LH → bear ; precio LL + CVD HL → bull (sobre swings locales)."""
    if len(bars) < 8:
        return []
    px = [b["close"] for b in bars]
    cvd = [b["cvd"] for b in bars]
    highs, lows = _swings(px)
    out = []
    for a, b in zip(highs, highs[1:]):
        if px[b] > px[a] and cvd[b] < cvd[a]:
            out.append({"t": bars[b]["t"], "type": "bear"})
    for a, b in zip(lows, lows[1:]):
        if px[b] < px[a] and cvd[b] > cvd[a]:
            out.append({"t": bars[b]["t"], "type": "bull"})
    return out[-6:]


def _accumulation_zones(bk: list[dict]) -> list[dict]:
    """Rangos con precio comprimido y CVD lateral (absorción)."""
    if len(bk) < 6:
        return []
    zones = []
    win = 4
    for i in range(0, len(bk) - win):
        seg = bk[i:i + win]
        hi = max(b["high"] for b in seg); lo = min(b["low"] for b in seg)
        rng = hi - lo
        ref = seg[0]["close"] or 1
        if rng / ref < 0.01:  # precio comprimido <1%
            zones.append({"tStart": seg[0]["t"], "tEnd": seg[-1]["t"],
                          "priceLo": round(lo, 4), "priceHi": round(hi, 4)})
    # fusionar solapados
    merged = []
    for z in zones:
        if merged and z["tStart"] <= merged[-1]["tEnd"]:
            merged[-1]["tEnd"] = max(merged[-1]["tEnd"], z["tEnd"])
            merged[-1]["priceLo"] = min(merged[-1]["priceLo"], z["priceLo"])
            merged[-1]["priceHi"] = max(merged[-1]["priceHi"], z["priceHi"])
        else:
            merged.append(z)
    return merged[:5]


# ══════════════════════════════════════════════════════════════════════════════
#  MÓDULO: HEATMAP  (contrato §3) — matriz precio×tiempo
# ══════════════════════════════════════════════════════════════════════════════
def heatmap(ticker: str, tf: str = "1D", session: str = "24h",
            t_bins: int = 60, p_bins: int = 48) -> dict:
    ctx = load(ticker, tf, session)
    step = ctx["step"]
    t_bins = int(_clamp(t_bins, 20, 120)); p_bins = int(_clamp(p_bins, 24, 80))

    # eje de precio
    if ctx["candles"]:
        hi = max(c["h"] for c in ctx["candles"]); lo = min(c["l"] for c in ctx["candles"])
    else:
        ps = [t["p"] for t in ctx["trades"]]; hi, lo = max(ps), min(ps)
    pr = max(hi - lo, step)
    pstep = pr / p_bins
    price_bins = [round(lo + (k + 0.5) * pstep, 6) for k in range(p_bins)]

    t0, t1 = ctx["tStart"], ctx["tEnd"]
    span = max(t1 - t0, 1)
    tstep = span / t_bins
    time_bins = [int(t0 + (j + 0.5) * tstep) for j in range(t_bins)]

    matrix = [[0.0] * t_bins for _ in range(p_bins)]
    big_trades: list[dict] = []

    def pidx(p):
        return int(_clamp((p - lo) / pstep, 0, p_bins - 1))

    def tidx(t):
        return int(_clamp((t - t0) / tstep, 0, t_bins - 1))

    if ctx["trades"]:
        sizes = sorted(t["s"] for t in ctx["trades"])
        big_thr = sizes[int(len(sizes) * 0.99)] if sizes else 0
        for t in ctx["trades"]:
            matrix[pidx(t["p"])][tidx(t["t"])] += t["s"]
            if t["s"] >= big_thr and big_thr > 0:
                big_trades.append({"t": t["t"], "price": round(t["p"], 6), "size": round(t["s"], 4)})
    else:
        # volumen ejecutado por precio×tiempo (approx): reparte vol de cada vela en su rango
        vols = sorted(c["v"] for c in ctx["candles"])
        big_thr = vols[int(len(vols) * 0.97)] if vols else 0
        for c in ctx["candles"]:
            ti = tidx(c["t"])
            lo_b, hi_b = pidx(c["l"]), pidx(c["h"])
            n_lv = max(1, hi_b - lo_b + 1)
            per = c["v"] / n_lv
            for pi in range(lo_b, hi_b + 1):
                matrix[pi][ti] += per
            if c["v"] >= big_thr and big_thr > 0:
                big_trades.append({"t": c["t"], "price": round(c["c"], 6), "size": round(c["v"], 2)})

    return {
        "ticker": ctx["ticker"], "name": ctx["name"], "tf": ctx["tf"], "session": ctx["session"],
        "mode": ctx["mode"], "tier": ctx["tier"], "price": ctx["price"],
        "tBins": time_bins, "priceBins": price_bins, "matrix": matrix,
        "bigTrades": sorted(big_trades, key=lambda x: -x["size"])[:30],
        "scale": "log", "approx": not bool(ctx["trades"]),
    }


# ══════════════════════════════════════════════════════════════════════════════
#  MÓDULO: ORDER BOOK / DOM  (contrato §3)
# ══════════════════════════════════════════════════════════════════════════════
def orderbook(ticker: str, tf: str = "1D", session: str = "24h") -> dict:
    ctx = load(ticker, tf, session)
    is_cx = ctx["isCrypto"]
    ts = int(time.time())

    if is_cx:
        ob = alpaca.crypto_orderbook(ticker)
        if ob:
            bids = [{"price": float(x["p"]), "size": round(float(x["s"]), 6)} for x in (ob.get("b") or [])][:40]
            asks = [{"price": float(x["p"]), "size": round(float(x["s"]), 6)} for x in (ob.get("a") or [])][:40]
            if bids and asks:
                sizes = [b["size"] for b in bids] + [a["size"] for a in asks]
                med = sorted(sizes)[len(sizes) // 2] if sizes else 0
                large = ([{"price": b["price"], "size": b["size"], "side": "bid"} for b in bids if b["size"] >= 4 * med]
                         + [{"price": a["price"], "size": a["size"], "side": "ask"} for a in asks if a["size"] >= 4 * med])
                return {
                    "ticker": ctx["ticker"], "name": ctx["name"], "tier": ctx["tier"],
                    "ts": ts, "bids": bids, "asks": asks,
                    "spread": round(asks[0]["price"] - bids[0]["price"], 6),
                    "midPrice": round((asks[0]["price"] + bids[0]["price"]) / 2, 6),
                    "largeOrders": sorted(large, key=lambda x: -x["size"])[:8],
                    "approx": False,
                }

    # approx: escalera sintética desde el perfil de volumen (liquidez-por-precio)
    vp = volume_profile(ticker, tf, session)
    price = ctx["price"]
    bids = [{"price": b["price"], "size": b["vol"]} for b in vp["bins"] if b["price"] <= price][:40]
    asks = [{"price": b["price"], "size": b["vol"]} for b in vp["bins"] if b["price"] > price][-40:][::-1]
    sizes = [b["size"] for b in bids] + [a["size"] for a in asks] or [0]
    med = sorted(sizes)[len(sizes) // 2]
    large = ([{"price": b["price"], "size": b["size"], "side": "bid"} for b in bids if b["size"] >= 3 * med]
             + [{"price": a["price"], "size": a["size"], "side": "ask"} for a in asks if a["size"] >= 3 * med])
    return {
        "ticker": ctx["ticker"], "name": ctx["name"], "tier": ctx["tier"],
        "ts": ts, "bids": bids, "asks": asks, "spread": None, "midPrice": price,
        "largeOrders": sorted(large, key=lambda x: -x["size"])[:8], "approx": True,
    }


# ══════════════════════════════════════════════════════════════════════════════
#  OVERVIEW — KPIs + mini-previews para el dashboard
# ══════════════════════════════════════════════════════════════════════════════
def overview(ticker: str, tf: str = "1D", session: str = "24h") -> dict:
    ctx = load(ticker, tf, session)
    vp = volume_profile(ticker, tf, session)
    dl = delta(ticker, tf, session, buckets=48)

    buy = sum(b["buyVol"] for b in vp["bins"])
    sell = sum(b["sellVol"] for b in vp["bins"])
    tot = buy + sell or 1
    buy_pct = round(buy / tot * 100, 1)

    return {
        "ticker": ctx["ticker"], "name": ctx["name"], "assetType": ctx["assetType"],
        "currency": ctx["currency"], "tf": ctx["tf"], "session": ctx["session"],
        "mode": ctx["mode"], "tier": ctx["tier"], "isCrypto": ctx["isCrypto"],
        "price": ctx["price"], "step": ctx["step"],
        "nBars": ctx["nBars"], "nTrades": ctx["nTrades"],
        "sessionStart": ctx["tStart"], "sessionEnd": ctx["tEnd"],
        "kpis": {
            "cvd": dl["totalDelta"],
            "poc": vp["poc"], "vah": vp["vah"], "val": vp["val"],
            "buyPressurePct": buy_pct, "sellPressurePct": round(100 - buy_pct, 1),
            "nakedPocs": len(vp["nakedPocs"]),
            "divergences": len(dl["divergences"]),
        },
        "sparkline": [b["cvd"] for b in dl["bars"]][-60:],
        "disclaimer": _disclaimer(ctx),
    }


def _disclaimer(ctx: dict) -> str:
    tier_txt = {
        "T1": "L2/orderbook real + trades con agresor.",
        "T2": "trades reales sin profundidad (heatmap/DOM aproximados).",
        "T3": "solo OHLCV: footprint/heatmap/delta reconstruidos por regla del tick (approx).",
    }[ctx["tier"]]
    src = "Alpaca (cripto: feed us + orderbook real)" if ctx["isCrypto"] else \
          ("Alpaca IEX free (~retardo, fracción del volumen)" if ctx["mode"] == "intraday" else "yfinance (barras diarias)")
    return (f"Tier {ctx['tier']} — {tier_txt} Fuente: {src}. "
            "La capa ML asiste la lectura del flujo; las probabilidades solo se muestran "
            "si superan validación walk-forward con costos. Solo análisis, sin ejecución.")


# ── compat: endpoint legacy /api/orderflow/{ticker} ───────────────────────────
def analyze(ticker: str, n_buckets: int = 24) -> dict:
    """Compatibilidad con el endpoint antiguo. Devuelve el overview en 1D/24h."""
    return overview(ticker, tf="1D", session="24h")
