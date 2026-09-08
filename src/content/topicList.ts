import browser from "webextension-polyfill";
import type { ScrapedImage } from "../resolvers/types";
import { openCarousel } from "./carousel";
import {
  getTopicId,
  getTopicListSettings,
  toggleTopicHidden,
  TOPIC_LIST_SETTINGS_CHANGED_EVENT,
} from "./hiddenTopics";
import { openOptionsDialog } from "./optionsDialog";
import { requestActressEditor } from "./actresses";
import { sendMessageSafely } from "./runtimeMessaging";

interface TopicListEntry {
  row: HTMLTableRowElement;
  cell: HTMLTableCellElement;
  topicUrl: string;
  images: ScrapedImage[];
  hidden: boolean;
  hideHiddenTopics: boolean;
  highlightActresses: boolean;
  cast: string;
  actressMatches: Array<{ id: string; name: string; otherNames: string[]; isFavorite: boolean }>;
  originalCellHtml: string;
  originalCellClassName: string;
  originalCellStyle: string | null;
  originalRowStyle: string | null;
  originalRowTitle: string | null;
  originalRowParent: Node | null;
  originalRowNextSibling: ChildNode | null;
}

interface TopicListProgress {
  root: HTMLDivElement;
  label: HTMLSpanElement;
  bar: HTMLDivElement;
  completed: number;
  total: number;
}

let topicListModeActive = false;
let topicListActivation = 0;
let activeTopicListEntries: TopicListEntry[] = [];
let activeTopicListProgress: TopicListProgress | null = null;
let activeTopicListTableStyles = new Map<HTMLTableElement, string | null>();

export function registerTopicListAbortHandler(): void {
  window.addEventListener("pagehide", () => {
    sendMessageSafely({ action: "abortTopicLoads" });
  });
  window.addEventListener(TOPIC_LIST_SETTINGS_CHANGED_EVENT, () => {
    // Rows hidden during the current run cannot be restored safely without
    // reloading their original table markup, so apply option changes by
    // starting the list scan again.
    window.location.reload();
  });
}

function createTopicListProgress(total: number): TopicListProgress {
  const root = document.createElement("div");
  root.id = "__prnlb_list_progress";
  root.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483646;padding:6px 12px;background:rgba(20,20,20,.94);color:#eee;font:12px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35);";

  const label = document.createElement("span");
  label.textContent = `Loading topic images: 0/${total}`;

  const track = document.createElement("div");
  track.style.cssText =
    "height:3px;margin-top:5px;background:#444;border-radius:2px;overflow:hidden;";
  const bar = document.createElement("div");
  bar.style.cssText =
    "height:100%;width:0%;background:#4f46e5;border-radius:2px;transition:width .2s ease;";
  track.appendChild(bar);
  root.append(label, track);
  (document.body ?? document.documentElement).appendChild(root);

  return { root, label, bar, completed: 0, total };
}

function updateTopicListProgress(progress: TopicListProgress): void {
  const percent = Math.round((progress.completed / progress.total) * 100);
  progress.bar.style.width = `${percent}%`;
  progress.label.textContent =
    progress.completed >= progress.total
      ? `Topic images loaded: ${progress.total}/${progress.total}`
      : `Loading topic images: ${progress.completed}/${progress.total}`;
}

function findTopicListTables(): HTMLTableElement[] {
  const tables = new Set<HTMLTableElement>();
  const tableSelectors = [
    // Search results use the sortable tracker table.
    "#search-results table.forumline.tablesorter#tor-tbl",
    // Forum topic lists use the `forumline forum` table below the topics
    // anchor. Use a general sibling selector because the site may insert
    // spacing or helper markup between the anchor and table.
    '#main_content_wrap a[name="topics"] ~ table.forumline.forum',
  ];

  for (const selector of tableSelectors) {
    for (const table of document.querySelectorAll<HTMLTableElement>(selector)) {
      tables.add(table);
    }
  }
  return [...tables];
}

