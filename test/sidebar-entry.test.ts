import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { PanelController } from '../src/client/controller.ts'
import { translate } from '../src/client/i18n.ts'
import { ENTRY_SELECTOR, mountSidebarEntry } from '../src/client/sidebar-entry.ts'

const shell = () => `
  <aside class="shell_sidebarCol">
    <div class="sidebar-root">
      <div class="shell_logoRow"><button class="shell_newSession">new</button></div>
      <div class="workspace-list"></div>
    </div>
  </aside>
`

const settle = async () => new Promise<void>((resolve) => setTimeout(resolve, 0))

test('sidebar entry is semantic, bilingual, idempotent, and self-heals shell rebuilds', async () => {
  const dom = new JSDOM(`<!doctype html><html lang="zh-CN"><body>${shell()}</body></html>`, { url: 'http://127.0.0.1:3080' })
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    HTMLElement: globalThis.HTMLElement,
    MutationObserver: globalThis.MutationObserver,
  }
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    MutationObserver: dom.window.MutationObserver,
  })
  try {
    const controller = new PanelController()
    const t = (key: string) => translate(document.documentElement.lang.startsWith('zh') ? 'zh' : 'en', key)
    const dispose = mountSidebarEntry(controller, t)
    const duplicateDispose = mountSidebarEntry(controller, t)
    let entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)
    assert.ok(entry)
    assert.equal(document.querySelectorAll(ENTRY_SELECTOR).length, 1)
    assert.equal(entry.dataset.dshPlugin, 'memoir')
    assert.equal(entry.dataset.dshPart, 'sidebar-entry')
    assert.equal(entry.getAttribute('aria-label'), '记忆')

    controller.open()
    assert.equal(entry.dataset.active, 'true')
    controller.close()
    assert.equal(entry.hasAttribute('data-active'), false)

    document.documentElement.lang = 'en'
    await settle()
    assert.equal(entry.getAttribute('aria-label'), 'Memory')
    assert.equal(entry.querySelector('.memoir-entry-label')?.textContent, 'Memory')

    entry.remove()
    await settle()
    entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)
    assert.ok(entry?.isConnected, 'entry is reinserted after a child-list render')

    document.querySelector('.shell_sidebarCol')?.remove()
    document.body.insertAdjacentHTML('beforeend', shell())
    await settle()
    entry = document.querySelector<HTMLButtonElement>(ENTRY_SELECTOR)
    assert.ok(entry?.isConnected, 'entry follows a rebuilt sidebar root')
    assert.equal(document.querySelectorAll(ENTRY_SELECTOR).length, 1)

    duplicateDispose()
    dispose()
    assert.equal(document.querySelector(ENTRY_SELECTOR), null)
  } finally {
    Object.assign(globalThis, previous)
    dom.window.close()
  }
})
