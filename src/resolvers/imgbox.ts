import type { ImageHostResolver } from "./types";
import { loadPageHtml } from "../tabLoader";

export class ImgboxResolver implements ImageHostResolver {
  name = "imgbox";

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.endsWith(".imgbox.com") ||
        parsed.hostname === "imgbox.com"
      );
    } catch {
      return false;
    }
  }

  async resolve(url: string): Promise<string | null> {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.match(/^thumbs\d*\.imgbox\.com$/i)) {
        return this.resolveThumbnail(url);
      }
      if (parsed.hostname === "imgbox.com") {
        return await this.resolveFromPage(url);
      }
      if (parsed.hostname.match(/^images\d*\.imgbox\.com$/i)) {
        return url;
      }
      return null;
    } catch (err) {
      console.error(`ImgboxResolver: Failed to resolve ${url}:`, (err as Error).message);
      return null;
    }
  }

  private resolveThumbnail(thumbUrl: string): string {
    const parsed = new URL(thumbUrl);
    const fullHost = parsed.hostname.replace(/^thumbs/, "images");
    parsed.hostname = fullHost;
    parsed.pathname = parsed.pathname.replace(/_t\./i, "_o.");
    return parsed.toString();
  }

  private async resolveFromPage(pageUrl: string): Promise<string | null> {
    const html = await this.fetchPage(pageUrl);
    if (!html) return null;
    const normalizedHtml = html.replace(/\s+/g, " ");
    const imageContentRegex = /class="image-content"[^>]*>.*?<img[^>]+src=["'](https:\/\/images\d*\.imgbox\.com\/[^"']+)["']/is;
    const match = normalizedHtml.match(imageContentRegex);
    if (match) {
      return match[1]!;
    }
    const fallbackRegex = /src=["'](https:\/\/images\d*\.imgbox\.com\/[^"']*_o\.[^"']+)["']/i;
    const fallbackMatch = normalizedHtml.match(fallbackRegex);
    if (fallbackMatch) {
      return fallbackMatch[1]!;
    }
    console.error(`ImgboxResolver: Could not extract full-size image from ${pageUrl}`);
    return null;
  }

  private async fetchPage(url: string): Promise<string> {
    return loadPageHtml(url);
  }
}
