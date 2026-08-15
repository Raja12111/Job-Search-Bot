export type JobSource =
  | "remotive"
  | "arbeitnow"
  | "jobicy"
  | "himalayas"
  | "remoteok"
  | "adzuna";

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  url: string;
  source: JobSource;
  postedAt: string | null;
  description: string;
  tags: string[];
};

export type SearchInput = {
  query: string;
  location: string;
  remoteOnly: boolean;
  maxAgeHours?: number;
};

export type SearchResult = {
  jobs: Job[];
  sources: Partial<Record<JobSource, { ok: boolean; count: number; error?: string }>>;
  queriedAt: string;
};
