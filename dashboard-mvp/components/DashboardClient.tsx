"use client";

import type { Direction, GeneratedRadarItem, MarketScanRun, Opportunity, OpportunitySource, OpportunityStatus } from "@prisma/client";
import {
  Archive,
  Bell,
  Calculator,
  Check,
  Download,
  Eye,
  Newspaper,
  RefreshCcw,
  Save,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DashboardOpportunity = Omit<Opportunity, "targets" | "createdAt" | "updatedAt"> & {
  targets: unknown;
  createdAt: string;
  updatedAt: string;
};

type DashboardRadarItem = Omit<
  GeneratedRadarItem,
  "createdAt" | "updatedAt" | "currentPrice" | "variationPct" | "zoneProximityPct"
> & {
  createdAt: string;
  updatedAt: string;
  currentPrice: string | null;
  variationPct: string | null;
  zoneProximityPct: string | null;
};

type DashboardScanRun = Omit<MarketScanRun, "createdAt"> & {
  createdAt: string;
  radarItems: DashboardRadarItem[];
};

type MacroEvent = {
  title: string;
  country: string;
  impact: "high" | "medium" | "low" | "other";
  time: string;
  forecast: string | number | null;
  previous: string | number | null;
  actual: string | number | null;
};

type Polarity = {
  asset: string;
  category: "Europe" | "Etats-Unis" | "Autres";
  level: string;
  tone: "red" | "green" | "blue";
};

type AssetRow = {
  asset: string;
  currentPrice: string;
  variationPct: string;
  shortZone: string;
  mediumZone: string;
  longZone: string;
  mmStatus: "OUI" | "PROCHE" | "NON";
  planStatus: "OUI" | "NON";
  dailyZone: string;
  dailyProximity: "DANS" | "PROCHE" | "LOIN";
};

type SizerState = {
  capital: number;
  riskPct: number;
  fraction: 3 | 2 | 1;
  entry: number;
  invalidation: number;
  pointValue: number;
};

const statusLabels: Record<OpportunityStatus, string> = {
  WATCHING: "a surveiller",
  VALIDATED: "valide",
  IGNORED: "ignore",
  INVALIDATED: "invalide",
  ARCHIVED: "archive",
};

const sourceLabels: Record<OpportunitySource, string> = {
  TRADINGVIEW: "TradingView",
  NEWS: "news",
  IVT: "notification IVT",
  MIX: "mix",
  MANUAL: "manuel",
};

const directionLabels: Record<Direction, string> = {
  LONG: "long",
  SHORT: "short",
  NEUTRAL: "neutre",
};

const defaultPolarities: Polarity[] = [
  { asset: "CAC40", category: "Europe", level: "", tone: "blue" },
  { asset: "DAX", category: "Europe", level: "", tone: "blue" },
  { asset: "STOXX50", category: "Europe", level: "", tone: "blue" },
  { asset: "S&P500", category: "Etats-Unis", level: "", tone: "blue" },
  { asset: "Nasdaq", category: "Etats-Unis", level: "", tone: "blue" },
  { asset: "DowJones", category: "Etats-Unis", level: "", tone: "blue" },
  { asset: "EURUSD", category: "Autres", level: "", tone: "blue" },
  { asset: "Gold", category: "Autres", level: "", tone: "blue" },
  { asset: "Brent", category: "Autres", level: "", tone: "blue" },
  { asset: "Bitcoin", category: "Autres", level: "", tone: "blue" },
  { asset: "ETH", category: "Autres", level: "", tone: "blue" },
];

const defaultAssets: AssetRow[] = [
  "DAX",
  "CAC40",
  "STOXX50",
  "FTSE",
  "S&P500",
  "Nasdaq",
  "DowJones",
  "Russell",
  "Nikkei",
  "EURUSD",
  "Gold",
  "Brent",
  "Bitcoin",
  "ETH",
].map((asset) => ({
  asset,
  currentPrice: "",
  variationPct: "",
  shortZone: "",
  mediumZone: "",
  longZone: "",
  mmStatus: "NON",
  planStatus: "NON",
  dailyZone: "",
  dailyProximity: "LOIN",
}));

function loadLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveLocal<T>(key: string, value: T) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

function statusClass(status: OpportunityStatus) {
  if (status === "VALIDATED") return "border-green-500/30 bg-green-500/10 text-green-300";
  if (status === "INVALIDATED") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "IGNORED" || status === "ARCHIVED") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-violetx/40 bg-violetx/10 text-violet-200";
}

