/** Optional local layout check. Uses an existing Playwright module and browser;
 * never connects to a production DSH profile or reads real memory.
 * node scripts/check-guide-browser.mjs <playwright-entry> <browser-executable>
 * This component fixture is not a full host/Desktop acceptance test.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const [playwrightEntry, browserExecutable, screenshotDirectory] = process.argv.slice(2)
if (!playwrightEntry || !browserExecutable) throw new Error('Provide an existing Playwright entry and browser executable')
const { chromium } = await import(pathToFileURL(resolve(playwrightEntry)).href)
const root = fileURLToPath(new URL('../', import.meta.url))
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const bundle = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import { apply } from './src/client/index.tsx'
    const params = new URLSearchParams(location.search)
    const entries = new Map()
    const ctx = {
      uiWorkspace: { openSession() {} },
      sidebarRightTabs: { register() { return () => {} } },
      slots: {
        inject(name, fn) { return fn() },
        register(entry, render) { const key = entry.name + ':' + (entry.key ?? entry.id); entries.set(key, render); return () => entries.delete(key) },
      },
      effect(fn) { fn() },
      inject(names, fn) { fn(ctx); return { dispose() {} } },
    }
    const settings = { language: 'zh', announceToAgent: true, autoDistill: true, autoDistillEvery: 1, autoDistillCooldownMin: 0, autoDistillMinTools: 1, hotMemoryTokens: 900, hotMemoryMaxTokens: 1200, readDefaultLimit: 8, readMaxLimit: 30, sessionSnapshotMax: 128, queryCacheSize: 128 }
    window.fetch = async (input) => {
      const path = new URL(input, location.origin).pathname
      const value = path.endsWith('/settings') ? { source: 'profile', settings }
        : path.endsWith('/project') ? { project: { path: '/demo/project', title: 'Demo project', entries: Array.from({ length: 120 }, (_, index) => ({ id: String(index), section: 'work', title: 'Demonstration memory ' + index, content: 'Synthetic layout evidence. '.repeat(25), time: 1 })) } }
        : path.endsWith('/hot-memory') ? { hotMemory: null } : null
      return { ok: true, status: 200, json: async () => ({ ok: true, value }) }
    }
    apply(ctx)
    const state = { byId: { demo: { cwd: '/demo/project', retainedBy: { mainView: 1 } } } }
    const Component = entries.get(params.get('entry'))
    createRoot(document.getElementById('app')).render(<Component
      sessionId="demo" useSessions={selector => selector(state)} close={() => {}}
      useTabInfo={() => ({ tab: { actions: { close() {} } } })}
      openView={() => {}} completeViewRequest={() => {}} view="page" />)
  ` },
  bundle: true, write: false, format: 'iife', jsx: 'automatic', target: 'es2022',
  define: { 'process.env.NODE_ENV': '"production"', __MEMOIR_PACKAGE_INFO__: JSON.stringify({ version: manifest.version, hostRange: manifest.dsh.engines.dsh, sdkBaseline: manifest.devDependencies['@deepseek-ai/dsh-agent'] }) },
})
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') {
    response.setHeader('content-type', 'application/javascript')
    response.end(bundle.outputFiles[0].text)
  } else {
    const theme = new URL(request.url, 'http://localhost').searchParams.get('theme')
    response.setHeader('content-type', 'text/html; charset=utf-8')
    response.end('<!doctype html><html lang="zh"><head><style>' +
      'html,body,#app{margin:0;width:100%;height:100%;box-sizing:border-box;font-family:system-ui}#app{overflow:auto}' +
      (theme === 'dark' ? ':root{--bg-panel:#141414;--bg-card:#292929;--text-primary:#eee;--text-secondary:#bbb;--accent:#8babfa;color-scheme:dark}' :
        theme === 'skin' ? ':root{--dsw-alias-bg-base:#101a10;--dsw-alias-bg-layer-2:#182818;--dsw-alias-label-primary:#bcdfbc;--dsw-alias-label-secondary:#94b894;--dsw-alias-interactive-primary:#74da90;color-scheme:dark}' : ':root{color-scheme:light}') +
      '</style></head><body><div id="app"></div><script src="/fixture.js"></script></body></html>')
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
let cases = 0
try {
  browser = await chromium.launch({ executablePath: resolve(browserExecutable), headless: true })
  if (screenshotDirectory) await mkdir(resolve(screenshotDirectory), { recursive: true })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? route.continue() : route.abort())
  for (const entry of ['conversation.view:memoir', 'settings.section:memoir', 'sidebar.right.pane.tab:dsh-memoir', 'plugins.bundle.config:dsh-memoir']) {
    for (const theme of ['light', 'dark', 'skin']) {
      for (const viewport of [{ width: 1100, height: 720 }, { width: 360, height: 640 }]) {
        await page.setViewportSize(viewport)
        await page.goto(`http://127.0.0.1:${server.address().port}/?entry=${entry}&theme=${theme}`)
        const guide = page.locator('[data-dsh-part="plugin-guide"]')
        await guide.waitFor()
        const notice = page.locator('[data-dsh-part="announcement"]')
        if (cases === 0) {
          assert.equal(await notice.count(), 1, 'first conversation open shows offline notice')
          assert.equal(await page.evaluate(() => localStorage.getItem('dsh-memoir:announcement:last-acknowledged')), null, 'opening is not acknowledgment')
          if (screenshotDirectory) await page.screenshot({ path: resolve(screenshotDirectory, 'v0.9.0-announcement-zh.png') })
          await notice.getByRole('button', { name: '知道了', exact: true }).click()
          await page.reload()
          await guide.waitFor()
          assert.equal(await notice.count(), 0, 'reload and subsequent sessions do not repeat acknowledged version')
          await guide.locator('summary').click()
          await page.getByRole('button', { name: '查看本版更新', exact: true }).click()
          assert.equal(await notice.count(), 1, 'manual replay remains available')
          await page.evaluate(() => { document.documentElement.lang = 'en' })
          await notice.getByRole('button', { name: 'Got it', exact: true }).click()
          await page.evaluate(() => { document.documentElement.lang = 'zh' })
          await guide.locator('summary').click()
        } else assert.equal(await notice.count(), 0, 'no automatic notice in other surfaces or after acknowledgment')
        const box = await guide.boundingBox()
        assert.ok(box && box.y >= 0 && box.y + box.height < viewport.height / 2, `guide visible above content: ${entry}/${theme}`)
        for (const link of await guide.locator('.memoir-plugin-guide-row a').all()) assert.equal(await link.isVisible(), true)
        assert.equal(await guide.locator('details').getAttribute('open'), null)
        if (screenshotDirectory && entry === 'conversation.view:memoir' &&
            ((theme === 'light' && viewport.width === 1100) || (theme === 'dark' && viewport.width === 360))) {
          await page.locator('.memoir-entry').first().waitFor()
          await page.screenshot({ path: resolve(screenshotDirectory, `memoir-guide-fixture-${theme}-${viewport.width}.png`) })
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no document horizontal overflow')
        if (entry !== 'plugins.bundle.config:dsh-memoir') {
          const scroll = page.locator('.memoir-scroll-region')
          await scroll.locator('.memoir-entry').first().waitFor()
          await scroll.evaluate(element => { element.scrollTop = element.scrollHeight })
          assert.ok(await scroll.evaluate(element => element.scrollTop > 0), 'long memory list really scrolls')
          assert.equal((await guide.boundingBox()).y, box.y, 'guide stays in place while memory scrolls')
          await guide.locator('.memoir-guide-settings[aria-controls]').click()
          assert.equal(await page.locator('.memoir-surface-tab').nth(1).getAttribute('aria-selected'), 'true')
          await page.locator('[data-dsh-part="settings-scroll"] input').first().waitFor()
          assert.ok((await page.locator('[data-dsh-part="settings-scroll"]').boundingBox()).height > 120, 'settings retain usable scroll area')
          const settingsScroll = page.locator('[data-dsh-part="settings-scroll"]')
          const actions = settingsScroll.locator('.memoir-settings-body > .memoir-form-actions')
          const lastField = settingsScroll.locator('input').last()
          assert.ok((await actions.boundingBox()).y >= (await lastField.boundingBox()).y + (await lastField.boundingBox()).height, 'save actions follow fields instead of covering them')
          await settingsScroll.evaluate(element => { element.scrollTop = element.scrollHeight })
          await actions.locator('button').last().scrollIntoViewIfNeeded()
          const actionBox = await actions.boundingBox()
          const scrollBox = await settingsScroll.boundingBox()
          assert.ok(actionBox.y >= scrollBox.y && actionBox.y + actionBox.height <= scrollBox.y + scrollBox.height, 'save actions remain reachable')
          await settingsScroll.evaluate(element => { element.scrollTop = 0 })
        } else {
          assert.equal(await page.locator('.memoir-settings-body').isVisible(), true)
          if (screenshotDirectory && theme === 'light' && viewport.width === 1100) {
            await page.locator('.memoir-settings-body input').first().waitFor()
            await page.screenshot({ path: resolve(screenshotDirectory, 'v0.9.0-preview-plugin-settings-zh.png') })
          }
        }
        await page.evaluate(() => { document.documentElement.lang = 'en' })
        await page.getByRole('link', { name: 'Documentation', exact: true }).waitFor()
        assert.equal(await guide.locator('.memoir-plugin-guide-row a').nth(1).getAttribute('href'), 'https://github.com/Qinling-Melon-Farmers/dsh-memoir/blob/main/README.en.md')
        if (screenshotDirectory && entry === 'conversation.view:memoir' && theme === 'light' && viewport.width === 1100) {
          await page.locator('[data-dsh-part="settings-scroll"] select').first().selectOption('de')
          await page.screenshot({ path: resolve(screenshotDirectory, 'v0.9.0-preview-settings-en.png') })
        }
        cases++
      }
    }
  }
  assert.deepEqual(errors, [], 'no browser rendering errors')
  console.log(JSON.stringify({ cases, browser: await browser.version(), productionProfileAccessed: false }))
} finally {
  await browser?.close()
  await new Promise(resolve => server.close(resolve))
}
