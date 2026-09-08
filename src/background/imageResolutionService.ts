import browser from "webextension-polyfill";
import { resolverRegistry } from "../resolvers/registry";
import type { ResolvedImage, ScrapedImage } from "../resolvers/types";
import { isTopicPageUrl } from "./urlMatcher";

/** Resolves carousel images and owns cancellation tied to the requesting tab. */
export class ImageResolutionService {
  private readonly controllers = new Map<number, AbortController>();

  abortResolution(tabId: number | undefined): void {
    if (tabId === undefined) return;
    this.controllers.get(tabId)?.abort();
  }

  async resolveImages(
    images: ScrapedImage[],
    senderTabId: number | undefined,
  ): Promise<{ images: ResolvedImage[] }> {
    const controller = new AbortController();
    if (senderTabId !== undefined) {
      this.controllers.set(senderTabId, controller);
    }

    const onTabRemoved = (removedTabId: number): void => {
      if (removedTabId === senderTabId) controller.abort();
    };

    const onTabUpdated = (
      updatedTabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
      tab: browser.Tabs.Tab,
    ): void => {
      if (updatedTabId !== senderTabId) return;
      if (changeInfo.url && !isTopicPageUrl(changeInfo.url || tab.url)) {
        controller.abort();
      }
    };

    if (senderTabId !== undefined) {
      browser.tabs.onRemoved.addListener(onTabRemoved);
      browser.tabs.onUpdated.addListener(onTabUpdated);
    }

    return resolverRegistry
      .resolveImages(
        images,
        (progress) => {
          if (senderTabId === undefined) return;
          browser.tabs
            .sendMessage(senderTabId, {
              action: "resolveProgress",
              ...progress,
            })
            .catch(() => {});
        },
        controller.signal,
      )
      .then((resolved) => ({ images: resolved }))
      .finally(() => {
        if (senderTabId !== undefined) {
          this.controllers.delete(senderTabId);
        }
        browser.tabs.onRemoved.removeListener(onTabRemoved);
        browser.tabs.onUpdated.removeListener(onTabUpdated);
      });
  }
}
