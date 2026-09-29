import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Exercise trusted workflow code, not a reimplementation of its policy.
// All GitHub calls are mocked; never create real issues or pull requests.
function loadWorkflow(name: string) {
  const yaml = readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8')
  const marker = '          script: |'
  assert.equal(yaml.split(marker).length, 2)
  const source = yaml.split(marker)[1]!.split(/\r?\n/).map(line => line.replace(/^ {12}/, '')).join('\n')
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
  return new AsyncFunction('context', 'github', 'core', source)
}

const dedup = loadWorkflow('issue-dedup')
const contribution = loadWorkflow('pr-contribution-rules')
const docs = loadWorkflow('reject-docs-pr')
type Call = { action: string; args: Record<string, unknown> }

function harness(labelFailure = false, candidates: object[] = []) {
  const calls: Call[] = [], warnings: string[] = [], failures: string[] = []
  const github = { paginate: async () => [], rest: {
    issues: Object.fromEntries(['addLabels', 'createComment', 'update'].map(action => [action, async (args: Record<string, unknown>) => {
      if (action === 'addLabels' && labelFailure) throw new Error('Synthetic label API failure')
      calls.push({ action, args })
    }])),
    search: { issuesAndPullRequests: async () => ({ data: { items: candidates } }) },
  } }
  const core = { warning: (message: string) => warnings.push(message), setFailed: (message: string) => failures.push(message) }
  return { calls, warnings, failures, github, core }
}

const validBody = [
  '## PR 类型（PR Type）', '- [x] Bug 修复',
  '## 最新代码确认（Latest Codebase Confirmation）',
  '- [x] 我已基于最新 `main` 分支开发，或在提交前已 rebase / 合并最新 `main`。',
  '## 本地验证（Local Validation）', '执行的命令：\nnpm test', '结果摘要：\nAll tests passed.',
].join('\n\n')

for (const labels of [[], ['bug'], ['enhancement'], ['documentation'], ['question'], ['invalid', 'wontfix']]) {
  test(`PR contribution check never requires labels: ${labels.join(',') || 'none'}`, async () => {
    const h = harness()
    await contribution({ repo: { owner: 'owner', repo: 'repo' }, payload: {
      action: 'opened', pull_request: { number: 20, body: validBody, labels, user: { login: 'external' } },
    } }, h.github, h.core)
    assert.deepEqual(h.calls, [])
    assert.deepEqual(h.failures, [])
  })
}

test('PR body validation still fails for missing evidence regardless of labels', async () => {
  for (const labels of [[], ['bug', 'enhancement', 'documentation', 'question']]) {
    const h = harness()
    await contribution({ repo: { owner: 'owner', repo: 'repo' }, payload: {
      action: 'opened', pull_request: { number: 20, body: '', labels, user: { login: 'external' } },
    } }, h.github, h.core)
    assert.deepEqual(h.calls.map(call => call.action), ['createComment'])
    assert.equal(h.failures.length, 1)
    assert.doesNotMatch(h.failures[0]!, /标签|label/i)
  }
})

test('documentation label alone does not close a code PR; unlabeled docs PR keeps existing policy', async () => {
  for (const [title, labels, closed] of [
    ['fix(client): improve behavior', ['documentation'], false],
    ['fix(client): improve behavior', [], false],
    ['docs: clarify installation', [], true],
  ] as const) {
    const h = harness()
    await docs({ repo: { owner: 'owner', repo: 'repo' }, payload: {
      pull_request: { number: 20, title, body: validBody, labels, user: { login: 'external' } },
    } }, h.github, h.core)
    assert.equal(h.calls.some(call => call.action === 'update' && call.args.state === 'closed'), closed)
    assert.equal(h.failures.length, closed ? 1 : 0)
  }
})

test('missing duplicate label never substitutes for actual duplicate evidence', async () => {
  for (const labels of [[], [{ name: 'duplicate' }]]) {
    const h = harness()
    await dedup({ repo: { owner: 'owner', repo: 'repo' }, payload: {
      issue: { number: 20, title: 'A distinct issue with no matching candidate', labels },
    } }, h.github, h.core)
    assert.deepEqual(h.calls, [])
  }
})

test('similar titles only produce advisory comments regardless of label permissions', async () => {
  for (const labelFailure of [false, true]) {
    const h = harness(labelFailure, [{ number: 10, title: 'Exact duplicate issue', html_url: 'https://example.invalid/10' }])
    await dedup({ repo: { owner: 'owner', repo: 'repo' }, payload: {
      issue: { number: 20, title: 'Exact duplicate issue', labels: [] },
    } }, h.github, h.core)
    assert.deepEqual(h.calls.map(call => call.action), ['createComment'])
    assert.match(String(h.calls[0]!.args.body), /#10/)
    assert.doesNotMatch(String(h.calls[0]!.args.body), /权限|标签/)
    assert.equal(h.warnings.length, 0)
  }
})
