"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cityLabel } from "@/lib/cities";
import { loadAllResults, saveCityResults } from "@/lib/results-store";
import type { CityRow, CrawlResultRow, DiscoveredFirm, Job } from "@/lib/types";

const STEPS = [
  { id: "google", label: "Google search" },
  { id: "clutch", label: "Clutch" },
  { id: "designrush", label: "DesignRush" },
  { id: "directories", label: "Other directories" },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type StepState = "wait" | "run" | "done" | "empty";

export function CityExplorePanel() {
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState<"us" | "gb">("us");
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState("");
  const [error, setError] = useState("");
  const [stepState, setStepState] = useState<Record<StepId, StepState>>({
    google: "wait",
    clutch: "wait",
    designrush: "wait",
    directories: "wait",
  });
  const [stepCounts, setStepCounts] = useState<Record<StepId, { found: number; added: number }>>({
    google: { found: 0, added: 0 },
    clutch: { found: 0, added: 0 },
    designrush: { found: 0, added: 0 },
    directories: { found: 0, added: 0 },
  });
  const [rows, setRows] = useState<CrawlResultRow[]>([]);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    setSavedCount(loadAllResults().length);
  }, []);

  async function startExplore() {
    const cityName = city.trim();
    if (!cityName) {
      setError("Enter one city to explore.");
      return;
    }
    const row: CityRow = { city: cityName, state: state.trim(), country };
    setError("");
    setRows([]);
    setRunning(true);
    setStepState({ google: "wait", clutch: "wait", designrush: "wait", directories: "wait" });
    setStepCounts({
      google: { found: 0, added: 0 },
      clutch: { found: 0, added: 0 },
      designrush: { found: 0, added: 0 },
      directories: { found: 0, added: 0 },
    });

    const found = new Map<string, DiscoveredFirm>();
    for (const step of STEPS) {
      setStepState((prev) => ({ ...prev, [step.id]: "run" }));
      setCurrent(`Searching ${step.label} for SEO firms in ${cityLabel(row)}`);
      try {
        const params = new URLSearchParams({
          city: row.city,
          state: row.state,
          country: row.country,
          step: step.id,
        });
        const response = await fetch(`/api/explore-city?${params.toString()}`);
        const data = (await response.json()) as { firms?: DiscoveredFirm[]; error?: string };
        if (!response.ok) throw new Error(data.error || `${step.label} failed`);
        const total = data.firms?.length ?? 0;
        let added = 0;
        for (const firm of data.firms ?? []) {
          if (found.has(firm.website)) continue;
          found.set(firm.website, { ...firm, foundVia: firm.foundVia || step.id });
          added += 1;
        }
        setStepCounts((prev) => ({ ...prev, [step.id]: { found: total, added } }));
        setStepState((prev) => ({ ...prev, [step.id]: total > 0 || added > 0 ? "done" : "empty" }));
      } catch (err) {
        setStepState((prev) => ({ ...prev, [step.id]: "empty" }));
        setError(err instanceof Error ? err.message : "Explore failed");
      }
    }

    const firms = [...found.values()];
    const collected: CrawlResultRow[] = [];
    if (firms.length === 0) {
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
        error: "No SEO firms found from Google, Clutch, DesignRush, or other directories",
      });
      setRows(collected);
      setSavedCount(saveCityResults(collected).length);
      setRunning(false);
      setCurrent("Saved. Enter the next city when you are ready.");
      return;
    }

    for (let start = 0; start < firms.length; start += 4) {
      const batch = firms.slice(start, start + 4);
      setCurrent(`Checking jobs on ${batch.map((firm) => firm.website).join(", ")}`);
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
      setSavedCount(saveCityResults(collected).length);
    }

    setSavedCount(saveCityResults(collected).length);
    setRunning(false);
    setCurrent("Saved. Enter the next city when you are ready.");
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-[#1d3557] bg-[#0d1b2e]/80 p-5">
        <h2 className="text-2xl font-semibold">City explorer</h2>
        <p className="mt-2 max-w-3xl text-[#93a4bb]">
          Give one city. The bot searches Google for SEO firms, then Clutch,
          DesignRush, and other local directories. The same agency often
          appears on more than one list, so we crawl each website only once.
          Each city is saved. Use Saved results to review any city and filter
          to job openings only.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-4 sm:grid-cols-4">
        <label className="grid gap-1 sm:col-span-2">
          <span className="text-sm text-[#93a4bb]">City</span>
          <input
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Austin"
            className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 outline-none focus:border-[#3ee0a2]"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-[#93a4bb]">State (optional)</span>
          <input
            value={state}
            onChange={(event) => setState(event.target.value)}
            placeholder="TX"
            disabled={country === "gb"}
            className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 outline-none focus:border-[#3ee0a2] disabled:opacity-50"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-[#93a4bb]">Country</span>
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value as "us" | "gb")}
            className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 outline-none focus:border-[#3ee0a2]"
          >
            <option value="us">United States</option>
            <option value="gb">United Kingdom</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void startExplore()}
          className="rounded-xl bg-[#3ee0a2] px-5 py-2 font-semibold text-[#07111f] disabled:opacity-60"
        >
          {running ? "Exploring city…" : "Explore this city"}
        </button>
        <span className="text-sm text-[#93a4bb]">{current}</span>
        {savedCount > 0 && (
          <Link
            href="/results"
            className="rounded-xl border border-[#3ee0a2] px-4 py-2 text-sm font-semibold text-[#3ee0a2]"
          >
            Saved results ({savedCount})
          </Link>
        )}
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <li
            key={step.id}
            className="flex items-center justify-between rounded-xl border border-[#1d3557] bg-[#0d1b2e] px-4 py-3"
          >
            <span>
              {index + 1}. {step.label}
            </span>
            <span className="text-sm text-[#93a4bb]">
              {stepState[step.id] === "run" && "Searching…"}
              {stepState[step.id] === "done" &&
                `${stepCounts[step.id].found} found · ${stepCounts[step.id].added} new`}
              {stepState[step.id] === "empty" && "None found"}
              {stepState[step.id] === "wait" && "Waiting"}
            </span>
          </li>
        ))}
      </ol>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      {rows.length > 0 && (
        <p className="text-sm text-[#93a4bb]">
          {rows.length} website{rows.length === 1 ? "" : "s"} checked.{" "}
          <Link href="/results" className="text-[#3ee0a2] underline">
            Open full results page
          </Link>
        </p>
      )}
    </section>
  );
}
