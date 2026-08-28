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
    "source.label": "\u6765\u6E90",
    "source.turn": "\u56DE\u5408",
    "source.open": "\u6253\u5F00\u6765\u6E90\u4F1A\u8BDD\u5E76\u5B9A\u4F4D\u5230\u5BF9\u5E94\u56DE\u5408",
    "source.copy": "\u590D\u5236\u4F1A\u8BDD\u4E0E\u56DE\u5408\u6807\u8BC6",
    "source.copied": "\u5DF2\u590D\u5236",
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
    "similarity.title": "\u53D1\u73B0\u76F8\u4F3C\u8BB0\u5FC6\uFF0C\u672C\u6B21\u5C1A\u672A\u5199\u5165",
    "similarity.description": "\u8BF7\u9009\u62E9\u66F4\u65B0\u5DF2\u6709\u8BB0\u5FC6\u3001\u7528\u65B0\u7ED3\u8BBA\u66FF\u4EE3\u5B83\uFF0C\u6216\u660E\u786E\u4FDD\u7559\u4E24\u6761\uFF1B\u63D2\u4EF6\u4E0D\u4F1A\u81EA\u52A8\u5220\u9664\u6216\u5408\u5E76\u3002",
    "similarity.kind.duplicate": "\u7591\u4F3C\u91CD\u590D",
    "similarity.kind.conflict": "\u53EF\u80FD\u51B2\u7A81",
    "similarity.titleScore": "\u6807\u9898",
    "similarity.update": "\u66F4\u65B0\u8FD9\u4E00\u6761",
    "similarity.supersede": "\u7528\u65B0\u7ED3\u8BBA\u66FF\u4EE3",
    "similarity.force": "\u4ECD\u7136\u4FDD\u7559\u4E24\u6761",
    "similarity.back": "\u8FD4\u56DE\u4FEE\u6539",
    "similarity.reason.exact-content": "\u6B63\u6587\u4E00\u81F4",
    "similarity.reason.exact-title": "\u6807\u9898\u4E00\u81F4",
    "similarity.reason.high-title-overlap": "\u6807\u9898\u9AD8\u5EA6\u76F8\u4F3C",
    "similarity.reason.high-token-overlap": "Token \u9AD8\u91CD\u5408",
    "similarity.reason.bm25-candidate": "BM25 \u9AD8\u76F8\u5173",
    "similarity.reason.same-topic-different-content": "\u540C\u4E3B\u9898\u4F46\u5185\u5BB9\u4E0D\u540C",
    "settings.title": "\u8BB0\u5FC6\u8BBE\u7F6E",
    "settings.description": "\u5B8C\u6574\u8FD0\u884C\u65F6\u8BBE\u7F6E\uFF1B\u4FDD\u5B58\u540E\u7ACB\u5373\u5E94\u7528\uFF0C\u5E76\u6301\u4E45\u5316\u5230\u672C\u673A DSH \u7528\u6237\u76EE\u5F55\u3002",
    "settings.expand": "\u5C55\u5F00",
    "settings.collapse": "\u6298\u53E0",
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
    "source.label": "Source",
    "source.turn": "turn",
    "source.open": "Open the source session and reveal its turn",
    "source.copy": "Copy session and turn identifiers",
    "source.copied": "Copied",
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
    "similarity.title": "Similar memory found; nothing has been written yet",
    "similarity.description": "Update the existing memory, supersede it with the new conclusion, or explicitly keep both. The plugin never deletes or merges automatically.",
    "similarity.kind.duplicate": "Likely duplicate",
    "similarity.kind.conflict": "Possible conflict",
    "similarity.titleScore": "title",
    "similarity.update": "Update this entry",
    "similarity.supersede": "Supersede with new",
    "similarity.force": "Keep both anyway",
    "similarity.back": "Back to edit",
    "similarity.reason.exact-content": "Exact content",
    "similarity.reason.exact-title": "Exact title",
    "similarity.reason.high-title-overlap": "High title overlap",
    "similarity.reason.high-token-overlap": "High token overlap",
    "similarity.reason.bm25-candidate": "High BM25 relevance",
    "similarity.reason.same-topic-different-content": "Same topic, different content",
    "settings.title": "Memory settings",
    "settings.description": "Complete runtime settings; saves apply immediately and persist in the local DSH user directory.",
    "settings.expand": "Expand",
    "settings.collapse": "Collapse",
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

