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

test('v0.6.0 declares the published DSH alpha.2 compatibility floor', () => {
  assert.equal(packageJson.version, '0.6.0')
  assert.equal(packageJson.dsh?.engines?.dsh, '>=0.1.2-alpha.2 <0.1.3')
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-llm'], '>=0.1.2-alpha.2 <0.1.3')
  assert.equal(packageJson.peerDependencies?.['@deepseek-ai/dsh-tools'], '>=0.1.2-alpha.2 <0.1.3')
  assert.equal(packageJson.dependencies, undefined, 'the published package keeps zero bundled runtime dependencies')
})

test('v0.6.0 injects only native alpha client providers', () => {
  assert.deepEqual(packageJson.dsh?.client?.inject, [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-settings-general',
  ])
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-client-ui-slots'], '0.1.2-alpha.2')
  for (const [name, version] of Object.entries(packageJson.devDependencies ?? {})) {
    if (name.startsWith('@deepseek-ai/dsh-') && version.includes('alpha')) {
      assert.equal(version, '0.1.2-alpha.2', `${name} must compile against the release baseline`)
    }
  }
})

test('native client adapters compile against official alpha.2 contracts', () => {
  assert.match(clientSource, /import type \{ ConvViewProps \} from '@deepseek-ai\/dsh-client-ui-conversation\/client'/)
  assert.match(clientSource, /PropsRuntime<'settings\.section'>/)
  assert.match(clientSource, /SessionListState/)
  assert.ok(!clientSource.includes('interface NativeSlotsLike'))
  assert.ok(!clientSource.includes('as unknown as'))
})
