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

type ButtonTone = "primary" | "neutral" | "danger" | "success";

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

function readableJsonList(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string") as string[];
  return [];
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
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [batchText, setBatchText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
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

  const selected = useMemo(
    () => opportunities.find((opportunity) => opportunity.id === selectedId) ?? opportunities[0],
    [opportunities, selectedId],
  );

  const priorityRadar = useMemo(() => latestScan?.radarItems?.slice(0, 16) ?? [], [latestScan]);

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
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="section-title">Actifs a cibler ce matin</h2>
            <span className="text-xs text-slate-500">
              {latestScan ? new Date(latestScan.createdAt).toLocaleString("fr-FR") : "aucun scan"}
            </span>
          </div>
          {latestScan?.summary ? <p className="mb-3 text-sm leading-6 text-slate-300">{latestScan.summary}</p> : null}
          <div className="max-h-[520px] space-y-2 overflow-auto pr-1">
            {priorityRadar.length ? (
              priorityRadar.map((item) => {
                const reasons = readableJsonList(item.reasons);
                const missing = readableJsonList(item.missingData);

                return (
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
                        <span className="ml-2 text-xs text-slate-500">
                          P{item.priority} - score {item.score}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-md border px-2 py-1 text-xs ${variationClass(item.variationPct)}`}>
                          {item.variationPct ? `${Number(item.variationPct).toFixed(2)}%` : "var. n/a"}
                        </span>
                        <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300">
                          {directionLabels[item.direction]}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {item.xavierContext ??
                        item.newsContext ??
                        item.briefContext ??
                        "Contexte a surveiller, donnees encore incompletes."}
                    </p>

                    <div className="mt-3 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
                      <span>
                        Zone: <b className="text-slate-200">{item.knownZone ?? "-"}</b>
                      </span>
                      <span>
                        Proximite:{" "}
                        <b className="text-slate-200">
                          {item.zoneProximityPct ? `${Number(item.zoneProximityPct).toFixed(2)}%` : "-"}
                        </b>
                      </span>
                      <span>
                        Invalidation: <b className="text-red-200">{item.invalidation ?? "-"}</b>
                      </span>
                    </div>

                    {reasons.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reasons.slice(0, 3).map((reason) => (
                          <span key={reason} className="rounded-md border border-violetx/30 bg-violetx/10 px-2 py-1 text-xs text-violet-100">
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {missing.length ? (
                      <p className="mt-3 flex items-start gap-2 text-xs text-amber-200">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        Manque: {missing.join(", ")}
                      </p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="rounded-md border border-white/10 bg-ink p-3 text-sm text-slate-400">
                Clique sur Preparer la seance pour generer la short-list du matin.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[1fr_0.7fr_1fr_1fr_0.55fr_0.85fr] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
            <span>Setup a surveiller</span>
            <span>Direction</span>
            <span>Zone</span>
            <span>Invalidation</span>
            <span>Score</span>
            <span>Statut</span>
          </div>
          <div className="max-h-[520px] overflow-auto">
            {opportunities.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400">Aucun setup a surveiller pour le moment.</div>
            ) : (
              opportunities.map((opportunity) => (
                <button
                  key={opportunity.id}
                  type="button"
                  onClick={() => setSelectedId(opportunity.id)}
                  className={`grid w-full grid-cols-[1fr_0.7fr_1fr_1fr_0.55fr_0.85fr] gap-3 border-b border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.03] ${
                    selected?.id === opportunity.id ? "bg-violetx/10" : ""
                  }`}
                >
                  <span>
                    <strong className="block text-white">{opportunity.assetName ?? opportunity.symbol}</strong>
                    <span className="text-xs text-slate-500">
                      {sourceLabels[opportunity.source]} - {new Date(opportunity.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </span>
                  <span className="text-slate-300">{directionLabels[opportunity.direction]}</span>
                  <span className="text-slate-300">{opportunity.entryZone}</span>
                  <span className="text-red-300">{opportunity.invalidation}</span>
                  <span className="font-semibold text-white">{opportunity.score}</span>
                  <span>
                    <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(opportunity.status)}`}>
                      {statusLabels[opportunity.status]}
                    </span>
                  </span>
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
                  <h2 className="mt-1 text-xl font-semibold text-white">{selected.assetName ?? selected.symbol}</h2>
                </div>
                <span className="rounded-md bg-violetx/20 px-2 py-1 text-sm font-semibold text-violet-100">
                  {selected.score}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <p className="leading-6 text-slate-200">{selected.summary}</p>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-slate-500">Zone</dt>
                    <dd className="mt-1 text-white">{selected.entryZone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Objectifs theoriques</dt>
                    <dd className="mt-1 text-white">{formatTargets(selected.targets)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Invalidation</dt>
                    <dd className="mt-1 text-red-300">{selected.invalidation}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Source</dt>
                    <dd className="mt-1 text-white">{sourceLabels[selected.source]}</dd>
                  </div>
                </dl>
                {selected.riskNotes ? (
                  <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-red-100">
                    {selected.riskNotes}
                  </div>
                ) : null}
                {selected.aiReasoningSummary ? (
                  <p className="rounded-md border border-white/10 bg-ink p-3 text-slate-300">
                    {selected.aiReasoningSummary}
                  </p>
                ) : null}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <ActionButton
                  tone="success"
                  icon={<Check size={16} aria-hidden="true" />}
                  busy={busyAction === "status-VALIDATED"}
                  onClick={() => updateStatus(selected.id, "VALIDATED")}
                >
                  Valider
                </ActionButton>
                <ActionButton
                  icon={<X size={16} aria-hidden="true" />}
                  busy={busyAction === "status-IGNORED"}
                  onClick={() => updateStatus(selected.id, "IGNORED")}
                >
                  Ignorer
                </ActionButton>
                <ActionButton
                  icon={<Archive size={16} aria-hidden="true" />}
                  busy={busyAction === "status-ARCHIVED"}
                  onClick={() => updateStatus(selected.id, "ARCHIVED")}
                >
                  Archiver
                </ActionButton>
              </div>
            </>
          ) : (
            <div className="grid min-h-48 place-items-center text-sm text-slate-500">Selectionne un setup.</div>
          )}
        </aside>
      </section>
    </main>
  );
}
