import type { Job } from "@/lib/types";

export function JobUrlList({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) return <span className="text-[#93a4bb]">0</span>;

  return (
    <ul className="grid gap-2">
      {jobs.map((job) => (
        <li key={job.id || `${job.title}-${job.url}`}>
          <div className="font-medium">{job.title}</div>
          {job.url ? (
            <a
              className="break-all text-xs text-[#7aa2ff] underline"
              href={job.url}
              target="_blank"
              rel="noreferrer"
            >
              {job.url}
            </a>
          ) : (
            <div className="text-xs text-[#93a4bb]">No listing URL</div>
          )}
        </li>
      ))}
    </ul>
  );
}
