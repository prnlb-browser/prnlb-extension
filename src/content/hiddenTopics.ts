import browser from "webextension-polyfill";

const HIDDEN_TOPIC_IDS_KEY = "prnlbHiddenTopicIds";
const HIDE_HIDDEN_TOPICS_KEY = "prnlbHideHiddenTopics";
const DEFAULT_HIDE_HIDDEN_TOPICS = true;

export const TOPIC_LIST_SETTINGS_CHANGED_EVENT =
  "__prnlb_topic_list_settings_changed";

export interface TopicListSettings {
  hiddenTopicIds: Set<string>;
  hideHiddenTopics: boolean;
}

/** Use the topic id when available so different links to one topic share a flag. */
export function getTopicId(topicUrl: string): string {
  try {
    const url = new URL(topicUrl);
    const topicId = url.searchParams.get("t");
    if (topicId) return `topic:${topicId}`;

    url.hash = "";
    return `url:${url.toString()}`;
  } catch {
    return `url:${topicUrl}`;
  }
}

export async function getTopicListSettings(): Promise<TopicListSettings> {
  const stored = await browser.storage.local.get([
    HIDDEN_TOPIC_IDS_KEY,
    HIDE_HIDDEN_TOPICS_KEY,
  ]);
  const hiddenTopicIds = Array.isArray(stored[HIDDEN_TOPIC_IDS_KEY])
    ? stored[HIDDEN_TOPIC_IDS_KEY].filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    hiddenTopicIds: new Set(hiddenTopicIds),
    hideHiddenTopics:
      typeof stored[HIDE_HIDDEN_TOPICS_KEY] === "boolean"
        ? stored[HIDE_HIDDEN_TOPICS_KEY]
        : DEFAULT_HIDE_HIDDEN_TOPICS,
  };
}

export async function toggleTopicHidden(topicUrl: string): Promise<boolean> {
  const settings = await getTopicListSettings();
  const topicId = getTopicId(topicUrl);
  const hidden = settings.hiddenTopicIds.has(topicId);

  if (hidden) settings.hiddenTopicIds.delete(topicId);
  else settings.hiddenTopicIds.add(topicId);

  await browser.storage.local.set({
    [HIDDEN_TOPIC_IDS_KEY]: [...settings.hiddenTopicIds],
  });
  return !hidden;
}

export async function clearHiddenTopics(): Promise<void> {
  await browser.storage.local.remove(HIDDEN_TOPIC_IDS_KEY);
}

export async function setHideHiddenTopics(enabled: boolean): Promise<void> {
  await browser.storage.local.set({
    [HIDE_HIDDEN_TOPICS_KEY]: enabled,
  });
}

export function notifyTopicListSettingsChanged(): void {
  window.dispatchEvent(new Event(TOPIC_LIST_SETTINGS_CHANGED_EVENT));
}
