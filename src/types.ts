import type { ScrapedImage } from "./resolvers/types";

export type ExtensionMessage =
  | { action: "showCarousel" }
  | { action: "resolveImages"; images: ScrapedImage[] }
  | {
      action: "resolveProgress";
      phase: string;
      message: string;
      current: number;
      total: number;
    };