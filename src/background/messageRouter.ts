import browser from "webextension-polyfill";
import type { ExtensionMessage } from "../types";
import { ImageResolutionService } from "./imageResolutionService";
import { TopicPreviewService } from "./topicPreviewService";
import { isTopicPageUrl } from "./urlMatcher";

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
        return topicPreviewService.loadTopicImages(message.url, senderTabId);
      }

      if (message.action === "resolveImages") {
        if (!Array.isArray(message.images) || message.images.length === 0) {
          return Promise.resolve({ images: [] });
        }
        return imageResolutionService.resolveImages(message.images, senderTabId);
      }

      return undefined;
    },
  );
}
