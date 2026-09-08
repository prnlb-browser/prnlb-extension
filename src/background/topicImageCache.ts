import browser from "webextension-polyfill";
import type { ScrapedImage } from "../resolvers/types";

export interface TopicImageCacheEntry {
  images: ScrapedImage[];
  previewUrl?: string;
}

const CACHE_KEY_PREFIX = "topicImageCache:";

/**
 * Session-scoped cache for topic-list post images.
 *
 * This deliberately does not participate in carousel resolution. The cache
 * contains scraped post images and the single resolved preview used by topic
 * lists, not resolved screenshot images.
 */
export class TopicImageCache {
  private readonly inFlight = new Map<string, Promise<TopicImageCacheEntry>>();

  async get(topicUrl: string): Promise<TopicImageCacheEntry | null> {
    const key = this.getKey(topicUrl);

    try {
      const stored = await browser.storage.session.get(key);
      const entry = stored[key];
      return this.isEntry(entry) ? entry : null;
    } catch (error) {
      console.warn("Could not read topic image cache:", error);
      return null;
    }
  }

  async set(topicUrl: string, entry: TopicImageCacheEntry): Promise<void> {
    try {
      await browser.storage.session.set({ [this.getKey(topicUrl)]: entry });
    } catch (error) {
      // A cache failure must not make an otherwise successful topic load fail.
      console.warn("Could not write topic image cache:", error);
    }
  }

  getInFlight(
    topicUrl: string,
    senderTabId: number | undefined,
  ): Promise<TopicImageCacheEntry> | undefined {
    return this.inFlight.get(this.getRequestKey(topicUrl, senderTabId));
  }

  setInFlight(
    topicUrl: string,
    senderTabId: number | undefined,
    request: Promise<TopicImageCacheEntry>,
  ): void {
    const key = this.getRequestKey(topicUrl, senderTabId);
    this.inFlight.set(key, request);
    void request.then(
      () => this.inFlight.delete(key),
      () => this.inFlight.delete(key),
    );
  }

  private getRequestKey(
    topicUrl: string,
    senderTabId: number | undefined,
  ): string {
    return `${this.getKey(topicUrl)}:tab:${senderTabId ?? "unknown"}`;
  }

  private getKey(topicUrl: string): string {
    try {
      const url = new URL(topicUrl);
      const topicId = url.searchParams.get("t");
      if (topicId) return `${CACHE_KEY_PREFIX}id:${topicId}`;
      return `${CACHE_KEY_PREFIX}url:${url.origin}${url.pathname}${url.search}`;
    } catch {
      return `${CACHE_KEY_PREFIX}url:${topicUrl}`;
    }
  }

  private isEntry(value: unknown): value is TopicImageCacheEntry {
    if (!value || typeof value !== "object") return false;
    const entry = value as Partial<TopicImageCacheEntry>;
    return (
      Array.isArray(entry.images) &&
      entry.images.every(
        (image) =>
          !!image &&
          typeof image === "object" &&
          typeof image.thumbnailUrl === "string" &&
          typeof image.resolveUrl === "string",
      ) &&
      (entry.previewUrl === undefined || typeof entry.previewUrl === "string")
    );
  }
}
