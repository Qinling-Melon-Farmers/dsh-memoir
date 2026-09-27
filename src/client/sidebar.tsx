import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { UseSessions } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { useEffect, useState } from 'react'
import type { MemoirApi } from './api.js'
import { MemoirPanel } from './panel.js'

export const SIDEBAR_ID = 'dsh-memoir'

/** SVG honors the host's requested size and color; no remote icon request. */
function MemoirIcon({ size = 20, className }: IconProps) {
  return <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1v15" />
  </svg>
}

function SidebarMemoir({ api, ctx, t, sessionId, useSessions, useTabInfo }: PropsRuntime<'sidebar.right.pane.tab'> & {
  api: MemoirApi; ctx: Context; t: (key: string) => string; useSessions: UseSessions
}) {
  const cwd = useSessions((snapshot: SessionListState) => snapshot.byId[sessionId]?.cwd ?? '')
  const { tab } = useTabInfo()
  return <div className="memoir-native-view memoir-sidebar-view" data-dsh-plugin="memoir" data-dsh-part="sidebar-view">
    <MemoirPanel key={sessionId} api={api} cwd={cwd} t={t} onClose={() => tab.actions.close()}
      openSource={id => ctx.uiWorkspace.openSession(id as typeof sessionId)} />
  </div>
}

function SidebarTitle({ t }: { t: (key: string) => string }) {
  const [, refresh] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => refresh(value => value + 1))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])
  return <span className="memoir-sidebar-title"><MemoirIcon size={16} />{t('entry.label')}</span>
}

/** Optional service: absence/reload must not pend the main plugin. */
export function watchSidebar(ctx: Context, api: MemoirApi, t: (key: string) => string): () => Promise<void> {
  const pending = ctx.inject(['sidebarRightTabs'], sidebarCtx => {
    sidebarCtx.effect(() => {
      const owned: Array<() => void> = []
      const cleanup = () => { for (const dispose of owned.splice(0).reverse()) dispose() }
      try {
        owned.push(sidebarCtx.sidebarRightTabs.register({
          id: SIDEBAR_ID, kind: SIDEBAR_ID, keepMounted: true,
          title: () => t('entry.label'),
          guide: [{ id: SIDEBAR_ID, order: 30, title: () => t('entry.label'), description: () => t('sidebar.description'), icon: MemoirIcon }],
        }))
        owned.push(sidebarCtx.slots.inject('sidebar.right.pane.tab', () => sidebarCtx.slots.register({
          name: 'sidebar.right.pane.tab', key: SIDEBAR_ID,
        }, props => <SidebarMemoir {...props} api={api} ctx={sidebarCtx} t={t} />)))
        owned.push(sidebarCtx.slots.inject('sidebar.right.pane.tab.title', () => sidebarCtx.slots.register({
          name: 'sidebar.right.pane.tab.title', key: SIDEBAR_ID,
        }, () => <SidebarTitle t={t} />)))
      } catch {
        // A collision or partially unavailable optional owner must not remove
        // another plugin's entries or break Conversation / Settings.
        cleanup()
        sidebarCtx.logger.warn('dsh-memoir: optional sidebar registration unavailable; Conversation and Settings remain active')
      }
      return cleanup
    }, 'dsh-memoir: optional sidebar registration')
  })
  return () => pending.dispose()
}
