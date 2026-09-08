import browser from "webextension-polyfill";
import {
  extractImagesFromPost,
  findFirstPostImageTarget,
} from "./imageExtractor";
import { openCarousel } from "./carousel";
import { openOptionsDialog } from "./optionsDialog";
import { getTopicId } from "./hiddenTopics";
import {
  getMemorizedTopics,
  toggleMemorizedTopic,
} from "./memorizedTopics";

const TOPIC_BUTTON_ID = "__prnlb_topic_button";
const TOPIC_ACTIONS_ID = "__prnlb_topic_actions";

let observer: MutationObserver | null = null;
let buttonHost: HTMLElement | null = null;
let wrappedImage: HTMLImageElement | null = null;
let imageWrapper: HTMLSpanElement | null = null;
let originalHostStyle: string | null = null;

function currentTopicUrl(): string {
  const url = new URL(location.href);
  url.hash = "";
  return url.toString();
}

function createActionButton(
  title: string,
  text: string,
  width = 36,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.style.cssText =
    `display:block;width:${width}px;height:32px;box-sizing:border-box;padding:2px;border:1px solid rgba(0,0,0,.45);border-radius:4px;background:rgba(255,255,255,.92);color:#222;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);`;
  return button;
}

function updateMemorizeButton(
  button: HTMLButtonElement,
  memorized: boolean,
): void {
  button.setAttribute(
    "aria-label",
    memorized ? "Unmemorize topic" : "Memorize topic",
  );
  button.title = memorized ? "Unmemorize topic" : "Memorize topic";
  button.style.background = memorized
    ? "rgba(230,221,255,.96)"
    : "rgba(255,255,255,.92)";
}

function createTopicActions(): HTMLDivElement {
  const actions = document.createElement("div");
  actions.id = TOPIC_ACTIONS_ID;
  actions.style.cssText =
    "position:absolute;top:6px;left:6px;z-index:5;display:flex;align-items:flex-start;gap:4px;";

  const screenshotButton = createActionButton(
    "View screenshots from this topic",
    "📷",
  );
  screenshotButton.id = TOPIC_BUTTON_ID;
  screenshotButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCarousel(extractImagesFromPost());
  });

  const memorizeButton = createActionButton("Memorize topic", "🔖");
  let memorized = false;
  updateMemorizeButton(memorizeButton, memorized);
  void getMemorizedTopics()
    .then((topics) => {
      memorized = topics.some(
        (topic) => topic.topicId === getTopicId(currentTopicUrl()),
      );
      updateMemorizeButton(memorizeButton, memorized);
    })
    .catch(() => {});
  memorizeButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    memorizeButton.disabled = true;
    void toggleMemorizedTopic({
      topicUrl: currentTopicUrl(),
      title: document.title.trim(),
      imageUrl: extractImagesFromPost()[0]?.thumbnailUrl ?? null,
    })
      .then((nextMemorized) => {
        memorized = nextMemorized;
        updateMemorizeButton(memorizeButton, memorized);
      })
      .catch(() => {})
      .finally(() => {
        memorizeButton.disabled = false;
      });
  });

  const optionsButton = createActionButton("PRNLB Viewer options", "", 32);
  const icon = document.createElement("img");
  icon.src = browser.runtime.getURL("icon.png");
  icon.alt = "";
  icon.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
  optionsButton.appendChild(icon);
  optionsButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openOptionsDialog();
  });

  actions.append(screenshotButton, memorizeButton, optionsButton);
  return actions;
}

function prepareHost(host: HTMLElement): void {
  originalHostStyle = host.getAttribute("style");
  const computed = getComputedStyle(host);
  if (computed.position === "static") host.style.position = "relative";
  if (computed.display === "inline") host.style.display = "inline-block";
  buttonHost = host;
}

function injectButton(target: HTMLElement): void {
  if (document.getElementById(TOPIC_ACTIONS_ID)) return;

  const actions = createTopicActions();

  if (!(target instanceof HTMLImageElement)) {
    prepareHost(target);
    target.appendChild(actions);
    return;
  }

  const image = target;
  const parent = image.parentElement;
  const canUseParent =
    parent instanceof HTMLElement &&
    (parent.matches("a, var.postImg, figure") || parent.children.length === 1);

  if (canUseParent && parent) {
    prepareHost(parent);
    parent.appendChild(actions);
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.style.cssText =
    "position:relative;display:inline-block;max-width:100%;line-height:0;";
  image.replaceWith(wrapper);
  wrapper.append(image, actions);
  imageWrapper = wrapper;
  wrappedImage = image;
}

function tryInjectButton(): boolean {
  const target = findFirstPostImageTarget();
  if (!target) return false;
  injectButton(target);
  return true;
}

export function activateTopicPageMode(): void {
  if (document.getElementById(TOPIC_ACTIONS_ID)) return;
  if (tryInjectButton()) return;

  observer?.disconnect();
  observer = new MutationObserver(() => {
    if (tryInjectButton()) {
      observer?.disconnect();
      observer = null;
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function deactivateTopicPageMode(): void {
  observer?.disconnect();
  observer = null;

  if (imageWrapper && wrappedImage) {
    imageWrapper.replaceWith(wrappedImage);
  }
  imageWrapper = null;
  wrappedImage = null;

  if (buttonHost) {
    if (originalHostStyle === null) buttonHost.removeAttribute("style");
    else buttonHost.setAttribute("style", originalHostStyle);
  }
  buttonHost = null;
  originalHostStyle = null;
  document.getElementById(TOPIC_ACTIONS_ID)?.remove();
}
