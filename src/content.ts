import browser from "webextension-polyfill";
import type { ResolvedImage, ScrapedImage } from "./resolvers/types";
import type { ExtensionMessage } from "./types";

// ===== Image extraction =====

function extractImagesFromPost(): ScrapedImage[] {
  const images: ScrapedImage[] = [];

  // Method 1: <var class="postImg" title="URL"> — BBCode [img] tags
  // When wrapped in an <a> tag, use <img src> as thumbnail and <a href> as resolve URL
  document.querySelectorAll("var.postImg").forEach((el) => {
    const imgEl = el.querySelector("img");
    const imgSrc = imgEl ? imgEl.getAttribute("src") : null;
    const titleSrc = el.getAttribute("title");
    const thumbnail = (imgSrc || titleSrc || "");

    const parentLink = el.closest("a");
    if (parentLink) {
      const href = parentLink.getAttribute("href");
      if (href && href.startsWith("http")) {
        images.push({ thumbnailUrl: thumbnail, resolveUrl: href });
        return;
      }
    }
    // No parent link — use thumbnail URL as the resolve URL too
    if (thumbnail) images.push({ thumbnailUrl: thumbnail, resolveUrl: thumbnail });
  });

  // Method 2: <img> tags inside the first post message
  // Skip <img> elements inside <var class="postImg"> — those are handled by Method 1
  document.querySelectorAll(".post-user-message img").forEach((el) => {
    if (el.closest("var.postImg")) return;
    const src = el.getAttribute("src");
    if (src) images.push({ thumbnailUrl: src, resolveUrl: src });
  });

  // Method 3: <a> tags with images inside the first post
  // Skip <img> elements inside <var class="postImg"> — those are handled by Method 1
  document.querySelectorAll(".post-user-message a img").forEach((el) => {
    if (el.closest("var.postImg")) return;
    const src = el.getAttribute("src");
    if (src) images.push({ thumbnailUrl: src, resolveUrl: src });
  });

  // Method 4: <a> tags that point to known image hosts.
  // Exclude links that wrap a <var class="postImg"> — those are already handled by Method 1
  document.querySelectorAll(".post-user-message a[href]").forEach((el) => {
    if (el.querySelector("var.postImg")) return;
    const href = el.getAttribute("href");
    if (href && href.startsWith("http")) {
      images.push({ thumbnailUrl: href, resolveUrl: href });
    }
  });

  // Resolve relative URLs and deduplicate by resolveUrl
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

// ===== Carousel UI =====

let carouselImages: ResolvedImage[] = [];
let carouselIndex = 0;
let carouselKeyHandler: ((event: KeyboardEvent) => void) | undefined;

function openCarousel(scrapedImages?: ScrapedImage[]): void {
  const existing = document.getElementById("__prnlb_carousel");
  if (existing) closeCarousel();

  const wrapper = document.createElement("div");
  wrapper.id = "__prnlb_carousel";
  wrapper.innerHTML = `
  <div id="__prnlb_backdrop" style="
    all:unset;position:fixed;inset:0;z-index:2147483647;
    background:rgba(0,0,0,0.85);
    display:flex;align-items:center;justify-content:center;
  ">
    <div style="
      position:relative;
      display:flex;flex-direction:column;
      max-width:90vw;max-height:90vh;
      background:#111;border-radius:12px;
      overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6);
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    ">
      <!-- Header -->
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:12px 20px;background:#1a1a1a;border-bottom:1px solid #333;
      ">
        <span id="__prnlb_title" style="color:#eee;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          Screenshots
        </span>
        <button id="__prnlb_close" style="
          background:none;border:none;color:#888;font-size:20px;cursor:pointer;
          padding:0 4px;line-height:1;
        ">&times;</button>
      </div>

      <!-- Body -->
      <div style="display:flex;align-items:center;justify-content:center;padding:0;position:relative;min-height:300px;flex:1;">
        <button id="__prnlb_prev" style="
          position:absolute;left:8px;z-index:10;
          background:rgba(0,0,0,0.5);border:none;color:#fff;font-size:32px;
          width:44px;height:44px;border-radius:50%;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
        " disabled>&lsaquo;</button>

        <div style="display:flex;align-items:center;justify-content:center;flex:1;">
          <img id="__prnlb_img" src="" alt="Loading..."
            style="display:none;max-width:90vw;max-height:70vh;object-fit:contain;cursor:pointer;" />

          <div id="__prnlb_loading" style="
            text-align:center;padding:40px;color:#aaa;font-size:14px;
          ">
            <div id="__prnlb_progress_text">Analyzing page...</div>
            <div id="__prnlb_progress_bar_container" style="
              width:280px;height:4px;background:#333;border-radius:2px;
              margin:12px auto 0;overflow:hidden;
            " hidden>
              <div id="__prnlb_progress_bar" style="
                height:100%;width:0%;background:#4f46e5;border-radius:2px;transition:width 0.2s;
              "></div>
            </div>
          </div>
        </div>

        <button id="__prnlb_next" style="
          position:absolute;right:8px;z-index:10;
          background:rgba(0,0,0,0.5);border:none;color:#fff;font-size:32px;
          width:44px;height:44px;border-radius:50%;cursor:pointer;
          display:flex;align-items:center;justify-content:center;
        " disabled>&rsaquo;</button>
      </div>

      <!-- Footer -->
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:10px 20px;background:#1a1a1a;border-top:1px solid #333;
      ">
        <span id="__prnlb_counter" style="color:#888;font-size:13px;"></span>
        <div id="__prnlb_thumbs" style="
          display:flex;gap:6px;overflow-x:auto;flex:1;margin:0 12px;padding:2px 0;
        "></div>
        <span style="color:#888;font-size:12px;">Click image to open</span>
      </div>
    </div>
  </div>`;

  document.body.appendChild(wrapper);

  // Wire up events
  document.getElementById("__prnlb_close")!.onclick = closeCarousel;
  document.getElementById("__prnlb_backdrop")!.onclick = (e) => {
    if (e.target === e.currentTarget) closeCarousel();
  };
  document.getElementById("__prnlb_prev")!.onclick = () =>
    showImage(carouselIndex - 1);
  document.getElementById("__prnlb_next")!.onclick = () =>
    showImage(carouselIndex + 1);
  document.getElementById("__prnlb_img")!.onclick = () => {
    if (carouselImages[carouselIndex]?.resolvedUrl) {
      window.open(carouselImages[carouselIndex].resolvedUrl, "_blank");
    }
  };

  // Keyboard navigation
  carouselKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeCarousel();
    if (e.key === "ArrowLeft") showImage(carouselIndex - 1);
    if (e.key === "ArrowRight") showImage(carouselIndex + 1);
  };
  document.addEventListener("keydown", carouselKeyHandler);

  // Start the pipeline
  loadAndShowImages(scrapedImages);
}

