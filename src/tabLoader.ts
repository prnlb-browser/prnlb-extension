import browser from "webextension-polyfill";

export interface LoadPageHtmlOptions {
  /** Max time to wait before the optional timeout handler runs (default 15000ms). */
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
  /**
   * Optional AbortSignal to cancel loading early (e.g. when the tab that
   * initiated the resolution request has been closed). When aborted, the
   * background tab created for loading is closed and the returned promise
   * rejects with an AbortError.
   */
  signal?: AbortSignal;
  /**
   * Called when the initial timeout expires. A resolver can use this to
   * activate a page that needs user interaction, such as a human check.
   */
  onTimeout?: (tabId: number) => void | Promise<void>;
  /**
   * Additional time to keep polling after onTimeout has run. This gives the
   * user time to complete an interaction in the active tab.
   */
  timeoutAfterTimeoutMs?: number;
  /** Leave the loader tab open if the additional wait also times out. */
  keepTabOpenOnTimeout?: boolean;
}

export interface LoadImageDataUrlOptions {
  /** Max time to wait for the image document to render. */
  timeoutMs?: number;
  /** How often to check the rendered image. */
  pollIntervalMs?: number;
  /** Cancel the temporary tab and request. */
  signal?: AbortSignal;
}

/**
 * Load an image in a real browser tab and return a data URL made from the
 * rendered pixels. This handles image hosts such as IAFD that reject direct
 * extension/background image requests but serve a normal browser navigation.
 */
export async function loadImageDataUrl(
  url: string,
  options: LoadImageDataUrlOptions = {},
): Promise<string> {
  const {
    timeoutMs = 15000,
    pollIntervalMs = 250,
    signal,
  } = options;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const tab = await browser.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error(`Failed to create image tab for ${url}`);
  const imageTabId = tabId;

  try {
    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;

      const cleanup = (): void => {
        if (timer) clearTimeout(timer);
        if (deadlineTimer) clearTimeout(deadlineTimer);
        signal?.removeEventListener("abort", onAbort);
      };
      const finishOk = (value: string): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const finishError = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      const onAbort = (): void => finishError(new DOMException("Aborted", "AbortError"));

      async function poll(): Promise<void> {
        if (settled) return;
        try {
          const result = await browser.scripting.executeScript({
            target: { tabId: imageTabId },
            func: () => {
              const image = document.images[0];
              if (!image || !image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) return null;
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const context = canvas.getContext("2d");
              if (!context) return null;
              try {
                context.drawImage(image, 0, 0);
                return canvas.toDataURL("image/jpeg", 0.92);
              } catch {
                return null;
              }
            },
          });
          const dataUrl = result?.[0]?.result;
          if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
            finishOk(dataUrl);
            return;
          }
        } catch {
          // The image document may not be scriptable until navigation settles.
        }
        if (!settled) timer = setTimeout(() => void poll(), pollIntervalMs);
      }

      signal?.addEventListener("abort", onAbort);
      deadlineTimer = setTimeout(
        () => finishError(new Error(`Timed out loading image ${url}`)),
        timeoutMs,
      );
      void poll();
    });
  } finally {
    await browser.tabs.remove(imageTabId).catch(() => {});
  }
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
  const {
    timeoutMs = 15000,
    pollIntervalMs = 200,
    isReady,
    signal,
    onTimeout,
    timeoutAfterTimeoutMs = 0,
    keepTabOpenOnTimeout = false,
  } = options;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const tab = await browser.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error(`Failed to create tab for ${url}`);

  let keepTabOpen = false;
  try {
    return await waitForHtml(tabId, url, {
      timeoutMs,
      pollIntervalMs,
      isReady,
      signal,
      onTimeout,
      timeoutAfterTimeoutMs,
      onFinalTimeout: () => {
        keepTabOpen = keepTabOpenOnTimeout;
      },
    });
  } finally {
    if (!keepTabOpen) {
      await browser.tabs.remove(tabId).catch(() => {});
    }
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
 *  - `timeoutMs` elapses (or the optional post-timeout wait elapses) and the
 *    page still has not become ready (rejects).
 *
 * If no `isReady` predicate is supplied, this simply waits for the tab to
 * finish loading before extracting the HTML once.
 */
function waitForHtml(
  tabId: number,
  targetUrl: string,
  {
    timeoutMs,
    pollIntervalMs,
    isReady,
    signal,
    onTimeout,
    timeoutAfterTimeoutMs,
    onFinalTimeout,
  }: {
    timeoutMs: number;
    pollIntervalMs: number;
    isReady?: (html: string) => boolean;
    signal?: AbortSignal;
    onTimeout?: (tabId: number) => void | Promise<void>;
    timeoutAfterTimeoutMs: number;
    onFinalTimeout?: () => void;
  }
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

    let timer: ReturnType<typeof setTimeout> | undefined;
    let timeoutHandled = false;

    function onAbort() {
      finishErr(new DOMException("Aborted", "AbortError"));
    }
    signal?.addEventListener("abort", onAbort);

    function cleanup() {
      clearTimeout(timer);
      if (pollTimer) clearTimeout(pollTimer);
      browser.tabs.onUpdated.removeListener(listener);
      signal?.removeEventListener("abort", onAbort);
    }

    function finishOk(value: string) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    }

    function finishErr(reason: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    }

    function finishTimeout() {
      onFinalTimeout?.();
      finishErr(new Error(`Timed out waiting for tab ${tabId} to load`));
    }

    function armTimeout(durationMs: number) {
      timer = setTimeout(() => {
        if (timeoutHandled || !onTimeout) {
          finishTimeout();
          return;
        }

        timeoutHandled = true;
        Promise.resolve(onTimeout(tabId))
          .then(() => {
            if (settled) return;
            if (timeoutAfterTimeoutMs > 0) {
              armTimeout(timeoutAfterTimeoutMs);
            } else {
              finishTimeout();
            }
          })
          .catch((err) => finishErr(err instanceof Error ? err : new Error(String(err))));
      }, durationMs);
    }

    async function poll() {
      if (settled) return;

      const html = await extractHtml(tabId);
      if (settled) return;

      if (html !== null) {
        if (isReady?.(html)) {
          finishOk(html);
          return;
        }
        if (pageComplete && !onTimeout) {
          // Fully loaded but never matched isReady — return what we have.
          finishOk(html);
          return;
        }
      } else if (pageComplete && !onTimeout) {
        // Fully loaded but couldn't extract HTML at all.
        finishErr(new Error(`Failed to extract HTML from tab for ${targetUrl}`));
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

    armTimeout(timeoutMs);

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
            if (html !== null) finishOk(html);
            else finishErr(new Error(`Failed to extract HTML from tab for ${targetUrl}`));
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
