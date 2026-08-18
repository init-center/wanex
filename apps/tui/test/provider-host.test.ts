import { describe, expect, it } from "vitest"
import type { ModelEndpoint } from "@wanex/protocol"
import type {
  WanexAppProviderMutationCoordinator,
  WanexAppProviderReplaceRequest
} from "@wanex/app/provider-mutation"
import type { SecretStorePort } from "@wanex/runtime/secrets"
import { WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME } from "@wanex/local-credential-store"
import { createTuiTrustedProviderHost } from "../src/provider/host.js"
import { TuiVirtualTerminal } from "./full-screen/virtual-terminal.js"

describe("TUI trusted Provider host", () => {
  it("lists, adds, rotates, edits, and removes without exposing credentials", async () => {
    const terminal = new TuiVirtualTerminal(96, 28)
    const fixture = new ProviderMutationFixture()
    const host = createTuiTrustedProviderHost({
      terminal,
      namespace: "a".repeat(64),
      credentialStore: new NoopSecretStore()
    })
    const release = host.bindMutationCoordinator(fixture)
    const running = host.manage({
      listModelEndpoints: async () => fixture.list()
    })

    await waitForHistory(terminal, "Configured Providers\r\n  None")
    await waitForHistory(terminal, "Action [1-5]:")
    terminal.sendInput("1\r")
    await waitForHistory(terminal, "Provider [1-4]:")
    terminal.sendInput("4\r")
    await waitForHistory(terminal, "Model ID:")
    terminal.sendInput("first-model\r")
    await waitForHistory(terminal, "Base URL:")
    terminal.sendInput("http://127.0.0.1:9876/v1\r")
    await waitForHistory(terminal, "API key:")
    terminal.sendInput("first-secret\r")
    await waitForHistory(terminal, "Provider added.")
    terminal.sendInput("\r")

    await waitForHistoryCount(terminal, "Action [1-5]:", 2)
    terminal.sendInput("2\r")
    await waitForHistory(terminal, "Provider [1-1]:")
    terminal.sendInput("1\r")
    await waitForHistoryCount(terminal, "API key:", 2)
    terminal.sendInput("rotated-secret\r")
    await waitForHistory(terminal, "Credential rotated.")
    terminal.sendInput("\r")

    await waitForHistoryCount(terminal, "Action [1-5]:", 3)
    terminal.sendInput("3\r")
    await waitForHistoryCount(terminal, "Provider [1-1]:", 2)
    terminal.sendInput("1\r")
    await waitForHistory(terminal, "New model ID for first-model:")
    terminal.sendInput("edited-model\r")
    await waitForHistory(terminal, "Model ID updated.")
    terminal.sendInput("\r")

    await waitForHistoryCount(terminal, "Action [1-5]:", 4)
    terminal.sendInput("4\r")
    await waitForHistoryCount(terminal, "Provider [1-1]:", 3)
    terminal.sendInput("1\r")
    await waitForHistory(terminal, "Type REMOVE to delete")
    terminal.sendInput("REMOVE\r")
    await waitForHistory(
      terminal,
      "No configured conversation Provider remains."
    )
    terminal.sendInput("\r")

    await waitForHistoryCount(terminal, "Action [1-5]:", 5)
    terminal.sendInput("5\r")
    await expect(running).resolves.toBeUndefined()
    release?.()

    expect(fixture.replacements).toHaveLength(3)
    expect(fixture.replacements[0]).toMatchObject({
      credential: "first-secret",
      activateByDefault: true,
      modelEndpoints: [{ model: { id: "first-model" } }]
    })
    expect(fixture.replacements[1]).toMatchObject({
      credential: "rotated-secret",
      makeActiveEndpointId: fixture.replacements[0]!.modelEndpoints[0]!.id,
      activateByDefault: false
    })
    expect(fixture.replacements[2]).toMatchObject({
      modelEndpoints: [{ model: { id: "edited-model" } }]
    })
    expect("credential" in fixture.replacements[2]!).toBe(false)
    expect(fixture.removedConnectionIds).toEqual([
      fixture.replacements[0]!.connectionId
    ])
    expect(fixture.list().endpoints).toEqual([])
    expect(terminal.outputHistory()).not.toContain("first-secret")
    expect(terminal.outputHistory()).not.toContain("rotated-secret")
    expect(terminal.lifecycle()).toEqual({
      active: false,
      drainCount: 1,
      stopCount: 1
    })
  })
})

class ProviderMutationFixture implements WanexAppProviderMutationCoordinator {
  readonly replacements: WanexAppProviderReplaceRequest[] = []
  readonly removedConnectionIds: string[] = []
  private endpoints: ModelEndpoint[] = []
  private activeEndpointId: string | undefined

  async reconcilePending() {
    return {
      mutationDisposition: "none" as const,
      credentialCleanupPending: false
    }
  }

  async replace(request: WanexAppProviderReplaceRequest) {
    this.replacements.push(request)
    this.endpoints = request.modelEndpoints.map((endpoint) => ({ ...endpoint }))
    this.activeEndpointId = request.makeActiveEndpointId ??
      (request.activateByDefault === true ? this.endpoints[0]?.id : this.activeEndpointId)
    return {
      endpoints: this.list().endpoints,
      credentialCleanupPending: false
    }
  }

  async remove(request: { readonly connectionId: string }) {
    this.removedConnectionIds.push(request.connectionId)
    const removedEndpointIds = this.endpoints
      .filter((endpoint) => endpoint.connection.id === request.connectionId)
      .map((endpoint) => endpoint.id)
    this.endpoints = this.endpoints.filter(
      (endpoint) => endpoint.connection.id !== request.connectionId
    )
    this.activeEndpointId = this.endpoints[0]?.id
    return {
      connectionId: request.connectionId,
      removedEndpointIds,
      ...(this.activeEndpointId === undefined
        ? {}
        : { activeEndpointId: this.activeEndpointId }),
      credentialCleanupPending: false
    }
  }

  list() {
    return {
      ...(this.activeEndpointId === undefined
        ? {}
        : { activeEndpointId: this.activeEndpointId }),
      endpoints: this.endpoints.map((endpoint) => ({
        id: endpoint.id,
        connection: endpoint.connection,
        protocol: endpoint.protocol,
        model: endpoint.model,
        credentialConfigured: endpoint.protocol.id !== "fake",
        active: endpoint.id === this.activeEndpointId
      }))
    }
  }
}

class NoopSecretStore implements SecretStorePort {
  readonly scheme = WANEX_LOCAL_KEYCHAIN_SECRET_SCHEME
  async put(): Promise<void> {}
  async delete(): Promise<void> {}
  async resolve(): Promise<never> {
    throw new Error("secret resolution is not used by this host test")
  }
}

async function waitForHistory(
  terminal: TuiVirtualTerminal,
  text: string
): Promise<void> {
  await waitForCondition(
    () => terminal.outputHistory().includes(text),
    `terminal history text: ${text}`
  )
}

async function waitForHistoryCount(
  terminal: TuiVirtualTerminal,
  text: string,
  count: number
): Promise<void> {
  await waitForCondition(
    () => terminal.outputHistory().split(text).length - 1 >= count,
    `terminal history occurrence ${count}: ${text}`
  )
}

async function waitForCondition(
  condition: () => boolean,
  description: string
): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`timed out waiting for ${description}`)
}
