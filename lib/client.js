window.__ModuleLoader__.load({
	id: "dsh-memoir",
	factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/controller.ts
var PanelController = class {
  state = { panelOpen: false };
  listeners = /* @__PURE__ */ new Set();
  /** The current immutable snapshot. */
  getSnapshot() {
    return this.state;
  }
  /** Subscribe to state changes; returns an unsubscribe function. */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  open() {
    this.patch({ panelOpen: true });
  }
  close() {
    this.patch({ panelOpen: false });
  }
  toggle() {
    this.patch({ panelOpen: !this.state.panelOpen });
  }
  /** Replace the snapshot; notifies only when the observable state changed. */
  patch(next) {
    const prev = this.state;
    this.state = { ...prev, ...next };
    if (this.state.panelOpen === prev.panelOpen) return;
    for (const listener of [...this.listeners]) listener();
  }
};

// src/client/api.ts
var MemoirApiError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "MemoirApiError";
  }
};
async function readEnvelope(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new MemoirApiError(`HTTP ${response.status}: invalid JSON response`);
  }
  if (typeof body !== "object" || body === null || body.ok !== true) {
    const record = body;
    const message = record && typeof record.error === "object" && record.error !== null && typeof record.error.message === "string" ? record.error.message : `HTTP ${response.status}`;
    throw new MemoirApiError(message);
  }
  return body.value;
}
function query(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== void 0 && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text === "" ? "" : "?" + text;
}
var MemoirApi = class {
  fetchImpl;
  /**
   * @param fetchImpl - injectable fetch (defaults to globalThis.fetch).
   */
  constructor(fetchImpl) {
    this.fetchImpl = fetchImpl ?? ((...args) => globalThis.fetch(...args));
  }
  /** Read one project's memory (empty project shape when unknown). */
  async project(path, options = {}) {
    const response = await this.fetchImpl("/api/dsh-memoir/project" + query({ path, ...options }));
    return readEnvelope(response);
  }
  /** Read the cross-project global index. */
  async global(options = {}) {
    const response = await this.fetchImpl("/api/dsh-memoir/global" + query({ ...options }));
    return readEnvelope(response);
  }
  /** Read runtime diagnostics (cache hit rates, snapshot/hot-memory stats). */
  async diagnostics(path) {
    const response = await this.fetchImpl("/api/dsh-memoir/diagnostics" + query({ path }));
    return readEnvelope(response);
  }
  /**
   * Ranked search over the host RetrievalEngine (v0.4.2) — the same ranking
   * memoir_read uses, so the GUI search and the agent recall never diverge.
   */
  async search(options) {
    const response = await this.fetchImpl("/api/dsh-memoir/search" + query({
      scope: options.scope,
      path: options.path,
      section: options.section,
      query: options.query,
      limit: options.limit === void 0 ? void 0 : String(options.limit)
    }));
    return readEnvelope(response);
  }
  /** Hot-memory preview for one workspace (the inspector). */
  async hotMemory(path) {
    const response = await this.fetchImpl("/api/dsh-memoir/hot-memory" + query({ path }));
    return readEnvelope(response);
  }
  /** Record one entry (host regenerates PROJECT_MEMORY.md). */
  async record(payload) {
    const response = await this.fetchImpl("/api/dsh-memoir/entries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return readEnvelope(response);
  }
  /** Delete one entry by id. */
  async remove(payload) {
    const response = await this.fetchImpl("/api/dsh-memoir/entries", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return readEnvelope(response);
  }
};

// src/client/cwd.ts
function readCwd(sessions) {
  const snapshot = sessions.list.getSnapshot();
  const id = snapshot.current;
  const cwd = id === void 0 ? void 0 : snapshot.byId[id]?.cwd;
  return typeof cwd === "string" && cwd !== "" ? cwd : "";
}
function createCwdTracker(sessions) {
  let current = readCwd(sessions);
  const listeners = /* @__PURE__ */ new Set();
  const tracker = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      const dispose = sessions.list.subscribe(() => {
        const next = readCwd(sessions);
        if (next === current) return;
        current = next;
        for (const l of [...listeners]) l();
      });
      return () => {
        listeners.delete(listener);
        dispose();
      };
    }
  };
  return tracker;
}

