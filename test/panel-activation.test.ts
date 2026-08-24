import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { PanelController } from '../src/client/controller.ts'
import {
  bindPanelActivation,
  MEMOIR_ACTIVE_ATTR,
  MEMOIR_PANEL_NAME,
  PANEL_ACTIVATE_EVENT,
} from '../src/client/panel-activation.ts'

test('panel activation emits only memoir and keeps controller, html, and siblings consistent', () => {
  const dom = new JSDOM('<!doctype html><html data-dsh-ssh-active data-dsh-taskboard-active><body></body></html>')
  try {
    const controller = new PanelController()
    const details: string[] = []
    dom.window.document.addEventListener(PANEL_ACTIVATE_EVENT, (event) => {
      details.push((event as CustomEvent<string>).detail)
    })
    const dispose = bindPanelActivation(controller, dom.window.document)

    controller.open()
    assert.equal(controller.getSnapshot().panelOpen, true)
    assert.equal(dom.window.document.documentElement.hasAttribute(MEMOIR_ACTIVE_ATTR), true)
    assert.equal(dom.window.document.documentElement.hasAttribute('data-dsh-ssh-active'), false)
    assert.equal(dom.window.document.documentElement.hasAttribute('data-dsh-taskboard-active'), false)
    assert.deepEqual(details, [MEMOIR_PANEL_NAME])

    dom.window.document.dispatchEvent(new dom.window.CustomEvent(PANEL_ACTIVATE_EVENT, { detail: 'ssh' }))
    assert.equal(controller.getSnapshot().panelOpen, false)
    assert.equal(dom.window.document.documentElement.hasAttribute(MEMOIR_ACTIVE_ATTR), false)

    controller.open()
    dom.window.document.dispatchEvent(new dom.window.CustomEvent(PANEL_ACTIVATE_EVENT, { detail: MEMOIR_PANEL_NAME }))
    assert.equal(controller.getSnapshot().panelOpen, true)

    dispose()
    assert.equal(dom.window.document.documentElement.hasAttribute(MEMOIR_ACTIVE_ATTR), false)
  } finally {
    dom.window.close()
  }
})
