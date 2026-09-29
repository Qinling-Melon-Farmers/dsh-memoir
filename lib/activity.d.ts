/** Bounded, replayable activity projection. No synchronous Session log reads. */
import { z } from 'zod';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
export declare const ACTIVITY_KEY = "dsh-memoir/activity";
export declare const CALL_LIMIT = 4096;
declare const schema: z.ZodObject<{
    turn: z.ZodNumber;
    toolCalls: z.ZodNumber;
    calls: z.ZodArray<z.ZodString>;
    memoirCalls: z.ZodArray<z.ZodString>;
    recorded: z.ZodBoolean;
    reminded: z.ZodBoolean;
    distilling: z.ZodBoolean;
    originTurn: z.ZodNullable<z.ZodNumber>;
}, z.core.$strip>;
export type MemoirActivity = z.infer<typeof schema>;
export declare const emptyActivity: () => MemoirActivity;
/** Opaque metadata on the host-owned tool/result event, never a new event type. */
export declare function writeReceiptMeta(persisted: boolean): {
    memoir: {
        version: number;
        persisted: boolean;
    };
};
export declare function hasWriteReceipt(meta: unknown): boolean;
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        'dsh-memoir/activity': MemoirActivity;
    }
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Legacy READ ONLY: repaired 0.8.1–0.9.0 logs. Never append this event. */
        'dsh-memoir/written': {
            turn: number;
            callId: string;
        };
    }
}
export declare const activityProjection: ProjectionDefinition<typeof ACTIVITY_KEY>;
export {};
