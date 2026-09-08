import browser from "webextension-polyfill";
import type { ExtensionMessage } from "./types";
import { openCarousel } from "./content/carousel";
import {
  activateTopicListMode,
  registerTopicListAbortHandler,
} from "./content/topicList";

registerTopicListAbortHandler();

browser.runtime.onMessage.addListener((rawMessage: unknown) => {
  const message = rawMessage as ExtensionMessage;
  if (message.action === "showCarousel") {
    openCarousel();
  } else if (message.action === "showTopicList") {
    void activateTopicListMode();
  }
});
