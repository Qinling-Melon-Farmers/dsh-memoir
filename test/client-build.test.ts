/**
 * Client bundle build check: runs the esbuild build and validates the emitted
 * artifact against the client bundle protocol —
 *   1. the closure-factory banner/footer and the exact module id;
 *   2. every bare specifier the bundle requires is answered by the shell's
 *      frozen module table (platform modules) — no other @deepseek-ai value
 *      import may leak through (bundle purity).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'lib', 'client.js')

const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
])

test('client bundle builds without errors', () => {
  // esbuild logs to stderr; a non-zero exit throws execFileSync.
  execFileSync(process.execPath, [join(ROOT, 'build.mjs')], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  assert.ok(readFileSync(OUT, 'utf8').length > 1000, 'bundle is not empty')
})

test('client bundle follows the ModuleLoader closure-factory protocol', () => {
  const source = readFileSync(OUT, 'utf8')
  assert.ok(source.startsWith('window.__ModuleLoader__.load('), 'banner opens the loader handoff')
  assert.ok(source.includes('id: "dsh-memoir"'), 'module id stamped')
  assert.ok(source.includes('factory: (require) =>'), 'factory signature present')
  assert.ok(source.trimEnd().includes('return module.exports;'), 'footer returns module.exports')
  assert.ok(source.includes('var module = { exports: {} };'), 'intro defines the module record')
})

test('client bundle requires only platform modules (purity)', () => {
  const source = readFileSync(OUT, 'utf8')
  const required = new Set<string>()
  for (const match of source.matchAll(/require\((['"])([^'"]+)\1\)/g)) {
    required.add(match[2]!)
  }
  assert.ok(required.size > 0, 'the bundle does emit require calls')
  for (const specifier of required) {
    assert.ok(
      PLATFORM_MODULES.has(specifier),
      `require("${specifier}") is not a platform module — bundle purity violation`,
    )
  }
  assert.ok(required.has('react/jsx-runtime'), 'jsx runtime comes from the module table')
  assert.ok(required.has('react'), 'native slot components share the shell React instance')
})

test('client bundle carries native DSH alpha view and Settings contracts', () => {
  const source = readFileSync(OUT, 'utf8')
  assert.ok(source.includes('data-dsh-plugin'), 'React surfaces expose their plugin owner')
  assert.ok(source.includes('data-dsh-part'), 'React surfaces expose stable part names')
  assert.ok(source.includes('data-dsh-memoir-style'), 'the stylesheet uses a collision-free ownership marker')
  assert.ok(source.includes('conversation.view'), 'Memoir registers a native Conversation view')
  assert.ok(source.includes('settings.section'), 'Memoir registers a native Settings section')
  assert.ok(source.includes('memoir-native-view'), 'native Conversation wrapper is bundled')
  assert.ok(source.includes('memoir-settings-section'), 'native Settings wrapper is bundled')
  assert.ok(!source.includes('web-ui.plugin.item'), 'legacy dsh-web-ui Settings slot is not registered')
  assert.ok(!source.includes('dsh-client-runtime'), 'removed alpha runtime cannot leak into the bundle')
  assert.ok(source.includes('hotMemoryTokens'), 'complete runtime settings are bundled')
  assert.ok(source.includes('memoir-settings-slot-chevron'), 'Settings card uses the family disclosure chrome')
  assert.ok(source.includes('memoir-scroll-region'), 'panel carries one explicit vertical scroll owner')
  assert.ok(source.includes('needs-resolution'), 'similar-memory resolution UI is bundled')
  assert.ok(source.includes('source.turn'), 'source turn controls are bundled')
})
