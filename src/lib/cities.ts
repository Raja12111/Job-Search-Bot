import type { CityRow } from "@/lib/types";

function normalizeCountry(value: string): "us" | "gb" | null {
  const v = value.trim().toLowerCase();
  if (["us", "usa", "united states", "united states of america", "u.s.", "u.s.a."].includes(v)) {
    return "us";
  }
  if (["uk", "gb", "united kingdom", "great britain", "england", "scotland", "wales"].includes(v)) {
    return "gb";
  }
  return null;
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

export function parseCityTable(text: string, fallbackCountry?: "us" | "gb"): CityRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const first = splitRow(lines[0] ?? "");
  const headers = first.map((cell) => cell.trim().toLowerCase());
  const hasHeader =
    headers.some((cell) => ["city", "cities", "town", "name"].includes(cell)) ||
    headers.includes("country") ||
    headers.includes("state");

  const cityIdx = hasHeader
    ? Math.max(0, headerIndex(headers, ["city", "cities", "town", "name", "location"]))
    : 0;
  const stateIdx = hasHeader
    ? headerIndex(headers, ["state", "region", "county"])
    : fallbackCountry === "gb"
      ? -1
      : 1;
  const countryIdx = hasHeader ? headerIndex(headers, ["country", "nation"]) : -1;

  const rows = hasHeader ? lines.slice(1) : lines;
  const seen = new Set<string>();
  const out: CityRow[] = [];

  for (const line of rows) {
    const cells = splitRow(line);
    const city = (cells[cityIdx] ?? "").trim();
    if (!city || city.toLowerCase() === "city") continue;
    const state = stateIdx >= 0 ? (cells[stateIdx] ?? "").trim() : "";
    const countryRaw = countryIdx >= 0 ? (cells[countryIdx] ?? "") : "";
    const country = normalizeCountry(countryRaw) ?? fallbackCountry;
    if (!country) continue;
    const key = `${country}|${city.toLowerCase()}|${state.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ city, state, country });
  }

  return out;
}

function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function cityLabel(row: CityRow): string {
  if (row.country === "us" && row.state) return `${row.city}, ${row.state}`;
  return row.city;
}

export function toCsv(rows: Array<Record<string, string>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0] ?? {});
  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key] ?? "")).join(",")),
  ].join("\n");
}