function toneClass(tone: Polarity["tone"]) {
  if (tone === "red") return "bg-red-500";
  if (tone === "green") return "bg-green-500";
  return "bg-sky-500";
}

function formatTargets(targets: unknown) {
  if (Array.isArray(targets)) return targets.join(" / ");
  if (typeof targets === "string") return targets;
  return "-";
}

function parseZone(zone: string) {
  const numbers = zone.match(/\d+(?:[.,]\d+)?/g)?.map((item) => Number(item.replace(",", "."))) ?? [];
  if (!numbers.length) return null;
  return {
    low: Math.min(...numbers),
    high: Math.max(...numbers),
  };
}

function proximityPct(price: string, zones: string[]) {
  const current = Number(price.replace(",", "."));
  if (!Number.isFinite(current) || current <= 0) return null;

  const distances = zones
    .map(parseZone)
    .filter(Boolean)
    .flatMap((zone) => [Math.abs(current - zone!.low), Math.abs(current - zone!.high)])
    .map((distance) => (distance / current) * 100);

  if (!distances.length) return null;
  return Math.min(...distances);
}

function scoreAsset(row: AssetRow) {
  let score = 0;
  if (row.planStatus === "OUI") score += 3;
  if (row.dailyProximity === "DANS") score += 3;
  if (row.dailyProximity === "PROCHE") score += 2;
  if (row.mmStatus === "PROCHE") score += 1;
  if (row.mmStatus === "OUI") score += 2;
  const proximity = proximityPct(row.currentPrice, [row.shortZone, row.mediumZone, row.longZone]);
  if (proximity !== null && proximity <= 2) score += 4;
  return score;
}

function variationClass(value: string) {
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number === 0) return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return number > 0 ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-red-500/30 bg-red-500/10 text-red-300";
}

