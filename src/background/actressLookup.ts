import { loadImageDataUrl, loadPageHtml } from "../tabLoader";

export interface ActressLookupDetails {
  name: string;
  otherNames: string[];
  imageUrl: string | null;
  imageDataUrl?: string | null;
  sourceUrl: string;
}

interface SearchMatch {
  title: string;
  url: string;
}

const BOOBPEDIA_API = "https://www.boobpedia.com/boobs/api.php";
const BOOBPEDIA_BASE = "https://www.boobpedia.com/boobs/";
const IAFD_BASE = "https://www.iafd.com/";

function cleanWikiValue(value: string): string {
  return value
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref[^>]*\/>/gi, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ");
}

async function boobpediaGet(params: Record<string, string>): Promise<any> {
  const url = new URL(BOOBPEDIA_API);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Boobpedia request failed (${response.status})`);
  return response.json();
}

function boobpediaPageUrl(title: string): string {
  return `${BOOBPEDIA_BASE}${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

async function boobpediaSearch(query: string): Promise<SearchMatch[]> {
  const search = async (extra: Record<string, string> = {}): Promise<SearchMatch[]> => {
    const data = await boobpediaGet({ action: "query", list: "search", srsearch: query, srnamespace: "0", srlimit: "1", ...extra });
    const hits: { title: string }[] = data?.query?.search ?? [];
    return hits.map((hit) => ({ title: hit.title, url: boobpediaPageUrl(hit.title) }));
  };
  const titleMatches = await search();
  return titleMatches.length ? titleMatches : search({ srwhat: "text" });
}

async function boobpediaDetails(title: string): Promise<ActressLookupDetails | null> {
  const data = await boobpediaGet({ action: "parse", page: title, prop: "wikitext" });
  const wikitext: string | undefined = data?.parse?.wikitext?.["*"];
  if (!wikitext) return null;
  const box = wikitext.match(/\{\{Biobox[^\n]*\n([\s\S]*?)\n\}\}/i)?.[1] ?? wikitext;
  const field = (key: string): string | null => {
    const match = box.match(new RegExp(`^\\|[ \\t]*${key}[ \\t]*=[ \\t]*(.*)$`, "im"));
    const value = match ? cleanWikiValue(match[1] ?? "") : "";
    return value || null;
  };
  const name = field("name") ?? title;
  const aliases = (field("alias") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const photo = box.match(/\|[ \t]*photo[ \t]*=[ \t]*\[\[(?:File|Image):([^\]|]+)/i)?.[1]?.trim();
  let imageUrl: string | null = null;
  if (photo) {
    const imageData = await boobpediaGet({ action: "query", titles: `File:${photo}`, prop: "imageinfo", iiprop: "url" });
    const pages = imageData?.query?.pages ?? {};
    const page = Object.values(pages)[0] as { imageinfo?: { url?: string }[] } | undefined;
    imageUrl = page?.imageinfo?.[0]?.url ?? null;
  }
  return { name: decodeEntities(name), otherNames: aliases.map(decodeEntities), imageUrl, sourceUrl: boobpediaPageUrl(title) };
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
}

async function iafdHtml(url: string): Promise<string> {
  return loadPageHtml(url, {
    timeoutMs: 15000,
    pollIntervalMs: 400,
    isReady: (html) => /<h1\b/i.test(html) && (/<div\s+id=["']headshot/i.test(html) || /tblFem/i.test(html)),
  });
}

async function iafdSearch(query: string): Promise<SearchMatch[]> {
  const url = `https://www.iafd.com/results.asp?searchtype=comprehensive&searchstring=${encodeURIComponent(query)}`;
  const html = await iafdHtml(url);
  const table = html.match(/<table\s+id=["']tblFem["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const firstRow = table.match(/<tr\s+class=["'](?:odd|even)["'][\s\S]*?<\/tr>/i);
  const href = firstRow?.[0].match(/<a\s+href=["']([^"']+)/i)?.[1];
  return href ? [{ title: href, url: new URL(href, IAFD_BASE).toString() }] : [];
}

async function iafdDetails(title: string): Promise<ActressLookupDetails | null> {
  const sourceUrl = new URL(title, IAFD_BASE).toString();
  const html = await iafdHtml(sourceUrl);
  const stripParenthetical = (value: string): string => value.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  const name = html.match(/<h1>\s*([^<]+?)\s*<\/h1>/i)?.[1];
  if (!name) return null;
  const imageUrl = html.match(/<div\s+id=["']headshot["'][^>]*>\s*<img[^>]+src=["']([^"']+)/i)?.[1] ?? null;
  const akaBlock = html.match(/<p\s+class=["']bioheading["']>\s*(?:Performer\s+)?AKA\s*<\/p>\s*<div\s+class=["']biodata["']>([\s\S]*?)<\/div>/i)?.[1] ?? "";
  const otherNames = akaBlock
    .split(/<br\s*\/?\s*>/i)
    .map(stripTags)
    .map(stripParenthetical)
    .filter((alias) => alias && !/^no known aliases?$/i.test(alias));
  const resolvedImageUrl = imageUrl ? new URL(imageUrl, sourceUrl).toString() : null;
  const imageDataUrl = resolvedImageUrl
    ? await loadImageDataUrl(resolvedImageUrl).catch(() => null)
    : null;
  return { name: stripParenthetical(stripTags(name)), otherNames, imageUrl: resolvedImageUrl, imageDataUrl, sourceUrl };
}

export async function lookupActress(provider: string, query: string): Promise<ActressLookupDetails | null> {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return null;
  const matches = provider === "iafd" ? await iafdSearch(normalizedQuery) : await boobpediaSearch(normalizedQuery);
  const first = matches[0];
  if (!first) return null;
  return provider === "iafd" ? iafdDetails(first.title) : boobpediaDetails(first.title);
}
