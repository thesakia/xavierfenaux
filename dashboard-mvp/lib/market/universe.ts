export type AssetDefinition = {
  symbol: string;
  assetName: string;
  category: "Indices" | "Actions" | "Crypto" | "Forex" | "Matieres premieres" | "Taux" | "Autres";
  aliases: string[];
};

export const defaultUniverse: AssetDefinition[] = [
  { symbol: "CAC40", assetName: "CAC 40", category: "Indices", aliases: ["CAC", "CAC40", "PX1", "FRA40"] },
  { symbol: "DAX", assetName: "DAX", category: "Indices", aliases: ["DAX", "GER40"] },
  { symbol: "STOXX50", assetName: "Euro Stoxx 50", category: "Indices", aliases: ["STOXX", "STOXX50", "EU50"] },
  { symbol: "FTSE", assetName: "FTSE 100", category: "Indices", aliases: ["FTSE", "UK100"] },
  { symbol: "SP500", assetName: "S&P 500", category: "Indices", aliases: ["SP500", "S&P500", "ES", "US500"] },
  { symbol: "NASDAQ", assetName: "Nasdaq", category: "Indices", aliases: ["NASDAQ", "NDX", "NAS100", "NQ"] },
  { symbol: "DOWJONES", assetName: "Dow Jones", category: "Indices", aliases: ["DOW", "DOWJONES", "DJI", "US30"] },
  { symbol: "RUSSELL", assetName: "Russell 2000", category: "Indices", aliases: ["RUSSELL", "RTY", "US2000"] },
  { symbol: "NIKKEI", assetName: "Nikkei", category: "Indices", aliases: ["NIKKEI", "JP225"] },
  { symbol: "AAPL", assetName: "Apple", category: "Actions", aliases: ["AAPL", "APPLE"] },
  { symbol: "MSFT", assetName: "Microsoft", category: "Actions", aliases: ["MSFT", "MICROSOFT"] },
  { symbol: "NVDA", assetName: "Nvidia", category: "Actions", aliases: ["NVDA", "NVIDIA"] },
  { symbol: "TSLA", assetName: "Tesla", category: "Actions", aliases: ["TSLA", "TESLA"] },
  { symbol: "AMZN", assetName: "Amazon", category: "Actions", aliases: ["AMZN", "AMAZON"] },
  { symbol: "META", assetName: "Meta", category: "Actions", aliases: ["META", "FACEBOOK"] },
  { symbol: "GOOGL", assetName: "Alphabet", category: "Actions", aliases: ["GOOGL", "GOOGLE", "ALPHABET"] },
  { symbol: "LVMH", assetName: "LVMH", category: "Actions", aliases: ["LVMH", "MC.PA"] },
  { symbol: "TTE", assetName: "TotalEnergies", category: "Actions", aliases: ["TTE", "TOTAL", "TOTALENERGIES"] },
  { symbol: "BTC", assetName: "Bitcoin", category: "Crypto", aliases: ["BTC", "BTCUSD", "BTCUSDT", "BITCOIN"] },
  { symbol: "ETH", assetName: "Ethereum", category: "Crypto", aliases: ["ETH", "ETHUSD", "ETHUSDT", "ETHEREUM"] },
  { symbol: "SOL", assetName: "Solana", category: "Crypto", aliases: ["SOL", "SOLUSD", "SOLUSDT", "SOLANA"] },
  { symbol: "BNB", assetName: "BNB", category: "Crypto", aliases: ["BNB", "BNBUSD", "BNBUSDT"] },
  { symbol: "XRP", assetName: "XRP", category: "Crypto", aliases: ["XRP", "XRPUSD", "XRPUSDT", "RIPPLE"] },
  { symbol: "EURUSD", assetName: "EURUSD", category: "Forex", aliases: ["EURUSD", "EUR/USD"] },
  { symbol: "GBPUSD", assetName: "GBPUSD", category: "Forex", aliases: ["GBPUSD", "GBP/USD", "CABLE"] },
  { symbol: "USDJPY", assetName: "USDJPY", category: "Forex", aliases: ["USDJPY", "USD/JPY"] },
  { symbol: "GOLD", assetName: "Gold", category: "Matieres premieres", aliases: ["GOLD", "XAUUSD", "OR"] },
  { symbol: "SILVER", assetName: "Silver", category: "Matieres premieres", aliases: ["SILVER", "XAGUSD", "ARGENT"] },
  { symbol: "BRENT", assetName: "Brent", category: "Matieres premieres", aliases: ["BRENT", "OIL", "UKOIL"] },
  { symbol: "WTI", assetName: "WTI", category: "Matieres premieres", aliases: ["WTI", "USOIL"] },
  { symbol: "US10Y", assetName: "Taux 10 ans US", category: "Taux", aliases: ["US10Y", "10 ANS US", "10Y", "TNOTE"] },
  { symbol: "DE10Y", assetName: "Taux 10 ans Allemagne", category: "Taux", aliases: ["DE10Y", "BUND", "10 ANS ALLEMAGNE"] },
];

export function normalizeSymbol(input: string) {
  const raw = input.trim().toUpperCase();
  const direct = defaultUniverse.find((asset) => asset.symbol === raw || asset.aliases.includes(raw));
  if (direct) return direct.symbol;

  const fuzzy = defaultUniverse.find((asset) => asset.aliases.some((alias) => raw.includes(alias)));
  return fuzzy?.symbol ?? raw.replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

export function findAssetDefinition(input: string) {
  const symbol = normalizeSymbol(input);
  return defaultUniverse.find((asset) => asset.symbol === symbol);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasMatches(upperText: string, alias: string) {
  const upperAlias = alias.toUpperCase();
  if (upperAlias.length <= 3) {
    return new RegExp(`(^|[^A-Z0-9])${escapeRegExp(upperAlias)}([^A-Z0-9]|$)`).test(upperText);
  }
  return upperText.includes(upperAlias);
}

export function extractSymbolsFromText(text: string) {
  const upper = text.toUpperCase();
  return defaultUniverse
    .filter((asset) => asset.aliases.some((alias) => aliasMatches(upper, alias)))
    .map((asset) => asset.symbol);
}
