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
var import_react2 = require("react");

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
  /** Read all live settings and whether they come from Web overrides. */
  async settings() {
    const response = await this.fetchImpl("/api/dsh-memoir/settings");
    return readEnvelope(response);
  }
  /** Persist and immediately apply the complete runtime policy. */
  async updateSettings(settings) {
    const response = await this.fetchImpl("/api/dsh-memoir/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings)
    });
    return readEnvelope(response);
  }
  /** Remove the Web override and restore the profile defaults captured at boot. */
  async resetSettings() {
    const response = await this.fetchImpl("/api/dsh-memoir/settings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
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
      limit: options.limit === void 0 ? void 0 : String(options.limit),
      status: options.status
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
  /** Update entry content or lifecycle metadata without deleting. */
  async update(payload) {
    const response = await this.fetchImpl("/api/dsh-memoir/entries", {
      method: "PATCH",
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
    "form.importance": "\u91CD\u8981\u5EA6",
    "form.importanceHint": "1 \u6700\u4F4E\uFF0C5 \u6700\u9AD8\uFF1B\u4F1A\u5F71\u54CD Hot Memory \u6392\u5E8F\u3002",
    "form.tags": "\u6807\u7B7E",
    "form.supersedes": "\u66FF\u4EE3\u7684\u8BB0\u5FC6 ID",
    "form.pinned": "\u7F6E\u9876\u8FD9\u6761\u8BB0\u5FC6",
    "form.pinnedHint": "\u7F6E\u9876\u6761\u76EE\u5728 Hot Memory \u9009\u62E9\u4E2D\u4F18\u5148\u3002",
    "form.submit": "\u8BB0\u5F55",
    "form.placeholder.title": "\u4E00\u53E5\u8BDD\u6807\u9898\uFF0C\u5982\u300C\u4FEE\u590D pet \u60AC\u505C\u95EA\u9000\u300D",
    "form.placeholder.content": "\u5177\u4F53\u505A\u4E86\u4EC0\u4E48\u3001\u7ED3\u8BBA\u3001\u6559\u8BAD\u6216\u4E0B\u4E00\u6B65\u600E\u4E48\u505A\u3002\u5EFA\u8BAE\u7CBE\u70BC\u3001\u53EF\u6267\u884C\u3002",
    "form.placeholder.tags": "\u9017\u53F7\u5206\u9694\uFF0C\u4F8B\u5982 release, windows",
    "form.placeholder.supersedes": "\u9017\u53F7\u5206\u9694\u7684\u65E7\u8BB0\u5FC6 ID\uFF08\u53EF\u9009\uFF09",
    "empty.project": "\u672C\u9879\u76EE\u6682\u65E0\u6301\u4E45\u8BB0\u5FC6",
    "empty.projectHint": "\u8BA9 agent \u7528 memoir_record \u6C89\u6DC0\u7ECF\u9A8C\uFF0C\u6216\u70B9\u300C\u6DFB\u52A0\u8BB0\u5FC6\u300D\u624B\u52A8\u8BB0\u5F55\u3002",
    "empty.workspace": "\u672A\u6253\u5F00\u9879\u76EE\u4F1A\u8BDD",
    "empty.workspaceHint": "\u6253\u5F00\u4E00\u4E2A\u9879\u76EE\u4F1A\u8BDD\u540E\uFF0C\u8FD9\u91CC\u663E\u793A\u8BE5\u9879\u76EE\u7684\u6301\u4E45\u8BB0\u5FC6\u3002",
    "empty.global": "\u5168\u5C40\u7D22\u5F15\u4E3A\u7A7A",
    "empty.globalHint": "\u5728\u4EFB\u4F55\u9879\u76EE\u91CC\u7528 memoir_record \u8BB0\u5F55\u540E\uFF0C\u4F1A\u51FA\u73B0\u5728\u8FD9\u91CC\u4F9B\u8DE8\u9879\u76EE\u68C0\u7D22\u3002",
    "empty.search": "\u6CA1\u6709\u5339\u914D\u7684\u6761\u76EE",
    "load.failed": "\u52A0\u8F7D\u5931\u8D25",
    "record.failed": "\u8BB0\u5F55\u5931\u8D25",
    "update.failed": "\u66F4\u65B0\u5931\u8D25",
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
    "search.ranked": "\u6309\u76F8\u5173\u6027\u6392\u5E8F",
    "filter.status": "\u72B6\u6001",
    "filter.section": "\u5206\u7C7B",
    "filter.all": "\u5168\u90E8",
    "status.active": "\u6D3B\u8DC3",
    "status.superseded": "\u5DF2\u88AB\u66FF\u4EE3",
    "status.archived": "\u5DF2\u5F52\u6863",
    "lifecycle.pin": "\u7F6E\u9876",
    "lifecycle.unpin": "\u53D6\u6D88\u7F6E\u9876",
    "lifecycle.edit": "\u7F16\u8F91",
    "lifecycle.save": "\u4FDD\u5B58\u66F4\u65B0",
    "lifecycle.supersede": "\u6807\u8BB0\u5DF2\u66FF\u4EE3",
    "lifecycle.unsupersede": "\u6062\u590D\u6D3B\u8DC3",
    "lifecycle.archive": "\u5F52\u6863",
    "lifecycle.restore": "\u6062\u590D",
    "settings.title": "\u8BB0\u5FC6\u8BBE\u7F6E",
    "settings.description": "\u5B8C\u6574\u8FD0\u884C\u65F6\u8BBE\u7F6E\uFF1B\u4FDD\u5B58\u540E\u7ACB\u5373\u5E94\u7528\uFF0C\u5E76\u6301\u4E45\u5316\u5230\u672C\u673A DSH \u7528\u6237\u76EE\u5F55\u3002",
    "settings.announce": "\u5411 Agent \u6CE8\u5165\u8BB0\u5FC6",
    "settings.announceHint": "\u5173\u95ED\u540E\u4E0D\u518D\u5411\u7CFB\u7EDF\u63D0\u793A\u6CE8\u5165\u63D2\u4EF6\u8BF4\u660E\u4E0E Hot Memory\uFF0C\u4F46\u5DE5\u5177\u548C GUI \u4FDD\u6301\u53EF\u7528\u3002",
    "settings.group.distill": "\u81EA\u52A8\u84B8\u998F",
    "settings.group.memory": "Hot Memory\u3001\u53EC\u56DE\u4E0E\u7F13\u5B58",
    "settings.enabled": "\u542F\u7528\u81EA\u52A8\u84B8\u998F",
    "settings.enabledHint": "\u5728\u9876\u5C42 agent \u7684\u6709\u6548\u5DE5\u4F5C\u56DE\u5408\u7ED3\u675F\u65F6\u63D0\u9192\u5F52\u7EB3\u8BB0\u5FC6\u3002",
    "settings.autoDistillEvery": "\u5DE5\u4F5C\u56DE\u5408\u95F4\u9694",
    "settings.autoDistillEveryHint": "\u6BCF\u7D2F\u8BA1 N \u4E2A worked turn \u6700\u591A\u63D0\u9192\u4E00\u6B21\uFF08\u6700\u5C0F 1\uFF09\u3002",
    "settings.autoDistillCooldownMin": "\u51B7\u5374\u65F6\u95F4\uFF08\u5206\u949F\uFF09",
    "settings.autoDistillCooldownMinHint": "\u4E24\u6B21\u6210\u529F\u63D0\u9192\u81F3\u5C11\u95F4\u9694 M \u5206\u949F\uFF08\u6700\u5C0F 0\uFF09\u3002",
    "settings.autoDistillMinTools": "\u6700\u4F4E\u5DE5\u5177\u8C03\u7528\u6570",
    "settings.autoDistillMinToolsHint": "\u89E6\u53D1\u56DE\u5408\u81F3\u5C11\u5305\u542B K \u6B21\u5DE5\u5177\u8C03\u7528\uFF08\u6700\u5C0F 1\uFF09\u3002",
    "settings.hotMemoryTokens": "Hot Memory \u76EE\u6807 tokens",
    "settings.hotMemoryTokensHint": "\u5E38\u89C4\u9009\u62E9\u9884\u7B97\uFF0C\u5FC5\u987B\u4E0D\u5927\u4E8E\u786C\u4E0A\u9650\u3002",
    "settings.hotMemoryMaxTokens": "Hot Memory \u786C\u4E0A\u9650",
    "settings.hotMemoryMaxTokensHint": "\u4EFB\u4F55\u65B0\u4F1A\u8BDD\u5FEB\u7167\u90FD\u4E0D\u4F1A\u8D85\u8FC7\u6B64\u9884\u7B97\u3002",
    "settings.readDefaultLimit": "\u9ED8\u8BA4\u53EC\u56DE\u6761\u6570",
    "settings.readDefaultLimitHint": "memoir_read \u672A\u4F20 limit \u65F6\u4F7F\u7528\u3002",
    "settings.readMaxLimit": "\u6700\u5927\u53EC\u56DE\u6761\u6570",
    "settings.readMaxLimitHint": "memoir_read \u7684\u5B9E\u65F6\u4E0A\u9650\uFF0C\u4E0D\u5C0F\u4E8E\u9ED8\u8BA4\u503C\u3002",
    "settings.sessionSnapshotMax": "\u4F1A\u8BDD\u5FEB\u7167\u5BB9\u91CF",
    "settings.sessionSnapshotMaxHint": "\u51BB\u7ED3\u63D0\u793A\u524D\u7F00\u7684 LRU \u5BB9\u91CF\uFF1B\u7F29\u5C0F\u65F6\u7ACB\u5373\u6DD8\u6C70\u6700\u65E7\u9879\u3002",
    "settings.queryCacheSize": "\u67E5\u8BE2\u7F13\u5B58\u5BB9\u91CF",
    "settings.queryCacheSizeHint": "BM25 \u67E5\u8BE2 LRU \u5BB9\u91CF\uFF1B\u7F29\u5C0F\u65F6\u7ACB\u5373\u6DD8\u6C70\u6700\u65E7\u9879\u3002",
    "settings.andHint": "\u4E09\u4E2A\u9891\u7387\u6761\u4EF6\u6309 AND \u5224\u5B9A\uFF1Bidle\u3001aborted\u3001subagent \u548C\u5DF2\u8BB0\u5F55\u8BB0\u5FC6\u7684\u56DE\u5408\u4E0D\u4F1A\u89E6\u53D1\u3002",
    "settings.liveHint": "\u9884\u7B97\u548C\u53EC\u56DE\u9650\u5236\u7ACB\u5373\u5F71\u54CD\u65B0\u8BF7\u6C42\uFF1B\u5DF2\u51BB\u7ED3\u7684\u4F1A\u8BDD\u5FEB\u7167\u4E0D\u4F1A\u91CD\u5199\uFF0C\u4EE5\u4FDD\u6301\u63D0\u793A\u524D\u7F00\u7F13\u5B58\u7A33\u5B9A\u3002",
    "settings.source": "\u5F53\u524D\u6765\u6E90",
    "settings.source.profile": "\u542F\u52A8\u914D\u7F6E",
    "settings.source.web": "Web \u6301\u4E45\u5316\u8986\u76D6",
    "settings.save": "\u4FDD\u5B58\u5E76\u7ACB\u5373\u5E94\u7528",
    "settings.reset": "\u6062\u590D\u542F\u52A8\u914D\u7F6E",
    "settings.saved": "\u5DF2\u4FDD\u5B58\uFF0C\u540E\u7EED\u56DE\u5408\u7ACB\u5373\u751F\u6548\u3002",
    "settings.resetDone": "\u5DF2\u6062\u590D\u672C\u6B21\u542F\u52A8\u65F6\u7684\u914D\u7F6E\u3002",
    "settings.invalid": "\u8BF7\u8F93\u5165\u6709\u6548\u6570\u503C\uFF1A\u6574\u6570\u9879\u4E0D\u5C0F\u4E8E 1\u3001\u51B7\u5374\u4E0D\u5C0F\u4E8E 0\uFF1B\u786C\u4E0A\u9650\u4E0D\u5F97\u5C0F\u4E8E\u76EE\u6807\u6216\u9ED8\u8BA4\u503C\u3002",
    "settings.loadFailed": "\u8BBE\u7F6E\u52A0\u8F7D\u5931\u8D25",
    "settings.saveFailed": "\u8BBE\u7F6E\u4FDD\u5B58\u5931\u8D25"
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
    "form.importance": "Importance",
    "form.importanceHint": "1 is lowest and 5 is highest; this affects Hot Memory ranking.",
    "form.tags": "Tags",
    "form.supersedes": "Superseded entry IDs",
    "form.pinned": "Pin this entry",
    "form.pinnedHint": "Pinned entries receive priority during Hot Memory selection.",
    "form.submit": "Record",
    "form.placeholder.title": 'A one-line title, e.g. "Fix pet hover crash"',
    "form.placeholder.content": "What was done, the conclusion, the lesson, or the next step. Concise and actionable.",
    "form.placeholder.tags": "Comma-separated, for example release, windows",
    "form.placeholder.supersedes": "Comma-separated old entry IDs (optional)",
    "empty.project": "No persistent memory in this project yet",
    "empty.projectHint": "Ask the agent to distill via memoir_record, or add an entry manually.",
    "empty.workspace": "No project session open",
    "empty.workspaceHint": "Open a project session to see its persistent memory here.",
    "empty.global": "The global index is empty",
    "empty.globalHint": "Entries recorded via memoir_record in any project appear here for cross-project search.",
    "empty.search": "No matching entries",
    "load.failed": "Failed to load",
    "record.failed": "Failed to record",
    "update.failed": "Failed to update",
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
    "search.ranked": "Ranked by relevance",
    "filter.status": "Status",
    "filter.section": "Section",
    "filter.all": "All",
    "status.active": "Active",
    "status.superseded": "Superseded",
    "status.archived": "Archived",
    "lifecycle.pin": "Pin",
    "lifecycle.unpin": "Unpin",
    "lifecycle.edit": "Edit",
    "lifecycle.save": "Save update",
    "lifecycle.supersede": "Mark superseded",
    "lifecycle.unsupersede": "Restore active",
    "lifecycle.archive": "Archive",
    "lifecycle.restore": "Restore",
    "settings.title": "Memory settings",
    "settings.description": "Complete runtime settings; saves apply immediately and persist in the local DSH user directory.",
    "settings.announce": "Inject memory for agents",
    "settings.announceHint": "When off, plugin guidance and Hot Memory leave the system prompt while tools and the GUI remain available.",
    "settings.group.distill": "Auto-distill",
    "settings.group.memory": "Hot Memory, recall, and cache",
    "settings.enabled": "Enable auto-distill",
    "settings.enabledHint": "Prompt top-level agents to distill memory after eligible worked turns.",
    "settings.autoDistillEvery": "Worked-turn interval",
    "settings.autoDistillEveryHint": "Remind at most once per N accumulated worked turns (minimum 1).",
    "settings.autoDistillCooldownMin": "Cooldown (minutes)",
    "settings.autoDistillCooldownMinHint": "Require at least M minutes between successful reminders (minimum 0).",
    "settings.autoDistillMinTools": "Minimum tool calls",
    "settings.autoDistillMinToolsHint": "The triggering turn must contain at least K tool calls (minimum 1).",
    "settings.hotMemoryTokens": "Hot Memory target tokens",
    "settings.hotMemoryTokensHint": "Normal selection budget; it cannot exceed the hard limit.",
    "settings.hotMemoryMaxTokens": "Hot Memory hard limit",
    "settings.hotMemoryMaxTokensHint": "No newly frozen session snapshot exceeds this budget.",
    "settings.readDefaultLimit": "Default recall count",
    "settings.readDefaultLimitHint": "Used when memoir_read omits limit.",
    "settings.readMaxLimit": "Maximum recall count",
    "settings.readMaxLimitHint": "Live memoir_read ceiling; it cannot be below the default.",
    "settings.sessionSnapshotMax": "Session snapshot capacity",
    "settings.sessionSnapshotMaxHint": "LRU capacity for frozen prompt prefixes; shrinking evicts the oldest immediately.",
    "settings.queryCacheSize": "Query cache capacity",
    "settings.queryCacheSizeHint": "BM25 query LRU capacity; shrinking evicts the oldest immediately.",
    "settings.andHint": "All three frequency conditions use AND semantics; idle, aborted, subagent, and already-recorded turns do not trigger.",
    "settings.liveHint": "Budgets and recall limits affect new requests immediately; frozen session snapshots remain unchanged for prompt-prefix cache stability.",
    "settings.source": "Current source",
    "settings.source.profile": "startup profile config",
    "settings.source.web": "persistent Web override",
    "settings.save": "Save and apply now",
    "settings.reset": "Restore startup config",
    "settings.saved": "Saved; subsequent turns use the new policy immediately.",
    "settings.resetDone": "Restored the configuration captured at startup.",
    "settings.invalid": "Enter valid values: integer fields are at least 1 and cooldown is at least 0; a hard/maximum value cannot be below its target/default.",
    "settings.loadFailed": "Failed to load settings",
    "settings.saveFailed": "Failed to save settings"
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

.memoir-toolbar { display: flex; flex-wrap: wrap; gap: 8px; padding: 8px 14px; }
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
.memoir-primary:disabled, .memoir-iconbtn:disabled { cursor: not-allowed; opacity: .45; }

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
.memoir-tag { background: var(--tag-bg, rgba(22,163,74,.12)); color: var(--tag-fg, #15803d); }
.memoir-entry-title { font-weight: 600; margin-bottom: 2px; }
.memoir-entry-content { white-space: pre-wrap; word-break: break-word; line-height: 1.5; }
.memoir-entry-actions { display: flex; gap: 4px; margin: 4px 0; }
.memoir-status-filter { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; white-space: nowrap; }
.memoir-status-filter select { max-width: 110px; }
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
.memoir-field small { font-size: 10px; opacity: .65; line-height: 1.35; }
.memoir-field input, .memoir-field select, .memoir-field textarea {
  border: 1px solid var(--border, rgba(0,0,0,.15)); background: transparent; color: inherit;
  border-radius: 6px; padding: 6px 8px; font-size: 13px; font-family: inherit; outline: none;
}
.memoir-field textarea { min-height: 72px; resize: vertical; }
.memoir-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* v0.5.4 complete live settings */
.memoir-settings { margin: 0 14px; border-top: 1px solid var(--border, rgba(0,0,0,.1)); padding-top: 8px; }
.memoir-settings-slot {
  list-style: none; margin: 0; padding: 0 0 12px;
  border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 10px;
  background: var(--bg-card, rgba(0,0,0,.02));
}
.memoir-settings-slot .memoir-settings { margin: 12px 14px 0; border-top: none; }
.memoir-settings-slot .memoir-settings-body { max-height: none; }
.memoir-settings-body {
  display: flex; flex-direction: column; gap: 10px; margin-top: 7px; padding: 10px;
  border: 1px solid var(--border, rgba(0,0,0,.1)); border-radius: 8px;
  background: var(--bg-card, rgba(0,0,0,.02)); max-height: min(50vh, 430px); overflow-y: auto;
}
.memoir-settings-description, .memoir-settings-note, .memoir-settings-source { font-size: 11px; opacity: .72; line-height: 1.45; }
.memoir-settings-group-title { font-size: 12px; font-weight: 600; margin-top: 2px; }
.memoir-settings-switch { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
.memoir-settings-switch input { margin-top: 3px; }
.memoir-settings-switch span { display: flex; flex-direction: column; gap: 2px; }
.memoir-settings-switch small, .memoir-settings-grid small { font-size: 10px; opacity: .65; line-height: 1.35; }
.memoir-settings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.memoir-settings-grid .memoir-field { min-width: 0; }
.memoir-settings-grid .memoir-field > span { font-size: 11px; opacity: .8; }
.memoir-settings-feedback { padding: 0; }
.memoir-settings-success { color: var(--success, #15803d); font-size: 12px; }
@media (max-width: 760px) {
  .memoir-settings-grid { grid-template-columns: 1fr; }
}

/* Sidebar entry row (plain DOM, matches the shell's nav rows). */
.memoir-entry-row {
  display: flex; align-items: center; gap: 8px; width: 100%;
  border: none; background: transparent; color: inherit; cursor: pointer;
  padding: 7px 10px; border-radius: 6px; font-size: 13px; text-align: left;
}
.memoir-entry-row:hover { background: var(--bg-hover, rgba(0,0,0,.06)); }
.memoir-entry-row[data-active="true"] { background: var(--bg-hover, rgba(0,0,0,.08)); }
.memoir-entry-icon { display: inline-flex; }

/* Collapsed (rail) state: the shell flags the rail with data-sidebar-collapsed
   on the frame root (AppFrame.tsx). The plain-DOM entry gets no wide prop, so
   it mirrors the shell's rail treatment via ancestry \u2014 a centered 36x36
   control box with an 18px icon (matching the New Session / Search rail
   icons) and the text label hidden. The entry is a direct flex child of the
   sidebar root, so it sits inline with the shell's own rail controls. */
[data-sidebar-collapsed] [data-dsh-memoir-entry].memoir-entry-row {
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  margin: 0 0 12px;
}
[data-sidebar-collapsed] [data-dsh-memoir-entry] .memoir-entry-icon svg {
  width: 18px;
  height: 18px;
}
[data-sidebar-collapsed] [data-dsh-memoir-entry] .memoir-entry-label {
  display: none;
}

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
var ENTRY_SELECTOR = "[data-dsh-memoir-entry]";
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
  entry.dataset.dshPlugin = "memoir";
  entry.dataset.dshPart = "sidebar-entry";
  entry.className = "memoir-entry-row";
  entry.innerHTML = '<span class="memoir-entry-icon">' + ICON + '</span><span class="memoir-entry-label"></span>';
  const syncCopy = () => {
    const label = t("entry.label");
    entry.setAttribute("aria-label", label);
    entry.setAttribute("title", t("entry.tooltip"));
    const text = entry.querySelector(".memoir-entry-label");
    if (text !== null) text.textContent = label;
  };
  syncCopy();
  const languageObserver = new MutationObserver(syncCopy);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  entry.addEventListener("click", () => {
    controller.toggle();
  });
  Object.defineProperty(entry, "__memoirDisposeLanguage", { value: () => languageObserver.disconnect() });
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
  if (document.querySelector(ENTRY_SELECTOR) !== null) return () => {
  };
  const entry = createEntry(controller, t);
  let root;
  let placed = false;
  const tryPlace = () => {
    if (root !== void 0 && !root.isConnected) {
      rootObserver.disconnect();
      root = void 0;
      placed = false;
    }
    if (placed) {
      if (document.body.contains(entry)) return;
      rootObserver.disconnect();
      root = void 0;
      placed = false;
    }
    root ??= sidebarRoot();
    if (root === void 0) return;
    placed = placeEntry(root, entry);
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true });
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
    if (controller.getSnapshot().panelOpen) entry.dataset.active = "true";
    else delete entry.dataset.active;
  });
  if (controller.getSnapshot().panelOpen) entry.dataset.active = "true";
  tryPlace();
  return () => {
    waitObserver.disconnect();
    rootObserver.disconnect();
    unsubscribe();
    entry.__memoirDisposeLanguage?.();
    entry.remove();
  };
}

// src/client/mount.tsx
var import_client = require("react-dom/client");

// src/client/panel.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var parseList = (value) => [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter((item) => item !== ""))];
function EntryMeta({ entry, t }) {
  const when = new Date(entry.time);
  const pad = (n) => String(n).padStart(2, "0");
  const timeText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-entry-meta", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: timeText }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-chip", children: t("sections." + entry.section) }),
    entry.status !== void 0 && entry.status !== "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-chip", children: t("status." + entry.status) }) : null,
    entry.pinned === true ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-chip", children: t("lifecycle.pin") }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "memoir-chip", title: t("form.importanceHint"), children: [
      t("form.importance"),
      ": ",
      entry.importance ?? 3
    ] }),
    (entry.tags ?? []).map((tag) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "memoir-chip memoir-tag", children: [
      "#",
      tag
    ] }, tag)),
    (entry.supersedes?.length ?? 0) > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "memoir-chip", title: entry.supersedes?.join("\n"), children: [
      t("form.supersedes"),
      ": ",
      entry.supersedes?.length
    ] }) : null,
    entry.sessionId !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { title: `${t("session")}: ${entry.sessionId}`, children: entry.sessionId.slice(0, 12) }) : null
  ] });
}
function EntryCard({ entry, t, onDelete, onUpdate, score }) {
  const [editing, setEditing] = (0, import_react.useState)(false);
  const [section, setSection] = (0, import_react.useState)(entry.section);
  const [title, setTitle] = (0, import_react.useState)(entry.title ?? "");
  const [content, setContent] = (0, import_react.useState)(entry.content);
  const [importance, setImportance] = (0, import_react.useState)(String(entry.importance ?? 3));
  const [tags, setTags] = (0, import_react.useState)((entry.tags ?? []).join(", "));
  const [supersedes, setSupersedes] = (0, import_react.useState)((entry.supersedes ?? []).join(", "));
  const save = () => {
    if (content.trim() === "" || onUpdate === void 0) return;
    onUpdate(entry, {
      section,
      title: title.trim() === "" ? null : title.trim(),
      content: content.trim(),
      importance: Number(importance),
      tags: parseList(tags),
      supersedes: parseList(supersedes)
    });
    setEditing(false);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-entry", "data-dsh-part": "entry", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-delete", title: t("delete.confirm"), onClick: () => onDelete(entry), children: "\xD7" }),
    onUpdate !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-entry-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: () => setEditing((value) => !value), children: editing ? t("toolbar.cancel") : t("lifecycle.edit") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: () => onUpdate(entry, { pinned: entry.pinned !== true }), children: entry.pinned === true ? t("lifecycle.unpin") : t("lifecycle.pin") }),
      (entry.status ?? "active") === "active" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: () => onUpdate(entry, { status: "superseded" }), children: t("lifecycle.supersede") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: () => onUpdate(entry, { status: "active" }), children: t("lifecycle.unsupersede") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: () => onUpdate(entry, { status: entry.status === "archived" ? "active" : "archived" }), children: entry.status === "archived" ? t("lifecycle.restore") : t("lifecycle.archive") })
    ] }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryMeta, { entry, t }),
    score !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-score", title: t("search.ranked"), children: score.toFixed(3) }) : null,
    editing ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form memoir-entry-editor", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.section") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: section, onChange: (e) => setSection(e.target.value), children: SECTION_KEYS.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: t("sections." + key) }, key)) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.title") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: title, onChange: (e) => setTitle(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.content") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("textarea", { value: content, onChange: (e) => setContent(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.importance") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: importance, onChange: (e) => setImportance(e.target.value), children: [1, 2, 3, 4, 5].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value, children: value }, value)) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.tags") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: tags, placeholder: t("form.placeholder.tags"), onChange: (e) => setTags(e.target.value) })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.supersedes") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: supersedes, placeholder: t("form.placeholder.supersedes"), onChange: (e) => setSupersedes(e.target.value) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: () => setEditing(false), children: t("toolbar.cancel") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", onClick: save, children: t("lifecycle.save") })
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      entry.title !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-entry-title", children: entry.title }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-entry-content", children: entry.content })
    ] })
  ] });
}
function SectionedEntries({ entries, t, onDelete, onUpdate }) {
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
    group.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry, t, onDelete, onUpdate }, entry.id))
  ] }, group.key)) });
}
function RankedResults({ results, pending, grouped, t, onDelete, onUpdate }) {
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
      results.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry: r.entry, score: r.score, t, onDelete: (entry) => onDelete(entry, r.projectPath), onUpdate: (entry, patch) => onUpdate?.(entry, r.projectPath, patch) }, r.entry.id))
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
    bucket.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry: r.entry, score: r.score, t, onDelete: (entry) => onDelete(entry, path), onUpdate: (entry, patch) => onUpdate?.(entry, path, patch) }, r.entry.id))
  ] }, path)) });
}
function AddForm({ t, onSubmit, onCancel }) {
  const [section, setSection] = (0, import_react.useState)("lessons");
  const [title, setTitle] = (0, import_react.useState)("");
  const [content, setContent] = (0, import_react.useState)("");
  const [importance, setImportance] = (0, import_react.useState)("3");
  const [pinned, setPinned] = (0, import_react.useState)(false);
  const [tags, setTags] = (0, import_react.useState)("");
  const [supersedes, setSupersedes] = (0, import_react.useState)("");
  const submit = () => {
    if (content.trim() === "") return;
    onSubmit({
      section,
      title: title.trim() === "" ? void 0 : title.trim(),
      content: content.trim(),
      importance: Number(importance),
      pinned,
      tags: parseList(tags),
      supersedes: parseList(supersedes)
    });
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form", "data-dsh-part": "entry-form", children: [
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-row", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.importance") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("select", { value: importance, onChange: (e) => setImportance(e.target.value), children: [1, 2, 3, 4, 5].map((value) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value, children: value }, value)) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: t("form.importanceHint") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.tags") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: tags, placeholder: t("form.placeholder.tags"), onChange: (e) => setTags(e.target.value) })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-field", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { children: t("form.supersedes") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { value: supersedes, placeholder: t("form.placeholder.supersedes"), onChange: (e) => setSupersedes(e.target.value) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-settings-switch", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: pinned, onChange: (e) => setPinned(e.target.checked) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("form.pinned") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: t("form.pinnedHint") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", onClick: onCancel, children: t("toolbar.cancel") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", onClick: submit, children: t("form.submit") })
    ] })
  ] });
}
var NUMERIC_SETTINGS = [
  "autoDistillEvery",
  "autoDistillCooldownMin",
  "autoDistillMinTools",
  "hotMemoryTokens",
  "hotMemoryMaxTokens",
  "readDefaultLimit",
  "readMaxLimit",
  "sessionSnapshotMax",
  "queryCacheSize"
];
function MemoirSettingsPanel({ api, t, refreshKey, onChanged, defaultOpen = false }) {
  const [open, setOpen] = (0, import_react.useState)(defaultOpen);
  const [settings, setSettings] = (0, import_react.useState)(null);
  const [source, setSource] = (0, import_react.useState)("profile");
  const [draft, setDraft] = (0, import_react.useState)({
    autoDistillEvery: "1",
    autoDistillCooldownMin: "0",
    autoDistillMinTools: "1",
    hotMemoryTokens: "900",
    hotMemoryMaxTokens: "1200",
    readDefaultLimit: "8",
    readMaxLimit: "30",
    sessionSnapshotMax: "128",
    queryCacheSize: "128"
  });
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)(null);
  const [error, setError] = (0, import_react.useState)(null);
  const applySnapshot = (snapshot) => {
    setError(null);
    setSettings(snapshot.settings);
    setSource(snapshot.source);
    setDraft(Object.fromEntries(NUMERIC_SETTINGS.map((key) => [key, String(snapshot.settings[key])])));
  };
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    api.settings().then((value) => {
      if (!cancelled) applySnapshot(value);
    }).catch((e) => {
      if (!cancelled) setError(`${t("settings.loadFailed")}: ${e.message}`);
    });
    return () => {
      cancelled = true;
    };
  }, [api, refreshKey]);
  const save = () => {
    if (settings === null) return;
    const parsed = Object.fromEntries(NUMERIC_SETTINGS.map((key) => [key, Number(draft[key])]));
    const integerKeys = NUMERIC_SETTINGS.filter((key) => key !== "autoDistillCooldownMin");
    const invalidInteger = integerKeys.some((key) => !Number.isSafeInteger(parsed[key]) || parsed[key] < 1);
    if (invalidInteger || !Number.isFinite(parsed.autoDistillCooldownMin) || parsed.autoDistillCooldownMin < 0 || parsed.hotMemoryMaxTokens < parsed.hotMemoryTokens || parsed.readMaxLimit < parsed.readDefaultLimit) {
      setMessage(null);
      setError(t("settings.invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    api.updateSettings({
      announceToAgent: settings.announceToAgent,
      autoDistill: settings.autoDistill,
      ...parsed
    }).then((value) => {
      applySnapshot(value);
      setMessage(t("settings.saved"));
      onChanged();
    }).catch((e) => setError(`${t("settings.saveFailed")}: ${e.message}`)).finally(() => setBusy(false));
  };
  const reset = () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    api.resetSettings().then((value) => {
      applySnapshot(value);
      setMessage(t("settings.resetDone"));
      onChanged();
    }).catch((e) => setError(`${t("settings.saveFailed")}: ${e.message}`)).finally(() => setBusy(false));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-settings", "data-dsh-part": "settings", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "memoir-diagnostics-toggle", onClick: () => setOpen((value) => !value), children: [
      t("settings.title"),
      " ",
      open ? "\u25BE" : "\u25B8"
    ] }),
    open ? settings === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-body", children: error ?? "\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-settings-body", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-description", children: t("settings.description") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-settings-switch", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: settings.announceToAgent,
            onChange: (event) => setSettings({ ...settings, announceToAgent: event.target.checked })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("settings.announce") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: t("settings.announceHint") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-group-title", children: t("settings.group.distill") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-settings-switch", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "checkbox",
            checked: settings.autoDistill,
            onChange: (event) => setSettings({ ...settings, autoDistill: event.target.checked })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: t("settings.enabled") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: t("settings.enabledHint") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-grid", children: ["autoDistillEvery", "autoDistillCooldownMin", "autoDistillMinTools"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t(`settings.${key}`) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "number",
            min: key === "autoDistillCooldownMin" ? "0" : "1",
            step: key === "autoDistillCooldownMin" ? "0.1" : "1",
            value: draft[key],
            onChange: (event) => setDraft({ ...draft, [key]: event.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: t(`settings.${key}Hint`) })
      ] }, key)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-note", children: t("settings.andHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-group-title", children: t("settings.group.memory") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-grid", children: ["hotMemoryTokens", "hotMemoryMaxTokens", "readDefaultLimit", "readMaxLimit", "sessionSnapshotMax", "queryCacheSize"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t(`settings.${key}`) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            type: "number",
            min: "1",
            step: "1",
            value: draft[key],
            onChange: (event) => setDraft({ ...draft, [key]: event.target.value })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: t(`settings.${key}Hint`) })
      ] }, key)) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-note", children: t("settings.liveHint") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-settings-source", children: [
        t("settings.source"),
        ": ",
        t(`settings.source.${source}`)
      ] }),
      error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-error memoir-settings-feedback", children: error }) : null,
      message !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-success", children: message }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", disabled: busy || source === "profile", onClick: reset, children: t("settings.reset") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", disabled: busy, onClick: save, children: t("settings.save") })
      ] })
    ] }) : null
  ] });
}
function MemoirPanel({ controller, api, cwdTracker, t }) {
  const [, setLanguage] = (0, import_react.useState)(document.documentElement.lang);
  (0, import_react.useEffect)(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  const cwd = (0, import_react.useSyncExternalStore)(cwdTracker.subscribe, cwdTracker.getSnapshot);
  const [tab, setTab] = (0, import_react.useState)("project");
  const [query2, setQuery] = (0, import_react.useState)("");
  const [statusFilter, setStatusFilter] = (0, import_react.useState)("active");
  const [sectionFilter, setSectionFilter] = (0, import_react.useState)("all");
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
      api.project(cwd, { status: statusFilter, section: sectionFilter === "all" ? void 0 : sectionFilter }).then((value) => {
        if (!cancelled) setProject(value.project);
      }).catch((e) => {
        if (!cancelled) setError(e.message);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    } else {
      setLoading(true);
      api.global({ status: statusFilter, section: sectionFilter === "all" ? void 0 : sectionFilter }).then((value) => {
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
  }, [tab, cwd, statusFilter, sectionFilter, refreshKey]);
  (0, import_react.useEffect)(() => {
    if (q === "") {
      setSearchResults(null);
      return void 0;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const scope = tab === "project" ? "project" : "global";
      api.search({
        scope,
        path: tab === "project" && cwd !== "" ? cwd : void 0,
        query: q,
        status: statusFilter,
        section: sectionFilter === "all" ? void 0 : sectionFilter
      }).then((value) => {
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
  }, [q, tab, cwd, statusFilter, sectionFilter, refreshKey]);
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
  const onUpdate = (entry, entryPath, patch) => {
    setBusy(true);
    api.update({ path: entryPath, id: entry.id, ...patch }).then(() => reload()).catch((e) => setError(`${t("update.failed")}: ${e.message}`)).finally(() => setBusy(false));
  };
  const projectEntries = project === null ? [] : filterEntries(project.entries);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-panel", "data-dsh-plugin": "memoir", "data-dsh-part": "panel", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-header", "data-dsh-part": "header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-title", children: [
        t("panel.title"),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-subtitle", children: tab === "project" ? cwd === "" ? t("empty.workspace") : cwd : t("tab.global") })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", title: t("panel.refresh"), onClick: reload, children: "\u27F3" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", title: t("panel.close"), onClick: () => controller.close(), children: "\xD7" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-tabs", "data-dsh-part": "tabs", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-tab", "data-active": tab === "project" ? "true" : void 0, onClick: () => setTab("project"), children: t("tab.project") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-tab", "data-active": tab === "global" ? "true" : void 0, onClick: () => setTab("global"), children: t("tab.global") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-toolbar", "data-dsh-part": "toolbar", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { className: "memoir-search", placeholder: t("toolbar.search"), value: query2, onChange: (e) => setQuery(e.target.value) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-status-filter", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("filter.status") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "active", children: t("status.active") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: t("filter.all") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "superseded", children: t("status.superseded") }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "archived", children: t("status.archived") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "memoir-status-filter", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("filter.section") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", { value: sectionFilter, onChange: (e) => setSectionFilter(e.target.value), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "all", children: t("filter.all") }),
          SECTION_KEYS.map((key) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: key, children: t("sections." + key) }, key))
        ] })
      ] }),
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
        onDelete: (entry, path) => onDelete(entry, path),
        onUpdate
      }
    ) : tab === "project" ? cwd === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.workspace") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.workspaceHint") })
    ] }) : projectEntries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.project") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.projectHint") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionedEntries, { entries: projectEntries, t, onDelete: (entry) => onDelete(entry, project?.path ?? cwd), onUpdate: (entry, patch) => onUpdate(entry, project?.path ?? cwd, patch) }) : projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
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
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionedEntries, { entries, t, onDelete: (entry) => onDelete(entry, p.path), onUpdate: (entry, patch) => onUpdate(entry, p.path, patch) })
      ] }, p.key);
    }) }),
    busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty", children: "\u2026" }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MemoirSettingsPanel, { api, t, refreshKey, onChanged: reload }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-inspector", "data-dsh-part": "hot-memory", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "memoir-diagnostics-toggle", onClick: () => setInspectorOpen((v) => !v), children: [
        t("inspector.title"),
        " ",
        inspectorOpen ? "\u25BE" : "\u25B8"
      ] }),
      inspectorOpen ? hotMemory === null || hotMemory.text === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-inspector-body", children: t("inspector.empty") }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", { className: "memoir-inspector-body", children: hotMemory.text }) : null
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-diagnostics", "data-dsh-part": "diagnostics", children: [
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
    container.dataset.dshPlugin = "memoir";
    container.dataset.dshPart = "panel-host";
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
    if (typeof detail === "string" && detail !== PANEL_NAME && controller.getSnapshot().panelOpen) {
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
var import_jsx_runtime3 = require("react/jsx-runtime");
var inject = ["sessions", "slots"];
function injectStyles() {
  if (document.querySelector('style[data-plugin="dsh-memoir"]') !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-memoir";
  tag.textContent = PANEL_CSS;
  document.head.appendChild(tag);
}
function SettingsSlotCard({ api, t }) {
  const [, setLanguage] = (0, import_react2.useState)(document.documentElement.lang);
  const [refreshKey, setRefreshKey] = (0, import_react2.useState)(0);
  (0, import_react2.useEffect)(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("li", { className: "memoir-settings-slot", "data-dsh-plugin": "memoir", "data-dsh-part": "settings-card", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    MemoirSettingsPanel,
    {
      api,
      t,
      refreshKey,
      onChanged: () => setRefreshKey((value) => value + 1),
      defaultOpen: true
    }
  ) });
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
    disposers.push(ctx.slots.inject("web-ui.plugin.item", () => ctx.slots.register({
      name: "web-ui.plugin.item",
      id: "memoir",
      order: 130
    }, () => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(SettingsSlotCard, { api, t }))));
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
