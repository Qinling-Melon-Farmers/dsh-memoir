/**
 * Automatic turn-end distillation: when the plugin is enabled, each turn of a
 * top-level agent that did real work (made tool calls) and did not already
 * persist memory is followed by one steering step asking the agent to distill
 * the turn into memoir_record entries. Turns without tool activity are left
 * alone (no extra model cost), subagent sessions are never steered, and each
 * turn is steered at most once — the steering step runs inside the same turn,
 * so the per-turn gate is what lets the turn close afterwards.
 *
 * Pure decision helpers are exported for unit tests.
 */
import type { UserMessage } from '@deepseek-ai/dsh-llm';
import type { MemoirLanguage } from './i18n.js';
import type { MemoirActivity } from './activity.js';
declare module '@deepseek-ai/dsh-llm/message' {
    interface MessageSourceMap {
        'dsh-memoir': {
            kind: 'dsh-memoir';
        };
    }
}
/** The steering prompt injected at the end of an active turn. */
export declare function distillPrompt(language?: MemoirLanguage): string;
/** Backwards-compatible Chinese prompt constant. */
export declare const DISTILL_PROMPT: string;
/** Plugin identity stamped on the steering message source. */
export declare const AUTO_DISTILL_PLUGIN = "dsh-memoir";
/** A minimal event view for the turn-activity scan (data is narrowed inside). */
export interface TurnEventLike {
    type: string;
    data?: unknown;
}
export interface TurnActivity {
    worked: boolean;
    recorded: boolean;
    toolCalls: number;
}
/** Pure event-fixture fold. Runtime activity comes from the host projection. */
export declare function turnActivity(events: readonly TurnEventLike[], turn: number): TurnActivity;
/** The agent surface the turn-stopping listener needs. */
export interface AutoDistillAgentLike {
    id: string;
    session: {
        header: {
            origin?: string;
            delegationDepth?: number;
        };
        readonly events?: readonly TurnEventLike[];
        snapshotEvents?: () => readonly TurnEventLike[];
    };
    steer(message: UserMessage): void;
}
/** Subagent sessions (and any nested delegation) never get distilled. */
export declare function isSubagentSession(agent: AutoDistillAgentLike): boolean;
export interface AutoDistillPolicy {
    every: number;
    cooldownMs: number;
    minTools: number;
}
/** Per-agent frequency, cooldown, and duplicate-turn state (with pruning). */
export declare class AutoDistillGate {
    private states;
    readonly capacity = 1024;
    reason: 'duplicate' | 'interval' | 'tools' | 'cooldown' | 'ready';
    get size(): number;
    clear(): void;
    /**
     * Consume one eligible worked turn and decide whether all policy conditions
     * are ready. Duplicate events never advance the worked-turn counter.
     */
    consume(agentId: string, turn: number, toolCalls: number, policy: AutoDistillPolicy, now: number): boolean;
    /** Record a successful steer; failed steer attempts do not start cooldown. */
    recordSteer(agentId: string, now: number): void;
    /** Drop all state for one agent (disposal hygiene). */
    forget(agentId: string): void;
}
export type DistillOutcome = 'disabled' | 'subagent' | 'aborted' | 'idle' | 'recorded' | 'duplicate' | 'interval' | 'tools' | 'cooldown' | 'steered' | 'failed' | 'unavailable';
/** Process-local counters only; never retains message content or credentials. */
export declare class DistillDiagnostics {
    private counts;
    private last;
    private workedTurns;
    private agents;
    private writes;
    write(outcome: keyof DistillDiagnostics['writes']): void;
    record(outcome: DistillOutcome, at: number, turn: number, toolCalls: number, agents: number): void;
    snapshot(): {
        counts: {
            recorded?: number | undefined;
            subagent?: number | undefined;
            duplicate?: number | undefined;
            interval?: number | undefined;
            tools?: number | undefined;
            cooldown?: number | undefined;
            disabled?: number | undefined;
            aborted?: number | undefined;
            idle?: number | undefined;
            steered?: number | undefined;
            failed?: number | undefined;
            unavailable?: number | undefined;
        };
        writes: {
            persisted: number;
            afterReminder: number;
            failed: number;
            canceled: number;
            needsResolution: number;
            receiptFailed: number;
        };
        workedTurns: number;
        agents: number;
        last: {
            outcome: DistillOutcome;
            at: number;
            turn: number;
            toolCalls: number;
        } | null;
    };
    setAgents(agents: number): void;
}
export interface TurnStoppingPayload {
    agent: AutoDistillAgentLike;
    turn: number;
    signal: AbortSignal;
}
/** The event-wire surface the installer needs (satisfied by ctx.on). */
export interface AutoDistillWire {
    on(name: 'agent/turn-stopping', listener: (payload: TurnStoppingPayload) => void): () => void;
    onDisposed?(listener: (agentId: string) => void): () => void;
}
/**
 * Install the turn-end listener. The returned disposer removes the listener.
 * @param wire - the event wire (the cordis context).
 * @param options.enabled - live read of the autoDistill switch.
 */
export declare function installAutoDistill(wire: AutoDistillWire, options: {
    enabled: () => boolean;
    every?: number;
    cooldownMin?: number;
    minTools?: number;
    /** Optional live policy source used by the Web settings panel. */
    policy?: () => {
        every?: number;
        cooldownMin?: number;
        minTools?: number;
    };
    /** Optional live language source for the steering instruction. */
    language?: () => MemoirLanguage;
    now?: () => number;
    diagnostics?: DistillDiagnostics;
    /** Public host projection at the exact Session cursor; absent means skip safely. */
    activity?: (agent: AutoDistillAgentLike) => MemoirActivity | undefined;
}): () => void;
