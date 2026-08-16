import { NextResponse } from "next/server";
import { exploreCityStep, type ExploreStep } from "@/lib/discover-firms";
import type { CityRow } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const STEPS: ExploreStep[] = ["google", "clutch", "designrush", "directories"];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const city = url.searchParams.get("city")?.trim();
  const state = url.searchParams.get("state")?.trim() || "";
  const countryRaw = url.searchParams.get("country")?.trim().toLowerCase();
  const country = countryRaw === "gb" || countryRaw === "uk" ? "gb" : "us";
  const stepRaw = url.searchParams.get("step")?.trim().toLowerCase();
  const step = STEPS.includes(stepRaw as ExploreStep) ? (stepRaw as ExploreStep) : null;

  if (!city) {
    return NextResponse.json({ error: "city is required" }, { status: 400 });
  }
  if (!step) {
    return NextResponse.json({ error: "step must be google, clutch, designrush, or directories" }, { status: 400 });
  }

  const row: CityRow = { city, state, country };
  const firms = await exploreCityStep(row, step, 200);
  return NextResponse.json({
    city,
    state,
    country,
    step,
    count: firms.length,
    firms,
  });
}
