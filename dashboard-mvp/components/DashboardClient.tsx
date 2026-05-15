"use client";

import type {
  Direction,
  GeneratedRadarItem,
  MarketScanRun,
  Opportunity,
  OpportunitySource,
  OpportunityStatus,
} from "@prisma/client";
import {
  AlertTriangle,
  Archive,
  Check,
  Download,
  Loader2,
  LogOut,
  Newspaper,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
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

type ButtonTone = "primary" | "neutral" | "danger" | "success";
type MarketGroup = "Indices" | "Actions" | "Crypto" | "Forex" | "Matieres premieres" | "Taux" | "Autres";

const marketOrder: MarketGroup[] = ["Indices", "Actions", "Crypto", "Forex", "Matieres premieres", "Taux", "Autres"];

const marketThemes: Record<
  MarketGroup,
  {
    border: string;
    band: string;
    badge: string;
    title: string;
    top: string;
  }
> = {
  Indices: {
    border: "border-violetx/40",
    band: "bg-violetx/10",
    badge: "border-violetx/35 bg-violetx/15 text-violet-100",
    title: "text-violet-100",
    top: "bg-violetx text-white",
  },
  Actions: {
    border: "border-sky-400/35",
    band: "bg-sky-400/10",
    badge: "border-sky-400/30 bg-sky-400/10 text-sky-100",
    title: "text-sky-100",
    top: "bg-sky-500 text-white",
  },
  Crypto: {
    border: "border-amber-400/35",
    band: "bg-amber-400/10",
    badge: "border-amber-400/30 bg-amber-400/10 text-amber-100",
    title: "text-amber-100",
    top: "bg-amber-500 text-slate-950",
  },
  Forex: {
    border: "border-emerald-400/35",
    band: "bg-emerald-400/10",
    badge: "border-emerald-400/30 bg-emerald-400/10 text-emerald-100",
    title: "text-emerald-100",
    top: "bg-emerald-500 text-slate-950",
  },
  "Matieres premieres": {
    border: "border-red-400/35",
    band: "bg-red-400/10",
    badge: "border-red-400/30 bg-red-400/10 text-red-100",
    title: "text-red-100",
    top: "bg-red-500 text-white",
  },
  Taux: {
    border: "border-cyan-400/35",
    band: "bg-cyan-400/10",
    badge: "border-cyan-400/30 bg-cyan-400/10 text-cyan-100",
    title: "text-cyan-100",
    top: "bg-cyan-500 text-slate-950",
  },
  Autres: {
    border: "border-slate-400/30",
    band: "bg-slate-400/10",
    badge: "border-slate-400/25 bg-slate-400/10 text-slate-200",
    title: "text-slate-100",
    top: "bg-slate-500 text-white",
  },
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

function loadLocal(key: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}

function saveLocal(key: string, value: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value);
  }
}

function todayLabel() {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}

function formatTargets(targets: unknown) {
  if (Array.isArray(targets)) return targets.join(" / ");
  if (typeof targets === "string") return targets;
  return "-";
}

function statusClass(status: OpportunityStatus) {
  if (status === "VALIDATED") return "border-green-500/30 bg-green-500/10 text-green-300";
  if (status === "INVALIDATED") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "IGNORED" || status === "ARCHIVED") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-violetx/40 bg-violetx/10 text-violet-200";
}

function variationClass(value: string | null) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return number > 0 ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-red-500/30 bg-red-500/10 text-red-300";
}

function normalizeMarketGroup(category?: string | null): MarketGroup {
  if (category === "Europe" || category === "Etats-Unis") return "Indices";
  if (marketOrder.includes(category as MarketGroup)) return category as MarketGroup;
  return "Autres";
}

function hasSpecificMonitoringContext(item: DashboardRadarItem) {
  const hasNews = Boolean(item.newsContext?.trim());
  const hasTechnicalContext = Boolean(
    item.xavierContext?.trim() ||
      item.knownZone?.trim() ||
      item.invalidation?.trim() ||
      item.zoneProximityPct ||
      (Array.isArray(item.targets) && item.targets.length > 0),
  );

  return hasNews || hasTechnicalContext;
}

function readableJsonList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string") as string[];
  return [];
}

