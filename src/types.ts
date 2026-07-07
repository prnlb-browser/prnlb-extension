import type { ScrapedImage } from "./resolvers/types";

export type ExtensionMessage =
  | { action: "showCarousel" }
  | { action: "resolveImages"; images: ScrapedImage[] };