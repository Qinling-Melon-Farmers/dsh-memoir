/** Bounded, replayable activity projection. No synchronous Session log reads. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

export const ACTIVITY_KEY = 'dsh-memoir/activity'
export const CALL_LIMIT = 4096
const schema = z.object({
  turn: z.number().int().nonnegative(),
  toolCalls: z.number().int().nonnegative(),
  calls: z.array(z.string()).max(CALL_LIMIT),
  memoirCalls: z.array(z.string()).max(CALL_LIMIT),
  recorded: z.boolean(),
  reminded: z.boolean(),
  distilling: z.boolean(),
  originTurn: z.number().int().positive().nullable(),
})
export type MemoirActivity = z.infer<typeof schema>
export const emptyActivity = (): MemoirActivity => ({ turn: 0, toolCalls: 0, calls: [], memoirCalls: [], recorded: false, reminded: false, distilling: false, originTurn: null })

/** Opaque metadata on the host-owned tool/result event, never a new event type. */
export function writeReceiptMeta(persisted: boolean) { return { memoir: { version: 1, persisted } } }
export function hasWriteReceipt(meta: unknown): boolean {
  if (typeof meta !== 'object' || meta === null || !('memoir' in meta)) return false
  const receipt = meta.memoir
  return typeof receipt === 'object' && receipt !== null && 'version' in receipt && receipt.version === 1 && 'persisted' in receipt && receipt.persisted === true
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap { 'dsh-memoir/activity': MemoirActivity }
}
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Legacy READ ONLY: repaired 0.8.1–0.9.0 logs. Never append this event. */
    'dsh-memoir/written': { turn: number; callId: string }
  }
}

export const activityProjection: ProjectionDefinition<typeof ACTIVITY_KEY> = {
  key: ACTIVITY_KEY,
  stateVersion: 3,
  stateSchema: schema,
  init: emptyActivity,
  apply(previous, event) {
    if (event.type === 'turn/start' || event.type === 'tool/call' || event.type === 'tool/result' || event.type === 'dsh-memoir/written') {
      const turn = event.data.turn
      if (turn < previous.turn) return previous
      const state = turn > previous.turn ? { ...emptyActivity(), turn } : previous
      if (event.type === 'turn/start') return state
      if (event.type === 'dsh-memoir/written') return state.recorded ? state : { ...state, recorded: true }
      if (event.type === 'tool/result') {
        // A successful dispatch alone is not a commit: needs-resolution can
        // also succeed. Only our explicit receipt on a correlated write counts.
        return !state.recorded && !event.data.message.isError && state.memoirCalls.includes(event.data.message.source.callId) && hasWriteReceipt(event.data.meta)
          ? { ...state, recorded: true } : state
      }
      if (state.calls.includes(event.data.callId)) return state
      return { ...state, toolCalls: state.toolCalls + 1, calls: [...state.calls, event.data.callId].slice(-CALL_LIMIT),
        memoirCalls: event.data.name === 'memoir_record' || event.data.name === 'memoir_update'
          ? [...state.memoirCalls, event.data.callId].slice(-CALL_LIMIT) : state.memoirCalls }
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