// src/client/panel.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var EMPTY_CWD_TRACKER = {
  getSnapshot: () => "",
  subscribe: () => () => {
  }
};
var parseList = (value) => [...new Set(value.split(/[,，\n]/).map((item) => item.trim()).filter((item) => item !== ""))];
async function copyText(value) {
  try {
    if (navigator.clipboard !== void 0) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  } catch {
    return false;
  }
}
function EntryMeta({ entry, t, openSource }) {
  const [copied, setCopied] = (0, import_react.useState)(false);
  const when = new Date(entry.time);
  const pad = (n) => String(n).padStart(2, "0");
  const timeText = `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const source = entry.source ?? (entry.sessionId === void 0 ? void 0 : { sessionId: entry.sessionId });
  const sourceText = source === void 0 ? "" : [
    source.sessionId === void 0 ? void 0 : `sessionId=${source.sessionId}`,
    source.turnId === void 0 ? void 0 : `turnId=${source.turnId}`
  ].filter(Boolean).join("\n");
  const copySource = () => {
    void copyText(sourceText).then((ok) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
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
    source !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "memoir-source", children: [
      source.sessionId !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "memoir-source-link", title: t("source.open"), onClick: () => openSource?.(source.sessionId, source.turnId), children: [
        t("source.label"),
        ": ",
        source.sessionId.slice(0, 10),
        source.turnId === void 0 ? "" : ` \xB7 ${t("source.turn")} ${source.turnId}`
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { children: [
        t("source.turn"),
        " ",
        source.turnId
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-source-copy", title: t("source.copy"), onClick: copySource, children: copied ? t("source.copied") : "\u29C9" })
    ] }) : null
  ] });
}
function EntryCard({ entry, t, onDelete, onUpdate, openSource, score }) {
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryMeta, { entry, t, openSource }),
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
function SectionedEntries({ entries, t, onDelete, onUpdate, openSource }) {
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
    group.entries.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry, t, onDelete, onUpdate, openSource }, entry.id))
  ] }, group.key)) });
}
function RankedResults({ results, pending, grouped, t, onDelete, onUpdate, openSource }) {
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
      results.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry: r.entry, score: r.score, t, onDelete: (entry) => onDelete(entry, r.projectPath), onUpdate: (entry, patch) => onUpdate?.(entry, r.projectPath, patch), openSource }, r.entry.id))
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
    bucket.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(EntryCard, { entry: r.entry, score: r.score, t, onDelete: (entry) => onDelete(entry, path), onUpdate: (entry, patch) => onUpdate?.(entry, path, patch), openSource }, r.entry.id))
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
function SimilarityCandidateCard({ candidate, t, busy, onResolve }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-similarity-candidate", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-similarity-head", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `memoir-chip memoir-similarity-${candidate.kind}`, children: t(`similarity.kind.${candidate.kind}`) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: candidate.entry.title ?? candidate.entry.content.slice(0, 100) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "memoir-score-static", children: [
        Math.round(candidate.score * 100),
        "%"
      ] })
    ] }),
    candidate.entry.title !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-similarity-content", children: candidate.entry.content }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-similarity-components", children: [
      "BM25 ",
      Math.round(candidate.components.bm25 * 100),
      "% \xB7 ",
      t("similarity.titleScore"),
      " ",
      Math.round(candidate.components.title * 100),
      "% \xB7 Jaccard ",
      Math.round(candidate.components.tokenJaccard * 100),
      "%"
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-similarity-reasons", children: candidate.reasons.map((reason) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "memoir-chip", children: t(`similarity.reason.${reason}`) }, reason)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-form-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", disabled: busy, onClick: () => onResolve("update", candidate.entry.id), children: t("similarity.update") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", disabled: busy, onClick: () => onResolve("supersede", candidate.entry.id), children: t("similarity.supersede") })
    ] })
  ] });
}
function SimilarityResolution({ result, t, busy, onResolve, onBack }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-similarity", "data-dsh-part": "similarity-resolution", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-similarity-title", children: t("similarity.title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-description", children: t("similarity.description") }),
    result.candidates.map((candidate) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SimilarityCandidateCard, { candidate, t, busy, onResolve }, candidate.entry.id)),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-similarity-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", disabled: busy, onClick: onBack, children: t("similarity.back") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", disabled: busy, onClick: () => onResolve("force-record"), children: t("similarity.force") })
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
function MemoirSettingsPanel({ api, t, refreshKey, onChanged, defaultOpen = false, alwaysOpen = false, showDescription = true }) {
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
    !alwaysOpen ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "memoir-diagnostics-toggle", "aria-expanded": open, onClick: () => setOpen((value) => !value), children: [
      t("settings.title"),
      " ",
      open ? "\u25BE" : "\u25B8"
    ] }) : null,
    alwaysOpen || open ? settings === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-body", children: error ?? "\u2026" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-settings-body", children: [
      showDescription ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-settings-description", children: t("settings.description") }) : null,
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
function MemoirPanel({ controller, api, cwdTracker = EMPTY_CWD_TRACKER, cwd: fixedCwd, t, openSource, onClose }) {
  const [, setLanguage] = (0, import_react.useState)(document.documentElement.lang);
  (0, import_react.useEffect)(() => {
    const observer = new MutationObserver(() => setLanguage(document.documentElement.lang));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  const trackedCwd = (0, import_react.useSyncExternalStore)(cwdTracker.subscribe, cwdTracker.getSnapshot);
  const cwd = fixedCwd ?? trackedCwd;
  const close = onClose ?? (controller === void 0 ? void 0 : () => controller.close());
  const [tab, setTab] = (0, import_react.useState)("project");
  const [query2, setQuery] = (0, import_react.useState)("");
  const [statusFilter, setStatusFilter] = (0, import_react.useState)("active");
  const [sectionFilter, setSectionFilter] = (0, import_react.useState)("all");
  const [formOpen, setFormOpen] = (0, import_react.useState)(false);
  const [pendingRecord, setPendingRecord] = (0, import_react.useState)(null);
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
  const onRecord = (payload, resolution, targetId) => {
    setBusy(true);
    api.record({ path: cwd, ...payload, ...resolution !== void 0 ? { resolution } : {}, ...targetId !== void 0 ? { targetId } : {} }).then((result) => {
      if (result.action === "needs-resolution") {
        setPendingRecord({ payload, result });
        return;
      }
      setPendingRecord(null);
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
      close === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-iconbtn", title: t("panel.close"), onClick: close, children: "\xD7" })
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
      tab === "project" && cwd !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "memoir-primary", onClick: () => {
        setFormOpen((value) => !value);
        setPendingRecord(null);
      }, children: formOpen ? t("toolbar.cancel") : t("toolbar.add") }) : null
    ] }),
    formOpen && tab === "project" && cwd !== "" ? pendingRecord === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AddForm, { t, onSubmit: onRecord, onCancel: () => setFormOpen(false) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      SimilarityResolution,
      {
        result: pendingRecord.result,
        t,
        busy,
        onResolve: (resolution, targetId) => onRecord(pendingRecord.payload, resolution, targetId),
        onBack: () => setPendingRecord(null)
      }
    ) : null,
    error !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-error", children: error }) : null,
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-scroll-region", "data-dsh-part": "scroll-region", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-body", children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty", children: "\u2026" }) : q !== "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        RankedResults,
        {
          results: searchResults ?? [],
          pending: searchResults === null,
          grouped: tab === "global",
          t,
          openSource,
          onDelete: (entry, path) => onDelete(entry, path),
          onUpdate
        }
      ) : tab === "project" ? cwd === "" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.workspace") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.workspaceHint") })
      ] }) : projectEntries.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-title", children: t("empty.project") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty-hint", children: t("empty.projectHint") })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionedEntries, { entries: projectEntries, t, openSource, onDelete: (entry) => onDelete(entry, project?.path ?? cwd), onUpdate: (entry, patch) => onUpdate(entry, project?.path ?? cwd, patch) }) : projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "memoir-empty", children: [
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
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(SectionedEntries, { entries, t, openSource, onDelete: (entry) => onDelete(entry, p.path), onUpdate: (entry, patch) => onUpdate(entry, p.path, patch) })
        ] }, p.key);
      }) }),
      busy ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "memoir-empty memoir-busy", children: "\u2026" }) : null,
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
    ] })
  ] });
}

// src/client/styles.ts
var PANEL_STYLE_SELECTOR = "style[data-dsh-memoir-style]";
function mountPanelStyles(target = document) {
  if (target.querySelector(PANEL_STYLE_SELECTOR) !== null) return () => {
  };
  const tag = target.createElement("style");
  tag.dataset.plugin = "dsh-memoir";
  tag.dataset.dshMemoirStyle = "";
  tag.textContent = PANEL_CSS;
  target.head.appendChild(tag);
  return () => tag.remove();
}
var PANEL_CSS = `
/* --- DSH 0.1.2 alpha native slot surfaces ---------------------------------- */

.memoir-native-view,
.memoir-settings-section {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--dsw-alias-bg-base, var(--bg-panel, #ffffff));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-family: var(--dsw-font-family, inherit);
}

.memoir-settings-section .memoir-panel {
  padding: 0;
}

/* --- center-column takeover (mirrors dsh-ssh / dsh-task-board) --------------- */

[data-pane='conversation'],
[class*='centerCol'] {
  position: relative;
}

[data-dsh-memoir-view] {
  display: none;
  position: absolute;
  inset: 0;
  z-index: 60;
  background: var(--dsw-alias-bg-base, var(--bg-panel, #ffffff));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-family: var(--dsw-font-family, inherit);
}

/* The center column is single-occupant; the :not() guards keep the sibling
   panels (task board / ssh) from fighting over visibility. */
html[data-dsh-memoir-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-dsh-memoir-view] {
  display: flex;
  flex-direction: column;
}
html[data-dsh-memoir-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [data-pane='conversation'] > :not([data-dsh-memoir-view]),
html[data-dsh-memoir-active]:not([data-dsh-ssh-active]):not([data-dsh-taskboard-active]) [class*='centerCol'] > :not([data-dsh-memoir-view]) {
  display: none !important;
}

/* --- panel frame: same shell as dsh-ssh .panel / dsh-task-board .board ------ */

.memoir-panel {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 14px 16px 16px;
  gap: 10px;
  background: var(--dsw-alias-bg-base, var(--bg-panel, #ffffff));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-family: var(--dsw-font-family, inherit);
  overflow: hidden;
}

.memoir-header {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  padding: 0;
}
.memoir-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  line-height: 1.25;
}
.memoir-subtitle {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Header icon controls: square ghost icons (dsh-ssh / dsh-task-board iconButton). */
.memoir-header .memoir-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  cursor: pointer;
  font-size: 13px;
}
.memoir-header .memoir-iconbtn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}

/* --- tab bar: dsh-ssh tabBar / tab ------------------------------------------- */

.memoir-tabs {
  display: flex;
  gap: 2px;
  flex: none;
  padding: 0;
  border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
}
.memoir-tab {
  padding: 7px 14px;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  white-space: nowrap;
}
.memoir-tab:hover {
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
.memoir-tab[data-active='true'] {
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-weight: 600;
  border-bottom-color: var(--dsw-alias-state-business-primary, #2563eb);
}

/* --- toolbar / controls ------------------------------------------------------- */

.memoir-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  flex: none;
  padding: 0;
}
.memoir-search {
  flex: 0 1 260px;
  min-width: 120px;
  padding: 6px 10px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-specific-input-major, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  outline: none;
}
.memoir-search::placeholder {
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .45));
}
.memoir-status-filter {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
  white-space: nowrap;
}
.memoir-status-filter select {
  max-width: 110px;
  padding: 6px 8px;
  font-size: 13px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-specific-input-major, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  outline: none;
}
.memoir-search:focus,
.memoir-status-filter select:focus {
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
}

/* --- buttons: web-ui family button language ---------------------------------- */

.memoir-primary {
  border: none;
  border-radius: 8px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary-foreground, #ffffff);
  background: var(--dsw-alias-button-info-fill, #2563eb);
  cursor: pointer;
  white-space: nowrap;
}
.memoir-primary:hover:not(:disabled) {
  background: var(--dsw-alias-button-info-hover, #1d4ed8);
}
.memoir-primary:disabled {
  opacity: .5;
  cursor: default;
}
.memoir-iconbtn {
  padding: 5px 12px;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: transparent;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}
.memoir-iconbtn:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, .06));
}
.memoir-iconbtn:disabled {
  opacity: .45;
  cursor: default;
}

/* --- body / lists ------------------------------------------------------------- */

.memoir-scroll-region {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.memoir-body {
  min-height: 0;
  padding: 4px 0 16px;
}
.memoir-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 14px 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-count {
  font-weight: 400;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
}

/* Entry cards: dsh-skill-explorer .skill / dsh-task-board .card surfaces. */
.memoir-entry {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .08));
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: var(--dsw-alias-bg-base, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-entry-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  margin-bottom: 5px;
}
.memoir-chip {
  display: inline-block;
  padding: 1px 8px;
  font-size: 11px;
  line-height: 1.6;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
  background: transparent;
  white-space: nowrap;
}
.memoir-tag {
  color: var(--dsw-alias-state-success-primary, #15803d);
  border-color: var(--dsw-alias-state-success-tertiary, rgba(34, 197, 94, .45));
}
.memoir-source {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
}
.memoir-source-link,
.memoir-source-copy {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--dsw-alias-state-business-primary, #2563eb);
  font: inherit;
  cursor: pointer;
  padding: 0;
}
.memoir-source-link {
  max-width: 230px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memoir-source-link:hover,
.memoir-source-copy:hover {
  text-decoration: underline;
}
.memoir-source-copy {
  min-width: 18px;
}
.memoir-score {
  float: right;
  display: inline-block;
  padding: 1px 8px;
  font-size: 10px;
  line-height: 1.6;
  border-radius: 999px;
  border: 1px solid var(--dsw-alias-state-business-primary, #2563eb);
  color: var(--dsw-alias-state-business-primary, #2563eb);
  background: transparent;
  opacity: .8;
}
.memoir-entry-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin-bottom: 2px;
}
.memoir-entry-content {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  white-space: pre-wrap;
  word-break: break-word;
}
.memoir-entry-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 4px 0;
}
.memoir-delete {
  float: right;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 12px;
}
.memoir-delete:hover {
  color: var(--dsw-alias-state-error-primary, #dc2626);
  background: var(--dsw-alias-state-error-secondary, rgba(220, 38, 38, .12));
}

/* Project cards (global tab + ranked grouped results). */
.memoir-project-card {
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 10px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-project-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}
.memoir-project-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-project-path {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .5));
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memoir-project-meta {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  margin-bottom: 6px;
}

/* Empty / status / error. */
.memoir-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 12.5px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .5));
}
.memoir-empty-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin-bottom: 6px;
}
.memoir-empty-hint {
  font-size: 12px;
}
.memoir-error {
  padding: 0;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary, #dc2626);
}

/* --- forms ------------------------------------------------------------------- */

.memoir-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  margin: 0;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 10px;
}
.memoir-form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.memoir-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.memoir-field label {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #5f6672));
}
.memoir-field small {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .55));
  line-height: 1.35;
}
.memoir-field input,
.memoir-field select,
.memoir-field textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  font-family: inherit;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  background: var(--dsw-specific-input-major, var(--bg-card, rgba(0, 0, 0, .02)));
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .15));
  border-radius: 8px;
  outline: none;
}
.memoir-field select {
  height: 30px;
  padding: 0 8px;
}
.memoir-field textarea {
  min-height: 72px;
  resize: vertical;
}
.memoir-field input:focus,
.memoir-field select:focus,
.memoir-field textarea:focus {
  border-color: var(--dsw-alias-state-business-primary, #2563eb);
}
.memoir-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* --- similar-memory resolution --------------------------------------------- */

.memoir-similarity {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--dsw-alias-state-warn-tertiary, rgba(217, 119, 6, .4));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-similarity-title {
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-size: 13px;
  font-weight: 600;
}
.memoir-similarity-candidate {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .12));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-3, var(--bg-panel, #ffffff));
}
.memoir-similarity-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 12.5px;
}
.memoir-similarity-head strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memoir-similarity-duplicate {
  color: var(--dsw-alias-state-warn-primary, #b45309);
}
.memoir-similarity-conflict {
  color: var(--dsw-alias-state-error-primary, #dc2626);
}
.memoir-score-static,
.memoir-similarity-components,
.memoir-similarity-content {
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
  font-size: 11px;
}
.memoir-similarity-content {
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.memoir-similarity-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.memoir-similarity-footer {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

/* --- settings (panel + Settings page card) ----------------------------------- */

.memoir-settings {
  margin: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary, rgba(0, 0, 0, .1));
  padding-top: 8px;
  flex: none;
}
.memoir-settings-slot {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .12));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-3, var(--bg-card, rgba(0, 0, 0, .02)));
  transition: border-color .16s, background .16s;
}
.memoir-settings-slot:hover {
  border-color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .28));
}
.memoir-settings-slot-open {
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .03)));
  border-color: var(--dsw-alias-label-dimmed, rgba(0, 0, 0, .28));
}
.memoir-settings-slot-header {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 12px;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.memoir-settings-slot-header:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-state-business-primary, #2563eb));
  outline-offset: -2px;
}
.memoir-settings-slot-headtext {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.memoir-settings-slot-name {
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}
.memoir-settings-slot-description {
  color: var(--dsw-alias-label-tertiary, var(--text-secondary, #8a8f9c));
  font-size: 13px;
  line-height: 1.5;
}
.memoir-settings-slot-chevron {
  flex: none;
  color: var(--dsw-alias-label-tertiary, var(--text-secondary, #8a8f9c));
  transition: transform .16s;
}
.memoir-settings-slot-chevron-open {
  transform: rotate(180deg);
}
.memoir-settings-slot-body {
  margin: 0 16px;
  padding-bottom: 8px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .12));
}
.memoir-settings-slot .memoir-settings {
  margin: 0;
  padding: 0;
  border-top: none;
}
.memoir-settings-slot .memoir-settings-body {
  margin: 0;
  padding: 12px 0 4px;
  border: none;
  border-radius: 0;
  background: transparent;
  max-height: none;
}
.memoir-settings-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 7px;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, .1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
}
.memoir-settings-description,
.memoir-settings-note,
.memoir-settings-source {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  line-height: 1.45;
}
.memoir-settings-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin-top: 2px;
}
.memoir-settings-switch {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-settings-switch input {
  margin-top: 3px;
  accent-color: var(--dsw-alias-state-business-primary, #2563eb);
}
.memoir-settings-switch span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.memoir-settings-switch small,
.memoir-settings-grid small {
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary, rgba(0, 0, 0, .55));
  line-height: 1.35;
}
.memoir-settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.memoir-settings-grid .memoir-field {
  min-width: 0;
}
.memoir-settings-grid .memoir-field > span {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #6b7280));
}
.memoir-settings-feedback {
  padding: 0;
}
.memoir-settings-success {
  font-size: 12px;
  color: var(--dsw-alias-state-success-primary, #15803d);
}
@media (max-width: 760px) {
  .memoir-settings-grid {
    grid-template-columns: 1fr;
  }
}

/* --- hot memory inspector / diagnostics -------------------------------------- */

.memoir-inspector,
.memoir-diagnostics {
  margin: 0;
  border-top: 1px solid var(--dsw-alias-separator-primary, rgba(0, 0, 0, .1));
  padding-top: 8px;
  flex: none;
}
.memoir-diagnostics-toggle {
  border: none;
  background: transparent;
  color: var(--dsw-alias-state-business-primary, #2563eb);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 0;
  text-align: left;
}
.memoir-diagnostics-toggle:hover {
  text-decoration: underline;
}
.memoir-inspector-body {
  font-size: 11.5px;
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  margin: 6px 0 0;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, .1));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, var(--bg-card, rgba(0, 0, 0, .02)));
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  max-height: none;
  overflow: visible;
}
.memoir-diagnostics-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
}

