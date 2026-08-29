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
    await waitForTabLoad(tabId, timeoutMs);

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
 * Waits until the given tab has finished loading (status === "complete").
 */
function waitForTabLoad(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timed out waiting for tab ${tabId} to load`));
    }, timeoutMs);

    function listener(
      updatedTabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType
    ) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    browser.tabs.onUpdated.addListener(listener);

    // Handle the case where the tab has already finished loading before
    // the listener was attached.
    browser.tabs
      .get(tabId)
      .then((t) => {
        if (settled) return;
        if (t.status === "complete") {
          settled = true;
          clearTimeout(timer);
          browser.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      })
      .catch(() => {
        // Tab may have already been closed/failed; let the timeout or
        // onUpdated listener handle it.
      });
  });
}
