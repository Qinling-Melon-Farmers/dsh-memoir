# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![npm downloads](https://img.shields.io/npm/dm/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![CI](https://github.com/Qinling-Melon-Farmers/dsh-memoir/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Qinling-Melon-Farmers/dsh-memoir/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-memoir.svg)](./LICENSE)

[中文](./README.md) · English · [Changelog](./CHANGELOG.md) · [Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**A local-first, cross-session project-memory plugin for DeepSeek Harness (DSH).** It persists an agent's confirmed work, lessons, and next actions, injects bounded cache-friendly Hot Memory into new sessions, and retrieves long-tail history through local BM25 ranking.

No embeddings, vector database, or cloud memory service. The npm package has zero bundled runtime dependencies; DSH and Zod 4 peers are supplied by the host environment; Zod validates session projections and is not bundled.

> [!WARNING]
> **Session recovery issue #14 affects legacy receipts written by 0.8.1–0.9.0.** `main` no longer emits the unsupported event; this is not yet an npm package update. Stop memory writes from affected versions until using a fixed build; disabling auto-distillation alone does not stop manual tool writes. Preserve your original sessions and memory data. Follow the [recovery guide](./SESSION_RECOVERY.md#english) to audit first, then stop all hosts and back up before repair. Do not delete logs or downgrade their format.
> The fix covers official DSH `0.2.0-rc.1` / `0.2.0-rc.2`; upgrading DSH alone does not fix the old plugin or repair affected logs.

> [!IMPORTANT]
> **0.9.0 requires DSH `>=0.2.0-rc.1 <0.3.0-0`**, built and tested against the published `0.2.0-rc.1` (not an unqualified final 0.2.0 release). Adds a visible plugin guide, native plugin configuration, German/Russian agent copy and offline release highlights. Retains separate distillation turns, provenance, frozen snapshots and zero bundled runtime dependencies. **On DSH 0.1.7, pin `dsh-memoir@0.8.2`; upgrade the host before installing 0.9.0.**
>
> `dsh-memoir@0.7.1` fixes lost session snapshots after restart or RAM eviction (#10), supporting DSH **0.1.5-rc.1 / rc.2**. It requires `>=0.1.5-rc.1 <0.1.6-0`; check your host first. Keep `0.6.2` on DSH 0.1.2, or `0.5.6` on DSH 0.1.1-rc.2; those older lines do not include this fix.

```bash
npm install --global @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add dsh-memoir@0.9.0
```

Restart `dsh web`. Memory remains local and is not automatically deleted when the plugin is updated or removed.

## Why dsh-memoir

| Capability | What you get |
| --- | --- |
| Local-first storage | A JSON single source of truth plus per-project `PROJECT_MEMORY.md`; no memory upload or external service |
| Automatic distill reminder | Reminds the top-level agent after a worked turn, then persists transparently through `memoir_record`; skips idle, aborted, subagent, and already-recorded turns |
| Bounded Hot Memory | Only high-value memory enters the system prompt under a hard token limit; a frozen session prefix improves prompt-prefix cache hits |
| BM25 ranked recall | Searches Chinese phrases, English keywords, code identifiers, and paths; cross-project Top-K and query LRU caching use one engine |
| Governable memory | Importance, pinning, tags, archive/restore, and supersede lifecycle; similar writes require an explicit update, replacement, or keep-both decision |
| Provenance | Agent writes retain trusted session/turn sources; the Web panel can copy and make a best-effort jump to the original session |
| Complete Web GUI | Bilingual project/global browsing, ranked search, editing, Hot Memory inspection, diagnostics, and live settings, with an independent agent-facing language choice |

It fits personal and local development workflows where a new agent should continue understanding a project. It is not a raw chat backup, multi-user cloud sync service, or vector-semantic knowledge base.

### UI preview

**0.9.0 component preview with demonstration data.** Plugin identity, GitHub, documentation and memory settings stay at the top, before long lists.

![0.9.0 UI preview: visible plugin guide and memory browsing](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-preview-guide-zh.png)

## How it works

```text
worked turn
    │  automatic distill reminder
    ▼
memoir_record / memoir_update
    │
    ├── ~/.dsh/dsh-memoir.json       complete structured history (SSOT)
    ├── <project>/PROJECT_MEMORY.md   readable, committable projection
    └── Retrieval Index              inverted index + BM25 + query cache
              │
              ├── Hot Memory Selector ──> bounded system-prompt injection
              └── memoir_read / Web ────> on-demand long-tail recall
```

Complete history and Hot Memory are separate layers:

- **Full Memory** retains every record for the GUI, human review, Markdown projection, and ranked retrieval.
- **Hot Memory** selects only budgeted actions, lessons, and recent state; the full `PROJECT_MEMORY.md` is never injected.
- **Session Snapshot** durably freezes injected text per session and restores it after restart or RAM eviction. New writes remain immediately readable by tools and the GUI; automatic injection refreshes in the next new session. Recovery failures explicitly report degraded persistence.

### Snapshot recovery and cleanup (0.7.1)

- Default directory: `$DSH_HOME/dsh-memoir.json.snapshots/`, or `<storePath>.snapshots/` with a custom store. Records are partitioned by data-source/settings hash, language, and session hash. They load on demand without scanning the whole directory at startup.
- `sessionSnapshotMax` bounds RAM only. Disk records have no automatic TTL and survive shrinking, uninstalling, or clearing RAM. Include them in backups. To reclaim disk, stop the relevant DSH processes, back up first, and manually remove records you no longer need to resume. Access after removal establishes a new baseline.
- Languages use separate namespaces; switching back restores the original baseline for that language. Budget changes affect new baselines only. Forks/new session IDs do not inherit the parent's frozen record.
- Old sessions whose snapshots were lost before upgrading establish a baseline from current memory once. Memoir does not guess or slice original text out of historical system prompts. Corrupt, inaccessible, or locked records remain unchanged; fallback freezes only in the current process, with diagnostics and a log warning.
- Text is capped at 256 KiB and each record at 2 MiB; exceeding either reports the same degradation. New POSIX directories/files use 0700/0600; Windows access remains governed by directory ACLs. Snapshot files contain memory text and are user data.
- This fix prevents rebuilding recoverable snapshots; it cannot guarantee provider KV-cache retention or hit rates.

## Agent tools and memory lifecycle

| Tool | Purpose |
| --- | --- |
| `memoir_record` | Write work / lessons / actions / note entries; returns explainable similar/conflicting candidates before mutation |
| `memoir_update` | Preserve id and creation time while updating content, section, importance, tags, and lifecycle |
| `memoir_read` | Local ranked recall across project (default) / global / all with compact or full output |

Each entry has importance 1–5. The default, **3**, is neutral; pinning adds separate Hot Memory weight. Recall defaults to `active`. Archived or superseded history remains inspectable and restorable and is never deleted automatically.

Similar-memory governance starts with BM25 candidates, then combines title similarity and Token Jaccard. The plugin surfaces suspected duplicates or conflicts but does not decide truth on its own. The caller must choose:

- `update`: update an existing record in place;
- `supersede`: retain old history and mark it as replaced by the new record;
- `force-record`: explicitly keep both.

## Automatic distillation

0.8.2 diagnostics distinguish reminders, persistence, failures, cancellation, unresolved similarity, and unavailable receipts. Only persisted `memoir_record` / `memoir_update` operations suppress reminders; failed calls or unresolved candidates do not count as saves. Host cancellation may follow persistence, so counters can overlap. Correlation with a reminder proves neither causation nor semantic correctness. GUI writes are excluded from Agent-tool counters.

0.8.2 uses public `sessionProjections` to reconstruct current-turn activity from logs and checkpoints without deprecated `snapshotEvents()` reads. Each session retains at most 4096 current-turn call IDs, without arguments or content; evicted IDs degrade to session-only provenance. Gate state is capped at 1024 agents and cleared on disposal. Legacy writes have no receipts: a historical call alone cannot prove persistence. BM25 remains lexical retrieval, not guaranteed cross-language semantic matching.

Automatic distillation is an observable agent turn-end reminder, not silent background scraping of every chat. The default `1 / 0 / 1` means every eligible worked turn, no extra cooldown, and at least one tool call.

> **0.8.2 fixes distillation-induced answer folding for new turns ([#13](https://github.com/Qinling-Melon-Farmers/dsh-memoir/issues/13)):** The public `followup` API queues a separate memory wrap-up turn instead of using same-turn `steer`. A short receipt, empty output or failed wrap-up tool cannot change the original task answer’s turn boundary. Memory provenance still points to the source work turn. Wrap-up turns neither advance the worked-turn cadence nor recursively trigger distillation. This is still visible, cancelable model work—not a free background task—and may increase the displayed turn count.
>
> Upgrading does not rewrite history. For same-turn folding already recorded by 0.8.0 / 0.8.1, expand the process disclosure or use Normal (`normal`) transcript mode. This fix does not change DSH’s answer selection for arbitrary same-turn continuations from other producers, and does not rely on a “remain silent” prompt.

`autoDistillEvery`, `autoDistillCooldownMin`, and `autoDistillMinTools` are AND conditions isolated per agent. Idle, aborted, subagent, and already-recorded turns do not trigger. Cooldown advances only after a successful reminder. All cadence parameters are live-editable in the GUI.

`language` independently controls agent-visible tool descriptions and parameters, the distillation prompt, tool results, Hot Memory / `PROJECT_MEMORY.md` headings, and validation or governance errors. Released 0.8.2 supports `zh` / `en`, defaulting to `zh`. Tool descriptions and subsequent prompts update live without restarting DSH.

**0.9.0 adds `de` (Deutsch) and `ru` (Русский)**, explicitly selected in Memory settings rather than inferred from the agent or user messages. Tool names, parameter keys and enums remain unchanged. The GUI remains Chinese/English and existing memory content is not automatically translated. Switching language alone does not rewrite JSON or Markdown; projection headings use the current language on subsequent normal writes. Each of the four languages has its own frozen-snapshot namespace; switching back reuses the previous baseline. Select `zh` or `en` before downgrading to 0.8.2.

## Local recall and caching

- Chinese 2/3-grams, English words, and code/path identifier tokenization;
- document-side BM25 keeps true term frequency, with a 2.5× title boost plus exact-phrase, section, and recency weighting;
- separate title/body length normalization;
- deduplicated global Top-K shared by project / global / all;
- epoch-aware LRU query cache with one-hour time buckets; `limit` and output detail stay outside the key so output shapes share rankings;
- the GUI and `memoir_read` use the same RetrievalEngine and expose hits, misses, evictions, hit rate, and last-query latency.

0.9.0 extends word splitting to Unicode letters, combining marks and numbers with NFC normalization, preserving German umlauts and Russian Cyrillic. Original content and existing Chinese/code-identifier rules are preserved. This remains lexical retrieval, not automatic translation, stemming or cross-language semantic search.

Top-5 recall on the fixed quality set is 100%; the repository gate requires at least 90%.

## Web GUI

Installing into a compatible DSH `web` profile registers a native Memory Conversation view and Memory Settings section through official slots. The DSH shell owns layout, navigation, and unload lifecycle; Memoir no longer takes over the legacy sidebar through DOM selectors.

- Project memory and all-project global memory, with project groups collapsed by default and complete lifecycle totals;
- status, section, and keyword filters with BM25 scores;
- add, edit, pin, archive, restore, and supersede;
- copy and best-effort navigation for session/turn provenance;
- Hot Memory Inspector: what the next session will inherit;
- Retrieval Diagnostics: index, query cache, last query, and session snapshot;
- permanent `Browse / Settings / Hot Memory / Diagnostics` navigation with an independent bounded scroll position per surface;
- progressive batches of 20 entries or projects, plus a controlled six-line preview for long memory bodies;
- the native DSH composer-overlay contract, keeping the final memory visible above the conversation composer while the list scrolls fully;
- arrow-key, Home, and End navigation for surface tabs, plus `aria-expanded` project disclosures and visible focus states;
- live GUI Chinese/English switching from `<html lang>`, with a separate `language` setting for agent-facing copy.

<details>
<summary>0.9.0 UI previews: native plugin configuration and language settings</summary>

The native plugin detail page reuses Memory settings directly, without opening the memory list. Shown below is the native plugin detail page in DSH 0.2.0-rc.1.

![0.9.0 native plugin detail configuration](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-host-plugin-zh.png)

Choose German agent-facing copy independently of the English GUI; settings and memory browsing scroll separately.

![0.9.0 UI preview: German agent copy selected in the English GUI](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-preview-settings-en.png)

</details>

<details>
<summary>GUI screenshots from previous releases</summary>

![v0.6.1 global memory grouped by project](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-global-project-groups-zh.png)

![v0.7.1 durable snapshot diagnostics on DSH rc.2](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.7.1/picture/v0.7.1-snapshot-persistence-zh.png)

![v0.7.0 native memory settings on DSH 0.1.5-rc.1](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.7.0/picture/v0.7.0-dsh015-settings-zh.png)

![v0.6.2 automatic distillation lifecycle diagnostics](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.2/picture/v0.6.2-distill-diagnostics-zh.png)

![v0.6.1 permanent surface navigation and live settings](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-settings-navigation-zh.png)

![v0.6.1 conversation view scrolled to the end above the composer](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-conversation-scroll-zh.png)

![Native Memory Conversation view on DSH alpha.2](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.0/picture/v0.6.0-alpha2-native-zh.png)

![Memory lifecycle and similar-memory governance](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.4-memory-management-zh.png)

![Settings card](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-settings-card-zh.png)

![Sidebar parity](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.5-sidebar-parity-zh.png)

</details>

## Installation and compatibility

| Channel | DSH baseline | Installation | Status |
| --- | --- | --- | --- |
| npm `latest` (`0.9.0`) | `>=0.2.0-rc.1 <0.3.0-0` | `dsh plugin --profile web add dsh-memoir@0.9.0` | Tested on 0.2.0-rc.1 |
| pinned npm `0.8.2` | `>=0.1.7-rc.1 <0.1.8-0` | `dsh plugin --profile web add dsh-memoir@0.8.2` | Legacy 0.1.7 line |
| pinned npm `0.7.1` | `>=0.1.5-rc.1 <0.1.6-0` | `dsh plugin --profile web add dsh-memoir@0.7.1` | Legacy 0.1.5 line |
| pinned npm `0.6.2` | `>=0.1.2-alpha.2 <0.1.3` | `dsh plugin --profile web add dsh-memoir@0.6.2` | Legacy 0.1.2 line |
| pinned npm `0.5.6` | `0.1.1-rc.2` | `dsh plugin --profile web add dsh-memoir@0.5.6` | rc2 compatibility line |
| Source `v0.9.0` | `>=0.2.0-rc.1 <0.3.0-0` | local build + `link:` | Development; not compatible with legacy 0.1.x |

Node.js `^22.19.0 || >=24.0.0` is required. 0.7.1 keeps the native `conversation.view` / `settings.section` slots and `snapshotEvents()`. DSH 0.1.5 uses Session log V3, independent of Memoir store v4 / settings v3. Back up DSH_HOME before upgrading DSH; migrated sessions are not guaranteed readable by older hosts. This Memoir release neither migrates nor resets memory and retains frozen session snapshots without enabling new dynamic-prompt behavior.

<details>
<summary>Install from source</summary>

0.9.0 source (DSH 0.2.0-rc.1):

```bash
git clone --branch v0.9.0 https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
npm install --global @deepseek-ai/dsh@0.2.0-rc.1
dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
```

</details>

0.8.2 uses native `uiWorkspace`, `conversation.view` / `settings.section`, and the Session V4 producer-owned distillation source. Links open sessions and turn IDs remain copyable; no global DOM turn scrolling is used. Settings inherit the host background and cards use theme layers while preserving skins and independent scrolling. Store v4 / settings v3 / snapshot v1 are unchanged. Back up DSH_HOME before upgrading: host session migration is separate from plugin memory storage.

## Native sidebar and help

**Released 0.8.2:**

- Existing Conversation and Settings entries stay unchanged. The right-sidebar guide now offers Memory for browsing project memory, Hot Memory and diagnostics alongside chat; it never opens automatically or replaces another panel.
- Each sidebar instance follows its own session workspace and reuses the same data layer, with independent active surfaces and scroll state. Conversation and Settings remain available when the optional sidebar service is absent.
- Under Memory settings, the collapsed About & help card shows the plugin version, host range, SDK baseline, maintainer, repository, bilingual documentation, releases and issue links. The plugin repository is explicitly distinct from the current workspace.
- No background update requests, workspace Git-remote inspection or path/memory uploads. Use the host plugin manager to update, after checking the target package’s DSH requirements and prerelease channel. The panel does not auto-upgrade.

**0.9.0:**

- Plugin identity, version, GitHub project, documentation and Open memory settings move to the top of Conversation, Settings and sidebar panels, before any long memory or configuration list. Detailed compatibility information stays collapsed; no forced navigation or Star prompt.
- Open `dsh-memoir` on the native Plugins page to use the same memory-settings form. No duplicate configuration store or registration pretending to be an official plugin; existing entries still work without this host page.
- Develop and validate against official npm `0.2.0-rc.1`. Check the host version before installation; keep Memoir 0.8.2 on DSH 0.1.7.

## Offline release highlights

The first Memory Conversation opening shows the bundled 0.9.0 highlights without blocking chat. Choose “Got it” to stop automatic display for this version in the same browser origin. Reopen anytime from “About & help → View release highlights”. Settings and sidebar panels never open the notice automatically.

The Chinese/English notice is offline: no network requests, uploads, memory changes or conversation edits. Only the acknowledged version is stored locally by the UI. If storage is unavailable, acknowledgment lasts for the current page; Web/Desktop and different origins are not guaranteed to share it.

![0.9.0 offline announcement component preview with demonstration data](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.9.0/picture/v0.9.0-announcement-zh.png)

## Storage, privacy, and security boundaries

```text
~/.dsh/dsh-memoir.json          structured JSON v4 (single source of truth)
~/.dsh/dsh-memoir.settings.json live GUI setting overrides
<project>/PROJECT_MEMORY.md      human-readable projection generated from JSON
```

- No cloud memory database, embedding API, or vector database;
- an arbitrary absolute path submitted by the browser does not grant write access; panel writes accept only a trusted active workspace or an existing project bucket;
- manual browser records cannot spoof trusted session/turn provenance;
- cross-process writes use an exclusive lock and reread disk inside the critical section, with conservative dead-owner recovery;
- Windows path keys are case-normalized while display paths retain their original form;
- `PROJECT_MEMORY.md` may be committed by you, so the user decides whether sensitive content enters Git.

Back up the JSON and project Markdown according to your own policy before upgrades. Removing the plugin does not actively delete them.

## Configuration

Every field below can be set in the memoir `config` row in `cordis.patch.yml`. Except for `enabled`, each is also live-editable and persisted from the Memory panel or Settings card.

| Field | Default | Purpose |
| --- | ---: | --- |
| `enabled` | `true` | master switch for tools, routes, and prompt injection |
| `language` | `zh` | agent-facing copy; `zh` / `en` in 0.8.2, plus `de` / `ru` in 0.9.0; independent of GUI language |
| `announceToAgent` | `true` | announce memory tools and rules to the agent |
| `autoDistill` | `true` | enable top-level worked-turn reminders |
| `autoDistillEvery` | `1` | remind at most once per N worked turns |
| `autoDistillCooldownMin` | `0` | minimum minutes between successful reminders |
| `autoDistillMinTools` | `1` | minimum tool calls required in a triggering turn |
| `hotMemoryTokens` | `900` | normal Hot Memory target budget |
| `hotMemoryMaxTokens` | `1200` | hard ceiling that no session exceeds |
| `readDefaultLimit` | `8` | default `memoir_read` result count |
| `readMaxLimit` | `30` | live upper bound per recall |
| `sessionSnapshotMax` | `128` | resident LRU capacity; durable records are not deleted |
| `queryCacheSize` | `128` | BM25 query LRU capacity |

Shrinking a cache evicts the oldest entries immediately. Existing frozen sessions are not rewritten after budget changes, preserving prompt-prefix stability. “Restore startup configuration” removes Web overrides and returns to profile startup values.

## Performance and verification

v0.5.6 benchmark (Node 24.19, 900/1200-token budget; full data in [`bench/report.md`](./bench/report.md)):

| Entries | Index build | Uncached query | Cached query | Injection reduction vs full Markdown |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 10.5 ms | 1.190 ms | 4.07 µs | 97.6% |
| 10,000 | 126.9 ms | 11.011 ms | 1.45 µs | 99.8% |
| 100,000 | 1.68 s | 126.933 ms | 1.42 µs | about 100% |

Numbers vary by machine and corpus. The important properties are that injection remains bounded and the cache-hit path is independent of total memory size.

Automated regressions cover session projection recovery, cross-process snapshots, writes and cancellation, lifecycle cleanup, BM25 recall, Hot Memory budgets, caching, corrections and project isolation. Curated lexical Top-5 recall is 41/41; fixture results do not measure real-model semantic accuracy, and prefix equality does not guarantee actual billing savings.

## FAQ

**Does it automatically summarize every chat?**<br>
It does not silently scrape every conversation. At the end of an eligible turn it reminds the current agent to distill, and the agent writes through a public tool, keeping the process observable and reviewable.

**Why does every new memory start at importance 3?**<br>
Three is the neutral default on a 1–5 scale, so unscored content is neither demoted nor treated as highest priority. Change it through tool arguments or the GUI; pinning has separate weight.

**Why is a new write not reinjected immediately in the current session?**<br>
The session Hot Memory snapshot is deliberately frozen for prompt-prefix caching. The write is immediately visible to `memoir_read` and the GUI, and the next session rebuilds automatic injection.

**Does it inject all stored memory into context?**<br>
No. Only Hot Memory bounded by `hotMemoryMaxTokens` is injected automatically. Complete history is recalled on demand.

**Why is the UI missing after installation?**<br>
Confirm the command used `--profile web`, then fully restart `dsh web`. Refreshing the browser alone is not enough.

## Development and contributing

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run typecheck
pnpm test
npm run bench
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes. See [CHANGELOG.md](./CHANGELOG.md) for version history. Formal packages are published by the tag workflow through npm OIDC. The current version is [v0.9.0](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.9.0), targeting DSH 0.2.0-rc.1. Pin 0.8.2 on DSH 0.1.7, or 0.7.1 on DSH 0.1.5.

Apache-2.0
