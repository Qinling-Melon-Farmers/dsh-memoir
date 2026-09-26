/** Bounded, replayable activity projection. No synchronous Session log reads. */
import { z } from 'zod';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
export declare const ACTIVITY_KEY = "dsh-memoir/activity";
export declare const CALL_LIMIT = 4096;
declare const schema: z.ZodObject<{
    turn: z.ZodNumber;
    toolCalls: z.ZodNumber;
    calls: z.ZodArray<z.ZodString>;
    recorded: z.ZodBoolean;
    reminded: z.ZodBoolean;
}, z.core.$strip>;
export type MemoirActivity = z.infer<typeof schema>;
export declare const emptyActivity: () => MemoirActivity;
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        'dsh-memoir/activity': MemoirActivity;
    }
}
declare module '@deepseek-ai/dsh-session/types' {
    interface SessionEventMap {
        /** Receipt after the Memoir store commit; no memory content is copied. */
        'dsh-memoir/written': {
            turn: number;
            callId: string;
        };
    }
}
export declare const activityProjection: ProjectionDefinition<typeof ACTIVITY_KEY>;
export {};
