import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Guards the boundaries that drifted in practice: the SDK devDependency moved
// to 0.2.1-rc.5 while the recovery allowlist stayed on rc.2 until 0.9.4. Each
// test pins one side of that seam so a one-sided bump fails before release.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string
  dsh?: { engines?: { dsh?: string } }
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const repairScript = readFileSync(join(ROOT, 'scripts', 'repair-session-receipts.mjs'), 'utf8')
const recoveryDoc = readFileSync(join(ROOT, 'SESSION_RECOVERY.md'), 'utf8')
const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
const englishReadme = readFileSync(join(ROOT, 'README.en.md'), 'utf8')
// compat-swap probes compile other SDK baselines; only release runs pin devDeps.
const swapProbe = process.env.DSH_COMPAT_SWAP !== undefined
const probeSkip = swapProbe ? 'non-baseline compat probe' : false

function reviewedBackends(): string[] {
  const match = repairScript.match(/REVIEWED_BACKENDS = new Set\(\[([^\]]+)\]\)/)
  assert.ok(match, 'repair script must declare a REVIEWED_BACKENDS set literal')
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

interface SemVer { major: number; minor: number; patch: number; pre: Array<string | number> }

function parseVersion(input: string): SemVer {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(input)
  assert.ok(match, `unsupported version literal: ${input}`)
  const [, major, minor, patch, pre] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    pre: pre === undefined ? [] : pre.split('.').map((part) => /^\d+$/.test(part) ? Number(part) : part),
  }
}

function comparePre(a: Array<string | number>, b: Array<string | number>): number {
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i]
    const right = b[i]
    if (left === undefined) return -1
    if (right === undefined) return 1
    if (left === right) continue
    if (typeof left === 'number' && typeof right === 'number') return left < right ? -1 : 1
    if (typeof left === 'number') return -1
    if (typeof right === 'number') return 1
    return left < right ? -1 : 1
  }
  return 0
}

function compareVersions(a: SemVer, b: SemVer): number {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1
  }
  return comparePre(a.pre, b.pre)
}

// Minimal matcher for the one shape this project uses: clauses of >=A and <B
// joined by ||, where every literal may carry a prerelease or a -0 sentinel.
function satisfiesComparator(version: SemVer, op: '>=' | '<', bound: SemVer): boolean {
  const order = compareVersions(version, bound)
  return op === '>=' ? order >= 0 : order < 0
}

function satisfiesClause(version: SemVer, clause: string): boolean {
  // npm rule: a prerelease only satisfies a clause set when some comparator in
  // it shares the version's [major, minor, patch] tuple and itself has a prerelease.
  if (version.pre.length > 0) {
    const comparators = [...clause.matchAll(/(>=|<)\s*([^\s]+)/g)].map((m) => parseVersion(m[2]))
    const sharesTuple = comparators.some((bound) =>
      bound.major === version.major && bound.minor === version.minor && bound.patch === version.patch && bound.pre.length > 0)
    if (!sharesTuple) return false
  }
  for (const match of clause.matchAll(/(>=|<)\s*([^\s]+)/g)) {
    if (!satisfiesComparator(version, match[1] as '>=' | '<', parseVersion(match[2]))) return false
  }
  return true
}

function satisfiesRange(range: string, version: string): boolean {
  const parsed = parseVersion(version)
  return range.split('||').some((clause) => satisfiesClause(parsed, clause.trim()))
}

test('range matcher reproduces the npm prerelease decisions this release relies on', () => {
  const current = '>=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-alpha.1 <0.2.1'
  assert.equal(satisfiesRange(current, '0.2.1-rc.5'), true, 'current rc baseline must satisfy the declared range')
  assert.equal(satisfiesRange(current, '0.2.1-rc.2'), true)
  assert.equal(satisfiesRange(current, '0.2.1-alpha.1'), true)
  assert.equal(satisfiesRange(current, '0.2.0-rc.1'), true)
  assert.equal(satisfiesRange(current, '0.2.2-alpha.2'), false, '0.2.2 prereleases stay outside until a dedicated line exists')
  const candidate = current + ' || >=0.2.2-rc.1 <0.2.2'
  assert.equal(satisfiesRange(candidate, '0.2.2-rc.1'), true)
  assert.equal(satisfiesRange(candidate, '0.2.2-alpha.3'), false, 'do not admit unaudited earlier alphas')
  assert.equal(satisfiesRange(current, '0.2.2'), true, 'a stable 0.2.2 already satisfies the 0.2.0 floor clause')
  assert.equal(satisfiesRange(current, '0.1.7-rc.2'), false)
  assert.equal(satisfiesRange('>=0.2.2-alpha.2 <0.2.2', '0.2.2-alpha.2'), true)
  assert.equal(satisfiesRange('>=0.2.2-alpha.2 <0.2.2', '0.2.2-rc.1'), true)
  assert.equal(satisfiesRange('>=0.2.2-alpha.2 <0.2.2', '0.2.1-rc.5'), false)
})

test('the JSONL devDependency baseline stays inside the recovery allowlist', { skip: probeSkip }, () => {
  const baseline = packageJson.devDependencies?.['@deepseek-ai/dsh-session-persistence-jsonl']
  assert.equal(typeof baseline, 'string', 'the JSONL SDK must stay a pinned devDependency')
  assert.ok(reviewedBackends().includes(baseline!), `devDependency ${baseline} must be listed in REVIEWED_BACKENDS before release`)
})

test('declared DSH engine ranges admit the compile baseline', { skip: probeSkip }, () => {
  const baseline = packageJson.devDependencies?.['@deepseek-ai/dsh-agent']
  const engine = packageJson.dsh?.engines?.dsh
  assert.equal(typeof engine, 'string')
  assert.ok(satisfiesRange(engine!, baseline!), `dsh.engines ${engine} must admit baseline ${baseline}`)
  for (const peer of ['@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']) {
    assert.equal(packageJson.peerDependencies?.[peer], engine, `peerDependencies.${peer} must mirror dsh.engines.dsh`)
  }
})

test('both recovery documents mention every reviewed backend and the baseline', { skip: probeSkip }, () => {
  const backends = reviewedBackends()
  assert.ok(backends.length >= 8, 'the audit table keeps growing; update this floor deliberately')
  for (const version of backends) {
    assert.ok(recoveryDoc.includes(version), `SESSION_RECOVERY.md must list reviewed backend ${version}`)
  }
  const baseline = packageJson.devDependencies?.['@deepseek-ai/dsh-agent']
  for (const [name, document] of [['README.md', readme], ['README.en.md', englishReadme]]) {
    // Inline-code formatting must not invalidate a correctly documented baseline.
    assert.ok(document.replaceAll('`', '').includes(`SDK ${baseline}`), `${name} must carry the current SDK baseline`)
  }
})
