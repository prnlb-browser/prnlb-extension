import browser from "webextension-polyfill";
import type { ExtensionMessage } from "../types";
import { isTopicListUrl, isTopicPageUrl } from "./urlMatcher";
import {
  getRunOnlyOnTopicPage,
  RUN_ONLY_ON_TOPIC_PAGE_KEY,
} from "../settings";

const FEATURE_ENABLED_KEY = "prnlbFeatureEnabled";

function sendAction(
  tabId: number,
  action: "activateTopicPage" | "showTopicList",
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

async function sendActionForTab(tab: browser.Tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;

  if (isTopicPageUrl(tab.url)) {
    sendAction(tab.id, "activateTopicPage");
    return;
  }

  if (isTopicListUrl(tab.url)) {
    if (await getRunOnlyOnTopicPage()) {
      sendDeactivate(tab.id);
    } else {
      sendAction(tab.id, "showTopicList");
    }
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

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (
      areaName !== "local" ||
      changes[RUN_ONLY_ON_TOPIC_PAGE_KEY]?.newValue !== true
    ) {
      return;
    }

    void browser.tabs
      .query({})
      .then((tabs) => {
        for (const tab of tabs) {
          if (tab.id !== undefined && isTopicListUrl(tab.url)) {
            sendDeactivate(tab.id);
          }
        }
      })
      .catch((err) => {
        console.warn("Could not deactivate topic list tabs:", (err as Error).message);
      });
  });

  browser.action.onClicked.addListener(async (tab) => {
    const enabled = await getFeatureEnabled();
    const nextEnabled = !enabled;
    await setFeatureEnabled(nextEnabled);
    await updateActionIndicator(nextEnabled);

    if (tab.id === undefined) return;
    if (nextEnabled) void sendActionForTab(tab);
    else sendDeactivate(tab.id);
  });

  browser.runtime.onMessage.addListener(
    (rawMessage: unknown, sender: browser.Runtime.MessageSender) => {
      const message = rawMessage as ExtensionMessage;
      if (message.action !== "pageLoaded" || sender.tab === undefined) {
        return undefined;
      }

      return getFeatureEnabled().then((enabled) => {
        if (enabled) void sendActionForTab(sender.tab!);
      });
    },
  );
}
