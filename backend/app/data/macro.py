"""
Capa MACRO — agrega las fuentes para la sección de noticias/macro.

Una sola responsabilidad: entregar al frontend el panorama macro mundial
combinando:
- Noticias en vivo (Finnhub, categoría general/forex/crypto).
- Indicadores macro globales (World Bank) + EE.UU. de alta frecuencia (FRED).
- Calendario económico (FRED: próximas publicaciones de EE.UU.).

Todo degrada a vacío sin romper: si una fuente falla, las demás siguen.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.data import finnhub, fmp, fred, worldbank

# Deep pages de Macro: cada "topic" agrupa varias series de FRED + texto curado.
# units: lin = nivel; pc1 = % interanual (YoY). freq "m" submuestrea series diarias.
# El frontend pinta una tarjeta+gráfico por serie y la interpretación al lado.
MACRO_TOPICS: dict[str, dict] = {
    "inflation": {
        "title": "Inflación",
        "subtitle": "Presiones de precios y la trayectoria del IPC",
        "summary": (
            "La inflación mide qué tan rápido suben los precios año contra año. Es el mayor "
            "impulsor de la política de los bancos centrales: cuando enfría hacia el objetivo "
            "del 2% la Fed puede relajar; cuando se recalienta, la política sigue restrictiva."
        ),
        "interpretation": (
            "Una inflación a la baja eleva la probabilidad de recortes de tasas — "
            "históricamente favorable para bonos del Tesoro largos, oro y acciones de alto "
            "crecimiento. Una inflación que se reacelera hace lo contrario: sube los "
            "rendimientos y el dólar y presiona a los activos sensibles a las tasas."
        ),
        "related_markets": ["TLT", "GLD", "TIP", "QQQ"],
        "series": [
            {"id": "CPIAUCSL", "label": "IPC general (interanual)", "unit": "%", "units": "pc1", "freq": "m"},
            {"id": "CPILFESL", "label": "IPC subyacente (interanual)", "unit": "%", "units": "pc1", "freq": "m"},
            {"id": "PPIACO", "label": "Precios al productor (interanual)", "unit": "%", "units": "pc1", "freq": "m"},
        ],
    },
    "rates": {
        "title": "Tasas de interés",
        "subtitle": "Tasa de política, la curva y señales de recesión",
        "summary": (
            "Las tasas de interés son el precio del dinero. La Fed fija la tasa de política; "
            "el mercado de bonos fija el resto de la curva. Juntas determinan la tasa de "
            "descuento de todos los activos del planeta."
        ),
        "interpretation": (
            "Los recortes de tasas relajan las condiciones financieras y tienden a subir los "
            "activos de riesgo; las subidas las endurecen. El spread 10A-2A es un medidor "
            "clásico de recesión — una inversión sostenida (spread negativo) ha precedido a "
            "la mayoría de recesiones de EE.UU., y el re-empinamiento tras la inversión suele "
            "marcar el giro del ciclo."
        ),
        "related_markets": ["TLT", "IEF", "SHY", "XLF"],
        "series": [
            {"id": "FEDFUNDS", "label": "Tasa de la Fed", "unit": "%", "units": "lin", "freq": "m"},
            {"id": "DGS10", "label": "Bono 10A EE.UU.", "unit": "%", "units": "lin", "freq": "m"},
            {"id": "DGS2", "label": "Bono 2A EE.UU.", "unit": "%", "units": "lin", "freq": "m"},
            {"id": "T10Y2Y", "label": "Spread 10A-2A", "unit": "pp", "units": "lin", "freq": "m"},
        ],
    },
    "gdp": {
        "title": "Crecimiento del PIB",
        "subtitle": "Producción económica, el ciclo de negocios y el impulso del crecimiento",
        "summary": (
            "El PIB es la medida más amplia de la salud económica: el valor total de bienes y servicios "
            "producidos. La tasa de crecimiento trimestral anualizada es el titular que mueven los mercados. "
            "Cuando sorprende al alza, el apetito por riesgo sube; dos trimestres negativos consecutivos "
            "activan la definición técnica de recesión."
        ),
        "interpretation": (
            "Un crecimiento acelerado apoya los beneficios empresariales y los activos de riesgo (renta "
            "variable, crédito) mientras presiona al alza las tasas. Un ciclo desacelerado hace lo contrario "
            "— los bonos superan al mercado cuando se descuentan futuros recortes. La producción industrial "
            "y el ingreso disponible real ofrecen señales en tiempo real antes de que llegue el dato rezagado del PIB."
        ),
        "related_markets": ["SPY", "XLY", "XLI", "VTI"],
        "series": [
            {"id": "A191RL1Q225SBEA", "label": "Crecimiento PIB real (anualizado)", "unit": "%", "units": "lin", "freq": "q"},
            {"id": "INDPRO", "label": "Producción industrial (interanual)", "unit": "%", "units": "pc1", "freq": "m"},
            {"id": "DSPIC96", "label": "Ingreso disponible real (interanual)", "unit": "%", "units": "pc1", "freq": "m"},
        ],
    },
    "employment": {
        "title": "Empleo",
        "subtitle": "Salud del mercado laboral y el ciclo de empleo",
        "summary": (
            "El mercado laboral es el segundo mandato de la Fed tras la estabilidad de precios. Las nóminas "
            "no agrícolas, el desempleo y las peticiones de subsidio cuentan si la economía crea o destruye "
            "empleo. Un mercado laboral fuerte sostiene el consumo y puede mantener la inflación elevada; "
            "uno que se debilita abre la puerta a la relajación monetaria."
        ),
        "interpretation": (
            "Un desempleo al alza señala enfriamiento económico y orienta a la Fed hacia recortes — "
            "históricamente alcista para bonos largos y acciones defensivas. Un mercado laboral "
            "al rojo vivo (bajo desempleo, nóminas fuertes) puede retrasar los recortes y mantener los "
            "rendimientos elevados. Vigila las peticiones iniciales semanalmente — adelanta el informe de "
            "nóminas entre 4 y 6 semanas."
        ),
        "related_markets": ["SPY", "XLY", "XLP", "HYG"],
        "series": [
            {"id": "UNRATE", "label": "Tasa de desempleo", "unit": "%", "units": "lin", "freq": "m"},
            {"id": "PAYEMS", "label": "Nóminas no agrícolas (variación mensual)", "unit": "k", "units": "chg", "freq": "m"},
            {"id": "ICSA", "label": "Peticiones iniciales de desempleo", "unit": "k", "units": "lin", "freq": "m"},
            {"id": "CIVPART", "label": "Tasa de participación laboral", "unit": "%", "units": "lin", "freq": "m"},
        ],
    },
    "liquidity": {
        "title": "Liquidez y Masa Monetaria",
        "subtitle": "Balance de la Fed, creación de dinero y condiciones financieras",
        "summary": (
            "La liquidez es el combustible de los mercados financieros. El balance de la Fed y la masa "
            "monetaria determinan cuánto capital está disponible para fluir hacia los activos. La flexibilización "
            "cuantitativa (QE) expande ambos e históricamente infla los precios de los activos; el ajuste "
            "cuantitativo (QT) los contrae y drena el apetito por riesgo."
        ),
        "interpretation": (
            "Un balance de la Fed y M2 en crecimiento tienden a apoyar los activos de riesgo — el oro, "
            "la renta variable y las criptomonedas se benefician más directamente. Cuando la Fed endurece "
            "(QT + tasas altas), la liquidez se contrae y las primas de riesgo se amplían. La velocidad del "
            "M2 revela si el dinero circula activamente (inflacionario) o se acumula (deflacionario)."
        ),
        "related_markets": ["GLD", "BTC-USD", "TLT", "UUP"],
        "series": [
            {"id": "M2SL", "label": "Masa monetaria M2", "unit": "Bn$", "units": "lin", "freq": "m"},
            {"id": "WALCL", "label": "Balance de la Fed (activos totales)", "unit": "Bn$", "units": "lin", "freq": "m"},
            {"id": "M2V", "label": "Velocidad del M2", "unit": "ratio", "units": "lin", "freq": "q"},
        ],
    },
}


def news(category: str = "general", limit: int = 30) -> dict:
    """Titulares macro en vivo. Categorías Finnhub: general, forex, crypto, merger."""
    items = finnhub.market_news(category=category, limit=limit)
    return {"category": category, "items": items}


def indicators() -> dict:
    """Indicadores macro: EE.UU. (FRED, alta frecuencia) + global (World Bank)."""
    return {
        "us": fred.indicators(),
        "global": worldbank.indicators(),
    }


def world_map(metric: str = "gdp") -> dict:
    """Datos por país para el globo 3D (World Bank, todos los países)."""
    return worldbank.world_map(metric)


def topic_detail(key: str, points: int = 240) -> dict | None:
    """Detalle de un topic macro para su deep page: series con historial + texto.

    Cada serie trae current/previous/change + puntos históricos (para el gráfico).
    El frontend filtra por rango de tiempo. None si el topic no existe.
    """
    cfg = MACRO_TOPICS.get(key)
    if cfg is None:
        return None
    series_out: list[dict] = []
    for s in cfg["series"]:
        hist = fred.observations(
            s["id"], limit=points, units=s.get("units", "lin"), frequency=s.get("freq")
        )
        cur = hist[-1]["value"] if hist else None
        prev = hist[-2]["value"] if len(hist) >= 2 else None
        change = round(cur - prev, 2) if cur is not None and prev is not None else None
        series_out.append(
            {
                "id": s["id"],
                "label": s["label"],
                "unit": s["unit"],
                "current": cur,
                "previous": prev,
                "change": change,
                "date": hist[-1]["date"] if hist else None,
                "points": hist,
            }
        )
    return {
        "key": key,
        "title": cfg["title"],
        "subtitle": cfg["subtitle"],
        "summary": cfg["summary"],
        "interpretation": cfg["interpretation"],
        "relatedMarkets": cfg["related_markets"],
        "series": series_out,
        "available": fred.available(),
    }


# Normaliza el nivel de impacto del calendario a High/Medium/Low (FMP usa esas
# etiquetas, pero a veces vienen en otros formatos). FRED no trae impacto.
def _norm_impact(v) -> str:
    s = str(v or "").strip().lower()
    if s in ("high", "3"):
        return "High"
    if s in ("medium", "2"):
        return "Medium"
    if s in ("low", "1"):
        return "Low"
    return "Low"


def calendar(days_back: int = 45, days_ahead: int = 30, countries: list[str] | None = None) -> dict:
    """Calendario económico de alto impacto con cifras reales.

    Fuente principal: FMP `economic-calendar` (si el plan lo incluye, da consenso).
    Como el plan gratuito de FMP NO lo expone (devuelve vacío), la fuente real es
    un calendario CURADO sobre FRED: releases que mueven el mercado (IPC, PCE, NFP,
    PIB, ventas minoristas, peticiones de desempleo…) unidos a su serie de datos
    para mostrar Anterior / Actual / Δ reales. El consenso no existe en FRED → se
    deja en blanco; nunca se inventan cifras.
    """
    today = date.today()
    start = (today - timedelta(days=days_back)).isoformat()
    end = (today + timedelta(days=days_ahead)).isoformat()

    # 1) Intento FMP (solo si el plan lo permite — normalmente vacío en free).
    rows = fmp.economic_calendar(start, end) if fmp.available() else []
    if rows:
        # Filtro por país si se especificaron.
        if countries:
            rows = [r for r in rows if (r.get("country") or "").upper() in countries]
        events = [
            {
                "date": r["date"], "country": r.get("country") or "—",
                "event": r.get("event") or "—", "previous": r.get("previous"),
                "estimate": r.get("estimate"), "actual": r.get("actual"),
                "change": None, "impact": _norm_impact(r.get("impact")),
                "unit": r.get("unit"), "category": r.get("category"), "status": "publicado",
                "why": None, "series": None,
            }
            for r in rows if r.get("event")
        ]
        events.sort(key=lambda e: e["date"] or "")
        return {"events": events, "available": True, "source": "fmp", "note": None, "countries_available": True}

    # 2) Calendario curado sobre FRED (la fuente real y profesional).
    events = fred.curated_calendar(days_back=days_back, days_ahead=days_ahead)
    # FRED solo cubre EE.UU. — si el usuario pide otros países avisamos.
    note = None
    if not fred.available():
        note = "Falta FRED_API_KEY para el calendario económico."
    elif countries and countries != ["US"]:
        note = "Datos internacionales no disponibles en la fuente gratuita (FRED). Solo se muestran eventos de EE.UU."
    return {
        "events": events,
        "available": bool(events) and fred.available(),
        "source": "fred-curado",
        "note": note,
        "countries_available": False,
    }


def status() -> dict:
    return {
        "finnhub": finnhub.available(),
        "fred": fred.available(),
        "worldbank": worldbank.available(),
    }
