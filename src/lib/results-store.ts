import { hostOf } from "@/lib/firm-web";
import type { CrawlResultRow } from "@/lib/types";

export const RESULTS_STORAGE_KEY = "job-search-bot-results";
export const ARCHIVE_STORAGE_KEY = "job-search-bot-archive";
export const CRAWLED_HOSTS_KEY = "job-search-bot-crawled-hosts";

export function cityKey(row: Pick<CrawlResultRow, "country" | "city" | "state">): string {
  return `${row.country}|${row.city.trim().toLowerCase()}|${(row.state ?? "").trim().toLowerCase()}`;
}

function rowKey(row: CrawlResultRow): string {
  return `${cityKey(row)}|${(row.website || row.company).trim().toLowerCase()}`;
}

function readJson(key: string): CrawlResultRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CrawlResultRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadAllResults(): CrawlResultRow[] {
  const archive = readJson(ARCHIVE_STORAGE_KEY);
  if (archive.length > 0) return archive;
  return readJson(RESULTS_STORAGE_KEY);
}

export function loadResults(): CrawlResultRow[] {
  return loadAllResults();
}

export function websiteHost(url: string): string {
  return hostOf(url);
}

export function loadCrawledHosts(): Set<string> {
  const hosts = new Set<string>();
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(CRAWLED_HOSTS_KEY);
      const parsed = raw ? (JSON.parse(raw) as string[]) : [];
      if (Array.isArray(parsed)) {
        for (const host of parsed) {
          if (host) hosts.add(host);
        }
      }
    } catch {
      // ignore bad cache
    }
  }
  for (const row of loadAllResults()) {
    const host = websiteHost(row.website);
    if (host) hosts.add(host);
  }
  return hosts;
}

export function markCrawledHosts(urls: string[]): Set<string> {
  const hosts = loadCrawledHosts();
  for (const url of urls) {
    const host = websiteHost(url);
    if (host) hosts.add(host);
  }
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CRAWLED_HOSTS_KEY, JSON.stringify([...hosts]));
  }
  return hosts;
}

export function alreadyCrawled(url: string, crawled = loadCrawledHosts()): boolean {
  const host = websiteHost(url);
  return Boolean(host && crawled.has(host));
}

export function saveCityResults(rows: CrawlResultRow[]): CrawlResultRow[] {
  if (typeof window === "undefined") return rows;
  const stamped = rows.map((row) => ({
    ...row,
    scannedAt: row.scannedAt || new Date().toISOString(),
  }));
  markCrawledHosts(stamped.map((row) => row.website));
  const existing = loadAllResults();
  const seen = new Set<string>();
  const merged: CrawlResultRow[] = [];
  for (const row of [...stamped, ...existing]) {
    const key = rowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  window.localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(merged));
  window.sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(stamped));
  return merged;
}

export function saveResults(rows: CrawlResultRow[]): void {
  saveCityResults(rows);
}

export function listSavedCities(): Array<{
  key: string;
  label: string;
  count: number;
  openCount: number;
}> {
  const groups = new Map<string, { label: string; count: number; openCount: number }>();
  for (const row of loadAllResults()) {
    const key = cityKey(row);
    const current = groups.get(key) ?? { label: row.locationLabel, count: 0, openCount: 0 };
    current.count += 1;
    if (row.jobOpen) current.openCount += 1;
    groups.set(key, current);
  }
  return [...groups.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function clearAllResults(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ARCHIVE_STORAGE_KEY);
  window.localStorage.removeItem(CRAWLED_HOSTS_KEY);
  window.sessionStorage.removeItem(RESULTS_STORAGE_KEY);
}
