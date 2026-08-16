import type { CrawlResultRow } from "@/lib/types";

export const RESULTS_STORAGE_KEY = "job-search-bot-results";
export const ARCHIVE_STORAGE_KEY = "job-search-bot-archive";

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

export function saveCityResults(rows: CrawlResultRow[]): CrawlResultRow[] {
  if (typeof window === "undefined") return rows;
  const stamped = rows.map((row) => ({
    ...row,
    scannedAt: row.scannedAt || new Date().toISOString(),
  }));
  const cities = new Set(stamped.map(cityKey));
  const existing = loadAllResults().filter((row) => !cities.has(cityKey(row)));
  const seen = new Set<string>();
  const merged: CrawlResultRow[] = [];
  for (const row of [...existing, ...stamped]) {
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
  window.sessionStorage.removeItem(RESULTS_STORAGE_KEY);
}