function todayLabel() {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

export function DashboardClient({
  opportunities,
  latestScan,
}: {
  opportunities: DashboardOpportunity[];
  latestScan: DashboardScanRun | null;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id ?? "");
  const [rawText, setRawText] = useState("");
  const [batchText, setBatchText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [brief, setBrief] = useState("");
  const [polarities, setPolarities] = useState<Polarity[]>(defaultPolarities);
  const [assets, setAssets] = useState<AssetRow[]>(defaultAssets);
  const [macroEvents, setMacroEvents] = useState<MacroEvent[]>([]);
  const [macroMessage, setMacroMessage] = useState("Chargement macro...");
  const [sizer, setSizer] = useState<SizerState>({
    capital: 10000,
    riskPct: 2,
    fraction: 3,
    entry: 8295,
    invalidation: 8370,
    pointValue: 1,
  });

  useEffect(() => {
    setBrief(loadLocal("xf:brief", ""));
    setPolarities(loadLocal("xf:polarities", defaultPolarities));
    setAssets(loadLocal("xf:assets", defaultAssets));
    setSizer(loadLocal("xf:sizer", sizer));
    void fetch("/api/macro/today")
      .then((response) => response.json())
      .then((payload: { events?: MacroEvent[]; error?: string }) => {
        setMacroEvents(payload.events ?? []);
        setMacroMessage(payload.error ?? "");
      })
      .catch(() => setMacroMessage("Agenda macro indisponible."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(
    () => opportunities.find((opportunity) => opportunity.id === selectedId) ?? opportunities[0],
    [opportunities, selectedId],
  );

  const sortedAssets = useMemo(
    () => [...assets].sort((a, b) => scoreAsset(b) - scoreAsset(a)),
    [assets],
  );

  const zoneAlerts = useMemo(
    () =>
      sortedAssets
        .map((asset) => ({
          ...asset,
          proximity: proximityPct(asset.currentPrice, [asset.shortZone, asset.mediumZone, asset.longZone]),
        }))
        .filter((asset) => asset.proximity !== null && asset.proximity <= 2),
    [sortedAssets],
  );

  const movers = useMemo(
    () =>
      [...assets]
        .map((asset) => ({ ...asset, variation: Number(asset.variationPct.replace(",", ".")) }))
        .filter((asset) => Number.isFinite(asset.variation))
        .sort((a, b) => b.variation - a.variation),
    [assets],
  );

  const topMovers = movers.filter((asset) => asset.variation > 0).slice(0, 5);
  const flopMovers = [...movers].reverse().filter((asset) => asset.variation < 0).slice(0, 5);

  const sizerDistance = Math.abs(sizer.invalidation - sizer.entry);
  const riskEuros = (sizer.capital * sizer.riskPct) / 100 / sizer.fraction;
  const riskPerUnit = sizerDistance * sizer.pointValue;
  const size = riskPerUnit > 0 ? riskEuros / riskPerUnit : 0;

  function persistBoard(nextPolarities = polarities, nextAssets = assets, nextBrief = brief, nextSizer = sizer) {
    saveLocal("xf:polarities", nextPolarities);
    saveLocal("xf:assets", nextAssets);
    saveLocal("xf:brief", nextBrief);
    saveLocal("xf:sizer", nextSizer);
    setMessage("Carnet sauvegarde.");
  }

  function updateAsset(asset: string, patch: Partial<AssetRow>) {
    const next = assets.map((row) => (row.asset === asset ? { ...row, ...patch } : row));
    setAssets(next);
    saveLocal("xf:assets", next);
  }

  function updatePolarity(index: number, patch: Partial<Polarity>) {
    const next = polarities.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row));
    setPolarities(next);
    saveLocal("xf:polarities", next);
  }

  async function updateStatus(id: string, status: OpportunityStatus) {
    setMessage(null);
    const response = await fetch("/api/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });

    if (!response.ok) {
      setMessage("Statut non modifie.");
      return;
    }

    startTransition(() => router.refresh());
  }

  async function importNotification(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const response = await fetch("/api/notifications/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText }),
    });

    if (!response.ok) {
      setMessage("Import refuse.");
      return;
    }

    setRawText("");
    setMessage("Notification importee.");
    startTransition(() => router.refresh());
  }

  async function scanNews() {
    setMessage(null);
    const response = await fetch("/api/news/scan", { method: "POST" });
    setMessage(response.ok ? "Scan news ajoute a la file." : "Scan news refuse.");
  }

  async function prepareMorning() {
    setMessage(null);
    const response = await fetch("/api/market/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief,
        notifications: batchText,
        triggerOpenAI: false,
      }),
    });

    if (!response.ok) {
      setMessage("Preparation refusee.");
      return;
    }

    setMessage("Preparation de seance terminee.");
    startTransition(() => router.refresh());
  }

  async function importBatch() {
    setMessage(null);
    const response = await fetch("/api/notifications/batch-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: batchText }),
    });
    setMessage(response.ok ? "Notifications importees." : "Import batch refuse.");
  }

  async function simulateWatchlist() {
    setMessage(null);
    const response = await fetch("/api/tradingview/simulate-watchlist", { method: "POST" });
    setMessage(response.ok ? "Watchlist simulee injectee." : "Simulation refusee.");
    if (response.ok) {
      const simulatedRows: Record<string, Partial<AssetRow>> = {
        CAC40: { currentPrice: "8248", variationPct: "-0.82", shortZone: "8200/8300", mmStatus: "PROCHE", planStatus: "OUI", dailyZone: "Resistance daily", dailyProximity: "PROCHE" },
        DAX: { currentPrice: "23840", variationPct: "0.34", shortZone: "23750/23900", mmStatus: "PROCHE", planStatus: "NON", dailyZone: "Zone haute", dailyProximity: "PROCHE" },
        EURUSD: { currentPrice: "1.1742", variationPct: "-0.21", shortZone: "1.1740/1.1760", mmStatus: "OUI", planStatus: "OUI", dailyZone: "Seuil H1 CPI", dailyProximity: "DANS" },
        Nasdaq: { currentPrice: "21320", variationPct: "1.08", shortZone: "21250/21400", mmStatus: "PROCHE", planStatus: "NON", dailyZone: "Zone tech", dailyProximity: "PROCHE" },
        Gold: { currentPrice: "3294", variationPct: "0.76", shortZone: "3275/3300", mmStatus: "OUI", planStatus: "OUI", dailyZone: "Support weekly", dailyProximity: "DANS" },
      };
      const nextAssets = assets.map((asset) => ({ ...asset, ...(simulatedRows[asset.asset] ?? {}) }));
      setAssets(nextAssets);
      saveLocal("xf:assets", nextAssets);
      startTransition(() => router.refresh());
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-6 text-slate-100 md:px-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-violet-300">Xavier Fenaux</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Carnet de bord marche</h1>
          <p className="mt-1 text-sm capitalize text-slate-400">{todayLabel()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={scanNews} className="toolbar-btn">
            <Newspaper size={16} aria-hidden="true" />
            Scan news
          </button>
          <button onClick={prepareMorning} className="toolbar-btn border-violetx/60 text-violet-100">
            <RefreshCcw size={16} aria-hidden="true" />
            Preparer la seance
          </button>
          <button onClick={simulateWatchlist} className="toolbar-btn">
            <Bell size={16} aria-hidden="true" />
            Simuler watchlist
          </button>
          <button onClick={() => persistBoard()} className="toolbar-btn">
            <Save size={16} aria-hidden="true" />
            Sauver
          </button>
          <button onClick={() => startTransition(() => router.refresh())} className="toolbar-btn">
            <RefreshCcw size={16} aria-hidden="true" />
            Actualiser
          </button>
          <button
            onClick={logout}
            className="rounded-md border border-white/10 bg-panel px-3 py-2 text-sm text-slate-300 transition hover:border-red-500/50 hover:text-red-200"
          >
            Sortir
          </button>
        </div>
      </header>

      <section className="mb-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Brief du matin</h2>
            <span className="text-xs text-slate-500">saisie manuelle</span>
          </div>
          <textarea
            value={brief}
            onChange={(event) => {
              setBrief(event.target.value);
              saveLocal("xf:brief", event.target.value);
            }}
            className="min-h-44 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm leading-6 text-slate-100 outline-none ring-violetx/60 focus:ring-2"
            placeholder="Colle ici le brief du matin, les notifs Xavier ou le plan du jour."
          />
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Agenda macro</h2>
            <span className="text-xs text-slate-500">Europe / US</span>
          </div>
          <div className="max-h-52 space-y-2 overflow-auto">
            {macroEvents.length ? (
              macroEvents.map((event, index) => (
                <div
                  key={`${event.title}-${index}`}
                  className={`rounded-md border p-3 text-sm ${
                    event.impact === "high"
                      ? "border-red-500/30 bg-red-500/10"
                      : "border-white/10 bg-ink"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-white">{event.title}</strong>
                    <span className="font-mono text-xs text-slate-300">{event.time}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {event.country} - prev {event.previous ?? "-"} / consensus {event.forecast ?? "-"} / publie{" "}
                    {event.actual ?? "-"}
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-white/10 bg-ink p-3 text-sm text-slate-400">
                {macroMessage || "Aucun evenement macro du jour charge."}
              </p>
            )}
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Alertes zones</h2>
            <Bell size={16} className="text-violet-300" aria-hidden="true" />
          </div>
          <div className="max-h-52 space-y-2 overflow-auto">
            {zoneAlerts.length ? (
              zoneAlerts.map((asset) => (
                <div key={asset.asset} className="rounded-md border border-violetx/30 bg-violetx/10 p-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-white">{asset.asset}</strong>
                    <span className="text-sm font-semibold text-violet-100">{asset.proximity?.toFixed(2)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">
                    Actif a moins de 2% d'une zone CT / MT / LT.
                  </p>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-white/10 bg-ink p-3 text-sm text-slate-400">
                Renseigne les cours et les zones pour activer les alertes de proximite.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
        <div className="panel p-4">
          <h2 className="section-title mb-3">Polarites du jour</h2>
          <div className="space-y-4">
            {(["Europe", "Etats-Unis", "Autres"] as const).map((category) => (
              <div key={category}>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">{category}</h3>
                <div className="space-y-2">
                  {polarities.map((item, index) =>
                    item.category === category ? (
                      <div key={item.asset} className="grid grid-cols-[1fr_90px_74px] gap-2">
                        <span className="rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white">
                          {item.asset}
                        </span>
                        <input
                          value={item.level}
                          onChange={(event) => updatePolarity(index, { level: event.target.value })}
                          className="field"
                          placeholder="niveau"
                        />
                        <select
                          value={item.tone}
                          onChange={(event) => updatePolarity(index, { tone: event.target.value as Polarity["tone"] })}
                          className="field"
                        >
                          <option value="red">rouge</option>
                          <option value="green">vert</option>
                          <option value="blue">neutre</option>
                        </select>
                      </div>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <h2 className="section-title mb-3">Radar actifs</h2>
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="table-head">Actif</th>
                  <th className="table-head">Cours</th>
                  <th className="table-head">Var.</th>
                  <th className="table-head">Zone CT</th>
                  <th className="table-head">Zone MT</th>
                  <th className="table-head">Zone LT</th>
                  <th className="table-head">MM H1/H4</th>
                  <th className="table-head">Plan</th>
                  <th className="table-head">Zone D/W</th>
                  <th className="table-head">Prox.</th>
                </tr>
              </thead>
              <tbody>
                {sortedAssets.map((asset) => {
                  const proximity = proximityPct(asset.currentPrice, [asset.shortZone, asset.mediumZone, asset.longZone]);
                  const hot = proximity !== null && proximity <= 2;
                  return (
                    <tr key={asset.asset} className={hot ? "bg-violetx/10" : ""}>
                      <td className="table-cell font-semibold text-white">
                        {hot ? <span className="mr-2 text-violet-300">ALERTE</span> : null}
                        {asset.asset}
                      </td>
                      <td className="table-cell">
                        <input className="field table-input" value={asset.currentPrice} onChange={(event) => updateAsset(asset.asset, { currentPrice: event.target.value })} />
                      </td>
                      <td className="table-cell">
                        <input className={`field table-input ${variationClass(asset.variationPct)}`} value={asset.variationPct} onChange={(event) => updateAsset(asset.asset, { variationPct: event.target.value })} placeholder="%" />
                      </td>
                      <td className="table-cell">
                        <input className="field table-input" value={asset.shortZone} onChange={(event) => updateAsset(asset.asset, { shortZone: event.target.value })} placeholder="8200/8300" />
                      </td>
                      <td className="table-cell">
                        <input className="field table-input" value={asset.mediumZone} onChange={(event) => updateAsset(asset.asset, { mediumZone: event.target.value })} />
                      </td>
                      <td className="table-cell">
                        <input className="field table-input" value={asset.longZone} onChange={(event) => updateAsset(asset.asset, { longZone: event.target.value })} />
                      </td>
                      <td className="table-cell">
                        <select className="field table-input" value={asset.mmStatus} onChange={(event) => updateAsset(asset.asset, { mmStatus: event.target.value as AssetRow["mmStatus"] })}>
                          <option>NON</option>
                          <option>PROCHE</option>
                          <option>OUI</option>
                        </select>
                      </td>
                      <td className="table-cell">
                        <select className="field table-input" value={asset.planStatus} onChange={(event) => updateAsset(asset.asset, { planStatus: event.target.value as AssetRow["planStatus"] })}>
                          <option>NON</option>
                          <option>OUI</option>
                        </select>
                      </td>
                      <td className="table-cell">
                        <input className="field table-input" value={asset.dailyZone} onChange={(event) => updateAsset(asset.asset, { dailyZone: event.target.value })} />
                      </td>
                      <td className="table-cell">
                        <select className="field table-input" value={asset.dailyProximity} onChange={(event) => updateAsset(asset.asset, { dailyProximity: event.target.value as AssetRow["dailyProximity"] })}>
                          <option>LOIN</option>
                          <option>PROCHE</option>
                          <option>DANS</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Import CSV / multi-notifs</h2>
            <span className="text-xs text-slate-500">utilise par Preparer la seance</span>
          </div>
          <textarea
            value={batchText}
            onChange={(event) => setBatchText(event.target.value)}
            className="min-h-36 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm leading-6 text-slate-100 outline-none ring-violetx/60 focus:ring-2"
            placeholder={"EURUSD : si CPI > 3.7% + impulsion baissiere H1 sous 1.1740, invalidation 1.1810, TP1 1.1680\nCAC 40 : zone 8200/8300, invalidation 8370, TP1 7990, TP2 7600"}
          />
          <div className="mt-3 flex gap-2">
            <button onClick={importBatch} className="primary-btn" disabled={!batchText.trim()}>
              <Download size={16} aria-hidden="true" />
              Importer
            </button>
            <button onClick={prepareMorning} className="toolbar-btn">
              Preparer avec ces infos
            </button>
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Actifs a cibler ce matin</h2>
            <span className="text-xs text-slate-500">
              {latestScan ? new Date(latestScan.createdAt).toLocaleString("fr-FR") : "aucun scan"}
            </span>
          </div>
          {latestScan?.summary ? <p className="mb-3 text-sm text-slate-300">{latestScan.summary}</p> : null}
          <div className="max-h-96 space-y-2 overflow-auto">
            {latestScan?.radarItems?.length ? (
              latestScan.radarItems.slice(0, 12).map((item) => (
                <div
                  key={item.id}
                  className={`rounded-md border p-3 ${
                    item.priority === 1
                      ? "border-violetx/40 bg-violetx/10"
                      : item.priority === 2
                        ? "border-white/10 bg-ink"
                        : "border-slate-700/60 bg-slate-950/40"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <strong className="text-white">{item.assetName ?? item.symbol}</strong>
                      <span className="ml-2 text-xs text-slate-500">P{item.priority} - score {item.score}</span>
                    </div>
                    <span className={`rounded-md border px-2 py-1 text-xs ${variationClass(item.variationPct ?? "")}`}>
                      {item.variationPct ? `${Number(item.variationPct).toFixed(2)}%` : "var. n/a"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    {item.newsContext ?? item.xavierContext ?? "Contexte a surveiller, donnees encore incompletes."}
                  </p>
                  <div className="mt-2 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                    <span>Zone: <b className="text-slate-200">{item.knownZone ?? "-"}</b></span>
                    <span>Proximite: <b className="text-slate-200">{item.zoneProximityPct ? `${Number(item.zoneProximityPct).toFixed(2)}%` : "-"}</b></span>
                    <span>Invalidation: <b className="text-red-200">{item.invalidation ?? "-"}</b></span>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-white/10 bg-ink p-3 text-sm text-slate-400">
                Clique sur Preparer la seance pour generer la short-list du matin.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[0.65fr_0.85fr_1.15fr]">
        <div className="panel p-4">
          <h2 className="section-title mb-3">Top / Flop</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-green-300">
                <TrendingUp size={16} aria-hidden="true" />
                Top
              </div>
              <div className="space-y-2">
                {topMovers.length ? topMovers.map((asset) => (
                  <div key={asset.asset} className="flex items-center justify-between rounded-md border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm">
                    <span className="font-semibold text-white">{asset.asset}</span>
                    <span className="font-mono text-green-300">+{asset.variation.toFixed(2)}%</span>
                  </div>
                )) : <p className="text-sm text-slate-500">Renseigne les variations.</p>}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-red-300">
                <TrendingDown size={16} aria-hidden="true" />
                Flop
              </div>
              <div className="space-y-2">
                {flopMovers.length ? flopMovers.map((asset) => (
                  <div key={asset.asset} className="flex items-center justify-between rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm">
                    <span className="font-semibold text-white">{asset.asset}</span>
                    <span className="font-mono text-red-300">{asset.variation.toFixed(2)}%</span>
                  </div>
                )) : <p className="text-sm text-slate-500">Renseigne les variations.</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">Position sizer</h2>
            <Calculator size={16} className="text-violet-300" aria-hidden="true" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="label">Capital<input className="field mt-1" type="number" value={sizer.capital} onChange={(event) => {
              const next = { ...sizer, capital: Number(event.target.value) };
              setSizer(next); saveLocal("xf:sizer", next);
            }} /></label>
            <label className="label">Risque swing %<input className="field mt-1" type="number" value={sizer.riskPct} onChange={(event) => {
              const next = { ...sizer, riskPct: Number(event.target.value) };
              setSizer(next); saveLocal("xf:sizer", next);
            }} /></label>
            <label className="label">Entree<input className="field mt-1" type="number" value={sizer.entry} onChange={(event) => {
              const next = { ...sizer, entry: Number(event.target.value) };
              setSizer(next); saveLocal("xf:sizer", next);
            }} /></label>
            <label className="label">Invalidation<input className="field mt-1" type="number" value={sizer.invalidation} onChange={(event) => {
              const next = { ...sizer, invalidation: Number(event.target.value) };
              setSizer(next); saveLocal("xf:sizer", next);
            }} /></label>
            <label className="label">Fraction<select className="field mt-1" value={sizer.fraction} onChange={(event) => {
              const next = { ...sizer, fraction: Number(event.target.value) as SizerState["fraction"] };
              setSizer(next); saveLocal("xf:sizer", next);
            }}>
              <option value={3}>1/3 swing</option>
              <option value={2}>1/2 swing</option>
              <option value={1}>swing complet</option>
            </select></label>
            <label className="label">Valeur point<input className="field mt-1" type="number" value={sizer.pointValue} onChange={(event) => {
              const next = { ...sizer, pointValue: Number(event.target.value) };
              setSizer(next); saveLocal("xf:sizer", next);
            }} /></label>
          </div>
          <div className="mt-4 rounded-md border border-violetx/30 bg-violetx/10 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-300">Taille theorique</span>
              <strong className="font-mono text-2xl text-white">{Number.isFinite(size) ? size.toFixed(2) : "0.00"}</strong>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Risque: {riskEuros.toFixed(2)} euros / distance invalidation: {sizerDistance.toFixed(2)} pts.
            </p>
          </div>
        </div>

        <div className="panel p-4">
          <form onSubmit={importNotification} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="text-sm text-slate-300">
              Import notification Xavier / IVT
              <textarea
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                className="mt-2 min-h-28 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white outline-none ring-violetx/60 focus:ring-2"
                placeholder="EURUSD : si CPI > 3.7% + impulsion baissiere H1 sous 1.1740..."
              />
            </label>
            <button type="submit" disabled={!rawText.trim() || isPending} className="primary-btn">
              <Download size={16} aria-hidden="true" />
              Importer
            </button>
          </form>
          {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
        </div>
      </section>

      <section className="mb-5 grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="panel">
          <div className="grid grid-cols-[1.1fr_0.7fr_1fr_1fr_0.55fr_0.85fr_0.85fr] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
            <span>Actif</span>
            <span>Direction</span>
            <span>Zone</span>
            <span>Invalidation</span>
            <span>Score</span>
            <span>Statut</span>
            <span>Source</span>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {opportunities.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400">Aucun setup a surveiller pour le moment.</div>
            ) : (
              opportunities.map((opportunity) => (
                <button
                  key={opportunity.id}
                  onClick={() => setSelectedId(opportunity.id)}
                  className={`grid w-full grid-cols-[1.1fr_0.7fr_1fr_1fr_0.55fr_0.85fr_0.85fr] gap-3 border-b border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.03] ${
                    selected?.id === opportunity.id ? "bg-violetx/10" : ""
                  }`}
                >
                  <span>
                    <strong className="block text-white">{opportunity.symbol}</strong>
                    <span className="text-xs text-slate-500">{new Date(opportunity.createdAt).toLocaleString("fr-FR")}</span>
                  </span>
                  <span className="text-slate-300">{directionLabels[opportunity.direction]}</span>
                  <span className="text-slate-300">{opportunity.entryZone}</span>
                  <span className="text-red-300">{opportunity.invalidation}</span>
                  <span className="font-semibold text-white">{opportunity.score}</span>
                  <span><span className={`rounded-md border px-2 py-1 text-xs ${statusClass(opportunity.status)}`}>{statusLabels[opportunity.status]}</span></span>
                  <span className="text-slate-300">{sourceLabels[opportunity.source]}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <aside className="panel p-4">
          {selected ? (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Fiche setup</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{selected.symbol}</h2>
                </div>
                <span className="rounded-md bg-violetx/20 px-2 py-1 text-sm font-semibold text-violet-100">{selected.score}</span>
              </div>
              <div className="space-y-3 text-sm">
                <p className="leading-6 text-slate-200">{selected.summary}</p>
                <dl className="grid grid-cols-2 gap-3">
                  <div><dt className="text-xs text-slate-500">Zone</dt><dd className="mt-1 text-white">{selected.entryZone}</dd></div>
                  <div><dt className="text-xs text-slate-500">Objectifs</dt><dd className="mt-1 text-white">{formatTargets(selected.targets)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Invalidation</dt><dd className="mt-1 text-red-300">{selected.invalidation}</dd></div>
                  <div><dt className="text-xs text-slate-500">Source</dt><dd className="mt-1 text-white">{sourceLabels[selected.source]}</dd></div>
                </dl>
                {selected.riskNotes ? <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-red-100">{selected.riskNotes}</div> : null}
                {selected.aiReasoningSummary ? <p className="rounded-md border border-white/10 bg-ink p-3 text-slate-300">{selected.aiReasoningSummary}</p> : null}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <button onClick={() => updateStatus(selected.id, "VALIDATED")} className="action-green"><Check size={16} aria-hidden="true" />Valider</button>
                <button onClick={() => updateStatus(selected.id, "IGNORED")} className="action-muted"><X size={16} aria-hidden="true" />Ignorer</button>
                <button onClick={() => updateStatus(selected.id, "ARCHIVED")} className="action-muted"><Archive size={16} aria-hidden="true" />Archiver</button>
              </div>
            </>
          ) : (
            <div className="grid min-h-48 place-items-center text-sm text-slate-500">
              <Eye size={18} aria-hidden="true" />
              Selectionne un setup.
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}
