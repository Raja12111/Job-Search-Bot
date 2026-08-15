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
  "microsoft.com",
  "duckduckgo.com",
  "clutch.co",
  "sortlist.com",
  "designrush.com",
  "upwork.com",
  "fiverr.com",
  "mozilla.org",
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
  if (!host || !host.includes(".")) return false;
  return !SKIP_HOSTS.some((skip) => host.includes(skip));
}

function nameFromHost(url: string): string {
  const host = hostOf(url);
  const base = host.split(".")[0] ?? host;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function looksLikeSeoFirm(name: string, domain: string, city: string): boolean {
  const blob = `${name} ${domain}`.toLowerCase();
  const cityPart = city.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    blob.includes("seo") ||
    blob.includes("search engine") ||
    (cityPart.length > 3 && blob.includes(cityPart))
  );
}

async function searchClearbit(query: string, city: string): Promise<DiscoveredFirm[]> {
  const url = new URL("https://autocomplete.clearbit.com/v1/companies/suggest");
  url.searchParams.set("query", query);
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as Array<{ name?: string; domain?: string }>;
    const out: DiscoveredFirm[] = [];
    for (const item of data) {
      const domain = item.domain?.trim();
      if (!domain) continue;
      const website = `https://${domain.replace(/^https?:\/\//, "")}/`;
      if (!keepWebsite(website)) continue;
      const name = item.name?.trim() || nameFromHost(website);
      if (!looksLikeSeoFirm(name, domain, city)) continue;
      out.push({ name, website, city, country: "us" });
    }
    return out;
  } catch {
    return [];
  }
}

async function searchBing(query: string): Promise<string[]> {
  try {
    const url = new URL("https://www.bing.com/search");
    url.searchParams.set("q", query);
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const html = await response.text();
    const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/gi)].map((m) => m[1] ?? "");
    const out: string[] = [];
    for (const href of hrefs) {
      if (!keepWebsite(href)) continue;
      const clean = `${new URL(href).origin}/`;
      if (!out.includes(clean)) out.push(clean);
    }
    return out.slice(0, 12);
  } catch {
    return [];
  }
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
  const queries = [
    `${city.city} SEO`,
    `SEO agency ${place}`,
    `SEO company ${place}`,
  ];

  const byWebsite = new Map<string, DiscoveredFirm>();

  for (const query of queries) {
    const fromClearbit = await searchClearbit(query, city.city);
    for (const firm of fromClearbit) {
      firm.country = city.country;
      firm.city = city.city;
      if (!byWebsite.has(firm.website)) byWebsite.set(firm.website, firm);
    }
  }

  if (byWebsite.size < 3) {
    for (const query of queries.slice(0, 2)) {
      const serper = await searchSerper(query);
      const bing = serper.length > 0 ? [] : await searchBing(query);
      for (const website of [...serper, ...bing]) {
        if (byWebsite.has(website)) continue;
        const name = nameFromHost(website);
        if (!looksLikeSeoFirm(name, hostOf(website), city.city)) continue;
        byWebsite.set(website, {
          name,
          website,
          city: city.city,
          country: city.country,
        });
      }
    }
  }

  return [...byWebsite.values()].slice(0, limit);
}
