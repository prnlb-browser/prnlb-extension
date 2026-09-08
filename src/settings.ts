import browser from "webextension-polyfill";

export const RUN_ONLY_ON_TOPIC_PAGE_KEY = "prnlbRunOnlyOnTopicPage";

export async function getRunOnlyOnTopicPage(): Promise<boolean> {
  const stored = await browser.storage.local.get(RUN_ONLY_ON_TOPIC_PAGE_KEY);
  return stored[RUN_ONLY_ON_TOPIC_PAGE_KEY] === true;
}

export async function setRunOnlyOnTopicPage(enabled: boolean): Promise<void> {
  await browser.storage.local.set({
    [RUN_ONLY_ON_TOPIC_PAGE_KEY]: enabled,
  });
}