function closeCarousel(): void {
  const overlay = document.getElementById("__prnlb_carousel");
  if (overlay) overlay.remove();
  if (carouselKeyHandler) {
    document.removeEventListener("keydown", carouselKeyHandler);
    carouselKeyHandler = undefined;
  }
  carouselImages = [];
  carouselIndex = 0;
  // Tell the background script to stop resolving images
  browser.runtime.sendMessage({ action: "abortResolution" }).catch(() => {});
}

function showImage(index: number): void {
  if (carouselImages.length === 0) return;
  index = Math.max(0, Math.min(index, carouselImages.length - 1));
  carouselIndex = index;

  const img = document.getElementById("__prnlb_img") as HTMLImageElement;
  const loading = document.getElementById("__prnlb_loading")!;
  const prev = document.getElementById("__prnlb_prev") as HTMLButtonElement;
  const next = document.getElementById("__prnlb_next") as HTMLButtonElement;
  const counter = document.getElementById("__prnlb_counter")!;
  const thumbs = document.getElementById("__prnlb_thumbs")!;

  const data = carouselImages[index];
  img.src = data.resolvedUrl;
  img.style.display = "block";
  loading.hidden = true;

  counter.textContent = `${index + 1} / ${carouselImages.length}`;
  prev.disabled = index === 0;
  next.disabled = index === carouselImages.length - 1;

  thumbs.querySelectorAll("img").forEach((t, i) => {
    t.style.borderColor = i === index ? "#4f46e5" : "#444";
    t.style.opacity = i === index ? "1" : "0.5";
    if (i === index)
      t.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
  });
}

