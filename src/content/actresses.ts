import browser from "webextension-polyfill";
import {
  deleteActress,
  getActresses,
  saveActress,
  toggleActressFavorite,
  type ActressRecord,
} from "../actressStore";

interface LookupDetails {
  name?: string;
  otherNames?: string[];
  imageUrl?: string | null;
  imageDataUrl?: string | null;
  sourceUrl?: string;
}

let requestedActressEditor: ((name: string) => void) | null = null;

/** Open the catalogue editor for a Cast link, creating a prefilled draft when needed. */
export function requestActressEditor(name: string): void {
  requestedActressEditor?.(name);
}

export function disposeActressesPanel(): void {
  requestedActressEditor = null;
}

function safeImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function makeButton(text: string, title: string, className = ""): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.style.cssText =
    "padding:5px 8px;border:1px solid #aaa;border-radius:4px;background:#f7f7f7;color:#222;cursor:pointer;";
  if (className) button.className = className;
  return button;
}

function makeField(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.style.cssText = "display:flex;flex-direction:column;gap:5px;color:#333;font-size:13px;";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function makeTextInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.style.cssText =
    "box-sizing:border-box;width:100%;padding:7px 8px;border:1px solid #aaa;border-radius:4px;color:#222;background:#fff;";
  return input;
}

