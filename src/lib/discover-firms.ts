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
  if (!host || !host.includes(".")) return false;
  return !SKIP_HOSTS.some((skip) => host.includes(skip));
}

function cleanWebsite(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const origin = `${new URL(withProtocol).origin}/`;
    return keepWebsite(origin) ? origin : null;
  } catch {
    return null;
  }
}

function nameFromHost(url: string): string {
  const host = hostOf(url);
  const base = host.split(".")[0] ?? host;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function addFirm(map: Map<string, DiscoveredFirm>, firm: DiscoveredFirm): void {
  const website = cleanWebsite(firm.website);
  if (!website) return;
  if (map.has(website)) return;
  map.set(website, { ...firm, website });
}

type SerperPlace = {
  title?: string;
  address?: string;
  website?: string;
  cid?: string;
  placeId?: string;
};

async function searchSerperMaps(city: CityRow): Promise<DiscoveredFirm[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  const place = cityLabel(city);
  const body = {
    q: `SEO ${place}`,
    location: place,
    gl: city.country === "gb" ? "uk" : "us",
    hl: "en",
    num: 20,
  };

  const endpoints = ["https://google.serper.dev/maps", "https://google.serper.dev/places"];
  const out: DiscoveredFirm[] = [];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-KEY": key,
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        places?: SerperPlace[];
        localPlaces?: SerperPlace[];
      };
      const places = data.places ?? data.localPlaces ?? [];
      for (const item of places) {
        const website = item.website ? cleanWebsite(item.website) : null;
        if (!website) continue;
        out.push({
          name: item.title?.trim() || nameFromHost(website),
          website,
          city: city.city,
          country: city.country,
          address: item.address,
          mapsUrl: item.placeId
            ? `https://www.google.com/maps/place/?q=place_id:${item.placeId}`
            : undefined,
        });
      }
      if (out.length > 0) break;
    } catch {
      // try next endpoint
    }
  }
  return out;
}

async function searchGooglePlaces(city: CityRow): Promise<DiscoveredFirm[]> {
  const key =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return [];
  const place = cityLabel(city);
  try {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.displayName,places.websiteUri,places.formattedAddress,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery: `SEO ${place}`,
        languageCode: "en",
        regionCode: city.country === "gb" ? "GB" : "US",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      places?: Array<{
        displayName?: { text?: string };
        websiteUri?: string;
        formattedAddress?: string;
        googleMapsUri?: string;
      }>;
    };
    const out: DiscoveredFirm[] = [];
    for (const item of data.places ?? []) {
      const website = item.websiteUri ? cleanWebsite(item.websiteUri) : null;
      if (!website) continue;
      out.push({
        name: item.displayName?.text?.trim() || nameFromHost(website),
        website,
        city: city.city,
        country: city.country,
        address: item.formattedAddress,
        mapsUrl: item.googleMapsUri,
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function searchClearbit(query: string, city: CityRow): Promise<DiscoveredFirm[]> {
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
      const website = item.domain ? cleanWebsite(item.domain) : null;
      if (!website) continue;
      const name = item.name?.trim() || nameFromHost(website);
      const blob = `${name} ${item.domain}`.toLowerCase();
      if (!blob.includes("seo") && !blob.includes("search")) continue;
      out.push({
        name,
        website,
        city: city.city,
        country: city.country,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function discoverFirms(city: CityRow, limit = 12): Promise<DiscoveredFirm[]> {
  const place = cityLabel(city);
  const byWebsite = new Map<string, DiscoveredFirm>();

  const fromMaps = await searchSerperMaps(city);
  for (const firm of fromMaps) addFirm(byWebsite, firm);

  if (byWebsite.size < 5) {
    const fromPlaces = await searchGooglePlaces(city);
    for (const firm of fromPlaces) addFirm(byWebsite, firm);
  }

  if (byWebsite.size < 3) {
    const fallback = await searchClearbit(`SEO ${place}`, city);
    for (const firm of fallback) addFirm(byWebsite, firm);
  }

  return [...byWebsite.values()].slice(0, limit);
}

export function mapsSearchConfigured(): boolean {
  return Boolean(
    process.env.SERPER_API_KEY?.trim() ||
      process.env.GOOGLE_PLACES_API_KEY?.trim() ||
      process.env.GOOGLE_MAPS_API_KEY?.trim()
  );
}
