import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'

/** The public mainView retention marker distinguishes the main conversation
 * from independently mounted sidebar sessions. Never fall back to the first
 * catalog row: that could expose another project's memories in Settings. */
export function mainWorkspaceCwd(snapshot: Pick<SessionListState, 'byId'>): string {
  const main = Object.values(snapshot.byId).filter(session => (session.retainedBy.mainView ?? 0) > 0)
  return main.length === 1 ? main[0]!.cwd ?? '' : ''
}
