import browser from "webextension-polyfill";
import type { ExtensionMessage } from "../types";
import { ImageResolutionService } from "./imageResolutionService";
import { TopicPreviewService } from "./topicPreviewService";
import { isTopicPageUrl } from "./urlMatcher";
import { lookupActress } from "./actressLookup";
import { loadImageDataUrl } from "../tabLoader";

export function registerMessageRouter(
  topicPreviewService: TopicPreviewService,
  imageResolutionService: ImageResolutionService,
): void {
  browser.runtime.onMessage.addListener(
    (rawMessage: unknown, sender: browser.Runtime.MessageSender) => {
      const message = rawMessage as ExtensionMessage;
      const senderTabId = sender.tab?.id;

      if (message.action === "abortResolution") {
        imageResolutionService.abortResolution(senderTabId);
        return Promise.resolve();
      }

      if (message.action === "abortTopicLoads") {
        topicPreviewService.abortTopicLoads(senderTabId);
        return Promise.resolve();
      }

      if (message.action === "loadTopicImages") {
        if (!isTopicPageUrl(message.url)) {
          return Promise.resolve({ images: [] });
        }
        return topicPreviewService.loadTopicImages(
          message.url,
          senderTabId,
          message.highlightActresses === true,
        );
      }

      if (message.action === "resolveImages") {
        if (!Array.isArray(message.images) || message.images.length === 0) {
          return Promise.resolve({ images: [] });
        }
        return imageResolutionService.resolveImages(message.images, senderTabId);
      }

      if (message.action === "lookupActress") {
        return lookupActress(message.provider, message.query);
      }

      if (message.action === "cacheImage") {
        return loadImageDataUrl(message.url)
          .then((imageDataUrl) => ({ imageDataUrl }))
          .catch(() => ({ imageDataUrl: null }));
      }

      if (message.action === "openActressSearch") {
        const url = new URL("https://pornolab.net/forum/tracker.php");
        url.searchParams.set("nm", message.name);
        return browser.tabs.create({ url: url.toString(), active: true });
      }

      return undefined;
    },
  );
}
