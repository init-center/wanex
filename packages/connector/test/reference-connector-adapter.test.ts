import { readFileSync } from "node:fs"
import { join } from "node:path"
import type {
  ConnectorDeliveryHandlerContext,
  ConnectorHostContext,
  ConnectorAdapterPackageJsonLike
} from "@wanex/connector"
import { validateConnectorAdapterPackaging } from "@wanex/connector"
import type {
  ConnectorSessionRecord,
  SchedulerJobRecord
} from "@wanex/protocol"
import { describe, expect, it } from "vitest"
import { runConnectorAdapterContractHarness } from "@wanex/connector"
import {
  createReferenceConnectorAdapter,
  InMemoryReferenceConnectorTransport,
  REFERENCE_CONNECTOR_CHANNEL_ID,
  REFERENCE_CONNECTOR_CHANNEL_KIND,
  REFERENCE_CONNECTOR_ID,
  REFERENCE_CONNECTOR_PLUGIN_ID,
  REFERENCE_CONNECTOR_VERSION,
  referenceConnectorPackaging,
  referenceConnectorManifest
} from "./fixtures/reference-connector/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

describe("@wanex/connector-adapter-fixture", () => {
  it("exports the reference connector manifest metadata", () => {
    expect(referenceConnectorManifest).toMatchObject({
      pluginId: REFERENCE_CONNECTOR_PLUGIN_ID,
      version: REFERENCE_CONNECTOR_VERSION,
      entry: {
        kind: "wanex.connector-adapter"
      },
      capabilities: [
        "channel.connect",
        "channel.receive",
        "channel.deliver"
      ]
    })
  })

  it("declares a packaging contract that keeps host app node_modules out", () => {
    const report = validateConnectorAdapterPackaging({
      packageJson: readPackageJson(),
      packaging: referenceConnectorPackaging,
      manifest: {
        pluginId: REFERENCE_CONNECTOR_PLUGIN_ID,
        version: REFERENCE_CONNECTOR_VERSION
      }
    })

    expect(report.ok).toBe(true)
    expect(report.errors).toEqual([])
  })

  it("passes the standard connector adapter lifecycle contract", async () => {
    const transport = new InMemoryReferenceConnectorTransport({
      inbound: [
        {
          id: "event_1",
          senderExternalIdentityId: "reference_sender",
          principalId: "principal_contract",
          text: "hello from reference"
        }
      ]
    })
    const adapter = createReferenceConnectorAdapter({ transport })

    const receipt = await runConnectorAdapterContractHarness({
      serviceBin,
      connectorId: REFERENCE_CONNECTOR_ID,
      pluginId: REFERENCE_CONNECTOR_PLUGIN_ID,
      channelKind: REFERENCE_CONNECTOR_CHANNEL_KIND,
      channelId: REFERENCE_CONNECTOR_CHANNEL_ID,
      secretRef: "static://reference/token",
      secretValue: "reference-secret-token",
      adapter
    })

    expect(receipt).toEqual({
      sessionState: "disconnected",
      inboundEventCount: 1,
      channelKind: REFERENCE_CONNECTOR_CHANNEL_KIND,
      channelId: REFERENCE_CONNECTOR_CHANNEL_ID,
      deliveryJobState: "succeeded",
      deliveryResult: {
        externalMessageId: "refmsg_1",
        targetExternalIdentityId: "contract_target",
        externalThreadId: null
      }
    })
    expect(transport.connectCount).toBe(1)
    expect(transport.lastToken).toBe("reference-secret-token")
    expect(transport.sent).toEqual([
      {
        id: "refmsg_1",
        targetExternalIdentityId: "contract_target",
        payload: { text: "contract delivery" }
      }
    ])
    expect(transport.isClosed).toBe(true)
  })

  it("fails closed when a delivery is for another channel kind", async () => {
    const transport = new InMemoryReferenceConnectorTransport()
    const adapter = createReferenceConnectorAdapter({ transport })

    await expect(
      adapter.deliver({
        job: fakeDeliveryJob(),
        delivery: {
          deliveryId: "chdel_wrong_kind",
          connectorId: REFERENCE_CONNECTOR_ID,
          channelKind: "telegram",
          channelId: REFERENCE_CONNECTOR_CHANNEL_ID,
          payload: { text: "wrong" }
        },
        signal: new AbortController().signal,
        heartbeat: async () => {},
        host: fakeHostContext()
      } satisfies ConnectorDeliveryHandlerContext & {
        readonly host: ConnectorHostContext
      })
    ).rejects.toThrow("reference connector cannot deliver channel kind")
    expect(transport.sent).toEqual([])
  })
})

function fakeDeliveryJob(): SchedulerJobRecord {
  const now = Date.now()
  return {
    id: "job_reference_wrong_kind",
    kind: "channel.delivery",
    state: "running",
    principalId: "principal_reference",
    payload: null,
    scheduledAt: now,
    notBefore: now,
    priority: 0,
    attempt: 1,
    maxAttempts: 1,
    retryPolicy: { strategy: "none" },
    createdAt: now,
    updatedAt: now
  }
}

function fakeSession(): ConnectorSessionRecord {
  const now = Date.now()
  return {
    id: "connses_reference",
    connectorId: REFERENCE_CONNECTOR_ID,
    credentialId: "conncred_reference",
    ownerId: "reference_test",
    leaseToken: "lease_reference",
    leaseExpiresAt: now + 60_000,
    state: "connected",
    createdAt: now,
    updatedAt: now
  }
}

function fakeHostContext(): ConnectorHostContext {
  return {
    connectorId: REFERENCE_CONNECTOR_ID,
    credentialId: "conncred_reference",
    ownerId: "reference_test",
    signal: new AbortController().signal,
    get session() {
      return fakeSession()
    },
    heartbeat: async () => fakeSession(),
    resolveCredentialSecret: async () => {
      throw new Error("not used")
    },
    ingestEvent: async () => {
      throw new Error("not used")
    }
  }
}

function readPackageJson(): ConnectorAdapterPackageJsonLike {
  return JSON.parse(
    readFileSync(
      join(
        import.meta.dirname,
        "fixtures/reference-connector/package.fixture.json"
      ),
      "utf8"
    )
  ) as ConnectorAdapterPackageJsonLike
}
