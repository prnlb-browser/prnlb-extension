import type { ImageHostResolver } from "./types";

export class FastpicResolver implements ImageHostResolver {
  name = "fastpic";

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.endsWith(".fastpic.org") &&
        parsed.pathname.includes("/thumb/")
      );
    } catch {
      return false;
    }
  }

  async resolve(thumbUrl: string): Promise<string | null> {
    try {
      const viewPageUrl = this.buildViewPageUrl(thumbUrl);
      if (!viewPageUrl) return null;
      const html = await this.fetchPage(viewPageUrl);
      const bigUrl = this.extractBigImageUrl(html);
      return bigUrl;
    } catch (err) {
      console.error(`FastpicResolver: Failed to resolve ${thumbUrl}:`, (err as Error).message);
      return null;
    }
  }

  private buildViewPageUrl(thumbUrl: string): string | null {
    try {
      const parsed = new URL(thumbUrl);
      const hostname = parsed.hostname;
      const hostMatch = hostname.match(/^i(\d+)\.fastpic\.org$/i);
      if (!hostMatch) return null;
      const numericId = hostMatch[1]!;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 4 || parts[0] !== "thumb") return null;
      const year = parts[1]!;
      const monthDay = parts[2]!;
      const fileName = parts[parts.length - 1]!;
      const baseName = fileName.replace(/\.[^.]+$/, "");
      const viewFileName = `${baseName}.jpg`;
      return `https://fastpic.org/view/${numericId}/${year}/${monthDay}/${viewFileName}.html`;
    } catch {
      return null;
    }
  }

  private extractBigImageUrl(html: string): string | null {
    const normalizedHtml = html.replace(/\s+/g, " ");
    const imgRegex = /<img[^>]+src=["'](https:\/\/i\d+\.fastpic\.org\/big\/[^"']+)["']/i;
    const imgMatch = normalizedHtml.match(imgRegex);
    if (imgMatch) {
      return this.decodeHtmlEntities(imgMatch[1]!);
    }
    const urlRegex = /(https:\/\/i\d+\.fastpic\.org\/big\/[^\s<>"']+)/i;
    const urlMatch = normalizedHtml.match(urlRegex);
    if (urlMatch) {
      return this.decodeHtmlEntities(urlMatch[1]!);
    }
    return null;
  }

  private decodeHtmlEntities(str: string): string {
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  }

  private async fetchPage(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
}
