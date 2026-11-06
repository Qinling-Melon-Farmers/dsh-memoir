/** Bounded, replayable activity projection. No synchronous Session log reads. */
import { z } from 'zod';
import type { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
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
export declare const activityProjection: {
    key: typeof ACTIVITY_KEY;
    stateVersion: number;
    stateSchema: z.ZodObject<{
        turn: z.ZodNumber;
        toolCalls: z.ZodNumber;
        calls: z.ZodArray<z.ZodString>;
        memoirCalls: z.ZodArray<z.ZodString>;
        recorded: z.ZodBoolean;
        reminded: z.ZodBoolean;
        distilling: z.ZodBoolean;
        originTurn: z.ZodNullable<z.ZodNumber>;
    }, z.core.$strip>;
    init: () => MemoirActivity;
    apply(previous: MemoirActivity, event: SessionEvent): MemoirActivity;
};
/** Public handle shape shared by the modern SDK and our legacy adapter. */
export interface ActivityHandle {
    /** Read while the owning registration is active; legacy SDKs cannot read after final release. */
    stateOf(session: Session): MemoirActivity;
    dispose(): void | Promise<void>;
}
/** Await readiness before exposing tools or turn listeners. Registration owns its effect. */
export declare function registerActivity(registry: SessionProjectionRegistry): Promise<ActivityHandle>;
export {};
