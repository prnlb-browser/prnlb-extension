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

// ===== Message proxy: content script sends URLs, background resolves them =====

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    if (message.action === "resolveImages") {
      const urls = message.urls;
      if (!Array.isArray(urls) || urls.length === 0) {
        sendResponse({ images: [] });
        return true;
      }

      resolverRegistry.resolveImages(urls).then((images) => {
        sendResponse({ images });
      });

      return true; // Keep channel open for async sendResponse
    }
  }
);