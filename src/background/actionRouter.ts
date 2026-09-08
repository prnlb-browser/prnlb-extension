import browser from "webextension-polyfill";
import { isTopicListUrl, isTopicPageUrl } from "./urlMatcher";

function sendAction(
  tabId: number,
  action: "showCarousel" | "showTopicList",
): void {
  browser.tabs.sendMessage(tabId, { action }).catch((err) => {
    console.warn("Could not send message:", (err as Error).message);
  });
}

export function registerActionRouter(): void {
  browser.action.onClicked.addListener((tab) => {
    if (tab.id === undefined) return;

    if (isTopicPageUrl(tab.url)) {
      sendAction(tab.id, "showCarousel");
      return;
    }

    if (isTopicListUrl(tab.url)) {
      sendAction(tab.id, "showTopicList");
    }
  });
}
