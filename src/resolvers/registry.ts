import type { ImageHostResolver, ResolvedImage } from "./types";
import { FastpicResolver } from "./fastpic";
import { ImgboxResolver } from "./imgbox";

class ResolverRegistry {
  private resolvers: ImageHostResolver[] = [];

  constructor() {
    this.register(new FastpicResolver());
    this.register(new ImgboxResolver());
  }

  register(resolver: ImageHostResolver): void {
    this.resolvers.push(resolver);
  }

  findResolver(url: string): ImageHostResolver | null {
    return this.resolvers.find((r) => r.canHandle(url)) ?? null;
  }

  async resolveImages(
    urls: string[],
    onProgress?: (p: { phase: string; message: string; current: number; total: number }) => void,
  ): Promise<ResolvedImage[]> {
    const results: ResolvedImage[] = [];
    const total = urls.length;
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      const resolver = this.findResolver(url);
      if (!resolver) continue;
      if (onProgress) {
        onProgress({ phase: "resolving", message: `Resolving ${i + 1}/${total}...`, current: i + 1, total });
      }
      const resolvedUrl = await resolver.resolve(url);
      if (resolvedUrl) {
        results.push({ originalUrl: url, resolvedUrl, resolver: resolver.name });
      }
    }
    return results;
  }

  getResolverNames(): string[] {
    return this.resolvers.map((r) => r.name);
  }
}

export const resolverRegistry = new ResolverRegistry();
