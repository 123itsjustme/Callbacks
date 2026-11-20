import "server-only";

export type ScrapeResult = { url: string; markdown: string; links: string[]; title?: string };

const UA = "Mozilla/5.0 (compatible; JobHunterBot/1.0)";

/** Scrape a page to markdown-ish text. Firecrawl if configured, else fetch + HTML-to-text. */
export async function scrapeUrl(url: string): Promise<ScrapeResult> {
  if (process.env.FIRECRAWL_API_KEY) {
    try {
      return await firecrawl(url);
    } catch (e) {
      console.warn("Firecrawl failed, falling back to fetch:", (e as Error).message);
    }
  }
  return fallbackScrape(url);
}

async function firecrawl(url: string): Promise<ScrapeResult> {
  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: true, timeout: 30000 }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Firecrawl ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Firecrawl error");
  return {
    url,
    markdown: json.data?.markdown ?? "",
    links: json.data?.links ?? [],
    title: json.data?.metadata?.title,
  };
}

async function fallbackScrape(url: string): Promise<ScrapeResult> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Could not fetch page (${res.status})`);
  const html = await res.text();
  return { url, markdown: htmlToText(html, url), links: extractLinks(html, url), title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() };
}

/** JSON-LD JobPosting blocks are the most reliable signal on many ATS pages. */
function extractJsonLd(html: string): string {
  const out: string[] = [];
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    if (/JobPosting/i.test(m[1])) out.push(m[1].trim());
  }
  return out.join("\n");
}

export function htmlToText(html: string, baseUrl?: string): string {
  const jsonLd = extractJsonLd(html);
  let s = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(nav|footer)[\s\S]*?<\/\1>/gi, " ");
  s = s
    .replace(/<h([1-6])[^>]*>/gi, (_m, l) => "\n\n" + "#".repeat(Number(l)) + " ")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/ul|\/ol|\/section|\/article|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
  void baseUrl;
  return (jsonLd ? `STRUCTURED DATA (JSON-LD):\n${jsonLd.slice(0, 15000)}\n\nPAGE TEXT:\n` : "") + s.slice(0, 60000);
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.protocol.startsWith("http")) set.add(u.toString());
    } catch {}
  }
  return [...set].slice(0, 400);
}

// ---------- ATS public APIs (more reliable than scraping, used by the cron) ----------

export type AtsPosting = { title: string; url: string; location?: string; content?: string };
export type AtsInfo = { provider: "greenhouse" | "lever" | "ashby"; token: string } | null;

export function detectAts(careersUrl: string): AtsInfo {
  try {
    const u = new URL(careersUrl);
    const first = u.pathname.split("/").filter(Boolean)[0];
    if (!first) return null;
    if (/(^|\.)greenhouse\.io$/.test(u.hostname)) return { provider: "greenhouse", token: first };
    if (u.hostname === "jobs.lever.co") return { provider: "lever", token: first };
    if (u.hostname === "jobs.ashbyhq.com") return { provider: "ashby", token: first };
  } catch {}
  return null;
}

export async function fetchAtsPostings(ats: NonNullable<AtsInfo>): Promise<AtsPosting[]> {
  const t = encodeURIComponent(ats.token);
  const get = async (url: string) => {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${ats.provider} API ${r.status}`);
    return r.json();
  };
  if (ats.provider === "greenhouse") {
    const j = await get(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`);
    return (j.jobs ?? []).map((x: { title: string; absolute_url: string; location?: { name?: string }; content?: string }) => ({
      title: x.title,
      url: x.absolute_url,
      location: x.location?.name,
      content: x.content ? htmlToText(decodeEntities(x.content)) : undefined,
    }));
  }
  if (ats.provider === "lever") {
    const j = await get(`https://api.lever.co/v0/postings/${t}?mode=json`);
    return (j ?? []).map((x: { text: string; hostedUrl: string; categories?: { location?: string }; descriptionPlain?: string; lists?: { text: string; content: string }[]; additionalPlain?: string }) => ({
      title: x.text,
      url: x.hostedUrl,
      location: x.categories?.location,
      content: [x.descriptionPlain, ...(x.lists ?? []).map((l) => `## ${l.text}\n${htmlToText(l.content)}`), x.additionalPlain].filter(Boolean).join("\n\n"),
    }));
  }
  const j = await get(`https://api.ashbyhq.com/posting-api/job-board/${t}`);
  return (j.jobs ?? []).map((x: { title: string; jobUrl: string; location?: string; descriptionPlain?: string }) => ({
    title: x.title,
    url: x.jobUrl,
    location: x.location,
    content: x.descriptionPlain,
  }));
}

function decodeEntities(s: string) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}
