import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Execute the actual trusted workflow script against an in-memory GitHub API.
// Issue bodies remain data; no external requests or repository writes occur.
const workflow = readFileSync(new URL('../.github/workflows/issue-template-enforcer.yml', import.meta.url), 'utf8')
const marker = '          script: |'
assert.equal(workflow.split(marker).length, 2)
const script = workflow.split(marker)[1]!.split(/\r?\n/).map(line => line.replace(/^ {12}/, '')).join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const run = new AsyncFunction('context', 'github', 'core', script)

type Issue = { number: number; body: string; state?: string; labels?: Array<string | { name: string }>; pull_request?: object }
type Call = { action: 'addLabels' | 'createComment' | 'update' | 'updateComment'; args: Record<string, unknown> }

function report(type = 'Bug 报告', overrides: Record<string, string> = {}): string {
  const sections: Record<string, string> = {
    '涉及模块': 'autodistill',
    'Issue 类型': type,
    '摘要': 'The compact answer is folded after a plugin step.',
    '预期结果': 'Keep the answer visible.',
    '详情 / 复现步骤': '1. Complete a worked turn. 2. Run the distillation step.',
    '环境信息': 'DSH 0.1.7-rc.2, Memoir 0.8.0, macOS.',
    ...(type === 'Bug 报告' ? {
      '证据截图 / 日志': '![synthetic evidence](https://example.invalid/evidence.png)',
      '冒烟测试': 'Disabling automatic distillation avoids the symptom.',
      '引用代码': 'latestAnswer examines the last step.',
      '补丁': 'Preserve the user-facing answer; host-side investigation required.',
    } : {}),
    ...overrides,
  }
  return Object.entries(sections).map(([heading, content]) => `### ${heading}\n\n${content}`).join('\n\n')
}

async function execute(issue: Issue, labelFailure = false, warnings: string[] = [], comments: unknown[] = []): Promise<Call[]> {
  const calls: Call[] = []
  const context = { payload: { issue }, repo: { owner: 'owner', repo: 'repo' } }
  const github = { paginate: async () => comments, rest: { issues: Object.fromEntries(
    (['addLabels', 'createComment', 'update', 'updateComment', 'listComments'] as const).map(action => [action, async (args: Record<string, unknown>) => {
      if (action === 'addLabels' && labelFailure) throw new Error('API label permission failure')
      if (action !== 'listComments') calls.push({ action, args })
    }]),
  ) } }
  await run(context, github, { warning: (message: string) => warnings.push(message) })
  return calls
}

test('issue #12 regression: complete external bug report without labels is accepted and labeled', async () => {
  const calls = await execute({ number: 12, body: report() })
  assert.deepEqual(calls, [{ action: 'addLabels', args: { owner: 'owner', repo: 'repo', issue_number: 12, labels: ['bug'] } }])
})

test('already labeled complete bug report has no redundant mutations', async () => {
  assert.deepEqual(await execute({ number: 12, body: report(), labels: [{ name: 'bug' }] }), [])
})

const classifications = [
  ['Bug 报告', 'bug'], ['功能请求', 'enhancement'], ['文档', 'documentation'], ['问题', 'question'],
] as const

