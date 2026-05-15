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
  EURUSD: { price: 1.1742, variationPct: -0.21 },
  GOLD: { price: 3294, variationPct: 0.76 },
  BRENT: { price: 82.4, variationPct: -1.12 },
  BTC: { price: 68200, variationPct: 2.1 },
  ETH: { price: 3520, variationPct: 1.44 },
  US10Y: { price: 4.48, variationPct: 1.8 },
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
