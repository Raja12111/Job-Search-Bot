import type { DiscoveredFirm, Job, JobSource } from "@/lib/types";
import { isSeoRole } from "@/lib/jobs";
import { decodeHtml, fetchHtml, USER_AGENT } from "@/lib/firm-web";

const CAREER_PATHS = ["/careers", "/jobs", "/join-us", "/join", "/work-with-us"];

const CAREER_HINT =
  /career|jobs?|join[- ]us|join our team|we.?re hiring|open[- ]?(position|role|ing)|vacanc|opportunit|work with us|current opening|now hiring/i;

const JOB_ROLE_HINT =
  /\b(specialist|manager|strategist|analyst|consultant|director|lead|intern|coordinator|writer|copywriter|builder|associate|executive|producer|optimizer|optimiser|account|recruiter|partner|engineer|developer)\b/i;

function isLikelyJobListing(title: string, url: string): boolean {
  const t = title.toLowerCase();
  const u = url.toLowerCase();
  if (
    /\/(services?|news|blog|category|insights|resources|case-stud|portfolio|law-firm-marketing)\//.test(
      u
    )
  ) {
    return false;
  }
  if (
    /(best seo|seo compan(?:y|ies)|seo services|seo agenc|seo bureau|marketing services|seo marketing services)/i.test(
      t
    )
  ) {
    return false;
  }
  const applyUrl =
    /applytojob|greenhouse|lever\.co|ashbyhq|workable|recruitee|breezy|smartrecruiters|\/careers?\/?|\/jobs?\/|\/apply\/|\/join-us|\/open-role/.test(
      u
    );
  if (applyUrl) return JOB_ROLE_HINT.test(t) || /\b(seo|hiring|job opening)\b/i.test(t);
  return JOB_ROLE_HINT.test(t);
}

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

async function fetchPage(url: string): Promise<Page | null> {
  const html = await fetchHtml(url, 8000);
  if (!html) return null;
  return { url, html };
}

function findCareerLinks(page: Page): string[] {
  const links = new Set<string>();
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    const text = decodeHtml(match[2] ?? "");
    const abs = absUrl(href, page.url);
    if (!abs) continue;
    const board =
      /applytojob|greenhouse\.io|lever\.co|ashbyhq|workable\.com|recruitee\.com|breezy\.hr|smartrecruiters/i.test(
        abs
      );
    if (board || CAREER_HINT.test(href) || CAREER_HINT.test(text)) {
      links.add((abs.split("?")[0] ?? abs).replace(/\/$/, ""));
    }
  }
  return [...links].slice(0, 20);
}

function detectAts(html: string, pageUrl: string): Array<{ source: JobSource; slug: string }> {
  const blob = `${html} ${pageUrl}`;
  const found: Array<{ source: JobSource; slug: string }> = [];
  const greenhouse = blob.match(
    /boards(?:-api)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9-]+)/i
  );
  if (greenhouse?.[1]) found.push({ source: "greenhouse", slug: greenhouse[1] });
  const lever = blob.match(/jobs\.lever\.co\/([a-z0-9-]+)/i);
  if (lever?.[1]) found.push({ source: "lever", slug: lever[1] });
  const ashby = blob.match(/jobs\.ashbyhq\.com\/([a-z0-9-]+)/i);
  if (ashby?.[1]) found.push({ source: "ashby", slug: ashby[1] });
  const workable = blob.match(/apply\.workable\.com\/([a-z0-9-]+)/i);
  if (workable?.[1]) found.push({ source: "workable", slug: workable[1] });
  const recruitee = blob.match(/([a-z0-9-]+)\.recruitee\.com/i);
  if (recruitee?.[1]) found.push({ source: "career-page", slug: `recruitee:${recruitee[1]}` });
  const breezy = blob.match(/([a-z0-9-]+)\.breezy\.hr/i);
  if (breezy?.[1]) found.push({ source: "career-page", slug: `breezy:${breezy[1]}` });
  const smart = blob.match(/jobs\.smartrecruiters\.com\/([a-z0-9-]+)/i);
  if (smart?.[1]) found.push({ source: "career-page", slug: `smart:${smart[1]}` });
  return found;
}

function within30Days(value: string | null): boolean {
  if (!value) return true;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return true;
  return Date.now() - time <= THIRTY_DAYS_MS;
}

function job(
  source: JobSource,
  company: string,
  title: string,
  url: string,
  extra?: Partial<Job>
): Job {
  return {
    id: `${source}-${url}-${title}`,
    title: title.trim(),
    company,
    location: extra?.location ?? "",
    remote: extra?.remote ?? /remote/i.test(title),
    url,
    source,
    postedAt: extra?.postedAt ?? null,
    description: extra?.description ?? "",
    tags: extra?.tags ?? [source],
  };
}

