"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toCsv } from "@/lib/cities";
import { loadResults } from "@/lib/results-store";
import type { CrawlResultRow } from "@/lib/types";

export function ResultsPage() {
  const [rows, setRows] = useState<CrawlResultRow[]>([]);

  useEffect(() => {
    setRows(loadResults());
  }, []);

  const openCount = useMemo(() => rows.filter((row) => row.jobOpen).length, [rows]);
  const closedCount = rows.length - openCount;

  function download() {
    const csv = toCsv(
      rows.map((row) => ({
        Country: row.country === "gb" ? "UK" : "US",
        City: row.city,
        Firm: row.company,
        Website: row.website,
        Crawled: row.crawled ? "Yes" : "No",
        CareerPages: row.careerPages.join(" | "),
        JobOpen: row.jobOpen ? "Yes" : "No",
        JobCount: String(row.jobCount),
        LatestJob: row.latestJobTitle ?? "",
        ApplyUrl: row.latestJobUrl ?? "",
        Error: row.error ?? "",
      }))
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "crawled-websites-job-open.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm tracking-[0.2em] text-[#3ee0a2]">RESULTS</p>
          <h1 className="mt-1 text-3xl font-semibold">Crawled websites</h1>
          <p className="mt-2 text-[#93a4bb]">
            City, website visited, and whether jobs are open.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-xl border border-[#1d3557] px-4 py-2 text-sm text-[#93a4bb]"
          >
            Back to scan
          </Link>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={download}
              className="rounded-xl bg-[#3ee0a2] px-4 py-2 text-sm font-semibold text-[#07111f]"
            >
              Download CSV
            </button>
          )}
        </div>
      </div>

      <section className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Websites crawled" value={rows.length} />
        <Stat label="Job open" value={openCount} />
        <Stat label="No jobs found" value={closedCount} />
      </section>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-6 text-[#93a4bb]">
          No scan results yet. Go back, add cities, and run a scan.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#1d3557]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#12263f] text-[#93a4bb]">
              <tr>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Website crawled</th>
                <th className="px-3 py-2">Career / jobs page</th>
                <th className="px-3 py-2">Job open</th>
                <th className="px-3 py-2">Openings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.country}-${row.city}-${row.website}`} className="border-t border-[#1d3557]">
                  <td className="px-3 py-2 text-[#93a4bb]">{row.locationLabel}</td>
                  <td className="px-3 py-2">
                    <div>{row.company}</div>
                    <a
                      className="text-xs text-[#7aa2ff] underline"
                      href={row.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.website}
                    </a>
                    {!row.crawled && (
                      <div className="text-xs text-red-300">{row.error || "Could not crawl"}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[#93a4bb]">
                    {row.careerPages[0] ? (
                      <a
                        className="text-[#7aa2ff] underline"
                        href={row.careerPages[0]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Opened
                      </a>
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
                    {row.jobOpen ? (
                      <a
                        className="text-[#7aa2ff] underline"
                        href={row.latestJobUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {row.jobCount} · {row.latestJobTitle}
                      </a>
                    ) : (
                      "0"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
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
