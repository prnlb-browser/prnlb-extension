import { loadPageHtml } from "../tabLoader";
import { resolverRegistry } from "../resolvers/registry";
import type { ScrapedImage } from "../resolvers/types";
import { extractTopicImages, firstPostBodyIsComplete } from "./topicParser";
import {
  TopicImageCache,
  type TopicImageCacheEntry,
} from "./topicImageCache";

export interface TopicPreviewResult {
  images: ScrapedImage[];
  previewUrl?: string;
}

/** Loads topic pages used by topic-list rows and owns their cancellation. */
export class TopicPreviewService {
  private readonly controllers = new Map<number, Set<AbortController>>();
  private readonly cache = new TopicImageCache();

  async loadTopicImages(
    topicUrl: string,
    senderTabId: number | undefined,
  ): Promise<TopicPreviewResult> {
    const cached = await this.cache.get(topicUrl);
    if (cached) return cached;

    const inFlight = this.cache.getInFlight(topicUrl, senderTabId);
    if (inFlight) return inFlight;

    const request = this.loadAndCacheTopicImages(topicUrl, senderTabId);
    this.cache.setInFlight(topicUrl, senderTabId, request);
    return request;
  }

  private async loadAndCacheTopicImages(
    topicUrl: string,
    senderTabId: number | undefined,
  ): Promise<TopicImageCacheEntry> {
    const controller = new AbortController();
    this.register(senderTabId, controller);

    try {
      const html = await loadPageHtml(topicUrl, {
        timeoutMs: 10000,
        pollIntervalMs: 250,
        isReady: (pageHtml) =>
          extractTopicImages(pageHtml, topicUrl).length > 0 &&
          firstPostBodyIsComplete(pageHtml),
        signal: controller.signal,
      });

      const images = extractTopicImages(html, topicUrl);
      const firstImage = images[0];
      const resolvedImages = firstImage
        ? await resolverRegistry.resolveImages(
            [firstImage],
            undefined,
            controller.signal,
          )
        : [];
      const resolvedPreview = firstImage
        ? resolvedImages.find(
            (image) => image.originalUrl === firstImage.resolveUrl,
          )?.resolvedUrl
        : undefined;

      const result = {
        images,
        // Use the resolved full-size image when supported and retain the
        // post's img[src] as the fallback for other hosts.
        previewUrl: resolvedPreview || firstImage?.thumbnailUrl,
      } satisfies TopicImageCacheEntry;

      if (!controller.signal.aborted) {
        await this.cache.set(topicUrl, result);
      }
      return result;
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.warn(
          `Could not load topic ${topicUrl}:`,
          (err as Error).message,
        );
      }
      return { images: [] };
    } finally {
      this.unregister(senderTabId, controller);
    }
  }

  abortTopicLoads(tabId: number | undefined): void {
    if (tabId === undefined) return;
    const controllers = this.controllers.get(tabId);
    controllers?.forEach((controller) => controller.abort());
    this.controllers.delete(tabId);
  }

  private register(
    tabId: number | undefined,
    controller: AbortController,
  ): void {
    if (tabId === undefined) return;
    let controllers = this.controllers.get(tabId);
    if (!controllers) {
      controllers = new Set();
      this.controllers.set(tabId, controllers);
    }
    controllers.add(controller);
  }

  private unregister(
    tabId: number | undefined,
    controller: AbortController,
  ): void {
    if (tabId === undefined) return;
    const controllers = this.controllers.get(tabId);
    controllers?.delete(controller);
    if (controllers?.size === 0) this.controllers.delete(tabId);
  }
}
