export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const DIRECTORY_HOSTS = [
  "yelp.com",
  "yelp.co.uk",
  "yelpcdn.com",
  "clutch.co",
  "designrush.com",
  "sortlist.com",
  "semrush.com",
  "yellowpages.com",
  "yell.com",
  "bbb.org",
  "goodfirms.co",
  "upcity.com",
  "themanifest.com",
  "agencyspotter.com",
  "g2.com",
  "capterra.com",
  "expertise.com",
  "topdevelopers.co",
  "seo.com",
];

const SKIP_HOSTS = [
  ...DIRECTORY_HOSTS,
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "indeed.com",
  "glassdoor.com",
  "wikipedia.org",
  "reddit.com",
  "crunchbase.com",
  "maps.google.",
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "bing.com",
  "microsoft.com",
  "duckduckgo.com",
  "upwork.com",
  "fiverr.com",
  "tiktok.com",
  "pinterest.com",
  "apple.com",
  "play.google.",
  "whatsapp.com",
  "wa.me",
  "tumblr.com",
  "vkontakte.ru",
  "vk.com",
  "ogp.me",
  "gstatic.com",
  "googletagmanager.com",
  "google-analytics.com",
  "cookielaw.org",
  "datadome.co",
  "cloudfront.net",
  "cloudinary.com",
  "jsdelivr.net",
  "cdnjs.com",
  "moz.com",
  "ahrefs.com",
  "yoast.com",
  "backlinko.com",
  "searchengineland.com",
  "searchenginejournal.com",
  "neilpatel.com",
  "developers.google.com",
  "dmca.com",
  "hubspot.com",
  "zoom.us",
  "amazon.com",
  "squoosh.app",
  "raterhub.com",
  "keywordseverywhere.com",
  "yelp-ir.com",
  "yelp-support.com",
  "repairpal.com",
  "acxiom.com",
  "schema.org",
  "blog.google",
  "adobe.com",
  "pagespeed.web.dev",
];

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isDirectoryHost(url: string): boolean {
  const host = hostOf(url);
  return DIRECTORY_HOSTS.some((skip) => host === skip || host.endsWith(`.${skip}`));
}

export function keepWebsite(url: string): boolean {
  const host = hostOf(url);
  if (!host || !host.includes(".")) return false;
  return !SKIP_HOSTS.some((skip) => host === skip || host.includes(skip));
}

export function cleanWebsite(raw: string): string | null {
  const value = raw.trim().replace(/^\/\//, "https://");
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const origin = `${parsed.origin}/`;
    return keepWebsite(origin) ? origin : null;
  } catch {
    return null;
  }
}

export function nameFromHost(url: string): string {
  const host = hostOf(url);
  const base = host.split(".")[0] ?? host;
  return base.replace(/[-_]/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!/html|xml|text|json/i.test(type)) return null;
    return (await response.text()).slice(0, 1_200_000);
  } catch {
    return null;
  }
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item === undefined) continue;
      out[index] = await fn(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(items.length, 1)) }, () => worker())
  );
  return out;
}