function addTopicListOptionsIcon(table: HTMLTableElement): void {
  if (table.querySelector(":scope > .__prnlb_list_options")) return;

  if (getComputedStyle(table).position === "static") {
    table.style.position = "relative";
  }

  const options = document.createElement("button");
  options.type = "button";
  options.className = "__prnlb_list_options";
  options.title = "PRNLB Viewer options";
  options.setAttribute("aria-label", "PRNLB Viewer options");
  options.style.cssText =
    "position:absolute;top:4px;left:4px;z-index:5;width:28px;height:28px;padding:3px;border:1px solid rgba(0,0,0,.25);border-radius:4px;background:rgba(255,255,255,.9);cursor:pointer;opacity:.85;";
  options.onclick = openOptionsDialog;

  const icon = document.createElement("img");
  icon.src = browser.runtime.getURL("icon.png");
  icon.alt = "";
  icon.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
  options.appendChild(icon);
  table.appendChild(options);
}

function findPreviewCell(row: HTMLTableRowElement): HTMLTableCellElement | null {
  // The first column is common to forum and search-result layouts.
  return row.cells[0] ?? null;
}

function createTopicListEntries(table: HTMLTableElement): TopicListEntry[] {
  const entries: TopicListEntry[] = [];
  const seenRows = new Set<HTMLTableRowElement>();

  // `torTopic` is the actual topic title link in forum/tracker rows. The
  // preceding newest-reply icon also points at viewtopic.php, so do not use
  // a broad href-only selector here.
  for (const link of table.querySelectorAll<HTMLAnchorElement>(
    "a.med.tLink[href*='viewtopic.php'], a.topictitle[href*='viewtopic.php'], a.torTopic[href*='viewtopic.php']",
  )) {
    const row = link.closest("tr");
    if (!(row instanceof HTMLTableRowElement) || seenRows.has(row)) continue;
    const cell = findPreviewCell(row);
    if (!cell) continue;

    const topicUrl = new URL(
      link.getAttribute("href") || link.href,
      location.href,
    ).toString();
    seenRows.add(row);
    entries.push({
      row,
      cell,
      topicUrl,
      images: [],
      hidden: false,
      hideHiddenTopics: true,
      highlightActresses: false,
      cast: "",
      actressMatches: [],
      originalCellHtml: cell.innerHTML,
      originalCellClassName: cell.className,
      originalCellStyle: cell.getAttribute("style"),
      originalRowStyle: row.getAttribute("style"),
      originalRowTitle: row.getAttribute("title"),
      originalRowParent: row.parentNode,
      originalRowNextSibling: row.nextSibling,
    });
  }

  return entries;
}

function prepareTopicListCell(entry: TopicListEntry): {
  preview: HTMLImageElement;
  cast: HTMLDivElement;
  button: HTMLButtonElement;
} {
  entry.cell.innerHTML = "";
  entry.cell.classList.add("__prnlb_topic_preview_cell");
  entry.cell.style.verticalAlign = "middle";

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;align-items:center;gap:8px;width:fit-content;max-width:calc(100vw - 20px);box-sizing:border-box;overflow:visible;";

  const preview = document.createElement("img");
  preview.alt = "Loading post image";
  preview.style.cssText =
    "display:block;flex:0 0 160px;min-width:0;width:160px !important;max-width:160px !important;height:100px !important;max-height:100px !important;object-fit:contain;border-radius:3px;";

  let enlargedPreview: HTMLDivElement | null = null;
  const hideEnlargedPreview = (): void => {
    enlargedPreview?.remove();
    enlargedPreview = null;
  };
  preview.addEventListener("mouseenter", () => {
    const source = preview.getAttribute("src");
    if (!source || enlargedPreview) return;
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.45);pointer-events:none;";
    const image = document.createElement("img");
    image.src = source;
    image.alt = "Full-size post image";
    image.style.cssText =
      "display:block;max-width:95vw;max-height:95vh;width:auto;height:auto;object-fit:contain;box-shadow:0 8px 32px rgba(0,0,0,.55);";
    overlay.appendChild(image);
    (document.body ?? document.documentElement).appendChild(overlay);
    enlargedPreview = overlay;
    image.onerror = hideEnlargedPreview;
  });
  preview.addEventListener("mouseleave", hideEnlargedPreview);

  const cast = document.createElement("div");
  cast.className = "__prnlb_topic_cast";
  cast.style.cssText =
    "display:flex;flex:1 1 180px;min-width:130px;max-width:260px;flex-direction:column;justify-content:center;align-self:stretch;overflow:auto;font-size:13px;line-height:1.45;color:#333;";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "📷";
  button.setAttribute("aria-label", "View screenshots");
  button.disabled = true;
  button.title = "View screenshots from this topic";
  button.style.cssText =
    "display:block;width:36px;height:32px;box-sizing:border-box;padding:2px;border:1px solid #999;border-radius:4px;background:#f5f5f5;color:#222;font-size:18px;line-height:1;cursor:pointer;";

  const actions = document.createElement("div");
  actions.className = "__prnlb_topic_actions";
  actions.style.cssText =
    "display:flex;flex:0 0 36px;flex-direction:column;align-items:center;gap:5px;";
  actions.appendChild(button);

  const hideButton = document.createElement("button");
  hideButton.type = "button";
  hideButton.textContent = entry.hidden ? "👁️" : "🙈";
  hideButton.setAttribute(
    "aria-label",
    entry.hidden ? "Show topic" : "Hide topic",
  );
  hideButton.title = entry.hidden ? "Show this topic" : "Hide this topic";
  hideButton.style.cssText =
    "display:block;width:36px;height:32px;box-sizing:border-box;padding:2px;border:1px solid #999;border-radius:4px;background:#f5f5f5;color:#222;font-size:18px;line-height:1;cursor:pointer;";
  hideButton.onclick = () => void toggleTopicListEntry(entry, hideButton);
  actions.appendChild(hideButton);

  wrapper.append(preview, cast, actions);
  entry.cell.appendChild(wrapper);
  return { preview, button, cast };
}

