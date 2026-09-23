import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { mainWorkspaceCwd } from '../src/client/native-navigation.ts'

function row(id: string, cwd: string | undefined, main = 0): SessionListState['byId'][SessionId] {
  return { id: SessionId(id), cwd, displayTitle: id, running: false,
    blank: false, updatedAt: 1, retainedBy: main > 0 ? { mainView: main } : {} }
}

test('native Settings follows mainView rather than the first or sidebar session', () => {
  assert.equal(mainWorkspaceCwd({ byId: {
    [SessionId('sidebar')]: row('sidebar', '/project-b'),
    [SessionId('main')]: row('main', '/project-a', 1),
  } }), '/project-a')
})

test('native Settings stays global when no main session or cwd is available', () => {
  assert.equal(mainWorkspaceCwd({ byId: {} }), '')
  assert.equal(mainWorkspaceCwd({ byId: { [SessionId('side')]: row('side', '/other') } }), '')
  assert.equal(mainWorkspaceCwd({ byId: { [SessionId('main')]: row('main', undefined, 1) } }), '')
})

test('ambiguous transient mainView ownership never selects another project', () => {
  assert.equal(mainWorkspaceCwd({ byId: {
    [SessionId('a')]: row('a', '/a', 1), [SessionId('b')]: row('b', '/b', 1),
  } }), '')
})
