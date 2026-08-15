import type { CityRow, DiscoveredFirm } from "@/lib/types";
import { cityLabel } from "@/lib/cities";

const USER_AGENT =
  "JobSearchBot/1.0 (+https://github.com/Raja12111/Job-Search-Bot)";

const SKIP_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "yelp.com",
  "indeed.com",
  "glassdoor.com",
  "wikipedia.org",
  "reddit.com",
  "crunchbase.com",
  "maps.google.",
  "google.com",
  "bing.com",
  "duckduckgo.com",
  "clutch.co",
  "sortlist.com",
  "designrush.com",
  "upwork.com",
  "fiverr.com",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function keepWebsite(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return !SKIP_HOSTS.some((skip) => host.includes(skip));
}

function unwrapDuckDuckGo(href: string): string {
  try {
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg") || url.searchParams.get("u");
    return target ? decodeURIComponent(target) : url.href;
  } catch {
    return href;
  }
}

function nameFromHost(url: string): string {
  const host = hostOf(url);
  const base = host.split(".")[0] ?? host;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

async function searchDuckDuckGo(query: string): Promise<string[]> {
  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const response = await fetch(url.toString(), {
    headers: { Accept: "text/html", "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!response.ok) return [];
  const html = await response.text();
  const hrefs = [...html.matchAll(/href="([^"]+)"/gi)].map((match) => match[1] ?? "");
  const out: string[] = [];
  for (const href of hrefs) {
    const raw = href.startsWith("//") ? `https:${href}` : href;
    const next = unwrapDuckDuckGo(raw);
    if (!next.startsWith("http")) continue;
    if (!keepWebsite(next)) continue;
    const clean = `${new URL(next).origin}/`;
    if (!out.includes(clean)) out.push(clean);
  }
  return out.slice(0, 12);
}

async function searchSerper(query: string): Promise<string[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": key,
    },
    body: JSON.stringify({ q: query, num: 10 }),
    cache: "no-store",
  });
  if (!response.ok) return [];
  const data = (await response.json()) as { organic?: Array<{ link?: string }> };
  const out: string[] = [];
  for (const item of data.organic ?? []) {
    const link = item.link;
    if (!link || !keepWebsite(link)) continue;
    const clean = `${new URL(link).origin}/`;
    if (!out.includes(clean)) out.push(clean);
  }
  return out;
}

export async function discoverFirms(city: CityRow, limit = 8): Promise<DiscoveredFirm[]> {
  const place = cityLabel(city);
  const queries = [`SEO agency ${place}`, `SEO company ${place}`];
  const websites: string[] = [];
  for (const query of queries) {
    const serper = await searchSerper(query);
    const ddg = serper.length > 0 ? [] : await searchDuckDuckGo(query);
    for (const site of [...serper, ...ddg]) {
      if (!websites.includes(site)) websites.push(site);
    }
  }

  return websites.slice(0, limit).map((website) => ({
    name: nameFromHost(website),
    website,
    city: city.city,
    country: city.country,
  }));
}
