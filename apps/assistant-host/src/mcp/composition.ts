import { WanexMcpRuntimeClient } from "@wanex/mcp/client"
import {
  NativeChildSupervisor,
  NativeExecutionEnvironment,
  type ExecutionEnvironment,
  type ExecutionScope,
} from "@wanex/runtime/execution"
import type { SecretResolverPort } from "@wanex/runtime/secrets"
import { ToolRegistry } from "@wanex/runtime/tools"
import type { CoreStore } from "@wanex/storage"
import { loadLocalMcpServerDefinitions } from "./definition-store.js"
import type {
  LocalMcpComposition,
  LocalMcpFailureCategory,
  LocalMcpNamedValue,
  LocalMcpServerDefinition,
  LocalMcpServerStatus,
} from "./model.js"

const PREPARE_CONCURRENCY = 4

interface PreparedMcpMember {
  readonly client: WanexMcpRuntimeClient
  readonly scope?: ExecutionScope
  readonly registry: ToolRegistry
  readonly status: LocalMcpServerStatus
}

export async function prepareLocalMcpComposition(options: {
  readonly storage: Pick<CoreStore, "listConfigEntries">
  readonly secretResolver: SecretResolverPort
  readonly serviceBin?: string
}): Promise<LocalMcpComposition> {
  const loaded = await loadLocalMcpServerDefinitions(options.storage)
  const enabledStdio = loaded.definitions.some(
    (definition) => definition.enabled && definition.transport.kind === "stdio"
  )
  const executionEnvironment = enabledStdio && options.serviceBin !== undefined
    ? new NativeExecutionEnvironment({
        environmentId: "native_assistant_mcp",
        strategy: {
          kind: "supervised",
          childSupervisor: new NativeChildSupervisor({
            serviceBin: options.serviceBin,
          }),
        },
        managedProcess: true,
      })
    : undefined
  const members: PreparedMcpMember[] = []
  const statuses: LocalMcpServerStatus[] = [...loaded.failures]

  try {
    const prepared = await mapWithConcurrency(
      loaded.definitions,
      PREPARE_CONCURRENCY,
      async (definition) => await prepareDefinition({
        definition,
        secretResolver: options.secretResolver,
        ...(executionEnvironment === undefined
          ? {}
          : { executionEnvironment }),
      })
    )
    const aggregate = new ToolRegistry()
    members.push(...prepared.flatMap((item) =>
      "failure" in item ? [] : [item]
    ))
    for (const item of prepared) {
      if ("failure" in item) {
        statuses.push(item.status)
        continue
      }
      try {
        mergeRegistry(aggregate, item.registry)
        statuses.push(item.status)
      } catch {
        await disposeMember(item)
        statuses.push(failedStatus(item.status, "tool_collision"))
      }
    }
    statuses.sort(compareStatus)
    return createComposition({
      fingerprint: loaded.fingerprint,
      ...(executionEnvironment === undefined
        ? {}
        : { executionEnvironment }),
      members,
      statuses,
      ...(aggregate.list().length === 0 ? {} : { tools: aggregate }),
    })
  } catch (error) {
    await Promise.allSettled(members.map(disposeMember))
    await executionEnvironment?.close().catch(() => undefined)
    throw error
  }
}

async function prepareDefinition(options: {
  readonly definition: LocalMcpServerDefinition
  readonly secretResolver: SecretResolverPort
  readonly executionEnvironment?: ExecutionEnvironment
}): Promise<PreparedMcpMember | {
  readonly failure: true
  readonly status: LocalMcpServerStatus
}> {
  const definition = options.definition
  const baseStatus = {
    serverId: definition.serverId,
    label: definition.label,
    transport: definition.transport.kind,
    toolCount: 0,
  } as const
  if (!definition.enabled) {
    return { failure: true, status: { ...baseStatus, state: "stopped" } }
  }
  let scope: ExecutionScope | undefined
  let client: WanexMcpRuntimeClient | undefined
  let stage: "credential" | "execution" | "connect" | "discover" = "credential"
  try {
    const transport = definition.transport
    if (transport.kind === "stdio") {
      const environment = await resolveNamedValues(
        transport.environment,
        options.secretResolver,
        definition.serverId
      )
      stage = "execution"
      if (options.executionEnvironment === undefined) {
        throw new Error("MCP stdio execution is unavailable")
      }
      scope = await options.executionEnvironment.bind({
        scopeId: `assistant_mcp_${definition.serverId}`,
        policy: {
          revision: 1,
          filesystem: {
            roots: [{ id: "mcp_cwd", effects: ["read"] }],
            maxReadBytes: 1,
            maxDirectoryEntries: 1,
          },
          process: {
            oneShot: false,
            managed: true,
            cleanup: "durable_supervisor",
            environmentVariables: transport.environment.map((value) => value.name),
          },
          network: "unrestricted",
          isolation: "none",
          pty: false,
        },
        fileSystemRoots: [{ id: "mcp_cwd", path: transport.cwd }],
      })
      stage = "connect"
      client = new WanexMcpRuntimeClient({
        id: definition.serverId,
        capabilityRevision: definition.capabilityRevision,
        namePrefix: definition.serverId,
        connectTimeoutMs: definition.connectTimeoutMs,
        requestTimeoutMs: definition.requestTimeoutMs,
        transport: {
          kind: "stdio",
          command: transport.command,
          args: transport.args,
          cwd: transport.cwd,
          execution: scope,
          ...(environment.size === 0
            ? {}
            : { env: Object.fromEntries(environment) }),
          ...(transport.maxBufferBytes === undefined
            ? {}
            : { maxBufferSize: transport.maxBufferBytes }),
        },
      })
    } else {
      const headers = await resolveNamedValues(
        transport.headers,
        options.secretResolver,
        definition.serverId
      )
      stage = "connect"
      client = new WanexMcpRuntimeClient({
        id: definition.serverId,
        capabilityRevision: definition.capabilityRevision,
        namePrefix: definition.serverId,
        connectTimeoutMs: definition.connectTimeoutMs,
        requestTimeoutMs: definition.requestTimeoutMs,
        transport: {
          kind: "streamable_http",
          url: transport.url,
          ...(headers.size === 0 ? {} : { headers: Object.fromEntries(headers) }),
        },
      })
    }
    await client.start()
    stage = "discover"
    const registry = await client.createRegistry()
    return {
      client,
      ...(scope === undefined ? {} : { scope }),
      registry,
      status: {
        ...baseStatus,
        state: "ready",
        toolCount: registry.list().length,
      },
    }
  } catch {
    await client?.dispose().catch(() => undefined)
    await scope?.close().catch(() => undefined)
    return {
      failure: true,
      status: {
        ...baseStatus,
        state: "failed",
        failure: failureForStage(stage),
      },
    }
  }
}

