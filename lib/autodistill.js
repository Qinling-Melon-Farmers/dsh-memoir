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
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy } from './i18n.js';
/** The steering prompt injected at the end of an active turn. */
export function distillPrompt(language = DEFAULT_MEMOIR_LANGUAGE) {
    return hostCopy(language).distillPrompt;
}
/** Backwards-compatible Chinese prompt constant. */
export const DISTILL_PROMPT = distillPrompt();
/** Plugin identity stamped on the steering message source. */
export const AUTO_DISTILL_PLUGIN = 'dsh-memoir';
/** Scan the tail of a session log for one turn's tool activity. */
export function turnActivity(events, turn) {
    let recorded = false;
    let toolCalls = 0;
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        const data = event.data;
        if (data === undefined || typeof data.turn !== 'number')
            continue;
        if (data.turn < turn)
            break;
        if (data.turn !== turn)
            continue;
        if (event.type === 'tool/call') {
            toolCalls += 1;
            if (data.name === 'memoir_record')
                recorded = true;
        }
    }
    return { worked: toolCalls > 0, recorded, toolCalls };
}
/** Subagent sessions (and any nested delegation) never get distilled. */
export function isSubagentSession(agent) {
    return agent.session.header.origin === 'subagent' || (agent.session.header.delegationDepth ?? 0) > 0;
}
/** Per-agent frequency, cooldown, and duplicate-turn state (with pruning). */
export class AutoDistillGate {
    states = new Map();
    /**
     * Consume one eligible worked turn and decide whether all policy conditions
     * are ready. Duplicate events never advance the worked-turn counter.
     */
    consume(agentId, turn, toolCalls, policy, now) {
        let state = this.states.get(agentId);
        if (state === undefined) {
            state = { processedTurns: new Set(), workedSinceSteer: 0 };
            this.states.set(agentId, state);
        }
        if (state.processedTurns.has(turn))
            return false;
        state.processedTurns.add(turn);
        for (const value of [...state.processedTurns]) {
            if (value < turn - 100)
                state.processedTurns.delete(value);
        }
        state.workedSinceSteer += 1;
        const intervalReady = state.workedSinceSteer >= policy.every;
        const activityReady = toolCalls >= policy.minTools;
        const cooldownReady = state.lastSteeredAt === undefined || now - state.lastSteeredAt >= policy.cooldownMs;
        return intervalReady && activityReady && cooldownReady;
    }
    /** Record a successful steer; failed steer attempts do not start cooldown. */
    recordSteer(agentId, now) {
        const state = this.states.get(agentId);
        if (state === undefined)
            return;
        state.workedSinceSteer = 0;
        state.lastSteeredAt = now;
    }
    /** Drop all state for one agent (disposal hygiene). */
    forget(agentId) {
        this.states.delete(agentId);
    }
}
/**
 * Install the turn-end listener. The returned disposer removes the listener.
 * @param wire - the event wire (the cordis context).
 * @param options.enabled - live read of the autoDistill switch.
 */
export function installAutoDistill(wire, options) {
    const gate = new AutoDistillGate();
    const integerAtLeast = (value, fallback, minimum) => typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback;
    const numberAtLeast = (value, fallback, minimum) => typeof value === 'number' && Number.isFinite(value) ? Math.max(minimum, value) : fallback;
    return wire.on('agent/turn-stopping', (payload) => {
        if (!options.enabled())
            return;
        const { agent, turn, signal } = payload;
        if (isSubagentSession(agent))
            return;
        if (signal.aborted)
            return;
        const { worked, recorded, toolCalls } = turnActivity(agent.session.events, turn);
        if (!worked || recorded)
            return;
        const live = options.policy?.();
        const policy = {
            every: integerAtLeast(live?.every ?? options.every, 1, 1),
            cooldownMs: numberAtLeast(live?.cooldownMin ?? options.cooldownMin, 0, 0) * 60_000,
            minTools: integerAtLeast(live?.minTools ?? options.minTools, 1, 1),
        };
        const now = options.now?.() ?? Date.now();
        if (!gate.consume(agent.id, turn, toolCalls, policy, now))
            return;
        agent.steer(createUserMessage({
            content: [{ type: 'text', text: distillPrompt(options.language?.()) }],
            source: { kind: 'plugin', plugin: AUTO_DISTILL_PLUGIN },
        }));
        gate.recordSteer(agent.id, now);
    });
}
