#!/usr/bin/env node
/**
 * Swap every @deepseek-ai/dsh-* devDependency to one SDK version so that
 * typecheck and the test suite exercise that baseline:
 *
 *   node scripts/compat-swap.mjs 0.2.1-rc.5
 *   DSH_COMPAT_SWAP=0.2.1-rc.5 pnpm install --no-frozen-lockfile && pnpm test
 *
 * The caller must run `pnpm install --no-frozen-lockfile` afterwards and is
 * responsible for exporting DSH_COMPAT_SWAP=<version> so the baseline-pinning
 * tests skip themselves (they guard release builds, not matrix probes).
 * `restore` reads the devDependencies back from the committed manifest.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(root, 'package.json')
const target = process.argv[2]

if (target === undefined || (target !== 'restore' && !/^[0-9]+\.[0-9]+\.[0-9]+-[0-9A-Za-z.-]+$/.test(target))) {
  console.error('usage: node scripts/compat-swap.mjs <sdk-version|restore>')
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

if (target === 'restore') {
  const committed = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { cwd: root, encoding: 'utf8' }))
  for (const [name, version] of Object.entries(committed.devDependencies)) {
    if (name.startsWith('@deepseek-ai/')) manifest.devDependencies[name] = version
  }
  for (const name of Object.keys(manifest.devDependencies)) {
    if (name.startsWith('@deepseek-ai/') && !(name in committed.devDependencies)) delete manifest.devDependencies[name]
  }
} else {
  for (const name of Object.keys(manifest.devDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) manifest.devDependencies[name] = target
  }
  // The executor was split out with the 0.2.2 SDK. Older fixtures use the
  // executor built into AgentLoop and must not install an incompatible peer tree.
  const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(target)
  const modern = Number(major) > 0 || Number(minor) > 2 || (Number(minor) === 2 && Number(patch) >= 2)
  manifest.devDependencies['@deepseek-ai/cordis'] = modern ? '~4.1.0' : '~4.0.5'
  if (modern) manifest.devDependencies['@deepseek-ai/dsh-tool-executor-native'] = target
  else delete manifest.devDependencies['@deepseek-ai/dsh-tool-executor-native']
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
const applied = target === 'restore' ? 'committed manifest' : target
console.log(`devDependencies @deepseek-ai/dsh-* -> ${applied}; run pnpm install --no-frozen-lockfile next.`)
