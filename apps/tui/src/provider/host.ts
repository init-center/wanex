import type { Terminal } from "@earendil-works/pi-tui"
import type { ModelEndpoint } from "@wanex/protocol"
import type {
  Shell,
  ShellOptions
} from "@wanex/assistant"
import {
  resolveCredentialEndpoints,
  unresolvedConversationModel
} from "@wanex/assistant"
import type {
  WanexAppProviderMutationCoordinator
} from "@wanex/app/provider-mutation"
import { wanexLocalCredentialPolicy } from "@wanex/local-credential-store"
import { normalizeModelEndpoint } from "@wanex/runtime/provider"
import type { SecretStorePort } from "@wanex/runtime/secrets"
import { collectTuiProviderSetup } from "./onboarding.js"
import {
  readTuiProviderCredential,
  readTuiProviderSetupInput
} from "./input.js"
import { terminalSingleLineText } from "../full-screen/terminal-text.js"
import { TuiTrustedTerminalReader } from "../host/terminal-reader.js"

const MAX_MODEL_ID_BYTES = 256
type ProviderList = Awaited<
  ReturnType<Shell["modelEndpoints"]["listModelEndpoints"]>
>
type ProviderEndpoint = ProviderList["endpoints"][number]

export interface TuiTrustedProviderHost
  extends NonNullable<ShellOptions["trustedProviderHost"]> {
  bindMutationCoordinator(
    coordinator: WanexAppProviderMutationCoordinator
  ): void | (() => void)
  manage(options: {
    readonly listModelEndpoints:
      Shell["modelEndpoints"]["listModelEndpoints"]
  }): Promise<void>
}

interface ProviderConnectionGroup {
  readonly connectionId: string
  readonly endpoints: readonly ProviderEndpoint[]
}

export function createTuiTrustedProviderHost(options: {
  readonly terminal: Terminal
  readonly signal?: AbortSignal
  readonly namespace: string
  readonly credentialStore: SecretStorePort
}): TuiTrustedProviderHost {
  let coordinator: WanexAppProviderMutationCoordinator | undefined
  let managing = false

  return {
    credentialStore: options.credentialStore,
    credentialPolicy: wanexLocalCredentialPolicy({
      namespace: options.namespace,
      scheme: options.credentialStore.scheme
    }),
    bindMutationCoordinator(value) {
      if (coordinator !== undefined) {
        throw new Error("trusted Provider coordinator is already bound")
      }
      coordinator = value
      return () => {
        if (coordinator === value) coordinator = undefined
      }
    },
    async requestInitialReplacement(endpoints) {
      const active = endpoints.endpoints.find((endpoint) => endpoint.active)
      if (
        active !== undefined &&
        (active.protocol.id === "fake" || active.credentialConfigured)
      ) {
        return undefined
      }

      const input = await collectTuiProviderSetup({
        terminal: options.terminal,
        ...(options.signal === undefined ? {} : { signal: options.signal })
      })
      const resolved = resolveSetup(input)
      return {
        connectionId: resolved.connectionId,
        credential: input.credential,
        modelEndpoints: [resolved.conversationEndpoint],
        makeActiveEndpointId: resolved.conversationEndpoint.id
      }
    },
    async manage(management) {
      if (managing) throw new Error("Provider management is already active")
      const mutation = coordinator
      if (mutation === undefined) {
        throw new Error("trusted Provider coordinator is not bound")
      }
      managing = true
      const reader = new TuiTrustedTerminalReader({
        terminal: options.terminal,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        cancellationMessage: "Provider management was cancelled"
      })
      reader.start()
      try {
        options.terminal.setTitle("Wanex Provider Management")
        while (true) {
          options.terminal.clearScreen()
          const providers = await management.listModelEndpoints()
          renderProviders(reader, providers)
          reader.write([
            "\r\n  1. Add Provider",
            "  2. Rotate credential",
            "  3. Edit model ID",
            "  4. Remove Provider",
            "  5. Back to Wanex",
            ""
          ].join("\r\n"))
          const action = await readChoice(reader, "Action [1-5]: ", 5)
          if (action === 5) return
          try {
            if (action === 1) {
              await addProvider(reader, providers, mutation)
            } else {
              const group = await selectConnection(reader, providers)
              if (action === 2) {
                await rotateCredential(reader, group, mutation)
              } else if (action === 3) {
                await editModelId(reader, group, mutation)
              } else {
                await removeProvider(reader, group, mutation)
              }
            }
          } catch (error) {
            reader.write(`\r\nProvider operation failed: ${safeText(error)}\r\n`)
          }
          await reader.readLine({
            prompt: "\r\nPress Enter to continue...",
            maxBytes: 0,
            allowEmpty: true
          })
        }
      } finally {
        managing = false
        await reader.stop()
      }
    }
  }
}

