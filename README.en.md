# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![npm downloads](https://img.shields.io/npm/dm/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![CI](https://github.com/Qinling-Melon-Farmers/dsh-memoir/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Qinling-Melon-Farmers/dsh-memoir/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-memoir.svg)](./LICENSE)

[中文](./README.md) · English · [Changelog](./CHANGELOG.md) · [Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**A local-first, cross-session project-memory plugin for DeepSeek Harness (DSH).** It persists an agent's confirmed work, lessons, and next actions, injects bounded cache-friendly Hot Memory into new sessions, and retrieves long-tail history through local BM25 ranking.

No embeddings, vector database, or cloud memory service. The npm package has zero bundled runtime dependencies; DSH peers are supplied by the host.

> [!IMPORTANT]
> `dsh-memoir@0.7.1` fixes lost session snapshots after restart or RAM eviction (#10), supporting DSH **0.1.5-rc.1 / rc.2**. It requires `>=0.1.5-rc.1 <0.1.6-0`; check your host first. Keep `0.6.2` on DSH 0.1.2, or `0.5.6` on DSH 0.1.1-rc.2; those older lines do not include this fix.

```bash
npm install --global @deepseek-ai/dsh@0.1.5-rc.1
dsh plugin --profile web add dsh-memoir@latest
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

![dsh-memoir v0.6.1 global memory grouped and collapsed by project](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.6.1/picture/v0.6.1-global-project-groups-zh.png)

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

v0.6.2 diagnostics show the latest decision and process-local counters. Turns calling `memoir_record` or `memoir_update` skip reminders; submitting a reminder does not confirm persistence. Agent disposal clears gate state, with a fallback cap of 1024 recently active agents (eviction also forgets their turn watermark and cooldown). Manual recording remains available when automatic distillation is disabled.

DSH `0.1.5-rc.1` and the newest rc.2 are supported (pre-release verification: npm `next` is rc.2, while `latest` remains rc.1). BM25 is lexical retrieval and does not guarantee cross-language semantic matches without shared terms. Distillation guidance does not replace fact checking.

Automatic distillation is an observable agent turn-end reminder, not silent background scraping of every chat. The default `1 / 0 / 1` means every eligible worked turn, no extra cooldown, and at least one tool call.

`autoDistillEvery`, `autoDistillCooldownMin`, and `autoDistillMinTools` are AND conditions isolated per agent. Idle, aborted, subagent, and already-recorded turns do not trigger. Cooldown advances only after a successful reminder. All cadence parameters are live-editable in the GUI.

`language` independently controls agent-visible tool descriptions and parameters, the distillation prompt, tool results, Hot Memory / `PROJECT_MEMORY.md` headings, and validation or governance errors. It defaults to `zh` for backward compatibility and can be switched to `en` in the GUI. Tool schemas and subsequent prompts update live without restarting DSH.

## Local recall and caching

- Chinese 2/3-grams, English words, and code/path identifier tokenization;
- document-side BM25 keeps true term frequency, with a 2.5× title boost plus exact-phrase, section, and recency weighting;
- separate title/body length normalization;
- deduplicated global Top-K shared by project / global / all;
- epoch-aware LRU query cache with one-hour time buckets; `limit` and output detail stay outside the key so output shapes share rankings;
- the GUI and `memoir_read` use the same RetrievalEngine and expose hits, misses, evictions, hit rate, and last-query latency.

Top-5 recall on the fixed quality set is 100%; the repository gate requires at least 90%.

## Web GUI

Installing into a DSH-alpha `web` profile registers a native Memory Conversation view and Memory Settings section through official slots. The DSH shell owns layout, navigation, and unload lifecycle; Memoir no longer takes over the legacy sidebar through DOM selectors.

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
<summary>More GUI screenshots</summary>

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
| npm `latest` (`0.7.1`) | `>=0.1.5-rc.1 <0.1.6-0` | `dsh plugin --profile web add dsh-memoir@latest` | Snapshot recovery fix; rc.1 / rc.2 validated |
| pinned npm `0.6.2` | `>=0.1.2-alpha.2 <0.1.3` | `dsh plugin --profile web add dsh-memoir@0.6.2` | Legacy 0.1.2 line |
| pinned npm `0.5.6` | `0.1.1-rc.2` | `dsh plugin --profile web add dsh-memoir@0.5.6` | rc2 compatibility line |
| GitHub `main` (`0.7.1`) | `>=0.1.5-rc.1 <0.1.6-0` | source clone + `link:` | Development and debugging |

Node.js `^22.19.0 || >=24.0.0` is required. 0.7.1 keeps the native `conversation.view` / `settings.section` slots and `snapshotEvents()`. DSH 0.1.5 uses Session log V3, independent of Memoir store v4 / settings v3. Back up DSH_HOME before upgrading DSH; migrated sessions are not guaranteed readable by older hosts. This Memoir release neither migrates nor resets memory and retains frozen session snapshots without enabling new dynamic-prompt behavior.

<details>
<summary>Install from source</summary>

0.7.x source:

```bash
git clone https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
npm install --global @deepseek-ai/dsh@0.1.5-rc.1
dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
```

</details>

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
| `language` | `zh` | agent-facing prompt, tool schema/result, projection-heading, and error language; `zh` or `en` |
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

0.7.1 has 202 tests: 201 pass on Windows with one POSIX permission test skipped; all pass on Linux. Coverage includes actual process restart, same-session concurrent creation, LRU, empty baselines, forks, language isolation, corruption and permission errors, plus existing BM25/Hot Memory/tool regressions. DSH rc.1 and the newest rc.2 are validated. Prefix equality in tests is not a guarantee of actual billing savings.

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

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes. See [CHANGELOG.md](./CHANGELOG.md) for version history. Formal packages are published by the tag workflow through npm OIDC. The current npm release is [v0.7.1](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.7.1), and `main` is synchronized with it.

Apache-2.0
