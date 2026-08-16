import { NextResponse } from "next/server";
import { crawlFirmCareers } from "@/lib/career-crawl";
import type { DiscoveredFirm } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const website = url.searchParams.get("website")?.trim();
  const name = url.searchParams.get("company")?.trim() || "";
  const city = url.searchParams.get("city")?.trim() || "";
  const countryRaw = url.searchParams.get("country")?.trim().toLowerCase();
  const country = countryRaw === "gb" || countryRaw === "uk" ? "gb" : "us";

  if (!website) {
    return NextResponse.json({ error: "website is required" }, { status: 400 });
  }

  let origin: string;
  try {
    origin = new URL(website).origin + "/";
  } catch {
    return NextResponse.json({ error: "Invalid website URL" }, { status: 400 });
  }

  const firm: DiscoveredFirm = {
    name: name || new URL(origin).hostname.replace(/^www\./, ""),
    website: origin,
    city,
    country,
  };

  try {
    const crawled = await crawlFirmCareers(firm);
    return NextResponse.json({
      company: firm.name,
      website: firm.website,
      city,
      country,
      pagesChecked: crawled.pagesChecked,
      careerPages: crawled.careerPages,
      found: crawled.jobs.length,
      jobs: crawled.jobs,
    });
  } catch (error) {
    return NextResponse.json({
      company: firm.name,
      website: firm.website,
      city,
      country,
      pagesChecked: [],
      careerPages: [],
      found: 0,
      jobs: [],
      error: error instanceof Error ? error.message : "Scan failed",
    });
  }
}