async function loadAndShowImages(scrapedImages?: ScrapedImage[]): Promise<void> {
  const imgEl = document.getElementById("__prnlb_img") as HTMLImageElement;
  const loading = document.getElementById("__prnlb_loading")!;
  const progressText = document.getElementById("__prnlb_progress_text")!;
  const progressBarContainer = document.getElementById(
    "__prnlb_progress_bar_container"
  )!;
  const progressBar = document.getElementById(
    "__prnlb_progress_bar"
  ) as HTMLElement;
  const thumbsContainer = document.getElementById("__prnlb_thumbs")!;
  const title = document.getElementById("__prnlb_title")!;

  imgEl.style.display = "none";
  loading.hidden = false;
  progressText.textContent = "Extracting images from post...";
  progressBarContainer.hidden = true;

  // 1. Extract images from the page DOM
  const imagesToResolve = scrapedImages ?? extractImagesFromPost();
  if (imagesToResolve.length === 0) {
    progressText.textContent = "No images found in this post.";
    return;
  }

  title.textContent = `Screenshots (${imagesToResolve.length} found)`;
  progressText.textContent = `Sending ${imagesToResolve.length} images to background for resolution...`;
  progressBarContainer.hidden = false;
  progressBar.style.width = "5%";

  // Reset carousel state and thumbnail strip; images will be appended as
  // each one is resolved, so the user can browse/view them immediately
  // instead of waiting for the whole batch to finish.
  carouselImages = [];
  carouselIndex = 0;
  thumbsContainer.innerHTML = "";

  // Listen for progress updates from the background script while it resolves images
  const progressListener = (rawMessage: unknown) => {
    const message = rawMessage as ExtensionMessage;
    if (message.action !== "resolveProgress") return;
    const { current, total, message: msg, image } = message;
    progressText.textContent = msg;
    if (total > 0) {
      const pct = Math.max(5, Math.round((current / total) * 100));
      progressBar.style.width = `${pct}%`;
    }

    if (image) {
      const isFirst = carouselImages.length === 0;
      const index = carouselImages.length;
      carouselImages.push(image);

      const thumb = document.createElement("img");
      thumb.src = image.thumbnailUrl;
      thumb.alt = `Thumb ${index + 1}`;
      thumb.loading = "lazy";
      thumb.style.cssText =
        "height:40px;width:auto;border-radius:4px;border:2px solid #444;cursor:pointer;opacity:0.5;transition:all 0.15s;flex-shrink:0;";
      thumb.onclick = () => showImage(index);
      thumbsContainer.appendChild(thumb);

      title.textContent = `Screenshots (${carouselImages.length}/${total} resolved)`;

      // Show the very first resolved image right away instead of making
      // the user wait for the whole batch (or the loading spinner) to finish.
      if (isFirst) showImage(0);
      else {
        // Keep the counter/nav buttons in sync as more images arrive.
        const counter = document.getElementById("__prnlb_counter")!;
        const next = document.getElementById("__prnlb_next") as HTMLButtonElement;
        counter.textContent = `${carouselIndex + 1} / ${carouselImages.length}`;
        next.disabled = carouselIndex === carouselImages.length - 1;
      }
    }
  };
  browser.runtime.onMessage.addListener(progressListener);

  // 2. Send to background service worker for CORS-free resolution
  try {
    const response = (await browser.runtime.sendMessage({
      action: "resolveImages",
      images: imagesToResolve,
    })) as { images?: ResolvedImage[] };

    const resolved: ResolvedImage[] = response?.images || [];

    if (resolved.length === 0) {
      progressText.textContent =
        "Could not resolve any images. Check background console for details.";
      progressBarContainer.hidden = true;
      return;
    }

    carouselImages = resolved;
    title.textContent = `Screenshots (${resolved.length} resolved)`;

    // 4. Show first image (in case none were shown progressively, e.g. if
    // resolveProgress messages weren't received for some reason).
    progressBar.style.width = "100%";
    showImage(carouselIndex);
  } catch (err) {
    progressText.textContent = `Error: ${(err as Error).message}`;
    progressBarContainer.hidden = true;
  } finally {
    browser.runtime.onMessage.removeListener(progressListener);
  }
}

// ===== Topic-list mode =====

interface TopicListEntry {
  row: HTMLTableRowElement;
  cell: HTMLTableCellElement;
  topicUrl: string;
  images: ScrapedImage[];
}

let topicListModeActive = false;

