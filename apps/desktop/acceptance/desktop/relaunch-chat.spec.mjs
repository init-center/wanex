import { test, expect, _electron as electron } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { connectDesktopPage } from './connection.mjs'
import {
  WANEX_DESKTOP_PROOF_RELAUNCH_HEADING as heading,
  WANEX_DESKTOP_PROOF_RELAUNCH_CODE as code,
  WANEX_DESKTOP_PROOF_RELAUNCH_RESPONSE as response,
  WANEX_DESKTOP_PROOF_RELAUNCH_FOLLOW_UP as followUp,
  WANEX_DESKTOP_PROOF_RELAUNCH_MODEL_ID as modelId,
} from '../../src/proof-contract.ts'

test('installed Desktop restores its conversation and sends a follow-up', async () => {
  const required = key => {
    const value = process.env[key]
    if (!value) throw new Error(`${key} is required`)
    return value
  }
  const receiptPath = required('WANEX_DESKTOP_PROOF_RECEIPT')
  const userDataDir = required('WANEX_DESKTOP_PROOF_USER_DATA')
  const profileId = required('WANEX_DESKTOP_PROOF_PROFILE_ID')
  const directImage = JSON.parse(await readFile(join(dirname(receiptPath), 'direct-image-fixture.json'), 'utf8'))
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !key.startsWith('WANEX_DESKTOP_PROOF_') && !key.startsWith('WANEX_DESKTOP_E2E_') &&
    key !== 'WANEX_SYSTEM_SERVICE_BINARY' && key !== 'ELECTRON_RUN_AS_NODE'
  ))
  const application = await electron.launch({
    executablePath: required('WANEX_DESKTOP_E2E_EXECUTABLE'),
    env: { ...env, WANEX_DESKTOP_PROOF_USER_DATA: userDataDir, WANEX_DESKTOP_PROFILE_ID: profileId },
    chromiumSandbox: true,
    timeout: 10000,
  })
  const child = application.process()
  let browser
  let runtime
  try {
    const connected = await connectDesktopPage(application, userDataDir)
    browser = connected.browser
    const page = connected.page
    page.setDefaultTimeout(10000)
    const security = await application.evaluate(({ app, BrowserWindow }) => {
      const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences()
      return { packaged: app.isPackaged, sandbox: p.sandbox, contextIsolation: p.contextIsolation,
        nodeIntegration: p.nodeIntegration, webSecurity: p.webSecurity }
    })
    expect(security).toEqual({ packaged: true, sandbox: true, contextIsolation: true,
      nodeIntegration: false, webSecurity: true })
    const shell = page.locator('[data-ui-assistant-shell]')
    await expect(shell).toHaveAttribute('data-theme', 'dark')
    await expect(shell).toHaveAttribute('data-density', 'compact')
    await page.locator('[data-ui-action="open-settings"]').click()
    await expect(page.locator('[data-ui-provider]')).toHaveCount(2)
    await page.locator('[data-ui-action="close-settings"]').click()
    await expect(page.locator('[data-ui-settings-panel]')).toHaveCount(0)
    await expect(page.locator('[data-ui-provider-state="ready"]')).toHaveCount(1)
    await expect(page.locator('[data-ui-model-selector]')).toContainText(modelId)
    const selected = page.locator('[data-ui-session-select][aria-current="true"]')
    await expect(selected).toHaveCount(1)
    const sessionId = await selected.getAttribute('data-ui-session-select')
    expect(sessionId).toBeTruthy()
    await expect(page.locator('[data-ui-session-list] [data-ui-session][data-ui-session-archived="false"]')).toHaveCount(1)
    await expect(page.locator('[data-ui-selected-session-title]')).toHaveText(heading)
    await expect(selected.locator('[data-ui-session-title]')).toHaveText(heading)
    const users = page.locator('[data-ui-conversation-row][data-ui-role="user"]')
    const assistants = page.locator('[data-ui-conversation-row][data-ui-role="assistant"]')
    await expect(users.filter({ hasText: heading }).filter({ hasText: code })).toHaveCount(1)
    await expect(assistants.filter({ hasText: response })).toHaveCount(1)
    expect(sessionId).toBe(directImage.sessionId)
    const imageRow = assistants.filter({ hasText: 'Installed direct image before' })
    await expect(imageRow).toContainText('Installed direct image after')
    const resource = imageRow.locator(`[data-ui-resource=${JSON.stringify(directImage.resourceId)}]`)
    await expect(resource).toHaveAttribute('data-ui-resource-sha256', directImage.sha256)
    await expect(resource).toHaveAttribute('data-ui-resource-size', String(directImage.sizeBytes))
    const preview = resource.locator('[data-ui-resource-preview][data-ui-preview-state="ready"] img')
    await expect(preview).toBeVisible()
    expect(await preview.evaluate(img => img.complete && img.naturalWidth === 1 && img.naturalHeight === 1)).toBe(true)
    const rowIds = rows => rows.evaluateAll(items => items.map(item => item.getAttribute('data-ui-conversation-row')))
    const oldUsers = await rowIds(users)
    const oldAssistants = await rowIds(assistants)
    const input = page.locator('[data-ui-composer] textarea[name="text"]')
    const send = page.locator('[data-ui-composer] button[type="submit"]')
    await input.fill('')
    await expect(send).toBeDisabled()
    await input.fill(followUp)
    await expect(send).toBeEnabled()
    const settlementDeadline = Date.now() + 10000
    const settlementTimeout = () => {
      const timeout = settlementDeadline - Date.now()
      if (timeout <= 0) throw new Error('Conversation settlement exceeded 10000ms')
      return { timeout }
    }
    await send.click()
    await expect(users).toHaveCount(oldUsers.length + 1, settlementTimeout())
    await expect(assistants).toHaveCount(oldAssistants.length + 1, settlementTimeout())
    const newUsers = (await rowIds(users)).filter(id => !oldUsers.includes(id))
    const newAssistants = (await rowIds(assistants)).filter(id => !oldAssistants.includes(id))
    expect(newUsers).toHaveLength(1)
    expect(newAssistants).toHaveLength(1)
    await expect(page.locator(`[data-ui-conversation-row=${JSON.stringify(newUsers[0])}]`)).toContainText(followUp, settlementTimeout())
    await expect(page.locator(`[data-ui-conversation-row=${JSON.stringify(newAssistants[0])}]`)).toContainText(response, settlementTimeout())
    await expect(selected).toHaveAttribute('data-ui-session-select', sessionId, settlementTimeout())
    const html = await page.content()
    expect(html).not.toContain('desktop-private-image-signature')
    await expect(preview).toBeVisible()
    expect(html).not.toContain('secretRef')
    expect(html).not.toContain('wanex-desktop-proof-')
    expect(html).not.toContain(userDataDir)
    expect(html).not.toContain('wanex-system-service')
    for (const password of await page.locator('input[type="password"]').all()) {
      await expect(password).toHaveValue('')
    }
    expect(await page.evaluate(() => ({ require: typeof window.require,
      electron: typeof window.electron, storage: typeof window.storageClient })))
      .toEqual({ require: 'undefined', electron: 'undefined', storage: 'undefined' })
    runtime = {
      kind: 'wanex.desktop.runtime-receipt', ok: true, proofStep: 'relaunch-chat',
      driver: 'playwright-cdp', security,
      renderer: {
        ok: true, step: 'relaunch-chat', initialConfiguredProviderCount: 2,
        configuredProviderCount: 2, providerConfigured: true, providerReady: true,
        modelId, sessionId, appearanceRestored: true, initialTranscriptVisible: true,
        initialResponseVisible: true, conversationSubmitted: true, userVisible: true,
        assistantVisible: true, responseVisible: true, followUpSessionPreserved: true,
        followUpResponseVisible: true, providerEvidenceRedacted: true,
        directImageRestored: true, directImagePreviewVisible: true,
      },
      privacy: { exposesStorePath: false, exposesServiceBinaryPath: false,
        exposesSecrets: false, exposesRawStorageClient: false, exposesElectronApi: false },
    }
  } finally {
    try { await browser?.close() } finally { await application.close() }
  }
  expect(child.exitCode).toBe(0)
  await writeFile(receiptPath, JSON.stringify(runtime, null, 2))
})