async function addProvider(
  reader: TuiTrustedTerminalReader,
  providers: ProviderList,
  coordinator: WanexAppProviderMutationCoordinator
): Promise<void> {
  reader.write("\r\nAdd Provider\r\n\r\n")
  const input = await readTuiProviderSetupInput(reader)
  const resolved = resolveSetup(input)
  if (providers.endpoints.some(
    (endpoint) => endpoint.connection.id === resolved.connectionId
  )) {
    throw new Error(
      "Provider connection already exists; use rotate or edit instead"
    )
  }
  const credential = await readTuiProviderCredential(reader)
  reader.write("Applying Provider configuration...\r\n")
  await coordinator.replace({
    connectionId: resolved.connectionId,
    credential,
    modelEndpoints: [resolved.conversationEndpoint],
    activateByDefault: providers.endpoints.length === 0
  })
  reader.write("Provider added.\r\n")
}

async function rotateCredential(
  reader: TuiTrustedTerminalReader,
  group: ProviderConnectionGroup,
  coordinator: WanexAppProviderMutationCoordinator
): Promise<void> {
  const credential = await readTuiProviderCredential(reader)
  reader.write("Rotating credential...\r\n")
  await coordinator.replace({
    connectionId: group.connectionId,
    credential,
    modelEndpoints: reconstructEndpoints(group.endpoints),
    ...activeReplacement(group)
  })
  reader.write("Credential rotated.\r\n")
}

async function editModelId(
  reader: TuiTrustedTerminalReader,
  group: ProviderConnectionGroup,
  coordinator: WanexAppProviderMutationCoordinator
): Promise<void> {
  const endpoint = group.endpoints.length === 1
    ? group.endpoints[0]!
    : await selectEndpoint(reader, group.endpoints)
  const modelId = await reader.readLine({
    prompt: `New model ID for ${safeText(endpoint.model.id)}: `,
    maxBytes: MAX_MODEL_ID_BYTES
  })
  const replacements = group.endpoints.map((candidate) =>
    reconstructEndpoint(
      candidate.id === endpoint.id
        ? { ...candidate, model: { ...candidate.model, id: modelId } }
        : candidate
    )
  )
  reader.write("Applying model configuration...\r\n")
  await coordinator.replace({
    connectionId: group.connectionId,
    modelEndpoints: replacements,
    ...activeReplacement(group)
  })
  reader.write("Model ID updated.\r\n")
}

async function removeProvider(
  reader: TuiTrustedTerminalReader,
  group: ProviderConnectionGroup,
  coordinator: WanexAppProviderMutationCoordinator
): Promise<void> {
  const confirmation = await reader.readLine({
    prompt: `Type REMOVE to delete ${safeText(group.connectionId)}: `,
    maxBytes: 6
  })
  if (confirmation !== "REMOVE") {
    reader.write("Provider removal cancelled.\r\n")
    return
  }
  reader.write("Removing Provider...\r\n")
  const result = await coordinator.remove({ connectionId: group.connectionId })
  reader.write(
    result.activeEndpointId === undefined
      ? "Provider removed. No configured conversation Provider remains.\r\n"
      : `Provider removed. Active model: ${safeText(result.activeEndpointId)}\r\n`
  )
}

