import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientSource = readFileSync(join(ROOT, 'src', 'client', 'index.tsx'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string
  dsh?: {
    engines?: { dsh?: string }
    client?: { inject?: string[] }
  }
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

test('v0.9.3 retains the 0.2.0 floor and admits 0.2.1 prereleases', () => {
  assert.equal(packageJson.version, '0.9.3')
  const range = '>=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-alpha.1 <0.2.1'
  assert.equal(packageJson.dsh?.engines?.dsh, range)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-llm'], range)
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-tools'], range)
  assert.equal(packageJson.dependencies, undefined, 'the published package keeps zero bundled runtime dependencies')
})

test('v0.9.3 injects native client providers and pins the 0.2.1-rc.2 baseline', () => {
  assert.deepEqual(packageJson.dsh?.client?.inject, [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-workspace',
    '@deepseek-ai/dsh-client-ui-sidebar-right',
    '@deepseek-ai/dsh-client-ui-settings-general',
  ])
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-client-ui-slots'], '0.2.1-rc.2')
  for (const [name, version] of Object.entries(packageJson.devDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh-') && version.includes('rc')) {
      assert.equal(version, '0.2.1-rc.2', `${name} must compile against the current rc baseline`)
    }
  }
})

test('native client adapter source uses official 0.2.1-rc.2 contracts', () => {
  assert.match(clientSource, /import type \{ ConvViewProps \} from '@deepseek-ai\/dsh-client-ui-conversation\/client'/)
  assert.match(clientSource, /PropsRuntime<'settings\.section'>/)
  assert.match(clientSource, /SessionListState/)
  assert.match(clientSource, /data-conversation-composer-overlay/)
  assert.ok(!clientSource.includes('interface NativeSlotsLike'))
  assert.ok(!clientSource.includes('as unknown as'))
})
