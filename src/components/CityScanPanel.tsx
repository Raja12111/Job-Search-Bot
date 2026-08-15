"use client";

import { useMemo, useState } from "react";
import { cityLabel, parseCityTable, toCsv } from "@/lib/cities";
import type { CityRow, DiscoveredFirm, FirmHit, Job } from "@/lib/types";

type ScanFirm = FirmHit & { locationLabel: string };

export function CityScanPanel() {
  const [usText, setUsText] = useState("");
  const [ukText, setUkText] = useState("");
  const [cities, setCities] = useState<CityRow[]>([]);
  const [firms, setFirms] = useState<ScanFirm[]>([]);
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
      ["City,State,Country", ...rows.map((row) => `${row.city},${row.state},${row.country === "gb" ? "UK" : "US"}`)].join(
        "\n"
      )
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
    setFirms([]);
    setRunning(true);
    setIndex(0);

    const collected: ScanFirm[] = [];
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

        for (const firm of discovered.firms ?? []) {
          setCurrent(`Opening ${firm.website}`);
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
            error?: string;
          };
          if (!siteRes.ok || !site.jobs?.length) continue;
          const hit: FirmHit = {
            company: firm.name,
            city: row.city,
            country: row.country,
            agencyLike: true,
            website: firm.website,
            careerPages: site.careerPages ?? [],
            jobs: site.jobs,
          };
          collected.push({ ...hit, locationLabel: cityLabel(row) });
          setFirms([...collected]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Scan failed");
      }
    }

    setRunning(false);
    setCurrent("");
  }

  function downloadResults() {
    const rows = firms.flatMap((firm) =>
      firm.jobs.map((job) => ({
        Country: firm.country === "gb" ? "UK" : "US",
        City: firm.city,
        Firm: firm.company,
        Website: firm.website ?? "",
        CareerPages: (firm.careerPages ?? []).join(" | "),
        JobTitle: job.title,
        Posted: job.postedAt ?? "Listed now",
        ApplyUrl: job.url,
        Source: job.source,
      }))
    );
    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "seo-marketing-firms-30-days.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-[#1d3557] bg-[#0d1b2e]/80 p-5">
        <h2 className="text-2xl font-semibold">City firm scan</h2>
        <p className="mt-2 max-w-3xl text-[#93a4bb]">
          Upload or paste your US and UK city lists. For each city the bot
          finds SEO and Marketing firms, then opens their website — careers,
          jobs, and about pages — and collects openings from the last 30 days.
          Sheet columns: <code>City, State, Country</code>.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <a className="text-[#3ee0a2] underline" href="/templates/us-cities.csv">
            Download US template
          </a>
          <a className="text-[#3ee0a2] underline" href="/templates/uk-cities.csv">
            Download UK template
          </a>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SheetBox
          title="United States cities"
          text={usText}
          onText={setUsText}
          onFile={(file) => uploadSheet(file, "us", setUsText).catch((err) => setError(err.message))}
        />
        <SheetBox
          title="United Kingdom cities"
          text={ukText}
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
        {firms.length > 0 && (
          <button
            type="button"
            onClick={downloadResults}
            className="rounded-xl border border-[#3ee0a2] px-4 py-2 text-sm font-semibold text-[#3ee0a2]"
          >
            Download results CSV
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-200">
          {error}
        </p>
      )}

      {firms.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[#1d3557]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#12263f] text-[#93a4bb]">
              <tr>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2">Firm / website</th>
                <th className="px-3 py-2">Jobs (30 days)</th>
                <th className="px-3 py-2">Latest role</th>
              </tr>
            </thead>
            <tbody>
              {firms.map((firm) => (
                <tr key={`${firm.country}-${firm.city}-${firm.company}`} className="border-t border-[#1d3557]">
                  <td className="px-3 py-2 text-[#93a4bb]">{firm.locationLabel}</td>
                  <td className="px-3 py-2">
                    <div>{firm.company}</div>
                    {firm.website ? (
                      <a className="text-xs text-[#7aa2ff] underline" href={firm.website} target="_blank" rel="noreferrer">
                        {firm.website}
                      </a>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{firm.jobs.length}</td>
                  <td className="px-3 py-2">
                    <a
                      className="text-[#7aa2ff] underline"
                      href={firm.jobs[0]?.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {firm.jobs[0]?.title}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SheetBox({
  title,
  text,
  onText,
  onFile,
}: {
  title: string;
  text: string;
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
        placeholder={"City,State,Country\nAustin,TX,US"}
        className="rounded-xl border border-[#1d3557] bg-[#07111f] px-3 py-2 text-sm outline-none focus:border-[#3ee0a2]"
      />
    </label>
  );
}
