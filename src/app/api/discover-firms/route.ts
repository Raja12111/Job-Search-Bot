import { NextResponse } from "next/server";
import { discoverFirms } from "@/lib/discover-firms";
import type { CityRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  const firms = await discoverFirms(row, 8);
  return NextResponse.json({
    city,
    state,
    country,
    count: firms.length,
    firms,
    note:
      firms.length === 0
        ? "No GMB SEO firms found. Add SERPER_API_KEY or GOOGLE_PLACES_API_KEY on Vercel."
        : undefined,
  });
}
