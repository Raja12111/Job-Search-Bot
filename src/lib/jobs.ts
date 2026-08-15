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
  return q.split(/\s+/).every((part) => text.includes(part));
}

export function isSeoRole(job: Job): boolean {
  const title = normalize(job.title);
  if (
    title.includes("seo") ||
    title.includes("search engine optimization") ||
    title.includes("search engine optimisation") ||
    title.includes("aeo")
  ) {
    return true;
  }
  const tags = job.tags.map(normalize);
  return tags.length > 0 && tags.length <= 3 && tags.includes("seo");
}

function jobMatches(job: Job, input: SearchInput): boolean {
  const query = normalize(input.query);
  if (input.cityScan || query === "seo") {
    if (!isSeoRole(job)) return false;
  } else {
    const blob = `${job.title} ${job.company} ${job.location} ${job.tags.join(" ")} ${job.description}`;
    if (!includesQuery(blob, input.query)) return false;
  }
  if (input.remoteOnly && !job.remote) return false;
  if (input.location) {
    const loc = normalize(input.location).split(",")[0]?.trim() ?? "";
    const jobLoc = normalize(job.location);
    const isRemoteQuery = loc === "remote" || loc === "worldwide";
    if (input.cityScan) {
      if (!loc || !jobLoc.includes(loc)) return false;
    } else if (!isRemoteQuery && !jobLoc.includes(loc) && !job.remote) {
      return false;
    }
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

type MuseJob = {
  id?: number;
  name?: string;
  publication_date?: string;
  contents?: string;
  refs?: { landing_page?: string };
  locations?: Array<{ name?: string }>;
  categories?: Array<{ name?: string }>;
  company?: { name?: string };
};

async function fromMuse(input: SearchInput): Promise<Job[]> {
  const url = new URL("https://www.themuse.com/api/public/jobs");
  url.searchParams.set("page", "0");
  url.searchParams.set("descending", "true");
  if (input.location && !["remote", "worldwide"].includes(normalize(input.location))) {
    url.searchParams.set("location", input.location);
  }
  url.searchParams.append("category", "Marketing");
  url.searchParams.append("category", "Advertising and PR");
  const result = await fetchJson<{ results?: MuseJob[] }>(url.toString());
  if (!result.ok) throw new Error(result.error);
  return (result.data.results ?? []).map((item) => ({
    id: `muse-${item.id ?? item.refs?.landing_page ?? item.name}`,
    title: asString(item.name) || "Untitled role",
    company: asString(item.company?.name) || "Unknown company",
    location: asString(item.locations?.[0]?.name) || input.location || "Unknown",
    remote: /remote/i.test(asString(item.locations?.[0]?.name)),
    url: asString(item.refs?.landing_page),
    source: "muse",
    postedAt: isoFromUnknown(item.publication_date),
    description: asString(item.contents).replace(/<[^>]+>/g, " ").slice(0, 400),
    tags: (item.categories ?? []).map((cat) => asString(cat.name)).filter(Boolean),
  }));
}

async function fromAdzuna(input: SearchInput): Promise<Job[]> {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) {
    throw new Error("ADZUNA_APP_ID / ADZUNA_APP_KEY not set");
  }
  const country = (input.country || process.env.ADZUNA_COUNTRY?.trim() || "us").toLowerCase();
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "50");
  url.searchParams.set("what", input.cityScan ? "SEO" : input.query || "SEO");
  if (input.location) url.searchParams.set("where", input.location.split(",")[0] ?? input.location);
  if (input.maxAgeHours) {
    url.searchParams.set("max_days_old", String(Math.max(1, Math.ceil(input.maxAgeHours / 24))));
  }
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

function publisherSource(name: string): JobSource {
  const n = name.toLowerCase();
  if (n.includes("indeed")) return "indeed";
  if (n.includes("glassdoor")) return "glassdoor";
  if (n.includes("zip")) return "ziprecruiter";
  if (n.includes("linkedin")) return "linkedin";
  if (n.includes("reed")) return "reed";
  if (n.includes("monster")) return "monster";
  if (n.includes("careerbuilder")) return "careerbuilder";
  if (n.includes("simply")) return "simplyhired";
  return "jsearch";
}

type JSearchJob = {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_city?: string;
  job_country?: string;
  job_is_remote?: boolean;
  job_apply_link?: string;
  job_description?: string;
  job_posted_at_datetime_utc?: string;
  job_publisher?: string;
};

async function fromJSearch(input: SearchInput): Promise<Job[]> {
  const key = process.env.JSEARCH_API_KEY?.trim() || process.env.RAPIDAPI_KEY?.trim();
  if (!key) throw new Error("JSEARCH_API_KEY not set");
  const query = [input.query || "SEO", input.location].filter(Boolean).join(" in ");
  const url = new URL("https://jsearch.p.rapidapi.com/search");
  url.searchParams.set("query", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("num_pages", "1");
  url.searchParams.set("date_posted", "month");
  if (input.remoteOnly) url.searchParams.set("remote_jobs_only", "true");
  const result = await fetchJson<{ data?: JSearchJob[] }>(url.toString(), {
    headers: {
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });
  if (!result.ok) throw new Error(result.error);
  return (result.data.data ?? []).map((item) => ({
    id: `jsearch-${item.job_id ?? item.job_apply_link ?? item.job_title}`,
    title: asString(item.job_title) || "Untitled role",
    company: asString(item.employer_name) || "Unknown company",
    location: [item.job_city, item.job_country].filter(Boolean).join(", ") || input.location,
    remote: Boolean(item.job_is_remote),
    url: asString(item.job_apply_link),
    source: publisherSource(asString(item.job_publisher)),
    postedAt: isoFromUnknown(item.job_posted_at_datetime_utc),
    description: asString(item.job_description).slice(0, 400),
    tags: [asString(item.job_publisher)].filter(Boolean),
  }));
}

type ReedJob = {
  jobId?: number;
  jobTitle?: string;
  employerName?: string;
  locationName?: string;
  jobUrl?: string;
  date?: string;
  jobDescription?: string;
};

async function fromReed(input: SearchInput): Promise<Job[]> {
  const key = process.env.REED_API_KEY?.trim();
  if (!key) throw new Error("REED_API_KEY not set");
  const url = new URL("https://www.reed.co.uk/api/1.0/search");
  url.searchParams.set("keywords", input.query || "SEO");
  url.searchParams.set("resultsToTake", "50");
  if (input.location && !["remote", "worldwide"].includes(input.location.toLowerCase())) {
    url.searchParams.set("locationName", input.location);
  }
  const auth = Buffer.from(`${key}:`).toString("base64");
  const result = await fetchJson<{ results?: ReedJob[] }>(url.toString(), {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!result.ok) throw new Error(result.error);
  return (result.data.results ?? []).map((item) => ({
    id: `reed-${item.jobId ?? item.jobUrl ?? item.jobTitle}`,
    title: asString(item.jobTitle) || "Untitled role",
    company: asString(item.employerName) || "Unknown company",
    location: asString(item.locationName) || input.location || "UK",
    remote: /remote/i.test(asString(item.locationName)),
    url: asString(item.jobUrl),
    source: "reed",
    postedAt: isoFromUnknown(item.date),
    description: asString(item.jobDescription).replace(/<[^>]+>/g, " ").slice(0, 400),
    tags: ["reed"],
  }));
}

type JoobleJob = {
  title?: string;
  company?: string;
  location?: string;
  link?: string;
  updated?: string;
  snippet?: string;
};

async function fromJooble(input: SearchInput): Promise<Job[]> {
  const key = process.env.JOOBLE_API_KEY?.trim();
  if (!key) throw new Error("JOOBLE_API_KEY not set");
  const result = await fetchJson<{ jobs?: JoobleJob[] }>(`https://jooble.org/api/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keywords: input.query || "SEO",
      location: input.location || "",
    }),
  });
  if (!result.ok) throw new Error(result.error);
  return (result.data.jobs ?? []).map((item, index) => ({
    id: `jooble-${item.link ?? item.title ?? index}`,
    title: asString(item.title) || "Untitled role",
    company: asString(item.company) || "Unknown company",
    location: asString(item.location) || input.location || "Unknown",
    remote: /remote/i.test(asString(item.location)),
    url: asString(item.link),
    source: "jooble",
    postedAt: isoFromUnknown(item.updated),
    description: asString(item.snippet).slice(0, 400),
    tags: ["jooble"],
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
  { source: "muse", run: (input) => fromMuse(input) },
  { source: "adzuna", run: (input) => fromAdzuna(input), optional: true },
  { source: "jsearch", run: (input) => fromJSearch(input), optional: true },
  { source: "reed", run: (input) => fromReed(input), optional: true },
  { source: "jooble", run: (input) => fromJooble(input), optional: true },
];

export async function searchJobs(input: SearchInput): Promise<SearchResult> {
  const sources: SearchResult["sources"] = {};
  const collected: Job[] = [];
  const fetchers = input.cityScan
    ? SOURCE_FETCHERS.filter((entry) =>
        ["muse", "adzuna", "arbeitnow", "jobicy"].includes(entry.source)
      )
    : SOURCE_FETCHERS;

  const settled = await Promise.allSettled(
    fetchers.map(async (entry) => {
      const jobs = await entry.run(input);
      return { entry, jobs };
    })
  );

  for (const [index, item] of settled.entries()) {
    const meta = fetchers[index];
    if (!meta) continue;
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

  if (sources.jsearch?.ok) {
    for (const job of jobs) {
      if (
        job.source === "indeed" ||
        job.source === "glassdoor" ||
        job.source === "ziprecruiter" ||
        job.source === "linkedin" ||
        job.source === "monster" ||
        job.source === "careerbuilder" ||
        job.source === "simplyhired"
      ) {
        const current = sources[job.source];
        sources[job.source] = { ok: true, count: (current?.count ?? 0) + 1 };
      }
    }
  }

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
