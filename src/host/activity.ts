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
  distilling: z.boolean(),
  originTurn: z.number().int().positive().nullable(),
})
export type MemoirActivity = z.infer<typeof schema>
export const emptyActivity = (): MemoirActivity => ({ turn: 0, toolCalls: 0, calls: [], recorded: false, reminded: false, distilling: false, originTurn: null })

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
  stateVersion: 2,
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
    // next-step is retained for replay of pre-0.8.2 sessions. New reminders
    // use next-turn, protecting the original turn's compact answer boundary.
    if (event.type === 'agent/inbox/spliced' &&
      event.data.inserted.some(message => message.source.kind === 'dsh-memoir')) {
      return previous.reminded ? previous : { ...previous, reminded: true }
    }
    // Persisted source identity survives reloads/remounts. Do not rely on a
    // process-local flag: a failed or empty distillation must not recurse.
    if (event.type === 'user/message' && event.data.source.kind === 'dsh-memoir') {
      const origin = event.data.source.originTurn
      const originTurn = typeof origin === 'number' && Number.isInteger(origin) && origin > 0 && origin < previous.turn ? origin : null
      return { ...previous, reminded: true, distilling: true, originTurn }
    }
    return previous
  },
}
