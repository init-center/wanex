import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { connectDesktopPage, debugEndpoint } from '../acceptance/desktop/connection.mjs'

vi.mock('@playwright/test', () => ({ chromium: { connectOverCDP: vi.fn() } }))
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

describe('owned Electron CDP connection', () => {
  it('accepts only a loopback endpoint from the owned port file', () => {
    expect(debugEndpoint('4567\n/devtools/browser/abc-123\n')).toBe('ws://127.0.0.1:4567/devtools/browser/abc-123')
    for (const value of ['0\n/devtools/browser/a', '65536\n/devtools/browser/a',
      '123\nws://elsewhere', '123\n/devtools/browser/../../secret',
      '123\n/devtools/browser/a\nextra']) {
      expect(() => debugEndpoint(value)).toThrow('Invalid owned')
    }
  })

  it('attaches once after real navigation, with no retry or product mutation', async () => {
    const contents = new EventEmitter()
    contents.getURL = () => ''
    contents.isLoading = () => true
    const application = { evaluate: callback => callback({
      BrowserWindow: { getAllWindows: () => [{ webContents: contents }] }
    }) }
    const page = {}
    const browser = { contexts: () => [{ pages: () => [page] }], close: vi.fn() }
    vi.mocked(readFile).mockResolvedValue('4567\n/devtools/browser/abc-123\n')
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser)
    const connection = connectDesktopPage(application, '/owned')
    expect(chromium.connectOverCDP).not.toHaveBeenCalled()
    contents.emit('did-finish-load')
    await expect(connection).resolves.toEqual({ browser, page })
    expect(chromium.connectOverCDP).toHaveBeenCalledExactlyOnceWith(
      'ws://127.0.0.1:4567/devtools/browser/abc-123', { timeout: 10000 })
    expect(contents.eventNames()).toEqual([])
  })

  it('propagates navigation failure without connecting', async () => {
    const contents = new EventEmitter()
    contents.getURL = () => ''
    const pending = connectDesktopPage({ evaluate: callback => callback({
      BrowserWindow: { getAllWindows: () => [{ webContents: contents }] }
    }) }, '/owned')
    const failure = expect(pending).rejects.toThrow('navigation failed: -105')
    contents.emit('did-fail-load', {}, -105, 'unreachable', '', true)
    await failure
    expect(chromium.connectOverCDP).not.toHaveBeenCalled()
    expect(contents.eventNames()).toEqual([])
  })

  it('closes an ambiguous connection rather than selecting an arbitrary page', async () => {
    const browser = { contexts: () => [{ pages: () => [{}, {}] }], close: vi.fn() }
    vi.mocked(readFile).mockResolvedValue('4567\n/devtools/browser/abc-123')
    vi.mocked(chromium.connectOverCDP).mockResolvedValue(browser)
    await expect(connectDesktopPage({ evaluate: async () => {} }, '/owned'))
      .rejects.toThrow('exactly one attached Desktop page')
    expect(browser.close).toHaveBeenCalledOnce()
  })

  it('keeps the navigation deadline and clears event listeners on timeout', async () => {
    vi.useFakeTimers()
    try {
      const contents = new EventEmitter()
      contents.getURL = () => ''
      const pending = connectDesktopPage({ evaluate: callback => callback({
        BrowserWindow: { getAllWindows: () => [{ webContents: contents }] }
      }) }, '/owned')
      const failure = expect(pending).rejects.toThrow('exceeded 10000ms')
      await vi.advanceTimersByTimeAsync(10000)
      await failure
      expect(contents.eventNames()).toEqual([])
      expect(chromium.connectOverCDP).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not reconnect when CDP attachment fails', async () => {
    vi.mocked(readFile).mockResolvedValue('4567\n/devtools/browser/abc-123')
    vi.mocked(chromium.connectOverCDP).mockRejectedValue(new Error('CDP unavailable'))
    await expect(connectDesktopPage({ evaluate: async () => {} }, '/owned'))
      .rejects.toThrow('CDP unavailable')
    expect(chromium.connectOverCDP).toHaveBeenCalledOnce()
  })
})
