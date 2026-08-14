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
/** The steering prompt injected at the end of an active turn. */
export const DISTILL_PROMPT = '（dsh-memoir 自动收尾）本轮工作已结束，请把本轮归纳沉淀进项目记忆：\n' +
    '1. 若本轮有实质产出、踩坑结论或下一步安排，调用 memoir_record 分条记录（section 取 work 工作记录 / lessons 经验教训 / actions 行动指南，可用 title 一句话概括）；\n' +
    '2. 若本轮已经记录过、或没有值得沉淀的内容，直接回复「本轮无需沉淀」，不要调用任何工具。\n' +
    '最终回复保持一句话以内，不要展开。';
/** Plugin identity stamped on the steering message source. */
export const AUTO_DISTILL_PLUGIN = 'dsh-memoir';
/** Scan the tail of a session log for one turn's tool activity. */
export function turnActivity(events, turn) {
    let worked = false;
    let recorded = false;
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
            worked = true;
            if (data.name === 'memoir_record')
                recorded = true;
        }
    }
    return { worked, recorded };
}
/** Subagent sessions (and any nested delegation) never get distilled. */
export function isSubagentSession(agent) {
    return agent.session.header.origin === 'subagent' || (agent.session.header.delegationDepth ?? 0) > 0;
}
/** Per-agent memory of turns already steered (with pruning). */
export class AutoDistillGate {
    steered = new Map();
    /** Claim a turn for steering; false when already claimed (or pruned-out). */
    consume(agentId, turn) {
        let set = this.steered.get(agentId);
        if (set === undefined) {
            set = new Set();
            this.steered.set(agentId, set);
        }
        if (set.has(turn))
            return false;
        set.add(turn);
        for (const t of [...set]) {
            if (t < turn - 100)
                set.delete(t);
        }
        return true;
    }
    /** Drop all state for one agent (disposal hygiene). */
    forget(agentId) {
        this.steered.delete(agentId);
    }
}
/**
 * Install the turn-end listener. The returned disposer removes the listener.
 * @param wire - the event wire (the cordis context).
 * @param options.enabled - live read of the autoDistill switch.
 */
export function installAutoDistill(wire, options) {
    const gate = new AutoDistillGate();
    return wire.on('agent/turn-stopping', (payload) => {
        if (!options.enabled())
            return;
        const { agent, turn, signal } = payload;
        if (isSubagentSession(agent))
            return;
        if (signal.aborted)
            return;
        const { worked, recorded } = turnActivity(agent.session.events, turn);
        if (!worked || recorded)
            return;
        if (!gate.consume(agent.id, turn))
            return;
        agent.steer(createUserMessage({
            content: [{ type: 'text', text: DISTILL_PROMPT }],
            source: { kind: 'plugin', plugin: AUTO_DISTILL_PLUGIN },
        }));
    });
}
