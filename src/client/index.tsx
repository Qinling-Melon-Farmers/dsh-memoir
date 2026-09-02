/**
 * Browser-half entry for the DSH 0.1.2 alpha client architecture.
 *
 * The alpha shell removed dsh-client-runtime and exposes additive UI through
 * domain-owned slots. Memoir therefore registers as a native Conversation
 * view and a native Settings section. No CSS-module selector or DOM takeover
 * is used for mounting; the host remains the sole owner of layout and view
 * navigation.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { useEffect } from 'react'
import { MemoirApi } from './api.js'
import { makeT } from './i18n.js'
import { MemoirPanel } from './panel.jsx'
import { mountPanelStyles } from './styles.js'

type NativeGlobalProps = { useSessions: UseSessions }
type NativeSettingsSectionProps = PropsRuntime<'settings.section'> & NativeGlobalProps

/** Required alpha services; package.json injects the packages that provide them. */
export const inject = ['sessions', 'slots']

/** Reveal a source turn after the Session Controller has opened its session. */
function revealSourceTurn(turnId: number | undefined): void {
  if (turnId === undefined) return
  const reveal = () => document
    .querySelector<HTMLElement>(`[data-turn-tail="${turnId}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  setTimeout(reveal, 0)
  setTimeout(reveal, 250)
}

/** Native per-session Conversation view. */
function ConversationMemoirView({
  api,
  ctx,
  t,
  sessionId,
  useSessions,
  viewRequest,
  completeViewRequest,
}: ConvViewProps & NativeGlobalProps & {
  api: MemoirApi
  ctx: Context
  t: (key: string) => string
}) {
  const cwd = useSessions((snapshot: SessionListState) => snapshot.byId[sessionId]?.cwd ?? '')

  // A future native deep-link may select Memoir with an opaque focus token.
  // The current panel has no focus-addressed rows, so acknowledge it once to
  // avoid retaining a stale one-shot request in the Conversation store.
  useEffect(() => {
    if (viewRequest?.view === 'memoir') completeViewRequest()
  }, [viewRequest, completeViewRequest])

  return (
    <div
      className="memoir-native-view"
      data-dsh-plugin="memoir"
      data-dsh-part="conversation-view"
      data-conversation-composer-overlay=""
    >
      <MemoirPanel
        api={api}
        cwd={cwd}
        t={t}
        openSource={(sourceSessionId, turnId) => {
          ctx.sessions.open(sourceSessionId as SessionId)
          revealSourceTurn(turnId)
        }}
      />
    </div>
  )
}

/** Root-scoped Settings page; it also preserves global-memory access with no session selected. */
function SettingsMemoirSection({
  api,
  ctx,
  t,
  close,
  useSessions,
}: NativeSettingsSectionProps & {
  api: MemoirApi
  ctx: Context
  t: (key: string) => string
}) {
  const cwd = useSessions((snapshot: SessionListState) => {
    const current = snapshot.current
    return current === undefined ? '' : snapshot.byId[current]?.cwd ?? ''
  })
  return (
    <div className="memoir-settings-section" data-dsh-plugin="memoir" data-dsh-part="settings-section">
      <MemoirPanel
        api={api}
        cwd={cwd}
        t={t}
        onClose={close}
        openSource={(sourceSessionId, turnId) => {
          close()
          ctx.sessions.open(sourceSessionId as SessionId)
          revealSourceTurn(turnId)
        }}
      />
    </div>
  )
}

/**
 * Register the native alpha surfaces.
 * @param rawCtx - DSH alpha client root context.
 */
export function apply(rawCtx: Context): void {
  const ctx = rawCtx
  const api = new MemoirApi()
  const t = makeT(document)

  ctx.effect(() => mountPanelStyles(), 'dsh-memoir: native alpha styles')
  ctx.effect(() => {
    let disposers: Array<() => void> = []
    const register = (): void => {
      for (const dispose of disposers.splice(0)) dispose()
      disposers = [
        ctx.slots.inject('conversation.view', () => ctx.slots.register({
          name: 'conversation.view',
          id: 'memoir',
          order: 20,
          label: () => t('entry.label'),
        }, props => <ConversationMemoirView {...props} api={api} ctx={ctx} t={t} />)),
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'memoir',
          order: 25,
          label: () => t('entry.label'),
        }, props => <SettingsMemoirSection {...props} api={api} ctx={ctx} t={t} />)),
      ]
    }

    register()
    // Memoir owns a tiny bilingual dictionary rather than importing the
    // unpublished alpha locale package. Re-registering bumps both native
    // rosters so their labels switch with the shell language immediately.
    const observer = new MutationObserver(register)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => {
      observer.disconnect()
      for (const dispose of disposers.splice(0)) dispose()
    }
  }, 'dsh-memoir: native alpha slots')
}
