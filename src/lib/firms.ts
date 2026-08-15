import type { CityRow, FirmHit, Job } from "@/lib/types";

const AGENCY_RE =
  /\b(agency|agencies|seo|marketing|digital|media|growth|advertis|creative|brand)\b/i;

export function looksLikeAgency(job: Job): boolean {
  return AGENCY_RE.test(job.company) || AGENCY_RE.test(job.description.slice(0, 180));
}

export function groupFirms(jobs: Job[], city: CityRow): FirmHit[] {
  const map = new Map<string, FirmHit>();
  for (const job of jobs) {
    const key = job.company.trim().toLowerCase();
    const existing = map.get(key);
    if (existing) {
      existing.jobs.push(job);
      existing.agencyLike = existing.agencyLike || looksLikeAgency(job);
      continue;
    }
    map.set(key, {
      company: job.company.trim() || "Unknown company",
      city: city.city,
      country: city.country,
      agencyLike: looksLikeAgency(job),
      jobs: [job],
    });
  }
  return [...map.values()].sort((a, b) => b.jobs.length - a.jobs.length);
}
