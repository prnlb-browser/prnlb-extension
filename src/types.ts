export type ExtensionMessage =
  | { action: "showCarousel" }
  | { action: "resolveImages"; urls: string[] };