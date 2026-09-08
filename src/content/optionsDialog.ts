import {
  clearHiddenTopics,
  getTopicListSettings,
  notifyTopicListSettingsChanged,
  setHighlightActresses,
  setHideHiddenTopics,
} from "./hiddenTopics";
import { disposeActressesPanel, populateActressesPanel } from "./actresses";

const DIALOG_ID = "__prnlb_options_dialog";

type OptionsTab = "actresses" | "options";

export function openOptionsDialog(): void {
  const existing = document.getElementById(DIALOG_ID);
  if (existing) {
    (existing.querySelector<HTMLElement>("[role=\"tab\"]:focus") ??
      existing.querySelector<HTMLElement>("[role=\"tab\"]"))?.focus();
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = DIALOG_ID;
  overlay.setAttribute("role", "presentation");
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:rgba(0,0,0,.52);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";

  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "__prnlb_options_title");
  dialog.style.cssText =
    "display:flex;flex-direction:column;width:min(720px,100%);min-height:360px;max-height:min(760px,100%);overflow:hidden;background:#fff;color:#222;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.4);";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #ddd;";

  const title = document.createElement("h2");
  title.id = "__prnlb_options_title";
  title.textContent = "PRNLB Viewer options";
  title.style.cssText = "margin:0;font-size:17px;font-weight:600;";

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.title = "Close options";
  close.setAttribute("aria-label", "Close options");
  close.style.cssText =
    "padding:0 4px;border:0;background:transparent;color:#666;font-size:26px;line-height:1;cursor:pointer;";

  const tabs = document.createElement("div");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "PRNLB Viewer options");
  tabs.style.cssText =
    "display:flex;gap:2px;padding:8px 18px 0;border-bottom:1px solid #ddd;";

  const panels = document.createElement("div");
  panels.style.cssText = "flex:1;overflow:auto;padding:20px 18px;";

  const tabElements = new Map<OptionsTab, HTMLButtonElement>();
  const panelElements = new Map<OptionsTab, HTMLDivElement>();

  function createTab(id: OptionsTab, label: string): HTMLButtonElement {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.id = `__prnlb_options_tab_${id}`;
    tab.textContent = label;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `__prnlb_options_panel_${id}`);
    tab.style.cssText =
      "padding:9px 14px;border:0;border-bottom:3px solid transparent;background:transparent;color:#555;font-size:14px;cursor:pointer;";
    tabs.appendChild(tab);
    tabElements.set(id, tab);
    return tab;
  }

  function createPanel(id: OptionsTab, text: string): HTMLDivElement {
    const panel = document.createElement("div");
    panel.id = `__prnlb_options_panel_${id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `__prnlb_options_tab_${id}`);
    panel.tabIndex = 0;
    panel.textContent = text;
    panel.style.cssText = "font-size:14px;color:#555;outline:none;";
    panels.appendChild(panel);
    panelElements.set(id, panel);
    return panel;
  }

  createTab("actresses", "Actresses");
  createTab("options", "Options");
  const actressesPanel = createPanel("actresses", "Actress settings");
  populateActressesPanel(actressesPanel);
  const optionsPanel = createPanel("options", "Viewer settings");
  populateOptionsPanel(optionsPanel);

  function selectTab(selected: OptionsTab): void {
    for (const [id, tab] of tabElements) {
      const active = id === selected;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      tab.style.color = active ? "#111" : "#555";
      tab.style.fontWeight = active ? "600" : "400";
      tab.style.borderBottomColor = active ? "#4f46e5" : "transparent";
    }
    for (const [id, panel] of panelElements) {
      panel.hidden = id !== selected;
    }
  }

  for (const [id, tab] of tabElements) {
    tab.addEventListener("click", () => selectTab(id));
  }

  close.addEventListener("click", closeOptionsDialog);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeOptionsDialog();
  });

  header.append(title, close);
  dialog.append(header, tabs, panels);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  selectTab("actresses");
  tabElements.get("actresses")?.focus();
  document.addEventListener("keydown", handleEscape);
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") closeOptionsDialog();
}

function populateOptionsPanel(panel: HTMLDivElement): void {
  panel.textContent = "";
  panel.style.color = "#333";

  const section = document.createElement("section");
  section.style.cssText = "display:flex;flex-direction:column;gap:14px;";

  const heading = document.createElement("h3");
  heading.textContent = "Hidden topics";
  heading.style.cssText = "margin:0;font-size:15px;color:#222;";

  const setting = document.createElement("label");
  setting.style.cssText =
    "display:flex;align-items:flex-start;gap:8px;color:#222;cursor:pointer;";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.disabled = true;
  checkbox.style.cssText = "margin:2px 0 0;";

  const settingText = document.createElement("span");
  settingText.textContent = "Show/Hide hidden";
  const settingDescription = document.createElement("small");
  settingDescription.textContent =
    "Apply hidden flags to topic lists and search results.";
  settingDescription.style.cssText =
    "display:block;margin-top:4px;color:#666;line-height:1.4;";
  settingText.appendChild(settingDescription);
  setting.append(checkbox, settingText);

  const highlightSetting = document.createElement("label");
  highlightSetting.style.cssText =
    "display:flex;align-items:flex-start;gap:8px;color:#222;cursor:pointer;";
  const highlightCheckbox = document.createElement("input");
  highlightCheckbox.type = "checkbox";
  highlightCheckbox.disabled = true;
  highlightCheckbox.style.cssText = "margin:2px 0 0;";
  const highlightText = document.createElement("span");
  highlightText.textContent = "Highlight actresses";
  const highlightDescription = document.createElement("small");
  highlightDescription.textContent =
    "Highlight topics whose first post Cast contains an actress from the catalogue.";
  highlightDescription.style.cssText =
    "display:block;margin-top:4px;color:#666;line-height:1.4;";
  highlightText.appendChild(highlightDescription);
  highlightSetting.append(highlightCheckbox, highlightText);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Remove all hidden flags";
  clearButton.style.cssText =
    "align-self:flex-start;padding:7px 11px;border:1px solid #999;border-radius:4px;background:#f5f5f5;color:#222;cursor:pointer;";

  const status = document.createElement("div");
  status.style.cssText = "min-height:18px;color:#666;font-size:12px;";

  section.append(heading, setting, highlightSetting, clearButton, status);
  panel.appendChild(section);

  void getTopicListSettings()
    .then((settings) => {
      checkbox.checked = settings.hideHiddenTopics;
      checkbox.disabled = false;
      highlightCheckbox.checked = settings.highlightActresses;
      highlightCheckbox.disabled = false;
    })
    .catch(() => {
      status.textContent = "Could not load viewer settings.";
    });

  checkbox.addEventListener("change", () => {
    const enabled = checkbox.checked;
    checkbox.disabled = true;
    void setHideHiddenTopics(enabled)
      .then(() => {
        status.textContent = "Saved. Reloading the topic list…";
        notifyTopicListSettingsChanged();
      })
      .catch(() => {
        checkbox.checked = !enabled;
        status.textContent = "Could not save viewer settings.";
      })
      .finally(() => {
        checkbox.disabled = false;
      });
  });

  highlightCheckbox.addEventListener("change", () => {
    const enabled = highlightCheckbox.checked;
    highlightCheckbox.disabled = true;
    void setHighlightActresses(enabled)
      .then(() => {
        status.textContent = "Saved. Reloading the topic list…";
        notifyTopicListSettingsChanged();
      })
      .catch(() => {
        highlightCheckbox.checked = !enabled;
        status.textContent = "Could not save viewer settings.";
      })
      .finally(() => {
        highlightCheckbox.disabled = false;
      });
  });

  clearButton.addEventListener("click", () => {
    clearButton.disabled = true;
    void clearHiddenTopics()
      .then(() => {
        status.textContent = "All hidden flags removed. Reloading the topic list…";
        notifyTopicListSettingsChanged();
      })
      .catch(() => {
        status.textContent = "Could not remove hidden flags.";
      })
      .finally(() => {
        clearButton.disabled = false;
      });
  });
}

export function closeOptionsDialog(): void {
  document.getElementById(DIALOG_ID)?.remove();
  disposeActressesPanel();
  document.removeEventListener("keydown", handleEscape);
}
