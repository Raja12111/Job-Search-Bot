import type { Job, JobSource, SearchInput, SearchResult } from "@/lib/types";

const USER_AGENT =
  "JobSearchBot/1.0 (+https://github.com/Raja12111/Job-Search-Bot)";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesQuery(haystack: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const text = normalize(haystack);
  if (q === "seo") {
    return (
      text.includes("seo") ||
      text.includes("search engine optimization") ||
      text.includes("search engine optimisation")
    );
  }
  return q.split(/\s+/).every((part) => text.includes(part));
}

function jobMatches(job: Job, input: SearchInput): boolean {
  const blob = `${job.title} ${job.company} ${job.location} ${job.tags.join(" ")} ${job.description}`;
  if (!includesQuery(blob, input.query)) return false;
  if (input.remoteOnly && !job.remote) return false;
  if (input.location) {
    const loc = normalize(input.location);
    const jobLoc = normalize(job.location);
    const isRemoteQuery = loc === "remote" || loc === "worldwide";
    if (!isRemoteQuery && !jobLoc.includes(loc) && !job.remote) return false;
  }
  if (input.maxAgeHours && job.postedAt) {
    const posted = Date.parse(job.postedAt);
    if (!Number.isNaN(posted)) {
      const ageMs = Date.now() - posted;
      if (ageMs > input.maxAgeHours * 60 * 60 * 1000) return false;
    }
  }
  return true;
}

function uniqueJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const job of jobs) {
    const key = `${normalize(job.title)}|${normalize(job.company)}|${normalize(job.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isoFromUnknown(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms).toISOString();
  }
  return null;
}

type RemotiveJob = {
  id?: number;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  url?: string;
  publication_date?: string;
  description?: string;
  tags?: string[];
};

async function fromRemotive(query: string): Promise<Job[]> {
  const url = new URL("https://remotive.com/api/remote-jobs");
  if (query) url.searchParams.set("search", query);
  url.searchParams.set("limit", "50");
  const result = await fetchJson<{ jobs?: RemotiveJob[] }>(url.toString());
  if (!result.ok) throw new Error(result.error);
  return (result.data.jobs ?? []).map((item) => ({
    id: `remotive-${item.id ?? item.url ?? item.title}`,
    title: asString(item.title) || "Untitled role",
    company: asString(item.company_name) || "Unknown company",
    location: asString(item.candidate_required_location) || "Remote",
    remote: true,
    url: asString(item.url),
    source: "remotive",
    postedAt: isoFromUnknown(item.publication_date),
    description: asString(item.description).replace(/<[^>]+>/g, " ").slice(0, 400),
    tags: Array.isArray(item.tags) ? item.tags.map(asString).filter(Boolean) : [],
  }));
}

type ArbeitnowJob = {
  slug?: string;
  title?: string;
  company_name?: string;
  location?: string;
  remote?: boolean;
  url?: string;
  created_at?: number;
  description?: string;
  tags?: string[];
};

async function fromArbeitnow(): Promise<Job[]> {
  const result = await fetchJson<{ data?: ArbeitnowJob[] }>(
    "https://www.arbeitnow.com/api/job-board-api"
  );
  if (!result.ok) throw new Error(result.error);
  return (result.data.data ?? []).map((item) => ({
    id: `arbeitnow-${item.slug ?? item.url ?? item.title}`,
    title: asString(item.title) || "Untitled role",
    company: asString(item.company_name) || "Unknown company",
    location: asString(item.location) || (item.remote ? "Remote" : "Unknown"),
    remote: Boolean(item.remote),
    url: asString(item.url),
    source: "arbeitnow",
    postedAt: isoFromUnknown(item.created_at),
    description: asString(item.description).replace(/<[^>]+>/g, " ").slice(0, 400),
    tags: Array.isArray(item.tags) ? item.tags.map(asString).filter(Boolean) : [],
  }));
}

type JobicyJob = {
  id?: number;
  jobTitle?: string;
  companyName?: string;
  jobGeo?: string;
  url?: string;
  pubDate?: string;
  jobExcerpt?: string;
  jobIndustry?: string[];
};

async function fromJobicy(query: string): Promise<Job[]> {
  const url = new URL("https://jobicy.com/api/v2/remote-jobs");
  if (query) url.searchParams.set("tag", query.split(/\s+/)[0] ?? "");
  url.searchParams.set("count", "50");
  const result = await fetchJson<{ jobs?: JobicyJob[] }>(url.toString());
  if (!result.ok) throw new Error(result.error);
  return (result.data.jobs ?? []).map((item) => ({
    id: `jobicy-${item.id ?? item.url ?? item.jobTitle}`,
    title: asString(item.jobTitle) || "Untitled role",
    company: asString(item.companyName) || "Unknown company",
    location: asString(item.jobGeo) || "Remote",
    remote: true,
    url: asString(item.url),
    source: "jobicy",
    postedAt: isoFromUnknown(item.pubDate),
    description: asString(item.jobExcerpt).replace(/<[^>]+>/g, " ").slice(0, 400),
    tags: Array.isArray(item.jobIndustry)
      ? item.jobIndustry.map(asString).filter(Boolean)
      : [],
  }));
}

type HimalayasJob = {
  title?: string;
  companyName?: string;
  location?: string;
  applicationLink?: string;
  excerpt?: string;
  pubDate?: number;
};

async function fromHimalayas(): Promise<Job[]> {
  const result = await fetchJson<HimalayasJob[]>(
    "https://himalayas.app/jobs/api?limit=50"
  );
  if (!result.ok) throw new Error(result.error);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows.map((item, index) => ({
    id: `himalayas-${item.applicationLink ?? item.title ?? index}`,
    title: asString(item.title) || "Untitled role",
    company: asString(item.companyName) || "Unknown company",
    location: asString(item.location) || "Remote",
    remote: true,
    url: asString(item.applicationLink),
    source: "himalayas",
    postedAt: isoFromUnknown(item.pubDate),
    description: asString(item.excerpt).slice(0, 400),
    tags: [],
  }));
}

type RemoteOkJob = {
  id?: string | number;
  position?: string;
  company?: string;
  location?: string;
  url?: string;
  date?: string;
  description?: string;
  tags?: string[];
};

async function fromRemoteOk(): Promise<Job[]> {
  const result = await fetchJson<RemoteOkJob[]>("https://remoteok.com/api");
  if (!result.ok) throw new Error(result.error);
  const rows = Array.isArray(result.data) ? result.data : [];
  return rows
    .filter((item) => item.position || item.url)
    .map((item) => ({
      id: `remoteok-${item.id ?? item.url ?? item.position}`,
      title: asString(item.position) || "Untitled role",
      company: asString(item.company) || "Unknown company",
      location: asString(item.location) || "Remote",
      remote: true,
      url: asString(item.url),
      source: "remoteok",
      postedAt: isoFromUnknown(item.date),
      description: asString(item.description).replace(/<[^>]+>/g, " ").slice(0, 400),
      tags: Array.isArray(item.tags) ? item.tags.map(asString).filter(Boolean) : [],
    }));
}

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url?: string;
  created?: string;
  description?: string;
};

async function fromAdzuna(input: SearchInput): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) {
    throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
  }
  const country = (process.env.ADZUNA_COUNTRY?.trim() || "us").toLowerCase();
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "30");
  url.searchParams.set("what", input.query || "SEO");
  if (input.location) url.searchParams.set("where", input.location);
  if (input.remoteOnly) url.searchParams.set("what_and", "remote");
  const result = await fetchJson<{ results?: AdzunaJob[] }>(url.toString());
  if (!result.ok) throw new Error(result.error);
  return (result.data.results ?? []).map((item) => ({
    id: `adzuna-${item.id ?? item.redirect_url ?? item.title}`,
    title: asString(item.title) || "Untitled role",
    company: asString(item.company?.display_name) || "Unknown company",
    location: asString(item.location?.display_name) || input.location || "Unknown",
    remote:
      /remote/i.test(asString(item.title)) ||
      /remote/i.test(asString(item.location?.display_name)),
    url: asString(item.redirect_url),
    source: "adzuna",
    postedAt: isoFromUnknown(item.created),
    description: asString(item.description).slice(0, 400),
    tags: [],
  }));
}

const SOURCE_FETCHERS: Array<{
  source: JobSource;
  run: (input: SearchInput) => Promise<Job[]>;
  optional?: boolean;
}> = [
  { source: "remotive", run: (input) => fromRemotive(input.query) },
  { source: "arbeitnow", run: () => fromArbeitnow() },
  { source: "jobicy", run: (input) => fromJobicy(input.query) },
  { source: "himalayas", run: () => fromHimalayas() },
  { source: "remoteok", run: () => fromRemoteOk() },
  { source: "adzuna", run: (input) => fromAdzuna(input), optional: true },
];

export async function searchJobs(input: SearchInput): Promise<SearchResult> {
  const sources: SearchResult["sources"] = {};
  const collected: Job[] = [];

  const settled = await Promise.allSettled(
    SOURCE_FETCHERS.map(async (entry) => {
      const jobs = await entry.run(input);
      return { entry, jobs };
    })
  );

  for (const [index, item] of settled.entries()) {
    const meta = SOURCE_FETCHERS[index];
    if (item.status === "fulfilled") {
      const matched = item.value.jobs.filter((job) => jobMatches(job, input) && job.url);
      sources[meta.source] = { ok: true, count: matched.length };
      collected.push(...matched);
    } else {
      const message =
        item.reason instanceof Error ? item.reason.message : "Source failed";
      if (!meta.optional || !/not set/i.test(message)) {
        sources[meta.source] = { ok: false, count: 0, error: message };
      }
    }
  }

  const jobs = uniqueJobs(collected).sort((a, b) => {
    const aTime = a.postedAt ? Date.parse(a.postedAt) : 0;
    const bTime = b.postedAt ? Date.parse(b.postedAt) : 0;
    return bTime - aTime;
  });

  return {
    jobs,
    sources,
    queriedAt: new Date().toISOString(),
  };
}

function seoDefaultQuery(): string {
  const fromEnv = process.env.JOB_QUERY?.trim();
  if (!fromEnv || fromEnv.toLowerCase() === "software engineer") return "SEO";
  return fromEnv;
}

export function defaultSearchInput(): SearchInput {
  return {
    query: seoDefaultQuery(),
    location: process.env.JOB_LOCATION?.trim() || "remote",
    remoteOnly: (process.env.JOB_REMOTE_ONLY ?? "true").toLowerCase() !== "false",
  };
}

export function formatJobLine(job: Job): string {
  const where = job.location || (job.remote ? "Remote" : "Unknown");
  return `• ${job.title} at ${job.company} (${where}) — ${job.url}`;
}
