"""
Motor de opciones Black-Scholes-Merton — valor teórico, griegas y escenarios.

Modelo europeo con dividendos continuos (q). Todo Python puro (math.erf para la
normal). Calcula precio teórico, las 5 griegas (Δ, Γ, Θ, Vega, Ρ), probabilidad
ITM (riesgo-neutral), valor intrínseco/temporal, break-even, un simulador de
escenarios (±5/10/20% en el subyacente) y mallas para los gráficos (perfil de
riesgo, curvas de griegas vs. spot, decaimiento theta, superficie de vega/gamma
y una cadena teórica de strikes).

Solo análisis — no es entrada de órdenes ni conexión con un broker. El subyacente
y una volatilidad por defecto (histórica) se toman de datos reales del mercado.
"""
from __future__ import annotations

import math
from app.data import market

_SQRT2PI = math.sqrt(2.0 * math.pi)
_CACHE: dict[tuple, dict] = {}


def _ncdf(x: float) -> float:
    """CDF normal estándar vía función error."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _npdf(x: float) -> float:
    return math.exp(-0.5 * x * x) / _SQRT2PI


def _d1d2(S, K, T, sig, r, q):
    if T <= 0 or sig <= 0 or S <= 0 or K <= 0:
        return None, None
    vt = sig * math.sqrt(T)
    d1 = (math.log(S / K) + (r - q + 0.5 * sig * sig) * T) / vt
    return d1, d1 - vt


def greeks(S, K, T, sig, r, q, kind="call") -> dict:
    """Precio teórico y griegas de una opción europea. Griegas en convención de
    mercado: Theta por día, Vega por +1 punto de vol, Rho por +1 punto de tasa."""
    call = kind == "call"
    d1, d2 = _d1d2(S, K, T, sig, r, q)

    if d1 is None:  # en/ tras vencimiento: solo intrínseco
        intrinsic = max(S - K, 0.0) if call else max(K - S, 0.0)
        return {
            "price": round(intrinsic, 4), "delta": round(1.0 if call and S > K else (-1.0 if not call and S < K else 0.0), 4),
            "gamma": 0.0, "theta": 0.0, "vega": 0.0, "rho": 0.0,
            "d1": None, "d2": None, "prob_itm": 1.0 if intrinsic > 0 else 0.0,
            "intrinsic": round(intrinsic, 4), "time_value": 0.0,
        }

    disc_r = math.exp(-r * T)
    disc_q = math.exp(-q * T)
    pdf = _npdf(d1)

    if call:
        price = S * disc_q * _ncdf(d1) - K * disc_r * _ncdf(d2)
        delta = disc_q * _ncdf(d1)
        theta = (-S * disc_q * pdf * sig / (2 * math.sqrt(T))
                 - r * K * disc_r * _ncdf(d2) + q * S * disc_q * _ncdf(d1))
        rho = K * T * disc_r * _ncdf(d2)
        prob_itm = _ncdf(d2)
    else:
        price = K * disc_r * _ncdf(-d2) - S * disc_q * _ncdf(-d1)
        delta = -disc_q * _ncdf(-d1)
        theta = (-S * disc_q * pdf * sig / (2 * math.sqrt(T))
                 + r * K * disc_r * _ncdf(-d2) - q * S * disc_q * _ncdf(-d1))
        rho = -K * T * disc_r * _ncdf(-d2)
        prob_itm = _ncdf(-d2)

    gamma = disc_q * pdf / (S * sig * math.sqrt(T))
    vega = S * disc_q * pdf * math.sqrt(T)

    intrinsic = max(S - K, 0.0) if call else max(K - S, 0.0)
    return {
        "price": round(price, 4),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "theta": round(theta / 365.0, 4),   # por día calendario
        "vega": round(vega / 100.0, 4),     # por +1% de vol
        "rho": round(rho / 100.0, 4),       # por +1% de tasa
        "d1": round(d1, 4), "d2": round(d2, 4),
        "prob_itm": round(prob_itm, 4),
        "intrinsic": round(intrinsic, 4),
        "time_value": round(price - intrinsic, 4),
    }


def _hist_vol(ticker: str) -> float | None:
    """Volatilidad histórica anualizada (~60 días) como IV por defecto."""
    try:
        hist = market.get_history(ticker, "6mo")
        px = [c["close"] for c in hist["candles"] if c.get("close")][-61:]
        if len(px) < 20:
            return None
        rets = [math.log(px[i] / px[i - 1]) for i in range(1, len(px))]
        m = sum(rets) / len(rets)
        var = sum((x - m) ** 2 for x in rets) / (len(rets) - 1)
        return math.sqrt(var) * math.sqrt(252)
    except Exception:
        return None


def analyze(ticker: str, strike: float | None = None, expiry_days: int = 30,
            iv: float | None = None, r: float = 0.04, q: float = 0.0,
            kind: str = "call") -> dict:
    """Análisis completo de una opción sobre `ticker`. Subyacente real (quote),
    IV por defecto = vol histórica. Devuelve griegas, escenarios y mallas."""
    kind = "put" if str(kind).lower().startswith("p") else "call"
    key = (ticker.upper(), strike, expiry_days, iv, r, q, kind)
    if key in _CACHE:
        return _CACHE[key]

    quote = market.get_quote(ticker)
    S = quote.get("price")
    if not S or S <= 0:
        raise ValueError(f"Sin precio de mercado para {ticker}")
    name = quote.get("name") or ticker.upper()

    K = float(strike) if strike else round(S, 2)         # ATM por defecto
    T = max(expiry_days, 1) / 365.0
    hv = _hist_vol(ticker)
    sig = float(iv) if iv else (hv if hv else 0.30)
    sig = max(0.01, min(sig, 5.0))

    base = greeks(S, K, T, sig, r, q, kind)
    premium = base["price"]
    call = kind == "call"

    # Break-even al vencimiento
    breakeven = K + premium if call else K - premium

    # --- Simulador de escenarios: movimientos del subyacente ---
    scenarios = []
    for mv in (-20, -10, -5, 0, 5, 10, 20):
        Snew = S * (1 + mv / 100.0)
        g = greeks(Snew, K, T, sig, r, q, kind)
        pnl = g["price"] - premium
        scenarios.append({
            "move_pct": mv, "spot": round(Snew, 2), "price": g["price"],
            "delta": g["delta"], "gamma": g["gamma"], "theta": g["theta"],
            "vega": g["vega"], "pnl": round(pnl, 4),
            "pnl_pct": round(pnl / premium * 100, 1) if premium > 0 else None,
        })

    # --- Curvas vs. spot (perfil de riesgo + griegas) ---
    lo, hi = 0.6 * S, 1.4 * S
    N = 61
    spot_curve = []
    for i in range(N):
        Sx = lo + (hi - lo) * i / (N - 1)
        g = greeks(Sx, K, T, sig, r, q, kind)
        payoff = (max(Sx - K, 0.0) if call else max(K - Sx, 0.0)) - premium
        spot_curve.append({
            "spot": round(Sx, 2), "value": round(g["price"] - premium, 4),
            "payoff": round(payoff, 4), "delta": g["delta"], "gamma": g["gamma"],
            "vega": g["vega"], "theta": g["theta"],
        })

    # --- Decaimiento theta: precio vs. días al vencimiento ---
    theta_curve = []
    max_days = max(expiry_days, 7)
    steps = 48
    for i in range(steps + 1):
        d = max_days * (1 - i / steps)
        Tt = max(d, 0.01) / 365.0
        g = greeks(S, K, Tt, sig, r, q, kind)
        theta_curve.append({"days": round(d, 1), "price": g["price"],
                            "theta": g["theta"], "time_value": g["time_value"]})

    # --- Superficie de vega y gamma: (spot × días) ---
    surf_spots = [round(lo + (hi - lo) * j / 8, 2) for j in range(9)]
    surf_days = [round(max_days * (k + 1) / 9, 0) for k in range(9)]
    vega_surface, gamma_surface = [], []
    for d in surf_days:
        Tt = max(d, 1) / 365.0
        vrow, grow = [], []
        for Sx in surf_spots:
            g = greeks(Sx, K, Tt, sig, r, q, kind)
            vrow.append(g["vega"]); grow.append(g["gamma"])
        vega_surface.append(vrow); gamma_surface.append(grow)

    # --- Cadena teórica de strikes (modelo, no datos de mercado) ---
    chain = []
    for f in (0.85, 0.90, 0.95, 0.975, 1.0, 1.025, 1.05, 1.10, 1.15):
        Kx = round(S * f, 2)
        c = greeks(S, Kx, T, sig, r, q, "call")
        p = greeks(S, Kx, T, sig, r, q, "put")
        chain.append({
            "strike": Kx, "moneyness": round((f - 1) * 100, 1),
            "call": {"price": c["price"], "delta": c["delta"], "prob_itm": c["prob_itm"]},
            "put": {"price": p["price"], "delta": p["delta"], "prob_itm": p["prob_itm"]},
        })

    moneyness = "ATM" if abs(K - S) / S < 0.005 else \
                ("ITM" if (call and S > K) or (not call and S < K) else "OTM")

    result = {
        "ticker": ticker.upper(), "name": name, "kind": kind,
        "spot": round(S, 2), "strike": K, "expiry_days": expiry_days,
        "iv": round(sig, 4), "iv_source": "histórica" if not iv else "manual",
        "hist_vol": round(hv, 4) if hv else None, "r": r, "q": q,
        "currency": quote.get("currency"),
        "greeks": base, "premium": premium, "breakeven": round(breakeven, 2),
        "moneyness": moneyness,
        "scenarios": scenarios,
        "spot_curve": spot_curve, "theta_curve": theta_curve,
        "surface": {"spots": surf_spots, "days": surf_days,
                    "vega": vega_surface, "gamma": gamma_surface},
        "chain": chain,
    }
    _CACHE[key] = result
    return result
