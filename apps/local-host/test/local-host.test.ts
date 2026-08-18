import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  formatLocalCliStartupSummary,
  formatLocalCliStartupSummaryJson,
  projectLocalCliStartupSummary,
  formatLocalCliProviderSetupResult,
  formatLocalCliSmokeResult,
  runLocalCliProviderSetup,
  runLocalCliSmoke,
  localSecretNamespace,
  startLocalWebApp,
  type LocalModelEndpointOptions,
  type LocalModelEndpointsOptions,
  type LocalWebApp
} from "../src/index.js"
import {
  wanexLocalCredentialPolicy,
  wanexLocalCredentialRef
} from "@wanex/local-credential-store"
import {
  createWanexAppProviderMutationCoordinator,
  WANEX_APP_CREDENTIAL_RETIREMENT_KEY,
  WANEX_APP_PROVIDER_MUTATION_INTENT_KEY
} from "@wanex/app/provider-mutation"
import type {
  SecretResolveContext,
  SecretStorePort
} from "@wanex/runtime/secrets"
import { InMemoryResolvedSecret } from "@wanex/runtime/secrets"
import {
  createStorageTestStore,
  createTestTurnExecutionBinding,
  type StorageTestStore
} from "@wanex/storage/testing"
import { containsSensitiveText } from "../src/sensitive-value.js"
import type {
  ConversationPresentationPart,
  PluginManagementPort,
  PluginManagementSnapshot
} from "@wanex/product"
import {
  modelEndpointDigest,
  readModelEndpoint
} from "@wanex/runtime/provider"
import { TeamConversationRuntime } from "@wanex/team/conversation"
import {
  startLocalProductHost,
  type LocalPluginCompositionPort,
  type LocalProductHost
} from "../src/application/index.js"

const serviceBin = join(
  import.meta.dirname,
  `../../../target/debug/wanex-system-service${process.platform === "win32" ? ".exe" : ""}`
)

const tempDirs: string[] = []
const apps: LocalWebApp[] = []
const productHosts: LocalProductHost[] = []
const rawTeamStores: StorageTestStore[] = []

