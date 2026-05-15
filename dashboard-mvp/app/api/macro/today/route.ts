import { NextResponse } from "next/server";
import { jsonError, requireApiSession } from "@/lib/security/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ForexFactoryEvent = {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string | number | null;
  previous?: string | number | null;
  actual?: string | number | null;
};

function parisDateKey(date: Date) {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parisTime(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeImpact(impact?: string) {
  const value = (impact ?? "").toLowerCase();
  if (value.includes("high")) return "high";
  if (value.includes("medium")) return "medium";
  if (value.includes("low")) return "low";
  return "other";
}

export async function GET() {
  const session = await requireApiSession();
  if (!session) return jsonError("Authentification requise.", 401);

  try {
    const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      next: { revalidate: 60 * 30 },
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return jsonError("Agenda macro indisponible.", 502);
    }

    const events = (await response.json()) as ForexFactoryEvent[];
    const today = parisDateKey(new Date());

    const filtered = events
      .map((event) => {
        const eventDate = event.date ? new Date(event.date) : null;
        return {
          title: event.title ?? "Evenement macro",
          country: event.country ?? "",
          impact: normalizeImpact(event.impact),
          forecast: event.forecast ?? null,
          previous: event.previous ?? null,
          actual: event.actual ?? null,
          date: eventDate?.toISOString() ?? null,
          time: eventDate ? parisTime(eventDate) : "",
          dayKey: eventDate ? parisDateKey(eventDate) : "",
        };
      })
      .filter((event) => event.dayKey === today)
      .sort((a, b) => a.time.localeCompare(b.time));

    return NextResponse.json({
      ok: true,
      events: filtered,
      highImpact: filtered.filter((event) => event.impact === "high"),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Agenda macro indisponible.", 500);
  }
}
