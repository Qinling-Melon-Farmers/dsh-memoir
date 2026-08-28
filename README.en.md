# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)

[中文](./README.md) · English · [Changelog](./CHANGELOG.md) · [GitHub Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

> [!IMPORTANT]
> This branch is the **source-only adaptation line for DSH `0.1.2-alpha.1`**: branch `alpha/dsh-0.1.2-alpha.1`, source version identity `0.6.0-alpha.1`. It will not be published to npm, tagged, or turned into a GitHub Release. Stable DSH users should keep installing npm `latest` (currently `dsh-memoir@0.5.6`) and must not install this branch on DSH `0.1.1-rc.2`.

**dsh-memoir is a local project-memory layer for DeepSeek Harness: it persists an agent's work conclusions, lessons learned, and next actions, then carries them across sessions through bounded Hot Memory injection, on-demand ranked recall, and Web GUI management.**

> Cache-aware local project memory for DeepSeek Harness.

- **Local-only** — all data stays on your machine (`~/.dsh/dsh-memoir.json` + per-project `PROJECT_MEMORY.md`)
- **Zero regular runtime dependencies** — the npm package has no `dependencies`; its core relies only on DSH platform contracts and the Node.js standard library
- **Zero external memory service** — no vector database, no embedding API, no cloud memory service
- **Bounded hot-memory injection** — token-budgeted Hot Memory is injected into the system prompt (default 900/1200)
- **Ranked local recall** — inverted index + BM25 local ranked retrieval; `memoir_read` fetches long-tail history on demand
- **Traceable and duplicate-aware** — trusted session/turn provenance plus explainable pre-write duplicate/conflict candidates; the caller explicitly updates, supersedes, or keeps both
- **Web GUI** — complete lifecycle editing, project/global browsing, BM25 search, Hot Memory, diagnostics, and live settings; this alpha branch uses native DSH Memoir Conversation and Settings surfaces with live Chinese/English switching

## Compatibility and update channels

| Channel | dsh-memoir | DSH | Install and update path |
| --- | --- | --- | --- |
| Stable | npm `latest` (`0.5.6`) | `0.1.1-rc.2` | npm, dshmarket, or plugins-manager; always the stable line |
| Alpha source | `alpha/dsh-0.1.2-alpha.1` (source identity `0.6.0-alpha.1`) | source tag `dsh-v0.1.2-alpha.1` or a later compatible alpha | manual clone/build/link only; never enters npm updates |

`package.json#dsh.engines.dsh` explicitly requires `>=0.1.2-alpha.1`. If a source/Git updater exposes `0.6.0-alpha.1`, it is a **DSH-alpha-only source update**: switch and build DSH to a compatible alpha first. dshmarket and the integrated plugins-manager continue to resolve npm `latest`, so stable users are not offered this source alpha.

## Quick Start

### Stable users

```bash
# npm, dshmarket, and plugins-manager all remain on the stable channel
dsh plugin --profile web add dsh-memoir@latest
```

### DSH Alpha source users

Prepare the official DSH alpha checkout first:

```bash
git clone --branch dsh-v0.1.2-alpha.1 --depth 1 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install --frozen-lockfile
pnpm run build
```

Then clone and build the Memoir alpha branch:

```bash
git clone --branch alpha/dsh-0.1.2-alpha.1 https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
```

Finally, link the checkout into an isolated `web` profile from the official DSH source directory:

```bash
cd /absolute/path/deepseek-harness
pnpm dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
pnpm dsh web
```

For later updates, run `git pull --ff-only` and rebuild in both checkouts. This path neither downloads nor increments an npm alpha package. Memory remains in `$DSH_HOME/dsh-memoir.json` and each project's `PROJECT_MEMORY.md`; switching the client adapter does not migrate, clear, or rewrite existing memories.

After installation and startup, use it normally:

```text
use the Agent as usual
      ↓
end of each worked turn: an automatic distill reminder
      ↓
memoir_record persists work / lessons / next steps
      ↓
future sessions auto-inherit Hot Memory (bounded, ranked, frozen per session)
      ↓
need long-tail history? memoir_read (local relevance-ranked recall)
```

## Architecture

```text
                   ~/.dsh/dsh-memoir.json
                            │
                            │ SSOT (single source of truth)
                            ▼
                      MemoirStore
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
        PROJECT_MEMORY.md          Retrieval Index
         human-readable             ranked recall
         (git-committable)                │
              │                           ▼
              │                       memoir_read
              │                       GUI /search
              │
              ▼
       Hot Memory Selector
         (token budget)
              │
              ▼
       Session Snapshot
         (frozen per session)
              │
              ▼
         System Prompt
```

## Memory Model: Full Memory vs Hot Memory

**Full Memory (complete history)** — the structured JSON SSOT plus the regenerated `PROJECT_MEMORY.md` projection. Used for: complete history, GUI browsing, git commits, manual inspection, and as the source data for ranked recall.

**Hot Memory (bounded injection)** — high-value memories selected by the selector within a token budget, injected into the system prompt. Properties: **bounded / ranked / compact / session-frozen**.

> v0.4+ no longer injects the full PROJECT_MEMORY.md into the model: Hot Memory goes to the prompt, long-tail history goes through ranked recall.

**Session Snapshot freezing semantics**: one session's injected text is built once and frozen (stable prompt prefix, maximizing prompt-prefix cache hits); the current session does not re-consume memory it just wrote, and a new session rebuilds and sees the latest memory. Since v0.4.2, when there is no unique session identity (session.id / agent.id), freezing is skipped — a cache miss beats wrongly reusing another session's snapshot.

## v0.6.0-alpha.1: native DSH Alpha UI adaptation

- Removed the deleted `dsh-client-runtime` dependency and selector-based DOM mounting; this line no longer takes over the legacy dsh-web-ui sidebar.
- Registers a native Memoir Conversation page through `conversation.view` and a native Memoir Settings page through `settings.section`; the DSH shell owns navigation and layout.
- Memory CRUD, provenance navigation, lifecycle management, similar-memory governance, BM25, Hot Memory, auto-distill, cache diagnostics, and live settings keep using the established implementation.
- Store and settings paths now fully honor `DSH_HOME`, with `~/.dsh` retained as the unset fallback. Store v4/settings v2 remain unchanged, so no data migration runs.
- This is a source compatibility branch, not a release. Stable screenshots and v0.5.x notes remain as historical capability records.

## v0.5.6 Provenance, similar-memory governance, and Web UX

- Store format v4 records trusted `source.sessionId` / `source.turnId` for Agent writes. Legacy top-level `sessionId` values remain lazily readable and are persisted in the new shape only on a real subsequent write.
- Entry cards can copy provenance and make a best-effort jump to the source session/turn; manual browser writes cannot spoof trusted provenance.
- Before `memoir_record` or a manual Web add mutates data, the existing BM25 engine supplies candidates and title similarity plus Token Jaccard rerank them. Only suspected duplicates/conflicts are shown; nothing is changed automatically.
- A surfaced candidate requires an explicit `update`, `supersede`, or `force-record` decision. The UI explains BM25/title/Jaccard components and reasons, and a resolution target must belong to the current candidate set.
- The Memoir item under Settings → Web UI Plugins now matches the dsh-web-ui family card and starts collapsed. The Memory panel has one vertical scroll region, so expanded settings, Hot Memory, and diagnostics remain continuously scrollable.
- The release workflow always tries npm OIDC first and uses `NPM_TOKEN` only as an ephemeral fallback; an expired legacy token can no longer take precedence over healthy trusted publishing.

## v0.5.5 Sidebar visual-parity fix

- Fixed the stylesheet-marker collision: another style carrying the same generic `data-plugin` value no longer makes Memoir skip its own CSS. The owned stylesheet has a unique `data-dsh-memoir-style` marker and is removed on plugin unload.
- Matched dsh-web-ui-all 0.3.x task-board and skill-center sidebar geometry: 36px row height, 10px horizontal padding, a 24px icon box, an 18px SVG, and an 8px icon-label gap.
- The collapsed rail now uses the same 36px circular control and 12px row spacing, hiding copy while preserving localized `aria-label` and tooltip text; the open-book glyph remains distinct from Skill Center.
- Playwright runtime assertions compare expanded and collapsed row/icon/svg/label coordinates, box sizes, typography, and color instead of relying on screenshots alone.

## v0.5.4 Complete GUI, bilingual settings, and Web UI integration

- The development and peer-dependency baseline is `@deepseek-ai/dsh-* 0.1.1-rc.2`.
- Add/edit forms now cover `importance`, `pinned`, `tags`, and `supersedes`; cards expose importance, tags, and replacement relationships, with a new section filter.
- Memory Settings now appears both inside the Memory panel and under Settings → Web UI Plugins. It covers agent injection, auto-distill, Hot Memory, recall, session snapshots, and the BM25 query cache.
- Every saved setting applies live and persists in `~/.dsh/dsh-memoir.settings.json`; version-1 settings remain readable and upgrade to version 2 only on the next save.
- The GUI follows DSH's `<html lang>` and switches between Chinese and English without a reload, including the sidebar entry, panel, and Settings card.
- The panel and sidebar emit `data-dsh-plugin="memoir"` / `data-dsh-part` semantic attributes for the dsh-web-ui v0.3 skin contract. Sidebar mounting is idempotent and self-heals after a complete shell rebuild.
- Center-panel coordination now responds to any sibling through the generic `dsh-panel-activate` protocol instead of recognizing only SSH and Task Board.
- Auto-distill retains per-agent worked-turn intervals, time cooldowns, and tool-call thresholds; defaults `1 / 0 / 1` preserve prior behavior.
- Store format v3 migrates v2 entries without changing their `id`, content, or timestamp. The first mutation materializes `importance`, `pinned`, `status`, `supersedes`, and `tags`; startup reads do not rewrite old files.
- Retrieval defaults to `active`. Archived and superseded history is retained and can be inspected from the Web panel. Explicit `supersedes` marks its targets as superseded; history is never deleted automatically.
- Agents can use `memoir_update` to edit an entry's section, title, content, and lifecycle in place; the Web panel also supports editing, pinning, marking superseded, archiving, and restoring.
- `PROJECT_MEMORY.md` is a human-readable projection. Only bounded Hot Memory enters the system prompt; the full file is not injected.
- GET routes no longer register browser-supplied paths as active workspaces. Only the trusted system-prompt cwd grants panel write authorization. Lock metadata now includes pid, creation time, and nonce, with conservative reclaim only after 60 seconds and a dead owner.
- `memoir_read(scope: 'all')` uses a deduplicated global ranking so project and global results are not repeated.

## Tools

| Tool | Purpose |
| --- | --- |
| `memoir_record` | write work / lessons / actions / note entries; preflight similar memories and explicitly `update`, `supersede`, or `force-record` |
| `memoir_update` | edit an existing entry while preserving its id and creation time; update content, tags, lifecycle, or explicitly supersede history |
| `memoir_read` | local relevance retrieval across project (default) / global / all, with limit and compact/full output shapes |

`memoir_read`'s query description matches its real behavior: **local relevance retrieval over titles and content — supports Chinese phrases, English keywords, code identifiers, and paths, ordered by relevance**.

## Retrieval

- No embeddings, no vector database, no external memory service
- Tokenization: Chinese 2/3-grams + English words + code/path identifiers
- BM25 (documents keep true term frequency; queries are deduplicated)
- 2.5× title boost, exact-phrase boost, section weight, recency decay
- Separate length normalization for titles and bodies (v0.4.2)
- Epoch-aware LRU query cache with 1-hour time buckets: limit/detail stay out of the cache key, so every output shape shares one ranked result (v0.4.2)
- Query-cache metrics (hits/misses/evictions/hit rate) and Last Query (latency/candidates/returned) observability (v0.4.2)
- Global recall limit is a true global Top-K; output truncation preserves the top-ranked head (v0.4.2)
- Pre-write governance takes the current project's active BM25 Top-24 candidate set, then combines query-relative BM25, title similarity, and Token Jaccard; at most five explainable candidates are returned (v0.5.6)

Curated-query Top-5 hit rate: 100% (quality gate ≥ 90%, see `test/recall-quality.test.ts`).

## GUI

The Project / Global / Search / Add / Delete / Diagnostics architecture now forms a complete management surface:

- **Search unified on RetrievalEngine**: a non-empty query calls `GET /api/dsh-memoir/search` — the same BM25 ranking as the agent's `memoir_read` — results ordered by relevance with scores shown
- **Hot Memory Inspector**: expand to see the Hot Memory that will actually be injected for the current workspace (Actions / Lessons / Recent state) — i.e. "what exactly the next session inherits"
- **Retrieval Diagnostics**: Retrieval Index (docs/terms/epoch), Query Cache (hits/misses/evictions/hit rate/size/capacity), Last Query (latency/returned), Session Snapshot (hash/createdAt/storeRevision)
- **Complete lifecycle forms (v0.5.4)**: add and edit section, title, content, importance, pinning, tags, and explicit replacement relationships; filter by status and section
- **Complete live settings (v0.5.4)**: adjust agent injection, auto-distill, Hot Memory target/hard limits, recall defaults/maxima, session snapshots, and query cache immediately
- **Settings integration (v0.5.4)**: the same bilingual card mounts in the Memory panel and Settings → Web UI Plugins, and redraws immediately when the page language changes
- **Visual parity with the dsh-web-ui family (v0.5.5)**: the panel, sidebar entry, forms, cards and tabs ride the `--dsw-alias-*` / `--dsw-specific-*` / `--dsw-font-family` design tokens (with standalone fallbacks), matching the task-board / ssh / skill-explorer panels shipped by dsh-web-ui-all; the center-column panel mutual-exclusion protocol is aligned too.
- **Provenance and similar-memory governance (v0.5.6)**: display/copy/jump session and turn provenance; new records expose duplicate/conflict candidates, three score components, reasons, and three explicit resolution actions
- **Settings and scrolling fix (v0.5.6)**: the Settings card starts collapsed and follows the family card structure; the panel keeps one scroll owner across the list, settings, Hot Memory, and diagnostics

## Screenshots

**v0.5.6 Settings card**: the Memoir item under Settings → Web UI Plugins starts collapsed and matches sibling title, description, spacing, radius, and chevron geometry.

![v0.5.6 Settings card](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-settings-card-zh.png)

**v0.5.6 continuous scrolling**: Memory Settings, Hot Memory preview, and diagnostics share the panel's only scroll region. The Hot Memory text shown here is a redacted demonstration.

![v0.5.6 continuous Memory-panel scrolling](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-memory-scroll-zh.png)

**v0.5.5 sidebar parity**: Memory now matches Task Board, SSH, and Skill Center in row height, horizontal position, icon box, and SVG size.

![v0.5.5 sidebar parity](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.5/picture/v0.5.5-sidebar-parity-zh.png)

**v0.5.4 memory management**: importance, tags, replacement relationships, status/section filters, and lifecycle actions in one panel.

![v0.5.4 memory management](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.4/picture/v0.5.4-memory-management-zh.png)

**v0.5.4 complete live settings**: the English Settings → Web UI Plugins card, switched live from the same Chinese-capable GUI.

![v0.5.4 complete live settings](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.4/picture/v0.5.4-settings-en.png)

The following screenshots retain the feature history of earlier releases:

**1. Plugin active & overall UI**: the sidebar gains a "Memory" entry (alongside SSH / Task Board, mutually exclusive panels); clicking opens the memory panel in the center column.

![Plugin active & overall UI](picture/插件生效和UI效果1.png)

**2. Project memory**: the current project session's persistent memory grouped into Work Log / Lessons Learned / Action Guide / Notes; each entry shows time, section chip, title, content, and session origin, with search, refresh, and per-entry delete.

![Project memory](picture/项目记忆2.png)

**3. Manually adding memory**: a form to pick a section, a one-line title, and content — written to the same data the agent's `memoir_record` writes; PROJECT_MEMORY.md regenerates automatically after submit.

![Manually adding memory](picture/手动添加记忆3.png)

**4. Global memory management**: memory buckets for all projects (name, path, updated time, count) with cross-project search and per-entry maintenance.

![Global memory management](picture/全局记忆管理4.png)

**5. Ranked search + Hot Memory Inspector + Memory Diagnostics (v0.4.2)**: a typed query triggers RetrievalEngine-ranked recall with a relevance score on each result; at the bottom you can expand the Hot Memory Inspector (what the next session will inherit for the current workspace) and the extended Memory Diagnostics (Retrieval index / Query cache / Last query / Session snapshot).

![Ranked search with Hot Memory Inspector and Memory Diagnostics](picture/hot%20memory预览与记忆诊断5.png)

## Storage & Privacy

```text
~/.dsh/dsh-memoir.json        ← structured JSON v4 (SSOT with trusted session/turn provenance)
~/.dsh/dsh-memoir.settings.json ← complete runtime overrides saved by either GUI settings surface
<workspace>/PROJECT_MEMORY.md ← human-readable projection regenerated from the JSON (git-friendly)

No cloud memory DB · No embedding API · No vector DB
```

JSON is the source of truth and Markdown is the generated projection: the panel, the tools, and the agent write the same data. Since v0.4.2 the panel write API is also workspace-authorized — an absolute path submitted by the browser is not authorization by itself; only the current active cwd or an existing store project can be written to.

## Configuration

Add a `config` block on the plugin row in `cordis.patch.yml` (all optional; defaults shown):

```yaml
- insert:
    - id: memoir
      name: dsh-memoir
      config:
        enabled: true            # master switch (tools, routes, prompt section)
        announceToAgent: true    # system-prompt announcement section
        autoDistill: true        # auto distill reminder after each worked turn
        autoDistillEvery: 1      # remind at most once per N worked turns
        autoDistillCooldownMin: 0 # require M minutes between successful reminders
        autoDistillMinTools: 1   # triggering turn must contain at least K tool calls
        hotMemoryTokens: 900     # Hot Memory target tokens
        hotMemoryMaxTokens: 1200 # Hot Memory hard ceiling (never exceeded)
        readDefaultLimit: 8      # memoir_read default result count
        readMaxLimit: 30         # memoir_read maximum result count
        sessionSnapshotMax: 128  # per-session snapshot LRU cap
        queryCacheSize: 128      # ranked-query LRU cache size
```

The three auto-distill frequency conditions are combined with AND and isolated per agent. Idle, aborted, subagent, and prior-`memoir_record` turns do not advance the interval. A worked turn below `autoDistillMinTools` advances the interval but cannot trigger by itself. Cooldown changes only after a successful steer.

Fields in `cordis.patch.yml` remain startup defaults. Since v0.5.4, the Memory panel or Settings → Web UI Plugins can edit every runtime field except the master `enabled` switch. Saving atomically writes `~/.dsh/dsh-memoir.settings.json`; subsequent requests and turns read the new values immediately, and shrinking snapshot/query-cache capacities evicts the oldest entries at once. Already frozen session snapshots are not rewritten when budgets change, preserving prompt-prefix cache stability. Restore Startup Config removes the Web override and returns to the profile values resolved when the plugin mounted.

## Design Trade-offs

- **Bounded vs full injection**: v0.3 injected the full history into the prompt and it kept growing; v0.4+ injects only budgeted Hot Memory, with long-tail history recalled on demand. Token benchmarks below.
- **Frozen vs fresh**: within a session the injected text is frozen to gain prompt-prefix cache hits; without a unique session identity it is not frozen (v0.4.2), so new sessions always see new memory.
- **Hot Memory quota**: Recent state (newest work, 1–3 entries) is guaranteed a floor, actions/lessons fill by ranking, and work only appears in Recent state — never injected twice (v0.4.2).
- **Multi-process safety**: store record/remove runs inside a cross-process critical section on `~/.dsh/dsh-memoir.lock` (exclusive O_EXCL creation with timeout); the section force-reloads from disk before mutating, so two interleaved DSH processes lose no updates (v0.4.2).
- **Windows paths**: canonical keys are fully lowercased (`C:\A` / `c:\a\` / `C:/A` share one bucket) while display paths keep the original casing (v0.4.2).
- **GUI and Agent share one engine**: panel search and `memoir_read` use the same RetrievalEngine instead of separate filter logic (v0.4.2).
- **Auto-distill cadence**: the default still reminds after every worked turn; research-heavy sessions can combine interval, cooldown, and activity thresholds and tune them immediately from either GUI settings surface (v0.5.4).
- **Similarity governance, not automatic merging**: lexical similarity can identify candidates but cannot reliably decide semantic truth, so v0.5.6 always requires an explicit update, supersede, or keep-both choice.

## Use Cases

| Scenario | How to use it |
| --- | --- |
| Recurring environment pitfalls (encoding / escaping / paths / permissions) | record a `lessons` entry with copy-pasteable fix commands |
| Project rules and conventions (no emoji, run tests before release, branch policy) | record as `actions`, auto-injected for whoever takes over |
| Root cause of a hard-to-find bug | record as `lessons` / `work` to avoid re-investigation |
| Fixed deployment/release checklist | record as `actions`; new sessions follow it |
| Reuse experience across projects | global tab or `memoir_read(scope: 'global', query: ...)` |

Typical example: after solving "console Chinese mojibake" the first time, record the diagnosis and fix commands as a `lessons` entry (e.g. `chcp 65001 first … always write UTF-8 without BOM`); every new session in this project then inherits the lesson automatically instead of re-debugging, and cross-project global search hits it too. The memory plugin distills "root cause + fix command" into project knowledge — it does not fix the terminal's own encoding defects.

## Comparison

| Project | Primary focus |
| --- | --- |
| dsh-memory | citation / source-traceable reference memory |
| dsh-mnemon | a heavier long-term memory system |
| distill | distilling sessions into skills |
| **dsh-memoir** | **lightweight project workflow memory: local, bounded injection, ranked recall** |

Each plugin has its own focus — pick per need; no "which is stronger" narrative.

## Development / Benchmark / Tests

```bash
pnpm install          # install devDeps (typescript, esbuild, @deepseek-ai/* type packages)
pnpm run build        # tsc builds the host + esbuild builds the client bundle
pnpm run typecheck    # full type check (src + test)
pnpm test             # 171 tests: store/migrations/lock, settings, snapshot, selector, BM25/similarity governance, tools/routes, auto-distill, GUI/scrolling/bilingual behavior, integration, bundle, and release notes
npm run bench         # benchmark (100/1k/10k/100k entries); results written to bench/report.md
```

Quality gates: **Top-5 recall ≥ 90% · Hot Memory ≤ configured hardMax · same-session prompt-prefix stability · global recall ≤ limit · zero lost updates across processes**.

v0.5.6 benchmark summary (2026-08-27, node v24.19.0, budget 900/1200 tokens; full report in `bench/report.md`. Uncached queries measure `search()` directly; cached queries warm the same query first, then time it):

| Entries | Cold load | Warm read | Hot Memory build | Index build | Uncached query | Cached query | Cache hit rate | Full markdown tokens | Injected tokens | Reduction |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 0.9 ms | 0.95 µs | 0.46 ms | 2.1 ms | 0.169 ms | 2.21 µs | 50.0% | 3908 | 902 | 76.9% |
| 1,000 | 3.0 ms | 0.35 µs | 0.58 ms | 10.5 ms | 1.190 ms | 4.07 µs | 50.0% | 38220 | 916 | 97.6% |
| 10,000 | 26.4 ms | 0.35 µs | 2.05 ms | 126.9 ms | 11.011 ms | 1.45 µs | 50.0% | 385845 | 902 | 99.8% |
| 100,000 | 210.7 ms | 0.51 µs | 20.11 ms | 1679.9 ms | 126.933 ms | 1.42 µs | 50.0% | 3907095 | 917 | 100.0% |

## Implementation

- **Full-stack TypeScript**: `src/host/*.ts` (store / settings / tools / retrieval / similarity / governance / selector / snapshot / routes / autodistill / index — tsc emits `lib/*.js`) + `src/client/*.ts(x)` (esbuild emits the `lib/client.js` closure-factory bundle).
- **Two-sided plugin**: the host half registers the agent tools, `/api/dsh-memoir` routes, the `agent/turn-stopping` auto-distill listener, and the per-project system-prompt injection section; the client half renders the panel. Runtime deps are official NPM SDK packages only.
- Mounted via the `dsh.bundle.patch` manifest (`insert` row in `cordis.patch.yml`); no DSH source changes.
- Auto-distill safety boundaries: top-level sessions only (subagents / nested delegations skipped), turns with tool activity that haven't recorded yet, aborted turns skipped, at most one steer per turn.

## Contributing

PRs and issues are managed with templates and automation:

- [CONTRIBUTING.md](CONTRIBUTING.md) — PR scope, commit conventions and checklist;
- [ISSUE_TRIAGE.md](ISSUE_TRIAGE.md) — issue labels, classification and closing criteria;
- `.github/ISSUE_TEMPLATE` — bug / request templates; `.github/pull_request_template.md` — PR template.

Bug reports must include screenshot / log evidence, a smoke test, code references and a patch. New features and documentation-only PRs must first be discussed in an issue.

## Release

Current stable release: **v0.5.6** (2026-08-27) · [GitHub Release](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.6) · [npm](https://www.npmjs.com/package/dsh-memoir/v/0.5.6). Full history is in [CHANGELOG.md](./CHANGELOG.md).

Every version keeps Chinese and English release notes in sync. GitHub Releases show Chinese by default and place the English notes in a collapsible `English` section.

Version releases run automatically in `.github/workflows/publish.yml` when a `v*` tag is pushed: install deps, verify the tag matches the `package.json` version, run typecheck/test, publish to npm, then create a same-tag GitHub Release with the tarball asset. Authentication is OIDC-first with a token fallback:

- npm Trusted Publishing: GitHub repo `Qinling-Melon-Farmers/dsh-memoir`, workflow `publish.yml`
- GitHub Actions secret `NPM_TOKEN`: optional fallback, using a granular token with publish rights and 2FA bypass; it is read only if OIDC fails and the version is still unpublished

Publishing a patch release:

```bash
npm version patch
git push
git push origin vX.Y.Z  # use the actual version printed by npm version
```

`npm version patch` updates `package.json`, creates the version commit and the tag; no manual `git tag` or local `npm publish` needed.

## License

Apache-2.0
