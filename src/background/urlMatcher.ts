/** Return true when the URL is a supported Pornolab topic page. */
export function isTopicPageUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "pornolab.net" &&
      parsed.pathname === "/forum/viewtopic.php"
    );
  } catch {
    return false;
  }
}

/** Return true when the URL is a supported Pornolab topic-list page. */
export function isTopicListUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname === "pornolab.net" &&
      (parsed.pathname === "/forum/viewforum.php" ||
        parsed.pathname === "/forum/tracker.php")
    );
  } catch {
    return false;
  }
}