// src/client/i18n.ts
var dictionaries = {
  zh: {
    "entry.label": "\u8BB0\u5FC6",
    "entry.tooltip": "\u6253\u5F00\u8BB0\u5FC6\u9762\u677F\uFF08\u9879\u76EE\u8BB0\u5FC6 / \u5168\u5C40\u8BB0\u5FC6\uFF09",
    "panel.title": "\u8BB0\u5FC6 Memoir",
    "panel.close": "\u5173\u95ED",
    "panel.refresh": "\u5237\u65B0",
    "tab.project": "\u9879\u76EE\u8BB0\u5FC6",
    "tab.global": "\u5168\u5C40\u8BB0\u5FC6",
    "toolbar.search": "\u641C\u7D22\u6807\u9898\u4E0E\u6B63\u6587\u2026",
    "toolbar.add": "\u6DFB\u52A0\u8BB0\u5FC6",
    "toolbar.cancel": "\u53D6\u6D88",
    "form.section": "\u5206\u7C7B",
    "form.title": "\u6807\u9898\uFF08\u53EF\u9009\uFF09",
    "form.content": "\u5185\u5BB9",
    "form.submit": "\u8BB0\u5F55",
    "form.placeholder.title": "\u4E00\u53E5\u8BDD\u6807\u9898\uFF0C\u5982\u300C\u4FEE\u590D pet \u60AC\u505C\u95EA\u9000\u300D",
    "form.placeholder.content": "\u5177\u4F53\u505A\u4E86\u4EC0\u4E48\u3001\u7ED3\u8BBA\u3001\u6559\u8BAD\u6216\u4E0B\u4E00\u6B65\u600E\u4E48\u505A\u3002\u5EFA\u8BAE\u7CBE\u70BC\u3001\u53EF\u6267\u884C\u3002",
    "empty.project": "\u672C\u9879\u76EE\u6682\u65E0\u6301\u4E45\u8BB0\u5FC6",
    "empty.projectHint": "\u8BA9 agent \u7528 memoir_record \u6C89\u6DC0\u7ECF\u9A8C\uFF0C\u6216\u70B9\u300C\u6DFB\u52A0\u8BB0\u5FC6\u300D\u624B\u52A8\u8BB0\u5F55\u3002",
    "empty.workspace": "\u672A\u6253\u5F00\u9879\u76EE\u4F1A\u8BDD",
    "empty.workspaceHint": "\u6253\u5F00\u4E00\u4E2A\u9879\u76EE\u4F1A\u8BDD\u540E\uFF0C\u8FD9\u91CC\u663E\u793A\u8BE5\u9879\u76EE\u7684\u6301\u4E45\u8BB0\u5FC6\u3002",
    "empty.global": "\u5168\u5C40\u7D22\u5F15\u4E3A\u7A7A",
    "empty.globalHint": "\u5728\u4EFB\u4F55\u9879\u76EE\u91CC\u7528 memoir_record \u8BB0\u5F55\u540E\uFF0C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u4F9B\u8DE8\u9879\u76EE\u68C0\u7D22\u3002",
    "empty.search": "\u6CA1\u6709\u5339\u914D\u7684\u6761\u76EE",
    "load.failed": "\u52A0\u8F7D\u5931\u8D25",
    "record.failed": "\u8BB0\u5F55\u5931\u8D25",
    "delete.failed": "\u5220\u9664\u5931\u8D25",
    "delete.confirm": "\u5220\u9664\u8FD9\u6761\u8BB0\u5FC6\uFF1F",
    "updated": "\u66F4\u65B0\u4E8E",
    "entries": "\u6761",
    "session": "\u4F1A\u8BDD",
    "sections.work": "\u5DE5\u4F5C\u8BB0\u5F55",
    "sections.lessons": "\u7ECF\u9A8C\u6559\u8BAD",
    "sections.actions": "\u884C\u52A8\u6307\u5357",
    "sections.note": "\u5907\u6CE8",
    "diag.title": "Memory Diagnostics",
    "diag.revision": "Store revision",
    "diag.snapshot": "Session snapshots",
    "diag.cache": "Store cache",
    "diag.render": "Render cache",
    "diag.hot": "Hot memory",
    "diag.retrieval": "Retrieval \u7D22\u5F15",
    "diag.qcache": "Query cache",
    "diag.lastQuery": "\u6700\u8FD1\u67E5\u8BE2",
    "diag.snapshotInfo": "\u4F1A\u8BDD\u5FEB\u7167",
    "inspector.title": "Hot Memory \u9884\u89C8",
    "inspector.empty": "\u672C\u5DE5\u4F5C\u533A\u6682\u65E0 Hot Memory",
    "search.ranked": "\u6309\u76F8\u5173\u6027\u6392\u5E8F"
  },
  en: {
    "entry.label": "Memory",
    "entry.tooltip": "Open the memory panel (project / global)",
    "panel.title": "Memory Memoir",
    "panel.close": "Close",
    "panel.refresh": "Refresh",
    "tab.project": "Project",
    "tab.global": "Global",
    "toolbar.search": "Search titles and content\u2026",
    "toolbar.add": "Add entry",
    "toolbar.cancel": "Cancel",
    "form.section": "Section",
    "form.title": "Title (optional)",
    "form.content": "Content",
    "form.submit": "Record",
    "form.placeholder.title": 'A one-line title, e.g. "Fix pet hover crash"',
    "form.placeholder.content": "What was done, the conclusion, the lesson, or the next step. Concise and actionable.",
    "empty.project": "No persistent memory in this project yet",
    "empty.projectHint": "Ask the agent to distill via memoir_record, or add an entry manually.",
    "empty.workspace": "No project session open",
    "empty.workspaceHint": "Open a project session to see its persistent memory here.",
    "empty.global": "The global index is empty",
    "empty.globalHint": "Entries recorded via memoir_record in any project appear here for cross-project search.",
    "empty.search": "No matching entries",
    "load.failed": "Failed to load",
    "record.failed": "Failed to record",
    "delete.failed": "Failed to delete",
    "delete.confirm": "Delete this entry?",
    "updated": "Updated",
    "entries": "entries",
    "session": "session",
    "sections.work": "Work Log",
    "sections.lessons": "Lessons Learned",
    "sections.actions": "Action Guide",
    "sections.note": "Notes",
    "diag.title": "Memory Diagnostics",
    "diag.revision": "Store revision",
    "diag.snapshot": "Session snapshots",
    "diag.cache": "Store cache",
    "diag.render": "Render cache",
    "diag.hot": "Hot memory",
    "diag.retrieval": "Retrieval index",
    "diag.qcache": "Query cache",
    "diag.lastQuery": "Last query",
    "diag.snapshotInfo": "Session snapshot",
    "inspector.title": "Hot Memory Inspector",
    "inspector.empty": "No hot memory in this workspace yet",
    "search.ranked": "Ranked by relevance"
  }
};
var SECTION_KEYS = ["work", "lessons", "actions", "note"];
function detectLanguage(documentLike) {
  const lang = documentLike?.documentElement?.lang;
  return typeof lang === "string" && lang.startsWith("zh") ? "zh" : "en";
}
function translate(lang, key) {
  const dict = dictionaries[lang] ?? dictionaries.en;
  return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : dictionaries.en[key] ?? key;
}
function makeT(documentLike) {
  return (key) => translate(detectLanguage(documentLike), key);
}

