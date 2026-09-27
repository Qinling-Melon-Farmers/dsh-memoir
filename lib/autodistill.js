/**
 * Automatic turn-end distillation: when the plugin is enabled, each turn of a
 * top-level agent that did real work (made tool calls) and did not already
 * persist memory is followed by a separate turn asking the agent to distill
 * the turn into memoir_record entries. Turns without tool activity are left
 * alone (no extra model cost), subagent sessions are excluded, and each work
 * turn queues at most one reminder. Never steer inside the completed work
 * turn: compact chat selects its last step as the answer. The replayable
 * activity projection excludes reminder turns, including failed/no-op ones.
 *
 * Pure decision helpers are exported for unit tests.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { DEFAULT_MEMOIR_LANGUAGE, hostCopy } from './i18n.js';
/** The follow-up instruction; the originating work turn is not rewritten. */
export function distillPrompt(language = DEFAULT_MEMOIR_LANGUAGE, originTurn) {
    const origin = originTurn === undefined ? '' : language === 'en'
        ? `Source work turn: ${originTurn}. This is a separate memory-only follow-up, not a new user task.\n`
        : `来源工作回合：${originTurn}。这是独立的记忆收尾回合，不是新的用户任务。\n`;
    return origin + hostCopy(language).distillPrompt;
}
/** Backwards-compatible Chinese prompt constant. */
export const DISTILL_PROMPT = distillPrompt();
/** Plugin identity stamped on the follow-up message source. */
export const AUTO_DISTILL_PLUGIN = 'dsh-memoir';
/** Pure event-fixture fold. Runtime activity comes from the host projection. */
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
        }
        if (event.type === 'dsh-memoir/written')
            recorded = true;
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
    capacity = 1024;
    reason = 'ready';
    get size() { return this.states.size; }
    clear() { this.states.clear(); }
    /**
     * Consume one eligible worked turn and decide whether all policy conditions
     * are ready. Duplicate events never advance the worked-turn counter.
     */
    consume(agentId, turn, toolCalls, policy, now) {
        let state = this.states.get(agentId);
        if (state === undefined) {
            state = { lastTurn: -Infinity, workedSinceReminder: 0 };
            this.states.set(agentId, state);
            if (this.states.size > this.capacity)
                this.states.delete(this.states.keys().next().value);
        }
        if (turn <= state.lastTurn) {
            this.reason = 'duplicate';
            return false;
        }
        state.lastTurn = turn;
        this.states.delete(agentId);
        this.states.set(agentId, state);
        state.workedSinceReminder += 1;
        const intervalReady = state.workedSinceReminder >= policy.every;
        const activityReady = toolCalls >= policy.minTools;
        const cooldownReady = state.lastRemindedAt === undefined || now - state.lastRemindedAt >= policy.cooldownMs;
        this.reason = !intervalReady ? 'interval' : !activityReady ? 'tools' : !cooldownReady ? 'cooldown' : 'ready';
        return this.reason === 'ready';
    }
    /** Record a successful followup; failed followup attempts do not start cooldown. */
    recordReminder(agentId, now) {
        const state = this.states.get(agentId);
        if (state === undefined)
            return;
        state.workedSinceReminder = 0;
        state.lastRemindedAt = now;
    }
    /** Drop all state for one agent (disposal hygiene). */
    forget(agentId) {
        this.states.delete(agentId);
    }
}
/** Process-local counters only; never retains message content or credentials. */
export class DistillDiagnostics {
    counts = {};
    last = null;
    workedTurns = 0;
    agents = 0;
    writes = { persisted: 0, afterReminder: 0, failed: 0, canceled: 0, needsResolution: 0, receiptFailed: 0 };
    write(outcome) { this.writes[outcome] += 1; }
    record(outcome, at, turn, toolCalls, agents) {
        this.counts[outcome] = (this.counts[outcome] ?? 0) + 1;
        if (['interval', 'tools', 'cooldown', 'queued', 'failed'].includes(outcome))
            this.workedTurns += 1;
        this.last = { outcome, at, turn, toolCalls };
        this.agents = agents;
    }
    snapshot() { return { counts: { ...this.counts }, writes: { ...this.writes }, workedTurns: this.workedTurns, agents: this.agents, last: this.last === null ? null : { ...this.last } }; }
    setAgents(agents) { this.agents = agents; }
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
    const dispose = wire.on('agent/turn-stopping', (payload) => {
        const { agent, turn, signal } = payload;
        const now = options.now?.() ?? Date.now();
        const report = (outcome, tools = 0) => options.diagnostics?.record(outcome, now, turn, tools, gate.size);
        if (!options.enabled()) {
            report('disabled');
            return;
        }
        if (isSubagentSession(agent)) {
            report('subagent');
            return;
        }
        if (signal.aborted) {
            report('aborted');
            return;
        }
        const activity = options.activity?.(agent);
        if (activity === undefined) {
            report('unavailable');
            return;
        }
        if (activity.turn > turn) {
            report('duplicate');
            return;
        }
        if (activity.turn === turn && activity.distilling) {
            report('distillation', activity.toolCalls);
            return;
        }
        const { recorded, toolCalls, reminded } = activity.turn === turn ? activity : { recorded: false, toolCalls: 0, reminded: false };
        if (toolCalls === 0 || recorded) {
            report(recorded ? 'recorded' : 'idle', toolCalls);
            return;
        }
        if (reminded) {
            report('duplicate', toolCalls);
            return;
        }
        const live = options.policy?.();
        const policy = {
            every: integerAtLeast(live?.every ?? options.every, 1, 1),
            cooldownMs: numberAtLeast(live?.cooldownMin ?? options.cooldownMin, 0, 0) * 60_000,
            minTools: integerAtLeast(live?.minTools ?? options.minTools, 1, 1),
        };
        if (!gate.consume(agent.id, turn, toolCalls, policy, now)) {
            report(gate.reason === 'ready' ? 'duplicate' : gate.reason, toolCalls);
            return;
        }
        try {
            agent.followup(createUserMessage({
                content: [{ type: 'text', text: distillPrompt(options.language?.(), turn) }],
                source: { kind: AUTO_DISTILL_PLUGIN, originTurn: turn },
            }));
        }
        catch (error) {
            report('failed', toolCalls);
            throw error;
        }
        gate.recordReminder(agent.id, now);
        report('queued', toolCalls);
    });
    const disposeAgent = wire.onDisposed?.((agentId) => { gate.forget(agentId); options.diagnostics?.setAgents(gate.size); });
    return () => { dispose(); disposeAgent?.(); gate.clear(); options.diagnostics?.setAgents(0); };
}
