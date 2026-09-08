import browser from "webextension-polyfill";
import type { ExtensionMessage } from "./types";
import { closeCarousel, openCarousel } from "./content/carousel";
import {
  activateTopicPageMode,
  deactivateTopicPageMode,
} from "./content/topicPage";
import {
  activateTopicListMode,
  deactivateTopicListMode,
  registerTopicListAbortHandler,
} from "./content/topicList";

registerTopicListAbortHandler();

browser.runtime.onMessage.addListener((rawMessage: unknown) => {
  const message = rawMessage as ExtensionMessage;
  if (message.action === "deactivate") {
    closeCarousel();
    deactivateTopicPageMode();
    deactivateTopicListMode();
  } else if (message.action === "activateTopicPage") {
    activateTopicPageMode();
  } else if (message.action === "showCarousel") {
    openCarousel();
  } else if (message.action === "showTopicList") {
    void activateTopicListMode();
  }
});

// The background uses this readiness signal to emulate the toolbar action on
// every supported Pornolab page load while the feature is enabled.
void browser.runtime.sendMessage({ action: "pageLoaded" }).catch(() => {});