afterEach(async () => {
  while (productHosts.length > 0) {
    await productHosts.pop()?.close()
  }
  while (apps.length > 0) {
    await apps.pop()?.close()
  }
  while (rawTeamStores.length > 0) {
    await rawTeamStores.pop()?.dispose()
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("@wanex/local-host", () => {
  it("owns a presentation-neutral Product and Team lifecycle", async () => {
    const host = await startLocalProductHost({
      storage: {
        kind: "store-dir",
        storeDir: await tempDir("wanex-local-product-host-")
      },
      serviceBin,
      modelEndpoint: fakeEndpoint("local-product-host", "local-product-model")
    })
    productHosts.push(host)

    expect(host.shell.teamConversations.readAvailability()).toMatchObject({
      state: "ready",
      capabilities: {
        canCreateCoordinated: true,
        canAssignCoordinator: true,
        canSubmitRound: true
      }
    })
    await expect(host.shell.teamConversations.createConversation({
      mode: "coordinated",
      title: "Terminal-independent group",
      idempotencyKey: "local-product-host-team"
    })).resolves.toMatchObject({
      title: "Terminal-independent group",
      mode: "coordinated",
      state: "open"
    })

    await host.close()
    await host.close()
    productHosts.pop()
  })

  it("orders optional Plugin composition around the shared Product lifecycle", async () => {
    const events: string[] = []
    const pluginSnapshot: PluginManagementSnapshot = {
      kind: "plugin.management.snapshot",
      revision: "plugin-management:sha256:" + "a".repeat(64),
      installs: []
    }
    const pluginManagement = testPluginManagement(pluginSnapshot)
    const host = await startLocalProductHost({
      storage: {
        kind: "store-dir",
        storeDir: await tempDir("wanex-local-plugin-composition-")
      },
      serviceBin,
      modelEndpoint: fakeEndpoint(
        "local-plugin-composition",
        "local-plugin-composition-model"
      ),
      pluginComposition: testPluginComposition(events, false, pluginManagement)
    })
    productHosts.push(host)

    expect(events).toEqual(["prepare", "start"])
    expect(await host.shell.pluginManagement.read()).toBe(pluginSnapshot)
    await expect(host.surface.dispatchSurfaceCommand({
      command: "readPluginManagement"
    })).resolves.toMatchObject({
      ok: true,
      value: pluginSnapshot
    })
    await host.close()
    expect(events).toEqual(["prepare", "start", "stop", "dispose"])
    productHosts.pop()
  })

  it("disposes prepared Plugin composition when Plugin start fails", async () => {
    const events: string[] = []
    await expect(
      startLocalProductHost({
        storage: {
          kind: "store-dir",
          storeDir: await tempDir("wanex-local-plugin-start-failure-")
        },
        serviceBin,
        modelEndpoint: fakeEndpoint(
          "local-plugin-start-failure",
          "local-plugin-start-failure-model"
        ),
        pluginComposition: testPluginComposition(events, true)
      })
    ).rejects.toThrow("planned Plugin start failure")
    expect(events).toEqual(["prepare", "start", "stop", "dispose"])
  })

  it("passes the named Plugin composition through the Web host lifecycle", async () => {
    const events: string[] = []
    const pluginSnapshot: PluginManagementSnapshot = {
      kind: "plugin.management.snapshot",
      revision: "plugin-management:sha256:" + "b".repeat(64),
      installs: []
    }
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir: await tempDir("wanex-local-web-plugin-composition-")
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-web-plugin-composition", "local-web-plugin-model")
      ),
      pluginComposition: testPluginComposition(
        events,
        false,
        testPluginManagement(pluginSnapshot)
      ),
      web: { hostname: "127.0.0.1", port: 0 }
    })
    apps.push(app)

    expect(events).toEqual(["prepare", "start"])
    expect((await app.readSnapshot()).web.view.settings.plugins).toEqual({
      state: "ready",
      revision: pluginSnapshot.revision,
      installs: []
    })

    await app.close()
    apps.pop()
    expect(events).toEqual(["prepare", "start", "stop", "dispose"])
  })

  it("starts the local product web stack through the trusted host boundary", async () => {
    const storeDir = await tempDir("wanex-local-host-store-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-host-test", "local-host-test-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const html = await fetchText(`${app.url}/`)
    expect(html).toContain("<!doctype html>")
    expect(html).toContain("data-app-root")
    expect(html).toContain('src="/assets/app.js"')
    expect(html).toContain(
      'data-event-stream-path="/wanex/web/events"'
    )
    expect(html).not.toContain(storeDir)
    expect(html).not.toContain(serviceBin)

    const submitted = await postJson(`${app.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "product_app_local_set_layout",
      action: {
        type: "set-layout",
        input: {
          layout: "split"
        }
      }
    })

    expect(submitted).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "product_app_local_set_layout",
      actionResult: {
        ok: true,
        action: "set-layout",
        snapshot: {
          view: {
            layout: "split"
          }
        }
      }
    })
    expect(app.settings.readSettings().state.layout).toBe("split")
    expect(app.controller.snapshot().view.layout).toBe("split")

    await app.close()
    await app.close()
    apps.pop()
  })

  it("executes a durable Team delivery through the shared agent host", async () => {
    const storeDir = await tempDir("wanex-local-host-team-")
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-team", "local-team-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const teamInvalidations: string[] = []
    const unsubscribeTeamEvents = app.shell.teamEvents.subscribeTeamEvents(
      (event) => teamInvalidations.push(event.cause)
    )

    await app.shell.submitConversationOperation({
      sessionId: "ses_local_team_agent",
      text: "Initialize the Team agent session"
    })
    await waitForLocalConversationTerminal(app)

    const conversation = await app.teamConversations.createConversation({
      mode: "discussion",
      idempotencyKey: "team-local-conversation"
    })
    const agent = await app.teamConversations.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_local_team_agent",
      idempotencyKey: "team-local-agent"
    })
    const submitRequest = {
      conversationId: conversation.conversationId,
      text: "Review this proposal.",
      idempotencyKey: "team-local-message"
    } as const
    const routed = await app.teamConversations.submitRound(submitRequest)
    expect(routed).toMatchObject({
      message: { status: "sent" },
      round: { status: "running", expected: 1 },
      deliveries: [{ status: "waiting" }]
    })

    const page = await waitForLocalTeamRound(
      app,
      conversation.conversationId
    )
    expect(page).toMatchObject({
      conversation: { conversationId: conversation.conversationId },
      rounds: [{
        roundId: routed.round.roundId,
        status: "completed",
        expected: 1,
        replied: 1,
        passed: 0,
        failed: 0,
        cancelled: 0
      }],
      deliveries: [{
        deliveryId: routed.deliveries[0]?.deliveryId,
        status: "replied",
        replyMessageId: expect.any(String)
      }]
    })
    expect(page.messages).toHaveLength(2)
    expect(page.messages[1]).toMatchObject({
      authorParticipantId: agent.participantId,
      parentMessageId: routed.message.messageId,
      roundId: routed.round.roundId,
      content: [{
        type: "text",
        text: "Fake response from local-team-model"
      }]
    })

    const replayed = await app.teamConversations.submitRound(submitRequest)
    expect(replayed).toMatchObject({
      message: { messageId: routed.message.messageId },
      round: { roundId: routed.round.roundId },
      deliveries: [{ deliveryId: routed.deliveries[0]?.deliveryId }]
    })
    const afterReplay = await app.teamConversations.readConversation({
      conversationId: conversation.conversationId
    })
    if (afterReplay.kind !== "product.team-conversation.found") {
      throw new Error("replayed Team conversation is missing")
    }
    expect(afterReplay.page.messages).toHaveLength(2)
    expect(afterReplay.page.rounds).toHaveLength(1)
    expect(afterReplay.page.deliveries).toHaveLength(1)
    expect(teamInvalidations).toContain("message_changed")
    expect(teamInvalidations).toContain("delivery_changed")
    expect(teamInvalidations.filter((cause) => cause === "round_changed").length)
      .toBeGreaterThanOrEqual(2)
    unsubscribeTeamEvents()

    await app.close()
    apps.pop()
    const restarted = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-team", "local-team-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(restarted)
    const recovered = await restarted.teamConversations.readConversation({
      conversationId: conversation.conversationId
    })
    if (recovered.kind !== "product.team-conversation.found") {
      throw new Error("restarted Team conversation is missing")
    }
    expect(recovered.page.messages).toHaveLength(2)
    expect(recovered.page.deliveries).toMatchObject([{
      deliveryId: routed.deliveries[0]?.deliveryId,
      status: "replied",
      replyMessageId: page.deliveries[0]?.replyMessageId
    }])

    const proofStorage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    try {
      const durableDeliveries = await proofStorage.listTeamDeliveries({
        conversationId: conversation.conversationId
      })
      const durableDelivery = durableDeliveries[0]
      expect(durableDelivery?.childTurnId).toEqual(expect.any(String))
      const turns = await proofStorage.listSessionTurns({
        sessionId: "ses_local_team_agent"
      })
      expect(turns.filter((turn) =>
        turn.id === durableDelivery?.childTurnId
      )).toHaveLength(1)
      const events = await proofStorage.queryEvents({ limit: 1_000 })
      expect(events.filter((event) =>
        event.type === "team.delivery.materialized" &&
        (event.payload as Record<string, unknown>).deliveryId ===
          routed.deliveries[0]?.deliveryId
      )).toHaveLength(1)
      expect(events.filter((event) =>
        event.type === "team.message.admitted" &&
        (event.payload as Record<string, unknown>).source ===
          "team_delivery_outcome" &&
        (event.payload as Record<string, unknown>).sourceDeliveryId ===
          routed.deliveries[0]?.deliveryId
      )).toHaveLength(1)
    } finally {
      await proofStorage.dispose()
    }
  })

  it("executes a coordinated Product round through the canonical lead host", async () => {
    const storeDir = await tempDir("wanex-local-host-coordinated-team-")
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-coordinated-team", "local-coordinated-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    await app.shell.submitConversationOperation({
      sessionId: "ses_local_coordinator",
      text: "Initialize the coordinator session"
    })
    await waitForLocalConversationTerminal(app)
    await app.shell.submitConversationOperation({
      sessionId: "ses_local_specialist",
      text: "Initialize the specialist session"
    })
    await waitForLocalConversationTerminal(app)

    const conversation = await app.teamConversations.createConversation({
      mode: "coordinated",
      idempotencyKey: "team-local-coordinated-conversation"
    })
    const coordinator = await app.teamConversations.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_local_coordinator",
      displayName: "Coordinator",
      idempotencyKey: "team-local-coordinator"
    })
    await app.teamConversations.addParticipant({
      conversationId: conversation.conversationId,
      agentSessionId: "ses_local_specialist",
      displayName: "Specialist",
      idempotencyKey: "team-local-specialist"
    })
    const assigned = await app.teamConversations.setCoordinator({
      conversationId: conversation.conversationId,
      expectedCoordinatorParticipantId: null,
      coordinatorParticipantId: coordinator.participantId
    })
    expect(assigned).toMatchObject({
      mode: "coordinated",
      coordinatorParticipantId: coordinator.participantId
    })

    const routed = await app.teamConversations.submitRound({
      conversationId: conversation.conversationId,
      text: "Coordinate one public answer.",
      idempotencyKey: "team-local-coordinated-round"
    })
    expect(routed).toMatchObject({
      conversation: {
        mode: "coordinated",
        coordinatorParticipantId: coordinator.participantId
      },
      round: { expected: 1, status: "running" },
      deliveries: [{ participantId: coordinator.participantId }]
    })

    const page = await waitForLocalTeamRound(
      app,
      conversation.conversationId
    )
    expect(page).toMatchObject({
      conversation: {
        mode: "coordinated",
        coordinatorParticipantId: coordinator.participantId
      },
      rounds: [{ expected: 1, replied: 1, status: "completed" }],
      deliveries: [{
        participantId: coordinator.participantId,
        status: "replied"
      }]
    })
    expect(page.messages).toHaveLength(2)
    expect(page.messages[1]).toMatchObject({
      authorParticipantId: coordinator.participantId,
      parentMessageId: routed.message.messageId,
      content: [{
        type: "text",
        text: "Fake response from local-coordinated-model"
      }]
    })
  })

  it("executes a Team journey through the generic Web request boundary", async () => {
    const storeDir = await tempDir("wanex-local-host-web-team-")
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-web-team", "local-web-team-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    await app.shell.submitConversationOperation({
      sessionId: "ses_local_web_team_agent",
      text: "Initialize the Web Team agent session"
    })
    await waitForLocalConversationTerminal(app)

    const created = await postJson(`${app.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "web_team_create",
      action: {
        type: "create-team-conversation",
        input: {
          mode: "discussion",
          title: "Web request Team",
          idempotencyKey: "web-team-create"
        }
      }
    })
    expect(created).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "web_team_create",
      actionResult: {
        ok: true,
        action: "create-team-conversation",
        snapshot: {
          team: {
            state: "ready",
            conversationId: expect.any(String),
            page: {
              conversation: { title: "Web request Team" },
              messages: []
            }
          }
        }
      }
    })
    const conversationId = app.controller.snapshot().team.conversationId
    if (conversationId === undefined) {
      throw new Error("Web Team conversation selection is missing")
    }

    const participantAdded = await postJson(`${app.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "web_team_add_participant",
      action: {
        type: "add-team-participant",
        input: {
          conversationId,
          agentSessionId: "ses_local_web_team_agent",
          displayName: "Web agent",
          role: "reviewer",
          idempotencyKey: "web-team-add-participant"
        }
      }
    })
    expect(participantAdded).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "web_team_add_participant",
      actionResult: {
        ok: true,
        action: "add-team-participant",
        snapshot: {
          team: {
            state: "ready",
            conversationId,
            page: {
              participants: expect.arrayContaining([
                expect.objectContaining({
                  kind: "agent",
                  displayName: "Web agent",
                  role: "reviewer",
                  state: "active"
                })
              ])
            }
          }
        }
      }
    })

    const submitted = await postJson(`${app.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "web_team_submit",
      action: {
        type: "submit-team-round",
        input: {
          conversationId,
          text: "Review this through the Web boundary.",
          idempotencyKey: "web-team-submit"
        }
      }
    })
    expect(submitted).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "web_team_submit",
      actionResult: {
        ok: true,
        action: "submit-team-round",
        snapshot: {
          team: {
            state: "ready",
            conversationId,
            page: {
              messages: [{ status: "sent" }],
              rounds: [{ expected: 1 }],
              deliveries: [{ status: expect.any(String) }]
            }
          }
        }
      }
    })

    let snapshot = app.controller.snapshot()
    for (let attempt = 0; attempt < 800; attempt += 1) {
      if (
        snapshot.team.page?.rounds.some(
          (round) => round.status !== "running"
        )
      ) {
        break
      }
      const reconciled = await postJson(`${app.url}/wanex/web/request`, {
        kind: "web.request",
        operation: "reconcileEvents",
        requestId: `web_team_reconcile_${attempt}`,
        input: { limit: 100 }
      })
      expect(reconciled).toMatchObject({
        kind: "web.response",
        ok: true,
        operation: "reconcileEvents",
        requestId: `web_team_reconcile_${attempt}`,
        snapshot: {
          team: { state: "ready", conversationId }
        }
      })
      snapshot = app.controller.snapshot()
      if (
        snapshot.team.page?.rounds.every(
          (round) => round.status !== "running"
        )
      ) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    expect(snapshot.team).toMatchObject({
      state: "ready",
      conversationId,
      page: {
        messages: [
          {
            status: "sent",
            content: [{ type: "text", text: "Review this through the Web boundary." }]
          },
          {
            status: "sent",
            content: [{ type: "text", text: "Fake response from local-web-team-model" }]
          }
        ],
        rounds: [{
          status: "completed",
          expected: 1,
          replied: 1,
          passed: 0,
          failed: 0,
          cancelled: 0
        }],
        deliveries: [{ status: "replied", replyMessageId: expect.any(String) }]
      }
    })
    expect(snapshot.status).toMatchObject({
      ok: true,
      value: {
        state: { selection: { kind: "team", conversationId } }
      }
    })
    expect(JSON.stringify(snapshot.team)).not.toMatch(
      /principalId|agentSessionId|childTurnId|leaseToken|idempotencyKey/
    )
  })

  it("fails an unsupported Team resource before creating a child turn", async () => {
    const storeDir = await tempDir("wanex-local-host-team-modality-")
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-team-text-only", "local-team-text-only-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    await app.shell.submitConversationOperation({
      sessionId: "ses_local_team_text_only_agent",
      text: "Initialize the text-only Team agent session"
    })
    await waitForLocalConversationTerminal(app)
    const image = await app.shell.trustedResources.ingestResource({
      content: new Uint8Array([137, 80, 78, 71]),
      kind: "image",
      mediaType: "image/png",
      origin: "user_upload"
    })
    const rawTeamStore = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    rawTeamStores.push(rawTeamStore)
    const rawTeam = new TeamConversationRuntime({ storage: rawTeamStore })
    const conversation = await rawTeam.createConversation({
      id: "team_local_modality_conversation",
      mode: "peer"
    })
    const user = await rawTeam.addParticipant({
      id: "team_local_modality_user",
      conversationId: conversation.id,
      principalId: "user_local_team_modality",
      kind: "user"
    })
    const agent = await rawTeam.addParticipant({
      id: "team_local_modality_agent",
      conversationId: conversation.id,
      principalId: "agent_local_team_modality",
      kind: "agent",
      agentSessionId: "ses_local_team_text_only_agent"
    })
    await rawTeam.submitRoutedMessage({
      idempotencyKey: "team-local-modality-message",
      message: {
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "participant", participantId: agent.id }],
        content: [{
          type: "resource",
          id: "part_team_local_unsupported_image",
          resourceId: image.id,
          sha256: image.sha256,
          sizeBytes: image.sizeBytes,
          kind: image.kind,
          ...(image.mediaType === undefined
            ? {}
            : { mediaType: image.mediaType })
        }]
      },
      route: {
        mode: "peer",
        outcome: "deliver",
        actorPrincipalId: "user_local_team_modality",
        reason: "Exercise model modality gate",
        deliveries: [{
          id: "delivery_team_local_unsupported_image",
          targetParticipantId: agent.id,
          role: "speaker",
          trigger: "direct"
        }]
      }
    })

    const page = await waitForRawTeamRound(rawTeam, conversation.id)
    expect(page.messages).toHaveLength(1)
    expect(page.deliveries).toMatchObject([{
      id: "delivery_team_local_unsupported_image",
      state: "failed",
      lastError: {
        type: "team_delivery_materialization",
        message: expect.stringMatching(/does not support image input/)
      }
    }])
    expect(page.deliveries[0]).not.toHaveProperty("childTurnId")
    expect(page.rounds).toMatchObject([{
      state: "closed",
      outcome: "failed",
      result: {
        expected: 1,
        responded: 0,
        passed: 0,
        failed: 1,
        cancelled: 0
      }
    }])
  })

  it("recovers a routed Team delivery after the submitting process exits", async () => {
    const storeDir = await tempDir("wanex-local-host-team-route-recovery-")
    const stagingStorage = createStorageTestStore({
      kind: "local-system-service",
      mode: "persistent",
      storeDir,
      serviceBin
    })
    const stagedTeam = new TeamConversationRuntime({
      storage: stagingStorage,
      principalId: "local-host-team"
    })
    await stagingStorage.createSession({
      id: "ses_local_team_recovery_agent",
      kind: "agent"
    })
    const conversation = await stagedTeam.createConversation({
      id: "team_local_recovery_conversation",
      mode: "peer"
    })
    const user = await stagedTeam.addParticipant({
      id: "team_local_recovery_user",
      conversationId: conversation.id,
      principalId: "local-host-user",
      kind: "user"
    })
    const agent = await stagedTeam.addParticipant({
      id: "team_local_recovery_agent",
      conversationId: conversation.id,
      principalId: "agent_local_team_recovery",
      kind: "agent",
      agentSessionId: "ses_local_team_recovery_agent"
    })
    const routed = await stagedTeam.submitRoutedMessage({
      idempotencyKey: "team-local-recovery-message",
      message: {
        conversationId: conversation.id,
        authorParticipantId: user.id,
        targets: [{ kind: "participant", participantId: agent.id }],
        content: [{
          type: "text",
          id: "part_team_local_recovery",
          text: "Recover this delivery after restart."
        }]
      },
      route: {
        mode: "peer",
        outcome: "deliver",
        actorPrincipalId: "local-host-user",
        reason: "Durable route recovery proof",
        deliveries: [{
          id: "delivery_team_local_recovery",
          targetParticipantId: agent.id,
          role: "speaker",
          trigger: "direct"
        }]
      }
    })
    expect(routed.deliveries).toMatchObject([{
      id: "delivery_team_local_recovery",
      state: "queued"
    }])
    const expectedPlan = await stagedTeam.getDeliveryMaterializationContext(
      "delivery_team_local_recovery"
    )
    await stagingStorage.dispose()

    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-team-recovery", "local-team-recovery-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const page = await waitForLocalTeamRound(app, conversation.id)
    expect(page.messages).toHaveLength(2)
    expect(page.deliveries).toMatchObject([{
      deliveryId: "delivery_team_local_recovery",
      status: "replied",
      replyMessageId: expect.any(String)
    }])

    const proofStorage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    try {
      expect((await proofStorage.listSessionTurns({
        sessionId: "ses_local_team_recovery_agent"
      })).filter((turn) => turn.id === expectedPlan?.childPlan.turnId))
        .toHaveLength(1)
      const events = await proofStorage.queryEvents({ limit: 1_000 })
      expect(events.filter((event) =>
        event.type === "team.delivery.materialized" &&
        (event.payload as Record<string, unknown>).deliveryId ===
          "delivery_team_local_recovery"
      )).toHaveLength(1)
      expect(events.filter((event) =>
        event.type === "team.message.admitted" &&
        (event.payload as Record<string, unknown>).sourceDeliveryId ===
          "delivery_team_local_recovery"
      )).toHaveLength(1)
    } finally {
      await proofStorage.dispose()
    }
  })

  it("starts clean, disables chat, and hot-configures an explicit provider", async () => {
    const storeDir = await tempDir("wanex-local-host-unconfigured-")
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    const initial = await app.readSnapshot()
    expect(initial.modelEndpoints).toEqual({ endpoints: [] })
    expect(initial.web.view.settings.profile.readiness).toMatchObject({
      status: "missing_active_endpoint",
      endpointCount: 0,
      canRun: false,
      attentionRequired: true
    })
    expect(initial.web.view.providerRunGate).toMatchObject({
      state: "blocked",
      canSubmitConversation: false,
      message: "No active provider"
    })
    expect(initial.web.view.conversationCanSubmit).toBe(false)
    expect(initial.web.view.settings.profile.readiness.attentionRequired).toBe(true)

    const configured = await app.modelEndpoints.upsertModelEndpoint({
      modelEndpoint: fakeEndpoint("local-hot-fake", "local-hot-fake-model"),
      makeActive: true
    })
    expect(configured).toMatchObject({ id: "local-hot-fake", active: true })
    const refreshed = await app.readSnapshot()
    expect(refreshed.web.view.providerRunGate).toMatchObject({
      state: "ready",
      canSubmitConversation: true
    })
    expect(refreshed.web.view.conversationCanSubmit).toBe(true)
    expect(refreshed.web.view.settings.profile.readiness.attentionRequired).toBe(false)
  })

  it("rejects unsupported attachments before Resource ingest", async () => {
    const storeDir = await tempDir("wanex-local-host-text-only-")
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("text-only", "text-only-model")
      ),
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    const response = await fetch(`${app.url}/wanex/web/attachment`, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-wanex-host-session": await readHostSessionToken(app.url),
        "x-wanex-media-type": encodeURIComponent("image/png"),
        "x-wanex-attachment-label": encodeURIComponent("unsupported.png")
      },
      body: new Uint8Array([137, 80, 78, 71])
    })
    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "unsupported_attachment" }
    })
    expect(app.controller.snapshot().view).toMatchObject({
      conversationAttachmentCanUpload: false,
      conversationAttachmentAccept: ""
    })

    await app.close()
    apps.pop()
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    try {
      await expect(storage.listResources({})).resolves.toEqual([])
    } finally {
      await storage.dispose()
    }
  })

  it("stores a provider credential only in the injected trusted store", async () => {
    const storeDir = await tempDir("wanex-local-host-credential-")
    const credentialStore = new TestSecretStore()
    const credential = "local-product-credential-value"
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    const configured = await app.providers.saveProvider({
      presetId: "openai",
      conversationModelId: "gpt-5.2",
      imageGenerationModelId: "local-image-model",
      credential,
      makeConversationActive: true
    })

    expect(configured).toMatchObject({
      kind: "local-host.provider.saved",
      provider: {
        connectionId: "openai",
        credentialConfigured: true,
        active: true,
        endpoints: [
          {
            id: "openai",
            active: true,
            model: {
              id: "gpt-5.2",
              limits: {
                contextWindowTokens: 400_000,
                maxInputTokens: 272_000,
                maxOutputTokens: 128_000
              }
            }
          },
          {
            id: "openai.image-generate",
            active: false
          }
        ]
      },
      readiness: {
        status: "ready",
        canRun: true
      }
    })
    expect(JSON.stringify(configured)).not.toContain(credential)
    expect(JSON.stringify(configured)).not.toContain("secretRef")

    const firstRef = credentialStore.refs()[0]
    if (firstRef === undefined) {
      throw new Error("expected credential store entry")
    }
    expect(firstRef).toMatch(/^test-secret:\/\/[a-f0-9]{64}\//)
    expect(firstRef).not.toContain(storeDir)
    const firstResolved = await credentialStore.resolve(firstRef)
    expect(firstResolved.reveal()).toBe(credential)
    firstResolved.dispose()

    const metadataEdit = await app.providers.saveProvider({
      connectionId: "openai",
      presetId: "openai",
      conversationModelId: "metadata-only-model",
      makeConversationActive: true
    })
    expect(metadataEdit.provider.endpoints).toHaveLength(1)
    expect(metadataEdit.provider.endpoints[0]).toMatchObject({
      id: "openai",
      model: { id: "metadata-only-model" },
      active: true
    })
    expect(credentialStore.refs()).toEqual([firstRef])
    await expect(app.providers.listProviders()).resolves.toMatchObject({
      kind: "local-host.configured-provider-list",
      providers: [{
        connectionId: "openai",
        presetId: "openai",
        credentialConfigured: true,
        endpoints: [{ id: "openai" }]
      }]
    })

    const replacement = "local-product-replacement-credential"
    await app.providers.saveProvider({
      connectionId: "openai",
      presetId: "openai",
      conversationModelId: "local-credential-model",
      imageGenerationModelId: "local-image-model",
      credential: replacement,
      makeConversationActive: true
    })
    const replacementRefs = credentialStore.refs()
    expect(replacementRefs).toHaveLength(1)
    const replacementRef = replacementRefs[0]
    if (replacementRef === undefined) {
      throw new Error("expected replacement credential store entry")
    }
    expect(replacementRef).not.toBe(firstRef)
    await expect(credentialStore.resolve(firstRef)).rejects.toThrow(
      "test secret is not configured"
    )
    const replaced = await credentialStore.resolve(replacementRef)
    expect(replaced.reveal()).toBe(replacement)
    replaced.dispose()

    const snapshot = await app.readSnapshot()
    const html = await fetchText(`${app.url}/`)
    expect(JSON.stringify(snapshot)).not.toContain(credential)
    expect(JSON.stringify(snapshot)).not.toContain(replacement)
    expect(JSON.stringify(snapshot)).not.toContain("secretRef")
    expect(html).not.toContain(credential)
    expect(html).not.toContain(replacement)
    expect(html).not.toContain("secretRef")
  })

  it("reconciles interrupted Provider setup without deleting foreign credentials", async () => {
    const storeDir = await tempDir("wanex-local-host-setup-recovery-")
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    const credentialStore = new TestSecretStore()
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const namespace = "d".repeat(64)
    const stagedRef = wanexLocalCredentialRef({
      scheme: credentialStore.scheme,
      namespace,
      connectionId: "recovery-provider",
      revisionId: "staged"
    })
    const retiredRef = wanexLocalCredentialRef({
      scheme: credentialStore.scheme,
      namespace,
      connectionId: "recovery-provider",
      revisionId: "retired"
    })
    const foreignRef = `test-secret://${"e".repeat(64)}/foreign.revision`
    const endpoint = openAIEndpoint({
      id: "recovery-provider",
      modelId: "recovery-model",
      baseUrl: "https://recovery.example.test/v1",
      secretRef: stagedRef
    })
    const intent = {
      kind: "wanex-app.provider-mutation.replace",
      connectionId: "recovery-provider",
      stagedSecretRef: stagedRef,
      retiredSecretRefs: [retiredRef, foreignRef],
      endpoints: [{
        id: endpoint.id,
        digest: modelEndpointDigest(endpoint)
      }]
    }
    const coordinator = createWanexAppProviderMutationCoordinator({
      storage,
      modelEndpoints: app.shell.modelEndpoints,
      credentialStore,
      credentialPolicy: wanexLocalCredentialPolicy({
        namespace,
        scheme: credentialStore.scheme
      })
    })

    try {
      await credentialStore.put({ ref: stagedRef, value: "staged-secret" })
      await credentialStore.put({ ref: retiredRef, value: "retired-secret" })
      await credentialStore.put({ ref: foreignRef, value: "foreign-secret" })
      await storage.putConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY, intent)

      await expect(coordinator.reconcilePending()).resolves.toEqual({
        mutationDisposition: "rolled-back",
        credentialCleanupPending: false
      })
      expect(credentialStore.refs()).toEqual([foreignRef, retiredRef].sort())
      await expect(
        storage.getConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY)
      ).resolves.toBeNull()

      await credentialStore.put({ ref: stagedRef, value: "committed-secret" })
      await storage.putConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY, intent)
      await app.shell.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: endpoint,
        makeActive: false
      })

      await expect(coordinator.reconcilePending()).resolves.toEqual({
        mutationDisposition: "committed",
        credentialCleanupPending: false
      })
      expect(credentialStore.refs()).toEqual([foreignRef, stagedRef].sort())
      const committed = await credentialStore.resolve(stagedRef)
      expect(committed.reveal()).toBe("committed-secret")
      committed.dispose()
      await expect(
        storage.getConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY)
      ).resolves.toBeNull()
    } finally {
      await storage.dispose()
    }
  })

  it("removes Providers with deterministic fallback and retains live credentials", async () => {
    const storeDir = await tempDir("wanex-local-host-provider-removal-")
    const credentialStore = new TestSecretStore()
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })

    try {
      await app.providers.saveProvider({
        presetId: "openai",
        conversationModelId: "removal-openai-model",
        credential: "removal-openai-secret",
        makeConversationActive: true
      })
      await app.providers.saveProvider({
        presetId: "deepseek",
        conversationModelId: "removal-deepseek-model",
        credential: "removal-deepseek-secret",
        makeConversationActive: false
      })
      const deepseekRemoved = await app.providers.removeProvider({
        connectionId: "deepseek"
      })
      expect(deepseekRemoved).toMatchObject({
        kind: "local-host.provider.removed",
        removedEndpointIds: ["deepseek"],
        readiness: { activeEndpointId: "openai", canRun: true }
      })
      await app.providers.saveProvider({
        presetId: "deepseek",
        conversationModelId: "removal-deepseek-model",
        credential: "removal-deepseek-secret-2",
        makeConversationActive: false
      })

      const openaiRef = credentialStore.refs().find((ref) =>
        ref.includes("/openai.")
      )
      if (openaiRef === undefined) {
        throw new Error("openai credential ref is missing")
      }
      await storage.createSession({ id: "ses_provider_remove_live", kind: "agent" })
      const queued = await storage.submitSessionTurn({
        id: "inp_provider_remove_live",
        turnId: "turn_provider_remove_live",
        sessionId: "ses_provider_remove_live",
        principalId: "user_provider_remove_live",
        idempotencyKey: "idem_provider_remove_live",
        content: [{
          type: "text",
          id: "part_provider_remove_live",
          text: "Use the removed Provider credential"
        }],
        jobId: "job_provider_remove_live",
        notBefore: Date.now() + 60_000,
        executionBinding: createTestTurnExecutionBinding({
          ...openAIEndpoint({
            id: "openai",
            modelId: "removal-openai-model",
            baseUrl: "https://api.openai.com/v1"
          }),
          connection: {
            ...openAIEndpoint({
              id: "openai",
              modelId: "removal-openai-model",
              baseUrl: "https://api.openai.com/v1"
            }).connection,
            secretRef: openaiRef
          }
        })
      })

      const openaiRemoved = await app.providers.removeProvider({
        connectionId: "openai"
      })
      expect(openaiRemoved).toMatchObject({
        removedEndpointIds: ["openai"],
        readiness: { activeEndpointId: "deepseek", canRun: true },
        credentialCleanupPending: true
      })
      expect(credentialStore.refs()).toContain(openaiRef)
      await storage.requestSessionTurnCancel({
        sessionId: queued.turn.sessionId,
        turnId: queued.turn.id,
        inputId: queued.admission.inputId,
        jobId: queued.job.id,
        reason: "finish Provider removal liveness test"
      })
      await app.providers.saveProvider({
        connectionId: "deepseek",
        presetId: "deepseek",
        conversationModelId: "removal-deepseek-model-v2"
      })
      expect(credentialStore.refs()).not.toContain(openaiRef)

      const final = await app.providers.removeProvider({ connectionId: "deepseek" })
      expect(final.readiness).toMatchObject({
        status: "missing_active_endpoint",
        canRun: false
      })
      await expect(app.shell.submitConversationOperation({
        text: "No provider remains"
      })).resolves.toMatchObject({
        kind: "product.conversation-operation.rejected",
        reason: "provider_not_ready"
      })
    } finally {
      await storage.dispose()
    }
  })

  it("reconciles Provider removal only after the App transaction commits", async () => {
    const storeDir = await tempDir("wanex-local-host-remove-recovery-")
    const credentialStore = new TestSecretStore()
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    await app.providers.saveProvider({
      presetId: "openai",
      conversationModelId: "remove-recovery-model",
      credential: "remove-recovery-secret",
      makeConversationActive: true
    })
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    const ref = credentialStore.refs()[0]
    if (ref === undefined) throw new Error("removal recovery ref is missing")
    const endpoint = await readModelEndpoint(storage, "openai")
    if (endpoint === null) throw new Error("removal recovery endpoint is missing")
    const intent = {
      kind: "wanex-app.provider-mutation.remove",
      connectionId: "openai",
      retiredSecretRefs: [ref],
      endpoints: [{ id: endpoint.id, digest: modelEndpointDigest(endpoint) }]
    }
    const coordinator = createWanexAppProviderMutationCoordinator({
      storage,
      modelEndpoints: app.shell.modelEndpoints,
      credentialStore,
      credentialPolicy: wanexLocalCredentialPolicy({
        namespace: localSecretNamespace({
          kind: "store-dir",
          storeDir
        }),
        scheme: credentialStore.scheme
      })
    })

    try {
      await storage.putConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY, intent)
      await expect(coordinator.reconcilePending()).resolves.toEqual({
        mutationDisposition: "rolled-back",
        credentialCleanupPending: false
      })
      expect(credentialStore.refs()).toContain(ref)

      await storage.putConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY, intent)
      await app.shell.modelEndpoints.removeModelEndpointConnection({
        connectionId: "openai"
      })
      await expect(coordinator.reconcilePending()).resolves.toEqual({
        mutationDisposition: "committed",
        credentialCleanupPending: false
      })
      expect(credentialStore.refs()).not.toContain(ref)
      await expect(
        storage.getConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY)
      ).resolves.toBeNull()
    } finally {
      await storage.dispose()
    }
  })

  it("serializes concurrent Provider setup and retires the superseded credential", async () => {
    const storeDir = await tempDir("wanex-local-host-setup-serial-")
    const credentialStore = new TestSecretStore()
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    let revision = 0
    const coordinator = createWanexAppProviderMutationCoordinator({
      storage,
      modelEndpoints: app.shell.modelEndpoints,
      credentialStore,
      credentialPolicy: wanexLocalCredentialPolicy({
        namespace: localSecretNamespace({
          kind: "store-dir",
          storeDir
        }),
        scheme: credentialStore.scheme
      }),
      createRevisionId: () => `revision-${++revision}`
    })

    try {
      const makeEndpoint = (modelId: string) => openAIEndpoint({
        id: "serialized-provider",
        modelId,
        baseUrl: "https://serialized.example.test/v1"
      })
      await Promise.all([
        coordinator.replace({
          credential: "first-secret",
          connectionId: "serialized-provider",
          modelEndpoints: [makeEndpoint("first-model")],
          makeActiveEndpointId: "serialized-provider"
        }),
        coordinator.replace({
          credential: "second-secret",
          connectionId: "serialized-provider",
          modelEndpoints: [makeEndpoint("second-model")],
          makeActiveEndpointId: "serialized-provider"
        })
      ])

      const refs = credentialStore.refs()
      expect(refs).toHaveLength(1)
      expect(refs[0]).toContain("serialized-provider.revision-2")
      const current = await credentialStore.resolve(refs[0]!)
      expect(current.reveal()).toBe("second-secret")
      current.dispose()
      await expect(
        app.shell.modelEndpoints.readActiveModelEndpoint()
      ).resolves.toMatchObject({ model: { id: "second-model" } })
      await expect(
        storage.getConfig(WANEX_APP_PROVIDER_MUTATION_INTENT_KEY)
      ).resolves.toBeNull()
    } finally {
      await storage.dispose()
    }
  })

  it("retires Provider credentials only after their durable executions settle", async () => {
    const storeDir = await tempDir("wanex-local-host-setup-liveness-")
    const credentialStore = new TestSecretStore()
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)
    const storage = createStorageTestStore({
      kind: "local-system-service",
      mode: "oneshot",
      storeDir,
      serviceBin
    })
    const namespace = localSecretNamespace({
      kind: "store-dir",
      storeDir
    })
    let revision = 0
    const coordinator = createWanexAppProviderMutationCoordinator({
      storage,
      modelEndpoints: app.shell.modelEndpoints,
      credentialStore,
      credentialPolicy: wanexLocalCredentialPolicy({
        namespace,
        scheme: credentialStore.scheme
      }),
      createRevisionId: () => `revision-${++revision}`
    })
    const connectionId = "live-provider"
    const makeEndpoint = (modelId: string) => openAIEndpoint({
      id: connectionId,
      modelId,
      baseUrl: "https://live.example.test/v1"
    })
    const secretRef = (revisionId: string) => wanexLocalCredentialRef({
      scheme: credentialStore.scheme,
      namespace,
      connectionId,
      revisionId
    })
    const oldRef = secretRef("revision-1")
    const intermediateRef = secretRef("revision-2")
    const newestRef = secretRef("revision-3")

    try {
      await coordinator.replace({
        credential: "old-secret",
        connectionId,
        modelEndpoints: [makeEndpoint("old-model")],
        makeActiveEndpointId: connectionId
      })
      await storage.createSession({
        id: "ses_provider_credential_liveness",
        kind: "agent"
      })
      const queued = await storage.submitSessionTurn({
        id: "inp_provider_credential_liveness",
        turnId: "turn_provider_credential_liveness",
        sessionId: "ses_provider_credential_liveness",
        principalId: "user_provider_credential_liveness",
        idempotencyKey: "idem_provider_credential_liveness",
        content: [{
          type: "text",
          id: "part_provider_credential_liveness",
          text: "Use the frozen Provider credential later"
        }],
        jobId: "job_provider_credential_liveness",
        notBefore: Date.now() + 60_000,
        executionBinding: createTestTurnExecutionBinding({
          ...makeEndpoint("old-model"),
          connection: {
            ...makeEndpoint("old-model").connection,
            secretRef: oldRef
          }
        })
      })

      await expect(coordinator.replace({
        credential: "intermediate-secret",
        connectionId,
        modelEndpoints: [makeEndpoint("intermediate-model")],
        makeActiveEndpointId: connectionId
      })).resolves.toMatchObject({ credentialCleanupPending: true })
      expect(credentialStore.refs()).toEqual([intermediateRef, oldRef].sort())
      await expect(
        storage.getConfig(WANEX_APP_CREDENTIAL_RETIREMENT_KEY)
      ).resolves.toEqual({
        kind: "wanex-app.credential-retirement",
        refs: [oldRef]
      })

      await expect(coordinator.replace({
        credential: "newest-secret",
        connectionId,
        modelEndpoints: [makeEndpoint("newest-model")],
        makeActiveEndpointId: connectionId
      })).resolves.toMatchObject({ credentialCleanupPending: true })
      expect(credentialStore.refs()).toEqual([newestRef, oldRef].sort())
      expect(credentialStore.refs()).not.toContain(intermediateRef)

      await storage.requestSessionTurnCancel({
        sessionId: queued.turn.sessionId,
        turnId: queued.turn.id,
        inputId: queued.admission.inputId,
        jobId: queued.job.id,
        reason: "finish credential liveness test"
      })
      await expect(coordinator.reconcilePending()).resolves.toEqual({
        mutationDisposition: "none",
        credentialCleanupPending: false
      })
      expect(credentialStore.refs()).toEqual([newestRef])
      await expect(
        storage.getConfig(WANEX_APP_CREDENTIAL_RETIREMENT_KEY)
      ).resolves.toBeNull()
    } finally {
      await storage.dispose()
    }
  })

  it("requires the host-session capability for browser credential setup", async () => {
    const storeDir = await tempDir("wanex-local-host-browser-setup-")
    const credentialStore = new TestSecretStore()
    const credential = "browser-provider-credential"
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore,
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    const initialHtml = await fetchText(`${app.url}/`)
    expect(initialHtml).toContain(
      'data-provider-management-path="/wanex/web/providers"'
    )
    expect(initialHtml).toContain("data-app-root")
    expect(initialHtml).not.toContain(credential)

    const denied = await fetch(`${app.url}/wanex/web/providers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        presetId: "openai",
        conversationModelId: "browser-model",
        credential,
        makeConversationActive: true
      })
    })
    expect(denied.status).toBe(403)
    expect(await denied.json()).toMatchObject({
      ok: false,
      error: { code: "host_session_required" }
    })
    expect(credentialStore.refs()).toEqual([])

    const rejectedStandardFeatures = await fetch(
      `${app.url}/wanex/web/providers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": await readHostSessionToken(app.url)
        },
        body: JSON.stringify({
          presetId: "openai",
          conversationModelId: "browser-model",
          conversationFeatures: ["tool_calling"],
          credential,
          makeConversationActive: true
        })
      }
    )
    expect(rejectedStandardFeatures.status).toBe(400)
    expect(await rejectedStandardFeatures.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_mutation" }
    })
    expect(credentialStore.refs()).toEqual([])

    const rejectedCustomFeatures = await fetch(
      `${app.url}/wanex/web/providers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": await readHostSessionToken(app.url)
        },
        body: JSON.stringify({
          presetId: "openai-compatible",
          conversationModelId: "browser-custom-model",
          conversationFeatures: ["tool_calling", "tool_calling"],
          baseUrl: "https://custom.example.test/v1",
          credential,
          makeConversationActive: true
        })
      }
    )
    expect(rejectedCustomFeatures.status).toBe(400)
    expect(await rejectedCustomFeatures.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_mutation" }
    })
    expect(credentialStore.refs()).toEqual([])

    const rejectedStandardModalities = await fetch(
      `${app.url}/wanex/web/providers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": await readHostSessionToken(app.url)
        },
        body: JSON.stringify({
          presetId: "openai",
          conversationModelId: "browser-model",
          conversationInputModalities: ["text", "image"],
          credential,
          makeConversationActive: true
        })
      }
    )
    expect(rejectedStandardModalities.status).toBe(400)
    expect(await rejectedStandardModalities.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_mutation" }
    })
    expect(credentialStore.refs()).toEqual([])

    const rejectedOverride = await fetch(
      `${app.url}/wanex/web/providers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": await readHostSessionToken(app.url)
        },
        body: JSON.stringify({
          presetId: "openai",
          conversationModelId: "browser-model",
          baseUrl: "https://attacker.example.test/v1",
          credential,
          makeConversationActive: true
        })
      }
    )
    expect(rejectedOverride.status).toBe(400)
    expect(await rejectedOverride.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_mutation" }
    })
    expect(credentialStore.refs()).toEqual([])

    const rejectedImagePreset = await fetch(
      `${app.url}/wanex/web/providers`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": await readHostSessionToken(app.url)
        },
        body: JSON.stringify({
          presetId: "deepseek",
          conversationModelId: "browser-deepseek-model",
          imageGenerationModelId: "unsupported-browser-image-model",
          credential,
          makeConversationActive: true
        })
      }
    )
    expect(rejectedImagePreset.status).toBe(400)
    expect(await rejectedImagePreset.json()).toMatchObject({
      ok: false,
      error: { code: "invalid_provider_mutation" }
    })
    expect(credentialStore.refs()).toEqual([])

    const configured = await postJson(
      `${app.url}/wanex/web/providers`,
      {
        presetId: "openai",
        conversationModelId: "browser-model",
        imageGenerationModelId: "browser-image-model",
        credential,
        makeConversationActive: true
      }
    )
    expect(configured).toMatchObject({
      ok: true,
      kind: "web.provider-management-response",
      result: {
        kind: "local-host.provider.saved",
        provider: {
          connectionId: "openai",
          credentialConfigured: true,
          active: true,
          endpoints: [
            { id: "openai", active: true },
            { id: "openai.image-generate", active: false }
          ]
        },
        readiness: { status: "ready", canRun: true }
      },
      snapshot: {
        view: { conversationCanSubmit: true }
      }
    })
    const serialized = JSON.stringify(configured)
    expect(serialized).not.toContain(credential)
    expect(serialized).not.toContain("secretRef")
    expect(credentialStore.refs()).toHaveLength(1)

    const removed = await fetch(`${app.url}/wanex/web/providers`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        "x-wanex-host-session": await readHostSessionToken(app.url)
      },
      body: JSON.stringify({ connectionId: "openai" })
    })
    expect(removed.status).toBe(200)
    const removedBody = await removed.json()
    expect(removedBody).toMatchObject({
      ok: true,
      kind: "web.provider-management-response",
      result: {
        kind: "local-host.provider.removed",
        connectionId: "openai",
        removedEndpointIds: ["openai", "openai.image-generate"]
      },
      snapshot: {
        view: { conversationCanSubmit: false }
      }
    })
    expect(JSON.stringify(removedBody)).not.toContain("secretRef")
    expect(JSON.stringify(removedBody)).not.toContain(credential)
    expect(credentialStore.refs()).toEqual([])

    const configuredCustom = await postJson(
      `${app.url}/wanex/web/providers`,
      {
        presetId: "openai-compatible",
        conversationModelId: "browser-custom-vision-model",
        conversationInputModalities: ["image", "text"],
        conversationFeatures: ["tool_calling"],
        baseUrl: "https://custom.example.test/v1",
        credential,
        makeConversationActive: true
      }
    )
    expect(configuredCustom).toMatchObject({
      ok: true,
      result: {
        provider: {
          connectionId: expect.stringMatching(
            /^openai-compatible-[a-f0-9]{16}$/
          ),
          endpoints: [{
            model: {
              id: "browser-custom-vision-model",
              inputModalities: ["text", "image"],
              features: ["tool_calling"],
              catalog: { revision: "explicit" }
            }
          }]
        }
      }
    })
    const customConnectionId = (
      configuredCustom as {
        readonly result: {
          readonly provider: { readonly connectionId: string }
        }
      }
    ).result.provider.connectionId
    const removedCustom = await fetch(
      `${app.url}/wanex/web/providers`,
      {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-wanex-host-session": await readHostSessionToken(app.url)
        },
        body: JSON.stringify({ connectionId: customConnectionId })
      }
    )
    expect(removedCustom.status).toBe(200)
    expect(credentialStore.refs()).toEqual([])
  })

  it("does not reflect credential-store failures through the browser setup endpoint", async () => {
    const storeDir = await tempDir("wanex-local-host-browser-setup-failure-")
    const credential = "browser-provider-credential-that-must-not-be-reflected"
    const app = await startLocalWebApp({
      storage: { kind: "store-dir", storeDir },
      serviceBin,
      credentialStore: {
        scheme: "rejecting-secret",
        async put(request) {
          throw new Error(`secret store rejected: ${request.value}`)
        },
        async delete() {},
        async resolve() {
          throw new Error("unused")
        }
      },
      web: { hostname: "127.0.0.1" }
    })
    apps.push(app)

    const response = await fetch(`${app.url}/wanex/web/providers`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-wanex-host-session": await readHostSessionToken(app.url)
      },
      body: JSON.stringify({
        presetId: "openai",
        conversationModelId: "browser-model",
        credential,
        makeConversationActive: true
      })
    })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({
      ok: false,
      error: {
        code: "provider_mutation_failed",
        message: "Provider could not be saved"
      }
    })
    expect(JSON.stringify(body)).not.toContain(credential)
    expect(JSON.stringify(body)).not.toContain("secretRef")
    expect((await app.readSnapshot()).modelEndpoints).toEqual({ endpoints: [] })
  })

  it("can isolate local state by profile", async () => {
    const rootDir = await tempDir("wanex-local-host-profile-")
    const app = await startLocalWebApp({
      storage: {
        kind: "profile",
        rootDir,
        profileId: "work"
      },
      serviceBin,
      initialState: {
        layout: "diagnostics"
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    expect(app.settings.readSettings().state.layout).toBe("diagnostics")
    const html = await fetchText(`${app.url}/`)
    expect(html).toContain("data-app-root")
    expect(html).not.toContain(rootDir)
    expect(html).not.toContain(serviceBin)
  })

  it("persists app settings through the trusted host facade", async () => {
    const storeDir = await tempDir("wanex-local-host-settings-")
    const first = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-settings", "local-settings-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(first)

    expect(first.settings.readSettings()).toMatchObject({
      kind: "product.settings",
      state: {
        layout: "single",
        mode: "chat",
        preferences: {
          theme: "system",
          density: "comfortable"
        }
      }
    })

    await expect(first.settings.setLayout({ layout: "split" })).resolves
      .toMatchObject({
        layout: "split"
      })
    await expect(first.settings.setMode({ mode: "diagnostics" })).resolves
      .toMatchObject({
        mode: "diagnostics"
      })
    await first.shell.submitConversationOperation({
      sessionId: "settings-session",
      text: "settings persistence session"
    })
    await waitForLocalConversationTerminal(first)
    await first.shell.startNewConversation()
    await first.settings.setMode({ mode: "diagnostics" })
    await expect(first.settings.selectSession({
      sessionId: "settings-session"
    })).resolves.toMatchObject({
      selection: {
        kind: "session",
        sessionId: "settings-session"
      }
    })
    await expect(first.settings.updatePreferences({
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })).resolves.toMatchObject({
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })

    const firstSettings = first.settings.readSettings()
    expect(firstSettings.state).toMatchObject({
      selection: {
        kind: "session",
        sessionId: "settings-session"
      },
      layout: "split",
      mode: "diagnostics",
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })
    expect(containsSensitiveText(firstSettings, storeDir)).toBe(false)
    expect(containsSensitiveText(firstSettings, serviceBin)).toBe(false)

    await first.close()
    apps.pop()

    const second = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-settings", "local-settings-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(second)

    expect(second.settings.readSettings().state).toMatchObject({
      selection: {
        kind: "session",
        sessionId: "settings-session"
      },
      layout: "split",
      mode: "diagnostics",
      preferences: {
        theme: "dark",
        density: "compact"
      }
    })
  })

  it("reads a safe refreshed startup snapshot", async () => {
    const storeDir = await tempDir("wanex-local-host-snapshot-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-snapshot", "local-snapshot-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const initial = await app.readSnapshot()
    expect(initial).toMatchObject({
      kind: "local-host.snapshot",
      url: app.url,
      settings: {
        kind: "product.settings",
        state: {
          layout: "single",
          mode: "chat"
        }
      },
      modelEndpoints: {
        activeEndpointId: "local-snapshot",
        endpoints: [
          {
            id: "local-snapshot",
            active: true,
            model: { id: "local-snapshot-model" },
            credentialConfigured: false
          }
        ]
      },
      web: {
        kind: "web.snapshot",
        view: {
          layout: "single",
          mode: "chat"
        }
      },
      privacy: {
        exposesStorePath: false,
        exposesServiceBinaryPath: false,
        exposesSecrets: false,
        exposesRawStorageClient: false,
        exposesRendererMutationApi: false
      }
    })
    expect(containsSensitiveText(initial, storeDir)).toBe(false)
    expect(containsSensitiveText(initial, serviceBin)).toBe(false)

    await app.settings.setLayout({ layout: "diagnostics" })
    await app.settings.setMode({ mode: "diagnostics" })
    const refreshed = await app.readSnapshot()
    expect(refreshed.settings.state).toMatchObject({
      layout: "diagnostics",
      mode: "diagnostics"
    })
    expect(refreshed.web.view).toMatchObject({
      layout: "diagnostics",
      mode: "diagnostics"
    })
  })

  it("starts with a trusted full model endpoint and keeps secrets out of snapshots", async () => {
    const storeDir = await tempDir("wanex-local-host-full-provider-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        openAIEndpoint({
          id: "local-openai-compatible",
          modelId: "local-openai-model",
          baseUrl: "https://api.example.invalid/v1",
          secretRef: "env://LOCAL_PROVIDER_SECRET"
        })
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const snapshot = await app.readSnapshot()
    expect(snapshot.modelEndpoints).toMatchObject({
      activeEndpointId: "local-openai-compatible",
      endpoints: [
        {
          id: "local-openai-compatible",
          protocol: { id: "openai-chat-completions" },
          connection: { providerId: "openai-compatible" },
          model: { id: "local-openai-model" },
          credentialConfigured: true,
          active: true
        }
      ]
    })
    const serialized = JSON.stringify(snapshot)
    expect(serialized).toContain("https://api.example.invalid/v1")
    expect(serialized).not.toContain("env://LOCAL_PROVIDER_SECRET")
    expect(JSON.stringify(await app.modelEndpoints.listModelEndpoints()))
      .not.toContain("LOCAL_PROVIDER_SECRET")
  })

  it("seeds multiple trusted model endpoints and selects the startup endpoint", async () => {
    const storeDir = await tempDir("wanex-local-host-provider-catalog-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [
          fakeEndpoint("local-catalog-fake", "local-catalog-fake-model"),
          openAIEndpoint({
            id: "local-catalog-openai",
            modelId: "local-catalog-openai-model",
            baseUrl: "https://catalog.example.invalid/v1",
            secretRef: "env://CATALOG_PROVIDER_SECRET"
          })
        ],
        activeEndpointId: "local-catalog-openai"
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const snapshot = await app.readSnapshot()
    expect(snapshot.modelEndpoints).toMatchObject({
      activeEndpointId: "local-catalog-openai",
      endpoints: expect.arrayContaining([
        expect.objectContaining({
          id: "local-catalog-fake",
          active: false,
          model: expect.objectContaining({ id: "local-catalog-fake-model" }),
          credentialConfigured: false
        }),
        expect.objectContaining({
          id: "local-catalog-openai",
          active: true,
          model: expect.objectContaining({ id: "local-catalog-openai-model" }),
          credentialConfigured: true,
        })
      ])
    })
    expect(snapshot.modelEndpoints.endpoints).toHaveLength(2)
    expect(snapshot.settings.profile.activeModelEndpointId)
      .toBe("local-catalog-openai")
    expect(JSON.stringify(snapshot)).not.toContain("CATALOG_PROVIDER_SECRET")
  })

  it("rejects invalid trusted model endpoint catalogs", async () => {
    const storeDir = await tempDir("wanex-local-host-provider-invalid-")
    await expect(startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [
          fakeEndpoint("duplicate", "first"),
          fakeEndpoint("duplicate", "second")
        ]
      },
      web: {
        hostname: "127.0.0.1",
      }
    })).rejects.toThrow("duplicate model endpoint id: duplicate")

    await expect(startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: {
        endpoints: [fakeEndpoint("only-profile", "only-model")],
        activeEndpointId: "missing-profile"
      },
      web: {
        hostname: "127.0.0.1",
      }
    })).rejects.toThrow(
      "active model endpoint must be included in modelEndpoints.endpoints: missing-profile"
    )
  })

  it("submits a conversation through the local Web request envelope", async () => {
    const storeDir = await tempDir("wanex-local-host-workbench-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-workbench", "local-workbench-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const submitted = await postJson(`${app.url}/wanex/web/request`, {
      kind: "web.request",
      operation: "dispatchAction",
      requestId: "product_app_local_start_workbench",
      action: {
        type: "submit-conversation",
        input: {
          text: "hello from local host workbench"
        }
      }
    })

    expect(submitted).toMatchObject({
      kind: "web.response",
      ok: true,
      operation: "dispatchAction",
      requestId: "product_app_local_start_workbench",
      actionResult: {
        ok: true,
        action: "submit-conversation",
        snapshot: {
          conversation: {
            operation: {
              kind: "product.conversation-operation"
            }
          },
          view: {
            sessionCount: 1,
            selectedSessionTitle: "hello from local host workbench"
          }
        }
      }
    })

    const snapshot = await waitForLocalConversationTerminal(app)
    expect(snapshot.web.conversation).toMatchObject({
      state: "succeeded",
      operation: {
        capabilities: {
          terminal: true,
          regeneratable: true
        }
      }
    })
    expect(
      snapshot.web.conversation.operation?.transcript.rows.some(
        (row) =>
          conversationText(row.parts) ===
          "hello from local host workbench"
      )
    ).toBe(true)
    expect(snapshot.web.view).toMatchObject({
      conversationCanSubmit: true,
      sessionCount: 1,
      selectedSessionTitle: "hello from local host workbench"
    })
    expect(snapshot.web.conversation.sessionId).toMatch(/^ses_/)
    expect(snapshot.settings.state.selection).toEqual({
      kind: "session",
      sessionId: snapshot.web.conversation.sessionId
    })
    expect(containsSensitiveText(snapshot, storeDir)).toBe(false)
    expect(containsSensitiveText(snapshot, serviceBin)).toBe(false)
  })

  it("formats CLI startup output from the safe host snapshot", async () => {
    const storeDir = await tempDir("wanex-local-host-cli-summary-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-cli-summary", "local-cli-summary-model")
      ),
      initialState: {
        layout: "split",
        preferences: {
          theme: "dark"
        }
      },
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const snapshot = await app.readSnapshot()
    const summary = formatLocalCliStartupSummary({
      options: {
        open: false,
        smoke: false,
        setupProvider: false,
        summaryFormat: "text",
        hostname: "127.0.0.1",
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        modelEndpoints: endpointCatalog(
          fakeEndpoint("launch-profile", "launch-model")
        )
      },
      snapshot
    })
    const jsonSummary = projectLocalCliStartupSummary({
      options: {
        open: true,
        smoke: false,
        setupProvider: false,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        modelEndpoints: endpointCatalog(
          fakeEndpoint("launch-profile", "launch-model")
        )
      },
      snapshot
    })
    const jsonLine = formatLocalCliStartupSummaryJson({
      options: {
        open: true,
        smoke: false,
        setupProvider: false,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        modelEndpoints: endpointCatalog(
          fakeEndpoint("launch-profile", "launch-model")
        )
      },
      snapshot
    })

    expect(summary).toContain(`URL: ${app.url}`)
    expect(summary).toContain(`Storage: store-dir ${storeDir}`)
    expect(summary).toContain(`Service binary: ${serviceBin}`)
    expect(summary).toContain("Active provider: local-cli-summary")
    expect(summary).toContain("Model endpoints: 1")
    expect(summary).toContain("Provider readiness: ready")
    expect(summary).toContain("Provider can run: yes")
    expect(summary).toContain("Provider run gate: ready")
    expect(summary).toContain("Conversation submit: enabled")
    expect(summary).toContain(
      "  - active local-cli-summary protocol=fake provider=fake model=local-cli-summary-model credential=none"
    )
    expect(summary).toContain("Layout: split")
    expect(summary).toContain("Mode: chat")
    expect(summary).toContain("Theme: dark")
    expect(summary).toContain("Density: comfortable")
    expect(summary).toContain("Web ready: yes")
    expect(summary).toContain("Last operation: idle")
    expect(summary).toContain(
      "Privacy: host-only details hidden from product snapshot"
    )
    expect(summary.join("\n")).not.toContain("launch-profile")
    expect(summary.join("\n")).not.toContain("launch-model")
    expect(jsonSummary).toMatchObject({
      kind: "local-host.cli.startup-summary",
      url: app.url,
      open: true,
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBinary: serviceBin,
      provider: {
        activeEndpointId: "local-cli-summary",
        endpointCount: 1,
        readiness: {
          status: "ready",
          reason: "active_endpoint_ready",
          activeEndpointId: "local-cli-summary",
          endpointCount: 1,
          canRun: true,
          attentionRequired: false,
          requiresCredential: false,
          credentialConfigured: false
        },
        endpoints: [
          {
            id: "local-cli-summary",
            connection: { id: "local-cli-summary", providerId: "fake" },
            protocol: { id: "fake" },
            model: expect.objectContaining({ id: "local-cli-summary-model" }),
            active: true,
            credentialConfigured: false
          }
        ]
      },
      product: {
        layout: "split",
        mode: "chat",
        theme: "dark",
        density: "comfortable"
      },
      web: {
        ready: true,
        workbenchState: "idle",
        conversationState: "idle",
        conversationCanSubmit: true,
        conversationCanCancel: false,
        conversationCanRegenerate: false,
        operationStatus: {
          kind: "web.operation-status",
          state: "idle",
          message: "No operation yet"
        },
        providerRunGate: {
          state: "ready",
          status: "ready",
          reason: "active_endpoint_ready",
          activeEndpointId: "local-cli-summary",
          canRun: true,
          canSubmitConversation: true,
          attentionRequired: false,
          message: "Provider ready"
        }
      },
      privacy: {
        safe: true,
        exposesStorePath: false,
        exposesServiceBinaryPath: false,
        exposesSecrets: false,
        exposesRawStorageClient: false,
        exposesRendererMutationApi: false
      },
    })
    expect(JSON.parse(jsonLine)).toEqual(jsonSummary)
    expect(jsonLine).not.toContain("launch-profile")
    expect(jsonLine).not.toContain("launch-model")
  })

  it("formats CLI provider readiness when the active provider needs attention", async () => {
    const storeDir = await tempDir("wanex-local-host-cli-readiness-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint(
          "local-cli-readiness-initial",
          "local-cli-readiness-initial-model"
        )
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    await app.modelEndpoints.upsertModelEndpoint({
      modelEndpoint: openAIEndpoint({
        id: "local-cli-openai-missing-key",
        modelId: "local-cli-openai-missing-key-model",
        baseUrl: "https://provider.example.test/v1"
      }),
      makeActive: true
    })
    const snapshot = await app.readSnapshot()
    const options = {
      open: false,
      smoke: false,
      setupProvider: false,
      summaryFormat: "text" as const,
      hostname: "127.0.0.1",
      serviceBin,
      storage: {
        kind: "store-dir" as const,
        storeDir
      },
      modelEndpoints: endpointCatalog(
        fakeEndpoint("launch-profile", "launch-model")
      )
    }
    const summary = formatLocalCliStartupSummary({
      options,
      snapshot
    })
    const jsonSummary = projectLocalCliStartupSummary({
      options,
      snapshot
    })

    expect(summary).toContain("Provider readiness: missing_required_credential")
    expect(summary).toContain("Provider can run: no")
    expect(summary).toContain("Provider run gate: blocked")
    expect(summary).toContain("Conversation submit: blocked")
    expect(summary).toContain("Last operation: idle")
    expect(jsonSummary.provider.readiness).toEqual({
      status: "missing_required_credential",
      reason: "active_endpoint_missing_credential",
      activeEndpointId: "local-cli-openai-missing-key",
      endpointCount: 2,
      canRun: false,
      attentionRequired: true,
      requiresCredential: true,
      credentialConfigured: false
    })
    expect(jsonSummary.web.providerRunGate).toEqual({
      state: "blocked",
      status: "missing_required_credential",
      reason: "active_endpoint_missing_credential",
      activeEndpointId: "local-cli-openai-missing-key",
      canRun: false,
      canSubmitConversation: false,
      attentionRequired: true,
      message: "Host setup required"
    })
    expect(jsonSummary.web.operationStatus).toEqual({
      kind: "web.operation-status",
      state: "idle",
      message: "No operation yet"
    })
    expect(jsonSummary.serviceBinary).toBe(serviceBin)
  })

  it("runs a bounded CLI smoke check through the local product path", async () => {
    const storeDir = await tempDir("wanex-local-host-cli-smoke-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-cli-smoke", "local-cli-smoke-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const result = await runLocalCliSmoke({
      app,
      options: {
        open: false,
        smoke: true,
        setupProvider: false,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        modelEndpoints: endpointCatalog(
          fakeEndpoint("local-cli-smoke", "local-cli-smoke-model")
        )
      }
    })

    expect(result).toMatchObject({
      kind: "local-host.cli.smoke-result",
      ok: true,
      checks: {
        shell: {
          ok: true
        },
        layoutAction: {
          ok: true
        },
        conversationAction: {
          ok: true
        },
        privacy: {
          ok: true
        }
      },
      startup: {
        kind: "local-host.cli.startup-summary",
        provider: {
          activeEndpointId: "local-cli-smoke",
          readiness: {
            status: "ready",
            canRun: true
          }
        },
        product: {
          layout: "split",
          selectedSessionId: expect.stringMatching(/^ses_/)
        },
        web: {
          ready: true,
          workbenchState: "idle",
          conversationState: "succeeded",
          conversationCanSubmit: true,
          operationStatus: {
            state: "succeeded",
            action: "submit-conversation"
          },
          providerRunGate: {
            state: "ready",
            canSubmitConversation: true
          }
        },
        privacy: {
          safe: true
        },
      }
    })
    const json = formatLocalCliSmokeResult(result)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual(result)
    expect(parsed.startup.storage).toEqual({
      kind: "store-dir",
      storeDir
    })
    expect(parsed.startup.serviceBinary).toBe(serviceBin)
  })

  it("runs a bounded CLI provider setup through the trusted host facade", async () => {
    const storeDir = await tempDir("wanex-local-host-cli-setup-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint(
          "local-cli-setup-initial",
          "local-cli-setup-initial-model"
        )
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const result = await runLocalCliProviderSetup({
      app,
      options: {
        open: false,
        smoke: false,
        setupProvider: true,
        summaryFormat: "json",
        hostname: "127.0.0.1",
        serviceBin,
        storage: {
          kind: "store-dir",
          storeDir
        },
        modelEndpoints: {
          endpoints: [
            openAIEndpoint({
              id: "local-cli-setup-openai",
              modelId: "local-cli-setup-openai-model",
              baseUrl: "https://provider.example.test/v1",
              secretRef: "env://LOCAL_CLI_SETUP_SECRET"
            })
          ],
          activeEndpointId: "local-cli-setup-openai"
        }
      }
    })

    expect(result).toMatchObject({
      kind: "local-host.cli.provider-setup-result",
      ok: true,
      configuredEndpoints: [
        {
          id: "local-cli-setup-openai",
          active: true,
          credentialConfigured: true,
        }
      ],
      startup: {
        kind: "local-host.cli.startup-summary",
        provider: {
          activeEndpointId: "local-cli-setup-openai",
          readiness: {
            status: "ready",
            canRun: true
          }
        }
      }
    })
    const json = formatLocalCliProviderSetupResult(result)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual(result)
    expect(json).not.toContain("LOCAL_CLI_SETUP_SECRET")
    expect(parsed.startup.storage).toEqual({
      kind: "store-dir",
      storeDir
    })
    expect(parsed.startup.serviceBinary).toBe(serviceBin)
  })

  it("manages model endpoints through the trusted host facade", async () => {
    const storeDir = await tempDir("wanex-local-host-provider-")
    const first = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-initial", "local-initial-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(first)

    await expect(first.modelEndpoints.listModelEndpoints()).resolves
      .toMatchObject({
        activeEndpointId: "local-initial",
        endpoints: [
          {
            id: "local-initial",
            active: true,
            model: { id: "local-initial-model" },
            credentialConfigured: false
          }
        ]
      })

    await expect(
      first.modelEndpoints.upsertModelEndpoint({
        modelEndpoint: openAIEndpoint({
          id: "local-second",
          modelId: "local-second-model",
          baseUrl: "https://provider.example.test/v1",
          secretRef: "env://LOCAL_SECOND_SECRET"
        }),
        makeActive: true
      })
    ).resolves.toMatchObject({
      id: "local-second",
      active: true,
      model: { id: "local-second-model" },
      credentialConfigured: true,
    })
    expect(first.settings.readSettings().profile.activeModelEndpointId)
      .toBe("local-second")
    const firstSnapshot = await first.readSnapshot()
    expect(firstSnapshot.modelEndpoints.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-second",
          active: true,
          credentialConfigured: true,
        })
      ])
    )
    expect(firstSnapshot.web.view.settings.profile.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "local-second",
          active: true,
          credentialConfigured: true
        })
      ])
    )
    const firstSerialized = JSON.stringify(firstSnapshot)
    expect(firstSerialized).toContain("https://provider.example.test/v1")
    expect(firstSerialized).not.toContain("env://LOCAL_SECOND_SECRET")
    expect(containsSensitiveText(firstSnapshot, storeDir)).toBe(false)
    expect(containsSensitiveText(firstSnapshot, serviceBin)).toBe(false)

    await first.close()
    apps.pop()

    const second = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-initial", "local-initial-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(second)

    expect(second.settings.readSettings().profile.activeModelEndpointId)
      .toBe("local-second")
    await expect(second.modelEndpoints.readActiveModelEndpoint()).resolves
      .toMatchObject({
        id: "local-second",
        active: true,
        model: { id: "local-second-model" },
        credentialConfigured: true,
      })
  })

  it("configures model endpoints through the host-owned setup facade", async () => {
    const storeDir = await tempDir("wanex-local-host-provider-setup-")
    const app = await startLocalWebApp({
      storage: {
        kind: "store-dir",
        storeDir
      },
      serviceBin,
      modelEndpoints: endpointCatalog(
        fakeEndpoint("local-setup-initial", "local-setup-initial-model")
      ),
      web: {
        hostname: "127.0.0.1",
      }
    })
    apps.push(app)

    const result = await app.modelEndpoints.upsertModelEndpoint({
      modelEndpoint: openAIEndpoint({
        id: "local-setup-openai",
        modelId: "local-setup-openai-model",
        baseUrl: "https://provider.example.test/v1",
        secretRef: "env://LOCAL_SETUP_SECRET"
      }),
      makeActive: true
    })

    expect(result).toMatchObject({
      id: "local-setup-openai",
      protocol: { id: "openai-chat-completions" },
      connection: { providerId: "openai-compatible" },
      model: { id: "local-setup-openai-model" },
      active: true,
      credentialConfigured: true,
    })
    expect(JSON.stringify(result)).not.toContain("LOCAL_SETUP_SECRET")

    const snapshot = await app.readSnapshot()
    expect(snapshot.web.view.settings.profile.readiness).toMatchObject({
      status: "ready",
      activeEndpointId: "local-setup-openai",
      canRun: true
    })
    expect(JSON.stringify(snapshot)).not.toContain("LOCAL_SETUP_SECRET")
    expect(containsSensitiveText(snapshot, storeDir)).toBe(false)
    expect(containsSensitiveText(snapshot, serviceBin)).toBe(false)
  })
})

function testPluginComposition(
  events: string[],
  failOnStart = false,
  pluginManagement?: PluginManagementPort
): LocalPluginCompositionPort {
  return {
    async prepare({ handle }) {
      events.push("prepare")
      await handle.core.getConfig("local-plugin-composition.probe")
      const emptyDomain = () => ({ all: [], byId: new Map() })
      const generation = {
        revision: "local-plugin-composition:test",
        snapshot: {
          contributions: [],
          byDomain: {
            instruction: emptyDomain(),
            skill: emptyDomain(),
            command: emptyDomain(),
            agent: emptyDomain(),
            tool: emptyDomain(),
            provider_catalog: emptyDomain(),
            lifecycle_hook: emptyDomain()
          },
          diagnostics: []
        }
      }
      return {
        productBinding: {
          extensions: {
            source: {
              current: () => generation,
              subscribe: () => () => {}
            }
          },
          productCommands: {
            extensionExecutor: {
              supports: () => false,
              preview: () => ({
                ok: false,
                message: "test Plugin composition has no commands"
              }),
              async execute() {
                throw new Error("test Plugin composition has no commands")
              }
            }
          },
          ...(pluginManagement === undefined ? {} : { pluginManagement })
        },
        start() {
          events.push("start")
          if (failOnStart) {
            throw new Error("planned Plugin start failure")
          }
        },
        stop() {
          events.push("stop")
        },
        dispose() {
          events.push("dispose")
        }
      }
    }
  }
}

function testPluginManagement(
  snapshot: PluginManagementSnapshot
): PluginManagementPort {
  const rejected = {
    kind: "plugin.management.rejected" as const,
    reason: "invalid_request" as const,
    message: "not used by this composition test"
  }
  return {
    async read() {
      return snapshot
    },
    async requestLocalReview() {
      return rejected
    },
    async approveLocalReview() {
      return rejected
    },
    async cancelLocalReview() {
      return rejected
    },
    async setInstallState() {
      return rejected
    },
    async retryRefresh() {
      return rejected
    },
    subscribe() {
      return () => {}
    }
  }
}

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

async function waitForLocalConversationTerminal(
  app: LocalWebApp
): Promise<Awaited<ReturnType<LocalWebApp["readSnapshot"]>>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const snapshot = await app.readSnapshot()
    if (snapshot.web.conversation.operation?.capabilities.terminal) {
      return snapshot
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("local host conversation did not finish")
}

async function waitForLocalTeamRound(
  app: LocalWebApp,
  conversationId: string
) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const result = await app.teamConversations.readConversation({
      conversationId
    })
    if (
      result.kind === "product.team-conversation.found" &&
      result.page.rounds.some((round) => round.status !== "running")
    ) {
      return result.page
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("local host Team discussion round did not finish")
}

async function waitForRawTeamRound(
  runtime: TeamConversationRuntime,
  conversationId: string
) {
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const page = await runtime.readConversationPage({
      conversationId,
      limit: 50
    })
    if (page?.rounds.some((round) => round.state === "closed")) return page
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("raw Team discussion round did not finish")
}

function endpointCatalog(
  ...endpoints: readonly LocalModelEndpointOptions[]
): LocalModelEndpointsOptions {
  return { endpoints }
}

function fakeEndpoint(
  id: string,
  modelId: string
): LocalModelEndpointOptions {
  return {
    id,
    connection: { id, providerId: "fake" },
    protocol: { id: "fake" },
    model: {
      id: modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: [],
      catalog: {
        source: "builtin",
        catalogId: `local-host.test.${id}`,
        revision: "1"
      }
    }
  }
}

function openAIEndpoint(request: {
  readonly id: string
  readonly modelId: string
  readonly baseUrl: string
  readonly secretRef?: string
}): LocalModelEndpointOptions {
  return {
    id: request.id,
    connection: {
      id: request.id,
      providerId: "openai-compatible",
      baseUrl: request.baseUrl,
      ...(request.secretRef === undefined
        ? {}
        : { secretRef: request.secretRef })
    },
    protocol: { id: "openai-chat-completions" },
    model: {
      id: request.modelId,
      operations: ["conversation"],
      inputModalities: ["text"],
      outputModalities: ["text"],
      features: ["tool_calling"],
      catalog: {
        source: "custom",
        catalogId: `local-host.test.${request.id}`,
        revision: "1"
      }
    }
  }
}

class TestSecretStore implements SecretStorePort {
  readonly scheme = "test-secret"
  private readonly values = new Map<string, string>()

  async put(request: { readonly ref: string; readonly value: string }): Promise<void> {
    this.values.set(request.ref, request.value)
  }

  async delete(ref: string): Promise<void> {
    this.values.delete(ref)
  }

  async resolve(
    ref: string,
    _context?: SecretResolveContext
  ): Promise<InMemoryResolvedSecret> {
    const value = this.values.get(ref)
    if (value === undefined) {
      throw new Error("test secret is not configured")
    }
    return new InMemoryResolvedSecret({
      ref,
      provider: this.scheme,
      value
    })
  }

  refs(): readonly string[] {
    return [...this.values.keys()].sort()
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  expect(response.status).toBe(200)
  return await response.text()
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const hostSessionToken = await readHostSessionToken(url)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-wanex-host-session": hostSessionToken
    },
    body: JSON.stringify(body)
  })
  expect(response.status).toBe(200)
  return await response.json()
}

async function readHostSessionToken(url: string): Promise<string> {
  const root = new URL("/", url)
  const html = await fetchText(root.toString())
  const match = /data-host-session-token="([^"]+)"/.exec(html)
  if (match?.[1] === undefined) {
    throw new Error("product host document did not include a session token")
  }
  return match[1]
}

function conversationText(
  parts: readonly ConversationPresentationPart[]
): string {
  return parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
}