/* --- sidebar entry row (plain DOM, matches the web-ui family rows) ------------- */

.memoir-entry-row {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 36px;
  padding: 0 10px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: var(--dsw-alias-label-secondary, var(--text-secondary, #8a8f9c));
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
  text-align: left;
}
.memoir-entry-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-specific-sidebar-nav-item-hover, rgba(0, 0, 0, .06)));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
}
.memoir-entry-row[data-active='true'] {
  background: var(--dsw-alias-interactive-bg-active, var(--dsw-specific-sidebar-nav-item-active, rgba(0, 0, 0, .08)));
  color: var(--dsw-alias-label-primary, var(--text-primary, #1f2328));
  font-weight: 600;
}
.memoir-entry-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
}
.memoir-entry-icon svg {
  display: block;
  width: 18px;
  height: 18px;
}
.memoir-entry-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed rail: exact dsh-web-ui-all 0.3.x family geometry. */
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-memoir-entry].memoir-entry-row,
[data-sidebar-collapsed] [data-dsh-memoir-entry].memoir-entry-row {
  border-radius: 50%;
  justify-content: center;
  padding: 0;
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
}
[data-dsh-frame][data-sidebar-collapsed] [data-dsh-memoir-entry] .memoir-entry-label,
[data-sidebar-collapsed] [data-dsh-memoir-entry] .memoir-entry-label {
  display: none;
}

