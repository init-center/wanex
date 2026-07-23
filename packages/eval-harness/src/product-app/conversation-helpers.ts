import type {
  ProductAppShell
} from "@wanex/product-app"
import type {
  ProductAppBackendCommands,
  ProductAppBackendConversationOperationReference
} from "@wanex/product-app/backend"
import type {
  ProductAppSurfaceClient
} from "@wanex/product-app/surface-client"

const DEFAULT_TIMEOUT_MS = 2_000

export async function waitForBackendConversation(
  commands: Pick<ProductAppBackendCommands, "readConversationOperation">,
  reference: ProductAppBackendConversationOperationReference
): Promise<void> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await commands.readConversationOperation(reference)
    if (result.kind === "found" && isTerminalState(result.operation.state)) {
      return
    }
    await delay(10)
  }
  throw new Error(`backend conversation did not settle: ${reference.sessionId}`)
}

export async function waitForProductConversation(
  app: Pick<ProductAppShell, "readTrackedConversationOperation">,
  sessionId: string
): Promise<void> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await app.readTrackedConversationOperation({ sessionId })
    if (
      result.kind === "product-app.conversation-operation.found" &&
      result.operation.capabilities.terminal
    ) {
      return
    }
    await delay(10)
  }
  throw new Error(`product conversation did not settle: ${sessionId}`)
}

export async function waitForProductJob(
  app: Pick<ProductAppShell, "readExecutionReference">,
  jobId: string
): Promise<void> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await app.readExecutionReference({ kind: "job", id: jobId })
    if (
      result.kind === "found" &&
      (result.activity.state === "succeeded" ||
        result.activity.state === "failed" ||
        result.activity.state === "cancelled")
    ) {
      return
    }
    await delay(10)
  }
  throw new Error(`product job did not settle: ${jobId}`)
}

export async function waitForSurfaceConversation(
  client: Pick<ProductAppSurfaceClient, "readTrackedConversationOperation">,
  sessionId: string
): Promise<void> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await client.readTrackedConversationOperation({ sessionId })
    if (
      result.ok &&
      result.value.kind === "product-app.conversation-operation.found" &&
      result.value.operation.capabilities.terminal
    ) {
      return
    }
    await delay(10)
  }
  throw new Error(`surface conversation did not settle: ${sessionId}`)
}

function isTerminalState(state: string): boolean {
  return state === "succeeded" ||
    state === "failed" ||
    state === "cancelled" ||
    state === "interrupted" ||
    state === "recovery_required"
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}
