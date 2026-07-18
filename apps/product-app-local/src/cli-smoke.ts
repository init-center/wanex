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
  readonly workbenchAction: ProductAppLocalCliSmokeCheck
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
  const workbench = await postJson(`${input.app.url}/wanex/product-app-web/request`, {
    kind: "product-app-web.request",
    operation: "submitActionInput",
    requestId: "product_app_local_cli_smoke_workbench",
    input: {
      action: "start-workbench",
      fields: {
        text: "hello from Product App Local smoke"
      }
    },
    options: {
      pollAfterAction: false
    }
  })
  const snapshot = await input.app.readSnapshot()
  const serialized = JSON.stringify([
    html,
    layout,
    workbench,
    snapshot
  ])
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
    workbenchAction: check(
      readPath(workbench, ["document", "snapshot", "workbench", "state"]) === "ready" &&
        readPath(workbench, ["document", "snapshot", "view", "latestUserText"]) ===
          "hello from Product App Local smoke" &&
        snapshot.web.workbench.state === "ready",
      "workbench action starts through the Web request envelope"
    ),
    privacy: check(
      !serialized.includes(input.options.serviceBin) &&
        !containsStoragePath(serialized, input.options),
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
  serialized: string,
  options: ProductAppLocalCliOptions
): boolean {
  if (options.storage.kind === "store-dir") {
    return serialized.includes(options.storage.storeDir)
  }
  return serialized.includes(options.storage.rootDir)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
