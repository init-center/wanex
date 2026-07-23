import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { JsonValue } from "@wanex/protocol"
import {
  SecretResolver,
  StaticSecretProvider
} from "@wanex/runtime/secrets"
import { WanexSessionCore } from "@wanex/runtime/sessions"
import { createStorageHandle } from "@wanex/storage"
import { createChannelStore } from "@wanex/storage/channel"
import { createConnectorStore } from "@wanex/storage/connector"
import { createPluginStore } from "@wanex/storage/plugin"
import { WanexWorker } from "@wanex/runtime/jobs"
import type { ConnectorAdapter } from "./host.js"
import { ConnectorHost } from "./host.js"
import { ConnectorRuntime } from "./runtime.js"

export interface ConnectorAdapterContractHarnessOptions {
  readonly serviceBin: string
  readonly connectorId?: string
  readonly pluginId?: string
  readonly channelKind?: string
  readonly channelId?: string
  readonly secretRef?: string
  readonly secretValue?: string
  readonly adapter: ConnectorAdapter
}

export interface ConnectorAdapterContractReceipt {
  readonly sessionState: string
  readonly inboundEventCount: number
  readonly channelKind: string
  readonly channelId: string
  readonly deliveryJobState: string
  readonly deliveryResult: JsonValue | undefined
}

export async function runConnectorAdapterContractHarness(
  options: ConnectorAdapterContractHarnessOptions
): Promise<ConnectorAdapterContractReceipt> {
  const connectorId = options.connectorId ?? "connector.contract"
  const pluginId = options.pluginId ?? "plugin.connector.contract"
  const channelKind = options.channelKind ?? "contract"
  const channelId = options.channelId ?? "main"
  const secretRef = options.secretRef ?? "static://connector/contract"
  const secretValue = options.secretValue ?? "contract-secret"
  const storeDir = await mkdtemp(join(tmpdir(), "wanex-adapter-contract-"))
  const handle = createStorageHandle({
    kind: "local-system-service",
    mode: "persistent",
    storeDir,
    serviceBin: options.serviceBin
  })
  const storage = Object.assign(
    {},
    handle.core,
    createPluginStore(handle.transport),
    createConnectorStore(handle.transport),
    createChannelStore(handle.transport)
  )

  try {
    const connector = new ConnectorRuntime({ storage })
    const secrets = new SecretResolver([
      new StaticSecretProvider({
        values: {
          [secretRef]: secretValue
        }
      })
    ])
    await storage.putPluginManifest({
      pluginId,
      version: "1.0.0",
      name: "Connector Contract Plugin",
      entry: { kind: "contract" },
      capabilities: ["channel.connect", "channel.receive", "channel.deliver"],
      idempotencyKey: `${pluginId}:manifest`
    })
    await connector.registerConnector({
      connectorId,
      pluginId,
      version: "1.0.0",
      idempotencyKey: `${connectorId}:registration`
    })
    const credential = await connector.putCredentialRef({
      connectorId,
      kind: "contract-secret",
      secretRef,
      idempotencyKey: `${connectorId}:credential`
    })
    const worker = new WanexWorker({
      session: new WanexSessionCore({ storage }),
      workerId: "connector_contract_worker",
      leaseMs: 60_000,
      kinds: ["channel.delivery"]
    })
    const host = new ConnectorHost({
      runtime: connector,
      connectorId,
      credentialId: credential.id,
      credentialSecretRef: credential.secretRef,
      secretResolver: secrets,
      ownerId: "connector_contract_host",
      leaseMs: 60_000,
      sessionId: "connses_contract",
      idempotencyKey: `${connectorId}:session`,
      worker,
      adapter: options.adapter
    })

    const run = await host.start()
    await connector.submitDelivery({
      id: "chdel_contract",
      connectorId,
      channelKind,
      channelId,
      targetExternalIdentityId: "contract_target",
      principalId: "principal_contract",
      payload: { text: "contract delivery" },
      jobId: "job_contract_delivery",
      idempotencyKey: `${connectorId}:delivery`
    })
    const delivery = await run.runDeliveryOnce()
    const stopped = await run.stop()
    const inbound = await connector.listEvents({
      connectorId,
      limit: 20
    })

    if (delivery.status !== "completed") {
      throw new Error(`adapter contract delivery failed: ${delivery.status}`)
    }

    return {
      sessionState: stopped.state,
      inboundEventCount: inbound.length,
      channelKind,
      channelId,
      deliveryJobState: delivery.job.state,
      deliveryResult: delivery.job.result
    }
  } finally {
    await handle.dispose()
    await rm(storeDir, { recursive: true, force: true })
  }
}
