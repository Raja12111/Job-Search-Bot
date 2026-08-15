import type { CityRow, DiscoveredFirm } from "@/lib/types";
import { cityLabel } from "@/lib/cities";
import {
  directoryProfileUrls,
  firmsFromDirectoryProfiles,
  searchDirectories,
} from "@/lib/directories";
import { cleanWebsite, isDirectoryHost, nameFromHost } from "@/lib/firm-web";

type SerperPlace = {
  title?: string;
  address?: string;
  website?: string;
  cid?: string;
  placeId?: string;
};

type SerperOrganic = {
  title?: string;
  link?: string;
  snippet?: string;
};

function addFirm(map: Map<string, DiscoveredFirm>, firm: DiscoveredFirm): void {
  const website = cleanWebsite(firm.website);
  if (!website) return;
  const existing = map.get(website);
  if (existing) {
    if (!existing.address && firm.address) existing.address = firm.address;
    if (!existing.mapsUrl && firm.mapsUrl) existing.mapsUrl = firm.mapsUrl;
    if (!existing.foundVia && firm.foundVia) existing.foundVia = firm.foundVia;
    return;
  }
  map.set(website, { ...firm, website });
}

function looksLikeAgency(title: string, snippet = ""): boolean {
  const blob = `${title} ${snippet}`.toLowerCase();
  return /seo|search engine|digital marketing|marketing agency|seo agency|seo company|seo firm/.test(
    blob
  );
}

async function searchSerperMaps(city: CityRow): Promise<DiscoveredFirm[]> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return [];
  const place = cityLabel(city);
  const queries = [`SEO agency ${place}`, `SEO company ${place}`, `SEO firms ${place}`];
  const endpoints = ["https://google.serper.dev/maps", "https://google.serper.dev/places"];
  const out: DiscoveredFirm[] = [];

  await Promise.all(
    queries.map(async (query) => {
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-KEY": key,
            },
            body: JSON.stringify({
              q: query,
              location: place,
              gl: city.country === "gb" ? "uk" : "us",
              hl: "en",
              num: 20,
            }),
            cache: "no-store",
            signal: AbortSignal.timeout(9000),
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
              foundVia: "maps",
            });
          }
          if (places.length > 0) break;
        } catch {
          // try next endpoint
        }
      }
    })
  );
  return out;
}

async function searchGooglePlaces(city: CityRow): Promise<DiscoveredFirm[]> {
  const key =
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return [];
  const place = cityLabel(city);
  const queries = [`SEO agency ${place}`, `SEO company ${place}`, `SEO firms ${place}`];
  const out: DiscoveredFirm[] = [];

  await Promise.all(
    queries.map(async (textQuery) => {
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
            textQuery,
            languageCode: "en",
            regionCode: city.country === "gb" ? "GB" : "US",
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(9000),
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          places?: Array<{
            displayName?: { text?: string };
            websiteUri?: string;
            formattedAddress?: string;
            googleMapsUri?: string;
          }>;
        };
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
            foundVia: "places",
          });
        }
      } catch {
        // ignore
      }
    })
  );
  return out;
}

async function searchSerperWeb(city: CityRow): Promise<{
  firms: DiscoveredFirm[];
  profiles: string[];
}> {
  const key = process.env.SERPER_API_KEY?.trim();
  if (!key) return { firms: [], profiles: [] };
  const place = cityLabel(city);
  const queries = [
    `SEO agency ${place}`,
    `SEO company ${place}`,
    `SEO firms near ${place}`,
    `site:clutch.co SEO ${place}`,
    `site:yelp.com SEO agency ${place}`,
    `site:designrush.com SEO ${place}`,
    `site:sortlist.com SEO ${place}`,
    `site:semrush.com/agencies SEO ${place}`,
  ];

  const firms: DiscoveredFirm[] = [];
  const profiles: string[] = [];

  await Promise.all(
    queries.map(async (q) => {
      try {
        const response = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-KEY": key,
          },
          body: JSON.stringify({
            q,
            location: place,
            gl: city.country === "gb" ? "uk" : "us",
            hl: "en",
            num: 20,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(9000),
        });
        if (!response.ok) return;
        const data = (await response.json()) as { organic?: SerperOrganic[] };
        for (const item of data.organic ?? []) {
          const link = item.link?.trim() ?? "";
          if (!link) continue;
          if (directoryProfileUrls(link) || isDirectoryHost(link)) {
            if (directoryProfileUrls(link)) profiles.push(link);
            continue;
          }
          if (!looksLikeAgency(item.title ?? "", item.snippet ?? "")) continue;
          const website = cleanWebsite(link);
          if (!website) continue;
          firms.push({
            name: item.title?.trim() || nameFromHost(website),
            website,
            city: city.city,
            country: city.country,
            foundVia: "web",
          });
        }
      } catch {
        // ignore
      }
    })
  );

  return { firms, profiles };
}

export async function discoverFirms(city: CityRow, limit = 50): Promise<DiscoveredFirm[]> {
  const byWebsite = new Map<string, DiscoveredFirm>();

  const [fromMaps, fromPlaces, fromWeb, fromDirectories] = await Promise.all([
    searchSerperMaps(city),
    searchGooglePlaces(city),
    searchSerperWeb(city),
    searchDirectories(city),
  ]);

  for (const firm of fromMaps) addFirm(byWebsite, firm);
  for (const firm of fromPlaces) addFirm(byWebsite, firm);
  for (const firm of fromWeb.firms) addFirm(byWebsite, firm);
  for (const firm of fromDirectories) addFirm(byWebsite, firm);

  if (byWebsite.size < 20 && fromWeb.profiles.length > 0) {
    const extra = await firmsFromDirectoryProfiles(city, fromWeb.profiles);
    for (const firm of extra) addFirm(byWebsite, firm);
  }

  return interleaveBySource([...byWebsite.values()], limit);
}

function interleaveBySource(firms: DiscoveredFirm[], limit: number): DiscoveredFirm[] {
  const buckets = new Map<string, DiscoveredFirm[]>();
  for (const firm of firms) {
    const key = firm.foundVia || "other";
    const list = buckets.get(key) ?? [];
    list.push(firm);
    buckets.set(key, list);
  }
  const out: DiscoveredFirm[] = [];
  const seen = new Set<string>();
  let added = true;
  while (out.length < limit && added) {
    added = false;
    for (const list of buckets.values()) {
      while (list.length > 0) {
        const firm = list.shift();
        if (!firm || seen.has(firm.website)) continue;
        seen.add(firm.website);
        out.push(firm);
        added = true;
        break;
      }
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function mapsSearchConfigured(): boolean {
  return Boolean(
    process.env.SERPER_API_KEY?.trim() ||
      process.env.GOOGLE_PLACES_API_KEY?.trim() ||
      process.env.GOOGLE_MAPS_API_KEY?.trim()
  );
}
