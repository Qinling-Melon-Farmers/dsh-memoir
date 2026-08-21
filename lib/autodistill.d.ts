/**
 * Automatic turn-end distillation: when the plugin is enabled, each turn of a
 * top-level agent that did real work (made tool calls) and did not already
 * record memory is followed by one steering step asking the agent to distill
 * the turn into memoir_record entries. Turns without tool activity are left
 * alone (no extra model cost), subagent sessions are never steered, and each
 * turn is steered at most once — the steering step runs inside the same turn,
 * so the per-turn gate is what lets the turn close afterwards.
 *
 * Pure decision helpers are exported for unit tests.
 */
import type { UserMessage } from '@deepseek-ai/dsh-llm';
/** The steering prompt injected at the end of an active turn. */
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
/** Scan the tail of a session log for one turn's tool activity. */
export declare function turnActivity(events: readonly TurnEventLike[], turn: number): TurnActivity;
/** The agent surface the turn-stopping listener needs. */
export interface AutoDistillAgentLike {
    id: string;
    session: {
        header: {
            origin?: string;
            delegationDepth?: number;
        };
        events: readonly TurnEventLike[];
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
export interface TurnStoppingPayload {
    agent: AutoDistillAgentLike;
    turn: number;
    signal: AbortSignal;
}
/** The event-wire surface the installer needs (satisfied by ctx.on). */
export interface AutoDistillWire {
    on(name: 'agent/turn-stopping', listener: (payload: TurnStoppingPayload) => void): () => void;
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
    now?: () => number;
}): () => void;