function readableNewsSources(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const news = (value as { news?: unknown }).news;
  if (!Array.isArray(news)) return [];

  return news
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const source = item as { title?: unknown; source?: unknown; url?: unknown };
      return {
        title: typeof source.title === "string" ? source.title : null,
        source: typeof source.source === "string" ? source.source : null,
        url: typeof source.url === "string" ? source.url : null,
      };
    })
    .filter((item): item is { title: string | null; source: string | null; url: string | null } => Boolean(item));
}

function shortenText(value: string | null | undefined, limit = 180) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function whyText(item: DashboardRadarItem, opportunity: DashboardOpportunity | undefined, reasons: string[]) {
  return shortenText(
    opportunity?.summary ?? item.xavierContext ?? item.newsContext ?? item.briefContext ?? reasons.slice(0, 2).join(" / "),
    190,
  );
}

function directionClass(direction: Direction) {
  if (direction === "LONG") return "border-green-500/30 bg-green-500/10 text-green-300";
  if (direction === "SHORT") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-slate-500/30 bg-slate-500/10 text-slate-300";
}

function actionToneClass(tone: ButtonTone) {
  if (tone === "primary") return "primary-btn animated-btn";
  if (tone === "success") return "action-green animated-btn";
  if (tone === "danger") return "action-danger animated-btn";
  return "toolbar-btn animated-btn";
}

function ActionButton({
  children,
  icon,
  busy,
  disabled,
  onClick,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void | Promise<void>;
  tone?: ButtonTone;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`${actionToneClass(tone)} ${busy ? "is-loading" : ""} ${className}`}
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : icon}
      <span>{children}</span>
    </button>
  );
}

