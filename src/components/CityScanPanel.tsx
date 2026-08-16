"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cityLabel, parseCityTable } from "@/lib/cities";
import { saveCityResults } from "@/lib/results-store";
import type { CityRow, CrawlResultRow, DiscoveredFirm, Job } from "@/lib/types";

export function CityScanPanel() {
  const [usText, setUsText] = useState("");
  const [ukText, setUkText] = useState("");
  const [cities, setCities] = useState<CityRow[]>([]);
  const [rows, setRows] = useState<CrawlResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [index, setIndex] = useState(0);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");

  const preview = useMemo(
    () => [
      ...parseCityTable(usText, "us"),
      ...parseCityTable(ukText, "gb"),
    ],
    [usText, ukText]
  );

  async function uploadSheet(
    file: File,
    country: "us" | "gb",
    setter: (value: string) => void
  ) {
    const form = new FormData();
    form.set("file", file);
    form.set("country", country);
    const response = await fetch("/api/parse-sheet", { method: "POST", body: form });
    const data = (await response.json()) as { cities?: CityRow[]; error?: string };
    if (!response.ok) {
      throw new Error(data.error || "Could not read the sheet");
    }
    const rows = data.cities ?? [];
    setter(
      ["City", ...rows.map((row) => (row.state ? `${row.city}, ${row.state}` : row.city))].join("\n")
    );
  }

  async function startScan() {
    const list = preview;
    if (list.length === 0) {
      setError("Add US and/or UK cities first (upload a sheet or paste).");
      return;
    }
    setError("");
    setCities(list);
    setRows([]);
    setRunning(true);
    setIndex(0);

    const collected: CrawlResultRow[] = [];
    for (let i = 0; i < list.length; i += 1) {
      const row = list[i];
      if (!row) continue;
      setIndex(i + 1);
      setCurrent(`Finding firms in ${cityLabel(row)}`);
      try {
        const discoverParams = new URLSearchParams({
          city: row.city,
          state: row.state,
          country: row.country,
        });
        const discoveredRes = await fetch(`/api/discover-firms?${discoverParams.toString()}`);
        const discovered = (await discoveredRes.json()) as {
          firms?: DiscoveredFirm[];
          error?: string;
        };
        if (!discoveredRes.ok) throw new Error(discovered.error || "Discover failed");

        const foundFirms = discovered.firms ?? [];
        if (foundFirms.length === 0) {
          collected.push({
            city: row.city,
            state: row.state,
            country: row.country,
            locationLabel: cityLabel(row),
            company: "—",
            website: "",
            crawled: false,
            careerPages: [],
            pagesChecked: [],
            jobOpen: false,
            jobCount: 0,
            jobs: [],
            error: "No SEO firms found in this city",
          });
          setRows([...collected]);
          saveCityResults(collected);
          continue;
        }

        setCurrent(`Found ${foundFirms.length} firms in ${cityLabel(row)}`);
        for (let start = 0; start < foundFirms.length; start += 4) {
          const batch = foundFirms.slice(start, start + 4);
          setCurrent(`Opening ${batch.map((firm) => firm.website).join(", ")}`);
          const scanned = await Promise.all(
            batch.map(async (firm) => {
              const siteParams = new URLSearchParams({
                website: firm.website,
                company: firm.name,
                city: row.city,
                country: row.country,
              });
              const siteRes = await fetch(`/api/scan-site?${siteParams.toString()}`);
              const site = (await siteRes.json()) as {
                jobs?: Job[];
                careerPages?: string[];
                pagesChecked?: string[];
                error?: string;
              };
              const jobs = siteRes.ok ? site.jobs ?? [] : [];
              const result: CrawlResultRow = {
                city: row.city,
                state: row.state,
                country: row.country,
                locationLabel: cityLabel(row),
                company: firm.name,
                website: firm.website,
                address: firm.address,
                mapsUrl: firm.mapsUrl,
                foundVia: firm.foundVia,
                crawled: siteRes.ok,
                careerPages: site.careerPages ?? [],
                pagesChecked: site.pagesChecked ?? [],
                jobOpen: jobs.length > 0,
                jobCount: jobs.length,
                latestJobTitle: jobs[0]?.title,
                latestJobUrl: jobs[0]?.url,
                jobs,
                error: siteRes.ok ? undefined : site.error || "Scan failed",
              };
              return result;
            })
          );
          collected.push(...scanned);
          setRows([...collected]);
          saveCityResults(collected);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
      }
    }

    saveCityResults(collected);
    setRunning(false);
    setCurrent("");
    if (collected.length > 0) {
      setCurrent("Done. Stay here or open Saved results when you want to review.");
    }
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-[#1d3557] bg-[#0d1b2e]/80 p-5">
        <h2 className="text-2xl font-semibold">City firm scan</h2>
        <p className="mt-2 max-w-3xl text-[#93a4bb]">
          Upload or paste your US and UK city lists. For each city the bot
          finds SEO firms from Google Maps, Yelp, Clutch, DesignRush, Sortlist,
          and SEMrush — any local SEO firm with a website, not only domains
          that contain “SEO”. Then it opens careers / jobs / about pages and
          keeps openings from the last 30 days. US and UK sheets can be{" "}
          <code>City</code> only. State is optional for the US.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a className="text-[#3ee0a2] underline" href="/api/templates/us-cities.csv">
            Download US template
          </a>
          <a className="text-[#3ee0a2] underline" href="/api/templates/uk-cities.csv">
            Download UK template
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SheetBox
          title="United States cities"
          text={usText}
          placeholder={"City\nAustin\nDallas\nNew York"}
          onText={setUsText}
          onFile={(file) => uploadSheet(file, "us", setUsText).catch((err) => setError(err.message))}
        />
        <SheetBox
          title="United Kingdom cities"
          text={ukText}
          placeholder={"City\nLondon"}
          onText={setUkText}
          onFile={(file) => uploadSheet(file, "gb", setUkText).catch((err) => setError(err.message))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void startScan()}
          className="rounded-xl bg-[#3ee0a2] px-5 py-2 font-semibold text-[#07111f] disabled:opacity-60"
        >
          {running ? `Scanning ${index}/${cities.length || preview.length}…` : "Scan cities (last 30 days)"}
        </button>
        <span className="text-sm text-[#93a4bb]">
          {preview.length} cit{preview.length === 1 ? "y" : "ies"} ready
          {current ? ` · now ${current}` : ""}
        </span>
        {rows.length > 0 && (
          <Link
            href="/results"
            className="rounded-xl border border-[#3ee0a2] px-4 py-2 text-sm font-semibold text-[#3ee0a2]"
          >
            View results page
          </Link>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-[#93a4bb]">
          {rows.length} website{rows.length === 1 ? "" : "s"} crawled so far.{" "}
          <Link href="/results" className="text-[#3ee0a2] underline">
            Open full results page
          </Link>
        </p>
      )}
    </section>
  );
}

function SheetBox({
  title,
  text,
  placeholder,
  onText,
  onFile,
}: {
  title: string;
  text: string;
  placeholder: string;
  onText: (value: string) => void;
  onFile: (file: File) => void;
}) {
  return (
    <label className="grid gap-2 rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-4">
      <span className="font-medium">{title}</span>
      <input
        type="file"
        accept=".csv,.txt,.tsv,.xlsx,.xls"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <textarea
        value={text}
        onChange={(event) => onText(event.target.value)}
        rows={8}
        placeholder={placeholder}
        className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 text-sm outline-none focus:border-[#3ee0a2]"
      />
    </label>
  );
}
