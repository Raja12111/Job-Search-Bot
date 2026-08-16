export type JobSource =
  | "remotive"
  | "arbeitnow"
  | "jobicy"
  | "himalayas"
  | "remoteok"
  | "adzuna"
  | "muse"
  | "career-page"
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "indeed"
  | "glassdoor"
  | "ziprecruiter"
  | "linkedin"
  | "reed"
  | "monster"
  | "jooble"
  | "jsearch"
  | "careerbuilder"
  | "simplyhired";

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
  website?: string;
  careerPages?: string[];
  jobs: Job[];
};

export type DiscoveredFirm = {
  name: string;
  website: string;
  city: string;
  country: "us" | "gb";
  address?: string;
  mapsUrl?: string;
  foundVia?: string;
};

export type CrawlResultRow = {
  city: string;
  state?: string;
  country: "us" | "gb";
  locationLabel: string;
  company: string;
  website: string;
  address?: string;
  mapsUrl?: string;
  foundVia?: string;
  crawled: boolean;
  careerPages: string[];
  pagesChecked: string[];
  jobOpen: boolean;
  jobCount: number;
  latestJobTitle?: string;
  latestJobUrl?: string;
  jobs: Job[];
  error?: string;
  scannedAt?: string;
};

export type SearchResult = {
  jobs: Job[];
  sources: Partial<Record<JobSource, { ok: boolean; count: number; error?: string }>>;
  queriedAt: string;
};
