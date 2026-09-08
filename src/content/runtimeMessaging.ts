import browser from "webextension-polyfill";
import type { ExtensionMessage } from "../types";

/** Send a cleanup/UI message without surfacing errors from stale contexts. */
export function sendMessageSafely(message: ExtensionMessage): void {
  try {
    void browser.runtime.sendMessage(message).catch(() => {});
  } catch {
    // The content script may outlive an extension reload. In that case the
    // runtime is invalidated and cleanup messages cannot be delivered.
  }
}
