import { defaultUniverse } from "@/lib/market/universe";

export type MarketQuote = {
  symbol: string;
  price: number;
  variationPct: number;
  source: string;
  timestamp: Date;
};

const mockQuotes: Record<string, { price: number; variationPct: number }> = {
  CAC40: { price: 8248, variationPct: -0.82 },
  DAX: { price: 23840, variationPct: 0.34 },
  STOXX50: { price: 5390, variationPct: -0.18 },
  FTSE: { price: 8435, variationPct: 0.22 },
  SP500: { price: 5868, variationPct: 0.64 },
  NASDAQ: { price: 21320, variationPct: 1.08 },
  DOWJONES: { price: 42210, variationPct: 0.12 },
  RUSSELL: { price: 2078, variationPct: -0.45 },
  NIKKEI: { price: 38640, variationPct: -0.28 },
  AAPL: { price: 213.4, variationPct: 0.92 },
  MSFT: { price: 478.2, variationPct: 0.38 },
  NVDA: { price: 137.8, variationPct: 2.72 },
  TSLA: { price: 182.6, variationPct: -1.85 },
  AMZN: { price: 224.1, variationPct: 1.14 },
  META: { price: 612.5, variationPct: -0.66 },
  GOOGL: { price: 186.9, variationPct: 0.48 },
  LVMH: { price: 642.8, variationPct: -1.08 },
  TTE: { price: 64.2, variationPct: -0.36 },
  EURUSD: { price: 1.1742, variationPct: -0.21 },
  GBPUSD: { price: 1.289, variationPct: 0.18 },
  USDJPY: { price: 154.8, variationPct: 0.42 },
  GOLD: { price: 3294, variationPct: 0.76 },
  SILVER: { price: 31.2, variationPct: 1.62 },
  BRENT: { price: 82.4, variationPct: -1.12 },
  WTI: { price: 78.1, variationPct: -0.95 },
  BTC: { price: 68200, variationPct: 2.1 },
  ETH: { price: 3520, variationPct: 1.44 },
  SOL: { price: 174.6, variationPct: 3.28 },
  BNB: { price: 612.4, variationPct: 0.86 },
  XRP: { price: 0.62, variationPct: -0.74 },
  US10Y: { price: 4.48, variationPct: 1.8 },
  DE10Y: { price: 2.58, variationPct: 0.7 },
};

export async function getMarketQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const now = new Date();

  // Placeholder provider: replace with TwelveData, Polygon, Alpha Vantage, Yahoo adapter, etc.
  return symbols.map((symbol) => {
    const fallback = mockQuotes[symbol] ?? { price: 100, variationPct: 0 };
    return {
      symbol,
      price: fallback.price,
      variationPct: fallback.variationPct,
      source: process.env.MARKET_DATA_API_KEY ? "market-api-placeholder" : "mock",
      timestamp: now,
    };
  });
}

export function defaultQuoteUniverse() {
  return defaultUniverse.map((asset) => asset.symbol);
}
