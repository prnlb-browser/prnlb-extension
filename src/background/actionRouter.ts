import browser from "webextension-polyfill";
import type { ExtensionMessage } from "../types";
import { isTopicListUrl, isTopicPageUrl } from "./urlMatcher";

const FEATURE_ENABLED_KEY = "prnlbFeatureEnabled";

function sendAction(
  tabId: number,
  action: "showCarousel" | "showTopicList",
): void {
  browser.tabs.sendMessage(tabId, { action }).catch((err) => {
    console.warn("Could not send message:", (err as Error).message);
  });
}

function sendDeactivate(tabId: number): void {
  browser.tabs.sendMessage(tabId, { action: "deactivate" }).catch((err) => {
    console.warn("Could not send deactivation:", (err as Error).message);
  });
}

function sendActionForTab(tab: browser.Tabs.Tab): void {
  if (tab.id === undefined) return;

  if (isTopicPageUrl(tab.url)) {
    sendAction(tab.id, "showCarousel");
    return;
  }

  if (isTopicListUrl(tab.url)) {
    sendAction(tab.id, "showTopicList");
  }
}

async function getFeatureEnabled(): Promise<boolean> {
  const stored = await browser.storage.local.get(FEATURE_ENABLED_KEY);
  return stored[FEATURE_ENABLED_KEY] !== false;
}

async function setFeatureEnabled(enabled: boolean): Promise<void> {
  await browser.storage.local.set({ [FEATURE_ENABLED_KEY]: enabled });
}

async function updateActionIndicator(enabled: boolean): Promise<void> {
  const title = enabled
    ? "PRNLB Viewer: enabled (click to disable)"
    : "PRNLB Viewer: disabled (click to enable)";
  await browser.action.setTitle({ title });
  await browser.action.setBadgeText({ text: enabled ? "ON" : "OFF" });
  await browser.action.setBadgeBackgroundColor({
    color: enabled ? "#15803d" : "#6b7280",
  });
}

export function registerActionRouter(): void {
  void getFeatureEnabled().then(updateActionIndicator).catch((err) => {
    console.warn("Could not read PRNLB Viewer state:", (err as Error).message);
  });

  browser.action.onClicked.addListener(async (tab) => {
    const enabled = await getFeatureEnabled();
    const nextEnabled = !enabled;
    await setFeatureEnabled(nextEnabled);
    await updateActionIndicator(nextEnabled);

    if (tab.id === undefined) return;
    if (nextEnabled) sendActionForTab(tab);
    else sendDeactivate(tab.id);
  });

  browser.runtime.onMessage.addListener(
    (rawMessage: unknown, sender: browser.Runtime.MessageSender) => {
      const message = rawMessage as ExtensionMessage;
      if (message.action !== "pageLoaded" || sender.tab === undefined) {
        return undefined;
      }

      return getFeatureEnabled().then((enabled) => {
        if (enabled) sendActionForTab(sender.tab!);
      });
    },
  );
}