async function resolveNamedValues(
  values: readonly LocalMcpNamedValue[],
  secretResolver: SecretResolverPort,
  serverId: string
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  for (const value of values) {
    if (value.source.kind === "literal") {
      resolved.set(value.name, value.source.value)
      continue
    }
    const secret = await secretResolver.resolve(value.source.ref, {
      credentialId: `mcp:${serverId}:${value.name}`,
    })
    try {
      resolved.set(value.name, secret.reveal())
    } finally {
      secret.dispose()
    }
  }
  return resolved
}

function mergeRegistry(target: ToolRegistry, source: ToolRegistry): void {
  const descriptors = source.list()
  for (const descriptor of descriptors) {
    if (target.get(descriptor.name) !== undefined) {
      throw new Error(`MCP Tool name is duplicated: ${descriptor.name}`)
    }
  }
  for (const descriptor of descriptors) {
    const definition = source.get(descriptor.name)
    if (definition === undefined) {
      throw new Error(`MCP registry changed during composition: ${descriptor.name}`)
    }
    target.register(definition)
  }
}

function createComposition(options: {
  readonly fingerprint: string
  readonly executionEnvironment?: ExecutionEnvironment
  readonly members: readonly PreparedMcpMember[]
  readonly statuses: readonly LocalMcpServerStatus[]
  readonly tools?: ToolRegistry
}): LocalMcpComposition {
  let disposePromise: Promise<void> | undefined
  let disposed = false
  const statuses = freezeStatuses(options.statuses)
  const stoppedStatuses = freezeStatuses(statuses.map((status) =>
    status.state === "ready"
      ? { ...status, state: "stopped" as const }
      : status
  ))
  return {
    fingerprint: options.fingerprint,
    ...(options.tools === undefined ? {} : { tools: options.tools }),
    status: () => disposed ? stoppedStatuses : statuses,
    dispose() {
      disposePromise ??= disposeComposition(options).then(() => {
        disposed = true
      })
      return disposePromise
    },
  }
}

function freezeStatuses(
  statuses: readonly LocalMcpServerStatus[]
): readonly LocalMcpServerStatus[] {
  return Object.freeze(statuses.map((status) => Object.freeze({ ...status })))
}

async function disposeComposition(options: {
  readonly executionEnvironment?: ExecutionEnvironment
  readonly members: readonly PreparedMcpMember[]
}): Promise<void> {
  const memberResults = await Promise.allSettled(
    options.members.map(disposeMember)
  )
  let environmentFailure: unknown
  try {
    await options.executionEnvironment?.close()
  } catch (error) {
    environmentFailure = error
  }
  const memberFailure = memberResults.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  )
  if (memberFailure !== undefined) throw memberFailure.reason
  if (environmentFailure !== undefined) throw environmentFailure
}

async function disposeMember(member: PreparedMcpMember): Promise<void> {
  let failure: unknown
  try {
    await member.client.dispose()
  } catch (error) {
    failure = error
  }
  try {
    await member.scope?.close()
  } catch (error) {
    failure ??= error
  }
  if (failure !== undefined) throw failure
}

function failedStatus(
  status: LocalMcpServerStatus,
  failure: LocalMcpFailureCategory
): LocalMcpServerStatus {
  return { ...status, state: "failed", toolCount: 0, failure }
}

function failureForStage(
  stage: "credential" | "execution" | "connect" | "discover"
): LocalMcpFailureCategory {
  switch (stage) {
    case "credential": return "credential_unavailable"
    case "execution": return "execution_unavailable"
    case "connect": return "connect_failed"
    case "discover": return "discovery_failed"
  }
}

function compareStatus(
  left: LocalMcpServerStatus,
  right: LocalMcpServerStatus
): number {
  return (left.serverId ?? "\uffff").localeCompare(right.serverId ?? "\uffff")
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  map: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = next
        next += 1
        if (index >= values.length) return
        results[index] = await map(values[index]!)
      }
    }
  )
  await Promise.all(workers)
  return results
}
