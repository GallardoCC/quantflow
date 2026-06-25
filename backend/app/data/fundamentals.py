"""
Motor de análisis fundamental — QuantFlow.

Fuente primaria:  yfinance (sin clave, estados financieros completos).
Fuente secundaria: FMP v3 (perfil enriquecido, requiere FMP_API_KEY).

Punto de entrada público: fetch_fundamentals(ticker) -> dict
  · Calcula ratios de liquidez, solvencia, eficiencia, rentabilidad y valoración.
  · DCF a 10 años + valoración relativa por sector.
  · Score de calidad 0-100 con grade, drivers positivos y negativos.
  · Todo cacheado 30 minutos en memoria.
"""
from __future__ import annotations

import math
import os
import time
import warnings
from pathlib import Path
from typing import Any

import requests
import yfinance as yf
from dotenv import load_dotenv

warnings.filterwarnings("ignore")

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

_FMP_KEY = os.getenv("FMP_API_KEY", "")
_FMP_V3  = "https://financialmodelingprep.com/api/v3"

# ---------------------------------------------------------------------------
# Caché en memoria (TTL 30 min)
# ---------------------------------------------------------------------------
_CACHE: dict[str, tuple[float, Any]] = {}
_TTL = 1800  # 30 minutes


def _cache_get(key: str) -> Any | None:
    hit = _CACHE.get(key)
    if hit and (time.time() - hit[0]) < _TTL:
        return hit[1]
    return None


def _cache_set(key: str, value: Any) -> None:
    _CACHE[key] = (time.time(), value)


# ---------------------------------------------------------------------------
# Utilidades numéricas
# ---------------------------------------------------------------------------
def _f(x: Any) -> float | None:
    """Convierte a float o None; elimina NaN/inf."""
    try:
        v = float(x)
        return None if (math.isnan(v) or math.isinf(v)) else v
    except Exception:
        return None


def _safe_div(a: float | None, b: float | None) -> float | None:
    """División segura; None si algún operando es None o b == 0."""
    if a is None or b is None or b == 0:
        return None
    return _f(a / b)


def _pct(x: float | None) -> float | None:
    """Convierte fracción a porcentaje."""
    return None if x is None else _f(x * 100)


# ---------------------------------------------------------------------------
# Helper: extraer fila de un DataFrame yfinance con alias múltiples
# ---------------------------------------------------------------------------
def _row(df: Any, *keys: str) -> list[float | None]:
    """
    Busca la primera clave que exista en el índice del DataFrame y devuelve
    la lista de valores (columnas = períodos, más reciente primero), hasta 5.
    Devuelve [None]*n si no se encuentra ninguna clave o el df está vacío.
    """
    if df is None or getattr(df, "empty", True):
        return [None] * 5
    idx = set(df.index.tolist())
    for k in keys:
        if k in idx:
            vals = df.loc[k].tolist()
            # Rellenar hasta 5
            result = []
            for v in vals[:5]:
                result.append(_f(v))
            while len(result) < 5:
                result.append(None)
            return result
    return [None] * 5


def _col_years(df: Any) -> list[int]:
    """Devuelve los años (int) de las columnas del DataFrame, más reciente primero."""
    if df is None or getattr(df, "empty", True):
        return []
    try:
        return [int(c.year) for c in df.columns[:5]]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Benchmarks por sector
# ---------------------------------------------------------------------------
_BENCHMARKS: dict[str, dict[str, float]] = {
    "Technology": {
        "pe": 28.0, "pb": 6.0, "ps": 5.0, "evEbitda": 22.0,
        "roe": 25.0, "roa": 12.0, "netMargin": 18.0, "grossMargin": 55.0,
        "currentRatio": 1.8, "debtEquity": 0.5,
    },
    "Healthcare": {
        "pe": 22.0, "pb": 4.0, "ps": 3.5, "evEbitda": 16.0,
        "roe": 18.0, "roa": 8.0, "netMargin": 12.0, "grossMargin": 55.0,
        "currentRatio": 2.0, "debtEquity": 0.4,
    },
    "Financial Services": {
        "pe": 14.0, "pb": 1.5, "ps": 2.5, "evEbitda": 12.0,
        "roe": 12.0, "roa": 1.2, "netMargin": 20.0, "grossMargin": 65.0,
        "currentRatio": 1.2, "debtEquity": 2.0,
    },
    "Consumer Cyclical": {
        "pe": 20.0, "pb": 3.5, "ps": 1.2, "evEbitda": 14.0,
        "roe": 15.0, "roa": 7.0, "netMargin": 7.0, "grossMargin": 35.0,
        "currentRatio": 1.5, "debtEquity": 0.6,
    },
    "Consumer Defensive": {
        "pe": 22.0, "pb": 4.0, "ps": 1.5, "evEbitda": 15.0,
        "roe": 18.0, "roa": 8.0, "netMargin": 8.0, "grossMargin": 38.0,
        "currentRatio": 1.3, "debtEquity": 0.7,
    },
    "Energy": {
        "pe": 12.0, "pb": 1.8, "ps": 0.9, "evEbitda": 7.0,
        "roe": 12.0, "roa": 6.0, "netMargin": 8.0, "grossMargin": 30.0,
        "currentRatio": 1.2, "debtEquity": 0.5,
    },
    "Industrials": {
        "pe": 20.0, "pb": 3.5, "ps": 1.5, "evEbitda": 14.0,
        "roe": 16.0, "roa": 7.0, "netMargin": 8.0, "grossMargin": 32.0,
        "currentRatio": 1.5, "debtEquity": 0.6,
    },
    "Communication Services": {
        "pe": 22.0, "pb": 3.0, "ps": 2.5, "evEbitda": 14.0,
        "roe": 15.0, "roa": 7.0, "netMargin": 12.0, "grossMargin": 50.0,
        "currentRatio": 1.4, "debtEquity": 0.8,
    },
    "Real Estate": {
        "pe": 35.0, "pb": 2.0, "ps": 4.0, "evEbitda": 20.0,
        "roe": 8.0, "roa": 3.5, "netMargin": 18.0, "grossMargin": 55.0,
        "currentRatio": 1.0, "debtEquity": 1.5,
    },
    "Utilities": {
        "pe": 18.0, "pb": 1.8, "ps": 2.0, "evEbitda": 11.0,
        "roe": 10.0, "roa": 3.5, "netMargin": 13.0, "grossMargin": 40.0,
        "currentRatio": 0.9, "debtEquity": 1.2,
    },
    "Basic Materials": {
        "pe": 14.0, "pb": 2.0, "ps": 1.2, "evEbitda": 9.0,
        "roe": 12.0, "roa": 6.0, "netMargin": 8.0, "grossMargin": 28.0,
        "currentRatio": 1.4, "debtEquity": 0.5,
    },
    "default": {
        "pe": 18.0, "pb": 2.5, "ps": 2.0, "evEbitda": 13.0,
        "roe": 14.0, "roa": 6.0, "netMargin": 10.0, "grossMargin": 40.0,
        "currentRatio": 1.5, "debtEquity": 0.7,
    },
}


def _get_benchmark(sector: str | None) -> dict[str, float]:
    if sector and sector in _BENCHMARKS:
        return _BENCHMARKS[sector]
    return _BENCHMARKS["default"]


# ---------------------------------------------------------------------------
# Interpretaciones en español
# ---------------------------------------------------------------------------
def _interp_ratio(name: str, value: float | None, benchmark: float | None) -> str:
    """Genera texto interpretativo comparando value vs benchmark."""
    if value is None:
        return "Sin datos suficientes para calcular este indicador."
    if benchmark is None or benchmark == 0:
        return f"Valor: {value:.2f}."

    ratio = value / benchmark

    interpretations: dict[str, tuple] = {
        "ratioCorriente": (
            (2.0, "Excelente liquidez corriente; cubre ampliamente obligaciones a corto plazo."),
            (1.2, "Liquidez corriente adecuada, por encima del promedio sectorial."),
            (0.8, "Liquidez corriente aceptable, ligeramente inferior al sector."),
            (0.0, "Liquidez corriente ajustada; posible presión en obligaciones corrientes."),
        ),
        "ratioRapido": (
            (1.5, "Liquidez rápida sólida; activos líquidos muy superiores a pasivos corrientes."),
            (1.0, "Liquidez rápida en línea con el sector."),
            (0.7, "Liquidez rápida algo baja; depende del inventario para cubrir deudas."),
            (0.0, "Liquidez rápida insuficiente; riesgo de tensión de tesorería."),
        ),
        "ratioEfectivo": (
            (1.5, "Posición de caja excepcional en relación con los pasivos corrientes."),
            (1.0, "Posición de caja saludable."),
            (0.5, "Caja moderada; puede necesitar líneas de crédito adicionales."),
            (0.0, "Posición de caja reducida frente a los vencimientos a corto plazo."),
        ),
        "deudaPatrimonio": (
            (0.5, "Apalancamiento muy bajo; balance conservador y gran solidez financiera."),
            (0.9, "Apalancamiento contenido, por debajo del promedio sectorial."),
            (1.3, "Nivel de deuda cercano al promedio del sector."),
            (0.0, "Apalancamiento elevado; mayor riesgo financiero y menor flexibilidad."),
        ),
        "ratioDeuda": (
            (0.5, "Muy bajo endeudamiento sobre activos; empresa muy solvente."),
            (0.9, "Ratio de deuda inferior al promedio del sector."),
            (1.3, "Ratio de deuda en rango normal para el sector."),
            (0.0, "Alta proporción de deuda sobre activos; vigilar capacidad de repago."),
        ),
        "coberturaIntereses": (
            (2.0, "Cobertura de intereses muy holgada; utilidad operativa supera ampliamente el coste de deuda."),
            (1.2, "Cobertura de intereses adecuada."),
            (0.8, "Cobertura de intereses ajustada; margen de seguridad limitado."),
            (0.0, "Cobertura de intereses insuficiente; la empresa puede tener dificultades para pagar intereses."),
        ),
        "roe": (
            (1.5, "Rentabilidad sobre recursos propios excepcional, muy por encima del promedio sectorial."),
            (1.0, "ROE sólido, superior al promedio del sector."),
            (0.7, "ROE por debajo del sector; uso de capital mejorable."),
            (0.0, "ROE débil; la empresa genera poco retorno sobre el patrimonio."),
        ),
        "roa": (
            (1.5, "Rentabilidad sobre activos sobresaliente; uso eficiente de los recursos."),
            (1.0, "ROA en línea con el sector."),
            (0.7, "ROA algo por debajo del sector."),
            (0.0, "ROA bajo; los activos no generan retornos suficientes."),
        ),
        "margenBruto": (
            (1.3, "Margen bruto excepcional; ventaja competitiva clara en precios o costes."),
            (1.0, "Margen bruto en línea con la media sectorial."),
            (0.7, "Margen bruto algo inferior al sector."),
            (0.0, "Margen bruto bajo; posible presión de costes o competencia intensa."),
        ),
        "margenOperativo": (
            (1.5, "Margen operativo muy superior al sector; excelente eficiencia operativa."),
            (1.0, "Margen operativo saludable."),
            (0.7, "Margen operativo inferior al promedio sectorial."),
            (0.0, "Margen operativo débil; los costes operativos consumen gran parte de los ingresos."),
        ),
        "margenNeto": (
            (1.5, "Margen neto excepcional; alta conversión de ventas en beneficio."),
            (1.0, "Margen neto sólido, superior al sector."),
            (0.7, "Margen neto ligeramente por debajo del sector."),
            (0.0, "Margen neto escaso o negativo; empresa con dificultades para ser rentable."),
        ),
    }

    thresholds = interpretations.get(name)
    if not thresholds:
        # Generic fallback
        if ratio > 1.3:
            return f"Muy por encima del promedio sectorial ({value:.2f} vs referencia {benchmark:.2f})."
        if ratio > 1.0:
            return f"Por encima del promedio sectorial ({value:.2f} vs referencia {benchmark:.2f})."
        if ratio > 0.7:
            return f"Cerca del promedio sectorial ({value:.2f} vs referencia {benchmark:.2f})."
        return f"Por debajo del promedio sectorial ({value:.2f} vs referencia {benchmark:.2f})."

    for threshold, text in thresholds:
        if ratio >= threshold:
            return text
    return thresholds[-1][1]


