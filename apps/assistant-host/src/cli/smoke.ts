import {
  projectLocalCliStartupSummary,
  type LocalCliJsonStartupSummary
} from "./summary.js"
import type {
  LocalCliOptions
} from "./options.js"
import type {
  AssistantWebApp
} from "../model.js"
import { containsSensitiveText } from "../sensitive-value.js"

export interface LocalCliSmokeInput {
  readonly app: AssistantWebApp
  readonly options: LocalCliOptions
}

export interface LocalCliSmokeResult {
  readonly kind: "assistant-host.cli.smoke-result"
  readonly ok: boolean
  readonly startup: LocalCliJsonStartupSummary
  readonly checks: LocalCliSmokeChecks
}

export interface LocalCliSmokeChecks {
  readonly shell: LocalCliSmokeCheck
  readonly layoutAction: LocalCliSmokeCheck
  readonly conversationAction: LocalCliSmokeCheck
  readonly privacy: LocalCliSmokeCheck
}

export interface LocalCliSmokeCheck {
  readonly ok: boolean
  readonly message: string
}

export async function runLocalCliSmoke(
  input: LocalCliSmokeInput
): Promise<LocalCliSmokeResult> {
  const html = await fetchText(`${input.app.url}/`)
  const hostSessionToken = readHostSessionToken(html)
  const layout = await postJson(`${input.app.url}/wanex/assistant/request`, {
    kind: "web.request",
    operation: "dispatchAction",
    requestId: "assistant_app_local_cli_smoke_layout",
    action: {
      type: "set-layout",
      input: {
        layout: "split"
      }
    }
  }, hostSessionToken)
  const conversation = await postJson(`${input.app.url}/wanex/assistant/request`, {
    kind: "web.request",
    operation: "dispatchAction",
    requestId: "assistant_app_local_cli_smoke_conversation",
    action: {
      type: "submit-conversation",
      input: {
        text: "hello from Assistant Host smoke"
      }
    }
  }, hostSessionToken)
  await waitForConversationTerminal(input.app)
  const snapshot = await input.app.readSnapshot()
  const assistantValues = [
    html,
    layout,
    conversation,
    snapshot
  ]
  const checks = {
    shell: check(
      html.includes("<!doctype html>") &&
        html.includes("data-app-root") &&
        html.includes('src="/assets/app.js"'),
      "local browser shell is reachable"
    ),
    layoutAction: check(
      readPath(layout, [
        "actionResult",
        "snapshot",
        "view",
        "layout"
      ]) === "split",
      "layout action updates the Web snapshot"
    ),
    conversationAction: check(
      readPath(conversation, [
        "actionResult",
        "snapshot",
        "conversation",
        "operation",
        "kind"
      ]) ===
          "assistant.conversation-operation" &&
        readPath(conversation, [
          "actionResult",
          "snapshot",
          "view",
          "selectedSessionTitle"
        ]) ===
          "hello from Assistant Host smoke" &&
        snapshot.web.conversation.operation?.kind ===
          "assistant.conversation-operation",
      "conversation action submits through the Web request envelope"
    ),
    privacy: check(
      !containsSensitiveText(assistantValues, input.options.serviceBin) &&
        !containsStoragePath(assistantValues, input.options),
      "smoke output does not leak host-only paths through assistant values"
    )
  }
  return {
    kind: "assistant-host.cli.smoke-result",
    ok: Object.values(checks).every((item) => item.ok),
    startup: projectLocalCliStartupSummary({
      options: input.options,
      snapshot
    }),
    checks
  }
}

async function waitForConversationTerminal(
  app: AssistantWebApp
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await app.controller.reconcileEvents({ limit: 20 })
    if (snapshot.conversation.operation?.capabilities.terminal) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Assistant Host smoke conversation did not finish")
}

export function formatLocalCliSmokeResult(
  result: LocalCliSmokeResult
): string {
  return JSON.stringify(result)
}

function check(ok: boolean, message: string): LocalCliSmokeCheck {
  return { ok, message }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (response.status !== 200) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`)
  }
  return await response.text()
}

async function postJson(
  url: string,
  body: unknown,
  hostSessionToken: string
): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": hostSessionToken
    },
    body: JSON.stringify(body)
  })
  if (response.status !== 200) {
    throw new Error(`POST ${url} failed with HTTP ${response.status}`)
  }
  return await response.json()
}

function readHostSessionToken(html: string): string {
  const match = /data-host-session-token="([A-Za-z0-9_-]{43})"/.exec(html)
  if (match?.[1] === undefined) {
    throw new Error("Assistant browser shell did not include a session token")
  }
  return match[1]
}

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[key]
  }
  return current
}

function containsStoragePath(
  value: unknown,
  options: LocalCliOptions
): boolean {
  if (options.storage.kind === "store-dir") {
    return containsSensitiveText(value, options.storage.storeDir)
  }
  return containsSensitiveText(value, options.storage.rootDir)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