// src/client/styles.ts
var PANEL_CSS = `
[data-dsh-memoir-view] {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 20;
  background: var(--bg-panel, #ffffff);
  color: var(--text-primary, #1f2328);
  font-size: 13px;
}
html[data-dsh-memoir-active] [data-dsh-memoir-view] {
  display: flex;
  flex-direction: column;
}
html[data-dsh-memoir-active] [data-pane="conversation"] > *:not([data-dsh-memoir-view]) {
  display: none;
}
/* Current shell renders the center column as [hash]_centerCol (CSS modules). */
html[data-dsh-memoir-active] [class*="centerCol"] > *:not([data-dsh-memoir-view]) {
  display: none;
}

.memoir-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.memoir-header { display: flex; align-items: center; gap: 8px; padding: 12px 14px 8px; }
.memoir-title { font-size: 15px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memoir-subtitle { font-size: 11px; opacity: .65; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memoir-iconbtn {
  border: 1px solid transparent; background: transparent; color: inherit;
  border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 12px;
  display: inline-flex; align-items: center; gap: 4px;
}
.memoir-iconbtn:hover { background: var(--bg-hover, rgba(0,0,0,.06)); }

.memoir-tabs { display: flex; gap: 4px; padding: 0 14px; border-bottom: 1px solid var(--border, rgba(0,0,0,.1)); }
.memoir-tab {
  border: none; background: transparent; color: inherit; padding: 7px 12px;
  cursor: pointer; font-size: 13px; border-bottom: 2px solid transparent; opacity: .75;
}
.memoir-tab:hover { opacity: 1; }
.memoir-tab[data-active="true"] { opacity: 1; border-bottom-color: var(--accent, #3b82f6); font-weight: 600; }

.memoir-toolbar { display: flex; gap: 8px; padding: 8px 14px; }
.memoir-search {
  flex: 1; border: 1px solid var(--border, rgba(0,0,0,.15)); background: transparent;
  color: inherit; border-radius: 6px; padding: 6px 10px; font-size: 13px; outline: none;
}
.memoir-search:focus { border-color: var(--accent, #3b82f6); }
.memoir-primary {
  border: 1px solid transparent; background: var(--accent, #3b82f6); color: #fff;
  border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 13px;
}
.memoir-primary:hover { filter: brightness(1.05); }

.memoir-body { flex: 1; overflow-y: auto; padding: 4px 14px 16px; }
.memoir-section-title {
  font-size: 12px; font-weight: 600; opacity: .8; margin: 14px 0 6px;
  display: flex; align-items: center; gap: 6px;
}
.memoir-count { font-weight: 400; opacity: .6; }
.memoir-entry {
  border: 1px solid var(--border, rgba(0,0,0,.08)); border-radius: 8px;
  padding: 8px 10px; margin-bottom: 8px; background: var(--bg-card, rgba(0,0,0,.02));
}
.memoir-entry-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; opacity: .7; margin-bottom: 3px; }
.memoir-chip {
  border-radius: 999px; padding: 0 7px; font-size: 11px; line-height: 18px;
  background: var(--chip-bg, rgba(59,130,246,.12)); color: var(--chip-fg, #2563eb);
}
.memoir-entry-title { font-weight: 600; margin-bottom: 2px; }
.memoir-entry-content { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
.memoir-delete {
  float: right; border: none; background: transparent; color: inherit; opacity: .45;
  cursor: pointer; border-radius: 4px; padding: 2px 6px; font-size: 12px;
}
.memoir-delete:hover { opacity: 1; background: var(--danger-bg, rgba(220,38,38,.12)); color: var(--danger, #dc2626); }

.memoir-project-card { border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 10px; padding: 10px 12px; margin-bottom: 12px; }
.memoir-project-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
.memoir-project-title { font-weight: 600; font-size: 14px; }
.memoir-project-path { font-size: 11px; opacity: .6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.memoir-project-meta { font-size: 11px; opacity: .6; margin-bottom: 6px; }

.memoir-empty { text-align: center; padding: 48px 20px; opacity: .7; }
.memoir-empty-title { font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.memoir-empty-hint { font-size: 12px; }
.memoir-error { color: var(--danger, #dc2626); padding: 8px 14px; font-size: 12px; }

.memoir-form { border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 10px; padding: 12px; margin: 4px 14px 14px; }
.memoir-form-row { display: flex; gap: 8px; margin-bottom: 8px; }
.memoir-field { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.memoir-field label { font-size: 11px; opacity: .7; }
.memoir-field input, .memoir-field select, .memoir-field textarea {
  border: 1px solid var(--border, rgba(0,0,0,.15)); background: transparent; color: inherit;
  border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; outline: none;
}
.memoir-field textarea { min-height: 72px; resize: vertical; }
.memoir-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Sidebar entry row (plain DOM, matches the shell's nav rows). */
.memoir-entry-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 7px 10px; border-radius: 6px; font-size: 13px; text-align: left;
}
.memoir-entry-row:hover { background: var(--bg-hover, rgba(0,0,0,.06)); }
.memoir-entry-row[data-active="true"] { background: var(--bg-hover, rgba(0,0,0,.08)); }
.memoir-entry-icon { display: inline-flex; }

/* v0.4.2 ranked search */
.memoir-ranked-note { font-size: 11px; opacity: .65; margin: 4px 0 8px; }
.memoir-score {
  float: right; border-radius: 999px; padding: 0 7px; font-size: 10px; line-height: 16px;
  background: var(--chip-bg, rgba(59,130,246,.12)); color: var(--chip-fg, #2563eb); opacity: .8;
}

/* v0.4.2 Hot Memory Inspector */
.memoir-inspector { margin: 0 14px; border-top: 1px solid var(--border, rgba(0,0,0,.1)); padding-top: 8px; }
.memoir-inspector-body {
  font-size: 11px; opacity: .85; margin: 6px 0 0; padding: 8px 10px;
  border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 8px;
  background: var(--bg-card, rgba(0,0,0,.02)); white-space: pre-wrap; word-break: break-word;
  font-family: inherit; max-height: 220px; overflow-y: auto;
}

body[data-ds-dark-theme] [data-dsh-memoir-view] {
  background: var(--bg-panel, #16181d);
  color: var(--text-primary, #e6e6e6);
}

/* Memory Diagnostics (observability strip, v0.4). */
.memoir-diagnostics { margin: 0 14px 14px; border-top: 1px solid var(--border, rgba(0,0,0,.1)); padding-top: 8px; }
.memoir-diagnostics-toggle {
  border: none; background: transparent; color: inherit; cursor: pointer;
  font-size: 12px; opacity: .75; padding: 2px 0;
}
.memoir-diagnostics-toggle:hover { opacity: 1; }
.memoir-diagnostics-body { font-size: 11px; opacity: .8; display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
`;

