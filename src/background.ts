import browser from "webextension-polyfill";
import { resolverRegistry } from "./resolvers/registry";
import { loadPageHtml } from "./tabLoader";
import type { ExtensionMessage } from "./types";
import type { ScrapedImage } from "./resolvers/types";

// Store AbortController per tab so we can abort from content script if dialog closes
const resolutionControllers = new Map<number, AbortController>();

// Topic-list previews can have several background tabs loading at once. Keep
// their controllers grouped by the list tab so outstanding loads can be
// stopped when the list is left.
const topicLoadControllers = new Map<number, Set<AbortController>>();

function isTopicPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "pornolab.net" &&
      parsed.pathname === "/forum/viewtopic.php"
    );
  } catch {
    return false;
  }
}

function isTopicListUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "pornolab.net" &&
      (parsed.pathname === "/forum/viewforum.php" ||
        parsed.pathname === "/forum/tracker.php")
    );
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*([\\\"'])(.*?)\\1`, "i"),
  );
  return match?.[2] ? decodeHtmlEntities(match[2]) : null;
}

function hasClass(value: string | null, className: string): boolean {
  return !!value && new RegExp(`(^|\\s)${className}(\\s|$)`, "i").test(value);
}

function firstPostBodyIsComplete(html: string): boolean {
  const firstPostBody = html.search(
    /<div\b[^>]*\bclass\s*=\s*[\"'][^\"']*\bpost_body\b[^\"']*[\"'][^>]*>/i,
  );
  if (firstPostBody < 0) return false;

  // This marker is present in Pornolab's topic HTML after the complete first
  // post body, including collapsed spoiler contents, has been parsed.
  return /<\/div>\s*<!--\/post_body-->/i.test(html.slice(firstPostBody));
}

/** Extract the postImg images from a rendered Pornolab topic page. */
function extractTopicImages(html: string, topicUrl: string): ScrapedImage[] {
  const images: ScrapedImage[] = [];
  const postBodyRanges: Array<{ start: number; end: number }> = [];
  const divStack: Array<{ start: number; isPostBody: boolean }> = [];
  const divPattern = /<\/?div\b[^>]*>/gi;
  let divMatch: RegExpExecArray | null;

  // Track post_body div ranges so unrelated postImg-like markup elsewhere in
  // the topic page (headers, ads, signatures, etc.) cannot become a preview.
  while ((divMatch = divPattern.exec(html)) !== null) {
    if (/^<\//.test(divMatch[0])) {
      const opening = divStack.pop();
      if (opening?.isPostBody) {
        postBodyRanges.push({ start: opening.start, end: divMatch.index });
      }
    } else if (!/\/\s*>$/.test(divMatch[0])) {
      divStack.push({
        start: divMatch.index,
        isPostBody: hasClass(readAttribute(divMatch[0], "class"), "post_body"),
      });
    }
  }

  const varPattern = /<var\b([^>]*)>([\s\S]*?)<\/var>/gi;
  let match: RegExpExecArray | null;

  while ((match = varPattern.exec(html)) !== null) {
    if (!postBodyRanges.some((range) => match!.index > range.start && match!.index < range.end)) {
      continue;
    }

    const attributes = match[1] ?? "";
    const className = readAttribute(`<var ${attributes}>`, "class");
    if (!hasClass(className, "postImg")) continue;

    const innerHtml = match[2] ?? "";
    const imgTag = [...innerHtml.matchAll(/<img\b[^>]*>/gi)]
      .map((imgMatch) => imgMatch[0])
      .find((tag) => hasClass(readAttribute(tag, "class"), "postImg"));
    const imageUrl = imgTag ? readAttribute(imgTag, "src") : null;
    // Spoiler contents are initially collapsed by Pornolab, so those vars
    // have no generated img element yet. Their title is the same source URL
    // and must be retained to match the topic-page carousel's image count.
    const titleUrl = readAttribute(`<var ${attributes}>`, "title");
    const thumbnailUrl = imageUrl || titleUrl;
    if (!thumbnailUrl) continue;

    // Pornolab normally wraps the var in the image-host anchor. Find the
    // nearest still-open anchor before this var so the existing resolver can
    // turn that link into the full-size screenshot.
    const before = html.slice(0, match.index);
    const openAnchors = [...before.matchAll(/<a\b[^>]*>/gi)];
    const lastOpenAnchor = openAnchors.at(-1);
    const lastCloseAnchor = before.lastIndexOf("</a");
    const parentHref =
      lastOpenAnchor && lastOpenAnchor.index > lastCloseAnchor
        ? readAttribute(lastOpenAnchor[0], "href")
        : null;

    const toAbsolute = (value: string): string => {
      try {
        return new URL(value, topicUrl).toString();
      } catch {
        return value;
      }
    };

    images.push({
      thumbnailUrl: toAbsolute(thumbnailUrl),
      resolveUrl: toAbsolute(parentHref || thumbnailUrl),
    });
  }

  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.resolveUrl)) return false;
    seen.add(image.resolveUrl);
    return true;
  });
}