function fromJsonLd(page: Page, company: string): Job[] {
  const jobs: Job[] = [];
  const blocks = [
    ...page.html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ];
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
        jobs.push(
          job("career-page", company, title, url, {
            postedAt,
            location: String(
              (item.jobLocation as { address?: { addressLocality?: string } } | undefined)?.address
                ?.addressLocality ?? ""
            ),
            remote: /remote/i.test(String(item.jobLocationType ?? "")),
            description: decodeHtml(String(item.description ?? "")).slice(0, 400),
            tags: ["career-page"],
          })
        );
      }
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return jobs;
}

function fromEmbeddedJson(page: Page, company: string): Job[] {
  const jobs: Job[] = [];
  for (const match of page.html.matchAll(
    /\{[^{}]{0,400}"(?:title|jobTitle|name)"\s*:\s*"([^"]{6,90})"[^{}]{0,400}"(?:url|absolute_url|hostedUrl|applyUrl)"\s*:\s*"(https?:[^"]+)"[^{}]{0,200}\}/gi
  )) {
    const title = match[1] ?? "";
    const url = match[2] ?? "";
    if (isLikelyJobListing(title, url)) {
      jobs.push(job("career-page", company, title, url, { description: `Listed on ${page.url}` }));
    }
  }
  return jobs;
}

function fromJobLinks(page: Page, company: string): Job[] {
  const jobs: Job[] = [];
  const onCareerPage = CAREER_HINT.test(page.url) || CAREER_HINT.test(page.html.slice(0, 5000));
  for (const match of page.html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = match[1] ?? "";
    const title = decodeHtml(match[2] ?? "");
    const abs = absUrl(href, page.url);
    if (!abs || title.length < 4 || title.length > 100) continue;
    if (/view all|see all|learn more|read more|privacy|login|apply now|click here/i.test(title)) {
      continue;
    }
    const jobLikeUrl =
      /(\/jobs?\/|\/careers?\/|\/position|\/vacanc|\/open-role|\/opening|\/join|greenhouse|lever\.co|ashbyhq|workable|recruitee|breezy)/i.test(
        abs
      );
    if (!isLikelyJobListing(title, abs) && !(onCareerPage && JOB_ROLE_HINT.test(title))) continue;
    if (!isLikelyJobListing(title, abs)) continue;
    jobs.push(
      job("career-page", company, title, abs, {
        description: `Listed on ${page.url}`,
        tags: ["career-page"],
      })
    );
  }
  return jobs;
}

function fromHeadings(page: Page, company: string): Job[] {
  if (!CAREER_HINT.test(page.url) && !CAREER_HINT.test(page.html.slice(0, 4000))) return [];
  const jobs: Job[] = [];
  for (const match of page.html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi)) {
    const title = decodeHtml(match[1] ?? "");
    if (title.length < 6 || title.length > 90) continue;
    if (!isLikelyJobListing(title, page.url) && !JOB_ROLE_HINT.test(title)) continue;
    if (/about us|our team|why join|benefits|open positions|current openings/i.test(title)) continue;
    jobs.push(
      job("career-page", company, title, page.url, {
        description: `Listed on ${page.url}`,
        tags: ["career-page"],
      })
    );
  }
  return jobs;
}

async function fromGreenhouse(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    jobs?: Array<{ title?: string; absolute_url?: string; updated_at?: string; location?: { name?: string } }>;
  };
  return (data.jobs ?? []).map((item) =>
    job("greenhouse", company, item.title || "Untitled role", item.absolute_url || "", {
      location: item.location?.name || "",
      remote: /remote/i.test(item.location?.name || ""),
      postedAt: item.updated_at || null,
      tags: ["greenhouse"],
    })
  );
}

async function fromLever(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{
    text?: string;
    hostedUrl?: string;
    createdAt?: number;
    categories?: { location?: string };
  }>;
  return (Array.isArray(data) ? data : []).map((item) =>
    job("lever", company, item.text || "Untitled role", item.hostedUrl || "", {
      location: item.categories?.location || "",
      remote: /remote/i.test(item.categories?.location || ""),
      postedAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      tags: ["lever"],
    })
  );
}

async function fromAshby(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    jobs?: Array<{ title?: string; jobUrl?: string; location?: string; publishedAt?: string }>;
  };
  return (data.jobs ?? []).map((item) =>
    job("ashby", company, item.title || "Untitled role", item.jobUrl || "", {
      location: item.location || "",
      remote: /remote/i.test(item.location || ""),
      postedAt: item.publishedAt || null,
      tags: ["ashby"],
    })
  );
}

async function fromWorkable(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    jobs?: Array<{ title?: string; url?: string; location?: string; created_at?: string }>;
  };
  return (data.jobs ?? []).map((item) =>
    job("workable", company, item.title || "Untitled role", item.url || "", {
      location: item.location || "",
      remote: /remote/i.test(item.location || ""),
      postedAt: item.created_at || null,
      tags: ["workable"],
    })
  );
}

async function fromRecruitee(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://${slug}.recruitee.com/api/offers`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    offers?: Array<{ title?: string; careers_url?: string; location?: string; published_at?: string }>;
  };
  return (data.offers ?? []).map((item) =>
    job("career-page", company, item.title || "Untitled role", item.careers_url || "", {
      location: item.location || "",
      postedAt: item.published_at || null,
      tags: ["recruitee"],
    })
  );
}

