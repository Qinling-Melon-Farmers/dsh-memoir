/** Let Cordis run service initialization through the public plugin lifecycle. */
import type { Context } from '@deepseek-ai/cordis'
import { AgentRegistry } from '@deepseek-ai/dsh-agent'
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'

export async function mountAgentRegistry(ctx: Context): Promise<void> {
  await ctx.plugin(AgentRegistry)
}

export async function mountNativeTools(ctx: Context): Promise<void> {
  new ToolRuntime(ctx)
  // rc5 executes tools itself and has no executor package. New SDKs require
  // the official plugin for both model-facing schemas and real execution.
  if ('setExecutor' in ctx.tools) {
    const nativeExecutorPackage = '@deepseek-ai/dsh-tool-executor-native'
    await ctx.plugin(await import(nativeExecutorPackage))
  }
}

export async function mountAgentLoop(ctx: Context, maxParallelToolCalls?: number): Promise<AgentLoop> {
  await ctx.plugin(AgentLoop, { agents: [], maxParallelToolCalls })
  return ctx.agentLoop
}
