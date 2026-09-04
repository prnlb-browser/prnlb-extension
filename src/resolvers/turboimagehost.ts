import type { ImageHostResolver } from "./types";
import { loadPageHtml } from "../tabLoader";
import browser from "webextension-polyfill";

/**
 * Resolver for TurboImageHost image pages.
 *
 * TurboImageHost renders the actual image URL with JavaScript. The URL in a
 * Pornolab post is therefore the /p/<id>/<name>.html page, not the final
 * turboimg.net image URL. Loading that page in a real browser tab is
 * necessary for the image element to be populated.
 */
export class TurboImageHostResolver implements ImageHostResolver {
  name = "turboimagehost";

  canHandle(url: string): boolean {
    try {
      const parsed = new URL(url);
      return (
        (parsed.hostname === "turboimagehost.com" ||
          parsed.hostname === "www.turboimagehost.com") &&
        /^\/p\/\d+\/[^/]+\.html$/i.test(parsed.pathname)
      );
    } catch {
      return false;
    }
  }

  async resolve(url: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const html = await loadPageHtml(url, {
        isReady: (pageHtml) => this.extractFullImageUrl(pageHtml) !== null,
        signal,
        // Cloudflare's human check is rendered in this same page. Bring the
        // loader tab to the foreground so the user can complete it, then keep
        // polling that tab for the image to appear.
        onTimeout: async (tabId) => {
          const tab = await browser.tabs.get(tabId);
          if (tab.windowId !== undefined) {
            await browser.windows.update(tab.windowId, { focused: true });
          }
          await browser.tabs.update(tabId, { active: true });
        },
        timeoutAfterTimeoutMs: 120000,
        keepTabOpenOnTimeout: true,
      });
      return this.extractFullImageUrl(html);
    } catch (err) {
      console.error(
        `TurboImageHostResolver: Failed to resolve ${url}:`,
        (err as Error).message,
      );
      return null;
    }
  }

  /**
   * Extract the rendered full-size image from the page DOM.
   * TurboImageHost serves these as URLs such as:
   * https://s8d4.turboimg.net/sp/<token>/1.jpg
   *
   * Check the rendered image attributes rather than arbitrary page text so
   * that ads and share snippets cannot be mistaken for the requested image.
   */
  private extractFullImageUrl(html: string): string | null {
    const normalizedHtml = html.replace(/\s+/g, " ");
    const imageUrlPattern =
      "(https?:\\/\\/(?:[a-z0-9-]+\\.)?turboimg\\.net\\/sp\\/[a-z0-9]+\\/[^\\s<>\"']+)";
    const attributeRegex = new RegExp(
      `<img\\b[^>]+(?:src|data-src|data-original)=\\s*[\"']${imageUrlPattern}[\"']`,
      "i",
    );
    const match = normalizedHtml.match(attributeRegex);
    if (match?.[1]) return this.upgradeToHttps(this.decodeHtmlEntities(match[1]));

    // Some page versions put the URL in an inline/script-generated attribute
    // before assigning it to src. Accept the same constrained URL shape as a
    // fallback, while still excluding unrelated turboimg endpoints.
    const fallbackRegex = new RegExp(imageUrlPattern, "i");
    const fallbackMatch = normalizedHtml.match(fallbackRegex);
    return fallbackMatch?.[1]
      ? this.upgradeToHttps(this.decodeHtmlEntities(fallbackMatch[1]))
      : null;
  }

  private upgradeToHttps(url: string): string {
    return url.replace(/^http:/i, "https:");
  }

  private decodeHtmlEntities(value: string): string {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}
