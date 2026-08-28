import browser from "webextension-polyfill";
import { resolverRegistry } from "./resolvers/registry";
import type { ExtensionMessage } from "./types";

// ===== Icon-click handler =====

browser.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  if (!tab.url?.includes("pornolab.net/forum/viewtopic.php")) return;

  browser.tabs.sendMessage(tab.id, { action: "showCarousel" }).catch((err) => {
    console.warn("Could not send message:", (err as Error).message);
  });
});

// ===== Message proxy: content script sends images, background resolves them =====

browser.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender) => {
    if (message.action === "resolveImages") {
      const images = message.images;
      if (!Array.isArray(images) || images.length === 0) {
        return Promise.resolve({ images: [] });
      }

      return resolverRegistry.resolveImages(images).then((resolved) => {
        return { images: resolved };
      });
    }
  }
);