def _ratio_entry(
    name: str,
    actual: float | None,
    historico: list[float | None],
    benchmark: float | None,
) -> dict:
    return {
        "actual": actual,
        "historico": historico[:5] if historico else [None] * 5,
        "promedioIndustria": benchmark,
        "interpretacion": _interp_ratio(name, actual, benchmark),
    }


# ---------------------------------------------------------------------------
# FMP v3 — perfil enriquecido (secundario)
# ---------------------------------------------------------------------------
def _fmp_profile(ticker: str) -> dict:
    """Intenta obtener datos de perfil extra de FMP v3. {} si falla o sin key."""
    if not _FMP_KEY:
        return {}
    try:
        url = f"{_FMP_V3}/profile/{ticker.upper()}"
        r = requests.get(url, params={"apikey": _FMP_KEY}, timeout=10)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list) and data:
            return data[0]
    except Exception:
        pass
    return {}


# ---------------------------------------------------------------------------
# Construcción de secciones
# ---------------------------------------------------------------------------
def _build_profile(ticker: str, info: dict, fmp_data: dict) -> dict:
    """Combina yfinance info + FMP profile para el perfil de la empresa."""
    return {
        "name": info.get("shortName") or fmp_data.get("companyName") or ticker.upper(),
        "longName": info.get("longName") or fmp_data.get("companyName") or ticker.upper(),
        "sector": info.get("sector") or fmp_data.get("sector") or "",
        "industry": info.get("industry") or fmp_data.get("industry") or "",
        "country": info.get("country") or fmp_data.get("country") or "",
        "exchange": info.get("exchange") or fmp_data.get("exchangeShortName") or "",
        "currency": info.get("currency") or fmp_data.get("currency") or "USD",
        "marketCap": _f(info.get("marketCap") or fmp_data.get("mktCap")),
        "price": _f(
            info.get("currentPrice")
            or info.get("regularMarketPrice")
            or fmp_data.get("price")
        ),
        "employees": _f(info.get("fullTimeEmployees") or fmp_data.get("fullTimeEmployees")),
        "ceo": fmp_data.get("ceo") or info.get("companyOfficers", [{}])[0].get("name", "") if info.get("companyOfficers") else fmp_data.get("ceo") or "",
        "website": info.get("website") or fmp_data.get("website") or "",
        "description": info.get("longBusinessSummary") or fmp_data.get("description") or "",
        "ipoDate": fmp_data.get("ipoDate") or "",
        "sharesOutstanding": _f(
            info.get("sharesOutstanding") or fmp_data.get("sharesOutstanding")
        ),
        "beta": _f(info.get("beta") or fmp_data.get("beta")),
        "dividendYield": _f(info.get("dividendYield")),
    }


def _build_income(tk: yf.Ticker) -> list[dict]:
    try:
        df = tk.financials  # Annual income statement
    except Exception:
        return []
    if df is None or getattr(df, "empty", True):
        return []

    years = _col_years(df)
    revenue       = _row(df, "Total Revenue", "Operating Revenue")
    gross_profit  = _row(df, "Gross Profit")
    op_income     = _row(df, "Operating Income", "EBIT")
    net_income    = _row(df, "Net Income", "Net Income Common Stockholders")
    ebitda        = _row(df, "EBITDA", "Normalized EBITDA")
    eps           = _row(df, "Diluted EPS", "Basic EPS")
    interest_exp  = _row(df, "Interest Expense", "Net Interest Income")

    result = []
    for i, year in enumerate(years):
        result.append({
            "year": year,
            "revenue": revenue[i],
            "grossProfit": gross_profit[i],
            "operatingIncome": op_income[i],
            "netIncome": net_income[i],
            "ebitda": ebitda[i],
            "eps": eps[i],
            "interestExpense": interest_exp[i],
        })
    return result


def _build_balance(tk: yf.Ticker) -> list[dict]:
    try:
        df = tk.balance_sheet
    except Exception:
        return []
    if df is None or getattr(df, "empty", True):
        return []

    years           = _col_years(df)
    total_assets    = _row(df, "Total Assets")
    total_liab      = _row(df, "Total Liabilities Net Minority Interest", "Total Liabilities")
    equity          = _row(df, "Stockholders Equity", "Total Stockholders Equity", "Total Equity Gross Minority Interest")
    total_debt      = _row(df, "Total Debt", "Long Term Debt And Capital Lease Obligation")
    cash            = _row(df, "Cash And Cash Equivalents", "Cash Cash Equivalents And Short Term Investments")
    current_assets  = _row(df, "Current Assets", "Total Current Assets")
    current_liab    = _row(df, "Current Liabilities", "Total Current Liabilities")
    inventory       = _row(df, "Inventory")
    receivables     = _row(df, "Accounts Receivable", "Receivables", "Net Receivables")
    retained        = _row(df, "Retained Earnings")
    shares          = _row(df, "Ordinary Shares Number", "Share Issued", "Common Stock")

    result = []
    for i, year in enumerate(years):
        result.append({
            "year": year,
            "totalAssets": total_assets[i],
            "totalLiabilities": total_liab[i],
            "stockholdersEquity": equity[i],
            "totalDebt": total_debt[i],
            "cash": cash[i],
            "currentAssets": current_assets[i],
            "currentLiabilities": current_liab[i],
            "inventory": inventory[i],
            "receivables": receivables[i],
            "retainedEarnings": retained[i],
            "ordinaryShares": shares[i],
        })
    return result


def _build_cashflow(tk: yf.Ticker) -> list[dict]:
    try:
        df = tk.cashflow
    except Exception:
        return []
    if df is None or getattr(df, "empty", True):
        return []

    years = _col_years(df)
    ocf_raw   = _row(df, "Operating Cash Flow", "Cash Flow From Continuing Operating Activities")
    capex_raw = _row(df, "Capital Expenditure", "Purchase Of PPE", "Capital Expenditures")

    result = []
    for i, year in enumerate(years):
        ocf   = ocf_raw[i]
        capex = capex_raw[i]
        # CAPEX from yfinance is negative (cash outflow); FCF = OCF - abs(CAPEX)
        if capex is not None:
            capex_abs = abs(capex)
        else:
            capex_abs = None
        if ocf is not None and capex_abs is not None:
            fcf = ocf - capex_abs
        else:
            fcf = None
        result.append({
            "year": year,
            "operatingCashFlow": ocf,
            "capex": capex_abs,
            "freeCashFlow": fcf,
        })
    return result