function registerTopicController(
  tabId: number | undefined,
  controller: AbortController,
): void {
  if (tabId === undefined) return;
  let controllers = topicLoadControllers.get(tabId);
  if (!controllers) {
    controllers = new Set();
    topicLoadControllers.set(tabId, controllers);
  }
  controllers.add(controller);
}

function unregisterTopicController(
  tabId: number | undefined,
  controller: AbortController,
): void {
  if (tabId === undefined) return;
  const controllers = topicLoadControllers.get(tabId);
  controllers?.delete(controller);
  if (controllers?.size === 0) topicLoadControllers.delete(tabId);
}

function abortTopicLoads(tabId: number | undefined): void {
  if (tabId === undefined) return;
  const controllers = topicLoadControllers.get(tabId);
  controllers?.forEach((controller) => controller.abort());
  topicLoadControllers.delete(tabId);
}

browser.tabs.onRemoved.addListener((tabId) => abortTopicLoads(tabId));

// ===== Icon-click handler =====

browser.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  if (isTopicPageUrl(tab.url)) {
    browser.tabs.sendMessage(tab.id, { action: "showCarousel" }).catch((err) => {
      console.warn("Could not send message:", (err as Error).message);
    });
    return;
  }

  if (isTopicListUrl(tab.url)) {
    browser.tabs.sendMessage(tab.id, { action: "showTopicList" }).catch((err) => {
      console.warn("Could not send message:", (err as Error).message);
    });
  }
});

// ===== Message proxy: content script sends images, background resolves them =====

browser.runtime.onMessage.addListener(
  (rawMessage: unknown, sender: browser.Runtime.MessageSender) => {
    const message = rawMessage as ExtensionMessage;
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

    if (message.action === "abortTopicLoads") {
      abortTopicLoads(sender.tab?.id);
      return Promise.resolve();
    }

    if (message.action === "loadTopicImages") {
      const topicUrl = message.url;
      if (!isTopicPageUrl(topicUrl)) return Promise.resolve({ images: [] });

      const controller = new AbortController();
      const senderTabId = sender.tab?.id;
      registerTopicController(senderTabId, controller);

      return loadPageHtml(topicUrl, {
        timeoutMs: 10000,
        pollIntervalMs: 250,
        isReady: (html) =>
          extractTopicImages(html, topicUrl).length > 0 &&
          firstPostBodyIsComplete(html),
        signal: controller.signal,
      })
        .then(async (html) => {
          const images = extractTopicImages(html, topicUrl);
          const firstImage = images[0];
          const resolvedImages = firstImage
            ? await resolverRegistry.resolveImages(
                [firstImage],
                undefined,
                controller.signal,
              )
            : [];
          const resolvedPreview = firstImage
            ? resolvedImages.find(
                (image) => image.originalUrl === firstImage.resolveUrl,
              )?.resolvedUrl
            : undefined;

          return {
            images,
            // Use the full-size host result for the row preview. Keep the
            // post's img[src] as a fallback for unsupported image hosts.
            previewUrl: resolvedPreview || firstImage?.thumbnailUrl,
          };
        })
        .catch((err) => {
          if ((err as Error).name !== "AbortError") {
            console.warn(
              `Could not load topic ${topicUrl}:`,
              (err as Error).message,
            );
          }
          return { images: [] as ScrapedImage[] };
        })
        .finally(() => unregisterTopicController(senderTabId, controller));
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