async function fromBreezy(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(`https://${slug}.breezy.hr/json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return [];
  const data = (await response.json()) as Array<{
    name?: string;
    url?: string;
    location?: { name?: string };
    published_date?: string;
  }>;
  return (Array.isArray(data) ? data : []).map((item) =>
    job("career-page", company, item.name || "Untitled role", item.url || "", {
      location: item.location?.name || "",
      postedAt: item.published_date || null,
      tags: ["breezy"],
    })
  );
}

async function fromSmartRecruiters(slug: string, company: string): Promise<Job[]> {
  const response = await fetch(
    `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
    {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!response.ok) return [];
  const data = (await response.json()) as {
    content?: Array<{
      name?: string;
      ref?: string;
      location?: { city?: string };
      releasedDate?: string;
    }>;
  };
  return (data.content ?? []).map((item) =>
    job("career-page", company, item.name || "Untitled role", item.ref || "", {
      location: item.location?.city || "",
      postedAt: item.releasedDate || null,
      tags: ["smartrecruiters"],
    })
  );
}

async function fromWordpress(origin: string, company: string): Promise<Job[]> {
  const endpoints = [
    `${origin}/wp-json/wp/v2/job-listings?per_page=20`,
    `${origin}/wp-json/wp/v2/jobs?per_page=20`,
    `${origin}/wp-json/wp/v2/job?per_page=20`,
  ];
  const jobs: Job[] = [];
  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as Array<{
        title?: { rendered?: string } | string;
        link?: string;
        date?: string;
        excerpt?: { rendered?: string };
      }>;
      if (!Array.isArray(data)) continue;
      for (const item of data) {
        const title =
          typeof item.title === "string" ? item.title : item.title?.rendered || "";
        if (!title || !item.link) continue;
        jobs.push(
          job("career-page", company, decodeHtml(title), item.link, {
            postedAt: item.date || null,
            description: decodeHtml(item.excerpt?.rendered || "").slice(0, 400),
            tags: ["wordpress"],
          })
        );
      }
      if (jobs.length > 0) break;
    } catch {
      // try next
    }
  }
  return jobs;
}

async function fromAts(source: JobSource, slug: string, company: string): Promise<Job[]> {
  if (slug.startsWith("recruitee:")) return fromRecruitee(slug.slice(10), company);
  if (slug.startsWith("breezy:")) return fromBreezy(slug.slice(7), company);
  if (slug.startsWith("smart:")) return fromSmartRecruiters(slug.slice(6), company);
  if (source === "greenhouse") return fromGreenhouse(slug, company);
  if (source === "lever") return fromLever(slug, company);
  if (source === "ashby") return fromAshby(slug, company);
  if (source === "workable") return fromWorkable(slug, company);
  return [];
}

function uniqueJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const out: Job[] = [];
  for (const jobItem of jobs) {
    if (!jobItem.url || !jobItem.title) continue;
    const key = `${jobItem.title.toLowerCase()}|${jobItem.url.replace(/\/$/, "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(jobItem);
  }
  return out;
}

function pickSeoJobs(jobs: Job[]): Job[] {
  return uniqueJobs(jobs).filter((item) => {
    if (!item.url || !within30Days(item.postedAt) || !isSeoRole(item)) return false;
    if (["greenhouse", "lever", "ashby", "workable"].includes(item.source)) return true;
    return isLikelyJobListing(item.title, item.url);
  });
}

export async function crawlFirmCareers(firm: DiscoveredFirm): Promise<{
  pagesChecked: string[];
  careerPages: string[];
  jobs: Job[];
}> {
  const origin = new URL(firm.website).origin;
  const homepage = await fetchPage(origin);
  const extra = homepage ? findCareerLinks(homepage) : [];
  const guessed = CAREER_PATHS.map((path) => `${origin}${path}`);
  const toFetch = [...new Set([...extra, ...guessed])].slice(0, 5);

  const pages = [homepage, ...(await Promise.all(toFetch.map((url) => fetchPage(url))))].filter(
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
    jobs.push(...fromEmbeddedJson(page, firm.name));
    jobs.push(...fromJobLinks(page, firm.name));
    jobs.push(...fromHeadings(page, firm.name));
    for (const ats of detectAts(page.html, page.url)) {
      const key = `${ats.source}:${ats.slug}`;
      if (atsSeen.has(key)) continue;
      atsSeen.add(key);
      try {
        jobs.push(...(await fromAts(ats.source, ats.slug, firm.name)));
      } catch {
        // skip a blocked ATS board
      }
    }
  }

  let seoJobs = pickSeoJobs(jobs);
  if (seoJobs.length === 0) {
    jobs.push(...(await fromWordpress(origin, firm.name)));
    seoJobs = pickSeoJobs(jobs);
  }

  return {
    pagesChecked,
    careerPages: [...new Set(careerPages)],
    jobs: seoJobs,
  };
}