interface TopicListProgress {
  root: HTMLDivElement;
  label: HTMLSpanElement;
  bar: HTMLDivElement;
  completed: number;
  total: number;
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

window.addEventListener("pagehide", () => {
  browser.runtime.sendMessage({ action: "abortTopicLoads" }).catch(() => {});
});

function findTopicListTables(): HTMLTableElement[] {
  const tables = new Set<HTMLTableElement>();
  const tableSelectors = [
    // Search results use the sortable tracker table.
    "#search-results table.forumline.tablesorter#tor-tbl",
    // Forum topic lists use the forum table.
    "#main_content_wrap > table.forumline.forum",
  ];

  for (const selector of tableSelectors) {
    for (const table of document.querySelectorAll<HTMLTableElement>(selector)) {
      tables.add(table);
    }
  }
  return [...tables];
}

function addTopicListOptionsIcon(table: HTMLTableElement): void {
  const host = table.parentElement ?? table;
  if (host.querySelector(":scope > .__prnlb_list_options")) return;

  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  const options = document.createElement("button");
  options.type = "button";
  options.className = "__prnlb_list_options";
  options.title = "PRNLB Viewer options";
  options.setAttribute("aria-label", "PRNLB Viewer options");
  options.style.cssText =
    "position:absolute;top:4px;left:4px;z-index:5;width:28px;height:28px;padding:3px;border:1px solid rgba(0,0,0,.25);border-radius:4px;background:rgba(255,255,255,.9);cursor:pointer;opacity:.85;";

  const icon = document.createElement("img");
  icon.src = browser.runtime.getURL("icon.png");
  icon.alt = "";
  icon.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
  options.appendChild(icon);
  host.appendChild(options);
}

function findPreviewCell(row: HTMLTableRowElement): HTMLTableCellElement | null {
  // Topic-list layouts differ: the "проверено" column exists in search
  // results but not in forum lists. The first column is common to both.
  return row.cells[0] ?? null;
}

function createTopicListEntries(table: HTMLTableElement): TopicListEntry[] {
  const entries: TopicListEntry[] = [];
  const seenRows = new Set<HTMLTableRowElement>();

  for (const link of table.querySelectorAll<HTMLAnchorElement>(
    "a.med.tLink.bold.t-vis[href*='viewtopic.php'], a.topictitle.tt-text[href*='viewtopic.php']",
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
    entries.push({ row, cell, topicUrl, images: [] });
  }

  return entries;
}

function prepareTopicListCell(entry: TopicListEntry): {
  preview: HTMLImageElement;
  button: HTMLButtonElement;
} {
  entry.cell.innerHTML = "";
  entry.cell.classList.add("__prnlb_topic_preview_cell");
  entry.cell.style.verticalAlign = "middle";

  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "display:flex;align-items:center;gap:8px;width:230px;max-width:calc(100vw - 20px);box-sizing:border-box;overflow:visible;";

  const preview = document.createElement("img");
  preview.alt = "Loading post image";
  preview.style.cssText =
    "display:block;flex:0 1 180px;min-width:0;width:180px !important;max-width:180px !important;height:110px !important;max-height:110px !important;object-fit:contain;border-radius:3px;";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "📷";
  button.setAttribute("aria-label", "View screenshots");
  button.disabled = true;
  button.title = "View screenshots from this topic";
  button.style.cssText =
    "display:block;width:34px;height:34px;padding:2px;border:1px solid #999;border-radius:4px;background:#f5f5f5;color:#222;font-size:19px;line-height:1;cursor:pointer;";

  const actions = document.createElement("div");
  actions.className = "__prnlb_topic_actions";
  actions.style.cssText =
    "display:flex;flex:0 0 42px;flex-direction:column;align-items:center;gap:5px;";
  actions.appendChild(button);

  wrapper.append(preview, actions);
  entry.cell.appendChild(wrapper);
  return { preview, button };
}

async function loadTopicListEntry(entry: TopicListEntry): Promise<void> {
  const { preview, button } = prepareTopicListCell(entry);

  try {
    const response = (await browser.runtime.sendMessage({
      action: "loadTopicImages",
      url: entry.topicUrl,
    })) as { images?: ScrapedImage[]; previewUrl?: string };
    entry.images = Array.isArray(response.images) ? response.images : [];

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
  } catch {
    preview.alt = "Topic image unavailable";
  }
}

async function activateTopicListMode(): Promise<void> {
  if (topicListModeActive) return;

  const tables = findTopicListTables();
  if (tables.length === 0) return;
  topicListModeActive = true;

  const entries = tables.flatMap((table) => {
    addTopicListOptionsIcon(table);
    return createTopicListEntries(table);
  });
  if (entries.length === 0) {
    // Leave activation retryable if the page shell was ready but its rows
    // were inserted just after the content script ran.
    topicListModeActive = false;
    return;
  }

  const progress = createTopicListProgress(entries.length);

  // Keep the number of background tabs reasonable on large tracker pages.
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < entries.length) {
      const entry = entries[nextIndex++];
      if (!entry) continue;
      try {
        await loadTopicListEntry(entry);
      } finally {
        progress.completed += 1;
        updateTopicListProgress(progress);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  window.setTimeout(() => progress.root.remove(), 1200);
}

// ===== Message listener =====

browser.runtime.onMessage.addListener((rawMessage: unknown) => {
  const message = rawMessage as ExtensionMessage;
  if (message.action === "showCarousel") {
    openCarousel();
  } else if (message.action === "showTopicList") {
    void activateTopicListMode();
  }
});
