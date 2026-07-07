import type { ImageHostResolver } from "./types";

/**
 * Resolver for images hosted on fastpic.org.
 *
 * Handles URLs like:
 *   https://i122.fastpic.org/thumb/2023/1001/9d/387ccd6fe21d83ff5f740e7a9b11239d.jpeg
 *
 * Resolution process:
 * 1. Parse the thumbnail URL to construct the view page URL
 * 2. Fetch the HTML of the view page
 * 3. Extract the full-size image URL from the HTML
 */
export class FastpicResolver implements ImageHostResolver {
  name = "fastpic";

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        parsed.hostname.endsWith(".fastpic.org") &&
        /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(parsed.pathname)
      ) || (
        (parsed.hostname === "fastpic.org" || parsed.hostname === "www.fastpic.org") &&
        parsed.pathname.includes("/view/")
      );
    } catch {
      return false;
    }
  }

  async resolve(url: string): Promise<string | null> {
    try {
      // Fetch the page directly — if it's a thumbnail URL, fastpic will
      // 302 redirect us to the view page, which fetch() follows automatically.
      const html = await this.fetchPage(url);

      // Look for the full-size image URL in the HTML.
      const bigUrl = this.extractBigImageUrl(html);
      if (bigUrl) return bigUrl;

      // If the HTML contained no big-image link but the original URL is itself
      // already a /big/ image, use it directly as the fallback.
      const parsed = new URL(url);
      if (/^\/big\//i.test(parsed.pathname)) {
        console.warn(`FastpicResolver: No big image link found in HTML, falling back to original URL: ${url}`);
        parsed.protocol = "https:";
        return parsed.toString();
      }

      return null;
    } catch (err) {
      console.error(`FastpicResolver: Failed to resolve ${url}:`, (err as Error).message);

      // On fetch error, if the URL is already a /big/ image, use it as fallback.
      try {
        const parsed = new URL(url);
        if (/^\/big\//i.test(parsed.pathname)) {
          parsed.protocol = "https:";
          return parsed.toString();
        }
      } catch {}

      return null;
    }
  }

  /**
   * Extract the big image URL from the fastpic view page HTML.
   * Looks for URLs matching the fastpic big image pattern.
   * Always returns HTTPS URLs.
   */
  private extractBigImageUrl(html: string): string | null {
    const normalizedHtml = html.replace(/\s+/g, " ");

    // Pattern 1: Look for <img> tags with big image URLs
    const imgRegex = /<img[^>]+src=["'](https?:\/\/i\d+\.fastpic\.org\/big\/[^"']+)["']/i;
    const imgMatch = normalizedHtml.match(imgRegex);
    if (imgMatch) {
      return this.upgradeToHttps(this.decodeHtmlEntities(imgMatch[1]!));
    }

    // Pattern 2: Look for direct URL references to big images in any attribute
    const urlRegex = /(https?:\/\/i\d+\.fastpic\.org\/big\/[^\s<>"']+)/i;
    const urlMatch = normalizedHtml.match(urlRegex);
    if (urlMatch) {
      return this.upgradeToHttps(this.decodeHtmlEntities(urlMatch[1]!));
    }

    return null;
  }

  private upgradeToHttps(url: string): string {
    return url.replace(/^http:/i, "https:");
  }

  private decodeHtmlEntities(str: string): string {
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  }

  /**
   * Fetch a page's HTML content. fetch() follows redirects automatically.
   * Upgrades HTTP to HTTPS to match manifest host_permissions so Chrome
   * bypasses CORS restrictions for the background service worker.
   */
  private async fetchPage(url: string): Promise<string> {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      url = parsed.toString();
    }
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.text();
  }
}
