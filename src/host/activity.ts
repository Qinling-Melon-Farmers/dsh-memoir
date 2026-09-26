/** Bounded, replayable activity projection. No synchronous Session log reads. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

export const ACTIVITY_KEY = 'dsh-memoir/activity'
export const CALL_LIMIT = 4096
const schema = z.object({
  turn: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  calls: z.array(z.string()).max(CALL_LIMIT),
  recorded: z.boolean(),
  reminded: z.boolean(),
})
export type MemoirActivity = z.infer<typeof schema>
export const emptyActivity = (): MemoirActivity => ({ turn: 0, toolCalls: 0, calls: [], recorded: false, reminded: false })

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { 'dsh-memoir/activity': MemoirActivity }
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Receipt after the Memoir store commit; no memory content is copied. */
    'dsh-memoir/written': { turn: number; callId: string }
  }
}

export const activityProjection: ProjectionDefinition<typeof ACTIVITY_KEY> = {
  key: ACTIVITY_KEY,
  stateVersion: 1,
  stateSchema: schema,
  init: emptyActivity,
  apply(previous, event) {
    if (event.type === 'turn/start' || event.type === 'tool/call' || event.type === 'dsh-memoir/written') {
      const turn = event.data.turn
      if (turn < previous.turn) return previous
      const state = turn > previous.turn ? { ...emptyActivity(), turn } : previous
      if (event.type === 'turn/start') return state
      if (event.type === 'dsh-memoir/written') return state.recorded ? state : { ...state, recorded: true }
      if (state.calls.includes(event.data.callId)) return state
      return { ...state, toolCalls: state.toolCalls + 1, calls: [...state.calls, event.data.callId].slice(-CALL_LIMIT) }
    }
    if (event.type === 'agent/inbox/spliced' && event.data.target === 'next-step' &&
      event.data.inserted.some(message => message.source.kind === 'dsh-memoir')) {
      return previous.reminded ? previous : { ...previous, reminded: true }
    }
    return previous
  },
}