async function selectConnection(
  reader: TuiTrustedTerminalReader,
  providers: ProviderList
): Promise<ProviderConnectionGroup> {
  const groups = providerGroups(providers).filter((group) =>
    group.endpoints.some((endpoint) => endpoint.protocol.id !== "fake")
  )
  if (groups.length === 0) {
    throw new Error("no manageable Provider connection is configured")
  }
  reader.write("\r\n")
  groups.forEach((group, index) => {
    const active = group.endpoints.some((endpoint) => endpoint.active)
    const models = group.endpoints.map((endpoint) => endpoint.model.id).join(", ")
    reader.write(
      `  ${index + 1}. ${safeText(group.connectionId)}` +
      ` / ${safeText(models)}${active ? " [active]" : ""}\r\n`
    )
  })
  const choice = await readChoice(
    reader,
    `Provider [1-${groups.length}]: `,
    groups.length
  )
  return groups[choice - 1]!
}

async function selectEndpoint(
  reader: TuiTrustedTerminalReader,
  endpoints: readonly ProviderEndpoint[]
): Promise<ProviderEndpoint> {
  reader.write("\r\n")
  endpoints.forEach((endpoint, index) => {
    reader.write(
      `  ${index + 1}. ${safeText(endpoint.model.id)} (${safeText(endpoint.id)})\r\n`
    )
  })
  const choice = await readChoice(
    reader,
    `Model [1-${endpoints.length}]: `,
    endpoints.length
  )
  return endpoints[choice - 1]!
}

async function readChoice(
  reader: TuiTrustedTerminalReader,
  prompt: string,
  count: number
): Promise<number> {
  while (true) {
    const value = await reader.readLine({
      prompt,
      maxBytes: String(count).length
    })
    const choice = Number(value)
    if (Number.isInteger(choice) && choice >= 1 && choice <= count) {
      return choice
    }
    reader.write(`Choose a number from 1 to ${count}.\r\n`)
  }
}

function renderProviders(
  reader: TuiTrustedTerminalReader,
  providers: ProviderList
): void {
  reader.write("Wanex Provider Management\r\n\r\nConfigured Providers\r\n")
  if (providers.endpoints.length === 0) {
    reader.write("  None\r\n")
    return
  }
  for (const group of providerGroups(providers)) {
    reader.write(`  ${safeText(group.connectionId)}\r\n`)
    for (const endpoint of group.endpoints) {
      const status = [
        endpoint.active ? "active" : "inactive",
        endpoint.protocol.id === "fake"
          ? "no credential"
          : endpoint.credentialConfigured
            ? "credential configured"
            : "credential required"
      ].join(", ")
      reader.write(
        `    ${safeText(endpoint.connection.providerId)} / ` +
        `${safeText(endpoint.model.id)} [${status}]\r\n`
      )
    }
  }
}

function providerGroups(providers: ProviderList): readonly ProviderConnectionGroup[] {
  const groups = new Map<string, ProviderEndpoint[]>()
  for (const endpoint of providers.endpoints) {
    const current = groups.get(endpoint.connection.id) ?? []
    current.push(endpoint)
    groups.set(endpoint.connection.id, current)
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([connectionId, endpoints]) => ({
      connectionId,
      endpoints: endpoints.sort((left, right) => left.id.localeCompare(right.id))
    }))
}

function reconstructEndpoints(
  endpoints: readonly ProviderEndpoint[]
): readonly ModelEndpoint[] {
  return endpoints.map(reconstructEndpoint)
}

function reconstructEndpoint(endpoint: ProviderEndpoint): ModelEndpoint {
  return normalizeModelEndpoint({
    id: endpoint.id,
    connection: endpoint.connection,
    protocol: endpoint.protocol,
    model: endpoint.model
  })
}

function activeReplacement(group: ProviderConnectionGroup): {
  readonly makeActiveEndpointId?: string
  readonly activateByDefault: false
} {
  const active = group.endpoints.find((endpoint) => endpoint.active)
  return {
    ...(active === undefined ? {} : { makeActiveEndpointId: active.id }),
    activateByDefault: false
  }
}

function resolveSetup(input: Parameters<
  typeof resolveCredentialEndpoints
>[0]) {
  return resolveCredentialEndpoints(input, {
    resolveConversationModel(providerId, modelId) {
      return unresolvedConversationModel(providerId, modelId)
    }
  })
}

function safeText(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value)
  return terminalSingleLineText(text, { maxWidth: 512, fallback: "unknown" })
}
