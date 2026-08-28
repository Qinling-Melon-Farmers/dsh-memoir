# dsh-memoir

[![npm version](https://img.shields.io/npm/v/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![npm downloads](https://img.shields.io/npm/dm/dsh-memoir.svg)](https://www.npmjs.com/package/dsh-memoir)
[![CI](https://github.com/Qinling-Melon-Farmers/dsh-memoir/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Qinling-Melon-Farmers/dsh-memoir/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/dsh-memoir.svg)](./LICENSE)

[中文](./README.md) · English · [Changelog](./CHANGELOG.md) · [Releases](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases)

**A local-first, cross-session project-memory plugin for DeepSeek Harness (DSH).** It persists an agent's confirmed work, lessons, and next actions, injects bounded cache-friendly Hot Memory into new sessions, and retrieves long-tail history through local BM25 ranking.

No embeddings, vector database, or cloud memory service. The npm package has zero bundled runtime dependencies; DSH peers are supplied by the host.

```bash
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
| Complete Web GUI | Bilingual project/global browsing, ranked search, editing, Hot Memory inspection, diagnostics, and live settings |

It fits personal and local development workflows where a new agent should continue understanding a project. It is not a raw chat backup, multi-user cloud sync service, or vector-semantic knowledge base.

![dsh-memoir memory management, settings, and Hot Memory](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-memory-scroll-zh.png)

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
- **Session Snapshot** freezes injected text within a session. New writes are immediately readable by tools and the GUI, while automatic injection refreshes in the next new session.

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

Automatic distillation is an observable agent turn-end reminder, not silent background scraping of every chat. The default `1 / 0 / 1` means every eligible worked turn, no extra cooldown, and at least one tool call.

`autoDistillEvery`, `autoDistillCooldownMin`, and `autoDistillMinTools` are AND conditions isolated per agent. Idle, aborted, subagent, and already-recorded turns do not trigger. Cooldown advances only after a successful reminder. All cadence parameters are live-editable in the GUI.

## Local recall and caching

- Chinese 2/3-grams, English words, and code/path identifier tokenization;
- document-side BM25 keeps true term frequency, with a 2.5× title boost plus exact-phrase, section, and recency weighting;
- separate title/body length normalization;
- deduplicated global Top-K shared by project / global / all;
- epoch-aware LRU query cache with one-hour time buckets; `limit` and output detail stay outside the key so output shapes share rankings;
- the GUI and `memoir_read` use the same RetrievalEngine and expose hits, misses, evictions, hit rate, and last-query latency.

Top-5 recall on the fixed quality set is 100%; the repository gate requires at least 90%.

## Web GUI

Installing into the `web` profile adds a Memory sidebar entry and a collapsed-by-default card under Settings → Web UI Plugins.

- Project memory and all-project global memory;
- status, section, and keyword filters with BM25 scores;
- add, edit, pin, archive, restore, and supersede;
- copy and best-effort navigation for session/turn provenance;
- Hot Memory Inspector: what the next session will inherit;
- Retrieval Diagnostics: index, query cache, last query, and session snapshot;
- one vertical scroll owner, so expanded settings, Hot Memory, and diagnostics remain continuously scrollable;
- live Chinese/English switching from `<html lang>`.

<details>
<summary>More stable GUI screenshots</summary>

![Memory lifecycle and similar-memory governance](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.4-memory-management-zh.png)

![Settings card](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.6-settings-card-zh.png)

![Sidebar parity](https://raw.githubusercontent.com/Qinling-Melon-Farmers/dsh-memoir/v0.5.6/picture/v0.5.5-sidebar-parity-zh.png)

</details>

## Installation and compatibility

| Channel | DSH baseline | Installation | Status |
| --- | --- | --- | --- |
| npm `latest` | `0.1.1-rc.2` | `dsh plugin --profile web add dsh-memoir@latest` | Recommended stable |
| GitHub `main` | `0.1.1-rc.2` | source clone + `link:` | Stable development |
| [`alpha/dsh-0.1.2-alpha.1`](https://github.com/Qinling-Melon-Farmers/dsh-memoir/tree/alpha/dsh-0.1.2-alpha.1) | `0.1.2-alpha.1` | run `pnpm dsh ... link:` from the official DSH alpha source | Source preview only |

Stable requires Node.js `^22.19.0 || >=24.0.0`. dshmarket and the dsh-web plugin manager should continue installing `@latest`. The alpha branch has no npm package, tag, or Release, preventing stable users from being prompted to upgrade their host by mistake.

<details>
<summary>Install from source</summary>

Stable source:

```bash
git clone https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build
dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
```

DSH `0.1.2-alpha.1` preview:

```bash
git clone --branch alpha/dsh-0.1.2-alpha.1 https://github.com/Qinling-Melon-Farmers/dsh-memoir.git
cd dsh-memoir
pnpm install --frozen-lockfile
pnpm run build

# run from the official DSH dsh-v0.1.2-alpha.1 source checkout
pnpm dsh plugin --profile web add "link:/absolute/path/dsh-memoir"
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
| `announceToAgent` | `true` | announce memory tools and rules to the agent |
| `autoDistill` | `true` | enable top-level worked-turn reminders |
| `autoDistillEvery` | `1` | remind at most once per N worked turns |
| `autoDistillCooldownMin` | `0` | minimum minutes between successful reminders |
| `autoDistillMinTools` | `1` | minimum tool calls required in a triggering turn |
| `hotMemoryTokens` | `900` | normal Hot Memory target budget |
| `hotMemoryMaxTokens` | `1200` | hard ceiling that no session exceeds |
| `readDefaultLimit` | `8` | default `memoir_read` result count |
| `readMaxLimit` | `30` | live upper bound per recall |
| `sessionSnapshotMax` | `128` | frozen session-snapshot LRU capacity |
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

Stable has 171 automated tests covering storage migration and locks, Hot Memory, BM25 quality/cache, lifecycle, provenance anti-spoofing, similar-memory governance, automatic distillation, bilingual GUI, scrolling, integration, and release automation.

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

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting changes. See [CHANGELOG.md](./CHANGELOG.md) for version history. Stable packages are published by the tag workflow through npm OIDC. The current stable release is [v0.5.6](https://github.com/Qinling-Melon-Farmers/dsh-memoir/releases/tag/v0.5.6).

Apache-2.0