// src/client/sidebar-entry.ts
var ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5c-1.6-1-3.6-1-5.2-.2-.5.3-.8.9-.8 1.4v8.6c0 .5.5.9 1 .7C4.6 13.4 6.4 13.5 8 14.5c1.6-1 3.4-1.1 5-.5.5.2 1-.2 1-.7V4.7c0-.5-.3-1.1-.8-1.4-1.6-.8-3.6-.8-5.2.2z"/><path d="M8 3.5v11"/></svg>';
var FAMILY_SELECTOR = "[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-memoir-entry]";
function sidebarRoot() {
  const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
  if (column === null) return void 0;
  const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
  return logoOwner ?? column.firstElementChild;
}
function newSessionButton(root) {
  const nested = root.querySelector('button[class*="newSession"]');
  if (nested !== null) return nested;
  for (const child of root.children) {
    if (child.tagName === "BUTTON") return child;
  }
  return void 0;
}
function createEntry(controller, t) {
  const entry = document.createElement("button");
  entry.type = "button";
  entry.dataset.dshMemoirEntry = "";
  entry.className = "memoir-entry-row";
  entry.setAttribute("aria-label", t("entry.label"));
  entry.setAttribute("title", t("entry.tooltip"));
  entry.innerHTML = '<span class="memoir-entry-icon">' + ICON + "</span><span>" + t("entry.label") + "</span>";
  entry.addEventListener("click", () => {
    controller.toggle();
  });
  return entry;
}
function placeEntry(root, entry) {
  const button = newSessionButton(root);
  if (button === void 0) return false;
  if (entry.parentElement !== root) {
    const row = button.closest('[class*="logoRow"]');
    const base = row !== null && row.parentElement === root ? row : button;
    const family = Array.from(root.children).filter(
      (el) => el instanceof HTMLElement && el.matches(FAMILY_SELECTOR)
    );
    const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
    root.insertBefore(entry, anchor);
  }
  return true;
}
function mountSidebarEntry(controller, t) {
  const entry = createEntry(controller, t);
  let root;
  let placed = false;
  const tryPlace = () => {
    if (placed) return;
    if (root !== void 0 && !root.isConnected) {
      rootObserver.disconnect();
      root = void 0;
    }
    root ??= sidebarRoot();
    if (root === void 0) return;
    placed = placeEntry(root, entry);
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true });
      waitObserver.disconnect();
    }
  };
  const waitObserver = new MutationObserver(() => {
    tryPlace();
  });
  waitObserver.observe(document.body, { childList: true, subtree: true });
  const rootObserver = new MutationObserver(() => {
    if (root === void 0 || !root.isConnected) {
      placed = false;
      tryPlace();
      return;
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry);
    }
  });
  const unsubscribe = controller.subscribe(() => {
    entry.dataset.active = controller.getSnapshot().panelOpen ? "true" : void 0;
  });
  entry.dataset.active = controller.getSnapshot().panelOpen ? "true" : void 0;
  tryPlace();
  return () => {
    waitObserver.disconnect();
    rootObserver.disconnect();
    unsubscribe();
    entry.remove();
  };
}

