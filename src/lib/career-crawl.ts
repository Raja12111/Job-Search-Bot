import type { DiscoveredFirm, Job, JobSource } from "@/lib/types";
import { isSeoRole } from "@/lib/jobs";

const USER_AGENT =
  "JobSearchBot/1.0 (+https://github.com/Raja12111/Job-Search-Bot)";

const CAREER_PATHS = [
  "/careers",
  "/career",
  "/jobs",
  "/job",
  "/join",
  "/join-us",
  "/joinus",
  "/work-with-us",
  "/work",
  "/opportunities",
  "/vacancies",
  "/hiring",
  "/we-are-hiring",
  "/about",
  "/about-us",
  "/about/careers",
  "/company/careers",
  "/en/careers",
  "/team",
];

const CAREER_HINT =
  /career|jobs?|join[- ]us|we.?re hiring|open position|vacanc|opportunit|work with us|current opening/i;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type Page = {
  url: string;
  html: string;
};

function absUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function decode(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchPage(url: string): Promise<Page | null> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/json", "User-Agent": USER_AGENT },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!/html|json|text|xml/i.test(type)) return null;
    const html = (await response.text()).slice(0, 900_000);
    return { url: response.url || url, html };
  } catch {
    return null;
  }
}

function findCareerLinks(page: Page): string[] {
  const links = new Set<string>();
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    const text = decode(match[2] ?? "");
    const abs = absUrl(href, page.url);
    if (!abs) continue;
    if (CAREER_HINT.test(href) || CAREER_HINT.test(text)) links.add(abs.split("?")[0] ?? abs);
  }
  return [...links].slice(0, 12);
}

function detectAts(html: string, pageUrl: string): Array<{ source: JobSource; slug: string }> {
  const blob = `${html} ${pageUrl}`;
  const found: Array<{ source: JobSource; slug: string }> = [];
  const greenhouse = blob.match(/boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i);
  if (greenhouse?.[1]) found.push({ source: "greenhouse", slug: greenhouse[1] });
  const lever = blob.match(/jobs\.lever\.co\/([a-z0-9-]+)/i);
  if (lever?.[1]) found.push({ source: "lever", slug: lever[1] });
  const ashby = blob.match(/jobs\.ashbyhq\.com\/([a-z0-9-]+)/i);
  if (ashby?.[1]) found.push({ source: "ashby", slug: ashby[1] });
  const workable = blob.match(/apply\.workable\.com\/([a-z0-9-]+)/i);
  if (workable?.[1]) found.push({ source: "workable", slug: workable[1] });
  return found;
}

function within30Days(value: string | null): boolean {
  if (!value) return true;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return true;
  return Date.now() - time <= THIRTY_DAYS_MS;
}

function fromJsonLd(page: Page, company: string): Job[] {
  const jobs: Job[] = [];
  const blocks = [...page.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1] ?? "");
      const items = Array.isArray(parsed) ? parsed : parsed["@graph"] ?? [parsed];
      for (const item of items as Array<Record<string, unknown>>) {
        const type = String(item["@type"] ?? "");
        if (!/jobposting/i.test(type)) continue;
        const title = String(item.title ?? item.name ?? "").trim();
        const url = String(item.url ?? page.url);
        const postedAt = String(item.datePosted ?? "") || null;
        if (!title) continue;
        jobs.push({
          id: `career-${url}-${title}`,
          title,
          company: String((item.hiringOrganization as { name?: string } | undefined)?.name ?? company),
          location: String(
            (item.jobLocation as { address?: { addressLocality?: string } } | undefined)?.address
              ?.addressLocality ?? ""
          ),
          remote: /remote/i.test(String(item.jobLocationType ?? "")),
          url,
          source: "career-page",
          postedAt,
          description: decode(String(item.description ?? "")).slice(0, 400),
          tags: ["career-page"],
        });
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return jobs;
}

function fromJobLinks(page: Page, company: string): Job[] {
  const jobs: Job[] = [];
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    const title = decode(match[2] ?? "");
    const abs = absUrl(href, page.url);
    if (!abs || title.length < 6 || title.length > 90) continue;
    if (!/(\/jobs?\/|\/careers?\/|\/position|\/vacanc|greenhouse|lever\.co|ashbyhq|workable)/i.test(abs)) {
      continue;
    }
    if (/view all|see all|learn more|read more|privacy|login/i.test(title)) continue;
    jobs.push({
      id: `career-${abs}`,
      title,
      company,
      location: "",
      remote: /remote/i.test(title),
      url: abs,
      source: "career-page",
      postedAt: null,
      description: `Listed on ${page.url}`,
      tags: ["career-page"],
    });
  }
  return jobs;
}

async function fromGreenhouse(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    jobs?: Array<{ title?: string; absolute_url?: string; updated_at?: string; location?: { name?: string } }>;
  };
  return (data.jobs ?? []).map((item) => ({
    id: `greenhouse-${item.absolute_url ?? item.title}`,
    title: item.title || "Untitled role",
    company,
    location: item.location?.name || "",
    remote: /remote/i.test(item.location?.name || ""),
    url: item.absolute_url || "",
    source: "greenhouse" as const,
    postedAt: item.updated_at || null,
    description: "",
    tags: ["greenhouse"],
  }));
}

async function fromLever(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{
    text?: string;
    hostedUrl?: string;
    createdAt?: number;
    categories?: { location?: string };
  }>;
  return (Array.isArray(data) ? data : []).map((item) => ({
    id: `lever-${item.hostedUrl ?? item.text}`,
    title: item.text || "Untitled role",
    company,
    location: item.categories?.location || "",
    remote: /remote/i.test(item.categories?.location || ""),
    url: item.hostedUrl || "",
    source: "lever" as const,
    postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    description: "",
    tags: ["lever"],
  }));
}

function uniqueJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const job of jobs) {
    if (!job.url || !job.title) continue;
    const key = `${job.title.toLowerCase()}|${job.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

export async function crawlFirmCareers(firm: DiscoveredFirm): Promise<{
  pagesChecked: string[];
  careerPages: string[];
  jobs: Job[];
}> {
  const origin = new URL(firm.website).origin;
  const seed = [origin, ...CAREER_PATHS.map((path) => `${origin}${path}`)];
  const homepage = await fetchPage(origin);
  const extra = homepage ? findCareerLinks(homepage) : [];
  const toFetch = [...new Set([...seed, ...extra])].slice(0, 10);

  const pages = (await Promise.all(toFetch.map((url) => fetchPage(url)))).filter(
    (page): page is Page => Boolean(page)
  );
  const pagesChecked = pages.map((page) => page.url);
  const careerPages = pages
    .filter((page) => CAREER_HINT.test(page.url) || CAREER_HINT.test(page.html.slice(0, 4000)))
    .map((page) => page.url);

  const jobs: Job[] = [];
  const atsSeen = new Set<string>();
  for (const page of pages) {
    jobs.push(...fromJsonLd(page, firm.name));
    jobs.push(...fromJobLinks(page, firm.name));
    for (const ats of detectAts(page.html, page.url)) {
      const key = `${ats.source}:${ats.slug}`;
      if (atsSeen.has(key)) continue;
      atsSeen.add(key);
      if (ats.source === "greenhouse") jobs.push(...(await fromGreenhouse(ats.slug, firm.name)));
      if (ats.source === "lever") jobs.push(...(await fromLever(ats.slug, firm.name)));
    }
  }

  return {
    pagesChecked,
    careerPages: [...new Set(careerPages)],
    jobs: uniqueJobs(jobs).filter(
      (job) => within30Days(job.postedAt) && job.url && isSeoRole(job)
    ),
  };
}
