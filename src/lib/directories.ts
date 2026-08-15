import type { CityRow, DiscoveredFirm } from "@/lib/types";
import { cityLabel } from "@/lib/cities";
import {
  cleanWebsite,
  decodeHtml,
  fetchHtml,
  hostOf,
  isDirectoryHost,
  mapPool,
  nameFromHost,
} from "@/lib/firm-web";

const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function stateCode(city: CityRow): string {
  return city.state.replace(/[^a-z]/gi, "").toUpperCase();
}

function stateName(city: CityRow): string {
  return US_STATE_NAMES[stateCode(city)] || city.state;
}

function firmFrom(city: CityRow, name: string, website: string, foundVia: string): DiscoveredFirm | null {
  const cleaned = cleanWebsite(website);
  if (!cleaned) return null;
  return {
    name: name.trim() || nameFromHost(cleaned),
    website: cleaned,
    city: city.city,
    country: city.country,
    foundVia,
  };
}

function absUrl(href: string, base: string): string | null {
  try {
    const url = new URL(href.replace(/&amp;/g, "&"), base);
    if (!/^https?:$/.test(url.protocol) && url.protocol !== "") return null;
    if (url.protocol === "") url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function decodeBingUrl(href: string): string {
  const raw = href.replace(/&amp;/g, "&");
  const match = raw.match(/[?&]u=a1([^&]+)/i);
  if (!match?.[1]) return raw;
  try {
    const b64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return raw;
  }
}

function decodeDdgUrl(href: string): string {
  const raw = href.replace(/&amp;/g, "&");
  const match = raw.match(/[?&]uddg=([^&]+)/i);
  if (!match?.[1]) return raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return raw;
  }
}

export function isAgencyListPage(url: string): boolean {
  const host = hostOf(url);
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (
    /expertise\.com|goodfirms\.co|topdevelopers\.co|designrush\.com|sortlist\.com|clutch\.co|semrush\.com|yellowpages\.com|yell\.com|yelp\.|seo\.com/.test(
      host
    )
  ) {
    return /seo|agenc|compan|firm|directory|profile|biz|mip/.test(`${host} ${path} ${url}`);
  }
  return /seo[- ]?(agenc|compan|firm)|best[- ]seo|top[- ]seo|\/companies\/|seo-by-city/.test(
    `${path} ${url}`
  );
}

function knownListUrls(city: CityRow): string[] {
  const citySlug = slug(city.city);
  const stateSlug = slug(stateName(city));
  const code = stateCode(city).toLowerCase();
  const urls = [
    `https://www.seo.com/companies/${citySlug}/`,
    `https://www.topdevelopers.co/directory/seo-companies/${citySlug}`,
    `https://www.goodfirms.co/seo-agencies/${citySlug}`,
    `https://clutch.co/seo-firms/${citySlug}`,
    `https://www.designrush.com/agency/search-engine-optimization/${stateSlug}/${citySlug}`,
    `https://www.sortlist.com/s/seo/${citySlug}`,
    city.country === "gb"
      ? `https://www.yell.com/ucs/UcsSearchAction.do?keywords=SEO+agency&location=${encodeURIComponent(city.city)}`
      : `https://www.yellowpages.com/search?search_terms=seo+agency&geo_location_terms=${encodeURIComponent(cityLabel(city))}`,
  ];
  if (city.country === "us" && stateSlug) {
    urls.push(`https://www.expertise.com/business/seo-agencies/${stateSlug}/${citySlug}`);
    urls.push(`https://www.sortlist.com/seo/${citySlug}-${code}-us`);
  } else {
    urls.push(`https://www.sortlist.com/seo/${citySlug}-gb`);
  }
  return urls;
}

function extractFirmsFromListHtml(city: CityRow, pageUrl: string, html: string, foundVia: string): DiscoveredFirm[] {
  const pageHost = hostOf(pageUrl);
  const out: DiscoveredFirm[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const abs = absUrl(match[1] ?? "", pageUrl);
    if (!abs) continue;
    const text = decodeHtml(match[2] ?? "").replace(/https?:\/\/\S+/g, "").trim();
    const website = cleanWebsite(abs);
    if (!website || seen.has(website)) continue;
    if (hostOf(website) === pageHost) continue;
    if (isDirectoryHost(website)) continue;
    seen.add(website);
    if (
      /privacy|login|sign up|read more|learn more|view all|cookie|subscribe|schedule a call|advertising|investor|accessibility|ranking factor/i.test(
        text
      )
    ) {
      continue;
    }
    const label =
      text &&
      text.length >= 2 &&
      text.length <= 80 &&
      !/visit website|^website$/i.test(text)
        ? text
        : nameFromHost(website);
    out.push({
      name: label,
      website,
      city: city.city,
      country: city.country,
      foundVia,
    });
  }

  return out.slice(0, 40);
}

async function firmsFromListPage(city: CityRow, url: string, foundVia: string): Promise<DiscoveredFirm[]> {
  const html = await fetchHtml(url, 10000);
  if (!html) return [];
  return extractFirmsFromListHtml(city, url, html, foundVia);
}

function viaForList(url: string): string {
  const host = hostOf(url);
  if (host.includes("yelp.")) return "yelp";
  if (host.includes("clutch.co")) return "clutch";
  if (host.includes("designrush.com")) return "designrush";
  if (host.includes("sortlist.com")) return "sortlist";
  if (host.includes("semrush.com")) return "semrush";
  if (host.includes("expertise.com")) return "expertise";
  if (host.includes("goodfirms.co")) return "goodfirms";
  if (host.includes("topdevelopers.co")) return "topdevelopers";
  if (host.includes("seo.com")) return "seo.com";
  return "directory";
}

async function searchDuckDuckGo(city: CityRow): Promise<{ firms: DiscoveredFirm[]; lists: string[] }> {
  const place = cityLabel(city);
  const queries = [
    `SEO agencies in ${place}`,
    `best SEO companies ${place}`,
    `top SEO firms ${place}`,
    `SEO agency ${place} website`,
  ];
  const firms: DiscoveredFirm[] = [];
  const lists: string[] = [];

  await Promise.all(
    queries.map(async (query) => {
      const html = await fetchHtml(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
        10000
      );
      if (!html) return;
      const links = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      for (const match of links) {
        const url = decodeDdgUrl(match[1] ?? "");
        const title = decodeHtml(match[2] ?? "");
        if (!url) continue;
        if (isAgencyListPage(url) || isDirectoryHost(url)) {
          if (!hostOf(url).includes("yelp.") && !hostOf(url).includes("semrush.com")) {
            lists.push(url);
          }
          continue;
        }
        const firm = firmFrom(city, title, url, "web");
        if (firm) firms.push(firm);
      }
    })
  );

  return { firms, lists };
}

async function searchBing(city: CityRow): Promise<{ firms: DiscoveredFirm[]; lists: string[] }> {
  const place = cityLabel(city);
  const queries = [`SEO agencies in ${place}`, `best SEO companies ${place}`];
  const firms: DiscoveredFirm[] = [];
  const lists: string[] = [];

  await Promise.all(
    queries.map(async (query) => {
      const html = await fetchHtml(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=50`,
        10000
      );
      if (!html) return;
      for (const match of html.matchAll(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
        const url = decodeBingUrl(match[1] ?? "");
        const title = decodeHtml(match[2] ?? "");
        if (!url || hostOf(url).includes("bing.com")) continue;
        if (isAgencyListPage(url) || isDirectoryHost(url)) {
          if (!hostOf(url).includes("yelp.") && !hostOf(url).includes("semrush.com")) {
            lists.push(url);
          }
          continue;
        }
        if (/what is seo|beginner|complete guide|starter guide|best practices/i.test(title)) continue;
        if (!new RegExp(city.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(`${title} ${url}`)) {
          continue;
        }
        const firm = firmFrom(city, title, url, "bing");
        if (firm) firms.push(firm);
      }
    })
  );

  return { firms, lists };
}

export async function searchDirectories(city: CityRow): Promise<DiscoveredFirm[]> {
  const [ddg, bing] = await Promise.all([searchDuckDuckGo(city), searchBing(city)]);
  const listUrls = [...new Set([...knownListUrls(city), ...ddg.lists, ...bing.lists])].slice(0, 18);
  const fromLists = await mapPool(listUrls, 6, (url) => firmsFromListPage(city, url, viaForList(url)));
  return [...fromLists.flat(), ...ddg.firms, ...bing.firms];
}

export function directoryProfileUrls(url: string): boolean {
  return isAgencyListPage(url) || isDirectoryHost(url);
}

export async function firmsFromDirectoryProfiles(
  city: CityRow,
  urls: string[]
): Promise<DiscoveredFirm[]> {
  const unique = [...new Set(urls)].slice(0, 16);
  const batches = await mapPool(unique, 5, (url) => firmsFromListPage(city, url, viaForList(url)));
  return batches.flat();
}
