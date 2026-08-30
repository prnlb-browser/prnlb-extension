import browser from "webextension-polyfill";

export interface LoadPageHtmlOptions {
  /** Max time to wait before giving up entirely (default 15000ms). */
  timeoutMs?: number;
  /** How often to poll the DOM for early-readiness while the page loads (default 200ms). */
  pollIntervalMs?: number;
  /**
   * Optional predicate checked against each HTML snapshot while the tab is
   * still loading. As soon as it returns true we stop early and return
   * that HTML instead of waiting for the full page (with all its
   * images/ads/trackers) to finish loading. This is what lets us avoid the
   * slow, unconditional wait for tab status "complete" — many pages render
   * the content we actually need (e.g. the big image link) long before
   * every subresource on the page has loaded.
   */
  isReady?: (html: string) => boolean;
}

/**
 * Loads a URL in a new, inactive background tab, waits for the relevant
 * content to render, extracts the HTML, then closes the tab.
 *
 * This resolves image host pages by rendering them in a real browser tab
 * (frontend) rather than fetching HTML directly in the background service
 * worker. Some image hosts block or serve different content to bare
 * fetch()/XHR requests (bot detection, CORS, etc.), so rendering the page
 * in an actual tab is more reliable.
 */
export async function loadPageHtml(
  url: string,
  options: LoadPageHtmlOptions = {}
): Promise<string> {
  const { timeoutMs = 15000, pollIntervalMs = 200, isReady } = options;

  const tab = await browser.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error(`Failed to create tab for ${url}`);

  try {
    return await waitForHtml(tabId, url, { timeoutMs, pollIntervalMs, isReady });
  } finally {
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

async function extractHtml(tabId: number): Promise<string | null> {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });
    const html = results?.[0]?.result;
    return typeof html === "string" ? html : null;
  } catch {
    // Script injection can fail transiently (e.g. tab still on about:blank,
    // navigating, or briefly unavailable). Callers retry on next poll tick.
    return null;
  }
}

/**
 * Resolves once either:
 *  - `isReady(html)` returns true for a snapshot taken while the page is
 *    still loading (fast path), or
 *  - the tab reaches a genuine "complete" load state (fallback — returns
 *    whatever HTML is available at that point), or
 *  - `timeoutMs` elapses (rejects).
 *
 * If no `isReady` predicate is supplied, this simply waits for the tab to
 * finish loading before extracting the HTML once.
 */
function waitForHtml(
  tabId: number,
  targetUrl: string,
  { timeoutMs, pollIntervalMs, isReady }: Required<Omit<LoadPageHtmlOptions, "isReady">> & Pick<LoadPageHtmlOptions, "isReady">
): Promise<string> {
  const targetOrigin = safeOrigin(targetUrl);

  function isRealLoadComplete(tabUrl: string | undefined, status: string | undefined): boolean {
    if (status !== "complete") return false;
    if (!tabUrl || tabUrl === "about:blank") return false;
    if (targetOrigin) {
      const tabOrigin = safeOrigin(tabUrl);
      if (tabOrigin && tabOrigin !== targetOrigin) return true;
    }
    return true;
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let pageComplete = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const timer = setTimeout(() => {
      finish(reject, new Error(`Timed out waiting for tab ${tabId} to load`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      if (pollTimer) clearTimeout(pollTimer);
      browser.tabs.onUpdated.removeListener(listener);
    }

    function finish(
      settle: (value: string) => void | ((reason: Error) => void),
      value: string | Error
    ) {
      if (settled) return;
      settled = true;
      cleanup();
      if (value instanceof Error) {
        (settle as (reason: Error) => void)(value);
      } else {
        (settle as (value: string) => void)(value);
      }
    }

    async function poll() {
      if (settled) return;

      const html = await extractHtml(tabId);
      if (settled) return;

      if (html !== null) {
        if (isReady?.(html)) {
          finish(resolve, html);
          return;
        }
        if (pageComplete) {
          // Fully loaded but never matched isReady — return what we have.
          finish(resolve, html);
          return;
        }
      } else if (pageComplete) {
        // Fully loaded but couldn't extract HTML at all.
        finish(reject, new Error(`Failed to extract HTML from tab for ${targetUrl}`));
        return;
      }

      pollTimer = setTimeout(poll, pollIntervalMs);
    }

    function listener(
      updatedTabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
      tab: browser.Tabs.Tab
    ) {
      if (updatedTabId !== tabId) return;
      if (!pageComplete && isRealLoadComplete(changeInfo.url ?? tab.url, changeInfo.status)) {
        pageComplete = true;
      }
    }

    browser.tabs.onUpdated.addListener(listener);

    // Handle the case where the tab has already finished loading before
    // the listener was attached.
    browser.tabs
      .get(tabId)
      .then((t) => {
        if (isRealLoadComplete(t.url, t.status)) pageComplete = true;
      })
      .catch(() => {});

    if (isReady) {
      // Fast path: poll the DOM repeatedly and stop as soon as the content
      // we care about shows up, without waiting for full page load.
      poll();
    } else {
      // No readiness predicate: fall back to waiting for a real "complete"
      // status, then extract once.
      const waitForComplete = () => {
        if (settled) return;
        if (pageComplete) {
          extractHtml(tabId).then((html) => {
            if (html !== null) finish(resolve, html);
            else finish(reject, new Error(`Failed to extract HTML from tab for ${targetUrl}`));
          });
        } else {
          pollTimer = setTimeout(waitForComplete, pollIntervalMs);
        }
      };
      waitForComplete();
    }
  });
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