# ---------------------------------------------------------------------------
# Ratios
# ---------------------------------------------------------------------------
def _build_ratios(
    info: dict,
    income: list[dict],
    balance: list[dict],
    cashflow: list[dict],
    sector: str | None,
) -> dict:
    bm = _get_benchmark(sector)

    # --- TTM values from yfinance info ---
    # Prefer info for current TTM ratios; fall back to most recent statement year
    i0_bal = balance[0] if balance else {}
    i0_inc = income[0] if income else {}
    i0_cf  = cashflow[0] if cashflow else {}

    # Current ratio
    curr_ratio_ttm = _f(info.get("currentRatio"))
    curr_assets_h  = [_safe_div(b.get("currentAssets"), b.get("currentLiabilities")) for b in balance[:5]]

    # Quick ratio: (currentAssets - inventory) / currentLiabilities
    quick_ttm = _f(info.get("quickRatio"))
    quick_h = []
    for b in balance[:5]:
        ca = b.get("currentAssets")
        inv = b.get("inventory") or 0.0
        cl = b.get("currentLiabilities")
        quick_h.append(_safe_div((ca - inv) if ca is not None else None, cl))

    # Cash ratio: cash / currentLiabilities
    cash_ratio_ttm = _safe_div(
        _f(i0_bal.get("cash")),
        _f(i0_bal.get("currentLiabilities"))
    )
    cash_ratio_h = [
        _safe_div(b.get("cash"), b.get("currentLiabilities")) for b in balance[:5]
    ]

    # Debt/Equity (info gives it in %, divide by 100)
    de_ttm_raw = info.get("debtToEquity")
    de_ttm = _f(de_ttm_raw / 100) if de_ttm_raw is not None else _safe_div(
        i0_bal.get("totalDebt"), i0_bal.get("stockholdersEquity")
    )
    de_h = [
        _safe_div(b.get("totalDebt"), b.get("stockholdersEquity")) for b in balance[:5]
    ]

    # Ratio deuda (total debt / total assets)
    rd_ttm = _safe_div(i0_bal.get("totalDebt"), i0_bal.get("totalAssets"))
    rd_h = [
        _safe_div(b.get("totalDebt"), b.get("totalAssets")) for b in balance[:5]
    ]

    # Cobertura de intereses (operating income / interest expense)
    ci_ttm = _safe_div(i0_inc.get("operatingIncome"), i0_inc.get("interestExpense"))
    ci_h = [
        _safe_div(inc.get("operatingIncome"), inc.get("interestExpense"))
        for inc in income[:5]
    ]

    # Rotación inventario (revenue / inventory)
    ri_ttm = _safe_div(i0_inc.get("revenue"), i0_bal.get("inventory"))
    ri_h = [
        _safe_div(
            income[j].get("revenue") if j < len(income) else None,
            balance[j].get("inventory") if j < len(balance) else None,
        )
        for j in range(5)
    ]

    # Días inventario (365 / rotación inventario)
    di_ttm = _safe_div(365.0, ri_ttm) if ri_ttm else None
    di_h = [_safe_div(365.0, v) if v else None for v in ri_h]

    # Rotación de activos (revenue / total assets)
    ra_ttm = _safe_div(i0_inc.get("revenue"), i0_bal.get("totalAssets"))
    ra_h = [
        _safe_div(
            income[j].get("revenue") if j < len(income) else None,
            balance[j].get("totalAssets") if j < len(balance) else None,
        )
        for j in range(5)
    ]

    # Rotación cuentas por cobrar (revenue / receivables)
    rc_ttm = _safe_div(i0_inc.get("revenue"), i0_bal.get("receivables"))
    rc_h = [
        _safe_div(
            income[j].get("revenue") if j < len(income) else None,
            balance[j].get("receivables") if j < len(balance) else None,
        )
        for j in range(5)
    ]

    # ROE: info gives 0-1 fraction
    roe_ttm_raw = info.get("returnOnEquity")
    roe_ttm = _pct(roe_ttm_raw) if roe_ttm_raw is not None else _safe_div(
        i0_inc.get("netIncome"), i0_bal.get("stockholdersEquity")
    )
    if roe_ttm is not None:
        roe_ttm = _f(roe_ttm * 100) if abs(roe_ttm) < 1.5 else roe_ttm  # handle if already pct
    roe_h = [
        _safe_div(
            income[j].get("netIncome") if j < len(income) else None,
            balance[j].get("stockholdersEquity") if j < len(balance) else None,
        )
        for j in range(5)
    ]
    # Convert roe_h to %
    roe_h = [_f(v * 100) if v is not None else None for v in roe_h]

    # ROA: info gives 0-1 fraction
    roa_ttm_raw = info.get("returnOnAssets")
    roa_ttm = _pct(roa_ttm_raw) if roa_ttm_raw is not None else _safe_div(
        i0_inc.get("netIncome"), i0_bal.get("totalAssets")
    )
    if roa_ttm is not None:
        roa_ttm = _f(roa_ttm * 100) if abs(roa_ttm) < 1.5 else roa_ttm
    roa_h = [
        _safe_div(
            income[j].get("netIncome") if j < len(income) else None,
            balance[j].get("totalAssets") if j < len(balance) else None,
        )
        for j in range(5)
    ]
    roa_h = [_f(v * 100) if v is not None else None for v in roa_h]

    # Márgenes (info: 0-1 fractions)
    def _pct_or_calc(info_key: str, num_key: str, denom_key: str) -> tuple[float | None, list]:
        raw = info.get(info_key)
        ttm = _pct(raw) if raw is not None else _safe_div(
            i0_inc.get(num_key), i0_inc.get(denom_key)
        )
        if ttm is not None and abs(ttm) < 1.5:
            ttm = _f(ttm * 100)
        hist = [
            _safe_div(
                income[j].get(num_key) if j < len(income) else None,
                income[j].get(denom_key) if j < len(income) else None,
            )
            for j in range(5)
        ]
        hist = [(_f(v * 100) if v is not None and abs(v) < 1.5 else v) for v in hist]
        return ttm, hist

    mb_ttm, mb_h = _pct_or_calc("grossMargins", "grossProfit", "revenue")
    mo_ttm, mo_h = _pct_or_calc("operatingMargins", "operatingIncome", "revenue")
    mn_ttm, mn_h = _pct_or_calc("profitMargins", "netIncome", "revenue")

    # Valoración (prefer info for TTM; None if not available)
    pe_ttm    = _f(info.get("trailingPE"))
    ps_ttm    = _f(info.get("priceToSalesTrailing12Months"))
    pb_ttm    = _f(info.get("priceToBook"))
    # Price / FCF
    mktcap    = _f(info.get("marketCap"))
    fcf_ttm_v = _f(info.get("freeCashflow"))
    pcf_ttm   = _safe_div(mktcap, fcf_ttm_v)
    ev_ebitda = _f(info.get("enterpriseToEbitda"))
    peg       = _f(info.get("pegRatio"))

    return {
        "liquidez": {
            "ratioCorriente": _ratio_entry("ratioCorriente", curr_ratio_ttm, curr_assets_h, bm.get("currentRatio")),
            "ratioRapido":    _ratio_entry("ratioRapido", quick_ttm, quick_h, bm.get("currentRatio") * 0.8 if bm.get("currentRatio") else None),
            "ratioEfectivo":  _ratio_entry("ratioEfectivo", cash_ratio_ttm, cash_ratio_h, 0.3),
        },
        "solvencia": {
            "deudaPatrimonio":   _ratio_entry("deudaPatrimonio", de_ttm, de_h, bm.get("debtEquity")),
            "ratioDeuda":        _ratio_entry("ratioDeuda", rd_ttm, rd_h, 0.5),
            "coberturaIntereses": _ratio_entry("coberturaIntereses", ci_ttm, ci_h, 5.0),
        },
        "eficiencia": {
            "rotacionInventario": _ratio_entry("rotacionInventario", ri_ttm, ri_h, 6.0),
            "diasInventario":     _ratio_entry("diasInventario", di_ttm, di_h, 60.0),
            "rotacionActivos":    _ratio_entry("rotacionActivos", ra_ttm, ra_h, 0.8),
            "rotacionCobrar":     _ratio_entry("rotacionCobrar", rc_ttm, rc_h, 8.0),
        },
        "rentabilidad": {
            "roe":             _ratio_entry("roe", roe_ttm, roe_h, bm.get("roe")),
            "roa":             _ratio_entry("roa", roa_ttm, roa_h, bm.get("roa")),
            "margenBruto":     _ratio_entry("margenBruto", mb_ttm, mb_h, bm.get("grossMargin")),
            "margenOperativo": _ratio_entry("margenOperativo", mo_ttm, mo_h, bm.get("netMargin") * 1.3 if bm.get("netMargin") else None),
            "margenNeto":      _ratio_entry("margenNeto", mn_ttm, mn_h, bm.get("netMargin")),
        },
        "valoracion": {
            "pe":       _ratio_entry("pe",       pe_ttm,   [None]*5, bm.get("pe")),
            "ps":       _ratio_entry("ps",       ps_ttm,   [None]*5, bm.get("ps")),
            "pb":       _ratio_entry("pb",       pb_ttm,   [None]*5, bm.get("pb")),
            "pcf":      _ratio_entry("pcf",      pcf_ttm,  [None]*5, 15.0),
            "evEbitda": _ratio_entry("evEbitda", ev_ebitda,[None]*5, bm.get("evEbitda")),
            "peg":      _ratio_entry("peg",      peg,      [None]*5, 1.5),
        },
    }


# ---------------------------------------------------------------------------
# Growth metrics
# ---------------------------------------------------------------------------
def _build_growth(income: list[dict], cashflow: list[dict]) -> dict:
    rev_hist = [inc.get("revenue") for inc in income[:5]]
    eps_hist = [inc.get("eps") for inc in income[:5]]
    fcf_hist = [cf.get("freeCashFlow") for cf in cashflow[:5]]

    def _yoy(hist: list) -> float | None:
        if len(hist) >= 2 and hist[0] is not None and hist[1] is not None and hist[1] != 0:
            return _f((hist[0] - hist[1]) / abs(hist[1]) * 100)
        return None

    def _cagr(hist: list, n: int) -> float | None:
        """n-year CAGR in %."""
        if len(hist) > n:
            v0, vn = hist[0], hist[n]
        else:
            v0, vn = hist[0] if hist else None, hist[-1] if len(hist) >= 2 else None
            n = max(len(hist) - 1, 1)
        if v0 is None or vn is None or vn == 0:
            return None
        if v0 * vn < 0:
            return None  # sign change — CAGR undefined
        return _f(((abs(v0) / abs(vn)) ** (1 / n) - 1) * 100)

    return {
        "revenueYoy":    _yoy(rev_hist),
        "revenueCagr3Y": _cagr(rev_hist, 3),
        "epsYoy":        _yoy(eps_hist),
        "epsCagr3Y":     _cagr(eps_hist, 3),
        "fcfCagr3Y":     _cagr(fcf_hist, 3),
        "revenueHistory": rev_hist[:5],
    }


