import { dirname } from 'node:path'
import { MemoirStore } from '../../lib/store.js'
import { MemorySnapshotManager, snapshotHash } from '../../lib/snapshot.js'
import { MemorySnapshotStore } from '../../lib/snapshot-store.js'
import { memoirSectionText } from '../../lib/index.js'

const [storePath, settingsPath, key, text, mode] = process.argv.slice(2)
const persistence = new MemorySnapshotStore({ storePath, settingsPath, language: () => 'zh', lockTimeoutMs: 5000 })
const manager = new MemorySnapshotManager({ max: 1, persistence })
if (mode === 'prompt') {
  const value = memoirSectionText(new MemoirStore(storePath), {
    agent: { id: key, session: { id: key, header: { cwd: dirname(storePath) } } },
  }, manager)
  console.log(JSON.stringify({ text: value, hash: snapshotHash(value), diagnostics: persistence.diagnostics() }))
} else {
  const value = manager.getOrCreate(key, () => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80)
    return { text, storeRevision: 0 }
  })
  console.log(JSON.stringify(value))
}
