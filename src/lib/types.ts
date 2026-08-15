export type JobSource =
  | "remotive"
  | "arbeitnow"
  | "jobicy"
  | "himalayas"
  | "remoteok"
  | "adzuna"
  | "muse";

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
  cityScan?: boolean;
  country?: "us" | "gb";
};

export type CityRow = {
  city: string;
  state: string;
  country: "us" | "gb";
};

export type FirmHit = {
  company: string;
  city: string;
  country: "us" | "gb";
  agencyLike: boolean;
  jobs: Job[];
};

export type SearchResult = {
  jobs: Job[];
  sources: Partial<Record<JobSource, { ok: boolean; count: number; error?: string }>>;
  queriedAt: string;
};