# ---------------------------------------------------------------------------
# Quality Score
# ---------------------------------------------------------------------------
def _build_quality(
    ratios: dict,
    growth: dict,
    income: list[dict],
    sector: str | None,
) -> dict:
    bm = _get_benchmark(sector)
    pos_drivers: list[str] = []
    neg_drivers: list[str] = []

    # --- Rentabilidad (30 pts) ---
    pts_rent = 0

    roe_val = ratios["rentabilidad"]["roe"]["actual"]
    roa_val = ratios["rentabilidad"]["roa"]["actual"]
    mn_val  = ratios["rentabilidad"]["margenNeto"]["actual"]

    if roe_val is not None:
        if roe_val >= bm["roe"] * 1.5:
            pts_rent += 12
            pos_drivers.append(f"ROE excepcional ({roe_val:.1f}%), muy superior al sector ({bm['roe']:.1f}%).")
        elif roe_val >= bm["roe"]:
            pts_rent += 8
            pos_drivers.append(f"ROE sólido ({roe_val:.1f}%), por encima del promedio sectorial.")
        elif roe_val >= bm["roe"] * 0.6:
            pts_rent += 4
        else:
            neg_drivers.append(f"ROE débil ({roe_val:.1f}%) frente al sector ({bm['roe']:.1f}%).")

    if roa_val is not None:
        if roa_val >= bm["roa"] * 1.4:
            pts_rent += 10
            pos_drivers.append(f"ROA destacado ({roa_val:.1f}%); uso eficiente de activos.")
        elif roa_val >= bm["roa"]:
            pts_rent += 7
        elif roa_val >= bm["roa"] * 0.5:
            pts_rent += 3
        else:
            neg_drivers.append(f"ROA bajo ({roa_val:.1f}%); los activos generan poco retorno.")

    if mn_val is not None:
        if mn_val >= bm["netMargin"] * 1.5:
            pts_rent += 8
            pos_drivers.append(f"Margen neto excepcional ({mn_val:.1f}%).")
        elif mn_val >= bm["netMargin"]:
            pts_rent += 5
        elif mn_val >= 0:
            pts_rent += 2
        else:
            neg_drivers.append(f"Margen neto negativo ({mn_val:.1f}%); empresa en pérdidas.")

    pts_rent = min(pts_rent, 30)

    # --- Crecimiento (25 pts) ---
    pts_crec = 0

    rev_cagr = growth.get("revenueCagr3Y")
    eps_cagr = growth.get("epsCagr3Y")
    fcf_cagr = growth.get("fcfCagr3Y")

    if rev_cagr is not None:
        if rev_cagr >= 20:
            pts_crec += 10
            pos_drivers.append(f"Crecimiento de ingresos excepcional (CAGR 3A: {rev_cagr:.1f}%).")
        elif rev_cagr >= 10:
            pts_crec += 7
            pos_drivers.append(f"Crecimiento de ingresos sólido (CAGR 3A: {rev_cagr:.1f}%).")
        elif rev_cagr >= 3:
            pts_crec += 4
        else:
            neg_drivers.append(f"Crecimiento de ingresos débil o negativo (CAGR 3A: {rev_cagr:.1f}%).")

    if eps_cagr is not None:
        if eps_cagr >= 15:
            pts_crec += 10
            pos_drivers.append(f"Crecimiento de BPA excepcional (CAGR 3A: {eps_cagr:.1f}%).")
        elif eps_cagr >= 8:
            pts_crec += 7
        elif eps_cagr >= 0:
            pts_crec += 3
        else:
            neg_drivers.append(f"BPA decreciente (CAGR 3A: {eps_cagr:.1f}%).")

    if fcf_cagr is not None:
        if fcf_cagr >= 15:
            pts_crec += 5
            pos_drivers.append(f"Free cash flow creciendo a ritmo elevado (CAGR 3A: {fcf_cagr:.1f}%).")
        elif fcf_cagr >= 5:
            pts_crec += 3
        else:
            neg_drivers.append(f"Crecimiento débil de FCF (CAGR 3A: {fcf_cagr:.1f}%).")

    pts_crec = min(pts_crec, 25)

    # --- Salud Financiera (25 pts) ---
    pts_salud = 0

    de_val  = ratios["solvencia"]["deudaPatrimonio"]["actual"]
    cr_val  = ratios["liquidez"]["ratioCorriente"]["actual"]
    ci_val  = ratios["solvencia"]["coberturaIntereses"]["actual"]

    if de_val is not None:
        if de_val <= 0.3:
            pts_salud += 10
            pos_drivers.append(f"Balance muy sólido; deuda/patrimonio ({de_val:.2f}) prácticamente nulo.")
        elif de_val <= bm["debtEquity"]:
            pts_salud += 7
            pos_drivers.append(f"Nivel de deuda contenido ({de_val:.2f}), por debajo del sector.")
        elif de_val <= bm["debtEquity"] * 1.5:
            pts_salud += 4
        else:
            neg_drivers.append(f"Apalancamiento elevado (deuda/patrimonio: {de_val:.2f}).")

    if cr_val is not None:
        if cr_val >= 2.0:
            pts_salud += 8
            pos_drivers.append(f"Liquidez corriente excelente ({cr_val:.2f}).")
        elif cr_val >= 1.2:
            pts_salud += 5
        elif cr_val >= 0.9:
            pts_salud += 2
        else:
            neg_drivers.append(f"Liquidez corriente ajustada ({cr_val:.2f}); posible riesgo de liquidez.")

    if ci_val is not None:
        if ci_val >= 8:
            pts_salud += 7
            pos_drivers.append(f"Cobertura de intereses muy holgada ({ci_val:.1f}x).")
        elif ci_val >= 3:
            pts_salud += 5
        elif ci_val >= 1.5:
            pts_salud += 2
        else:
            neg_drivers.append(f"Cobertura de intereses baja ({ci_val:.1f}x); servicio de deuda comprometido.")

    pts_salud = min(pts_salud, 25)

    # --- Foso Competitivo (20 pts) ---
    pts_foso = 0

    mb_val  = ratios["rentabilidad"]["margenBruto"]["actual"]
    mb_hist = [v for v in ratios["rentabilidad"]["margenBruto"]["historico"] if v is not None]

    if mb_val is not None:
        if mb_val >= bm["grossMargin"] * 1.4:
            pts_foso += 10
            pos_drivers.append(f"Margen bruto elevado ({mb_val:.1f}%) sugiere ventaja competitiva.")
        elif mb_val >= bm["grossMargin"]:
            pts_foso += 7
        elif mb_val >= bm["grossMargin"] * 0.7:
            pts_foso += 4
        else:
            neg_drivers.append(f"Margen bruto bajo ({mb_val:.1f}%); presión competitiva o de costes.")

    # Consistencia de márgenes (baja varianza = foso más sólido)
    if len(mb_hist) >= 3:
        mean_mb = sum(mb_hist) / len(mb_hist)
        var_mb  = sum((v - mean_mb) ** 2 for v in mb_hist) / len(mb_hist)
        cv = (var_mb ** 0.5) / abs(mean_mb) if mean_mb else 1.0
        if cv <= 0.05:
            pts_foso += 10
            pos_drivers.append("Márgenes brutos muy estables en el tiempo; foso competitivo sólido.")
        elif cv <= 0.15:
            pts_foso += 6
            pos_drivers.append("Márgenes brutos relativamente estables a lo largo de los años.")
        elif cv <= 0.30:
            pts_foso += 3
        else:
            neg_drivers.append("Alta variabilidad de márgenes brutos; posible falta de poder de fijación de precios.")

    pts_foso = min(pts_foso, 20)

    # --- Total y grade ---
    score = pts_rent + pts_crec + pts_salud + pts_foso

    if score >= 85:
        grade = "A+"
        label = "Empresa de calidad excepcional"
    elif score >= 70:
        grade = "A"
        label = "Empresa de alta calidad"
    elif score >= 55:
        grade = "B+"
        label = "Empresa de buena calidad"
    elif score >= 40:
        grade = "B"
        label = "Empresa de calidad media"
    elif score >= 25:
        grade = "C"
        label = "Empresa con debilidades significativas"
    else:
        grade = "D"
        label = "Empresa de baja calidad financiera"

    return {
        "score": score,
        "grade": grade,
        "label": label,
        "breakdown": {
            "rentabilidad":    pts_rent,
            "crecimiento":     pts_crec,
            "saludFinanciera": pts_salud,
            "fosoCompetitivo": pts_foso,
        },
        "positiveDrivers": pos_drivers[:6],
        "negativeDrivers": neg_drivers[:6],
        "methodology": (
            "Score 0-100: Rentabilidad (30 pts), Crecimiento (25 pts), "
            "Salud Financiera (25 pts), Foso Competitivo (20 pts). "
            "Benchmarks ajustados por sector."
        ),
    }


