import { resolverRegistry } from "./resolvers/registry";
import type { ExtensionMessage } from "./types";

// ===== Icon-click handler =====

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  if (!tab.url?.includes("pornolab.net/forum/viewtopic.php")) return;

  chrome.tabs.sendMessage(tab.id, { action: "showCarousel" }).catch((err) => {
    console.warn("Could not send message:", (err as Error).message);
  });
});

// ===== Message proxy: content script sends images, background resolves them =====

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.action === "resolveImages") {
      const images = message.images;
      if (!Array.isArray(images) || images.length === 0) {
        sendResponse({ images: [] });
        return true;
      }

      resolverRegistry.resolveImages(images).then((resolved) => {
        sendResponse({ images: resolved });
      });

      return true; // Keep channel open for async sendResponse
    }
  }
);