/* --- focus / motion (web-ui family polish) ------------------------------------ */

.memoir-tab:focus-visible,
.memoir-search:focus-visible,
.memoir-primary:focus-visible,
.memoir-iconbtn:focus-visible,
.memoir-delete:focus-visible,
.memoir-status-filter select:focus-visible,
.memoir-diagnostics-toggle:focus-visible,
.memoir-field input:focus-visible,
.memoir-field select:focus-visible,
.memoir-field textarea:focus-visible,
.memoir-entry-row:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary, #2563eb);
  outline-offset: 2px;
}
.memoir-tab,
.memoir-search,
.memoir-primary,
.memoir-iconbtn,
.memoir-delete,
.memoir-status-filter select,
.memoir-diagnostics-toggle,
.memoir-field input,
.memoir-field select,
.memoir-field textarea,
.memoir-entry-row {
  transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, outline-color 120ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .memoir-tab,
  .memoir-search,
  .memoir-primary,
  .memoir-iconbtn,
  .memoir-delete,
  .memoir-status-filter select,
  .memoir-diagnostics-toggle,
  .memoir-field input,
  .memoir-field select,
  .memoir-field textarea,
  .memoir-entry-row {
    transition: none;
  }
}

/* Dark fallback only when the dsw tokens are absent (standalone shells);
   with web-ui-all installed the --dsw-alias-* palette already applies. */