// src/client/mount.tsx
var import_client = require("react-dom/client");

// src/client/panel.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
function EntryMeta({ entry, t }) {
  const when = new Date(entry.time);
  const pad = (n) => String(n).padStart(2, "0");
  const timeText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-entry-meta", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: timeText }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-chip", children: t("sections." + entry.section) }),
    entry.sessionId !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: `${t("session")}: ${entry.sessionId}`, children: entry.sessionId.slice(0, 12) }) : null
  ] });
}
function EntryCard({ entry, t, onDelete, score }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-entry", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-delete", title: t("delete.confirm"), onClick: () => onDelete(entry), children: "\xD7" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryMeta, { entry, t }),
    score !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-score", title: t("search.ranked"), children: score.toFixed(3) }) : null,
    entry.title !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-entry-title", children: entry.title }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-entry-content", children: entry.content })
  ] });
}
function SectionedEntries({ entries, t, onDelete }) {
  const groups = (0, import_react.useMemo)(
    () => SECTION_KEYS.map((key) => ({ key, entries: entries.filter((e) => e.section === key) })).filter((g) => g.entries.length > 0),
    [entries]
  );
  if (groups.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.search") }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-section-title", children: [
      t("sections." + group.key),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "memoir-count", children: [
        "(",
        group.entries.length,
        ")"
      ] })
    ] }),
    group.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry, t, onDelete }, entry.id))
  ] }, group.key)) });
}
function RankedResults({ results, pending, grouped, t, onDelete }) {
  if (pending) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty", children: "\u2026" });
  if (results.length === 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.search") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("search.ranked") })
    ] });
  }
  if (!grouped) {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_react.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-ranked-note", children: t("search.ranked") }),
      results.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry: r.entry, score: r.score, t, onDelete: (entry) => onDelete(entry, r.projectPath) }, r.entry.id))
    ] });
  }
  const groups = /* @__PURE__ */ new Map();
  for (const result of results) {
    const bucket = groups.get(result.projectPath) ?? [];
    bucket.push(result);
    groups.set(result.projectPath, bucket);
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_react.Fragment, { children: [...groups.entries()].map(([path, bucket]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-project-card", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-project-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-project-title", children: path.split("/").filter(Boolean).pop() || path }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-project-path", children: path })
    ] }),
    bucket.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry: r.entry, score: r.score, t, onDelete: (entry) => onDelete(entry, path) }, r.entry.id))
  ] }, path)) });
}
function AddForm({ t, onSubmit, onCancel }) {
  const [section, setSection] = (0, import_react.useState)("lessons");
  const [title, setTitle] = (0, import_react.useState)("");
  const [content, setContent] = (0, import_react.useState)("");
  const submit = () => {
    if (content.trim() === "") return;
    onSubmit({ section, title: title.trim() === "" ? void 0 : title.trim(), content: content.trim() });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.section") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: section, onChange: (e) => setSection(e.target.value), children: SECTION_KEYS.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: t("sections." + key) }, key)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: title, placeholder: t("form.placeholder.title"), onChange: (e) => setTitle(e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.content") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { value: content, placeholder: t("form.placeholder.content"), onChange: (e) => setContent(e.target.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: onCancel, children: t("toolbar.cancel") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", onClick: submit, children: t("form.submit") })
    ] })
  ] });
}
function MemoirPanel({ controller, api, cwdTracker, t }) {
  const cwd = (0, import_react.useSyncExternalStore)(cwdTracker.subscribe, cwdTracker.getSnapshot);
  const [tab, setTab] = (0, import_react.useState)("project");
  const [query2, setQuery] = (0, import_react.useState)("");
  const [formOpen, setFormOpen] = (0, import_react.useState)(false);
  const [refreshKey, setRefreshKey] = (0, import_react.useState)(0);
  const [project, setProject] = (0, import_react.useState)(null);
  const [projects, setProjects] = (0, import_react.useState)([]);
  const [loading, setLoading] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [diag, setDiag] = (0, import_react.useState)(null);
  const [diagOpen, setDiagOpen] = (0, import_react.useState)(false);
  const [searchResults, setSearchResults] = (0, import_react.useState)(null);
  const [hotMemory, setHotMemory] = (0, import_react.useState)(null);
  const [inspectorOpen, setInspectorOpen] = (0, import_react.useState)(false);
  const q = query2.trim().toLowerCase();
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    setError(null);
    if (tab === "project") {
      if (cwd === "") {
        setProject(null);
        return void 0;
      }
      setLoading(true);
      api.project(cwd).then((value) => {
        if (!cancelled) setProject(value.project);
      }).catch((e) => {
        if (!cancelled) setError(e.message);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    } else {
      setLoading(true);
      api.global().then((value) => {
        if (!cancelled) setProjects(value.projects);
      }).catch((e) => {
        if (!cancelled) setError(e.message);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }
    api.diagnostics(cwd === "" ? void 0 : cwd).then((value) => {
      if (!cancelled) setDiag(value);
    }).catch(() => {
      if (!cancelled) setDiag(null);
    });
    if (cwd === "") {
      setHotMemory(null);
    } else {
      api.hotMemory(cwd).then((value) => {
        if (!cancelled) setHotMemory(value.hotMemory);
      }).catch(() => {
        if (!cancelled) setHotMemory(null);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [tab, cwd, refreshKey]);
  (0, import_react.useEffect)(() => {
    if (q === "") {
      setSearchResults(null);
      return void 0;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const scope = tab === "project" ? "project" : "global";
      api.search({ scope, path: tab === "project" && cwd !== "" ? cwd : void 0, query: q }).then((value) => {
        if (!cancelled) setSearchResults(value.results);
      }).catch((e) => {
        if (!cancelled) {
          setSearchResults([]);
          setError(e.message);
        }
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, tab, cwd, refreshKey]);
  const filterEntries = (entries) => q === "" ? entries : entries.filter((e) => `${e.title ?? ""} ${e.content}`.toLowerCase().includes(q));
  const reload = () => setRefreshKey((k) => k + 1);
  const onDelete = (entry, entryPath) => {
    if (!window.confirm(t("delete.confirm"))) return;
    setBusy(true);
    api.remove({ path: entryPath, id: entry.id }).then(() => reload()).catch((e) => setError(`${t("delete.failed")}: ${e.message}`)).finally(() => setBusy(false));
  };
  const onRecord = (payload) => {
    setBusy(true);
    api.record({ path: cwd, ...payload }).then(() => {
      setFormOpen(false);
      reload();
    }).catch((e) => setError(`${t("record.failed")}: ${e.message}`)).finally(() => setBusy(false));
  };
  const projectEntries = project === null ? [] : filterEntries(project.entries);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-panel", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-title", children: [
        t("panel.title"),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-subtitle", children: tab === "project" ? cwd === "" ? t("empty.workspace") : cwd : t("tab.global") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", title: t("panel.refresh"), onClick: reload, children: "\u27F3" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", title: t("panel.close"), onClick: () => controller.close(), children: "\xD7" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-tabs", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-tab", "data-active": tab === "project" ? "true" : void 0, onClick: () => setTab("project"), children: t("tab.project") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-tab", "data-active": tab === "global" ? "true" : void 0, onClick: () => setTab("global"), children: t("tab.global") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: "memoir-search", placeholder: t("toolbar.search"), value: query2, onChange: (e) => setQuery(e.target.value) }),
      tab === "project" && cwd !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", onClick: () => setFormOpen((v) => !v), children: formOpen ? t("toolbar.cancel") : t("toolbar.add") }) : null
    ] }),
    formOpen && tab === "project" && cwd !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddForm, { t, onSubmit: onRecord, onCancel: () => setFormOpen(false) }) : null,
    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-error", children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-body", children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty", children: "\u2026" }) : q !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      RankedResults,
      {
        results: searchResults ?? [],
        pending: searchResults === null,
        grouped: tab === "global",
        t,
        onDelete: (entry, path) => onDelete(entry, path)
      }
    ) : tab === "project" ? cwd === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.workspace") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.workspaceHint") })
    ] }) : projectEntries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.project") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.projectHint") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionedEntries, { entries: projectEntries, t, onDelete: (entry) => onDelete(entry, project?.path ?? cwd) }) : projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.global") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.globalHint") })
    ] }) : projects.map((p) => {
      const entries = filterEntries(p.entries);
      if (entries.length === 0) return null;
      const when = new Date(p.updatedAt);
      return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-project-card", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-project-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-project-title", children: p.title }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-project-path", children: p.path })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-project-meta", children: `${t("updated")} ${when.toISOString().slice(0, 16).replace("T", " ")} \xB7 ${entries.length} ${t("entries")}` }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionedEntries, { entries, t, onDelete: (entry) => onDelete(entry, p.path) })
      ] }, p.key);
    }) }),
    busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty", children: "\u2026" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-inspector", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "memoir-diagnostics-toggle", onClick: () => setInspectorOpen((v) => !v), children: [
        t("inspector.title"),
        " ",
        inspectorOpen ? "\u25BE" : "\u25B8"
      ] }),
      inspectorOpen ? hotMemory === null || hotMemory.text === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-inspector-body", children: t("inspector.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "memoir-inspector-body", children: hotMemory.text }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-diagnostics", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "memoir-diagnostics-toggle", onClick: () => setDiagOpen((v) => !v), children: [
        t("diag.title"),
        " ",
        diagOpen ? "\u25BE" : "\u25B8"
      ] }),
      diagOpen && diag !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-diagnostics-body", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.revision"),
          ": ",
          diag.storeRevision,
          " \xB7 ",
          t("diag.snapshot"),
          ": ",
          diag.snapshotCount,
          "/",
          diag.snapshotMax
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.cache"),
          ": ",
          diag.cache.hits,
          "/",
          diag.cache.loads,
          " \u547D\u4E2D (",
          Math.round(diag.cache.hitRate * 100),
          "%) \xB7 ",
          t("diag.render"),
          ": ",
          Math.round(diag.cache.renderHitRate * 100),
          "%"
        ] }),
        diag.hotMemory !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.hot"),
          ": ",
          diag.hotMemory.selected,
          "/",
          diag.hotMemory.total,
          " \u6761 \xB7 ~",
          diag.hotMemory.estimatedTokens,
          " tokens\uFF08\u9884\u7B97 ",
          diag.config.hotMemoryTokens,
          "/",
          diag.config.hotMemoryMaxTokens,
          "\uFF09"
        ] }) : null,
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.retrieval"),
          ": ",
          diag.retrieval.index === null ? "\u2014" : `${diag.retrieval.index.docs} docs \xB7 ${diag.retrieval.index.terms} terms \xB7 epoch ${diag.retrieval.index.epoch}`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.qcache"),
          ": ",
          diag.retrieval.cache.hits,
          " hits / ",
          diag.retrieval.cache.misses,
          " misses (",
          Math.round(diag.retrieval.cache.hitRate * 100),
          "%) \xB7 ",
          diag.retrieval.cache.size,
          "/",
          diag.retrieval.cache.capacity,
          " \xB7 ",
          diag.retrieval.cache.evictions,
          " evicted"
        ] }),
        diag.retrieval.lastQuery !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.lastQuery"),
          ": ",
          diag.retrieval.lastQuery.latencyMs.toFixed(1),
          " ms \xB7 ",
          diag.retrieval.lastQuery.returned,
          "/",
          diag.retrieval.lastQuery.candidates,
          " returned"
        ] }) : null,
        diag.snapshot !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          t("diag.snapshotInfo"),
          ": ",
          diag.snapshot.hash,
          " \xB7 rev ",
          diag.snapshot.storeRevision
        ] }) : null
      ] }) : null
    ] })
  ] });
}

