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
const run = new AsyncFunction('context', 'github', script)

type Issue = { number: number; body: string; labels?: { name: string }[]; pull_request?: object }
type Call = { action: 'addLabels' | 'createComment' | 'update'; args: Record<string, unknown> }

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

async function execute(issue: Issue, labelFailure = false): Promise<Call[]> {
  const calls: Call[] = []
  const context = { payload: { issue }, repo: { owner: 'owner', repo: 'repo' } }
  const github = { rest: { issues: Object.fromEntries(
    (['addLabels', 'createComment', 'update'] as const).map(action => [action, async (args: Record<string, unknown>) => {
      if (action === 'addLabels' && labelFailure) throw new Error('API label permission failure')
      calls.push({ action, args })
    }]),
  ) } }
  if (labelFailure) {
    await assert.rejects(run(context, github), /API label permission failure/)
  } else {
    await run(context, github)
  }
  return calls
}

test('issue #12 regression: complete external bug report without labels is accepted and labeled', async () => {
  const calls = await execute({ number: 12, body: report() })
  assert.deepEqual(calls, [{ action: 'addLabels', args: { owner: 'owner', repo: 'repo', issue_number: 12, labels: ['bug'] } }])
})

test('already labeled complete bug report has no redundant mutations', async () => {
  assert.deepEqual(await execute({ number: 12, body: report(), labels: [{ name: 'bug' }] }), [])
})

test('request/question needs only its own sections and is not labeled as a bug', async () => {
  assert.deepEqual(await execute({ number: 13, body: report('问题') }), [])
})

test('missing bug content still closes with a useful reason and a request to complete the original issue', async () => {
  const calls = await execute({ number: 12, body: report('Bug 报告', { '补丁': '<!-- placeholder -->\n_No response_' }) })
  assert.deepEqual(calls.map(call => call.action), ['addLabels', 'createComment', 'update'])
  assert.match(String(calls[1]!.args.body), /缺少或为空的必填部分：补丁/)
  assert.match(String(calls[1]!.args.body), /直接补全本 Issue/)
  assert.doesNotMatch(String(calls[1]!.args.body), /Bug 报告必须附带 bug 标签|重新发起/)
  assert.equal(calls[2]!.args.state, 'closed')
  assert.equal(calls[2]!.args.state_reason, 'not_planned')
})

test('label-based bug classification still validates evidence and bug-specific fields', async () => {
  const calls = await execute({ number: 14, body: report('问题'), labels: [{ name: 'bug' }] })
  assert.deepEqual(calls.map(call => call.action), ['createComment', 'update'])
  assert.match(String(calls[0]!.args.body), /缺少或为空的必填部分：证据截图 \/ 日志, 冒烟测试, 引用代码, 补丁/)
})

test('missing screenshot evidence is not bypassed by automatic labeling', async () => {
  const calls = await execute({ number: 12, body: report('Bug 报告', { '证据截图 / 日志': 'No attached evidence.' }) })
  assert.deepEqual(calls.map(call => call.action), ['addLabels', 'createComment', 'update'])
  assert.match(String(calls[1]!.args.body), /证据截图 \/ 日志必须包含/)
})

test('pull requests are not processed as issues', async () => {
  assert.deepEqual(await execute({ number: 12, body: '', pull_request: {} }), [])
})

test('bot labeling API failure does not close or blame the reporter', async () => {
  assert.deepEqual(await execute({ number: 12, body: report() }, true), [])
})
