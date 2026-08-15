import type { CrawlResultRow } from "@/lib/types";

export const RESULTS_STORAGE_KEY = "job-search-bot-results";

export function saveResults(rows: CrawlResultRow[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(rows));
}

export function loadResults(): CrawlResultRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CrawlResultRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
