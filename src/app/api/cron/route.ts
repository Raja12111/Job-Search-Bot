import { NextResponse } from "next/server";
import { defaultSearchInput, searchJobs } from "@/lib/jobs";
import { notifyNewJobs } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (secret && header === `Bearer ${secret}`) return true;
  const vercelCron = request.headers.get("x-vercel-cron");
  return Boolean(secret && vercelCron);
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = defaultSearchInput();
  const freshOnly = (process.env.CRON_FRESH_HOURS ?? "36").trim();
  const maxAgeHours = Number(freshOnly);
  const result = await searchJobs({
    ...input,
    maxAgeHours: Number.isFinite(maxAgeHours) ? maxAgeHours : 36,
  });

  const notify = await notifyNewJobs(result.jobs, input.query);

  return NextResponse.json({
    ok: true,
    query: input.query,
    location: input.location,
    remoteOnly: input.remoteOnly,
    found: result.jobs.length,
    sources: result.sources,
    notify,
    queriedAt: result.queriedAt,
  });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
