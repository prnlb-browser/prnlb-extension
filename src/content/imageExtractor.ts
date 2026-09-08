import type { ScrapedImage } from "../resolvers/types";

/** Find the first rendered image or image placeholder in the first post. */
export function findFirstPostImageTarget(): HTMLElement | null {
  const firstPost = document.querySelector<HTMLElement>(
    ".post-user-message, .post_body",
  );
  return (
    firstPost?.querySelector<HTMLElement>(
      "var.postImg img, img.postImg, img, var.postImg",
    ) ??
    document.querySelector<HTMLElement>("var.postImg img, img.postImg, var.postImg")
  );
}

/** Extract image candidates from the first post in the current topic page. */
export function extractImagesFromPost(): ScrapedImage[] {
  const images: ScrapedImage[] = [];

  // Method 1: <var class="postImg" title="URL"> — BBCode [img] tags
  // When wrapped in an <a> tag, use <img src> as thumbnail and <a href> as resolve URL
  document.querySelectorAll("var.postImg").forEach((el) => {
    const imgEl = el.querySelector("img");
    const imgSrc = imgEl ? imgEl.getAttribute("src") : null;
    const titleSrc = el.getAttribute("title");
    const thumbnail = imgSrc || titleSrc || "";

    const parentLink = el.closest("a");
    if (parentLink) {
      const href = parentLink.getAttribute("href");
      if (href && href.startsWith("http")) {
        images.push({ thumbnailUrl: thumbnail, resolveUrl: href });
        return;
      }
    }
    if (thumbnail) images.push({ thumbnailUrl: thumbnail, resolveUrl: thumbnail });
  });

  // Method 2: <img> tags inside the first post message
  document.querySelectorAll(".post-user-message img").forEach((el) => {
    if (el.closest("var.postImg")) return;
    const src = el.getAttribute("src");
    if (src) images.push({ thumbnailUrl: src, resolveUrl: src });
  });

  // Method 3: <a> tags with images inside the first post
  document.querySelectorAll(".post-user-message a img").forEach((el) => {
    if (el.closest("var.postImg")) return;
    const src = el.getAttribute("src");
    if (src) images.push({ thumbnailUrl: src, resolveUrl: src });
  });

  // Method 4: links to known image hosts, excluding postImg links already handled above.
  document.querySelectorAll(".post-user-message a[href]").forEach((el) => {
    if (el.querySelector("var.postImg")) return;
    const href = el.getAttribute("href");
    if (href && href.startsWith("http")) {
      images.push({ thumbnailUrl: href, resolveUrl: href });
    }
  });

  // Resolve relative URLs and deduplicate by resolveUrl.
  const seen = new Set<string>();
  const resolved: ScrapedImage[] = [];
  for (const img of images) {
    const resolveUrl = img.resolveUrl.startsWith("http")
      ? img.resolveUrl
      : `https://pornolab.net/forum/${img.resolveUrl.replace(/^\.\//, "")}`;
    const thumbnailUrl = img.thumbnailUrl.startsWith("http")
      ? img.thumbnailUrl
      : `https://pornolab.net/forum/${img.thumbnailUrl.replace(/^\.\//, "")}`;
    if (seen.has(resolveUrl)) continue;
    seen.add(resolveUrl);
    resolved.push({ thumbnailUrl, resolveUrl });
  }
  return resolved;
}
