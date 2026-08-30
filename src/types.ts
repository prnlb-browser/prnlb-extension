import type { ResolvedImage, ScrapedImage } from "./resolvers/types";

export type ExtensionMessage =
  | { action: "showCarousel" }
  | { action: "resolveImages"; images: ScrapedImage[] }
  | {
      action: "resolveProgress";
      phase: string;
      message: string;
      current: number;
      total: number;
      /** The image that was just resolved, if any, so the UI can show it immediately. */
      image?: ResolvedImage;
    };