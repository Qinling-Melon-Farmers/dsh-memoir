import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import test from 'node:test'

test('release notes show Chinese by default and collapse English', () => {
  const result = spawnSync(
    process.execPath,
    [resolve('scripts/render-release-notes.mjs'), '0.6.0'],
    { encoding: 'utf8' },
  )

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /^## 中文\n/)
  assert.match(result.stdout, /正式适配 npm 已发布的 DeepSeek Harness `0\.1\.2-alpha\.2`/)
  assert.match(result.stdout, /完成 Issue #8/)
  assert.match(result.stdout, /`language: zh \| en`/)
  assert.match(result.stdout, /<details>\n<summary>English<\/summary>/)
  assert.match(result.stdout, /## English\n/)
  assert.match(result.stdout, /formal compatibility with the npm-published DeepSeek Harness `0\.1\.2-alpha\.2`/)
  assert.match(result.stdout, /Completed Issue #8/)
  assert.ok(result.stdout.indexOf('## 中文') < result.stdout.indexOf('<details>'))
  assert.ok(result.stdout.indexOf('<details>') < result.stdout.indexOf('## English'))
})
