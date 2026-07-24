import {
  projectProductAppLocalCliStartupSummary,
  type ProductAppLocalCliJsonStartupSummary
} from "./cli-summary.js"
import type {
  ProductAppLocalCliOptions
} from "./cli-options.js"
import type {
  ProductAppLocalWebApp
} from "./types.js"
import { containsSensitiveText } from "./sensitive-value.js"

export interface ProductAppLocalCliSmokeInput {
  readonly app: ProductAppLocalWebApp
  readonly options: ProductAppLocalCliOptions
}

export interface ProductAppLocalCliSmokeResult {
  readonly kind: "product-app-local.cli.smoke-result"
  readonly ok: boolean
  readonly startup: ProductAppLocalCliJsonStartupSummary
  readonly checks: ProductAppLocalCliSmokeChecks
}

export interface ProductAppLocalCliSmokeChecks {
  readonly document: ProductAppLocalCliSmokeCheck
  readonly layoutAction: ProductAppLocalCliSmokeCheck
  readonly conversationAction: ProductAppLocalCliSmokeCheck
  readonly privacy: ProductAppLocalCliSmokeCheck
}

export interface ProductAppLocalCliSmokeCheck {
  readonly ok: boolean
  readonly message: string
}

export async function runProductAppLocalCliSmoke(
  input: ProductAppLocalCliSmokeInput
): Promise<ProductAppLocalCliSmokeResult> {
  const html = await fetchText(`${input.app.url}/`)
  const layout = await postJson(`${input.app.url}/wanex/product-app-web/request`, {
    kind: "product-app-web.request",
    operation: "submitActionInput",
    requestId: "product_app_local_cli_smoke_layout",
    input: {
      action: "set-layout",
      fields: {
        layout: "split"
      }
    },
    options: {
      pollAfterAction: false
    }
  })
  const conversation = await postJson(`${input.app.url}/wanex/product-app-web/request`, {
    kind: "product-app-web.request",
    operation: "submitActionInput",
    requestId: "product_app_local_cli_smoke_conversation",
    input: {
      action: "submit-conversation",
      fields: {
        text: "hello from Product App Local smoke"
      }
    },
    options: {
      pollAfterAction: false
    }
  })
  await waitForConversationTerminal(input.app)
  const snapshot = await input.app.readSnapshot()
  const productDocuments = [
    html,
    layout,
    conversation,
    snapshot
  ]
  const checks = {
    document: check(
      html.includes("<!doctype html>") &&
        html.includes('data-wanex-product-app-web="surface"'),
      "local Web document is reachable"
    ),
    layoutAction: check(
      readPath(layout, ["document", "snapshot", "view", "layout"]) === "split",
      "layout action updates the Web snapshot"
    ),
    conversationAction: check(
      readPath(conversation, ["document", "snapshot", "conversation", "operation", "kind"]) ===
          "product-app.conversation-operation" &&
        readPath(conversation, ["document", "snapshot", "view", "selectedSessionTitle"]) ===
          "hello from Product App Local smoke" &&
        snapshot.web.conversation.operation?.kind ===
          "product-app.conversation-operation",
      "conversation action submits through the Web request envelope"
    ),
    privacy: check(
      !containsSensitiveText(productDocuments, input.options.serviceBin) &&
        !containsStoragePath(productDocuments, input.options),
      "smoke output does not leak host-only paths through product documents"
    )
  }
  return {
    kind: "product-app-local.cli.smoke-result",
    ok: Object.values(checks).every((item) => item.ok),
    startup: projectProductAppLocalCliStartupSummary({
      options: input.options,
      snapshot
    }),
    checks
  }
}

async function waitForConversationTerminal(
  app: ProductAppLocalWebApp
): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const document = await app.webController.pollEvents({ limit: 20 })
    if (document.snapshot.conversation.operation?.capabilities.terminal) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Product App Local smoke conversation did not finish")
}

export function formatProductAppLocalCliSmokeResult(
  result: ProductAppLocalCliSmokeResult
): string {
  return JSON.stringify(result)
}

function check(ok: boolean, message: string): ProductAppLocalCliSmokeCheck {
  return { ok, message }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (response.status !== 200) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`)
  }
  return await response.text()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  })
  if (response.status !== 200) {
    throw new Error(`POST ${url} failed with HTTP ${response.status}`)
  }
  return await response.json()
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
  options: ProductAppLocalCliOptions
): boolean {
  if (options.storage.kind === "store-dir") {
    return containsSensitiveText(value, options.storage.storeDir)
  }
  return containsSensitiveText(value, options.storage.rootDir)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
