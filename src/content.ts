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

function openCarousel(): void {
  const existing = document.getElementById("__prnlb_carousel");
  if (existing) existing.remove();

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
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closeCarousel();
    if (e.key === "ArrowLeft") showImage(carouselIndex - 1);
    if (e.key === "ArrowRight") showImage(carouselIndex + 1);
  };
  document.addEventListener("keydown", keyHandler);

  // Start the pipeline
  loadAndShowImages();
}

function closeCarousel(): void {
  const overlay = document.getElementById("__prnlb_carousel");
  if (overlay) overlay.remove();
  carouselImages = [];
  carouselIndex = 0;
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

async function loadAndShowImages(): Promise<void> {
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
  const scrapedImages = extractImagesFromPost();
  if (scrapedImages.length === 0) {
    progressText.textContent = "No images found in this post.";
    return;
  }

  title.textContent = `Screenshots (${scrapedImages.length} found)`;
  progressText.textContent = `Sending ${scrapedImages.length} images to background for resolution...`;
  progressBarContainer.hidden = false;
  progressBar.style.width = "5%";

  // Listen for progress updates from the background script while it resolves images
  const progressListener = (message: ExtensionMessage) => {
    if (message.action !== "resolveProgress") return;
    const { current, total, message: msg } = message;
    progressText.textContent = msg;
    if (total > 0) {
      const pct = Math.max(5, Math.round((current / total) * 100));
      progressBar.style.width = `${pct}%`;
    }
  };
  browser.runtime.onMessage.addListener(progressListener);

  // 2. Send to background service worker for CORS-free resolution
  try {
    const response = await browser.runtime.sendMessage({
      action: "resolveImages",
      images: scrapedImages,
    });

    const resolved: ResolvedImage[] = response.images || [];

    if (resolved.length === 0) {
      progressText.textContent =
        "Could not resolve any images. Check background console for details.";
      progressBarContainer.hidden = true;
      return;
    }

    carouselImages = resolved;
    title.textContent = `Screenshots (${resolved.length} resolved)`;

    // 3. Render thumbnails
    thumbsContainer.innerHTML = "";
    resolved.forEach((img, i) => {
      const thumb = document.createElement("img");
      thumb.src = img.thumbnailUrl;
      thumb.alt = `Thumb ${i + 1}`;
      thumb.loading = "lazy";
      thumb.style.cssText =
        "height:40px;width:auto;border-radius:4px;border:2px solid #444;cursor:pointer;opacity:0.5;transition:all 0.15s;flex-shrink:0;";
      thumb.onclick = () => showImage(i);
      thumbsContainer.appendChild(thumb);
    });

    // 4. Show first image
    progressBar.style.width = "100%";
    showImage(0);
  } catch (err) {
    progressText.textContent = `Error: ${(err as Error).message}`;
    progressBarContainer.hidden = true;
  } finally {
    browser.runtime.onMessage.removeListener(progressListener);
  }
}

// ===== Message listener =====

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.action === "showCarousel") {
    openCarousel();
  }
  return false;
});