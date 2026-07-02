export interface ImageHostResolver {
  name: string;
  canHandle(url: string): boolean;
  resolve(url: string): Promise<string | null>;
}

export interface ResolvedImage {
  originalUrl: string;
  resolvedUrl: string;
  resolver: string;
}

export interface ImageProgress {
  phase: "scraping" | "resolving" | "done" | "error";
  message: string;
  current?: number;
  total?: number;
}
