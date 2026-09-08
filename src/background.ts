import browser from "webextension-polyfill";
import { registerActionRouter } from "./background/actionRouter";
import { ImageResolutionService } from "./background/imageResolutionService";
import { registerMessageRouter } from "./background/messageRouter";
import { TopicPreviewService } from "./background/topicPreviewService";

const topicPreviewService = new TopicPreviewService();
const imageResolutionService = new ImageResolutionService();

registerActionRouter();
registerMessageRouter(topicPreviewService, imageResolutionService);

// A list tab can own several background loader tabs. Abort them when the
// initiating list tab disappears.
browser.tabs.onRemoved.addListener((tabId) => {
  topicPreviewService.abortTopicLoads(tabId);
});