export function DashboardClient({
  opportunities,
  latestScan,
}: {
  opportunities: DashboardOpportunity[];
  latestScan: DashboardScanRun | null;
}) {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [batchText, setBatchText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [openRadarId, setOpenRadarId] = useState<string | null>(null);
  const [macroEvents, setMacroEvents] = useState<MacroEvent[]>([]);
  const [macroMessage, setMacroMessage] = useState("Chargement macro...");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setBrief(loadLocal("xf:brief"));
    setBatchText(loadLocal("xf:batchText"));

    void fetch("/api/macro/today")
      .then((response) => response.json())
      .then((payload: { events?: MacroEvent[]; error?: string }) => {
        setMacroEvents(payload.events ?? []);
        setMacroMessage(payload.error ?? "");
      })
      .catch(() => setMacroMessage("Agenda macro indisponible."));
  }, []);

  const opportunityBySymbol = useMemo(() => {
    const map = new Map<string, DashboardOpportunity>();
    for (const opportunity of opportunities) {
      if (!map.has(opportunity.symbol)) map.set(opportunity.symbol, opportunity);
    }
    return map;
  }, [opportunities]);

  const radarGroups = useMemo(
    () =>
      marketOrder
        .map((market) => ({
          market,
          items: (latestScan?.radarItems ?? [])
            .filter((item) => normalizeMarketGroup(item.category) === market)
            .filter(hasSpecificMonitoringContext)
            .sort((a, b) => b.score - a.score || a.priority - b.priority)
            .slice(0, 3),
        }))
        .filter((group) => group.items.length > 0),
    [latestScan],
  );

  async function runAction(name: string, action: () => Promise<string | null>) {
    setBusyAction(name);
    setMessage(null);
    try {
      const nextMessage = await action();
      if (nextMessage) setMessage(nextMessage);
    } catch {
      setMessage("Action impossible pour le moment.");
    } finally {
      setBusyAction(null);
    }
  }

  function refreshDashboard() {
    startTransition(() => router.refresh());
  }

  async function prepareMorning() {
    await runAction("prepare", async () => {
      saveLocal("xf:brief", brief);
      saveLocal("xf:batchText", batchText);

      const response = await fetch("/api/market/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          notifications: batchText,
          triggerOpenAI: false,
        }),
      });

      if (!response.ok) return "Preparation refusee.";
      refreshDashboard();
      return "Preparation de seance terminee. Brief et imports memorises. OpenAI n'a pas ete declenche.";
    });
  }

  async function scanNews() {
    await runAction("news", async () => {
      const response = await fetch("/api/news/scan", { method: "POST" });
      return response.ok ? "Scan news ajoute a la file." : "Scan news refuse.";
    });
  }

  async function importBatch() {
    await runAction("import", async () => {
      const content = batchText.trim();
      if (!content) return "Import vide.";

      const response = await fetch("/api/notifications/batch-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) return "Import Xavier / IVT refuse.";
      return "Notifications Xavier / IVT importees et memorisees.";
    });
  }

  async function updateStatus(id: string, status: OpportunityStatus) {
    await runAction(`status-${status}`, async () => {
      const response = await fetch("/api/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      if (!response.ok) return "Statut non modifie.";
      refreshDashboard();
      return "Statut mis a jour.";
    });
  }

  async function logout() {
    await runAction("logout", async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/dashboard/login";
      return null;
    });
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-6 text-slate-100 md:px-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-violet-300">Xavier Fenaux</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Preparation de seance</h1>
          <p className="mt-1 text-sm capitalize text-slate-400">{todayLabel()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton
            tone="primary"
            icon={<Search size={16} aria-hidden="true" />}
            busy={busyAction === "prepare"}
            onClick={prepareMorning}
            className="min-w-48"
          >
            Preparer la seance
          </ActionButton>
          <ActionButton
            icon={<Newspaper size={16} aria-hidden="true" />}
            busy={busyAction === "news"}
            onClick={scanNews}
          >
            Scan news
          </ActionButton>
          <ActionButton
            icon={<RefreshCcw size={16} aria-hidden="true" />}
            busy={isPending}
            onClick={refreshDashboard}
          >
            Actualiser
          </ActionButton>
          <ActionButton icon={<LogOut size={16} aria-hidden="true" />} busy={busyAction === "logout"} onClick={logout}>
            Sortir
          </ActionButton>
        </div>
      </header>

      {message ? (
        <div className="mb-5 rounded-md border border-violetx/40 bg-violetx/10 px-4 py-3 text-sm text-violet-100">
          {message}
        </div>
      ) : null}

      <section className="mb-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title">Brief du matin</h2>
            <span className="text-xs text-slate-500">memorise puis croise avec news + imports</span>
          </div>
          <textarea
            value={brief}
            onChange={(event) => {
              setBrief(event.target.value);
              saveLocal("xf:brief", event.target.value);
            }}
            className="min-h-44 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm leading-6 text-slate-100 outline-none ring-violetx/60 focus:ring-2"
            placeholder="Colle ici le contexte du matin : macro attendue, biais general, niveaux importants, actifs a surveiller. Il servira aussi aux prochains scans."
          />
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title">Agenda macro</h2>
            <span className="text-xs text-slate-500">evenements du jour</span>
          </div>
          <div className="max-h-52 space-y-2 overflow-auto pr-1">
            {macroEvents.length ? (
              macroEvents.map((event, index) => (
                <div
                  key={`${event.title}-${index}`}
                  className={`rounded-md border p-3 text-sm ${
                    event.impact === "high" ? "border-red-500/30 bg-red-500/10" : "border-white/10 bg-ink"
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
      </section>

      <section className="mb-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title">Import Xavier / CSV</h2>
            <span className="text-xs text-slate-500">alimente la memoire des scans</span>
          </div>
          <textarea
            value={batchText}
            onChange={(event) => {
              setBatchText(event.target.value);
              saveLocal("xf:batchText", event.target.value);
            }}
            className="min-h-52 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm leading-6 text-slate-100 outline-none ring-violetx/60 focus:ring-2"
            placeholder={
              "CAC 40 : zone 8200/8300, invalidation 8370, TP1 7990, TP2 7600. Attendre confirmation.\nEURUSD : CPI > 3.7%, zone 1.1740/1.1760, invalidation 1.1810, objectif theorique 1.1680."
            }
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton
              tone="primary"
              icon={<Download size={16} aria-hidden="true" />}
              busy={busyAction === "import"}
              disabled={!batchText.trim()}
              onClick={importBatch}
            >
              Importer
            </ActionButton>
            <ActionButton
              icon={<Search size={16} aria-hidden="true" />}
              busy={busyAction === "prepare"}
              onClick={prepareMorning}
            >
              Preparer avec ces infos
            </ActionButton>
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-4 flex flex-col gap-2 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-violet-300">Une seule liste a regarder</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">Radar du jour</h2>
              <p className="mt-1 text-sm text-slate-400">
                TOP3 par marche, uniquement avec contexte news ou zone technique.
              </p>
            </div>
            <span className="text-xs text-slate-500">
              {latestScan ? new Date(latestScan.createdAt).toLocaleString("fr-FR") : "aucun scan"}
            </span>
          </div>
          {latestScan?.summary ? <p className="mb-3 text-sm leading-6 text-slate-300">{latestScan.summary}</p> : null}
          <div className="max-h-[720px] space-y-4 overflow-auto pr-1">
            {radarGroups.length ? (
              radarGroups.map((group) => (
                <div
                  key={group.market}
                  className={`rounded-lg border ${marketThemes[group.market].border} ${marketThemes[group.market].band} p-3`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className={`text-lg font-semibold ${marketThemes[group.market].title}`}>
                      {group.market}
                    </h3>
                    <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${marketThemes[group.market].badge}`}>
                      TOP {group.items.length}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                          <th className="border-b border-white/10 px-3 py-2">TOP</th>
                          <th className="border-b border-white/10 px-3 py-2">Actif</th>
                          <th className="border-b border-white/10 px-3 py-2">Biais</th>
                          <th className="border-b border-white/10 px-3 py-2">Pourquoi</th>
                          <th className="border-b border-white/10 px-3 py-2">Niveaux</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item, index) => {
                          const opportunity = opportunityBySymbol.get(item.symbol);
                          const direction = opportunity?.direction ?? item.direction;
                          const reasons = readableJsonList(item.reasons);
                          const missing = readableJsonList(item.missingData);
                          const newsSources = readableNewsSources(item.sources);
                          const targetsText = opportunity ? formatTargets(opportunity.targets) : formatTargets(item.targets);
                          const cardStatus = opportunity
                            ? statusLabels[opportunity.status]
                            : item.status === "setup_candidate"
                              ? "setup a surveiller"
                              : "contexte";
                          const isOpen = openRadarId === item.id;

                          return (
                            <Fragment key={item.id}>
                              <tr
                                role="button"
                                tabIndex={0}
                                onClick={() => setOpenRadarId(isOpen ? null : item.id)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") setOpenRadarId(isOpen ? null : item.id);
                                }}
                                className={`cursor-pointer outline-none transition hover:bg-white/[0.04] ${
                                  isOpen ? "bg-white/[0.05]" : index === 0 ? "bg-white/[0.035]" : ""
                                }`}
                              >
                                <td className="border-b border-white/5 px-3 py-3 align-top">
                                  <span
                                    className={`inline-flex min-w-9 justify-center rounded-md px-2 py-1 text-xs font-semibold ${
                                      index === 0 ? marketThemes[group.market].top : marketThemes[group.market].badge
                                    }`}
                                  >
                                    #{index + 1}
                                  </span>
                                </td>
                                <td className="border-b border-white/5 px-3 py-3 align-top">
                                  <strong className="block text-white">{item.assetName ?? item.symbol}</strong>
                                  <div className="mt-1 flex flex-wrap gap-2">
                                    <span className="text-xs text-slate-500">score {item.score}</span>
                                    <span className={`rounded-md border px-2 py-0.5 text-xs ${variationClass(item.variationPct)}`}>
                                      {item.variationPct ? `${Number(item.variationPct).toFixed(2)}%` : "var. n/a"}
                                    </span>
                                  </div>
                                </td>
                                <td className="border-b border-white/5 px-3 py-3 align-top">
                                  <span className={`rounded-md border px-2 py-1 text-xs font-semibold ${directionClass(direction)}`}>
                                    {directionLabels[direction]}
                                  </span>
                                  <span className={`mt-2 block w-fit rounded-md border px-2 py-1 text-xs ${opportunity ? statusClass(opportunity.status) : "border-white/10 bg-white/5 text-slate-300"}`}>
                                    {cardStatus}
                                  </span>
                                </td>
                                <td className="border-b border-white/5 px-3 py-3 align-top text-slate-300">
                                  <p className="leading-6">{whyText(item, opportunity, reasons)}</p>
                                  <span className="mt-2 inline-block text-xs text-violet-200">
                                    {isOpen ? "Masquer le detail" : "Cliquer pour le detail"}
                                  </span>
                                </td>
                                <td className="border-b border-white/5 px-3 py-3 align-top">
                                  <dl className="grid gap-1 text-xs text-slate-400">
                                    <div>
                                      Zone: <b className="text-slate-200">{opportunity?.entryZone ?? item.knownZone ?? "-"}</b>
                                    </div>
                                    <div>
                                      Invalidation:{" "}
                                      <b className="text-red-200">{opportunity?.invalidation ?? item.invalidation ?? "-"}</b>
                                    </div>
                                    <div>
                                      Objectifs: <b className="text-slate-200">{targetsText}</b>
                                    </div>
                                  </dl>
                                </td>
                              </tr>

                              {isOpen ? (
                                <tr>
                                  <td colSpan={5} className="border-b border-white/10 bg-slate-950/50 px-3 py-4">
                                    <div className="grid gap-3 text-sm md:grid-cols-3">
                                      <div className="rounded-md border border-white/10 bg-ink p-3">
                                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                                          Pourquoi celui-ci
                                        </h4>
                                        <ul className="space-y-2 text-slate-300">
                                          {(reasons.length ? reasons : ["Contexte detecte, mais criteres encore incomplets."]).map((reason) => (
                                            <li key={reason}>{reason}</li>
                                          ))}
                                        </ul>
                                        {missing.length ? (
                                          <p className="mt-3 flex items-start gap-2 text-xs text-amber-200">
                                            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                                            Manque: {missing.join(", ")}
                                          </p>
                                        ) : null}
                                      </div>

                                      <div className="rounded-md border border-white/10 bg-ink p-3">
                                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                                          Actus / contexte
                                        </h4>
                                        {item.newsContext ? <p className="leading-6 text-slate-300">{item.newsContext}</p> : null}
                                        {newsSources.length ? (
                                          <div className="mt-2 space-y-2">
                                            {newsSources.slice(0, 3).map((source, sourceIndex) => (
                                              <p key={`${source.title}-${sourceIndex}`} className="text-xs text-slate-400">
                                                {source.title ?? "News marche"} {source.source ? `- ${source.source}` : ""}
                                              </p>
                                            ))}
                                          </div>
                                        ) : !item.newsContext ? (
                                          <p className="text-slate-400">Pas de news specifique exploitable pour ce scan.</p>
                                        ) : null}
                                      </div>

                                      <div className="rounded-md border border-white/10 bg-ink p-3">
                                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
                                          Analyse tech
                                        </h4>
                                        <dl className="space-y-2 text-slate-300">
                                          <div className="flex justify-between gap-3">
                                            <dt className="text-slate-500">Cours</dt>
                                            <dd>{item.currentPrice ?? "-"}</dd>
                                          </div>
                                          <div className="flex justify-between gap-3">
                                            <dt className="text-slate-500">Proximite</dt>
                                            <dd>{item.zoneProximityPct ? `${Number(item.zoneProximityPct).toFixed(2)}%` : "-"}</dd>
                                          </div>
                                          <div className="flex justify-between gap-3">
                                            <dt className="text-slate-500">Risque</dt>
                                            <dd className="text-red-200">{opportunity?.riskNotes ?? item.riskNotes ?? "-"}</dd>
                                          </div>
                                        </dl>
                                        {opportunity ? (
                                          <div className="mt-3 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                                            <ActionButton
                                              tone="success"
                                              icon={<Check size={16} aria-hidden="true" />}
                                              busy={busyAction === "status-VALIDATED"}
                                              onClick={() => updateStatus(opportunity.id, "VALIDATED")}
                                            >
                                              Valider
                                            </ActionButton>
                                            <ActionButton
                                              icon={<X size={16} aria-hidden="true" />}
                                              busy={busyAction === "status-IGNORED"}
                                              onClick={() => updateStatus(opportunity.id, "IGNORED")}
                                            >
                                              Ignorer
                                            </ActionButton>
                                            <ActionButton
                                              icon={<Archive size={16} aria-hidden="true" />}
                                              busy={busyAction === "status-ARCHIVED"}
                                              onClick={() => updateStatus(opportunity.id, "ARCHIVED")}
                                            >
                                              Archiver
                                            </ActionButton>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border border-white/10 bg-ink p-3 text-sm text-slate-400">
                Clique sur Preparer la seance pour generer le TOP3 par marche.
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
