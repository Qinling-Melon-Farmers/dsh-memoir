import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  version: string
  dsh?: {
    engines?: { dsh?: string }
    client?: { inject?: string[] }
  }
  peerDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

test('source alpha declares an explicit DSH alpha compatibility floor', () => {
  assert.equal(packageJson.version, '0.6.0-alpha.1')
  assert.equal(packageJson.dsh?.engines?.dsh, '>=0.1.2-alpha.1')
  assert.match(packageJson.peerDependencies?.['@deepseek-ai/dsh-llm'] ?? '', />=0\.1\.2-alpha\.1/)
  assert.match(packageJson.peerDependencies?.['@deepseek-ai/dsh-tools'] ?? '', />=0\.1\.2-alpha\.1/)
})

test('source alpha injects only native client providers', () => {
  assert.deepEqual(packageJson.dsh?.client?.inject, [
    '@deepseek-ai/dsh-api-session-controller',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-ui-settings-general',
  ])
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(packageJson.devDependencies?.['@deepseek-ai/dsh-client-ui-slots'], undefined)
})