body[data-ds-dark-theme] [data-dsh-memoir-view] {
  background: var(--dsw-alias-bg-base, #16181d);
  color: var(--dsw-alias-label-primary, #e6e6e6);
}
`;

// src/client/index.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var inject = ["sessions", "slots"];
function revealSourceTurn(turnId) {
  if (turnId === void 0) return;
  const reveal = () => document.querySelector(`[data-turn-tail="${turnId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  setTimeout(reveal, 0);
  setTimeout(reveal, 250);
}
function ConversationMemoirView({
  api,
  ctx,
  t,
  sessionId,
  useSessions,
  viewRequest,
  completeViewRequest
}) {
  const cwd = useSessions((snapshot) => snapshot.byId[sessionId]?.cwd ?? "");
  (0, import_react2.useEffect)(() => {
    if (viewRequest?.view === "memoir") completeViewRequest();
  }, [viewRequest, completeViewRequest]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "memoir-native-view", "data-dsh-plugin": "memoir", "data-dsh-part": "conversation-view", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    MemoirPanel,
    {
      api,
      cwd,
      t,
      openSource: (sourceSessionId, turnId) => {
        ctx.sessions.open(sourceSessionId);
        revealSourceTurn(turnId);
      }
    }
  ) });
}
function SettingsMemoirSection({
  api,
  ctx,
  t,
  close,
  useSessions
}) {
  const cwd = useSessions((snapshot) => {
    const current = snapshot.current;
    return current === void 0 ? "" : snapshot.byId[current]?.cwd ?? "";
  });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "memoir-settings-section", "data-dsh-plugin": "memoir", "data-dsh-part": "settings-section", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    MemoirPanel,
    {
      api,
      cwd,
      t,
      onClose: close,
      openSource: (sourceSessionId, turnId) => {
        close();
        ctx.sessions.open(sourceSessionId);
        revealSourceTurn(turnId);
      }
    }
  ) });
}
function apply(rawCtx) {
  const ctx = rawCtx;
  const api = new MemoirApi();
  const t = makeT(document);
  ctx.effect(() => mountPanelStyles(), "dsh-memoir: native alpha styles");
  ctx.effect(() => {
    let disposers = [];
    const register = () => {
      for (const dispose of disposers.splice(0)) dispose();
      disposers = [
        ctx.slots.inject("conversation.view", () => ctx.slots.register({
          name: "conversation.view",
          id: "memoir",
          order: 20,
          label: () => t("entry.label")
        }, (props) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(ConversationMemoirView, { ...props, api, ctx, t }))),
        ctx.slots.inject("settings.section", () => ctx.slots.register({
          name: "settings.section",
          id: "memoir",
          order: 25,
          label: () => t("entry.label")
        }, (props) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(SettingsMemoirSection, { ...props, api, ctx, t })))
      ];
    };
    register();
    const observer = new MutationObserver(register);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => {
      observer.disconnect();
      for (const dispose of disposers.splice(0)) dispose();
    };
  }, "dsh-memoir: native alpha slots");
}
return module.exports;
} });
//# sourceMappingURL=client.js.map