// src/client/mount.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var CONVERSATION_COLUMN_SELECTOR = '[data-pane="conversation"], [class*="centerCol"]';
var ACTIVE_ATTR = "data-dsh-memoir-active";
var SIBLING_ATTRS = ["data-dsh-ssh-active", "data-dsh-taskboard-active"];
var ACTIVATE_EVENT = "dsh-panel-activate";
var PANEL_NAME = "memoir";
function conversationColumn() {
  return document.querySelector(CONVERSATION_COLUMN_SELECTOR) ?? void 0;
}
function mountPanel(controller, api, cwdTracker, t) {
  let root;
  let container;
  const ensure = () => {
    if (container !== void 0) {
      if (container.isConnected) return;
      root?.unmount();
      root = void 0;
      container.remove();
      container = void 0;
    }
    const column = conversationColumn();
    if (column === void 0) return;
    container = document.createElement("div");
    container.dataset.dshMemoirView = "";
    column.appendChild(container);
    root = (0, import_client.createRoot)(container);
    root.render(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)(MemoirPanel, { controller, api, cwdTracker, t }));
  };
  const waitObserver = new MutationObserver(() => {
    ensure();
  });
  waitObserver.observe(document.body, { childList: true, subtree: true });
  const applyActive = () => {
    if (controller.getSnapshot().panelOpen) {
      for (const attr of SIBLING_ATTRS) document.documentElement.removeAttribute(attr);
      document.documentElement.setAttribute(ACTIVE_ATTR, "");
      document.dispatchEvent(new CustomEvent(ACTIVATE_EVENT, { detail: PANEL_NAME }));
    } else {
      document.documentElement.removeAttribute(ACTIVE_ATTR);
    }
  };
  const onOtherActivate = (event) => {
    const detail = event.detail;
    if ((detail === "ssh" || detail === "taskboard") && controller.getSnapshot().panelOpen) {
      controller.close();
    }
  };
  const SIDEBAR_ROW_SELECTOR = '[class*="sessionRow"], [class*="projectRow"], [class*="searchResultRow"], [class*="searchResultWorkspace"], [class*="newSession"]';
  const onClickSidebarRow = (event) => {
    if (!controller.getSnapshot().panelOpen) return;
    const target = event.target;
    if (target === null || typeof target.closest !== "function") return;
    if (target.closest(SIDEBAR_ROW_SELECTOR) !== null) controller.close();
  };
  document.addEventListener("click", onClickSidebarRow, true);
  document.addEventListener(ACTIVATE_EVENT, onOtherActivate);
  const unsubscribe = controller.subscribe(applyActive);
  applyActive();
  ensure();
  return () => {
    document.removeEventListener("click", onClickSidebarRow, true);
    document.removeEventListener(ACTIVATE_EVENT, onOtherActivate);
    waitObserver.disconnect();
    unsubscribe();
    document.documentElement.removeAttribute(ACTIVE_ATTR);
    root?.unmount();
    root = void 0;
    container?.remove();
    container = void 0;
  };
}

// src/client/index.tsx
var inject = ["sessions"];
function injectStyles() {
  if (document.querySelector('style[data-plugin="dsh-memoir"]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-memoir";
  tag.textContent = PANEL_CSS;
  document.head.appendChild(tag);
}
function apply(ctx) {
  const t = makeT(document);
  const disposers = [];
  try {
    const controller = new PanelController();
    const api = new MemoirApi();
    const cwdTracker = createCwdTracker(ctx.sessions);
    injectStyles();
    disposers.push(mountSidebarEntry(controller, t));
    disposers.push(mountPanel(controller, api, cwdTracker, t));
  } catch (error) {
    console.warn("[dsh-memoir] mount failed:", error);
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose();
  }, "dsh-memoir: ui mounts");
}
return module.exports;
} });
//# sourceMappingURL=client.js.map
