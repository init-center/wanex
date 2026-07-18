import assert from "node:assert/strict"
import { runConnectorAdapterContractHarness } from "@wanex/connector"

let resolvedSecret
let stopped = false
const receipt = await runConnectorAdapterContractHarness({
  serviceBin: required("WANEX_SYSTEM_SERVICE_BIN"),
  secretValue: "external-connector-secret",
  adapter: {
    async start(context) {
      const secret = await context.resolveCredentialSecret()
      try {
        resolvedSecret = secret.reveal()
      } finally {
        secret.dispose()
      }
      await context.ingestEvent({
        id: "chin_external_connector",
        channelKind: "contract",
        channelId: "main",
        externalEventId: "external-event-1",
        senderExternalIdentityId: "external-sender",
        principalId: "principal_external_connector",
        payload: { text: "external inbound" },
        idempotencyKey: "external-event-1"
      })
    },
    deliver({ delivery }) {
      return {
        delivered: true,
        deliveryId: delivery.deliveryId,
        payload: delivery.payload
      }
    },
    stop() {
      stopped = true
    }
  }
})

assert.equal(resolvedSecret, "external-connector-secret")
assert.equal(stopped, true)
assert.equal(receipt.sessionState, "disconnected")
assert.equal(receipt.inboundEventCount, 1)
assert.equal(receipt.deliveryJobState, "succeeded")
assert.deepEqual(receipt.deliveryResult, {
  delivered: true,
  deliveryId: "chdel_contract",
  payload: { text: "contract delivery" }
})
process.stdout.write(`${JSON.stringify({
  id: "connector-contract",
  ok: true,
  sessionState: receipt.sessionState,
  inboundEventCount: receipt.inboundEventCount,
  deliveryJobState: receipt.deliveryJobState,
  secretResolved: resolvedSecret === "external-connector-secret"
})}\n`)

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`missing ${name}`)
  return value
}