function stripCastAnnotation(value: string): string {
  return value.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

function renderCastLinks(
  container: HTMLDivElement,
  castValue: string,
  matches: TopicListEntry["actressMatches"],
): void {
  container.textContent = "";
  if (!castValue) return;

  const heading = document.createElement("span");
  heading.textContent = "Cast";
  heading.style.cssText = "margin-bottom:3px;font-weight:600;color:#555;";
  container.appendChild(heading);

  const names = castValue
    // Pornolab commonly joins multiple performers with either commas or an
    // ampersand (e.g. "Lila Lovely & Chocolate God").
    .split(/\s*(?:,|&)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const namesRow = document.createElement("div");
  for (const [index, visibleName] of names.entries()) {
    const name = stripCastAnnotation(visibleName);
    if (!name) continue;
    const normalized = name.toLocaleLowerCase();
    const existing = matches.find(
      (actress) =>
        actress.name.toLocaleLowerCase() === normalized ||
        actress.otherNames.some((alias) => alias.toLocaleLowerCase() === normalized),
    );
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = visibleName;
    link.title = existing ? "Edit existing actress" : "Add new actress";
    link.style.cssText = "color:#315fb4;text-decoration:underline;cursor:pointer;";
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openOptionsDialog();
      requestActressEditor(name);
    });
    namesRow.appendChild(link);
    if (index < names.length - 1) namesRow.append(", ");
  }
  container.appendChild(namesRow);
}

async function toggleTopicListEntry(
  entry: TopicListEntry,
  button: HTMLButtonElement,
): Promise<void> {
  button.disabled = true;
  try {
    entry.hidden = await toggleTopicHidden(entry.topicUrl);
    if (entry.hidden && entry.hideHiddenTopics) {
      entry.row.remove();
      return;
    }

    button.textContent = entry.hidden ? "👁️" : "🙈";
    button.setAttribute(
      "aria-label",
      entry.hidden ? "Show topic" : "Hide topic",
    );
    button.title = entry.hidden ? "Show this topic" : "Hide this topic";
  } catch (error) {
    console.warn("Could not update hidden topic flag:", error);
  } finally {
    if (entry.row.isConnected) button.disabled = false;
  }
}

