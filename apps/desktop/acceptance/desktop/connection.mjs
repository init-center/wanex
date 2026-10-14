import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export function debugEndpoint(value) {
  const [port, path, ...rest] = value.trim().split(/\r?\n/)
  if (!/^\d+$/.test(port ?? '') || Number(port) < 1 || Number(port) > 65535 ||
      !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(path ?? '') || rest.length !== 0) {
    throw new Error('Invalid owned Electron debugging endpoint')
  }
  return `ws://127.0.0.1:${port}${path}`
}

export async function connectDesktopPage(application, userDataDir) {
  // An already-created, not-yet-navigated target cannot initialize reliably in
  // Electron 43.7.8 / Playwright 1.64.0. Observe navigation before attaching UI.
  await application.evaluate(async ({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length !== 1) throw new Error('Expected exactly one Desktop window')
    const contents = windows[0].webContents
    if (contents.getURL() && !contents.isLoading()) return
    await new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timer)
        contents.removeListener('did-finish-load', loaded)
        contents.removeListener('did-fail-load', failed)
        contents.removeListener('destroyed', destroyed)
        if (error) reject(error)
        else resolve()
      }
      const loaded = () => finish()
      const failed = (_, code, description, _url, mainFrame) => {
        if (mainFrame) finish(new Error(`Desktop navigation failed: ${code} ${description}`))
      }
      const destroyed = () => finish(new Error('Desktop window destroyed before navigation'))
      const timer = setTimeout(() => finish(new Error('Desktop navigation exceeded 10000ms')), 10000)
      contents.once('did-finish-load', loaded)
      contents.on('did-fail-load', failed)
      contents.once('destroyed', destroyed)
    })
  })
  const endpoint = debugEndpoint(await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8'))
  const browser = await chromium.connectOverCDP(endpoint, { timeout: 10000 })
  const pages = browser.contexts().flatMap(context => context.pages())
  if (pages.length !== 1) {
    await browser.close()
    throw new Error('Expected exactly one attached Desktop page')
  }
  return { browser, page: pages[0] }
}
