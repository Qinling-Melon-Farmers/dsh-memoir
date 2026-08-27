import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { mountPanelStyles, PANEL_STYLE_SELECTOR } from '../src/client/styles.ts'

test('memoir stylesheet uses its own marker instead of colliding with generic plugin styles', () => {
  const dom = new JSDOM('<!doctype html><html><head><style data-plugin="dsh-memoir">.foreign { color: red }</style></head><body></body></html>')
  try {
    const dispose = mountPanelStyles(dom.window.document)
    const duplicateDispose = mountPanelStyles(dom.window.document)
    const owned = dom.window.document.querySelector<HTMLStyleElement>(PANEL_STYLE_SELECTOR)

    assert.ok(owned)
    assert.match(owned.textContent ?? '', /\.memoir-entry-row/)
    assert.equal(dom.window.document.querySelectorAll('style[data-plugin="dsh-memoir"]').length, 2)
    assert.equal(dom.window.document.querySelectorAll(PANEL_STYLE_SELECTOR).length, 1)

    duplicateDispose()
    assert.equal(dom.window.document.querySelectorAll(PANEL_STYLE_SELECTOR).length, 1)
    dispose()
    assert.equal(dom.window.document.querySelector(PANEL_STYLE_SELECTOR), null)
    assert.equal(dom.window.document.querySelectorAll('style[data-plugin="dsh-memoir"]').length, 1)
  } finally {
    dom.window.close()
  }
})

test('sidebar row geometry matches the web-ui-all 0.3.x family contract', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div data-dsh-frame>
      <button class="memoir-entry-row" data-dsh-memoir-entry>
        <span class="memoir-entry-icon"><svg viewBox="0 0 16 16" width="18" height="18"></svg></span>
        <span class="memoir-entry-label">Memory</span>
      </button>
    </div>
  </body></html>`)
  try {
    const dispose = mountPanelStyles(dom.window.document)
    const frame = dom.window.document.querySelector<HTMLElement>('[data-dsh-frame]')!
    const row = dom.window.document.querySelector<HTMLElement>('.memoir-entry-row')!
    const icon = dom.window.document.querySelector<HTMLElement>('.memoir-entry-icon')!
    const svg = dom.window.document.querySelector<SVGElement>('svg')!
    const label = dom.window.document.querySelector<HTMLElement>('.memoir-entry-label')!

    let style = dom.window.getComputedStyle(row)
    assert.equal(style.display, 'flex')
    assert.equal(style.height, '36px')
    assert.equal(style.padding, '0px 10px')
    assert.equal(style.gap, '8px')
    assert.equal(dom.window.getComputedStyle(icon).width, '24px')
    assert.equal(dom.window.getComputedStyle(icon).height, '24px')
    assert.equal(dom.window.getComputedStyle(svg).width, '18px')
    assert.equal(dom.window.getComputedStyle(svg).height, '18px')

    frame.dataset.sidebarCollapsed = ''
    style = dom.window.getComputedStyle(row)
    assert.equal(style.width, '36px')
    assert.equal(style.height, '36px')
    assert.equal(style.padding, '0px')
    assert.equal(style.margin, '0px auto 12px')
    assert.equal(style.borderRadius, '50%')
    assert.equal(dom.window.getComputedStyle(label).display, 'none')

    dispose()
  } finally {
    dom.window.close()
  }
})

test('settings card chrome and panel use the web-ui family disclosure and one scroll owner', () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="memoir-panel">
      <div class="memoir-scroll-region"><div class="memoir-body"><div class="memoir-settings-body"></div><pre class="memoir-inspector-body"></pre></div></div>
    </div>
    <li class="memoir-settings-slot"><button class="memoir-settings-slot-header"><span class="memoir-settings-slot-headtext"></span><svg class="memoir-settings-slot-chevron"></svg></button></li>
  </body></html>`)
  try {
    const dispose = mountPanelStyles(dom.window.document)
    const card = dom.window.document.querySelector<HTMLElement>('.memoir-settings-slot')!
    const header = dom.window.document.querySelector<HTMLElement>('.memoir-settings-slot-header')!
    const scroller = dom.window.document.querySelector<HTMLElement>('.memoir-scroll-region')!
    const body = dom.window.document.querySelector<HTMLElement>('.memoir-body')!
    const settings = dom.window.document.querySelector<HTMLElement>('.memoir-settings-body')!
    const inspector = dom.window.document.querySelector<HTMLElement>('.memoir-inspector-body')!

    assert.equal(dom.window.getComputedStyle(card).borderRadius, '12px')
    assert.equal(dom.window.getComputedStyle(header).padding, '14px 16px')
    assert.equal(dom.window.getComputedStyle(header).display, 'flex')
    assert.equal(dom.window.getComputedStyle(scroller).overflowY, 'auto')
    assert.notEqual(dom.window.getComputedStyle(body).overflowY, 'auto')
    assert.notEqual(dom.window.getComputedStyle(settings).overflowY, 'auto')
    assert.notEqual(dom.window.getComputedStyle(inspector).overflowY, 'auto')

    dispose()
  } finally {
    dom.window.close()
  }
})
