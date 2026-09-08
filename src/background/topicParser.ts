import type { ScrapedImage } from "../resolvers/types";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'");
}

function readAttribute(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`\\b${name}\\s*=\\s*([\\\"'])(.*?)\\1`, "i"),
  );
  return match?.[2] ? decodeHtmlEntities(match[2]) : null;
}

function hasClass(value: string | null, className: string): boolean {
  return !!value && new RegExp(`(^|\\s)${className}(\\s|$)`, "i").test(value);
}

function decodeTextEntities(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/[ \t]+/g, " ");
}

/** Extract the Cast value from the first post, alongside its images. */
export function extractTopicCast(html: string): string {
  const startMatch = /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bpost-user-message\b[^"']*["'][^>]*>/i.exec(html);
  if (!startMatch) return "";
  const start = startMatch.index + startMatch[0].length;
  const bodyEnd = html.indexOf("<!--/post_body-->", start);
  const post = html.slice(start, bodyEnd >= 0 ? bodyEnd : start + 100_000);
  if (!post) return "";
  const text = decodeTextEntities(post);
  return text.match(/(?:В ролях|Имена актёров|Имя актрисы|Cast)[:\s]*([^\n]+)/i)?.[1]?.trim() ?? "";
}

/** Return true after Pornolab has rendered the complete first post body. */
export function firstPostBodyIsComplete(html: string): boolean {
  const firstPostBody = html.search(
    /<div\b[^>]*\bclass\s*=\s*[\"'][^\"']*\bpost_body\b[^\"']*[\"'][^>]*>/i,
  );
  if (firstPostBody < 0) return false;

  // This marker follows the complete first post body, including collapsed
  // spoiler contents, in Pornolab's rendered topic HTML.
  return /<\/div>\s*<!--\/post_body-->/i.test(html.slice(firstPostBody));
}

/** Extract postImg images from the first post body of a rendered topic page. */
export function extractTopicImages(
  html: string,
  topicUrl: string,
): ScrapedImage[] {
  const images: ScrapedImage[] = [];
  const postBodyRanges: Array<{ start: number; end: number }> = [];
  const divStack: Array<{ start: number; isPostBody: boolean }> = [];
  const divPattern = /<\/?div\b[^>]*>/gi;
  let divMatch: RegExpExecArray | null;

  // Limit extraction to post_body divs so unrelated postImg-like markup in
  // headers, ads, and signatures cannot become a preview.
  while ((divMatch = divPattern.exec(html)) !== null) {
    if (/^<\//.test(divMatch[0])) {
      const opening = divStack.pop();
      if (opening?.isPostBody) {
        postBodyRanges.push({ start: opening.start, end: divMatch.index });
      }
    } else if (!/\/\s*>$/.test(divMatch[0])) {
      divStack.push({
        start: divMatch.index,
        isPostBody: hasClass(readAttribute(divMatch[0], "class"), "post_body"),
      });
    }
  }

  const varPattern = /<var\b([^>]*)>([\s\S]*?)<\/var>/gi;
  let match: RegExpExecArray | null;

  while ((match = varPattern.exec(html)) !== null) {
    if (
      !postBodyRanges.some(
        (range) => match!.index > range.start && match!.index < range.end,
      )
    ) {
      continue;
    }

    const attributes = match[1] ?? "";
    const className = readAttribute(`<var ${attributes}>`, "class");
    if (!hasClass(className, "postImg")) continue;

    const innerHtml = match[2] ?? "";
    const imgTag = [...innerHtml.matchAll(/<img\b[^>]*>/gi)]
      .map((imgMatch) => imgMatch[0])
      .find((tag) => hasClass(readAttribute(tag, "class"), "postImg"));
    const imageUrl = imgTag ? readAttribute(imgTag, "src") : null;
    // Spoiler contents may not have a generated img element yet. The var's
    // title still contains the source URL and preserves the image count.
    const titleUrl = readAttribute(`<var ${attributes}>`, "title");
    const thumbnailUrl = imageUrl || titleUrl;
    if (!thumbnailUrl) continue;

    // Find the nearest still-open image-host anchor before this var.
    const before = html.slice(0, match.index);
    const openAnchors = [...before.matchAll(/<a\b[^>]*>/gi)];
    const lastOpenAnchor = openAnchors.at(-1);
    const lastCloseAnchor = before.lastIndexOf("</a");
    const parentHref =
      lastOpenAnchor && lastOpenAnchor.index > lastCloseAnchor
        ? readAttribute(lastOpenAnchor[0], "href")
        : null;

    const toAbsolute = (value: string): string => {
      try {
        return new URL(value, topicUrl).toString();
      } catch {
        return value;
      }
    };

    images.push({
      thumbnailUrl: toAbsolute(thumbnailUrl),
      resolveUrl: toAbsolute(parentHref || thumbnailUrl),
    });
  }

  const seen = new Set<string>();
  return images.filter((image) => {
    if (seen.has(image.resolveUrl)) return false;
    seen.add(image.resolveUrl);
    return true;
  });
}
