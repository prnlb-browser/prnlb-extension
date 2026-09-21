import type { ImageHostResolver } from "./types";
import { loadPageHtml } from "../tabLoader";

/** Resolver for Picshick/ImageTwist image pages and thumbnails. */
export class PicshickResolver implements ImageHostResolver {
  name = "picshick";

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        ((parsed.hostname === "picshick.com" ||
          parsed.hostname === "www.picshick.com") &&
          /^\/[^/]+\/[^/]+$/i.test(parsed.pathname)) ||
        (/^img\d+\.picshick\.com$/i.test(parsed.hostname) &&
          /^\/(?:th|i)\//i.test(parsed.pathname))
      );
    } catch {
      return false;
    }
  }

  async resolve(url: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const parsed = new URL(url);
      if (/^img\d+\.picshick\.com$/i.test(parsed.hostname)) {
        if (/^\/i\//i.test(parsed.pathname)) return parsed.toString();
        return this.thumbnailToImageUrl(parsed);
      }

      const html = await loadPageHtml(url, {
        isReady: (pageHtml) => this.extractFullImageUrl(pageHtml) !== null,
        signal,
      });
      return this.extractFullImageUrl(html);
    } catch (err) {
      console.error(
        `PicshickResolver: Failed to resolve ${url}:`,
        (err as Error).message,
      );
      return null;
    }
  }

  private thumbnailToImageUrl(url: URL): string | null {
    const match = url.pathname.match(/^\/th\/([^/]+)\/([^/]+)$/i);
    if (!match) return null;
    url.pathname = `/i/${match[1]}/${match[2]}`;
    return url.toString();
  }

  private extractFullImageUrl(html: string): string | null {
    const normalizedHtml = html.replace(/\s+/g, " ");
    const match = normalizedHtml.match(
      /(?:src|href)\s*=\s*["'](https:\/\/img\d+\.picshick\.com\/i\/[^"']+)["']/i,
    );
    return match?.[1]?.replace(/&amp;/g, "&") ?? null;
  }
}