async function loadTopicListEntry(
  entry: TopicListEntry,
  isCurrentActivation: () => boolean,
): Promise<void> {
  const { preview, cast, button } = prepareTopicListCell(entry);

  try {
    const response = (await browser.runtime.sendMessage({
      action: "loadTopicImages",
      url: entry.topicUrl,
      highlightActresses: entry.highlightActresses,
    })) as {
      images?: ScrapedImage[];
      previewUrl?: string;
      cast?: string;
      actressMatch?: { name: string; isFavorite: boolean };
      actressMatches?: Array<{ id: string; name: string; otherNames: string[]; isFavorite: boolean }>;
    };
    if (!isCurrentActivation()) return;
    entry.images = Array.isArray(response.images) ? response.images : [];
    entry.cast = response.cast ?? "";
    entry.actressMatches = Array.isArray(response.actressMatches) ? response.actressMatches : [];
    renderCastLinks(cast, entry.cast, entry.actressMatches);

    const firstImage = entry.images[0];
    if (firstImage?.thumbnailUrl || response.previewUrl) {
      preview.src = response.previewUrl || firstImage!.thumbnailUrl;
      preview.alt = "Post image";
    } else {
      preview.alt = "No post image found";
    }

    if (entry.images.length > 0) {
      button.disabled = false;
      button.onclick = () => openCarousel(entry.images);
    }

    if (entry.highlightActresses && response.actressMatch) {
      entry.row.style.backgroundColor = response.actressMatch.isFavorite
        ? "rgba(212,160,23,.34)"
        : "rgba(192,192,192,.42)";
      entry.row.title = `${response.actressMatch.isFavorite ? "Favorite" : "Catalogue"} actress: ${response.actressMatch.name}`;
    }
  } catch {
    preview.alt = "Topic image unavailable";
  }
}

export async function activateTopicListMode(): Promise<void> {
  if (topicListModeActive) return;

  const activation = ++topicListActivation;
  const isCurrentActivation = (): boolean =>
    topicListModeActive && topicListActivation === activation;
  const tables = findTopicListTables();
  if (tables.length === 0) return;
  topicListModeActive = true;
  activeTopicListTableStyles = new Map(
    tables.map((table) => [table, table.getAttribute("style")]),
  );

  const allEntries = tables.flatMap((table) => {
    addTopicListOptionsIcon(table);
    return createTopicListEntries(table);
  });
  activeTopicListEntries = allEntries;
  if (allEntries.length === 0) {
    // Leave activation retryable if rows are inserted after the content script.
    topicListModeActive = false;
    return;
  }

  const settings = await getTopicListSettings();
  if (!isCurrentActivation()) return;
  const entries = allEntries.filter((entry) => {
    entry.hidden = settings.hiddenTopicIds.has(getTopicId(entry.topicUrl));
    entry.hideHiddenTopics = settings.hideHiddenTopics;
    entry.highlightActresses = settings.highlightActresses;
    if (entry.hidden && settings.hideHiddenTopics) {
      entry.row.remove();
      return false;
    }
    return true;
  });

  if (entries.length === 0) return;

  const progress = createTopicListProgress(entries.length);
  activeTopicListProgress = progress;

  // Keep the number of background tabs reasonable on large tracker pages.
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (isCurrentActivation() && nextIndex < entries.length) {
      const entry = entries[nextIndex++];
      if (!entry) continue;
      try {
        await loadTopicListEntry(entry, isCurrentActivation);
      } finally {
        if (isCurrentActivation()) {
          progress.completed += 1;
          updateTopicListProgress(progress);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  if (!isCurrentActivation()) return;
  window.setTimeout(() => progress.root.remove(), 1200);
}

export function deactivateTopicListMode(): void {
  topicListActivation += 1;
  topicListModeActive = false;
  sendMessageSafely({ action: "abortTopicLoads" });

  activeTopicListProgress?.root.remove();
  activeTopicListProgress = null;

  for (const entry of activeTopicListEntries) {
    if (!entry.row.isConnected && entry.originalRowParent) {
      const nextSibling =
        entry.originalRowNextSibling?.parentNode === entry.originalRowParent
          ? entry.originalRowNextSibling
          : null;
      entry.originalRowParent.insertBefore(entry.row, nextSibling);
    }

    if (entry.row.isConnected) {
      entry.cell.innerHTML = entry.originalCellHtml;
      entry.cell.className = entry.originalCellClassName;
      if (entry.originalCellStyle === null) entry.cell.removeAttribute("style");
      else entry.cell.setAttribute("style", entry.originalCellStyle);

      if (entry.originalRowStyle === null) entry.row.removeAttribute("style");
      else entry.row.setAttribute("style", entry.originalRowStyle);
      if (entry.originalRowTitle === null) entry.row.removeAttribute("title");
      else entry.row.setAttribute("title", entry.originalRowTitle);
    }
  }

  document.querySelectorAll(".__prnlb_list_options").forEach((element) => {
    element.remove();
  });
  for (const [table, originalStyle] of activeTopicListTableStyles) {
    if (originalStyle === null) table.removeAttribute("style");
    else table.setAttribute("style", originalStyle);
  }
  activeTopicListTableStyles = new Map();
  activeTopicListEntries = [];
}