export function populateActressesPanel(panel: HTMLDivElement): void {
  panel.textContent = "";
  panel.style.color = "#333";

  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:14px;";
  const search = makeTextInput("Search actress…");
  search.style.flex = "1";
  const addButton = makeButton("＋ New actress", "Add actress");
  const count = document.createElement("span");
  count.style.cssText = "color:#666;font-size:12px;white-space:nowrap;";
  toolbar.append(search, addButton, count);

  const status = document.createElement("div");
  status.style.cssText = "min-height:18px;margin-bottom:8px;color:#666;font-size:12px;";
  const grid = document.createElement("div");
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;";
  panel.append(toolbar, status, grid);

  let items: ActressRecord[] = [];

  function render(): void {
    const query = search.value.trim().toLocaleLowerCase();
    const visible = items
      .filter((item) =>
        !query || item.name.toLocaleLowerCase().includes(query) || item.otherNames.some((name) => name.toLocaleLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    count.textContent = visible.length ? `${visible.length} actress${visible.length === 1 ? "" : "es"}` : "";
    grid.textContent = "";
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = 'No actresses yet. Click “New actress” to add one.';
      empty.style.cssText = "grid-column:1/-1;padding:24px 8px;text-align:center;color:#666;";
      grid.appendChild(empty);
      return;
    }
    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No actresses match the current search.";
      empty.style.cssText = "grid-column:1/-1;padding:24px 8px;text-align:center;color:#666;";
      grid.appendChild(empty);
      return;
    }
    for (const item of visible) {
      const card = document.createElement("div");
      card.tabIndex = 0;
      card.style.cssText =
        "position:relative;min-width:0;border:1px solid #ddd;border-radius:6px;overflow:hidden;background:#fafafa;text-align:center;cursor:pointer;";
      const thumb = document.createElement("div");
      thumb.style.cssText = "position:relative;aspect-ratio:1;background:#eee;display:flex;align-items:center;justify-content:center;font-size:34px;color:#999;";
      thumb.textContent = "🎭";
      const imageUrl = safeImageUrl(item.cachedImage) ?? safeImageUrl(item.postImage);
      if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;";
        image.onerror = () => image.remove();
        thumb.textContent = "";
        thumb.appendChild(image);
      }
      const favorite = makeButton(item.isFavorite ? "★" : "☆", item.isFavorite ? "Remove from favorites" : "Add to favorites");
      favorite.style.cssText += "position:absolute;top:5px;right:5px;padding:0 5px;border:0;background:rgba(0,0,0,.55);color:" + (item.isFavorite ? "#f0c419" : "#fff") + ";font-size:20px;line-height:25px;";
      const searchButton = makeButton("🔍", "Search actress on Pornolab");
      searchButton.style.cssText += "position:absolute;bottom:5px;right:5px;padding:0;width:27px;height:27px;border:0;border-radius:50%;background:rgba(0,0,0,.6);font-size:14px;";
      thumb.append(favorite, searchButton);
      const name = document.createElement("div");
      name.textContent = item.name;
      name.title = item.name;
      name.style.cssText = "padding:8px 5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;";
      card.append(thumb, name);
      favorite.addEventListener("click", (event) => {
        event.stopPropagation();
        void toggleActressFavorite(item.id).then((value) => {
          if (value !== undefined) void refresh();
        });
      });
      searchButton.addEventListener("click", (event) => {
        event.stopPropagation();
        void browser.runtime.sendMessage({ action: "openActressSearch", name: item.name });
      });
      card.addEventListener("click", () => openEditor(item));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openEditor(item);
        }
      });
      grid.appendChild(card);
    }
  }

  async function refresh(): Promise<void> {
    try {
      items = await getActresses();
      render();
    } catch {
      status.textContent = "Could not load the actress catalogue.";
    }
  }

  async function openRequestedEditor(name: string): Promise<void> {
    const latest = await getActresses();
    items = latest;
    render();
    const normalized = name.trim().toLocaleLowerCase();
    const existing = items.find((item) => item.name.toLocaleLowerCase() === normalized || item.otherNames.some((alias) => alias.toLocaleLowerCase() === normalized));
    openEditor(existing ?? null, existing ? undefined : name);
  }

  requestedActressEditor = (name) => void openRequestedEditor(name);

  function openEditor(item: ActressRecord | null, prefillName?: string): void {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483648;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.55);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.style.cssText = "display:flex;flex-direction:column;width:min(560px,100%);max-height:min(700px,100%);overflow:hidden;background:#fff;color:#222;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.45);";
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:13px 17px;border-bottom:1px solid #ddd;";
    const title = document.createElement("h3");
    title.textContent = item ? "🎭 Actress" : "🎭 New actress";
    title.style.cssText = "margin:0;font-size:16px;";
    const close = makeButton("×", "Close");
    close.style.cssText = "padding:0 4px;border:0;background:transparent;color:#666;font-size:25px;line-height:1;";
    header.append(title, close);
    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;gap:13px;overflow:auto;padding:17px;";
    const status = document.createElement("div");
    status.style.cssText = "min-height:18px;color:#666;font-size:12px;";

    const previewRow = document.createElement("div");
    previewRow.style.cssText = "display:flex;gap:12px;align-items:center;";
    const preview = document.createElement("img");
    preview.alt = "Actress picture preview";
    preview.style.cssText = "width:100px;height:100px;object-fit:cover;border-radius:6px;background:#eee;display:none;";
    const placeholder = document.createElement("div");
    placeholder.textContent = "🎭";
    placeholder.style.cssText = "width:100px;height:100px;display:flex;align-items:center;justify-content:center;border-radius:6px;background:#eee;font-size:34px;";
    const imageUrl = makeTextInput("https://… image URL");
    imageUrl.value = item?.postImage ?? "";
    let cachedImage = item?.cachedImage ?? null;
    const imageControls = document.createElement("div");
    imageControls.style.cssText = "display:flex;flex:1;flex-direction:column;gap:7px;";
    const imageActions = document.createElement("div");
    imageActions.style.cssText = "display:flex;gap:6px;align-items:center;";
    const resolveImage = makeButton("⬇ Apply / resolve", "Apply or resolve picture URL");
    imageActions.append(resolveImage);
    const imageHint = document.createElement("small");
    imageHint.textContent = "The URL is stored with this actress and used for the catalogue picture.";
    imageHint.style.cssText = "color:#666;line-height:1.35;";
    imageControls.append(makeField("Picture URL", imageUrl), imageActions, imageHint);
    previewRow.append(placeholder, preview, imageControls);

    const nameInput = makeTextInput("Primary name");
    nameInput.value = item?.name ?? prefillName ?? "";
    const nameRow = document.createElement("div");
    nameRow.style.cssText = "display:flex;gap:6px;align-items:flex-end;";
    const nameField = makeField("Name", nameInput);
    nameField.style.flex = "1";
    const boobpedia = makeButton("🌐", "Resolve with Boobpedia");
    const iafd = makeButton("🌐", "Resolve with IAFD");
    nameRow.append(nameField, boobpedia, iafd);

    let otherNames = item?.otherNames.slice() ?? [];
    const aliases = document.createElement("div");
    const aliasLabel = document.createElement("div");
    aliasLabel.textContent = "Other names";
    aliasLabel.style.cssText = "margin-bottom:5px;font-size:13px;color:#333;";
    const aliasList = document.createElement("div");
    const aliasControls = document.createElement("div");
    aliasControls.style.cssText = "display:flex;gap:6px;margin-top:7px;";
    const aliasInput = makeTextInput("Add alternate name…");
    aliasInput.style.flex = "1";
    const addAlias = makeButton("＋ Add", "Add alternate name");
    aliasControls.append(aliasInput, addAlias);
    aliases.append(aliasLabel, aliasList, aliasControls);

    function renderAliases(): void {
      aliasList.textContent = "";
      for (const [index, alias] of otherNames.entries()) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;gap:7px;margin-bottom:5px;";
        const value = document.createElement("span");
        value.textContent = alias;
        value.style.flex = "1";
        const remove = makeButton("✕", "Remove alternate name");
        remove.addEventListener("click", () => {
          otherNames.splice(index, 1);
          renderAliases();
        });
        row.append(value, remove);
        aliasList.appendChild(row);
      }
    }

    function updatePreview(): void {
      const value = safeImageUrl(cachedImage) ?? safeImageUrl(imageUrl.value.trim());
      if (!value) {
        preview.style.display = "none";
        placeholder.style.display = "flex";
        return;
      }
      preview.src = value;
      preview.style.display = "block";
      placeholder.style.display = "none";
    }

    function mergeLookup(details: LookupDetails): void {
      const previousName = nameInput.value.trim();
      if (details.name) nameInput.value = details.name;
      const merged = [...(details.otherNames ?? [])];
      if (previousName && details.name && previousName.toLocaleLowerCase() !== details.name.toLocaleLowerCase()) merged.push(previousName);
      for (const alias of merged) {
        const normalized = alias.trim().toLocaleLowerCase();
        if (normalized && normalized !== nameInput.value.trim().toLocaleLowerCase() && !otherNames.some((value) => value.toLocaleLowerCase() === normalized)) otherNames.push(alias.trim());
      }
      if (details.imageUrl) {
        imageUrl.value = details.imageUrl;
        cachedImage = details.imageDataUrl ?? null;
        updatePreview();
      }
      renderAliases();
      status.textContent = details.sourceUrl ? `Resolved from ${new URL(details.sourceUrl).hostname}. Review the fields, then save.` : "Actress details resolved. Review the fields, then save.";
      status.style.color = "#176b36";
    }

    async function lookup(provider: "boobpedia" | "iafd", button: HTMLButtonElement): Promise<void> {
      const query = nameInput.value.trim();
      if (!query) {
        status.textContent = "Enter a name first.";
        status.style.color = "#a33";
        nameInput.focus();
        return;
      }
      boobpedia.disabled = true;
      iafd.disabled = true;
      status.textContent = `Resolving with ${provider === "iafd" ? "IAFD" : "Boobpedia"}…`;
      status.style.color = "#666";
      try {
        const details = (await browser.runtime.sendMessage({ action: "lookupActress", provider, query })) as LookupDetails | null;
        if (!details) throw new Error("No match found");
        mergeLookup(details);
      } catch (error) {
        status.textContent = `Could not resolve actress: ${(error as Error).message}`;
        status.style.color = "#a33";
      } finally {
        boobpedia.disabled = false;
        iafd.disabled = false;
        button.blur();
      }
    }

    addAlias.addEventListener("click", () => {
      const value = aliasInput.value.trim();
      if (!value || value.toLocaleLowerCase() === nameInput.value.trim().toLocaleLowerCase() || otherNames.some((name) => name.toLocaleLowerCase() === value.toLocaleLowerCase())) return;
      otherNames.push(value);
      aliasInput.value = "";
      renderAliases();
    });
    aliasInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addAlias.click();
      }
    });
    imageUrl.addEventListener("input", () => {
      cachedImage = null;
      updatePreview();
    });
    resolveImage.addEventListener("click", async () => {
      const value = safeImageUrl(imageUrl.value.trim());
      if (!value) {
        status.textContent = "Enter a valid HTTP(S) image or image-host URL first.";
        status.style.color = "#a33";
        return;
      }
      resolveImage.disabled = true;
      status.textContent = "Resolving picture…";
      status.style.color = "#666";
      try {
        cachedImage = null;
        const response = (await browser.runtime.sendMessage({
          action: "resolveImages",
          images: [{ thumbnailUrl: value, resolveUrl: value }],
        })) as { images?: Array<{ resolvedUrl?: string }> };
        const resolved = response.images?.[0]?.resolvedUrl;
        const finalUrl = resolved ?? value;
        if (resolved) imageUrl.value = resolved;
        const cached = (await browser.runtime.sendMessage({
          action: "cacheImage",
          url: finalUrl,
        })) as { imageDataUrl?: string | null };
        cachedImage = cached.imageDataUrl ?? null;
        updatePreview();
        status.textContent = cachedImage
          ? (resolved ? "Picture URL resolved and cached. Save to keep it." : "Picture URL applied and cached. Save to keep it.")
          : (resolved ? "Picture URL resolved. Save to keep it." : "Picture URL applied. Save to keep it.");
        status.style.color = "#176b36";
      } catch (error) {
        status.textContent = `Could not resolve picture: ${(error as Error).message}`;
        status.style.color = "#a33";
      } finally {
        resolveImage.disabled = false;
      }
    });
    preview.onerror = () => {
      preview.style.display = "none";
      placeholder.style.display = "flex";
    };
    boobpedia.addEventListener("click", () => void lookup("boobpedia", boobpedia));
    iafd.addEventListener("click", () => void lookup("iafd", iafd));
    renderAliases();
    updatePreview();

    body.append(previewRow, nameRow, aliases, status);
    const footer = document.createElement("div");
    footer.style.cssText = "display:flex;justify-content:space-between;gap:8px;padding:11px 17px;border-top:1px solid #ddd;";
    const deleteButton = makeButton("🗑 Delete", "Delete actress");
    deleteButton.style.color = "#a33";
    deleteButton.hidden = !item;
    const footerRight = document.createElement("div");
    footerRight.style.cssText = "display:flex;gap:7px;margin-left:auto;";
    const cancel = makeButton("Cancel", "Cancel");
    const save = makeButton("💾 Save", "Save actress");
    save.style.background = "#eef0ff";
    footerRight.append(cancel, save);
    footer.append(deleteButton, footerRight);
    dialog.append(header, body, footer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function closeEditor(): void {
      overlay.remove();
      document.removeEventListener("keydown", onKeyDown);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") closeEditor();
    }
    close.addEventListener("click", closeEditor);
    cancel.addEventListener("click", closeEditor);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeEditor();
    });
    document.addEventListener("keydown", onKeyDown);
    save.addEventListener("click", async () => {
      try {
        save.disabled = true;
        status.textContent = "Saving…";
        status.style.color = "#666";
        await saveActress({ id: item?.id, name: nameInput.value, otherNames, postImage: imageUrl.value.trim() || null, cachedImage, isFavorite: item?.isFavorite });
        await refresh();
        closeEditor();
      } catch (error) {
        status.textContent = `Could not save actress: ${(error as Error).message}`;
        status.style.color = "#a33";
        save.disabled = false;
      }
    });
    deleteButton.addEventListener("click", async () => {
      if (!item || !window.confirm("Delete this actress? This cannot be undone.")) return;
      deleteButton.disabled = true;
      try {
        await deleteActress(item.id);
        await refresh();
        closeEditor();
      } catch (error) {
        status.textContent = `Could not delete actress: ${(error as Error).message}`;
        status.style.color = "#a33";
        deleteButton.disabled = false;
      }
    });
    nameInput.focus();
  }

  search.addEventListener("input", render);
  addButton.addEventListener("click", () => openEditor(null));
  void refresh();
}
