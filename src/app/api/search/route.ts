import { NextResponse } from "next/server";
import { defaultSearchInput, searchJobs } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const defaults = defaultSearchInput();
  const query = url.searchParams.get("query")?.trim() || defaults.query;
  const location = url.searchParams.get("location")?.trim() || defaults.location;
  const remoteOnly = url.searchParams.get("remoteOnly") !== "false";
  const maxAgeHoursRaw = url.searchParams.get("maxAgeHours");
  const maxAgeHours = maxAgeHoursRaw ? Number(maxAgeHoursRaw) : undefined;

  const result = await searchJobs({
    query,
    location,
    remoteOnly,
    maxAgeHours:
      maxAgeHours && Number.isFinite(maxAgeHours) ? maxAgeHours : undefined,
  });

  return NextResponse.json({
    query,
    location,
    remoteOnly,
    ...result,
  });
}