# ---------------------------------------------------------------------------
# DCF Valuation
# ---------------------------------------------------------------------------
def _build_dcf(
    info: dict,
    cashflow: list[dict],
    growth: dict,
) -> dict | None:
    try:
        shares = _f(info.get("sharesOutstanding"))
        if not shares or shares <= 0:
            return None

        # Base FCF: prefer most recent cashflow statement; fallback to info
        base_fcf: float | None = None
        if cashflow and cashflow[0].get("freeCashFlow") is not None:
            base_fcf = _f(cashflow[0]["freeCashFlow"])
        if base_fcf is None:
            base_fcf = _f(info.get("freeCashflow"))
        if base_fcf is None:
            return None

        # Growth rates
        rev_cagr = growth.get("revenueCagr3Y")
        g_high: float = min(max(rev_cagr / 100 if rev_cagr is not None else 0.05, 0.03), 0.25)
        g_mid: float  = g_high * 0.6
        g_term: float = 0.025

        # WACC
        beta_val   = _f(info.get("beta")) or 1.0
        beta_val   = min(max(beta_val, 0.5), 3.0)
        risk_free  = 0.045
        eq_premium = 0.055
        wacc = risk_free + beta_val * eq_premium
        wacc = min(max(wacc, 0.06), 0.15)

        current_price = _f(
            info.get("currentPrice") or info.get("regularMarketPrice")
        )

        # Project 10 years
        projected: list[dict] = []
        pv_fcf_sum = 0.0
        fcf_t = base_fcf

        for t in range(1, 11):
            g = g_high if t <= 5 else g_mid
            fcf_t = fcf_t * (1 + g)
            pv = fcf_t / ((1 + wacc) ** t)
            pv_fcf_sum += pv
            projected.append({
                "year": t,
                "fcf": round(fcf_t, 0),
                "pv": round(pv, 0),
            })

        # Terminal value
        fcf_terminal = fcf_t * (1 + g_term)
        tv = fcf_terminal / (wacc - g_term)
        pv_terminal = tv / ((1 + wacc) ** 10)

        total_value    = pv_fcf_sum + pv_terminal
        intrinsic      = _f(total_value / shares)

        upside         = _safe_div((intrinsic - current_price) * 100, current_price) if intrinsic and current_price else None
        margin_safety  = _safe_div((intrinsic - current_price) * 100, intrinsic) if intrinsic and current_price and intrinsic != 0 else None

        return {
            "intrinsicValue":  intrinsic,
            "currentPrice":    current_price,
            "upside":          upside,
            "marginOfSafety":  margin_safety,
            "wacc":            round(wacc * 100, 2),
            "growthHigh":      round(g_high * 100, 2),
            "growthMid":       round(g_mid * 100, 2),
            "terminalGrowth":  round(g_term * 100, 2),
            "pvFCF":           round(pv_fcf_sum, 0),
            "pvTerminal":      round(pv_terminal, 0),
            "projectedFCF":    projected,
            "baseFCF":         base_fcf,
            "assumptions": {
                "beta":          beta_val,
                "riskFree":      round(risk_free * 100, 2),
                "equityPremium": round(eq_premium * 100, 2),
            },
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Relative Valuation
# ---------------------------------------------------------------------------
def _build_relative(
    info: dict,
    income: list[dict],
    sector: str | None,
) -> dict | None:
    try:
        bm = _get_benchmark(sector)

        shares    = _f(info.get("sharesOutstanding"))
        eps_ttm   = _f(info.get("trailingEps") or info.get("epsTrailingTwelveMonths"))
        ebitda_v  = _f(info.get("ebitda"))
        revenue_v = _f(info.get("totalRevenue"))

        # Fallback to most recent income statement
        if not eps_ttm and income:
            eps_ttm = income[0].get("eps")
        if not ebitda_v and income:
            ebitda_v = income[0].get("ebitda")
        if not revenue_v and income:
            revenue_v = income[0].get("revenue")

        pe_value: float | None     = None
        evebitda_value: float | None = None
        ps_value: float | None     = None

        # PE-based: industryPE × EPS
        if eps_ttm is not None and eps_ttm != 0:
            pe_value = _f(bm["pe"] * eps_ttm)

        # EV/EBITDA-based: industryEVEBITDA × EBITDA / shares
        if ebitda_v is not None and shares and shares > 0:
            evebitda_value = _f(bm["evEbitda"] * ebitda_v / shares)

        # PS-based: industryPS × (revenue / shares)
        if revenue_v is not None and shares and shares > 0:
            ps_value = _f(bm["ps"] * revenue_v / shares)

        # Weighted average (40% PE, 35% EV/EBITDA, 25% PS)
        weights = []
        values  = []
        if pe_value is not None:
            weights.append(0.40)
            values.append(pe_value)
        if evebitda_value is not None:
            weights.append(0.35)
            values.append(evebitda_value)
        if ps_value is not None:
            weights.append(0.25)
            values.append(ps_value)

        if not values:
            return None

        total_w = sum(weights)
        weighted = sum(v * w for v, w in zip(values, weights)) / total_w if total_w else None

        return {
            "peBasedValue":      pe_value,
            "evEbitdaBasedValue": evebitda_value,
            "psBasedValue":       ps_value,
            "weightedValue":      _f(weighted),
            "industryPe":        bm["pe"],
            "note": (
                f"Valoración relativa basada en múltiplos promedio del sector "
                f"({sector or 'general'}). Pesos: P/E 40%, EV/EBITDA 35%, P/S 25%."
            ),
        }
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Combined Valuation
# ---------------------------------------------------------------------------
def _build_combined(
    dcf: dict | None,
    relative: dict | None,
    info: dict,
) -> dict:
    current_price = _f(
        info.get("currentPrice") or info.get("regularMarketPrice")
    )

    dcf_val      = dcf["intrinsicValue"] if dcf else None
    relative_val = relative["weightedValue"] if relative else None

    fair_value: float | None = None
    confidence = 40

    if dcf_val is not None and relative_val is not None:
        fair_value = _f(dcf_val * 0.5 + relative_val * 0.5)
        confidence = 80
    elif dcf_val is not None:
        fair_value = dcf_val
        confidence = 60
    elif relative_val is not None:
        fair_value = relative_val
        confidence = 55

    upside = _safe_div(
        (fair_value - current_price) * 100 if fair_value and current_price else None,
        current_price,
    )

    # Range: ±20% on fair_value
    range_min = _f(fair_value * 0.80) if fair_value else None
    range_max = _f(fair_value * 1.20) if fair_value else None

    if upside is not None:
        if upside > 20:
            label = "INFRAVALORADA"
        elif upside < -20:
            label = "SOBREVALORADA"
        else:
            label = "JUSTA"
    else:
        label = "SIN DATOS"

    return {
        "fairValue":  fair_value,
        "confidence": confidence,
        "rangeMin":   range_min,
        "rangeMax":   range_max,
        "label":      label,
        "upside":     upside,
    }


# ---------------------------------------------------------------------------
# Piotroski F-Score (0-9)
# ---------------------------------------------------------------------------
def _build_piotroski(
    income: list[dict],
    balance: list[dict],
    cashflow: list[dict],
) -> dict:
    """9 criterios binarios de Piotroski. Necesita ≥2 ejercicios."""
    checks: list[dict] = []

    def _add(passed: bool | None, label: str, detail: str) -> None:
        checks.append({
            "label": label,
            "passed": bool(passed) if passed is not None else None,
            "detail": detail,
        })

    i0 = income[0] if income else {}
    i1 = income[1] if len(income) > 1 else {}
    b0 = balance[0] if balance else {}
    b1 = balance[1] if len(balance) > 1 else {}
    c0 = cashflow[0] if cashflow else {}

    ni0 = i0.get("netIncome")
    ni1 = i1.get("netIncome")
    ta0 = b0.get("totalAssets")
    ta1 = b1.get("totalAssets")
    ocf0 = c0.get("operatingCashFlow")

    roa0 = _safe_div(ni0, ta0)
    roa1 = _safe_div(ni1, ta1)

    # Rentabilidad
    _add(ni0 is not None and ni0 > 0, "Beneficio neto positivo (ROA > 0)",
         "El beneficio neto del último año es positivo.")
    _add(ocf0 is not None and ocf0 > 0, "Flujo de caja operativo positivo",
         "La empresa genera caja con su operación.")
    _add(roa0 is not None and roa1 is not None and roa0 > roa1, "ROA creciente",
         "La rentabilidad sobre activos mejora año contra año.")
    _add(ocf0 is not None and ni0 is not None and ocf0 > ni0,
         "Calidad del beneficio (FCO > Beneficio)",
         "El flujo de caja operativo supera al beneficio contable (bajos devengos).")

    # Apalancamiento y liquidez
    ld0 = _safe_div(b0.get("totalDebt"), ta0)
    ld1 = _safe_div(b1.get("totalDebt"), ta1)
    _add(ld0 is not None and ld1 is not None and ld0 < ld1, "Menor apalancamiento",
         "La deuda sobre activos se reduce respecto al año anterior.")

    cr0 = _safe_div(b0.get("currentAssets"), b0.get("currentLiabilities"))
    cr1 = _safe_div(b1.get("currentAssets"), b1.get("currentLiabilities"))
    _add(cr0 is not None and cr1 is not None and cr0 > cr1, "Mayor liquidez corriente",
         "El ratio corriente mejora respecto al año anterior.")

    sh0 = b0.get("ordinaryShares")
    sh1 = b1.get("ordinaryShares")
    _add(sh0 is not None and sh1 is not None and sh0 <= sh1 * 1.01,
         "Sin dilución de acciones",
         "No hubo emisión neta significativa de nuevas acciones.")

    # Eficiencia operativa
    gm0 = _safe_div(i0.get("grossProfit"), i0.get("revenue"))
    gm1 = _safe_div(i1.get("grossProfit"), i1.get("revenue"))
    _add(gm0 is not None and gm1 is not None and gm0 > gm1, "Margen bruto creciente",
         "El margen bruto mejora año contra año (poder de fijación de precios).")

    ato0 = _safe_div(i0.get("revenue"), ta0)
    ato1 = _safe_div(i1.get("revenue"), ta1)
    _add(ato0 is not None and ato1 is not None and ato0 > ato1, "Rotación de activos creciente",
         "La empresa genera más ventas por cada unidad de activo.")

    valid = [c for c in checks if c["passed"] is not None]
    score = sum(1 for c in checks if c["passed"] is True)
    n_eval = len(valid)

    if score >= 8:
        verdict, label = "FUERTE", "Salud financiera muy sólida"
    elif score >= 6:
        verdict, label = "BUENO", "Fundamentales saludables"
    elif score >= 4:
        verdict, label = "NEUTRAL", "Señales mixtas"
    else:
        verdict, label = "DÉBIL", "Fundamentales frágiles"

    return {
        "score": score,
        "max": 9,
        "evaluated": n_eval,
        "verdict": verdict,
        "label": label,
        "checks": checks,
    }


# ---------------------------------------------------------------------------
# Altman Z-Score (riesgo de quiebra)
# ---------------------------------------------------------------------------
def _build_altman(info: dict, income: list[dict], balance: list[dict]) -> dict | None:
    b0 = balance[0] if balance else {}
    i0 = income[0] if income else {}

    ta = b0.get("totalAssets")
    tl = b0.get("totalLiabilities")
    ca = b0.get("currentAssets")
    cl = b0.get("currentLiabilities")
    re = b0.get("retainedEarnings")
    ebit = i0.get("operatingIncome")
    rev = i0.get("revenue")
    mktcap = _f(info.get("marketCap"))

    if not ta or ta == 0 or not tl or tl == 0:
        return None

    wc = (ca - cl) if (ca is not None and cl is not None) else None

    a = _safe_div(wc, ta)
    b = _safe_div(re, ta)
    c = _safe_div(ebit, ta)
    d = _safe_div(mktcap, tl)
    e = _safe_div(rev, ta)

    components = {"A": a, "B": b, "C": c, "D": d, "E": e}
    if any(v is None for v in (a, c, e)):
        return None

    z = (1.2 * (a or 0) + 1.4 * (b or 0) + 3.3 * (c or 0)
         + 0.6 * (d or 0) + 1.0 * (e or 0))

    if z >= 2.99:
        zone, label = "SEGURA", "Riesgo de quiebra muy bajo"
    elif z >= 1.81:
        zone, label = "GRIS", "Zona de incertidumbre; vigilar"
    else:
        zone, label = "RIESGO", "Señales de estrés financiero"

    return {
        "z": round(z, 2),
        "zone": zone,
        "label": label,
        "components": {k: (round(v, 3) if v is not None else None) for k, v in components.items()},
        "thresholds": {"safe": 2.99, "distress": 1.81},
        "note": (
            "Z = 1.2·CT/Activo + 1.4·BR/Activo + 3.3·EBIT/Activo "
            "+ 0.6·CapBursátil/Pasivo + 1.0·Ventas/Activo."
        ),
    }


# ---------------------------------------------------------------------------
# Análisis estilo Buffett (calidad de negocio + foso)
# ---------------------------------------------------------------------------
def _build_buffett(ratios: dict, growth: dict, cashflow: list[dict]) -> dict:
    checks: list[dict] = []

    def _add(passed: bool | None, label: str, detail: str) -> None:
        checks.append({
            "label": label,
            "passed": bool(passed) if passed is not None else None,
            "detail": detail,
        })

    rent = ratios.get("rentabilidad", {})
    solv = ratios.get("solvencia", {})

    roe = rent.get("roe", {}).get("actual")
    roe_hist = [v for v in rent.get("roe", {}).get("historico", []) if v is not None]
    gm = rent.get("margenBruto", {}).get("actual")
    nm = rent.get("margenNeto", {}).get("actual")
    de = solv.get("deudaPatrimonio", {}).get("actual")

    # ROE consistentemente alto
    roe_ok = roe is not None and roe >= 15
    roe_consistent = len(roe_hist) >= 3 and all(v >= 12 for v in roe_hist[:4])
    _add(roe_ok and roe_consistent if roe_hist else roe_ok,
         "ROE alto y consistente (≥15%)",
         f"ROE actual {roe:.1f}%." if roe is not None else "Sin datos de ROE.")

    _add(gm is not None and gm >= 40, "Margen bruto elevado (≥40%)",
         f"Margen bruto {gm:.1f}%; sugiere ventaja competitiva (foso)."
         if gm is not None else "Sin datos de margen bruto.")

    _add(nm is not None and nm >= 10, "Margen neto sólido (≥10%)",
         f"Margen neto {nm:.1f}%." if nm is not None else "Sin datos de margen neto.")

    _add(de is not None and de <= 0.5, "Deuda controlada (Deuda/Patrimonio ≤ 0.5)",
         f"Deuda/Patrimonio {de:.2f}." if de is not None else "Sin datos de deuda.")

    fcf_hist = [cf.get("freeCashFlow") for cf in cashflow[:5] if cf.get("freeCashFlow") is not None]
    fcf_positive = len(fcf_hist) >= 1 and all(v > 0 for v in fcf_hist)
    _add(fcf_positive if fcf_hist else None, "Generación de caja constante (FCF > 0)",
         "Flujo de caja libre positivo en todos los años disponibles."
         if fcf_positive else "FCF irregular o negativo.")

    fcf_cagr = growth.get("fcfCagr3Y")
    _add(fcf_cagr is not None and fcf_cagr >= 5, "FCF creciente (CAGR ≥ 5%)",
         f"CAGR del FCF a 3 años: {fcf_cagr:.1f}%." if fcf_cagr is not None
         else "Sin datos de crecimiento de FCF.")

    valid = [c for c in checks if c["passed"] is not None]
    passed = sum(1 for c in checks if c["passed"] is True)
    n = len(valid)
    pct = (passed / n * 100) if n else 0

    if pct >= 80:
        verdict, label = "EXCELENTE", "Negocio de calidad excepcional con foso amplio"
    elif pct >= 60:
        verdict, label = "BUENO", "Negocio de buena calidad"
    elif pct >= 40:
        verdict, label = "REGULAR", "Calidad media; foso poco claro"
    else:
        verdict, label = "DÉBIL", "No cumple los criterios de calidad"

    return {
        "passed": passed,
        "evaluated": n,
        "pct": round(pct, 0),
        "verdict": verdict,
        "label": label,
        "checks": checks,
    }


# ---------------------------------------------------------------------------
# Análisis de sentimiento de noticias (NLP léxico, español)
# ---------------------------------------------------------------------------
_POS_WORDS = {
    "beat", "beats", "surge", "surges", "soar", "soars", "rally", "record",
    "growth", "grows", "gain", "gains", "jump", "jumps", "rise", "rises", "up",
    "upgrade", "upgrades", "outperform", "strong", "boost", "boosts", "profit",
    "profits", "wins", "win", "expansion", "expand", "partnership", "launch",
    "launches", "approval", "approved", "buyback", "dividend", "raise", "raised",
    "bullish", "positive", "milestone", "breakthrough", "demand", "deal", "deals",
    "exceeds", "exceed", "high", "higher", "innovative", "leadership", "optimistic",
}
_NEG_WORDS = {
    "miss", "misses", "fall", "falls", "drop", "drops", "plunge", "plunges",
    "decline", "declines", "loss", "losses", "cut", "cuts", "downgrade",
    "downgrades", "weak", "warning", "warns", "lawsuit", "sue", "sued", "probe",
    "investigation", "fraud", "recall", "delay", "delays", "concern", "concerns",
    "fears", "slump", "slumps", "bearish", "negative", "risk", "risks", "debt",
    "layoff", "layoffs", "fine", "fined", "scandal", "halt", "halts", "slowdown",
    "underperform", "lower", "disappointing", "bankruptcy", "default", "crisis",
}


def _build_sentiment(ticker: str) -> dict:
    """Sentimiento de noticias recientes vía léxico sobre titulares de Finnhub."""
    try:
        from app.data import finnhub
        news = finnhub.company_news(ticker, days=10, limit=30)
    except Exception:
        news = []

    if not news:
        return {
            "score": 50, "label": "Sin noticias recientes",
            "verdict": "NEUTRAL", "available": False,
            "positive": 0, "negative": 0, "neutral": 0, "analyzed": 0,
            "headlines": [], "summary": "No hay noticias suficientes para evaluar el sentimiento.",
        }

    pos_n = neg_n = neu_n = 0
    scored: list[dict] = []
    for item in news:
        text = f"{item.get('headline') or ''} {item.get('summary') or ''}".lower()
        words = set(text.replace(",", " ").replace(".", " ").split())
        p = len(words & _POS_WORDS)
        n = len(words & _NEG_WORDS)
        net = p - n
        if net > 0:
            tone = "positivo"; pos_n += 1
        elif net < 0:
            tone = "negativo"; neg_n += 1
        else:
            tone = "neutral"; neu_n += 1
        scored.append({
            "headline": item.get("headline"),
            "source": item.get("source"),
            "url": item.get("url"),
            "datetime": item.get("datetime"),
            "tone": tone,
            "net": net,
        })

    total = len(scored)
    # Score 0-100: 50 neutral, sesgado por proporción pos/neg
    raw = (pos_n - neg_n) / total if total else 0
    score = int(round(50 + raw * 50))
    score = max(0, min(100, score))

    if score >= 65:
        verdict, label = "POSITIVO", "Sentimiento de noticias favorable"
    elif score >= 45:
        verdict, label = "NEUTRAL", "Sentimiento de noticias mixto"
    else:
        verdict, label = "NEGATIVO", "Sentimiento de noticias desfavorable"

    summary = (
        f"De {total} noticias recientes: {pos_n} positivas, {neg_n} negativas, "
        f"{neu_n} neutrales. {label}."
    )

    # Ordenar por magnitud para destacar las más relevantes
    scored.sort(key=lambda x: abs(x["net"]), reverse=True)

    return {
        "score": score,
        "label": label,
        "verdict": verdict,
        "available": True,
        "positive": pos_n,
        "negative": neg_n,
        "neutral": neu_n,
        "analyzed": total,
        "headlines": scored[:12],
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Inteligencia de competidores (similitud por perfil financiero)
# ---------------------------------------------------------------------------
# Mapa curado de pares por industria/sector (respaldo robusto sin red).
_PEER_MAP: dict[str, list[str]] = {
    "AAPL": ["MSFT", "GOOGL", "SONY", "HPQ", "DELL"],
    "MSFT": ["GOOGL", "AAPL", "ORCL", "CRM", "ADBE"],
    "GOOGL": ["MSFT", "META", "AMZN", "AAPL"],
    "META": ["GOOGL", "SNAP", "PINS", "MSFT"],
    "AMZN": ["WMT", "GOOGL", "MSFT", "SHOP"],
    "NVDA": ["AMD", "INTC", "AVGO", "TSM", "QCOM"],
    "AMD": ["NVDA", "INTC", "AVGO", "QCOM"],
    "TSLA": ["GM", "F", "RIVN", "BYDDY", "NIO"],
    "JPM": ["BAC", "WFC", "C", "GS", "MS"],
    "KO": ["PEP", "MNST", "KDP"],
    "DIS": ["NFLX", "CMCSA", "WBD", "PARA"],
}

# Respaldo por sector (tickers líderes representativos)
_SECTOR_PEERS: dict[str, list[str]] = {
    "Technology": ["AAPL", "MSFT", "NVDA", "AVGO", "ORCL"],
    "Consumer Cyclical": ["AMZN", "TSLA", "HD", "MCD", "NKE"],
    "Communication Services": ["GOOGL", "META", "NFLX", "DIS", "T"],
    "Healthcare": ["UNH", "JNJ", "LLY", "PFE", "MRK"],
    "Financial Services": ["JPM", "BAC", "V", "MA", "WFC"],
    "Energy": ["XOM", "CVX", "COP", "SLB", "EOG"],
    "Industrials": ["CAT", "GE", "HON", "UPS", "BA"],
    "Consumer Defensive": ["WMT", "PG", "KO", "PEP", "COST"],
    "Basic Materials": ["LIN", "SHW", "FCX", "NEM", "DOW"],
    "Utilities": ["NEE", "DUK", "SO", "D", "AEP"],
    "Real Estate": ["PLD", "AMT", "EQIX", "PSA", "O"],
}


def _peer_quick_metrics(peer: str) -> dict | None:
    """Métricas ligeras de un par vía yfinance.info. None si falla."""
    try:
        tk = yf.Ticker(peer)
        info = tk.info or {}
    except Exception:
        return None
    name = info.get("shortName") or info.get("longName")
    mcap = _f(info.get("marketCap"))
    if not name or mcap is None:
        return None
    roe = info.get("returnOnEquity")
    nm = info.get("profitMargins")
    gm = info.get("grossMargins")
    rg = info.get("revenueGrowth")
    return {
        "ticker": peer.upper(),
        "name": name,
        "marketCap": mcap,
        "pe": _f(info.get("trailingPE")),
        "roe": _f(roe * 100) if roe is not None else None,
        "netMargin": _f(nm * 100) if nm is not None else None,
        "grossMargin": _f(gm * 100) if gm is not None else None,
        "revenueGrowth": _f(rg * 100) if rg is not None else None,
        "debtEquity": _f(info.get("debtToEquity") / 100) if info.get("debtToEquity") is not None else None,
    }


def _build_competitors(
    ticker: str, profile: dict, ratios: dict, growth: dict, sector: str | None,
) -> dict:
    tk = ticker.upper()
    candidates: list[str] = []
    if tk in _PEER_MAP:
        candidates = [c for c in _PEER_MAP[tk] if c.isalpha()]
    if len(candidates) < 3 and sector and sector in _SECTOR_PEERS:
        for c in _SECTOR_PEERS[sector]:
            if c != tk and c not in candidates:
                candidates.append(c)
    candidates = candidates[:5]

    # Métricas de la propia empresa
    rent = ratios.get("rentabilidad", {})
    self_metrics = {
        "ticker": tk,
        "name": profile.get("name") or tk,
        "marketCap": profile.get("marketCap"),
        "pe": ratios.get("valoracion", {}).get("pe", {}).get("actual"),
        "roe": rent.get("roe", {}).get("actual"),
        "netMargin": rent.get("margenNeto", {}).get("actual"),
        "grossMargin": rent.get("margenBruto", {}).get("actual"),
        "revenueGrowth": growth.get("revenueYoy"),
        "debtEquity": ratios.get("solvencia", {}).get("deudaPatrimonio", {}).get("actual"),
        "isSelf": True,
    }

    # Descarga de pares en paralelo (yfinance.info es lento; ~1.5s c/u).
    peers: list[dict] = []
    if candidates:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=min(5, len(candidates))) as ex:
            for m in ex.map(_peer_quick_metrics, candidates):
                if m:
                    peers.append(m)

    # Similitud por capitalización (log) — qué tan comparable es cada par
    def _similarity(peer: dict) -> float | None:
        sm = self_metrics.get("marketCap")
        pm = peer.get("marketCap")
        if not sm or not pm or sm <= 0 or pm <= 0:
            return None
        ratio = math.log(pm) / math.log(sm) if sm > 1 else 1.0
        diff = abs(math.log(pm) - math.log(sm))
        return round(max(0.0, 100 - diff * 18), 0)

    for p in peers:
        p["similarity"] = _similarity(p)
        p["isSelf"] = False

    # Ventaja competitiva 0-100: márgenes vs sector + ROE + crecimiento + consistencia
    bm = _get_benchmark(sector)
    adv = 50.0
    reasons: list[str] = []
    gm_self = self_metrics["grossMargin"]
    nm_self = self_metrics["netMargin"]
    roe_self = self_metrics["roe"]
    rg_self = self_metrics["revenueGrowth"]

    if gm_self is not None:
        if gm_self >= bm["grossMargin"] * 1.3:
            adv += 15; reasons.append(f"Márgenes brutos altos ({gm_self:.0f}%) frente al sector.")
        elif gm_self >= bm["grossMargin"]:
            adv += 8
        else:
            adv -= 8
    if nm_self is not None:
        if nm_self >= bm["netMargin"] * 1.5:
            adv += 12; reasons.append(f"Rentabilidad neta superior ({nm_self:.0f}%).")
        elif nm_self >= bm["netMargin"]:
            adv += 6
        else:
            adv -= 6
    if roe_self is not None:
        if roe_self >= bm["roe"] * 1.4:
            adv += 12; reasons.append(f"ROE líder ({roe_self:.0f}%).")
        elif roe_self >= bm["roe"]:
            adv += 6
    if rg_self is not None:
        if rg_self >= 15:
            adv += 11; reasons.append(f"Crecimiento de ingresos fuerte ({rg_self:.0f}%).")
        elif rg_self >= 5:
            adv += 5
        elif rg_self < 0:
            adv -= 6

    # Comparación de market share aproximado dentro del grupo de pares
    all_caps = [self_metrics["marketCap"]] + [p["marketCap"] for p in peers]
    all_caps = [c for c in all_caps if c]
    total_cap = sum(all_caps) if all_caps else 0
    share = None
    if total_cap and self_metrics["marketCap"]:
        share = round(self_metrics["marketCap"] / total_cap * 100, 1)
        if share >= 40:
            adv += 8; reasons.append(f"Líder del grupo por capitalización ({share:.0f}% del peer set).")

    adv = int(max(0, min(100, round(adv))))
    if adv >= 75:
        adv_label = "Foso competitivo amplio"
    elif adv >= 55:
        adv_label = "Ventaja competitiva moderada"
    elif adv >= 40:
        adv_label = "Posición competitiva media"
    else:
        adv_label = "Ventaja competitiva limitada"

    return {
        "self": self_metrics,
        "peers": peers,
        "marketShare": share,
        "advantageScore": adv,
        "advantageLabel": adv_label,
        "reasons": reasons[:5],
        "discovery": (
            "Pares identificados por sector/industria y comparados por perfil financiero. "
            "La similitud pondera la cercanía en capitalización bursátil."
        ),
    }


# ---------------------------------------------------------------------------
# Motor de decisión: Fundamental Score 0-100
# ---------------------------------------------------------------------------
def _build_decision(
    ratios: dict, growth: dict, quality: dict, combined: dict,
    competitors: dict, sentiment: dict, piotroski: dict, altman: dict | None,
    sector: str | None,
) -> dict:
    bm = _get_benchmark(sector)

    # --- Valoración (30%) — 0-100 según upside del valor justo combinado ---
    upside = combined.get("upside")
    if upside is not None:
        val_sub = 50 + max(-50, min(50, upside * 1.2))
    else:
        val_sub = 50
    val_sub = max(0, min(100, val_sub))

    # --- Rentabilidad (25%) ---
    roe = ratios.get("rentabilidad", {}).get("roe", {}).get("actual")
    nm = ratios.get("rentabilidad", {}).get("margenNeto", {}).get("actual")
    prof_sub = 50.0
    if roe is not None:
        prof_sub += max(-25, min(30, (roe - bm["roe"]) * 1.5))
    if nm is not None:
        prof_sub += max(-20, min(20, (nm - bm["netMargin"]) * 1.2))
    prof_sub = max(0, min(100, prof_sub))

    # --- Crecimiento (20%) ---
    rev_cagr = growth.get("revenueCagr3Y")
    eps_cagr = growth.get("epsCagr3Y")
    grow_sub = 50.0
    if rev_cagr is not None:
        grow_sub += max(-25, min(30, rev_cagr * 1.5))
    if eps_cagr is not None:
        grow_sub += max(-20, min(20, eps_cagr))
    grow_sub = max(0, min(100, grow_sub))

    # --- Salud financiera (15%) — Piotroski + Altman ---
    health_sub = 50.0
    if piotroski.get("evaluated"):
        health_sub = piotroski["score"] / 9 * 100
    if altman:
        if altman["zone"] == "SEGURA":
            health_sub = min(100, health_sub + 10)
        elif altman["zone"] == "RIESGO":
            health_sub = max(0, health_sub - 20)
    health_sub = max(0, min(100, health_sub))

    # --- Ventaja competitiva (10%) ---
    comp_sub = competitors.get("advantageScore", 50)

    # Score ponderado base
    base = (
        0.30 * val_sub + 0.25 * prof_sub + 0.20 * grow_sub
        + 0.15 * health_sub + 0.10 * comp_sub
    )

    # Ajustes IA: calidad y sentimiento mueven ±
    quality_score = quality.get("score", 50)
    sentiment_score = sentiment.get("score", 50)
    quality_adj = (quality_score - 50) * 0.10      # ±5
    sentiment_adj = (sentiment_score - 50) * 0.06  # ±3

    score = base + quality_adj + sentiment_adj
    score = int(max(0, min(100, round(score))))

    if score >= 90:
        cls, label = "EXCEPCIONAL", "Empresa excepcional"
    elif score >= 75:
        cls, label = "SÓLIDA", "Empresa sólida"
    elif score >= 50:
        cls, label = "NEUTRAL", "Empresa neutral"
    else:
        cls, label = "ALTO_RIESGO", "Alto riesgo"

    if score >= 75 and (upside is None or upside > -10):
        recommendation = "ACUMULAR"
    elif score >= 60:
        recommendation = "MANTENER"
    elif score >= 45:
        recommendation = "NEUTRAL"
    else:
        recommendation = "EVITAR"

    return {
        "score": score,
        "classification": cls,
        "label": label,
        "recommendation": recommendation,
        "components": {
            "valoracion":       {"score": round(val_sub), "weight": 30},
            "rentabilidad":     {"score": round(prof_sub), "weight": 25},
            "crecimiento":      {"score": round(grow_sub), "weight": 20},
            "saludFinanciera":  {"score": round(health_sub), "weight": 15},
            "ventajaCompetitiva": {"score": round(comp_sub), "weight": 10},
        },
        "aiAdjustments": {
            "calidad": round(quality_adj, 1),
            "sentimiento": round(sentiment_adj, 1),
        },
        "methodology": (
            "Score 0-100 = 30% Valoración + 25% Rentabilidad + 20% Crecimiento "
            "+ 15% Salud Financiera + 10% Ventaja Competitiva, ajustado por "
            "modelos IA de Calidad y Sentimiento."
        ),
    }


# ---------------------------------------------------------------------------
# Horizontes de inversión
# ---------------------------------------------------------------------------
def _verdict_from_score(s: float) -> str:
    if s >= 70:
        return "MUY POSITIVO"
    if s >= 58:
        return "POSITIVO"
    if s >= 45:
        return "NEUTRAL"
    if s >= 33:
        return "NEGATIVO"
    return "MUY NEGATIVO"


def _build_horizon(
    growth: dict, quality: dict, sentiment: dict, combined: dict,
    cashflow: list[dict], competitors: dict,
) -> dict:
    # Corto plazo: momentum de beneficios + sentimiento + expectativas (valoración)
    eps_yoy = growth.get("epsYoy")
    rev_yoy = growth.get("revenueYoy")
    short = 50.0
    if sentiment.get("available"):
        short += (sentiment["score"] - 50) * 0.4
    if eps_yoy is not None:
        short += max(-15, min(20, eps_yoy * 0.4))
    upside = combined.get("upside")
    if upside is not None:
        short += max(-10, min(15, upside * 0.3))
    short = max(0, min(100, short))

    # Mediano plazo: crecimiento + tendencia de la industria + competencia
    mid = 50.0
    rev_cagr = growth.get("revenueCagr3Y")
    if rev_cagr is not None:
        mid += max(-20, min(25, rev_cagr * 1.3))
    if rev_yoy is not None:
        mid += max(-10, min(12, rev_yoy * 0.3))
    mid += (competitors.get("advantageScore", 50) - 50) * 0.3
    mid = max(0, min(100, mid))

    # Largo plazo: calidad de negocio + caja + foso competitivo
    lng = 50.0
    lng += (quality.get("score", 50) - 50) * 0.6
    fcf_hist = [cf.get("freeCashFlow") for cf in cashflow[:5] if cf.get("freeCashFlow") is not None]
    if fcf_hist and all(v > 0 for v in fcf_hist):
        lng += 8
    lng += (competitors.get("advantageScore", 50) - 50) * 0.2
    lng = max(0, min(100, lng))

    return {
        "corto": {
            "score": round(short),
            "verdict": _verdict_from_score(short),
            "drivers": "Momentum de beneficios, sentimiento de noticias y expectativas de mercado.",
        },
        "mediano": {
            "score": round(mid),
            "verdict": _verdict_from_score(mid),
            "drivers": "Crecimiento, tendencias de la industria y posición frente a la competencia.",
        },
        "largo": {
            "score": round(lng),
            "verdict": _verdict_from_score(lng),
            "drivers": "Calidad del negocio, generación de caja y foso competitivo.",
        },
    }


# ---------------------------------------------------------------------------
# Punto de entrada público
# ---------------------------------------------------------------------------
def fetch_fundamentals(ticker: str) -> dict:
    """
    Análisis fundamental completo para un ticker.
    Cacheado 30 minutos en memoria.
    Nunca lanza excepciones: degrada gracefully a None / listas vacías.
    """
    key = f"fund:{ticker.upper()}"
    cached = _cache_get(key)
    if cached:
        return cached

    try:
        tk   = yf.Ticker(ticker)
        info = tk.info or {}
    except Exception:
        info = {}
        tk   = None  # type: ignore[assignment]

    # FMP profile (enriquece con CEO, ipoDate, descripción si info yf está vacío)
    try:
        fmp_data = _fmp_profile(ticker)
    except Exception:
        fmp_data = {}

    sector = info.get("sector") or fmp_data.get("sector") or None

    # --- Secciones financieras ---
    try:
        income_list = _build_income(tk) if tk else []
    except Exception:
        income_list = []

    try:
        balance_list = _build_balance(tk) if tk else []
    except Exception:
        balance_list = []

    try:
        cashflow_list = _build_cashflow(tk) if tk else []
    except Exception:
        cashflow_list = []

    try:
        profile = _build_profile(ticker, info, fmp_data)
    except Exception:
        profile = {k: None for k in (
            "name", "longName", "sector", "industry", "country", "exchange",
            "currency", "marketCap", "price", "employees", "ceo", "website",
            "description", "ipoDate", "sharesOutstanding", "beta", "dividendYield",
        )}

    try:
        ratios = _build_ratios(info, income_list, balance_list, cashflow_list, sector)
    except Exception:
        ratios = {}

    try:
        growth = _build_growth(income_list, cashflow_list)
    except Exception:
        growth = {
            "revenueYoy": None, "revenueCagr3Y": None,
            "epsYoy": None, "epsCagr3Y": None,
            "fcfCagr3Y": None, "revenueHistory": [],
        }

    try:
        quality = _build_quality(ratios, growth, income_list, sector)
    except Exception:
        quality = {
            "score": 0, "grade": "N/A", "label": "Sin datos",
            "breakdown": {"rentabilidad": 0, "crecimiento": 0, "saludFinanciera": 0, "fosoCompetitivo": 0},
            "positiveDrivers": [], "negativeDrivers": [],
            "methodology": "",
        }

    try:
        dcf = _build_dcf(info, cashflow_list, growth)
    except Exception:
        dcf = None

    try:
        relative = _build_relative(info, income_list, sector)
    except Exception:
        relative = None

    try:
        combined = _build_combined(dcf, relative, info)
    except Exception:
        combined = {
            "fairValue": None, "confidence": 0,
            "rangeMin": None, "rangeMax": None,
            "label": "SIN DATOS", "upside": None,
        }

    # --- Modelos avanzados ---
    try:
        piotroski = _build_piotroski(income_list, balance_list, cashflow_list)
    except Exception:
        piotroski = {"score": 0, "max": 9, "evaluated": 0, "verdict": "N/A",
                     "label": "Sin datos", "checks": []}

    try:
        altman = _build_altman(info, income_list, balance_list)
    except Exception:
        altman = None

    try:
        buffett = _build_buffett(ratios, growth, cashflow_list)
    except Exception:
        buffett = {"passed": 0, "evaluated": 0, "pct": 0, "verdict": "N/A",
                   "label": "Sin datos", "checks": []}

    try:
        sentiment = _build_sentiment(ticker)
    except Exception:
        sentiment = {"score": 50, "label": "Sin datos", "verdict": "NEUTRAL",
                     "available": False, "positive": 0, "negative": 0,
                     "neutral": 0, "analyzed": 0, "headlines": [], "summary": ""}

    try:
        competitors = _build_competitors(ticker, profile, ratios, growth, sector)
    except Exception:
        competitors = {"self": {}, "peers": [], "marketShare": None,
                       "advantageScore": 50, "advantageLabel": "Sin datos",
                       "reasons": [], "discovery": ""}

    try:
        decision = _build_decision(ratios, growth, quality, combined,
                                   competitors, sentiment, piotroski, altman, sector)
    except Exception:
        decision = {"score": 0, "classification": "N/A", "label": "Sin datos",
                    "recommendation": "N/A", "components": {}, "aiAdjustments": {},
                    "methodology": ""}

    try:
        horizon = _build_horizon(growth, quality, sentiment, combined,
                                 cashflow_list, competitors)
    except Exception:
        horizon = {}

    result: dict = {
        "ticker":    ticker.upper(),
        "profile":   profile,
        "income":    income_list,
        "balance":   balance_list,
        "cashflow":  cashflow_list,
        "ratios":    ratios,
        "growth":    growth,
        "quality":   quality,
        "valuation": {
            "dcf":      dcf,
            "relative": relative,
            "combined": combined,
        },
        "piotroski":   piotroski,
        "altman":      altman,
        "buffett":     buffett,
        "sentiment":   sentiment,
        "competitors": competitors,
        "decision":    decision,
        "horizon":     horizon,
    }

    _cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# API utilities
# ---------------------------------------------------------------------------
def available() -> bool:
    return True


def calibrate_cache() -> None:
    """No-op: placeholder for API imports that expect this hook."""
    pass
