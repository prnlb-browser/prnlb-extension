import type { ResolvedImage } from "./resolvers/types";
import type { ExtensionMessage } from "./types";

// ===== Image extraction =====

function extractImagesFromPost(): string[] {
  const urls: string[] = [];

  // Method 1: <var class="postImg" title="URL"> — BBCode [img] tags
  document.querySelectorAll("var.postImg").forEach((el) => {
    const title = el.getAttribute("title");
    if (title) urls.push(title);
  });

  // Method 2: <img> tags inside the first post message
  document.querySelectorAll(".post-user-message img").forEach((el) => {
    const src = el.getAttribute("src");
    if (src) urls.push(src);
  });

  // Method 3: <a> tags wrapping images
  document.querySelectorAll(".post-user-message a img").forEach((el) => {
    const src = el.getAttribute("src");
    if (src) urls.push(src);
  });

  // Method 4: Raw fastpic.org URLs in <a> tags that don't wrap an embedded thumb
  document
    .querySelectorAll(".post-user-message a[href*='fastpic.org']")
    .forEach((el) => {
      if (el.querySelector("var.postImg")) return;
      const href = el.getAttribute("href");
      if (href) urls.push(href);
    });

  // Resolve relative URLs and deduplicate
  return [
    ...new Set(
      urls.map((u) =>
        u.startsWith("http")
          ? u
          : `https://pornolab.net/forum/${u.replace(/^\.\//, "")}`
      )
    ),
  ];
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
  const imageUrls = extractImagesFromPost();
  if (imageUrls.length === 0) {
    progressText.textContent = "No images found in this post.";
    return;
  }

  title.textContent = `Screenshots (${imageUrls.length} found)`;
  progressText.textContent = `Sending ${imageUrls.length} images to background for resolution...`;
  progressBarContainer.hidden = false;
  progressBar.style.width = "30%";

  // 2. Send to background service worker for CORS-free resolution
  try {
    const response = await chrome.runtime.sendMessage({
      action: "resolveImages",
      urls: imageUrls,
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
      thumb.src = img.originalUrl;
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
  }
}

// ===== Message listener =====

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.action === "showCarousel") {
    openCarousel();
  }
  return false;
});