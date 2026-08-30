import browser from "webextension-polyfill";
import { resolverRegistry } from "./resolvers/registry";
import type { ExtensionMessage } from "./types";

// Store AbortController per tab so we can abort from content script if dialog closes
const resolutionControllers = new Map<number, AbortController>();

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
  (message: ExtensionMessage, sender) => {
    // Handle abort signal from content script (e.g., user closed the carousel dialog)
    if (message.action === "abortResolution") {
      const senderTabId = sender.tab?.id;
      if (senderTabId !== undefined) {
        const controller = resolutionControllers.get(senderTabId);
        if (controller) {
          controller.abort();
        }
      }
      return Promise.resolve();
    }

    if (message.action === "resolveImages") {
      const images = message.images;
      if (!Array.isArray(images) || images.length === 0) {
        return Promise.resolve({ images: [] });
      }

      const senderTabId = sender.tab?.id;

      // Abort resolution early if:
      // 1. The carousel dialog is closed (user sends abortResolution message)
      // 2. The tab that requested it is closed
      // 3. The tab navigates away from Pornolab topic page
      const controller = new AbortController();
      if (senderTabId !== undefined) {
        resolutionControllers.set(senderTabId, controller);
      }

      const onTabRemoved = (removedTabId: number) => {
        if (removedTabId === senderTabId) controller.abort();
      };

      const onTabUpdated = (
        updatedTabId: number,
        changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
        tab: browser.Tabs.Tab
      ) => {
        if (updatedTabId !== senderTabId) return;
        // If the tab URL changed and is no longer a Pornolab topic page, abort
        if (
          changeInfo.url &&
          !changeInfo.url.includes("pornolab.net/forum/viewtopic.php")
        ) {
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
          (p) => {
            if (senderTabId === undefined) return;
            browser.tabs
              .sendMessage(senderTabId, { action: "resolveProgress", ...p })
              .catch(() => {});
          },
          controller.signal,
        )
        .then((resolved) => {
          return { images: resolved };
        })
        .finally(() => {
          if (senderTabId !== undefined) {
            resolutionControllers.delete(senderTabId);
          }
          browser.tabs.onRemoved.removeListener(onTabRemoved);
          browser.tabs.onUpdated.removeListener(onTabUpdated);
        });
    }
  }
);