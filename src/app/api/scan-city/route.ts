import { NextResponse } from "next/server";
import { cityLabel } from "@/lib/cities";
import { groupFirms } from "@/lib/firms";
import { searchJobs } from "@/lib/jobs";
import type { CityRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const THIRTY_DAYS_HOURS = 30 * 24;

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
  const location = cityLabel(row);
  const result = await searchJobs({
    query: "SEO marketing",
    location,
    remoteOnly: false,
    maxAgeHours: THIRTY_DAYS_HOURS,
    cityScan: true,
    country,
  });

  const firms = groupFirms(result.jobs, row);

  return NextResponse.json({
    city,
    state,
    country,
    location,
    found: result.jobs.length,
    firmCount: firms.length,
    firms,
    jobs: result.jobs,
    sources: result.sources,
    queriedAt: result.queriedAt,
  });
}
