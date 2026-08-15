"use client";

import { useEffect, useMemo, useState } from "react";
import type { Job, JobSource, SearchResult } from "@/lib/types";

type StatusPayload = {
  search: { query: string; location: string; remoteOnly: boolean };
  cron: { secretSet: boolean; schedule: string; timezone: string };
  integrations: {
    slack: boolean;
    discord: boolean;
    email: boolean;
    adzuna: boolean;
  };
};

type SearchResponse = SearchResult & {
  query: string;
  location: string;
  remoteOnly: boolean;
};

const SOURCE_LABEL: Record<JobSource, string> = {
  remotive: "Remotive",
  arbeitnow: "Arbeitnow",
  jobicy: "Jobicy",
  himalayas: "Himalayas",
  remoteok: "Remote OK",
  adzuna: "Adzuna",
};

function timeAgo(value: string | null): string {
  if (!value) return "Date unknown";
  const ms = Date.now() - Date.parse(value);
  if (Number.isNaN(ms) || ms < 0) return "Just posted";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "Posted just now";
  if (hours < 24) return `Posted ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Posted ${days}d ago`;
}

export function JobSearchApp() {
  const [query, setQuery] = useState("software engineer");
  const [location, setLocation] = useState("remote");
  const [remoteOnly, setRemoteOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((res) => res.json())
      .then((data: StatusPayload) => {
        setStatus(data);
        setQuery(data.search.query);
        setLocation(data.search.location);
        setRemoteOnly(data.search.remoteOnly);
      })
      .catch(() => undefined);
  }, []);

  async function runSearch(event?: React.FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        query,
        location,
        remoteOnly: String(remoteOnly),
      });
      const response = await fetch(`/api/search?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Search failed (${response.status})`);
      }
      setResult((await response.json()) as SearchResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  const sourceRows = useMemo(() => {
    if (!result) return [];
    return Object.entries(result.sources) as Array<
      [JobSource, { ok: boolean; count: number; error?: string }]
    >;
  }, [result]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-5 py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm tracking-[0.2em] text-[#3ee0a2]">JOB SEARCH BOT</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">
            Find openings as they appear
          </h1>
          <p className="mt-2 max-w-2xl text-[#93a4bb]">
            Searches Remotive, Arbeitnow, Jobicy, Himalayas, and Remote OK.
            Daily Vercel cron can Slack, Discord, or email you new roles.
          </p>
        </div>
        <div className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] px-4 py-3 text-sm text-[#93a4bb]">
          <div>Cron: {status?.cron.schedule ?? "0 8 * * *"} UTC</div>
          <div>Secret: {status?.cron.secretSet ? "configured" : "missing"}</div>
        </div>
      </header>

      <form
        onSubmit={runSearch}
        className="grid gap-3 rounded-3xl border border-[#1d3557] bg-[#0d1b2e]/80 p-4 sm:grid-cols-[1.4fr_1fr_auto_auto]"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93a4bb]">Role / keywords</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 outline-none focus:border-[#3ee0a2]"
            placeholder="seo specialist, next.js, product designer"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93a4bb]">Location</span>
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 outline-none focus:border-[#3ee0a2]"
            placeholder="remote, United States, London"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-[#93a4bb]">
          <input
            type="checkbox"
            checked={remoteOnly}
            onChange={(event) => setRemoteOnly(event.target.checked)}
          />
          Remote only
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[#3ee0a2] px-5 py-2 font-semibold text-[#07111f] disabled:opacity-60"
        >
          {loading ? "Searching…" : "Search now"}
        </button>
      </form>

      {status && (
        <section className="grid gap-3 sm:grid-cols-4">
          <StatusCard label="Slack" on={status.integrations.slack} />
          <StatusCard label="Discord" on={status.integrations.discord} />
          <StatusCard label="Email" on={status.integrations.email} />
          <StatusCard label="Adzuna" on={status.integrations.adzuna} extra="optional" />
        </section>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      {result && (
        <>
          <section className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-medium">
              {result.jobs.length} opening{result.jobs.length === 1 ? "" : "s"}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs">
              {sourceRows.map(([source, info]) => (
                <span
                  key={source}
                  className={`rounded-full border px-2.5 py-1 ${
                    info.ok
                      ? "border-[#1d3557] text-[#93a4bb]"
                      : "border-red-500/40 text-red-200"
                  }`}
                >
                  {SOURCE_LABEL[source]} · {info.ok ? info.count : "failed"}
                </span>
              ))}
            </div>
          </section>

          <section className="grid gap-3">
            {result.jobs.length === 0 ? (
              <p className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-6 text-[#93a4bb]">
                No matching openings right now. Try a broader keyword or turn off
                remote-only.
              </p>
            ) : (
              result.jobs.map((job) => <JobCard key={job.id} job={job} />)
            )}
          </section>
        </>
      )}
    </main>
  );
}

function StatusCard({
  label,
  on,
  extra,
}: {
  label: string;
  on: boolean;
  extra?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#1d3557] bg-[#0d1b2e] px-4 py-3">
      <div className="text-sm text-[#93a4bb]">{label}</div>
      <div className="mt-1 font-medium">{on ? "Connected" : "Not set"}</div>
      {extra && <div className="text-xs text-[#93a4bb]">{extra}</div>}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <article className="grid gap-3 rounded-2xl border border-[#1d3557] bg-[#0d1b2e] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-medium">{job.title}</h3>
          <span className="rounded-full bg-[#12263f] px-2 py-0.5 text-xs text-[#7aa2ff]">
            {SOURCE_LABEL[job.source]}
          </span>
        </div>
        <p className="mt-1 text-[#93a4bb]">
          {job.company} · {job.location || "Remote"} · {timeAgo(job.postedAt)}
        </p>
        {job.description && (
          <p className="mt-2 line-clamp-2 text-sm text-[#c5d0e0]">{job.description}</p>
        )}
      </div>
      <a
        href={job.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center justify-center rounded-xl border border-[#3ee0a2] px-4 text-sm font-semibold text-[#3ee0a2]"
      >
        Open listing
      </a>
    </article>
  );
}
