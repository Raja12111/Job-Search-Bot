"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { JobUrlList } from "@/components/JobUrlList";
import { toCsv } from "@/lib/cities";
import { cityKey, clearAllResults, listSavedCities, loadAllResults } from "@/lib/results-store";
import type { CrawlResultRow } from "@/lib/types";

type JobFilter = "all" | "open" | "closed";

export function ResultsPage() {
  const [rows, setRows] = useState<CrawlResultRow[]>([]);
  const [cityFilter, setCityFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState<JobFilter>("all");

  useEffect(() => {
    setRows(loadAllResults());
  }, []);

  const cities = useMemo(() => listSavedCities(), [rows]);

  const visible = useMemo(() => {
    return rows.filter((row) => {
      if (cityFilter !== "all" && cityKey(row) !== cityFilter) return false;
      if (jobFilter === "open" && !row.jobOpen) return false;
      if (jobFilter === "closed" && row.jobOpen) return false;
      return true;
    });
  }, [rows, cityFilter, jobFilter]);

  const openCount = visible.filter((row) => row.jobOpen).length;

  function download() {
    const csv = toCsv(
      visible.flatMap((row) => {
        const base = {
          City: row.city,
          State: row.country === "us" ? row.state ?? "" : "",
          Firm: row.company,
          Address: row.address ?? "",
          FoundVia: row.foundVia ?? "",
          Website: row.website,
          CareerPage: row.careerPages.join(" | "),
          JobOpen: row.jobOpen ? "Yes" : "No",
        };
        if (row.jobs.length === 0) {
          return [{ ...base, JobTitle: "", JobUrl: "", Error: row.error ?? "" }];
        }
        return row.jobs.map((job) => ({
          ...base,
          JobTitle: job.title,
          JobUrl: job.url,
          Error: row.error ?? "",
        }));
      })
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "saved-city-results.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function clearSaved() {
    clearAllResults();
    setRows([]);
    setCityFilter("all");
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm tracking-[0.2em] text-[#3ee0a2]">SAVED RESULTS</p>
          <h1 className="mt-1 text-3xl font-semibold">All city data</h1>
          <p className="mt-2 text-[#93a4bb]">
            Every city you scan is kept. Open a city from the menu or show only
            firms with job openings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl border border-[#1d3557] px-4 py-2 text-sm text-[#93a4bb]"
          >
            Back to explorer
          </Link>
          {rows.length > 0 && (
            <>
              <button
                type="button"
                onClick={download}
                className="rounded-xl bg-[#3ee0a2] px-4 py-2 text-sm font-semibold text-[#07111f]"
              >
                Download CSV
              </button>
              <button
                type="button"
                onClick={clearSaved}
                className="rounded-xl border border-[#1d3557] px-4 py-2 text-sm text-[#93a4bb]"
              >
                Clear saved
              </button>
            </>
          )}
        </div>
      </div>

      <section className="mb-5 grid gap-3 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-3">
          <p className="mb-2 text-xs tracking-[0.2em] text-[#93a4bb]">CITIES</p>
          <button
            type="button"
            onClick={() => setCityFilter("all")}
            className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm ${
              cityFilter === "all" ? "bg-[#12382c] text-[#3ee0a2]" : "text-[#93a4bb]"
            }`}
          >
            All cities ({rows.length})
          </button>
          {cities.map((city) => (
            <button
              key={city.key}
              type="button"
              onClick={() => setCityFilter(city.key)}
              className={`mb-1 block w-full rounded-lg px-3 py-2 text-left text-sm ${
                cityFilter === city.key ? "bg-[#12382c] text-[#3ee0a2]" : "text-[#93a4bb]"
              }`}
            >
              {city.label}
              <span className="block text-xs opacity-80">
                {city.count} firms · {city.openCount} open
              </span>
            </button>
          ))}
        </aside>

        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <FilterChip active={jobFilter === "all"} onClick={() => setJobFilter("all")}>
              All firms
            </FilterChip>
            <FilterChip active={jobFilter === "open"} onClick={() => setJobFilter("open")}>
              Job openings only
            </FilterChip>
            <FilterChip active={jobFilter === "closed"} onClick={() => setJobFilter("closed")}>
              No jobs found
            </FilterChip>
          </div>

          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Showing" value={visible.length} />
            <Stat label="Job open" value={openCount} />
            <Stat label="No jobs found" value={visible.length - openCount} />
          </section>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-6 text-[#93a4bb]">
              No saved rows for this filter. Scan a city from City explorer, then
              come back here.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#1d3557]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#12263f] text-[#93a4bb]">
                  <tr>
                    <th className="px-3 py-2">City / State</th>
                    <th className="px-3 py-2">Website crawled</th>
                    <th className="px-3 py-2">Career / jobs page</th>
                    <th className="px-3 py-2">Job open</th>
                    <th className="px-3 py-2">Positions and URLs</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={`${row.country}-${row.city}-${row.website}-${row.company}`}
                      className="border-t border-[#1d3557]"
                    >
                      <td className="px-3 py-2 text-[#93a4bb]">{row.locationLabel}</td>
                      <td className="px-3 py-2">
                        <div>{row.company}</div>
                        {row.foundVia ? (
                          <div className="text-xs text-[#93a4bb]">via {row.foundVia}</div>
                        ) : null}
                        {row.website ? (
                          <a
                            className="text-xs text-[#7aa2ff] underline"
                            href={row.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {row.website}
                          </a>
                        ) : (
                          <div className="text-xs text-[#93a4bb]">No website</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[#93a4bb]">
                        {row.careerPages[0] ? (
                          <div className="grid gap-1">
                            {row.careerPages.slice(0, 3).map((page) => (
                              <a
                                key={page}
                                className="break-all text-[#7aa2ff] underline"
                                href={page}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {page}
                              </a>
                            ))}
                          </div>
                        ) : row.crawled ? (
                          "Checked homepage / about"
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            row.jobOpen
                              ? "bg-[#12382c] text-[#3ee0a2]"
                              : "bg-[#2a2030] text-[#d4a0b0]"
                          }`}
                        >
                          {row.jobOpen ? "Yes — jobs open" : "No jobs found"}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <JobUrlList jobs={row.jobs} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium ${
        active ? "bg-[#3ee0a2] text-[#07111f]" : "border border-[#1d3557] text-[#93a4bb]"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] px-4 py-3">
      <div className="text-sm text-[#93a4bb]">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
