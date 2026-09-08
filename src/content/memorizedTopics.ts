import browser from "webextension-polyfill";
import { getTopicId } from "./hiddenTopics";

export interface MemorizedTopic {
  topicId: string;
  topicUrl: string;
  title: string;
  cast: string;
  imageUrl: string | null;
  createdAt: number;
}

export interface MemorizedTopicInput {
  topicUrl: string;
  title?: string;
  cast?: string;
  imageUrl?: string | null;
}

const MEMORIZED_TOPICS_KEY = "prnlbMemorizedTopics";
let mutationQueue: Promise<void> = Promise.resolve();

function decodeTopic(value: unknown): MemorizedTopic | null {
  if (typeof value === "string" && value.trim()) {
    return {
      topicId: getTopicId(value),
      topicUrl: value,
      title: "",
      cast: "",
      imageUrl: null,
      createdAt: Date.now(),
    };
  }
  if (!value || typeof value !== "object") return null;

  const raw = value as Partial<MemorizedTopic>;
  const topicUrl =
    typeof raw.topicUrl === "string" && raw.topicUrl.trim()
      ? raw.topicUrl.trim()
      : null;
  if (!topicUrl) return null;

  return {
    topicId:
      typeof raw.topicId === "string" && raw.topicId
        ? raw.topicId
        : getTopicId(topicUrl),
    topicUrl,
    title: typeof raw.title === "string" ? raw.title.trim() : "",
    cast: typeof raw.cast === "string" ? raw.cast.trim() : "",
    imageUrl:
      typeof raw.imageUrl === "string" && raw.imageUrl.trim()
        ? raw.imageUrl.trim()
        : null,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
  };
}

export async function getMemorizedTopics(): Promise<MemorizedTopic[]> {
  const stored = await browser.storage.local.get(MEMORIZED_TOPICS_KEY);
  const raw = stored[MEMORIZED_TOPICS_KEY];
  if (!Array.isArray(raw)) return [];

  const topics: MemorizedTopic[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const topic = decodeTopic(value);
    if (!topic || seen.has(topic.topicId)) continue;
    seen.add(topic.topicId);
    topics.push(topic);
  }
  return topics;
}

async function saveMemorizedTopics(topics: MemorizedTopic[]): Promise<void> {
  await browser.storage.local.set({ [MEMORIZED_TOPICS_KEY]: topics });
}

function queueMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const operation = mutationQueue.then(mutation, mutation);
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

export async function toggleMemorizedTopic(
  input: MemorizedTopicInput,
): Promise<boolean> {
  return queueMutation(async () => {
    const topics = await getMemorizedTopics();
    const topicId = getTopicId(input.topicUrl);
    const existingIndex = topics.findIndex((topic) => topic.topicId === topicId);

    if (existingIndex >= 0) {
      topics.splice(existingIndex, 1);
      await saveMemorizedTopics(topics);
      return false;
    }

    topics.push({
      topicId,
      topicUrl: input.topicUrl,
      title: input.title?.trim() ?? "",
      cast: input.cast?.trim() ?? "",
      imageUrl: input.imageUrl?.trim() || null,
      createdAt: Date.now(),
    });
    await saveMemorizedTopics(topics);
    return true;
  });
}

/** Save preview details when a memorized topic finishes loading in a list. */
export async function updateMemorizedTopic(
  topicUrl: string,
  details: Pick<MemorizedTopic, "title" | "cast" | "imageUrl">,
): Promise<void> {
  return queueMutation(async () => {
    const topics = await getMemorizedTopics();
    const topic = topics.find((item) => item.topicId === getTopicId(topicUrl));
    if (!topic) return;

    if (details.title.trim()) topic.title = details.title.trim();
    if (details.cast.trim()) topic.cast = details.cast.trim();
    if (details.imageUrl?.trim()) topic.imageUrl = details.imageUrl.trim();
    await saveMemorizedTopics(topics);
  });
}

export async function removeMemorizedTopic(topicUrl: string): Promise<boolean> {
  return queueMutation(async () => {
    const topics = await getMemorizedTopics();
    const next = topics.filter((topic) => topic.topicId !== getTopicId(topicUrl));
    if (next.length === topics.length) return false;
    await saveMemorizedTopics(next);
    return true;
  });
}
