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

  async resolve(url: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.match(/^thumbs\d*\.imgbox\.com$/i)) {
        return this.resolveThumbnail(url);
      }
      if (parsed.hostname === "imgbox.com") {
        return await this.resolveFromPage(url, signal);
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

  private async resolveFromPage(pageUrl: string, signal?: AbortSignal): Promise<string | null> {
    const html = await this.fetchPage(pageUrl, signal);
    if (!html) return null;
    const fullUrl = this.extractFullImageUrl(html);
    if (!fullUrl) {
      console.error(`ImgboxResolver: Could not extract full-size image from ${pageUrl}`);
    }
    return fullUrl;
  }

  /**
   * Extract the full-size image URL from the imgbox page HTML, or null if
   * it isn't present yet.
   */
  private extractFullImageUrl(html: string): string | null {
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
    return null;
  }

  /**
   * Loads the page in a background tab, returning as soon as the full-size
   * image markup is present in the DOM rather than waiting for the whole
   * page (ads/trackers/etc.) to finish loading.
   */
  private async fetchPage(url: string, signal?: AbortSignal): Promise<string> {
    return loadPageHtml(url, {
      isReady: (html) => this.extractFullImageUrl(html) !== null,
      signal,
    });
  }
}
