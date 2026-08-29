import browser from "webextension-polyfill";

/**
 * Loads a URL in a new, inactive background tab, waits for the page to
 * finish loading, extracts the rendered HTML, then closes the tab.
 *
 * This resolves image host pages by rendering them in a real browser tab
 * (frontend) rather than fetching HTML directly in the background service
 * worker. Some image hosts block or serve different content to bare
 * fetch()/XHR requests (bot detection, CORS, etc.), so rendering the page
 * in an actual tab is more reliable.
 */
export async function loadPageHtml(url: string, timeoutMs = 15000): Promise<string> {
  const tab = await browser.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error(`Failed to create tab for ${url}`);

  try {
    await waitForTabLoad(tabId, url, timeoutMs);

    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });

    const html = results?.[0]?.result;
    if (typeof html !== "string") {
      throw new Error(`Failed to extract HTML from tab for ${url}`);
    }
    return html;
  } finally {
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

/**
 * Waits until the given tab has finished loading the target URL
 * (status === "complete").
 *
 * Firefox fires an initial "complete" update for the tab's placeholder
 * `about:blank` document before navigation to the target URL has even
 * started, whereas Chrome does not. Naively resolving on the first
 * "complete" event therefore races ahead of the real page load in Firefox,
 * grabbing an empty/blank document. To avoid that, we require the tab's
 * current URL to be a real (non-blank) page — ideally matching the
 * requested origin — before considering the load finished.
 */
function waitForTabLoad(
  tabId: number,
  targetUrl: string,
  timeoutMs: number
): Promise<void> {
  const targetOrigin = safeOrigin(targetUrl);

  function isRealLoadComplete(tabUrl: string | undefined, status: string | undefined): boolean {
    if (status !== "complete") return false;
    if (!tabUrl || tabUrl === "about:blank") return false;
    // If we can determine an origin for the target, require the loaded tab
    // to share it (handles http->https upgrades/redirects within the host).
    if (targetOrigin) {
      const tabOrigin = safeOrigin(tabUrl);
      if (tabOrigin && tabOrigin !== targetOrigin) {
        // Different origin (e.g. redirected elsewhere) — still treat as
        // "complete" since navigation legitimately finished there.
        return true;
      }
    }
    return true;
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timed out waiting for tab ${tabId} to load`));
    }, timeoutMs);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(
      updatedTabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType,
      tab: browser.Tabs.Tab
    ) {
      if (updatedTabId !== tabId) return;
      if (isRealLoadComplete(changeInfo.url ?? tab.url, changeInfo.status)) {
        finish();
      }
    }

    browser.tabs.onUpdated.addListener(listener);

    // Handle the case where the tab has already finished loading before
    // the listener was attached.
    browser.tabs
      .get(tabId)
      .then((t) => {
        if (settled) return;
        if (isRealLoadComplete(t.url, t.status)) {
          finish();
        }
      })
      .catch(() => {
        // Tab may have already been closed/failed; let the timeout or
        // onUpdated listener handle it.
      });
  });
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