for (const [type, label] of classifications) {
  test(`external ${type} without labels is accepted and gets only ${label}`, async () => {
    assert.deepEqual(await execute({ number: 20, body: report(type) }), [
      { action: 'addLabels', args: { owner: 'owner', repo: 'repo', issue_number: 20, labels: [label] } },
    ])
  })

  test(`${type} preserves unrelated labels and reopening does not add duplicate labels`, async () => {
    const labels = [{ name: 'accessibility' }, { name: 'help wanted' }]
    const issue = { number: 20, body: report(type), labels }
    const snapshot = structuredClone(issue)
    assert.deepEqual((await execute(issue)).map(call => call.args.labels), [[label]])
    assert.deepEqual(issue, snapshot, 'do not replace labels or edit issue body')
    assert.deepEqual(await execute({ ...issue, labels: [...labels, { name: label.toUpperCase() }] }), [])
    assert.deepEqual(await execute({ ...issue, labels: [label] }), [], 'string label representation is also supported')
  })

  test(`${type} label API failure only warns and does not reject a valid issue`, async () => {
    const warnings: string[] = []
    assert.deepEqual(await execute({ number: 20, body: report(type) }, true, warnings), [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /maintainers should check/)
    assert.match(warnings[0]!, /Reporters do not need to add labels/)
  })

  test(`${type} label API failure does not bypass independent body validation`, async () => {
    const warnings: string[] = []
    const calls = await execute({ number: 20, body: report(type, { '摘要': '_No response_' }) }, true, warnings)
    assert.equal(warnings.length, 1)
    assert.deepEqual(calls.map(call => call.action), ['createComment'])
    assert.match(String(calls[0]!.args.body), /缺少或为空的必填部分：摘要/)
    assert.doesNotMatch(String(calls[0]!.args.body), /权限|必须附带.*标签/)
    assert.ok(calls.every(call => call.action !== 'update'))
  })
}

test('classification covers both forms; Other and unknown values remain unclassified', async () => {
  const options = ['bug_report', 'standard_issue'].flatMap(name => {
    const form = readFileSync(new URL(`../.github/ISSUE_TEMPLATE/${name}.yml`, import.meta.url), 'utf8')
    const section = form.match(/id: issue-type[\s\S]*?options:\r?\n((?:\s+- [^\r\n]+\r?\n)+)/)![1]!
    return section.trim().split(/\r?\n/).map(line => line.trim().replace(/^- /, ''))
  })
  assert.deepEqual(options, [...classifications.map(([type]) => type), '其他'])
  for (const type of ['其他', 'unrecognized', '__proto__', 'constructor']) {
    assert.deepEqual(await execute({ number: 21, body: report(type) }), [])
  }
})

test('moderation labels do not make a complete non-bug issue invalid', async () => {
  for (const name of ['duplicate', 'invalid', 'wontfix', 'good first issue', 'help wanted', 'accessibility']) {
    const calls = await execute({ number: 21, body: report('问题'), labels: [{ name }] })
    assert.deepEqual(calls.map(call => [call.action, call.args.labels]), [['addLabels', ['question']]])
  }
})

test('a reporter is not required to supply a patch or code references', async () => {
  const calls = await execute({ number: 12, body: report('Bug 报告', { '补丁': '<!-- placeholder -->\n_No response_' }) })
  assert.deepEqual(calls.map(call => call.action), ['addLabels'])
})

test('label-based bug classification still validates evidence and bug-specific fields', async () => {
  const calls = await execute({ number: 14, body: report('问题'), labels: [{ name: 'bug' }] })
  assert.deepEqual(calls.map(call => call.action), ['createComment'])
  assert.match(String(calls[0]!.args.body), /缺少或为空的必填部分：证据截图 \/ 日志/)
})

test('issue #14: plain text and indented logs are accepted without a screenshot', async () => {
  for (const evidence of ['failed to observe session: unknown event type dsh-memoir/written', '    {"type":"dsh-memoir/written","seq":62}', '```text\nSessionFormatUnsupportedError\n```', 'https://example.invalid/log.txt']) {
    const calls = await execute({ number: 14, body: report('Bug 报告', { '证据截图 / 日志': evidence }), labels: ['bug'] })
    assert.deepEqual(calls, [])
  }
})

test('pull requests are not processed as issues', async () => {
  assert.deepEqual(await execute({ number: 12, body: '', pull_request: {} }), [])
})

test('bot labeling API failure does not close or blame the reporter', async () => {
  assert.deepEqual(await execute({ number: 12, body: report() }, true), [])
})

test('bug evidence remains required even when automatic labeling fails', async () => {
  const calls = await execute({ number: 12, body: report('Bug 报告', { '证据截图 / 日志': '_No response_' }) }, true)
  assert.deepEqual(calls.map(call => call.action), ['createComment'])
  assert.match(String(calls[0]!.args.body), /缺少或为空的必填部分：证据截图/)
})

test('advisories are idempotent, edited in place, and never override a reopened issue', async () => {
  const issue = { number: 14, state: 'open', body: report('Bug 报告', { '摘要': '' }), labels: ['bug'] }
  const first = await execute(issue)
  const comment = { id: 3, user: { login: 'github-actions[bot]' }, body: first[0]!.args.body }
  assert.deepEqual(await execute(issue, false, [], [comment]), [])
  const completed = await execute({ ...issue, body: report() }, false, [], [comment])
  assert.deepEqual(completed.map(x => x.action), ['updateComment'])
  assert.equal(completed[0]!.args.comment_id, 3)
  assert.deepEqual(await execute({ ...issue, state: 'closed' }), [])
  assert.doesNotMatch(script, /issues\.update\(/)
})

test('similar titles only suggest a related issue; no duplicate label or auto-closure', async () => {
  const dedup = readFileSync(new URL('../.github/workflows/issue-dedup.yml', import.meta.url), 'utf8')
  const source = dedup.split(marker)[1]!.split(/\r?\n/).map(line => line.replace(/^ {12}/, '')).join('\n')
  const runDedup = new AsyncFunction('context', 'github', 'core', source)
  const calls: unknown[] = []
  const comments: unknown[] = []
  const github = { paginate: async () => comments, rest: {
    search: { issuesAndPullRequests: async () => ({ data: { items: [{ number: 13, title: 'Memory failure', html_url: 'https://github.com/owner/repo/issues/13' }] } }) },
    issues: { listComments: () => {}, createComment: async (args: {body: string}) => { calls.push(args); comments.push({user:{login:'github-actions[bot]'}, body:args.body}) } },
  } }
  const context = { repo: {owner:'owner',repo:'repo'}, payload: { issue: { number:14, title:'Memory failure', state:'open' } } }
  await runDedup(context, github, {})
  await runDedup(context, github, {})
  assert.equal(calls.length, 1)
  assert.doesNotMatch(source, /issues\.(?:update|addLabels)\(/)
})
