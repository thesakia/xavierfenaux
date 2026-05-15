export type AssetDefinition = {
  symbol: string;
  assetName: string;
  category: "Europe" | "Etats-Unis" | "Autres";
  aliases: string[];
};

export const defaultUniverse: AssetDefinition[] = [
  { symbol: "CAC40", assetName: "CAC 40", category: "Europe", aliases: ["CAC", "CAC40", "PX1", "FRA40"] },
  { symbol: "DAX", assetName: "DAX", category: "Europe", aliases: ["DAX", "GER40"] },
  { symbol: "STOXX50", assetName: "Euro Stoxx 50", category: "Europe", aliases: ["STOXX", "STOXX50", "EU50"] },
  { symbol: "FTSE", assetName: "FTSE 100", category: "Europe", aliases: ["FTSE", "UK100"] },
  { symbol: "SP500", assetName: "S&P 500", category: "Etats-Unis", aliases: ["SP500", "S&P500", "ES", "US500"] },
  { symbol: "NASDAQ", assetName: "Nasdaq", category: "Etats-Unis", aliases: ["NASDAQ", "NDX", "NAS100", "NQ"] },
  { symbol: "DOWJONES", assetName: "Dow Jones", category: "Etats-Unis", aliases: ["DOW", "DOWJONES", "DJI", "US30"] },
  { symbol: "RUSSELL", assetName: "Russell 2000", category: "Etats-Unis", aliases: ["RUSSELL", "RTY", "US2000"] },
  { symbol: "NIKKEI", assetName: "Nikkei", category: "Autres", aliases: ["NIKKEI", "JP225"] },
  { symbol: "EURUSD", assetName: "EURUSD", category: "Autres", aliases: ["EURUSD", "EUR/USD"] },
  { symbol: "GOLD", assetName: "Gold", category: "Autres", aliases: ["GOLD", "XAUUSD", "OR"] },
  { symbol: "BRENT", assetName: "Brent", category: "Autres", aliases: ["BRENT", "OIL", "UKOIL"] },
  { symbol: "BTC", assetName: "Bitcoin", category: "Autres", aliases: ["BTC", "BTCUSD", "BTCUSDT", "BITCOIN"] },
  { symbol: "ETH", assetName: "Ethereum", category: "Autres", aliases: ["ETH", "ETHUSD", "ETHUSDT", "ETHEREUM"] },
  { symbol: "US10Y", assetName: "Taux 10 ans US", category: "Etats-Unis", aliases: ["US10Y", "10 ANS US", "10Y", "TNOTE"] },
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

export function extractSymbolsFromText(text: string) {
  const upper = text.toUpperCase();
  return defaultUniverse
    .filter((asset) => asset.aliases.some((alias) => upper.includes(alias)))
    .map((asset) => asset.symbol);
}
