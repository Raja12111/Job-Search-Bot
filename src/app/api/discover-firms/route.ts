import { NextResponse } from "next/server";
import { discoverFirms } from "@/lib/discover-firms";
import type { CityRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim();
  const state = url.searchParams.get("state")?.trim() || "";
  const countryRaw = url.searchParams.get("country")?.trim().toLowerCase();
  const country = countryRaw === "gb" || countryRaw === "uk" ? "gb" : "us";
  if (!city) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }
  const row: CityRow = { city, state, country };
  const firms = await discoverFirms(row, 50);
  const via: Record<string, number> = {};
  for (const firm of firms) {
    const key = firm.foundVia || "unknown";
    via[key] = (via[key] ?? 0) + 1;
  }
  return NextResponse.json({
    city,
    state,
    country,
    count: firms.length,
    via,
    firms,
    note:
      firms.length === 0
        ? "No SEO firms found in Maps, Yelp, Clutch, DesignRush, Sortlist, or SEMrush."
        : undefined,
  });
}
