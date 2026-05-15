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
  SP500: { price: 6853.15, variationPct: 0.35 },
  NASDAQ: { price: 719.79, variationPct: 0.71 },
  DOWJONES: { price: 42210, variationPct: 0.12 },
  RUSSELL: { price: 2078, variationPct: -0.45 },
  NIKKEI: { price: 38640, variationPct: -0.28 },
  AAPL: { price: 266.43, variationPct: 0.12 },
  MSFT: { price: 409.43, variationPct: 1.04 },
  NVDA: { price: 235.74, variationPct: 4.39 },
  TSLA: { price: 443.3, variationPct: 0.9 },
  AMZN: { price: 224.1, variationPct: 1.14 },
  META: { price: 612.5, variationPct: -0.66 },
  GOOGL: { price: 186.9, variationPct: 0.48 },
  LVMH: { price: 642.8, variationPct: -1.08 },
  TTE: { price: 64.2, variationPct: -0.36 },
  EURUSD: { price: 1.1716, variationPct: -0.21 },
  GBPUSD: { price: 1.289, variationPct: 0.18 },
  USDJPY: { price: 154.8, variationPct: 0.42 },
  GOLD: { price: 4480, variationPct: -0.4 },
  SILVER: { price: 31.2, variationPct: 1.62 },
  BRENT: { price: 101.8, variationPct: 0.8 },
  WTI: { price: 78.1, variationPct: -0.95 },
  BTC: { price: 80579, variationPct: 1.1 },
  ETH: { price: 2255, variationPct: -0.5 },
  SOL: { price: 92.42, variationPct: 1.37 },
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
