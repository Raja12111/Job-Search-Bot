"use client";

import { useEffect, useState } from "react";
import { JobUrlList } from "@/components/JobUrlList";
import { cityLabel } from "@/lib/cities";
import { alreadyCrawled, loadAllResults, loadCrawledHosts, saveCityResults } from "@/lib/results-store";
import type { CityRow, CrawlResultRow, DiscoveredFirm, Job } from "@/lib/types";

const STEPS = [
  { id: "google", label: "Google search" },
  { id: "clutch", label: "Clutch" },
  { id: "designrush", label: "DesignRush" },
  { id: "directories", label: "Other directories" },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type StepState = "wait" | "run" | "done" | "empty";

async function fetchJson<T>(url: string, timeoutMs: number): Promise<{ ok: boolean; data: T }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    try {
      return { ok: response.ok, data: JSON.parse(text) as T };
    } catch {
      throw new Error(response.ok ? "Bad response from server" : `Request failed (${response.status})`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("This step took too long and was stopped so you can keep going.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export function CityExplorePanel() {
  const [city, setCity] = useState("");
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
  const [doneCity, setDoneCity] = useState("");
  const [doneCount, setDoneCount] = useState(0);
  const [doneSkipped, setDoneSkipped] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    setSavedCount(loadAllResults().length);
  }, []);

  async function startExplore() {
    const cityName = city.trim();
    if (!cityName) {
      setError("Enter one city to explore.");
      return;
    }
    const row: CityRow = { city: cityName, state: "", country };
    setError("");
    setDoneCity("");
    setDoneCount(0);
    setDoneSkipped(0);
    setProgress({ done: 0, total: 0 });
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
        const { ok, data } = await fetchJson<{ firms?: DiscoveredFirm[]; error?: string }>(
          `/api/explore-city?${params.toString()}`,
          55000
        );
        if (!ok) throw new Error(data.error || `${step.label} failed`);
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

    const crawled = loadCrawledHosts();
    const discovered = [...found.values()];
    const firms = discovered.filter((firm) => !alreadyCrawled(firm.website, crawled));
    const skipped = discovered.length - firms.length;
    const collected: CrawlResultRow[] = [];
    if (skipped > 0) {
      setCurrent(`Skipping ${skipped} site${skipped === 1 ? "" : "s"} already crawled`);
    }
    try {
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
          error:
            skipped > 0
              ? `All ${skipped} sites were already crawled in a previous city`
              : "No SEO firms found from Google, Clutch, DesignRush, or other directories",
        });
        setRows(collected);
        setSavedCount(saveCityResults(collected).length);
        return;
      }

      setProgress({ done: 0, total: firms.length });
      for (let start = 0; start < firms.length; start += 6) {
        const batch = firms.slice(start, start + 6);
        setCurrent(`Checking jobs ${start + 1}–${Math.min(start + batch.length, firms.length)} of ${firms.length}`);
        const scanned = await Promise.all(
          batch.map(async (firm) => {
            const siteParams = new URLSearchParams({
              website: firm.website,
              company: firm.name,
              city: row.city,
              country: row.country,
            });
            try {
              const { ok, data: site } = await fetchJson<{
                jobs?: Job[];
                careerPages?: string[];
                pagesChecked?: string[];
                error?: string;
              }>(`/api/scan-site?${siteParams.toString()}`, 20000);
              const jobs = ok ? site.jobs ?? [] : [];
              return {
                city: row.city,
                state: row.state,
                country: row.country,
                locationLabel: cityLabel(row),
                company: firm.name,
                website: firm.website,
                address: firm.address,
                mapsUrl: firm.mapsUrl,
                foundVia: firm.foundVia,
                crawled: ok,
                careerPages: site.careerPages ?? [],
                pagesChecked: site.pagesChecked ?? [],
                jobOpen: jobs.length > 0,
                jobCount: jobs.length,
                latestJobTitle: jobs[0]?.title,
                latestJobUrl: jobs[0]?.url,
                jobs,
                error: ok ? undefined : site.error || "Scan failed",
              } satisfies CrawlResultRow;
            } catch (err) {
              return {
                city: row.city,
                state: row.state,
                country: row.country,
                locationLabel: cityLabel(row),
                company: firm.name,
                website: firm.website,
                address: firm.address,
                mapsUrl: firm.mapsUrl,
                foundVia: firm.foundVia,
                crawled: false,
                careerPages: [],
                pagesChecked: [],
                jobOpen: false,
                jobCount: 0,
                jobs: [],
                error: err instanceof Error ? err.message : "Scan timed out",
              } satisfies CrawlResultRow;
            }
          })
        );
        collected.push(...scanned);
        setProgress({ done: collected.length, total: firms.length });
        setRows([...collected]);
        setSavedCount(saveCityResults(collected).length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Explore failed");
    } finally {
      if (collected.length > 0) {
        setSavedCount(saveCityResults(collected).length);
        finishCity(cityName, collected.length, skipped);
      } else {
        setRunning(false);
        setCurrent("");
      }
    }
  }

  function finishCity(cityName: string, count: number, skippedCount = 0) {
    setRunning(false);
    setCurrent("");
    setDoneCity(cityName);
    setDoneCount(count);
    setDoneSkipped(skippedCount);
    setCity("");
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-[#1d3557] bg-[#0d1b2e]/80 p-5">
        <h2 className="text-2xl font-semibold">City explorer</h2>
        <p className="mt-2 max-w-3xl text-[#93a4bb]">
          Give one city. The bot searches Google for SEO firms, then Clutch,
          DesignRush, and other local directories. Each website is crawled
          once — later cities skip sites already checked, including tools
          like Nutshell and TeamAI. Each city is saved. Use Saved results to
          review any city and filter to job openings only.
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-4 sm:grid-cols-3">
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

      {doneCity && !running && (
        <div className="rounded-2xl border border-[#3ee0a2] bg-[#12382c] px-5 py-4">
          <p className="text-lg font-semibold text-[#3ee0a2]">Done — {doneCity} is saved</p>
          <p className="mt-1 text-sm text-[#93a4bb]">
            {doneCount} website{doneCount === 1 ? "" : "s"} checked
            {doneSkipped > 0
              ? `, ${doneSkipped} already crawled skipped`
              : ""}. Stay on this page and type the next city above, then click
            Explore this city.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void startExplore()}
          className="rounded-xl bg-[#3ee0a2] px-5 py-2 font-semibold text-[#07111f] disabled:opacity-60"
        >
          {running ? "Exploring city…" : "Explore this city"}
        </button>
        <span className="text-sm text-[#93a4bb]">
          {current}
          {running && progress.total > 0 ? ` · ${progress.done}/${progress.total}` : ""}
        </span>
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

      {savedCount > 0 && (
        <p className="text-sm text-[#93a4bb]">
          {savedCount} firm{savedCount === 1 ? "" : "s"} saved across cities. Review
          later from the Saved results menu — do not leave this page until you
          finish the next city.
        </p>
      )}

      {rows.some((row) => row.jobOpen) && (
        <div className="grid gap-3 rounded-2xl border border-[#3ee0a2] bg-[#0d1b2e] p-4">
          <h3 className="text-lg font-semibold text-[#3ee0a2]">
            Positions found — open the URL for each one
          </h3>
          {rows
            .filter((row) => row.jobOpen)
            .map((row) => (
              <article
                key={`${row.website}-${row.company}`}
                className="rounded-xl border border-[#1d3557] bg-[#07111f] px-4 py-3"
              >
                <div className="font-medium">{row.company}</div>
                {row.website && (
                  <a
                    className="break-all text-xs text-[#93a4bb] underline"
                    href={row.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.website}
                  </a>
                )}
                <div className="mt-2">
                  <JobUrlList jobs={row.jobs} />
                </div>
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
