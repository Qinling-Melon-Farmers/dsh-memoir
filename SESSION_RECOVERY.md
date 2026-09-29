# 会话恢复 / Session recovery (#14)

## 中文

### 原因与边界

Memoir 0.8.1–0.9.0 的实际写入回执使用了没有 `ignorable` 标记的 `dsh-memoir/written` 自定义事件。DSH 能追加它，但重新读取持久化日志时会拒绝整份历史。这不等于会话正文或 `dsh-memoir.json` 记忆数据已被删除。

修复代码位于 `main`，不代表 npm 已发布补丁。它不再生成该事件，直接工具调用使用官方 `tool/result.meta`；旧日志不会自动重写。**恢复前先停止受影响插件的写入**，否则旧版仍会生成坏回执；只关闭自动蒸馏不够，手动 `memoir_record` / `memoir_update` 也会触发。

### 只读检查

从本仓库 `main` 获取脚本。用 Node 24，传入官方 DSH 安装目录和**一个具体会话文件**，不要传记忆 JSON、目录或通配符：

```sh
node scripts/repair-session-receipts.mjs --dsh-package "/path/to/node_modules/@deepseek-ai/dsh" "/path/to/session.v4.jsonl.zstd"
```

- Windows 全局路径可用 `npm root -g` 查出，再附加 `@deepseek-ai/dsh`；WSL 使用自己的 Linux 安装。桌面内置依赖不可直接供 Node 加载时，使用单独安装的官方 npm DSH 作为校验器，不修改桌面文件。
- 已审计的校验器/锁协议为官方 JSONL backend `0.2.0-rc.1` / `0.2.0-rc.2`，其它版本拒绝执行。它可以检查符合该校验器的原生 v4 旧日志，不运行宿主、不迁移历史格式。
- 支持 `session.v4.jsonl` / `session.v4.jsonl.zstd`，存储和解压后均最多 128 MiB；Zstandard 每帧必须带校验和。日志截断、损坏、其它未知且不可忽略事件、符号链接/目录联接、硬链接等均拒绝修改。
- 默认不改文件，不递归扫描用户目录；输出只有路径、计数和固定错误码，不输出正文或密钥。`candidates` 是待修复回执数量。
- 在完整源码开发环境中，也可省略 `--dsh-package`，使用已安装且版本匹配的官方 SDK devDependencies；脚本不自动下载依赖。

### 备份后执行

完全退出使用这份日志的 Web、CLI、桌面和后台宿主，独立备份会话目录。确认只读检查成功，再执行：

```sh
node scripts/repair-session-receipts.mjs --dsh-package "/path/to/node_modules/@deepseek-ai/dsh" --apply --host-stopped "/path/to/session.v4.jsonl.zstd"
```

脚本取得官方会话写锁，逐项校验原始日志，仅在旧回执最外层补 `ignorable: true`；不删事件、不重排 seq、不改正文/时间/工具数据。受影响压缩帧会重压缩，其它帧原样保留。原始字节写入同目录唯一 `.memoir-repair-<id>.bak`，验证后才以同目录原子替换安装结果。再次执行是无操作；备份不会自动删除。

应用期间必须持续停机，仅使用可信本地文件系统；锁防止遵循同一协议的 DSH 写者，不能对抗任意外部程序绕过锁写文件。检测到并发修改会停止。失败可能保留 `.tmp` 与 `.bak`，请按报告路径人工检查，不批量删除。若错误报告 `committed: true`，替换已经发生，先保存现场和备份再排查。

权限边界：POSIX 要求原文件 uid/gid 与当前进程有效身份匹配，否则拒绝替换。Windows 新建备份、暂存与替换文件继承目录 ACL，**不会保留原文件专属 ACL**；只有目录继承权限已经足以保护全部日志数据时才可执行，否则先单独审查权限。Windows 会话锁在同一登录会话内生效，不支持跨登录会话共享或网络盘。

修复后用**已修复的插件构建**重启并打开原会话。此脚本不修其它损坏，不保证宿主派生索引/缓存的所有故障均随之恢复；不要删除未知缓存或原始日志来掩盖剩余错误。需要回退时先停机，保留修复后文件，再从明确对应的 `.bak` 恢复原始文件。

## English

Memoir 0.8.1–0.9.0 appends a custom `dsh-memoir/written` receipt without `ignorable`. DSH can write it but refuses the whole persisted history on reopen. This does not itself delete the raw conversation or the memory store. The fix on `main` uses official `tool/result.meta` and never rewrites old sessions automatically; **it is not yet an npm release**.

Stop memory writes from affected builds first: disabling auto-distillation alone does not prevent manual write tools from producing another invalid receipt. Obtain the script from this repository's `main`, use Node 24, and audit one explicitly named file:

```sh
node scripts/repair-session-receipts.mjs --dsh-package "/path/to/node_modules/@deepseek-ai/dsh" "/path/to/session.v4.jsonl.zstd"
```

The official DSH directory supplies the reviewed v4 validators and native lease dependencies (JSONL backends **0.2.0-rc.1 / 0.2.0-rc.2 only**). `npm root -g` locates global packages; Windows and WSL have separate installations. An independently installed official npm DSH can validate desktop logs without editing the desktop installation.

In a source checkout with the pinned official SDK devDependencies installed, `--dsh-package` may be omitted. The script never downloads dependencies itself.

Default operation is read-only: no home scan, no host startup, no migration, and no content or credentials in diagnostics. It accepts only `session.v4.jsonl` / `session.v4.jsonl.zstd`, capped at 128 MiB both stored and expanded. It refuses torn/corrupt/unsupported logs, unknown required events, nonchecksummed frames, links and ambiguous receipts.

Exit **every** Web/CLI/desktop/background host using the file and independently back up the session directory. After a successful audit, apply explicitly:

```sh
node scripts/repair-session-receipts.mjs --dsh-package "/path/to/node_modules/@deepseek-ai/dsh" --apply --host-stopped "/path/to/session.v4.jsonl.zstd"
```

The script takes the official session lease and adds only `ignorable: true` to exact legacy receipt envelopes, preserving event order, seq, timestamps, payloads and untouched compressed frames. A unique adjacent `.memoir-repair-<id>.bak` stores the verified original bytes before atomic replacement. Backups are retained; a second run makes no change.

Keep all hosts stopped throughout; use a trusted local filesystem. The lease excludes cooperating DSH writers, not arbitrary external writers. Observed changes abort replacement. Failures can leave `.tmp`/`.bak` files for manual inspection; do not bulk-delete them. `committed: true` means replacement already happened: preserve the current file and backup before troubleshooting.

Permissions: POSIX requires source uid/gid to match the effective process identity. On Windows, backup/staging/replacement files inherit directory ACLs; **custom source-file ACLs are not retained**. Apply only where inherited directory permissions already protect all log data; otherwise review permissions separately first. The Windows lease is scoped to the same login session, not cross-login sharing or network filesystems.

Reopen with a **fixed plugin build**. The tool does not repair unrelated corruption or promise recovery of every derived index/cache failure. To roll back, stop all hosts, retain the repaired file, and restore the exact matching `.bak`; never delete the raw conversation to silence errors.
