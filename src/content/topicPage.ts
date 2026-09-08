import { extractImagesFromPost, findFirstPostImage } from "./imageExtractor";
import { openCarousel } from "./carousel";

const TOPIC_BUTTON_ID = "__prnlb_topic_button";

let observer: MutationObserver | null = null;
let buttonHost: HTMLElement | null = null;
let wrappedImage: HTMLImageElement | null = null;
let imageWrapper: HTMLSpanElement | null = null;
let originalHostStyle: string | null = null;

function createTopicButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.id = TOPIC_BUTTON_ID;
  button.type = "button";
  button.textContent = "📷";
  button.title = "View screenshots from this topic";
  button.setAttribute("aria-label", "View screenshots from this topic");
  button.style.cssText =
    "position:absolute;top:6px;left:6px;z-index:5;width:36px;height:32px;box-sizing:border-box;padding:2px;border:1px solid rgba(0,0,0,.45);border-radius:4px;background:rgba(255,255,255,.92);color:#222;font-size:18px;line-height:1;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCarousel(extractImagesFromPost());
  });
  return button;
}

function prepareHost(host: HTMLElement): void {
  originalHostStyle = host.getAttribute("style");
  const computed = getComputedStyle(host);
  if (computed.position === "static") host.style.position = "relative";
  if (computed.display === "inline") host.style.display = "inline-block";
  buttonHost = host;
}

function injectButton(image: HTMLImageElement): void {
  if (document.getElementById(TOPIC_BUTTON_ID)) return;

  const parent = image.parentElement;
  const canUseParent =
    parent instanceof HTMLElement &&
    (parent.matches("a, var.postImg, figure") || parent.children.length === 1);

  const button = createTopicButton();
  if (canUseParent && parent) {
    prepareHost(parent);
    parent.appendChild(button);
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.style.cssText =
    "position:relative;display:inline-block;max-width:100%;line-height:0;";
  image.replaceWith(wrapper);
  wrapper.append(image, button);
  imageWrapper = wrapper;
  wrappedImage = image;
}

function tryInjectButton(): boolean {
  const image = findFirstPostImage();
  if (!image) return false;
  injectButton(image);
  return true;
}

export function activateTopicPageMode(): void {
  if (document.getElementById(TOPIC_BUTTON_ID)) return;
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
  document.getElementById(TOPIC_BUTTON_ID)?.remove();
}
