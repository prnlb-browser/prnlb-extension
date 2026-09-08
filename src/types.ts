import type { ResolvedImage, ScrapedImage } from "./resolvers/types";

export type ExtensionMessage =
  | { action: "pageLoaded" }
  | { action: "deactivate" }
  | { action: "activateTopicPage" }
  | { action: "showCarousel" }
  | { action: "showTopicList" }
  | { action: "loadTopicImages"; url: string; highlightActresses?: boolean }
  | { action: "abortTopicLoads" }
  | { action: "resolveImages"; images: ScrapedImage[] }
  | { action: "abortResolution" }
  | { action: "lookupActress"; provider: "boobpedia" | "iafd"; query: string }
  | { action: "cacheImage"; url: string }
  | { action: "openActressSearch"; name: string }
  | {
      action: "resolveProgress";
      phase: string;
      message: string;
      current: number;
      total: number;
      /** The image that was just resolved, if any, so the UI can show it immediately. */
      image?: ResolvedImage;
    };
