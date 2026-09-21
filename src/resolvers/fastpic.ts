import type { ImageHostResolver } from "./types";
import { loadPageHtml } from "../tabLoader";

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

  async resolve(url: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const pageUrl = this.buildViewPageUrl(url);
      if (!pageUrl) return null;

      const html = await this.fetchPage(pageUrl, signal);
      const bigUrl = this.extractBigImageUrl(html);
      if (bigUrl) return bigUrl;

      // Fastpic may first return an interstitial page. Its continuation link
      // leads to the same view page with a short-lived query parameter, and
      // that page links to the fullview page containing the signed image URL.
      const continuationUrl = this.extractContinuationUrl(html, pageUrl);
      const continuationHtml = continuationUrl
        ? await this.fetchPage(continuationUrl, signal)
        : html;
      const continuationBigUrl = this.extractBigImageUrl(continuationHtml);
      if (continuationBigUrl) return continuationBigUrl;

      const fullViewUrl =
        this.extractFullViewUrl(continuationHtml) || this.extractFullViewUrl(html);
      if (fullViewUrl) {
        const fullViewHtml = await this.fetchPage(fullViewUrl, signal);
        const fullViewBigUrl = this.extractBigImageUrl(fullViewHtml);
        if (fullViewBigUrl) return fullViewBigUrl;
      }

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
   * Convert a Fastpic thumbnail or direct image URL to its public view page.
   * View-page URLs are already suitable and are returned unchanged.
   * Returns null if the URL cannot be parsed.
   */
  private buildViewPageUrl(url: string): string | null {
    try {
      const parsed = new URL(url);

      // Already a view page URL — return as-is
      if (
        (parsed.hostname === "fastpic.org" || parsed.hostname === "www.fastpic.org") &&
        parsed.pathname.startsWith("/view/")
      ) {
        return parsed.toString();
      }

      // Thumbnail/direct image URL: i<N>.fastpic.org/{big|thumb}/YYYY/MMDD/.../file.ext
      const hostMatch = parsed.hostname.match(/^i(\d+)\.fastpic\.org$/i);
      if (!hostMatch) return null;

      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length < 4 || !["big", "thumb"].includes(parts[0]!)) return null;

      const year = parts[1]!;
      const date = parts[2]!;
      const fileName = parts.at(-1)!;
      const extMatch = fileName.match(/\.(jpe?g|png|gif|webp|bmp)$/i);
      if (!extMatch) return null;
      const ext = extMatch[1]!;
      const stem = fileName.slice(0, -extMatch[0].length);
      if (!year || !date || !stem) return null;

      // The view page's md5 token is signed for the requested extension —
      // fastpic serves .jpeg and .jpg from the same stem as distinct files,
      // so a mismatched extension here produces a token whose big-image
      // URL 404s. Preserve the original extension rather than assuming .jpg.
      return `https://fastpic.org/view/${hostMatch[1]}/${year}/${date}/${stem}.${ext}.html`;
    } catch {
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

    // Fullview pages put the signed URL in a script variable. Check this
    // before generic markup so an unrelated 1x1 tracking image cannot win.
    const loadingImageMatch = normalizedHtml.match(
      /\bloading_img\s*=\s*["']((?:https?:)?\/\/i\d+\.fastpic\.org\/big\/[^"']+)["']/i,
    );
    if (loadingImageMatch?.[1]) {
      return this.normalizeImageUrl(loadingImageMatch[1]);
    }

    // Rendered view pages assign the signed URL to an image or download link.
    // Restrict this lookup to HTML attributes to avoid ad/tracker CSS URLs.
    const attributeRegex =
      /\b(?:src|href|data-src|data-original)\s*=\s*["']((?:https?:)?\/\/i\d+\.fastpic\.org\/big\/[^"']+)["']/gi;
    const attributeMatch = attributeRegex.exec(normalizedHtml);
    if (attributeMatch?.[1]) {
      return this.normalizeImageUrl(attributeMatch[1]);
    }

    return null;
  }

  private extractFullViewUrl(html: string): string | null {
    const match = html.match(
      /https:\/\/(?:www\.)?fastpic\.org\/fullview\/[^\s<>'"]+/i,
    );
    return match?.[0]?.replace(/&amp;/g, "&").replace(/[),;]+$/, "") ?? null;
  }

  private extractContinuationUrl(html: string, pageUrl: string): string | null {
    let page: URL;
    try {
      page = new URL(pageUrl);
    } catch {
      return null;
    }

    const hrefRegex = /\bhref\s*=\s*["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      try {
        const candidate = new URL(this.decodeHtmlEntities(match[1]!), pageUrl);
        if (
          candidate.origin === page.origin &&
          candidate.pathname === page.pathname &&
          candidate.search &&
          !candidate.searchParams.has("lang") &&
          !candidate.searchParams.has("info") &&
          !candidate.searchParams.has("codes")
        ) {
          return candidate.toString();
        }
      } catch {
        // Ignore unrelated or malformed links.
      }
    }
    return null;
  }

  private normalizeImageUrl(value: string): string {
    const decoded = this.decodeHtmlEntities(value).trim();
    return this.upgradeToHttps(decoded.startsWith("//") ? `https:${decoded}` : decoded);
  }

  private upgradeToHttps(url: string): string {
    return url.replace(/^http:/i, "https:");
  }

  private decodeHtmlEntities(str: string): string {
    return str.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  }

  /**
   * Fetch a page's HTML content by loading it in a real (background) browser
   * tab and extracting the rendered DOM. Upgrades HTTP to HTTPS to match
   * manifest host_permissions.
   *
   * Rather than waiting for the tab to fully finish loading (slow — the
   * view page pulls in ads/trackers/etc.), we poll the DOM as it renders
   * and return as soon as the big-image markup we need is present.
   */
  private async fetchPage(url: string, signal?: AbortSignal): Promise<string> {
    const parsed = new URL(url);
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
      url = parsed.toString();
    }
    return loadPageHtml(url, {
      isReady: (html) => this.extractBigImageUrl(html) !== null,
      signal,
    });
  }
}
