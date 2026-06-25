// Cliente de la QuantFlow API. Toda la comunicación con el backend pasa por aquí.
// En local: "/api" → proxy de Vite al backend en :8000.
// En producción: se define VITE_API_BASE con la URL del backend en Render
//   (ej. "https://quantflow-api.onrender.com/api").
const BASE = import.meta.env.VITE_API_BASE || "/api";

export type AssetType =
  | "stock" | "etf" | "crypto" | "future" | "forex" | "index" | "unknown";

export interface Quote {
  ticker: string;
  name: string;
  assetType: AssetType;
  currency: string | null;
  exchange: string | null;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  open: number | null;
  volume: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  peRatio: number | null;
  priceAvg50: number | null;
  priceAvg200: number | null;
  sector: string | null;
  industry: string | null;
  source: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface History {
  ticker: string;
  range: string;
  interval: string;
  candles: Candle[];
}

export interface SearchResult {
  symbol: string;
  name: string | null;
  type: string;
  exchange: string | null;
}

export interface NewsItem {
  id: number | null;
  headline: string;
  summary: string | null;
  source: string | null;
  url: string | null;
  image: string | null;
  datetime: number | null;
  category: string | null;
  related: string | null;
}

export interface NewsResponse {
  scope: "company" | "market";
  ticker: string | null;
  items: NewsItem[];
}

export interface MacroNews {
  category: string;
  items: NewsItem[];
}

export interface MacroMetric {
  label: string;
  unit: string;
  value: number | null;
  year?: string | null;
  date?: string | null;
}

export interface CountryMacro {
  country: string;
  name: string;
  metrics: MacroMetric[];
}

export interface UsMacro {
  series: string;
  label: string;
  unit: string;
  value: number | null;
  previous: number | null;
  change: number | null;
  date: string | null;
  topic: string | null;   // enlaza el KPI con su deep page (/macro/:topic)
  impact: string | null;  // lectura de mercado curada
}

export interface MacroIndicators {
  us: UsMacro[];
  global: CountryMacro[];
}

export interface MapValue {
  iso3: string;
  name: string | null;
  value: number;
  year: string | null;
}

export interface MacroMap {
  metric: string;
  label: string;
  unit: string;
  values: MapValue[];
}

export type ImpactLevel = "High" | "Medium" | "Low";

export interface CalendarEvent {
  date: string;
  country: string;
  event: string;
  previous: number | string | null;
  estimate: number | string | null;
  actual: number | string | null;
  change?: number | null;
  impact: ImpactLevel;
  unit: string | null;
  category?: string | null;
  status?: "publicado" | "estimado" | null;
  why?: string | null;
  series?: string | null;
}

export interface MacroCalendar {
  events: CalendarEvent[];
  available: boolean;
  source: "fmp" | "fred" | "fred-curado";
  note: string | null;
  countries_available?: boolean;
}

// ---- Macro deep page (topic detail: inflation, rates) ----
export interface MacroSeriesPoint {
  date: string;
  value: number;
}

export interface MacroSeries {
  id: string;
  label: string;
  unit: string;
  current: number | null;
  previous: number | null;
  change: number | null;
  date: string | null;
  points: MacroSeriesPoint[];
}

export interface MacroTopic {
  key: string;
  title: string;
  subtitle: string;
  summary: string;
  interpretation: string;
  relatedMarkets: string[];
  series: MacroSeries[];
  available: boolean;
}

// ---- Mean Reversion (regresión a la media) ----
export interface MeanReversionPoint {
  time: number;    // epoch en segundos
  price: number;   // precio observado
  mean: number;    // media (canal central)
  upper1: number;  // +1σ
  lower1: number;  // -1σ
  upper2: number;  // +2σ (banda extrema)
  lower2: number;  // -2σ (banda extrema)
  z: number;       // z-score puntual
}

export type MeanReversionVerdict =
  | "INFRAVALORADO" | "BARATO" | "EQUILIBRIO" | "CARO" | "SOBREVALORADO";

export type MeanReversionSignal =
  | "BUY" | "WATCH_BUY" | "NEUTRAL" | "WATCH_SELL" | "SELL";

export interface MeanReversionStats {
  zScore: number;
  halfLife: number | null;        // vida media en días
  halfLifeBars: number | null;    // vida media en barras
  sigma: number;                  // σ residual
  slopeAnnual: number;            // deriva anual (fracción)
  rSquared: number;               // calidad del ajuste (0..1)
  phi: number;                    // coef. autorregresivo
  isMeanReverting: boolean;
  verdict: MeanReversionVerdict;
  verdictScore: number;           // -2..2
  signal: MeanReversionSignal;
}

export interface MeanReversion {
  ticker: string;
  range: string;
  interval: string;
  points: MeanReversionPoint[];
  stats: MeanReversionStats;
}

// ---- Monte Carlo (GBM simulation) ----
export interface MonteCarloFan {
  dates: string[];
  p5: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p95: number[];
}

export interface MonteCarloFinal {
  p5: number; p10: number; p25: number; p50: number;
  p75: number; p90: number; p95: number; mean: number;
}

export interface MonteCarloMetrics {
  prob_gain: number;
  expected_return: number;  // %
  var_90: number; cvar_90: number;
  var_95: number; cvar_95: number;
  var_99: number; cvar_99: number;
  best_case_pct: number;
  worst_case_pct: number;
}

export interface MonteCarloBucket {
  lo: number; hi: number; mid: number; count: number; pct: number;
}

export interface MonteCarloResult {
  ticker: string;
  name: string;
  current_price: number;
  days: number;
  sims: number;
  annualized_return: number;  // %/yr
  annualized_vol: number;     // %/yr
  fan: MonteCarloFan;
  final: MonteCarloFinal;
  distribution: MonteCarloBucket[];
  metrics: MonteCarloMetrics;
}

// ---- GARCH (modelos de volatilidad) ----
export interface GarchTimePoint {
  time: number;            // epoch en segundos
  cond: number;            // vol condicional anualizada (%)
  realized: number | null; // vol realizada móvil 21d anualizada (%)
  ret: number;             // retorno log diario (%)
  vol: number | null;      // volumen
}

export interface GarchForecast {
  dates: string[];
  values: number[];        // vol anualizada (%) por día
  horizon: number;
}

export interface GarchModel {
  name: string;
  params: Record<string, number>;
  loglik: number;
  aic: number;
  bic: number;
  persistence: number;
  longrun_vol: number | null;
  leverage: number | null;
  is_best: boolean;
}

export interface GarchHistBin {
  mid: number;
  count: number;
  pct: number;
}

export interface GarchRisk {
  current_vol: number;
  longrun_vol: number | null;
  forecast_vol: number | null;
  persistence: number;
  vol_ratio: number | null;
  var_95: number;
  var_99: number;
  es_95: number;
  annual_return: number;
  regime: string;
  regime_score: number;    // -2..2
  trend: string;
}

export interface GarchResult {
  ticker: string;
  name: string;
  range: string;
  interval: string;
  n_obs: number;
  current_price: number;
  best_model: string;
  timeline: GarchTimePoint[];
  forecast: GarchForecast;
  clustering_acf: number[];
  histogram: GarchHistBin[];
  std_resid: number[];
  models: GarchModel[];
  risk: GarchRisk;
}

// ---- Opciones (Black-Scholes) ----
export interface OptionGreeks {
  price: number; delta: number; gamma: number; theta: number; vega: number;
  rho: number; d1: number | null; d2: number | null; prob_itm: number;
  intrinsic: number; time_value: number;
}
export interface OptionScenario {
  move_pct: number; spot: number; price: number; delta: number; gamma: number;
  theta: number; vega: number; pnl: number; pnl_pct: number | null;
}
export interface OptionSpotPoint {
  spot: number; value: number; payoff: number; delta: number; gamma: number;
  vega: number; theta: number;
}
export interface OptionThetaPoint { days: number; price: number; theta: number; time_value: number; }
export interface OptionSurface { spots: number[]; days: number[]; vega: number[][]; gamma: number[][]; }
export interface OptionChainRow {
  strike: number; moneyness: number;
  call: { price: number; delta: number; prob_itm: number };
  put: { price: number; delta: number; prob_itm: number };
}
export interface OptionsResult {
  ticker: string; name: string; kind: "call" | "put";
  spot: number; strike: number; expiry_days: number;
  iv: number; iv_source: string; hist_vol: number | null; r: number; q: number;
  currency: string | null;
  greeks: OptionGreeks; premium: number; breakeven: number; moneyness: string;
  scenarios: OptionScenario[]; spot_curve: OptionSpotPoint[];
  theta_curve: OptionThetaPoint[]; surface: OptionSurface; chain: OptionChainRow[];
}

export interface OptionsParams {
  strike?: number; expiry_days?: number; iv?: number; r?: number; q?: number;
  kind?: "call" | "put";
}

// ---- Anomalías / Hipótesis de Mercados Eficientes ----
export interface AnomVRRow { q: number; vr: number; z: number; p: number; reject: boolean; }
export interface AnomACFRow { lag: number; rho: number; significant: boolean; }
export interface AnomCalRow { label: string; mean: number; t: number; p: number; n: number; significant: boolean; }
export interface AnomResult {
  ticker: string; name: string; range: string; n_obs: number;
  verdict: string; score: number; rejections: number; total_tests: number; bias: string;
  variance_ratio: { rows: AnomVRRow[]; reject: boolean };
  acf: { rows: AnomACFRow[]; band: number; n_significant: number };
  ljung_box: { q: number; crit: number; reject: boolean; h: number };
  runs: { runs: number; expected: number; z: number; p: number; random: boolean };
  day_of_week: { rows: AnomCalRow[]; significant: boolean };
  month_of_year: { rows: AnomCalRow[]; january: number; rest_avg: number; january_effect: boolean };
  turn_of_month: { tom_mean: number; rest_mean: number; t: number; p: number; n_tom: number; effect: boolean };
}

// ---- Análisis Fundamental ----
export interface FundProfile {
  name: string | null; longName: string | null;
  sector: string | null; industry: string | null; country: string | null;
  exchange: string | null; currency: string | null;
  marketCap: number | null; price: number | null; employees: number | null;
  ceo: string | null; website: string | null; description: string | null;
  ipoDate: string | null; sharesOutstanding: number | null;
  beta: number | null; dividendYield: number | null;
}
export interface FundIncome {
  year: number; revenue: number | null; grossProfit: number | null;
  operatingIncome: number | null; netIncome: number | null;
  ebitda: number | null; eps: number | null; interestExpense: number | null;
}
export interface FundBalance {
  year: number; totalAssets: number | null; totalLiabilities: number | null;
  stockholdersEquity: number | null; totalDebt: number | null; cash: number | null;
  currentAssets: number | null; currentLiabilities: number | null;
  inventory: number | null; receivables: number | null;
  retainedEarnings: number | null; ordinaryShares: number | null;
}
export interface FundCashflow {
  year: number; operatingCashFlow: number | null; capex: number | null;
  freeCashFlow: number | null;
}
export interface RatioEntry {
  actual: number | null;
  historico: (number | null)[];
  promedioIndustria: number | null;
  interpretacion: string;
}
export interface FundRatios {
  liquidez: Record<string, RatioEntry>;
  solvencia: Record<string, RatioEntry>;
  eficiencia: Record<string, RatioEntry>;
  rentabilidad: Record<string, RatioEntry>;
  valoracion: Record<string, RatioEntry>;
}
export interface FundGrowth {
  revenueYoy: number | null; revenueCagr3Y: number | null;
  epsYoy: number | null; epsCagr3Y: number | null;
  fcfCagr3Y: number | null; revenueHistory: (number | null)[];
}
export interface FundQuality {
  score: number; grade: string; label: string;
  breakdown: { rentabilidad: number; crecimiento: number;
    saludFinanciera: number; fosoCompetitivo: number };
  positiveDrivers: string[]; negativeDrivers: string[]; methodology: string;
}
export interface FundDcf {
  intrinsicValue: number | null; currentPrice: number | null;
  upside: number | null; marginOfSafety: number | null;
  wacc: number; growthHigh: number; growthMid: number; terminalGrowth: number;
  pvFCF: number; pvTerminal: number;
  projectedFCF: { year: number; fcf: number; pv: number }[];
  baseFCF: number | null;
  assumptions: { beta: number; riskFree: number; equityPremium: number };
}
export interface FundRelative {
  peBasedValue: number | null; evEbitdaBasedValue: number | null;
  psBasedValue: number | null; weightedValue: number | null;
  industryPe: number; note: string;
}
export interface FundCombined {
  fairValue: number | null; confidence: number;
  rangeMin: number | null; rangeMax: number | null;
  label: string; upside: number | null;
}
export interface FundCheck { label: string; passed: boolean | null; detail: string; }
export interface FundPiotroski {
  score: number; max: number; evaluated: number;
  verdict: string; label: string; checks: FundCheck[];
}
export interface FundAltman {
  z: number; zone: string; label: string;
  components: Record<string, number | null>;
  thresholds: { safe: number; distress: number }; note: string;
}
export interface FundBuffett {
  passed: number; evaluated: number; pct: number;
  verdict: string; label: string; checks: FundCheck[];
}
export interface SentimentHeadline {
  headline: string | null; source: string | null; url: string | null;
  datetime: number | null; tone: string; net: number;
}
export interface FundSentiment {
  score: number; label: string; verdict: string; available: boolean;
  positive: number; negative: number; neutral: number; analyzed: number;
  headlines: SentimentHeadline[]; summary: string;
}
export interface PeerMetrics {
  ticker: string; name: string; marketCap: number | null; pe: number | null;
  roe: number | null; netMargin: number | null; grossMargin: number | null;
  revenueGrowth: number | null; debtEquity: number | null;
  isSelf: boolean; similarity?: number | null;
}
export interface FundCompetitors {
  self: PeerMetrics; peers: PeerMetrics[]; marketShare: number | null;
  advantageScore: number; advantageLabel: string;
  reasons: string[]; discovery: string;
}
export interface DecisionComponent { score: number; weight: number; }
export interface FundDecision {
  score: number; classification: string; label: string; recommendation: string;
  components: Record<string, DecisionComponent>;
  aiAdjustments: { calidad: number; sentimiento: number };
  methodology: string;
}
export interface HorizonEntry { score: number; verdict: string; drivers: string; }
export interface FundHorizon {
  corto: HorizonEntry; mediano: HorizonEntry; largo: HorizonEntry;
}
export interface Fundamentals {
  ticker: string;
  profile: FundProfile;
  income: FundIncome[];
  balance: FundBalance[];
  cashflow: FundCashflow[];
  ratios: FundRatios;
  growth: FundGrowth;
  quality: FundQuality;
  valuation: { dcf: FundDcf | null; relative: FundRelative | null; combined: FundCombined };
  piotroski: FundPiotroski;
  altman: FundAltman | null;
  buffett: FundBuffett;
  sentiment: FundSentiment;
  competitors: FundCompetitors;
  decision: FundDecision;
  horizon: FundHorizon;
}

// ---- Order Flow (microestructura institucional, vía Alpaca) ----
export interface OFLevel {
  price: number; bid: number; ask: number; delta: number; total: number;
  imbalance: "" | "buy" | "sell";
}
export interface OFBucket {
  time: number; open: number; close: number; high: number; low: number;
  delta: number; buy: number; sell: number; total: number;
  poc: number | null; levels: OFLevel[];
}
export interface OFFootprint { buckets: OFBucket[]; priceLevels: number[]; }
export interface OFVPBin {
  price: number; volume: number; buyVol: number; sellVol: number; delta: number;
  pct: number; isPOC: boolean; inValueArea: boolean; node: "" | "HVN" | "LVN";
}
export interface OFVolumeProfile {
  step: number; poc: number | null; vah: number | null; val: number | null;
  totalVol: number; bins: OFVPBin[];
}
export interface OFDeltaBar {
  time: number; delta: number; cumDelta: number; buyVol: number; sellVol: number;
  close: number; volume: number;
}
export interface OFDelta {
  bars: OFDeltaBar[]; totalDelta: number; maxCum: number; minCum: number;
  divergence: { detected: boolean; type: string; note: string };
}
export interface OFBookLevel { price: number; size: number; }
export interface OFWall { price: number; size: number; side: "bid" | "ask"; }
export interface OFLiquidity {
  realBook: boolean; bids: OFBookLevel[]; asks: OFBookLevel[];
  spread: number | null; midPrice: number; walls: OFWall[]; note: string;
}
export interface OFAbsorption { time: number; price: number; delta: number; note: string; }
export interface OFExhaustion { time: number; price: number; note: string; }
export interface OFMicro {
  buyVol: number; sellVol: number; buyPressurePct: number; sellPressurePct: number;
  ofi: number; aggression: string; volumeAccel: number; liquidityConcentration: number;
  absorption: OFAbsorption[]; exhaustion: OFExhaustion[];
}
export interface OFScores {
  liquidityPressure: number; buyerAggression: number;
  institutionalActivity: number; expectedReaction: number;
}
export interface OFRegime {
  label: string; confidence: number;
  features: { r2?: number; drift?: number; volAnnPct?: number; slope?: number };
}
export interface OFAnomalyItem { time: number; z: number; volume: number; delta: number; note: string; }
export interface OFAnomaly { detected: boolean; score: number; items: OFAnomalyItem[]; }
export interface OFScorecard {
  buyingPressure: number; sellingPressure: number; deltaImbalance: number;
  liquidityConcentration: number; volumeAnomaly: number;
  volatilityState: number | null; marketRegime: string; institutionalActivity: number;
}
export interface OrderFlow {
  ticker: string; name: string; assetType: AssetType; currency: string;
  dataSource: string; granularity: "trades" | "bars";
  price: number; priceStep: number; nBars: number; nTrades: number;
  sessionStart: number | null; sessionEnd: number | null;
  footprint: OFFootprint; volumeProfile: OFVolumeProfile; delta: OFDelta;
  liquidity: OFLiquidity; microstructure: OFMicro;
  ai: { scores: OFScores; regime: OFRegime; anomaly: OFAnomaly; insights: string[] };
  scorecard: OFScorecard; disclaimer: string;
}

// ════════════════════════════════════════════════════════════════════════════
//  ORDER FLOW v2 — contratos §3 (un endpoint por módulo)
// ════════════════════════════════════════════════════════════════════════════
export type OFTier = "T1" | "T2" | "T3";
export type OFMode = "intraday" | "composite";
export type OFTimeframe = "1D" | "1W" | "1M" | "1Y" | "5Y";
export type OFSession = "Asia" | "London" | "NY" | "RTH" | "24h";

interface OFBase {
  ticker: string; name: string; tf: OFTimeframe; session: OFSession;
  mode: OFMode; tier: OFTier; price: number;
}

export interface OFOverview extends OFBase {
  assetType: AssetType; currency: string; isCrypto: boolean; step: number;
  nBars: number; nTrades: number; sessionStart: number; sessionEnd: number;
  kpis: {
    cvd: number; poc: number | null; vah: number | null; val: number | null;
    buyPressurePct: number; sellPressurePct: number;
    nakedPocs: number; divergences: number;
  };
  sparkline: number[]; disclaimer: string;
}

export interface OFVPBin2 { price: number; vol: number; buyVol: number; sellVol: number; }
export interface OFVolumeProfile2 extends OFBase {
  step: number; bins: OFVPBin2[];
  poc: number | null; vah: number | null; val: number | null; valueAreaPct: number;
  totalVol: number; hvn: number[]; lvn: number[]; nakedPocs: number[]; approx: boolean;
}

export interface OFCell { price: number; bidVol: number; askVol: number; delta: number; }
export interface OFImbalance { price: number; side: "bid" | "ask"; ratio: number; }
export interface OFFpBucket {
  t: number; open: number; high: number; low: number; close: number;
  cells: OFCell[]; imbalances: OFImbalance[];
  barDelta: number; maxDelta: number; minDelta: number; vol: number; vpoc: number | null;
}
export interface OFFootprint2 extends OFBase {
  step: number; buckets: OFFpBucket[]; priceLevels: number[]; approx: boolean;
}

export interface OFDeltaBar2 { t: number; delta: number; cvd: number; close: number; vol: number; }
export interface OFDivergence { t: number; type: "bull" | "bear"; }
export interface OFAccumZone { tStart: number; tEnd: number; priceLo: number; priceHi: number; }
export interface OFDelta2 extends OFBase {
  bars: OFDeltaBar2[]; totalDelta: number;
  divergences: OFDivergence[]; accumulationZones: OFAccumZone[]; approx: boolean;
}

export interface OFBigTrade { t: number; price: number; size: number; }
export interface OFHeatmap extends OFBase {
  tBins: number[]; priceBins: number[]; matrix: number[][];
  bigTrades: OFBigTrade[]; scale: "lin" | "log"; approx: boolean;
}

export interface OFDomLevel { price: number; size: number; }
export interface OFLargeOrder { price: number; size: number; side: "bid" | "ask"; }
export interface OFOrderBook2 {
  ticker: string; name: string; tier: OFTier; ts: number;
  bids: OFDomLevel[]; asks: OFDomLevel[];
  spread: number | null; midPrice: number; largeOrders: OFLargeOrder[]; approx: boolean;
}

export interface OFRibbonPoint { t: number; state: number; label: string; }
export interface OFMlRegime {
  current: { label: string; confidence: number };
  ribbon: OFRibbonPoint[]; states: { id: number; label: string }[];
}
export interface OFAnomalyItem2 { t: number; score: number; price: number; note: string; }
export interface OFCalibPoint { bin: number; predicted: number; observed: number; n: number; }
export interface OFImportance { name: string; importance: number; }
export interface OFDirectional {
  available: boolean; experimental?: boolean; horizon?: number; probUp?: number;
  metrics?: { logloss: number; baselineLogloss: number; precision: number; recall: number; nSamples: number };
  calibration?: OFCalibPoint[];
  backtest?: { sharpe: number; winRate: number; totalReturn: number; costBps: number };
  importance?: OFImportance[]; note: string;
}
export interface OFMl {
  ticker: string; name: string; tf: OFTimeframe; session: OFSession;
  mode: OFMode; tier: OFTier; nBars: number; asOf: number;
  regime: OFMlRegime;
  anomalies: { items: OFAnomalyItem2[]; threshold: number };
  directional: OFDirectional;
  features: { names: string[]; latest: Record<string, number> };
  disclaimer: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  quote: (ticker: string) => get<Quote>(`/quote/${encodeURIComponent(ticker)}`),
  history: (ticker: string, range: string) =>
    get<History>(`/history/${encodeURIComponent(ticker)}?range=${range}`),
  search: (query: string) =>
    get<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(query)}`),
  news: (ticker: string) =>
    get<NewsResponse>(`/news/${encodeURIComponent(ticker)}`),
  marketNews: () => get<NewsResponse>(`/news`),
  macroNews: (category = "general") =>
    get<MacroNews>(`/macro/news?category=${category}`),
  macroIndicators: () => get<MacroIndicators>(`/macro/indicators`),
  macroCalendar: (daysBack = 7, daysAhead = 14, countries?: string[]) => {
    const p = new URLSearchParams({ days_back: String(daysBack), days_ahead: String(daysAhead) });
    if (countries?.length) p.set("countries", countries.join(","));
    return get<MacroCalendar>(`/macro/calendar?${p}`);
  },
  macroCalendarPro: (daysBack = 45, daysAhead = 30, countries?: string[]) => {
    const p = new URLSearchParams({ days_back: String(daysBack), days_ahead: String(daysAhead) });
    if (countries?.length) p.set("countries", countries.join(","));
    return get<MacroCalendar>(`/macro/calendar?${p}`);
  },
  macroMap: (metric = "gdp") => get<MacroMap>(`/macro/map?metric=${metric}`),
  macroSeries: (key: string) =>
    get<MacroTopic>(`/macro/series/${encodeURIComponent(key)}`),
  meanReversion: (ticker: string, range: string) =>
    get<MeanReversion>(
      `/meanreversion/${encodeURIComponent(ticker)}?range=${range}`
    ),
  monteCarlo: (ticker: string, days: number = 252) =>
    get<MonteCarloResult>(
      `/montecarlo/${encodeURIComponent(ticker)}?days=${days}`
    ),
  garch: (ticker: string, range: string = "2y", horizon: number = 21) =>
    get<GarchResult>(
      `/garch/${encodeURIComponent(ticker)}?range=${range}&horizon=${horizon}`
    ),
  options: (ticker: string, p: OptionsParams = {}) => {
    const qs = new URLSearchParams();
    if (p.strike != null) qs.set("strike", String(p.strike));
    if (p.expiry_days != null) qs.set("expiry_days", String(p.expiry_days));
    if (p.iv != null) qs.set("iv", String(p.iv));
    if (p.r != null) qs.set("r", String(p.r));
    if (p.q != null) qs.set("q", String(p.q));
    if (p.kind) qs.set("kind", p.kind);
    const s = qs.toString();
    return get<OptionsResult>(`/options/${encodeURIComponent(ticker)}${s ? "?" + s : ""}`);
  },
  anomalies: (ticker: string, range: string = "3y") =>
    get<AnomResult>(`/anomalies/${encodeURIComponent(ticker)}?range=${range}`),
  fundamentals: (ticker: string) =>
    get<Fundamentals>(`/fundamentals/${encodeURIComponent(ticker)}`),
  orderflow: (ticker: string, buckets = 24) =>
    get<OrderFlow>(`/orderflow/${encodeURIComponent(ticker)}?buckets=${buckets}`),
};

// Order Flow v2 — un método por módulo. qs() añade tf/session comunes.
function ofqs(tf: OFTimeframe, session: OFSession, extra: Record<string, string | number> = {}): string {
  const p = new URLSearchParams({ tf, session });
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
}
export const of = {
  overview: (t: string, tf: OFTimeframe, s: OFSession) =>
    get<OFOverview>(`/orderflow/${encodeURIComponent(t)}?${ofqs(tf, s)}`),
  volumeProfile: (t: string, tf: OFTimeframe, s: OFSession) =>
    get<OFVolumeProfile2>(`/orderflow/${encodeURIComponent(t)}/volume-profile?${ofqs(tf, s)}`),
  footprint: (t: string, tf: OFTimeframe, s: OFSession, buckets = 24) =>
    get<OFFootprint2>(`/orderflow/${encodeURIComponent(t)}/footprint?${ofqs(tf, s, { buckets })}`),
  delta: (t: string, tf: OFTimeframe, s: OFSession, buckets = 48) =>
    get<OFDelta2>(`/orderflow/${encodeURIComponent(t)}/delta?${ofqs(tf, s, { buckets })}`),
  heatmap: (t: string, tf: OFTimeframe, s: OFSession) =>
    get<OFHeatmap>(`/orderflow/${encodeURIComponent(t)}/heatmap?${ofqs(tf, s)}`),
  orderbook: (t: string, tf: OFTimeframe, s: OFSession) =>
    get<OFOrderBook2>(`/orderflow/${encodeURIComponent(t)}/orderbook?${ofqs(tf, s)}`),
  ml: (t: string, tf: OFTimeframe, s: OFSession, horizon = 5) =>
    get<OFMl>(`/orderflow/${encodeURIComponent(t)}/ml?${ofqs(tf, s, { horizon })}`),
};

// ── Gestión de Riesgo IA ──────────────────────────────────────────────────────

export interface RiskComponent {
  score: number; valor: number; unidad: string; label: string;
}

export interface RiskScore {
  score: number; level: string; color: string; recommendation: string;
  components: { volatilidad: RiskComponent; drawdown: RiskComponent; momentum: RiskComponent;
    liquidez: RiskComponent; correlacion: RiskComponent; regimen: RiskComponent; };
  ticker: string; range: string; n_obs: number; updated: string;
}

export interface RiskVolatility {
  hist_vol: number; ewma_vol: number; long_term_avg_vol: number;
  vol_percentile: number; vol_regime: string; trend_direction: string;
  ml_prob: number; ml_signal: string;
  chart_data: { time: string; hist_vol: number; ewma_vol: number }[];
  feature_values: { vol_momentum: number; volume_trend: number; atr_ratio: number; ma_ratio: number };
  ticker: string; disclaimer: string;
}

export interface RiskVar {
  hist_var_1d: number; hist_var_Td: number; cvar: number; mc_var_1d: number;
  confidence: number; horizon: number;
  scenarios: { mejor: {retorno_pct: number; descripcion: string};
    promedio: {retorno_pct: number; descripcion: string};
    peor: {retorno_pct: number; descripcion: string}; };
  distribucion: { bucket_mid: number; count: number; is_loss: boolean }[];
  max_perdida_1d: number; n_obs: number; ticker: string;
}

export interface RiskSizing {
  current_price: number; atr_14: number; hist_vol_pct: number;
  kelly_fraction: number; risk_per_trade: number; stop_loss_distance: number;
  stop_loss_price: number; stop_loss_pct: number;
  atr_size_units: number; vol_adjustment: number;
  recommended_units: number; recommended_pct_capital: number; max_exposure_pct: number;
  regime_adjustment: string; capital: number; risk_pct_input: number; ticker: string;
}

export interface RiskPortfolio {
  tickers: string[]; n_tickers: number;
  correlation_matrix: number[][];
  avg_correlation: number; diversification_score: number;
  metrics: { ticker: string; vol_anual: number; beta: number | null; sharpe: number }[];
  warnings: string[]; n_obs: number;
}

export interface RiskStress {
  ticker: string; current_price: number; beta: number;
  escenarios: { nombre: string; shock_mercado_pct: number; impacto_activo_pct: number;
    precio_esperado: number; probabilidad: string; descripcion: string }[];
  drawdown_historico_max: number; nota: string;
}

export interface RiskRegime {
  ticker: string; regime: string; confidence: number; trend_strength: number;
  momentum_20d: number; momentum_60d: number;
  current_price: number; sma_20: number; sma_50: number; sma_200: number;
  above_sma50: boolean; above_sma200: boolean;
  hist_vol: number; long_term_avg_vol: number; vol_vs_avg: number;
  trading_implication: string;
  regime_history: { time: string; price: number; sma50: number | null; regime_label: string }[];
}

export async function fetchRiskScore(ticker: string, range = "1y"): Promise<RiskScore> {
  const r = await fetch(`${BASE}/risk/score/${ticker}?range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
export async function fetchRiskVolatility(ticker: string, range = "1y"): Promise<RiskVolatility> {
  const r = await fetch(`${BASE}/risk/volatility/${ticker}?range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
export async function fetchRiskVar(ticker: string, confidence = 0.95, horizon = 1, range = "1y"): Promise<RiskVar> {
  const r = await fetch(`${BASE}/risk/var/${ticker}?confidence=${confidence}&horizon=${horizon}&range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
export async function fetchRiskSizing(ticker: string, capital = 10000, riskPct = 0.02, range = "1y"): Promise<RiskSizing> {
  const r = await fetch(`${BASE}/risk/sizing/${ticker}?capital=${capital}&risk_pct=${riskPct}&range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
export async function fetchRiskPortfolio(tickers: string, range = "1y"): Promise<RiskPortfolio> {
  const r = await fetch(`${BASE}/risk/portfolio?tickers=${encodeURIComponent(tickers)}&range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
export async function fetchRiskStress(ticker: string, range = "1y"): Promise<RiskStress> {
  const r = await fetch(`${BASE}/risk/stress/${ticker}?range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
export async function fetchRiskRegime(ticker: string, range = "1y"): Promise<RiskRegime> {
  const r = await fetch(`${BASE}/risk/regime/${ticker}?range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export interface RiskPerformance {
  ticker: string; n_obs: number; range: string;
  sharpe_ratio: number; sortino_ratio: number; calmar_ratio: number; sharpe_90d: number;
  ann_return_pct: number; expectancy_daily_pct: number;
  win_rate_pct: number; profit_factor: number;
  avg_win_pct: number; avg_loss_pct: number;
  max_drawdown_pct: number; ulcer_index: number; ann_vol_pct: number;
  max_consec_wins: number; max_consec_losses: number;
  insights: { tipo: "POSITIVO" | "NEUTRAL" | "ALERTA"; mensaje: string }[];
}

export async function fetchRiskPerformance(ticker: string, range = "1y"): Promise<RiskPerformance> {
  const r = await fetch(`${BASE}/risk/performance/${ticker}?range=${range}`);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
