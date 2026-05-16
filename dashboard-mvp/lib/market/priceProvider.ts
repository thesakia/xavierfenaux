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

const yahooSymbols: Record<string, string> = {
  CAC40: "^FCHI",
  DAX: "^GDAXI",
  STOXX50: "^STOXX50E",
  FTSE: "^FTSE",
  SP500: "^GSPC",
  NASDAQ: "^IXIC",
  DOWJONES: "^DJI",
  RUSSELL: "^RUT",
  NIKKEI: "^N225",
  AAPL: "AAPL",
  MSFT: "MSFT",
  NVDA: "NVDA",
  TSLA: "TSLA",
  AMZN: "AMZN",
  META: "META",
  GOOGL: "GOOGL",
  LVMH: "MC.PA",
  TTE: "TTE.PA",
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  SOL: "SOL-USD",
  BNB: "BNB-USD",
  XRP: "XRP-USD",
  EURUSD: "EURUSD=X",
  GBPUSD: "GBPUSD=X",
  USDJPY: "JPY=X",
  GOLD: "GC=F",
  SILVER: "SI=F",
  BRENT: "BZ=F",
  WTI: "CL=F",
  US10Y: "^TNX",
};

type YahooQuote = {
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: number;
};

async function getYahooQuotes(symbols: string[]) {
  const mapped = symbols
    .map((symbol) => yahooSymbols[symbol])
    .filter((symbol): symbol is string => Boolean(symbol));
  if (!mapped.length) return new Map<string, MarketQuote>();

  const response = await fetch(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(mapped.join(","))}`,
    {
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error(`Yahoo quote failed with status ${response.status}`);

  const payload = (await response.json()) as { quoteResponse?: { result?: YahooQuote[] } };
  const byYahooSymbol = new Map((payload.quoteResponse?.result ?? []).map((quote) => [quote.symbol, quote]));
  const quotes = new Map<string, MarketQuote>();

  for (const symbol of symbols) {
    const yahooSymbol = yahooSymbols[symbol];
    const quote = yahooSymbol ? byYahooSymbol.get(yahooSymbol) : null;
    if (!quote || typeof quote.regularMarketPrice !== "number") continue;
    quotes.set(symbol, {
      symbol,
      price: quote.regularMarketPrice,
      variationPct: quote.regularMarketChangePercent ?? 0,
      source: "yahoo",
      timestamp: quote.regularMarketTime ? new Date(quote.regularMarketTime * 1000) : new Date(),
    });
  }

  return quotes;
}

export async function getMarketQuotes(symbols: string[]): Promise<MarketQuote[]> {
  const now = new Date();
  let yahooQuotes = new Map<string, MarketQuote>();

  try {
    yahooQuotes = await getYahooQuotes(symbols);
  } catch {
    yahooQuotes = new Map();
  }

  return symbols.map((symbol) => {
    const yahooQuote = yahooQuotes.get(symbol);
    if (yahooQuote) return yahooQuote;

    const fallback = mockQuotes[symbol] ?? { price: 100, variationPct: 0 };
    return {
      symbol,
      price: fallback.price,
      variationPct: fallback.variationPct,
      source: "mock",
      timestamp: now,
    };
  });
}

export function defaultQuoteUniverse() {
  return defaultUniverse.map((asset) => asset.symbol);
}
