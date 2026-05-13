"use client";

import type { Direction, Opportunity, OpportunitySource, OpportunityStatus } from "@prisma/client";
import { Archive, Check, Download, Newspaper, RefreshCcw, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type DashboardOpportunity = Omit<Opportunity, "targets" | "createdAt" | "updatedAt"> & {
  targets: unknown;
  createdAt: string;
  updatedAt: string;
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

function statusClass(status: OpportunityStatus) {
  if (status === "VALIDATED") return "border-green-500/30 bg-green-500/10 text-green-300";
  if (status === "INVALIDATED") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "IGNORED" || status === "ARCHIVED") return "border-slate-500/30 bg-slate-500/10 text-slate-300";
  return "border-violetx/40 bg-violetx/10 text-violet-200";
}

function formatTargets(targets: unknown) {
  if (Array.isArray(targets)) return targets.join(" / ");
  if (typeof targets === "string") return targets;
  return "-";
}

export function DashboardClient({ opportunities }: { opportunities: DashboardOpportunity[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id ?? "");
  const [rawText, setRawText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => opportunities.find((opportunity) => opportunity.id === selectedId) ?? opportunities[0],
    [opportunities, selectedId],
  );

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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/dashboard/login";
  }

  return (
    <main className="min-h-screen bg-ink px-4 py-6 text-slate-100 md:px-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-white/10 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-violet-300">Xavier Fenaux</p>
          <h1 className="mt-2 text-2xl font-semibold text-white md:text-3xl">Setups a surveiller</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={scanNews}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-panel px-3 py-2 text-sm text-slate-200 transition hover:border-violetx/60"
          >
            <Newspaper size={16} aria-hidden="true" />
            Scan news
          </button>
          <button
            onClick={() => startTransition(() => router.refresh())}
            className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-panel px-3 py-2 text-sm text-slate-200 transition hover:border-violetx/60"
          >
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

      <section className="mb-6 grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-white/10 bg-panel">
          <div className="grid grid-cols-[1.2fr_0.7fr_1fr_1fr_0.7fr_0.9fr_0.9fr] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-slate-500">
            <span>Actif</span>
            <span>Direction</span>
            <span>Zone</span>
            <span>Invalidation</span>
            <span>Score</span>
            <span>Statut</span>
            <span>Source</span>
          </div>
          <div className="max-h-[560px] overflow-auto">
            {opportunities.length === 0 ? (
              <div className="px-4 py-12 text-center text-slate-400">Aucun setup a surveiller pour le moment.</div>
            ) : (
              opportunities.map((opportunity) => (
                <button
                  key={opportunity.id}
                  onClick={() => setSelectedId(opportunity.id)}
                  className={`grid w-full grid-cols-[1.2fr_0.7fr_1fr_1fr_0.7fr_0.9fr_0.9fr] gap-3 border-b border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/[0.03] ${
                    selected?.id === opportunity.id ? "bg-violetx/10" : ""
                  }`}
                >
                  <span>
                    <strong className="block text-white">{opportunity.symbol}</strong>
                    <span className="text-xs text-slate-500">
                      {new Date(opportunity.createdAt).toLocaleString("fr-FR")}
                    </span>
                  </span>
                  <span className="text-slate-300">{directionLabels[opportunity.direction]}</span>
                  <span className="text-slate-300">{opportunity.entryZone}</span>
                  <span className="text-red-300">{opportunity.invalidation}</span>
                  <span className="font-semibold text-white">{opportunity.score}/100</span>
                  <span>
                    <span className={`rounded-md border px-2 py-1 text-xs ${statusClass(opportunity.status)}`}>
                      {statusLabels[opportunity.status]}
                    </span>
                  </span>
                  <span className="text-slate-300">{sourceLabels[opportunity.source]}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <aside className="rounded-lg border border-white/10 bg-panel p-4">
          {selected ? (
            <>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Detail</p>
                  <h2 className="mt-1 text-xl font-semibold text-white">{selected.symbol}</h2>
                </div>
                <span className="rounded-md bg-violetx/20 px-2 py-1 text-sm font-semibold text-violet-100">
                  {selected.score}
                </span>
              </div>
              <div className="space-y-3 text-sm">
                <p className="leading-6 text-slate-200">{selected.summary}</p>
                <dl className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-xs text-slate-500">Zone d'entree</dt>
                    <dd className="mt-1 text-white">{selected.entryZone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Objectifs</dt>
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
                <button
                  onClick={() => updateStatus(selected.id, "VALIDATED")}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Check size={16} aria-hidden="true" />
                  Valider
                </button>
                <button
                  onClick={() => updateStatus(selected.id, "IGNORED")}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200"
                >
                  <X size={16} aria-hidden="true" />
                  Ignorer
                </button>
                <button
                  onClick={() => updateStatus(selected.id, "ARCHIVED")}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200"
                >
                  <Archive size={16} aria-hidden="true" />
                  Archiver
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </section>

      <section className="rounded-lg border border-white/10 bg-panel p-4">
        <form onSubmit={importNotification} className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-sm text-slate-300">
            Import notification Xavier / IVT
            <textarea
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              className="mt-2 min-h-24 w-full rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-white outline-none ring-violetx/60 focus:ring-2"
              placeholder="CAC 40 : zone 8200/8300, invalidation 8370, TP1 7990, TP2 7600. Attendre confirmation."
            />
          </label>
          <button
            type="submit"
            disabled={!rawText.trim() || isPending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-violetx px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download size={16} aria-hidden="true" />
            Importer
          </button>
        </form>
        {message ? <p className="mt-3 text-sm text-slate-300">{message}</p> : null}
      </section>
    </main>
  );
}
