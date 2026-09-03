import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import Ajv2020 from "ajv/dist/2020.js"
import { describe, expect, it } from "vitest"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const schemaPath = join(rootDir, "schemas/storage-rpc/storage-rpc.schema.json")
const schemaSource = await readFile(schemaPath, "utf8")
const schema = JSON.parse(schemaSource)
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateWireEnvelope = ajv.compile(schema)
const validateDescriptor = ajv.compile({
  $schema: schema.$schema,
  $defs: schema.$defs,
  $ref: "#/$defs/StorageRpcDescriptor"
})

describe("storage RPC canonical schema", () => {
  it("accepts strict descriptor request and correlated descriptor response", () => {
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_describe_1",
        request: { command: "rpc-describe" }
      })
    ).toBe(true)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_describe_1",
        ok: true,
        value: descriptor()
      })
    ).toBe(true)
    expect(validateDescriptor(descriptor())).toBe(true)
  })

  it("rejects unknown outer and rpc-describe fields", () => {
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_extra_outer",
        request: { command: "rpc-describe" },
        extra: true
      })
    ).toBe(false)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_extra_describe",
        request: { command: "rpc-describe", extra: true }
      })
    ).toBe(false)
  })

  it("rejects unsupported versions, protocol errors, and descriptor fields", () => {
    expect(
      validateWireEnvelope({
        storage_rpc_version: 2,
        request_id: "rpc_version_2",
        request: { command: "doctor" }
      })
    ).toBe(false)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: null,
        ok: false,
        error: { code: "not_a_wire_error", message: "bad" }
      })
    ).toBe(false)
    expect(validateDescriptor({ ...descriptor(), extra: true })).toBe(false)
  })

  it("accepts every runtime command and rejects malformed nested runtime fields", () => {
    for (const [index, request] of runtimeRequests().entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_runtime_${index}`,
          request
        }),
        JSON.stringify(validateWireEnvelope.errors)
      ).toBe(true)
    }

    const append = runtimeRequests()[0]
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_runtime_nested_extra",
        request: {
          ...append,
          event: { ...append.event, extra: true }
        }
      })
    ).toBe(false)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_runtime_missing",
        request: { command: "query-events", query: { limit: null } }
      })
    ).toBe(false)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_runtime_wrong_type",
        request: { command: "doctor", extra: "not allowed" }
      })
    ).toBe(false)
  })

  it("accepts every media generation command and rejects open operation fields", () => {
    const requests = mediaGenerationRequests()
    const schemaCommands = schema.$defs.MediaGenerationStorageRpcCommand.oneOf.map(
      ({ $ref }) => schema.$defs[$ref.split("/").at(-1)].properties.command.enum[0]
    )
    expect(requests.map(({ command }) => command).sort()).toEqual(
      schemaCommands.sort()
    )
    for (const [index, request] of requests.entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_media_generation_${index}`,
          request
        }),
        JSON.stringify(validateWireEnvelope.errors)
      ).toBe(true)
    }
    const submit = mediaGenerationRequests()[0]
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_media_generation_open",
        request: {
          ...submit,
          request: { ...submit.request, extra: true }
        }
      })
    ).toBe(false)
  })

  it("accepts every sessions command and rejects missing or open control fields", () => {
    const requests = sessionsRequests()
    const schemaCommands = schema.$defs.SessionsStorageRpcCommand.oneOf.map(
      ({ $ref }) => schema.$defs[$ref.split("/").at(-1)].properties.command.enum[0]
    )
    expect(requests.map(({ command }) => command).sort()).toEqual(
      schemaCommands.sort()
    )
    for (const [index, request] of requests.entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_sessions_${index}`,
          request
        }),
        `${request.command}: ${JSON.stringify(validateWireEnvelope.errors)}`
      ).toBe(true)
    }
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_sessions_scoped_create",
        request: {
          command: "create-session",
          id: "ses_schema_scoped",
          title: null,
          kind: "agent",
          scope: { kind: "coding.repository", id: "repo_schema" }
        }
      }),
      JSON.stringify(validateWireEnvelope.errors)
    ).toBe(true)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_sessions_open_scope",
        request: {
          command: "create-session",
          id: "ses_schema_scoped",
          title: null,
          kind: "agent",
          scope: {
            kind: "coding.repository",
            id: "repo_schema",
            extra: true
          }
        }
      })
    ).toBe(false)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_sessions_missing_nullable",
        request: {
          command: "admit-session-input",
          id: null,
          session_id: "ses_schema",
          principal_id: "user_schema",
          idempotency_key: "idem_schema",
          input_type: "user",
          content: []
        }
      })
    ).toBe(false)
    const submit = sessionsRequests()[4]
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_sessions_open_retry",
        request: {
          ...submit,
          request: {
            ...submit.request,
            run_control_policy: "queue_after_current",
            extra: true
          }
        }
      })
    ).toBe(false)
  })

  it("accepts every context command and rejects context shape drift", () => {
    for (const [index, request] of contextRequests().entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_context_${index}`,
          request
        }),
        JSON.stringify(validateWireEnvelope.errors)
      ).toBe(true)
    }
    const beginEpoch = contextRequests()[0]
    const { request_digest: _requestDigest, ...missingRequestDigest } =
      beginEpoch.request
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_context_missing_request_digest",
        request: {
          ...beginEpoch,
          request: missingRequestDigest
        }
      })
    ).toBe(false)
    const activateEpoch = contextRequests()[4]
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_context_open_request",
        request: {
          ...activateEpoch,
          request: { ...activateEpoch.request, extra: true }
        }
      })
    ).toBe(false)
    for (const command of [
      "put-context-epoch",
      "clone-context-epoch",
      "put-context-replacement",
      "list-context-replacements"
    ]) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_context_removed_${command}`,
          request: { command }
        })
      ).toBe(false)
    }
  })

  it("accepts every scheduler command and rejects nested scheduler drift", () => {
    for (const [index, request] of schedulerRequests().entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_scheduler_${index}`,
          request
        }),
        JSON.stringify(validateWireEnvelope.errors)
      ).toBe(true)
    }
    const reserve = schedulerRequests()[0]
    const { tool_calls: _toolCalls, ...incompleteLimit } = reserve.request.limit
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_scheduler_missing_budget_field",
        request: {
          ...reserve,
          request: { ...reserve.request, limit: incompleteLimit }
        }
      })
    ).toBe(false)
    const enqueue = schedulerRequests()[6]
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_scheduler_open_retry",
        request: {
          ...enqueue,
          request: {
            ...enqueue.request,
            retry_policy: {
              strategy: "fixed",
              initial_delay_ms: 10,
              max_delay_ms: null,
              extra: true
            }
          }
        }
      })
    ).toBe(false)
  })

  it("accepts every tools command and rejects open tool records", () => {
    const requests = toolsRequests()
    const schemaCommands = schema.$defs.ToolsStorageRpcCommand.oneOf.map(
      ({ $ref }) => schema.$defs[$ref.split("/").at(-1)].properties.command.enum[0]
    )
    expect(requests.map(({ command }) => command).sort()).toEqual(
      schemaCommands.sort()
    )
    for (const [index, request] of requests.entries()) {
      expect(validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: `rpc_tools_${index}`,
        request
      }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const begin = toolsRequests()[0]
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_tools_open",
      request: { ...begin, request: { ...begin.request, extra: true } }
    })).toBe(false)
  })

  it("accepts every workspace command and rejects workspace control drift", () => {
    for (const [index, request] of workspaceRequests().entries()) {
      expect(validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: `rpc_workspace_${index}`,
        request
      }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const proposal = workspaceRequests()[5]
    const { metadata: _metadata, ...missingMetadata } = proposal.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_workspace_missing_metadata",
      request: { ...proposal, request: missingMetadata }
    })).toBe(false)
  })

  it("accepts every plan command and rejects plan control drift", () => {
    for (const [index, request] of planRequests().entries()) {
      expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: `rpc_plan_${index}`, request })).toBe(true)
    }
    const create = planRequests()[0]
    const { source: _source, ...missingSource } = create.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_plan_missing_source",
      request: { ...create, request: missingSource }
    })).toBe(false)
    const operation = planRequests()[3]
    const { expected_revision: _revision, ...missingRevision } = operation.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_plan_missing_revision",
      request: { ...operation, request: missingRevision }
    })).toBe(false)
  })

  it("accepts every objective command and rejects objective control drift", () => {
    for (const [index, request] of objectiveRequests().entries()) {
      expect(validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: `rpc_objective_${index}`,
        request
      }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const attempt = objectiveRequests()[5]
    const { expected_revision: _revision, ...missingRevision } = attempt.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_objective_missing_revision",
      request: { ...attempt, request: missingRevision }
    })).toBe(false)
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_objective_open_filter",
      request: {
        command: "list-objective-attempts",
        request: {
          objective_id: "objective_schema",
          limit: null,
          extra: true
        }
      }
    })).toBe(false)
  })

  it("accepts every delegation command and rejects delegation control drift", () => {
    for (const [index, request] of delegationRequests().entries()) {
      expect(validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: `rpc_delegation_${index}`,
        request
      }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const materialize = delegationRequests()[12]
    const { retry_policy: _retryPolicy, ...missingRetryPolicy } = materialize.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_delegation_missing_retry_policy",
      request: { ...materialize, request: missingRetryPolicy }
    })).toBe(false)
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_delegation_open_node_filter",
      request: {
        command: "list-delegation-graph-nodes",
        request: { graph_id: "graph_schema", state: null, extra: true }
      }
    })).toBe(false)
  })

  it("accepts every team command and rejects team control drift", () => {
    const requests = teamRequests()
    const schemaCommands = schema.$defs.TeamStorageRpcCommand.oneOf.map(
      ({ $ref }) => schema.$defs[$ref.split("/").at(-1)].properties.command.enum[0]
    )
    expect(requests.map(({ command }) => command).sort()).toEqual(
      schemaCommands.sort()
    )
    for (const [index, request] of requests.entries()) {
      expect(validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: `rpc_team_${index}`,
        request
      }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const message = teamRequests().find(({ command }) => command === "admit-team-message")
    expect(message).toBeDefined()
    const { idempotency_key: _idempotencyKey, ...missingIdempotencyKey } = message.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_team_missing_message_idempotency_key",
      request: { ...message, request: missingIdempotencyKey }
    })).toBe(false)
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_team_open_participant_filter",
      request: {
        command: "list-team-participants",
        request: { conversation_id: "team_schema", state: null, extra: true }
      }
    })).toBe(false)
  })

  it("accepts every plugin command and rejects plugin control drift", () => {
    for (const [index, request] of pluginRequests().entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_plugin_${index}`,
          request
        }),
        `${request.command}: ${JSON.stringify(validateWireEnvelope.errors)}`
      ).toBe(true)
    }
    const action = pluginRequests().find(({ command }) => command === "submit-plugin-action")
    expect(action).toBeDefined()
    const { retry_policy: _retryPolicy, ...missingRetryPolicy } = action.request
    expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: "rpc_plugin_missing_retry", request: { ...action, request: missingRetryPolicy } })).toBe(false)
    expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: "rpc_plugin_open_filter", request: { command: "list-plugin-installs", request: { plugin_id: null, state: null, limit: null, extra: true } } })).toBe(false)
  })

  it("accepts every connector command and rejects connector control drift", () => {
    for (const [index, request] of connectorRequests().entries()) {
      expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: `rpc_connector_${index}`, request }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const start = connectorRequests()[6]
    const { metadata: _metadata, ...missingMetadata } = start.request
    expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: "rpc_connector_missing_metadata", request: { ...start, request: missingMetadata } })).toBe(false)
    expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: "rpc_connector_bad_finish_state", request: { command: "finish-connector-session", request: { ...connectorRequests()[8].request, state: "connected" } } })).toBe(false)
  })

  it("accepts every channel command and rejects channel control drift", () => {
    for (const [index, request] of channelRequests().entries()) {
      expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: `rpc_channel_${index}`, request }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const delivery = channelRequests()[6]
    const { retry_policy: _retryPolicy, ...missingRetryPolicy } = delivery.request
    expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: "rpc_channel_missing_retry", request: { ...delivery, request: missingRetryPolicy } })).toBe(false)
    expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: "rpc_channel_open_filter", request: { command: "list-channel-projections", request: { inbound_event_id: null, target_kind: null, limit: null, extra: true } } })).toBe(false)
  })

  it("embeds the canonical schema digest in both generated languages", async () => {
    const digest = createHash("sha256").update(schemaSource).digest("hex")
    const [typescript, rust] = await Promise.all([
      readFile(
        join(rootDir, "packages/storage/src/generated/storage-rpc.ts"),
        "utf8"
      ),
      readFile(
        join(rootDir, "crates/system-service/src/generated/storage_rpc.rs"),
        "utf8"
      )
    ])
    expect(typescript).toContain(`STORAGE_RPC_SCHEMA_SHA256 = "${digest}"`)
    expect(rust).toMatch(
      new RegExp(`STORAGE_RPC_SCHEMA_SHA256: &str =\\s*"${digest}"`)
    )
  })
})

function descriptor() {
  return {
    selected_version: 1,
    supported_versions: [1],
    service_version: "0.0.0",
    schema_sha256: "a".repeat(64),
    capabilities: [
      "storage.runtime",
      "storage.sessions",
      "storage.context",
      "storage.scheduler",
      "storage.tools",
      "storage.workspace",
      "storage.plan",
      "storage.objective",
      "storage.delegation",
      "storage.team",
      "storage.plugin",
      "storage.connector",
      "storage.channel",
      "storage.media_generation"
    ]
  }
}

function runtimeRequests() {
  const nullableScope = {
    session_id: null,
    turn_id: null,
    attempt_id: null,
    input_id: null,
    message_id: null,
    resource_id: null,
    plan_proposal_id: null,
    objective_id: null
  }
  return [
    {
      command: "append-event",
      event: {
        id: "evt_schema",
        type: "config.updated",
        scope: nullableScope,
        payload: { key: "value" },
        occurredAt: 1
      }
    },
    {
      command: "query-events",
      query: {
        session_id: null,
        plan_proposal_id: null,
        objective_id: null,
        after_occurred_at: null,
        after_event_id: null,
        limit: 10
      }
    },
    { command: "put-config", key: "profile", value: { enabled: true } },
    {
      command: "apply-config-mutations",
      puts: [{ key: "profile", value: { enabled: true } }],
      deletes: ["profile.previous"]
    },
    {
      command: "compare-and-apply-config-mutations",
      conditions: [
        { key: "schedule.definition.daily", expected_revision: 1 },
        { key: "schedule.occurrence.daily.2026-08-20", expected_revision: null }
      ],
      puts: [
        {
          key: "schedule.occurrence.daily.2026-08-20",
          value: { state: "claimed" }
        }
      ],
      deletes: []
    },
    { command: "has-live-secret-reference", secret_ref: "env://PROVIDER_KEY" },
    { command: "get-config", key: "profile" },
    { command: "get-config-entry", key: "profile" },
    {
      command: "list-config-entries",
      prefix: "schedule.definition.",
      after_key: null,
      limit: 50
    },
    {
      command: "write-atomic-file",
      logical_path: "schema/file.txt",
      content_base64: "aGVsbG8=",
      expected_sha256: null
    },
    {
      command: "ingest-resource",
      request: {
        id: null,
        logical_path: null,
        content_base64: "aGVsbG8=",
        media_type: "text/plain",
        kind: "artifact",
        origin: "tool_output",
        label: null,
        source: null,
        metadata: null,
        width: null,
        height: null,
        duration_ms: null,
        expected_sha256: null
      }
    },
    { command: "get-resource", resource_id: "res_schema" },
    {
      command: "list-resources",
      request: { kind: null, origin: null, state: null, limit: 10 }
    },
    {
      command: "create-resource-ticket",
      principal_id: "user_schema",
      resource_id: "res_schema",
      capability: "read",
      expires_at: 100
    },
    {
      command: "cleanup-expired-resource-tickets",
      request: { now_ms: null, limit: 10 }
    },
    { command: "doctor" }
  ]
}

function mediaGenerationRequests() {
  const lease = {
    operation_id: "media_operation_schema",
    worker_id: "media_worker_schema",
    lease_token: "media_lease_schema"
  }
  return [
    {
      command: "submit-media-generation",
      request: {
        id: null,
        job_id: null,
        principal_id: "media_user_schema",
        idempotency_key: "media_key_schema",
        binding: {
          endpointId: "media_endpoint_schema",
          endpointDigest: "media_endpoint_digest_schema",
          connection: {
            id: "media_connection_schema",
            providerId: "media_provider_schema"
          },
          protocol: { id: "media_protocol_schema" },
          model: {
            id: "media_model_schema",
            operations: ["image.generate"],
            inputModalities: ["text"],
            outputModalities: ["image"],
            features: [],
            catalog: {
              source: "custom",
              catalogId: "schema.media-model",
              revision: "1"
            }
          },
          request: {
            prompt: "schema image",
            outputModality: "image",
            inputResources: [],
            options: null
          },
          requestDigest: "media_request_digest_schema"
        },
        priority: null
      }
    },
    { command: "begin-media-generation", request: lease },
    {
      command: "accept-media-generation",
      request: {
        ...lease,
        external_operation_id: "external_media_schema",
        provider_checkpoint: { cursor: 1 }
      }
    },
    {
      command: "suspend-media-generation",
      request: {
        ...lease,
        delay_ms: 1000,
        outcome: "pending",
        provider_checkpoint: { cursor: 2 },
        progress: { percent: 50 },
        error: null
      }
    },
    {
      command: "record-media-generation-outputs",
      request: {
        ...lease,
        poll_outcome: "completed",
        output_references: [
          {
            kindOfReference: "provider_file",
            provider: "media_provider_schema",
            providerFileId: "file_schema"
          }
        ],
        progress: null
      }
    },
    {
      command: "complete-media-generation",
      request: {
        ...lease,
        poll_outcome: "completed",
        output_resource_ids: ["resource_schema"],
        result: null
      }
    },
    {
      command: "settle-media-generation",
      request: {
        ...lease,
        poll_outcome: "none",
        outcome: "recovery_required",
        error: { type: "ambiguous_provider_submission" },
        reason: "provider checkpoint missing"
      }
    },
    {
      command: "request-media-generation-cancel",
      request: {
        operation_id: "media_operation_schema",
        reason: "cancel"
      }
    },
    {
      command: "get-media-generation",
      operation_id: "media_operation_schema"
    },
    {
      command: "list-media-generation",
      request: {
        principal_id: null,
        state: "polling",
        limit: null
      }
    }
  ]
}

function sessionsRequests() {
  const content = [{ type: "text", id: "part_schema", text: "hello" }]
  return [
    {
      command: "create-session",
      id: null,
      title: null,
      kind: null,
      scope: null
    },
    { command: "get-session", id: "ses_schema" },
    {
      command: "list-sessions",
      request: {
        kind: null,
        status: null,
        updated_before: null,
        updated_after: null,
        scope: null,
        before: null,
        limit: null
      }
    },
    {
      command: "admit-session-input",
      id: null,
      session_id: "ses_schema",
      principal_id: "user_schema",
      idempotency_key: "idem_admit_schema",
      input_type: "user",
      content,
      origin: null,
      intent: null
    },
    {
      command: "submit-session-turn",
      request: {
        id: null,
        turn_id: null,
        session_id: "ses_schema",
        principal_id: "user_schema",
        idempotency_key: "idem_submit_schema",
        queue: null,
        input_type: null,
        content,
        origin: null,
        intent: null,
        run_control_policy: null,
        expected_turn_id: null,
        job_id: null,
        job_idempotency_key: null,
        execution_binding: {
          digest: "binding_schema",
          createdAt: 1,
          modelEndpoint: {
            endpointId: "endpoint_schema",
            endpointDigest: "endpoint_digest_schema",
            connection: {
              id: "connection_schema",
              providerId: "provider_schema"
            },
            protocol: { id: "openai-chat-completions" },
            model: {
              id: "model_schema",
              operations: ["conversation"],
              inputModalities: ["text"],
              outputModalities: ["text"],
              features: [],
              catalog: {
                source: "custom",
                catalogId: "schema.model",
                revision: "1"
              }
            }
          },
          resources: [],
          recovery: {
            providerMaxAttempts: 2,
            idempotentToolMaxAttempts: 2
          }
        },
        max_steps: null,
        regenerates_turn_id: null,
        scheduled_at: null,
        not_before: null,
        priority: null,
        budget_grant_id: null
      }
    },
    {
      command: "start-session-turn-attempt",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        input_id: "inp_schema",
        job_id: "job_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema"
      }
    },
    {
      command: "settle-session-turn",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        attempt_id: "attempt_schema",
        input_id: "inp_schema",
        job_id: "job_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema",
        outcome: "succeeded",
        provider_invocation_id: "pinv_schema",
        assistant_message: content,
        provider_state: [],
        result: { ok: true },
        error: null,
        reason: null
      }
    },
    {
      command: "begin-provider-invocation",
      request: {
        id: null,
        session_id: "ses_schema",
        turn_id: "turn_schema",
        attempt_id: "attempt_schema",
        input_id: "inp_schema",
        job_id: "job_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema",
        step: 1,
        invocation_number: 1,
        request_digest: "request_digest_schema"
      }
    },
    {
      command: "mark-provider-invocation-output",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        attempt_id: "attempt_schema",
        input_id: "inp_schema",
        job_id: "job_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema",
        invocation_id: "pinv_schema",
        provider_request_id: null
      }
    },
    {
      command: "finish-provider-invocation",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        attempt_id: "attempt_schema",
        input_id: "inp_schema",
        job_id: "job_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema",
        invocation_id: "pinv_schema",
        outcome: "succeeded",
        assistant_message: content,
        provider_state: [],
        provider_request_id: null,
        error: null
      }
    },
    {
      command: "list-provider-invocations",
      request: { turn_id: "turn_schema" }
    },
    {
      command: "request-session-turn-cancel",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        input_id: "inp_schema",
        job_id: "job_schema",
        reason: "cancel"
      }
    },
    {
      command: "interrupt-session-turn",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        attempt_id: "attempt_schema",
        reason: "stop",
        principal_id: null,
        idempotency_key: null,
        origin: null,
        metadata: null
      }
    },
    {
      command: "steer-session-turn",
      request: {
        session_id: "ses_schema",
        principal_id: "user_schema",
        expected_turn_id: "turn_schema",
        expected_attempt_id: "attempt_schema",
        idempotency_key: "idem_steer_schema",
        content,
        origin: null,
        metadata: null
      }
    },
    {
      command: "list-session-turn-controls",
      request: {
        session_id: "ses_schema",
        turn_id: null,
        attempt_id: null,
        kind: null,
        status: null,
        limit: null
      }
    },
    {
      command: "apply-session-turn-control",
      request: {
        session_id: "ses_schema",
        turn_id: "turn_schema",
        attempt_id: "attempt_schema",
        control_id: "control_schema",
        job_id: "job_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema"
      }
    },
    {
      command: "list-session-inputs",
      session_id: "ses_schema",
      status: null,
      limit: null
    },
    {
      command: "list-session-messages",
      session_id: "ses_schema",
      before_sequence: null,
      limit: null,
      turn_ids: null
    },
    {
      command: "list-session-turns",
      session_id: "ses_schema",
      state: null,
      turn_ids: null,
      before: null,
      limit: null
    },
    { command: "get-session-turn", turn_id: "turn_schema" },
    { command: "list-session-attempts", turn_id: "turn_schema" },
    {
      command: "append-session-message",
      session_id: "ses_schema",
      turn_id: "turn_schema",
      attempt_id: "attempt_schema",
      input_id: "inp_schema",
      job_id: "job_schema",
      worker_id: "worker_schema",
      lease_token: "lease_schema",
      idempotency_key: "message:turn_schema:assistant",
      role: "assistant",
      content,
      provider_state: []
    },
    {
      command: "rename-session",
      request: {
        session_id: "ses_schema",
        title: "Renamed",
        expected_revision: 1
      }
    },
    {
      command: "archive-session",
      request: { session_id: "ses_schema", expected_revision: 2 }
    },
    {
      command: "restore-session",
      request: { session_id: "ses_schema", expected_revision: 3 }
    }
  ]
}

function contextRequests() {
  const lease = {
    epoch_id: "ctx_schema",
    job_id: "job_schema",
    worker_id: "worker_schema",
    lease_token: "lease_schema"
  }
  return [
    {
      command: "begin-context-epoch",
      request: {
        id: "ctx_schema",
        session_id: "ses_schema",
        job_id: lease.job_id,
        worker_id: lease.worker_id,
        lease_token: lease.lease_token,
        max_provider_attempts: 2,
        previous_epoch_id: null,
        previous_summary_digest: null,
        source_head_sequence: 6,
        source_head_message_id: "msg_schema_6",
        cut_sequence: 2,
        cut_message_id: "msg_schema_2",
        retained_from_sequence: 3,
        retained_from_message_id: "msg_schema_3",
        source_digest: "source_digest_schema",
        policy: { algorithm: "semantic-summary" },
        policy_digest: "policy_digest_schema",
        model_endpoint: { endpointId: "endpoint_schema" },
        request_digest: "request_digest_schema",
        token_estimate_before: 12_000
      }
    },
    {
      command: "mark-context-epoch-dispatched",
      request: lease
    },
    {
      command: "mark-context-epoch-output-observed",
      request: { ...lease, generation_attempt: 1 }
    },
    {
      command: "finish-context-epoch-generation",
      request: {
        ...lease,
        generation_attempt: 1,
        outcome: "succeeded",
        retryable: null,
        summary: "Semantic summary",
        summary_digest: "summary_digest_schema",
        usage: { inputTokens: 1000, outputTokens: 100 },
        error: null,
        token_estimate_after: 1_100,
        token_savings: 10_900
      }
    },
    {
      command: "activate-context-epoch",
      request: {
        ...lease,
        expected_previous_epoch_id: null
      }
    },
    {
      command: "prune-context-epochs",
      request: {
        session_id: "ses_schema",
        keep_last_superseded: null,
        older_than_updated_at: null,
        dry_run: null
      }
    },
    {
      command: "list-context-epochs",
      request: {
        session_id: "ses_schema",
        state: null
      }
    },
    {
      command: "get-active-context-epoch",
      request: { session_id: "ses_schema" }
    }
  ]
}

function schedulerRequests() {
  const amount = {
    tokens: null,
    cost_micros: null,
    wall_time_ms: null,
    tool_calls: null
  }
  const jobRef = {
    job_id: "job_schema",
    worker_id: "worker_schema",
    lease_token: "lease_schema"
  }
  return [
    {
      command: "reserve-budget",
      request: {
        scope: { kind: "session", owner_id: "ses_schema", window_kind: null },
        limit: amount,
        requested: amount,
        principal_id: "user_schema",
        reason: "run",
        idempotency_key: "idem_budget_schema",
        expires_at: null
      }
    },
    {
      command: "commit-budget",
      request: { grant_id: "grant_schema" }
    },
    {
      command: "record-budget-usage",
      request: {
        grant_id: "grant_schema",
        usage: amount,
        source: "tool",
        source_id: "call_schema",
        idempotency_key: "usage_schema"
      }
    },
    { command: "release-budget", grant_id: "grant_schema" },
    { command: "get-budget-scope", scope_id: "scope_schema" },
    { command: "list-budget-grants", scope_id: "scope_schema" },
    {
      command: "enqueue-job",
      request: {
        id: null,
        kind: "memory.compaction",
        queue: null,
        principal_id: "user_schema",
        payload: { sessionId: "ses_schema" },
        scheduled_at: null,
        not_before: null,
        priority: null,
        concurrency_key: null,
        max_attempts: null,
        retry_policy: null,
        idempotency_key: null,
        budget_grant_id: null
      }
    },
    {
      command: "claim-job",
      request: { worker_id: "worker_schema", lease_ms: 60000, kinds: null, queues: null }
    },
    { command: "heartbeat-job", request: { ...jobRef, lease_ms: 60000 } },
    { command: "complete-job", request: { ...jobRef, result: null } },
    { command: "fail-job", request: { ...jobRef, error: { message: "failed" } } },
    { command: "cancel-job", request: { job_id: "job_schema", reason: "cancel" } },
    { command: "get-job", request: { job_id: "job_schema" } },
    {
      command: "list-jobs",
      request: { state: null, kind: null, limit: null }
    }
  ]
}

function toolsRequests() {
  const mediaBinding = mediaGenerationRequests()[0].request.binding
  return [
    {
      command: "begin-tool-execution",
      request: {
        session_id: "session", turn_id: "turn", attempt_id: "attempt",
        input_id: "input", source_message_id: "message_source",
        job_id: "job_schema", worker_id: "worker_schema", lease_token: "lease_schema",
        principal_id: "principal", tool_call_id: "call", tool_name: "echo",
        input: { text: "hello" }, descriptor: { name: "echo" },
        permission: { status: "allow" }, activity: null, state: "running",
        idempotency_key: "tool:turn:call"
      }
    },
    {
      command: "defer-tool-execution",
      request: {
        session_id: "session", turn_id: "turn", session_attempt_id: "attempt",
        input_id: "input", source_message_id: "message_source",
        session_job_id: "job_schema", worker_id: "worker_schema",
        lease_token: "lease_schema", tool_execution_id: "toolx",
        tool_invocation_attempt_id: "toolattempt_schema", tool_call_id: "call",
        operation: {
          kind: "media_generation",
          binding: mediaBinding,
          priority: null
        }
      }
    },
    {
      command: "finish-tool-execution",
      request: {
        session_id: "session", turn_id: "turn", session_attempt_id: "attempt",
        input_id: "input", job_id: "job_schema", worker_id: "worker_schema",
        lease_token: "lease_schema", execution_id: "toolx",
        invocation_attempt_id: "toolattempt_schema", state: "succeeded",
        content: [{ type: "json", value: { ok: true } }],
        content_digest: "a".repeat(64), is_error: false,
        result_presentation: null, error: null
      }
    },
    {
      command: "require-tool-execution-recovery",
      request: {
        session_id: "session", turn_id: "turn", session_attempt_id: "attempt",
        input_id: "input", job_id: "job_schema", worker_id: "worker_schema",
        lease_token: "lease_schema", execution_id: "toolx",
        invocation_attempt_id: "toolattempt_schema",
        evidence: { type: "ambiguous_tool_outcome", message: "unknown" }
      }
    },
    {
      command: "resolve-tool-execution-recovery",
      request: {
        execution_id: "toolx", expected_recovery_revision: 1,
        decision: "confirm_succeeded", principal_id: "principal",
        reason: "verified", idempotency_key: "tool-recovery-schema",
        content: [{ type: "json", value: { ok: true } }],
        content_digest: "a".repeat(64), error: null
      }
    },
    {
      command: "resolve-tool-execution-approval",
      request: {
        execution_id: "toolx", expected_approval_revision: 1,
        decision: "approve_once", principal_id: "principal",
        reason: "approved", idempotency_key: "tool-approval-schema"
      }
    },
    { command: "get-tool-execution", execution_id: "toolx" },
    {
      command: "get-tool-execution-by-call",
      request: {
        turn_id: "turn", source_message_id: "message_source",
        tool_call_id: "call"
      }
    },
    {
      command: "list-tool-executions",
      request: {
        session_id: null,
        turn_id: "turn",
        state: null,
        limit: 20
      }
    },
    {
      command: "list-tool-activities",
      request: {
        session_id: "session",
        source_message_ids: ["message_source"]
      }
    },
    {
      command: "list-tool-execution-attempts",
      request: { execution_id: "toolx" }
    }
  ]
}

function workspaceRequests() {
  const changeset = { id: "change_schema", changes: [] }
  const receipt = {
    changeSetId: "change_schema",
    status: "applied",
    files: [],
    conflicts: []
  }
  return [
    {
      command: "put-workspace-change-set",
      request: {
        workspace_id: "workspace_schema",
        principal_id: "user_schema",
        changeset
      }
    },
    { command: "get-workspace-change-set", change_set_id: "change_schema" },
    {
      command: "list-workspace-change-sets",
      request: { workspace_id: null, state: null, limit: null }
    },
    {
      command: "record-workspace-change-operation",
      request: {
        id: null,
        changeset_id: "change_schema",
        operation: "apply",
        receipt
      }
    },
    {
      command: "list-workspace-change-operations",
      request: { changeset_id: "change_schema" }
    },
    {
      command: "put-workspace-change-proposal",
      request: {
        id: null,
        workspace_id: "workspace_schema",
        changeset_id: "change_schema",
        principal_id: "user_schema",
        title: null,
        summary: null,
        metadata: null,
        idempotency_key: null
      }
    },
    { command: "get-workspace-change-proposal", proposal_id: "proposal_schema" },
    {
      command: "list-workspace-change-proposals",
      request: {
        workspace_id: null,
        state: null,
        changeset_id: null,
        limit: null
      }
    },
    {
      command: "record-workspace-change-proposal-operation",
      request: {
        id: null,
        proposal_id: "proposal_schema",
        operation: "approve",
        actor_id: "user_schema",
        reason: null,
        metadata: null
      }
    },
    {
      command: "list-workspace-change-proposal-operations",
      request: { proposal_id: "proposal_schema" }
    }
  ]
}

function planRequests() {
  const content = {
    title: "Schema plan",
    summary: "Validate the Plan RPC schema",
    steps: [
      {
        id: "step_schema",
        title: "Validate",
        detail: null,
        metadata: null
      }
    ],
    references: [
      {
        kind: "resource",
        reference_id: "resource_schema",
        role: null,
        metadata: null
      }
    ]
  }
  const turn = {
    ...sessionsRequests()[4].request,
    origin: { kind: "plan", sourceRef: "plan_schema" }
  }
  return [
    {
      command: "create-plan-proposal",
      request: {
        id: null,
        principal_id: "user_schema",
        source: {
          session_id: "ses_schema",
          head_sequence: 0,
          head_message_id: null,
          head_turn_id: null,
          analysis_input_digest: "a".repeat(64),
          planning_request: [
            { type: "text", id: "part_plan_request", text: "Plan this" }
          ]
        },
        generation: {
          endpoint_id: "endpoint_schema",
          endpoint_digest: "b".repeat(64),
          protocol_id: "fake",
          provider_id: "fake",
          model_id: "model_schema",
          generated_at: 1,
          output_digest: "c".repeat(64),
          output: [
            { type: "text", id: "part_plan_output", text: "{}" }
          ]
        },
        content,
        idempotency_key: "plan-create-schema"
      }
    },
    { command: "get-plan-proposal", proposal_id: "plan_schema" },
    {
      command: "list-plan-proposals",
      request: {
        principal_id: null,
        source_session_id: null,
        state: null,
        reference_kind: null,
        reference_id: null,
        limit: null
      }
    },
    {
      command: "record-plan-proposal-operation",
      request: {
        id: null,
        proposal_id: "plan_schema",
        operation: "approve",
        expected_revision: 1,
        actor_kind: "human",
        actor_id: "user_schema",
        content: null,
        reason: null,
        idempotency_key: "plan-operation-schema"
      }
    },
    {
      command: "execute-approved-plan",
      request: {
        proposal_id: "plan_schema",
        expected_revision: 2,
        idempotency_key: "plan-execution-schema",
        turn
      }
    },
    {
      command: "list-plan-proposal-operations",
      request: { proposal_id: "plan_schema" }
    }
  ]
}

function objectiveRequests() {
  const turn = {
    ...sessionsRequests()[4].request,
    origin: { kind: "objective", sourceRef: "objective_schema" }
  }
  return [
    {
      command: "create-objective",
      request: {
        id: null,
        session_id: "ses_schema",
        principal_id: "user_schema",
        objective: "Ship the feature",
        boundaries: ["packages/app"],
        constraints: ["preserve public API"],
        success_criteria: [{ id: "tests", description: "tests pass" }],
        verification_policy: {
          requirements: [{
            id: "verify-tests",
            criterionIds: ["tests"],
            verifierKind: "runtime",
            verifierRef: "wanex.schema-verifier"
          }]
        },
        stop_policy: {
          maxAttempts: 3,
          maxConsecutiveBlockedAttempts: 2,
          budget: { tokens: 10_000 }
        },
        idempotency_key: "objective-create-schema"
      }
    },
    { command: "get-objective", objective_id: "objective_schema" },
    {
      command: "list-objectives",
      request: {
        session_id: null,
        principal_id: null,
        states: ["active", "cancel_requested"],
        limit: null
      }
    },
    {
      command: "pause-objective",
      request: {
        objective_id: "objective_schema",
        expected_revision: 1,
        reason: null,
        idempotency_key: "objective-pause-schema"
      }
    },
    {
      command: "resume-objective",
      request: {
        objective_id: "objective_schema",
        expected_revision: 2,
        reason: null,
        idempotency_key: "objective-resume-schema"
      }
    },
    {
      command: "admit-objective-attempt",
      request: {
        objective_id: "objective_schema",
        expected_revision: 3,
        trigger: "initial",
        idempotency_key: "objective-attempt-schema",
        turn
      }
    },
    {
      command: "review-objective-attempt",
      request: {
        id: null,
        objective_id: "objective_schema",
        attempt_id: "objective_attempt_schema",
        expected_revision: 4,
        disposition: "succeeded",
        reason: null,
        verifications: [{
          requirementId: "verify-tests",
          verifierKind: "runtime",
          verifierRef: "wanex.schema-verifier",
          result: "passed",
          evidence: [{
            kind: "runtime_projection",
            referenceId: "tests:schema",
            digest: "d".repeat(64)
          }]
        }],
        idempotency_key: "objective-review-schema"
      }
    },
    {
      command: "request-objective-cancel",
      request: {
        objective_id: "objective_schema",
        expected_revision: 4,
        reason: "user requested cancellation",
        idempotency_key: "objective-cancel-schema"
      }
    },
    {
      command: "reconcile-objective-cancellation",
      request: {
        objective_id: "objective_schema",
        attempt_id: "objective_attempt_schema",
        expected_revision: 5,
        idempotency_key: "objective-cancel-reconcile-schema"
      }
    },
    {
      command: "list-objective-attempts",
      request: { objective_id: "objective_schema", limit: null }
    },
    {
      command: "list-objective-attempt-reviews",
      request: {
        objective_id: "objective_schema",
        attempt_id: null,
        limit: null
      }
    },
    {
      command: "list-objective-verifications",
      request: {
        objective_id: "objective_schema",
        attempt_id: null,
        requirement_id: null,
        result: null,
        limit: null
      }
    }
  ]
}

function delegationRequests() {
  return [
    {
      command: "put-delegation-graph",
      request: {
        id: null,
        principal_id: "controller_schema",
        title: null,
        metadata: { source: "schema" },
        idempotency_key: null
      }
    },
    { command: "get-delegation-graph", graph_id: "graph_schema" },
    {
      command: "list-delegation-graphs",
      request: { principal_id: null, state: "running", limit: null }
    },
    {
      command: "put-delegation-graph-node",
      request: {
        id: null,
        graph_id: "graph_schema",
        kind: "agent_task",
        principal_id: "agent_schema",
        payload: { prompt: "inspect" },
        metadata: null,
        idempotency_key: null
      }
    },
    {
      command: "get-delegation-graph-node",
      request: { node_id: "node_schema" }
    },
    {
      command: "list-delegation-graph-nodes",
      request: { graph_id: "graph_schema", state: null }
    },
    {
      command: "put-delegation-graph-dependency",
      request: {
        id: null,
        graph_id: "graph_schema",
        from_node_id: "node_a_schema",
        to_node_id: "node_b_schema",
        kind: "after_success"
      }
    },
    {
      command: "list-delegation-graph-dependencies",
      request: { graph_id: "graph_schema" }
    },
    {
      command: "update-delegation-graph-state",
      request: { graph_id: "graph_schema", state: "running" }
    },
    {
      command: "update-delegation-graph-node-state",
      request: {
        node_id: "node_schema",
        state: "running",
        scheduler_job_id: null,
        metadata: null
      }
    },
    {
      command: "attach-delegation-graph-node-job",
      request: { node_id: "node_schema", scheduler_job_id: "job_schema" }
    },
    {
      command: "list-ready-delegation-graph-nodes",
      request: { graph_id: "graph_schema", limit: null }
    },
    {
      command: "materialize-ready-delegation-graph-node",
      request: {
        graph_id: "graph_schema",
        node_id: null,
        worker_id: "worker_schema",
        job_id: null,
        job_kind: "workspace.task",
        job_payload: { sessionId: "ses_schema" },
        scheduled_at: null,
        not_before: null,
        priority: null,
        max_attempts: null,
        retry_policy: null,
        job_idempotency_key: null,
        budget_grant_id: null
      }
    }
  ]
}

function teamRequests() {
  const content = [{ type: "text", id: "part_team_schema", text: "hello" }]
  return [
    {
      command: "put-team-conversation",
      request: {
        id: null,
        principal_id: "owner_schema",
        title: null,
        mode: "hybrid",
        metadata: null,
        idempotency_key: null
      }
    },
    { command: "get-team-conversation", conversation_id: "team_schema" },
    {
      command: "list-team-conversations",
      request: {
        principal_id: null,
        state: "open",
        mode: null,
        limit: null
      }
    },
    {
      command: "update-team-conversation-state",
      request: { conversation_id: "team_schema", state: "paused" }
    },
    {
      command: "set-team-conversation-lead",
      request: {
        conversation_id: "team_schema",
        expected_lead_participant_id: null,
        lead_participant_id: "participant_schema"
      }
    },
    {
      command: "put-team-participant",
      request: {
        id: null,
        conversation_id: "team_schema",
        principal_id: "agent_schema",
        kind: "agent",
        display_name: null,
        role: null,
        agent_session_id: "ses_team_schema",
        metadata: null,
        idempotency_key: null
      }
    },
    {
      command: "list-team-participants",
      request: { conversation_id: "team_schema", state: null }
    },
    {
      command: "update-team-participant-state",
      request: { participant_id: "participant_schema", state: "muted" }
    },
    {
      command: "admit-team-message",
      request: {
        id: null,
        conversation_id: "team_schema",
        author_participant_id: "participant_schema",
        parent_message_id: null,
        kind: "message",
        targets: [{ kind: "all", participant_id: null }],
        content,
        metadata: null,
        idempotency_key: "team-message-schema"
      }
    },
    { command: "get-team-message", message_id: "message_schema" },
    {
      command: "list-team-messages",
      request: {
        conversation_id: "team_schema",
        state: null,
        after_created_at: null,
        after_message_id: null,
        limit: null
      }
    },
    {
      command: "route-team-message",
      request: {
        id: null,
        message_id: "message_schema",
        expected_revision: 1,
        expected_lead_participant_id: null,
        mode: "hybrid",
        outcome: "deliver",
        actor_principal_id: "router_schema",
        reason: "Route the admitted message",
        metadata: null,
        idempotency_key: "team-route-schema",
        deliveries: [{
          id: null,
          target_participant_id: "participant_schema",
          role: "speaker",
          trigger: "mention",
          budget_grant_id: null
        }]
      }
    },
    {
      command: "get-team-routing-decision-by-message",
      message_id: "message_schema"
    },
    {
      command: "list-team-routing-decisions",
      request: {
        conversation_id: "team_schema",
        message_id: null,
        limit: null
      }
    },
    {
      command: "list-team-deliveries",
      request: {
        conversation_id: "team_schema",
        message_id: null,
        routing_decision_id: null,
        state: "queued",
        limit: null
      }
    },
    {
      command: "get-team-discussion-round",
      round_id: "round_schema"
    },
    {
      command: "list-team-discussion-rounds",
      request: {
        conversation_id: "team_schema",
        state: "open",
        after_created_at: null,
        after_round_id: null,
        limit: null
      }
    },
    {
      command: "get-team-delegation-operation",
      operation_id: "team_delegation_operation_schema"
    },
    {
      command: "get-team-delegation-operation-by-tool-execution",
      tool_execution_id: "tool_execution_team_delegation_schema"
    },
    {
      command: "list-team-delegation-tasks",
      operation_id: "team_delegation_operation_schema"
    },
    {
      command: "read-team-conversation-page",
      request: {
        conversation_id: "team_schema",
        before_created_at: null,
        before_message_id: null,
        limit: null
      }
    },
    {
      command: "get-team-delivery-materialization-context",
      delivery_id: "delivery_schema"
    },
    {
      command: "materialize-team-delivery",
      request: {
        delivery_id: "delivery_schema",
        dispatch_job_id: "job_team_delivery_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema",
        execution_binding: {},
        max_steps: null,
        child_priority: null
      }
    },
    {
      command: "fail-team-delivery-materialization",
      request: {
        delivery_id: "delivery_schema",
        dispatch_job_id: "job_team_delivery_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema",
        error: { type: "test", message: "failed" }
      }
    },
    {
      command: "project-team-delivery-outcome",
      request: {
        delivery_id: "delivery_schema",
        outcome_job_id: "job_team_outcome_schema",
        worker_id: "worker_schema",
        lease_token: "lease_schema"
      }
    }
  ]
}

function pluginRequests() {
  return [
    { command: "put-plugin-manifest", request: { id: null, plugin_id: "plugin_schema", version: "1.0.0", name: null, entry: { kind: "process" }, capabilities: ["resource.read"], metadata: null, idempotency_key: null } },
    { command: "get-plugin-manifest", request: { plugin_id: "plugin_schema", version: null } },
    { command: "list-plugin-manifests", request: { state: "registered", capability: null, limit: null } },
    { command: "activate-plugin-install", request: {
      manifest: { id: null, plugin_id: "plugin_schema", version: "1.0.0", name: null, entry: { kind: "process" }, capabilities: ["resource.read"], metadata: null, idempotency_key: null },
      install: { id: null, plugin_id: "plugin_schema", version: "1.0.0", layout: { kind: "layout" }, trust: { status: "allow" }, install_root_dir: "/plugins/plugin_schema", metadata: null, idempotency_key: null }
    } },
    { command: "put-plugin-install", request: { id: null, plugin_id: "plugin_schema", version: "1.0.0", layout: { kind: "layout" }, trust: { status: "allow" }, install_root_dir: "/plugins/plugin_schema", metadata: null, idempotency_key: null } },
    { command: "get-plugin-install", request: { plugin_id: "plugin_schema", version: null } },
    { command: "list-plugin-installs", request: { plugin_id: null, state: "installed", limit: null } },
    { command: "update-plugin-install-state", request: { plugin_id: "plugin_schema", version: "1.0.0", expected_state: "installed", state: "disabled" } },
    { command: "update-plugin-manifest-state", request: { plugin_id: "plugin_schema", version: "1.0.0", state: "disabled" } },
    { command: "get-plugin-action-execution-admission", request: { plugin_id: "plugin_schema", version: "1.0.0", required_capability: "resource.read" } },
    { command: "submit-plugin-action", request: { plugin_id: "plugin_schema", version: "1.0.0", action_id: "run", principal_id: "user_schema", payload: { value: 1 }, required_capability: "resource.read", job_id: null, job_idempotency_key: null, scheduled_at: null, not_before: null, priority: null, max_attempts: null, retry_policy: null, budget_grant_id: null } }
  ]
}

function connectorRequests() {
  return [
    { command: "put-connector-registration", request: { id: null, connector_id: "connector_schema", plugin_id: "plugin_schema", version: null, metadata: null, idempotency_key: null } },
    { command: "list-connector-registrations", request: { connector_id: null, plugin_id: null, state: null, limit: null } },
    { command: "update-connector-registration-state", request: { connector_id: "connector_schema", state: "disabled" } },
    { command: "put-connector-credential", request: { id: null, connector_id: "connector_schema", kind: "token", secret_ref: "secret://connector", metadata: null, idempotency_key: null } },
    { command: "list-connector-credentials", request: { connector_id: null, state: null, limit: null } },
    { command: "revoke-connector-credential", request: { credential_id: "credential_schema" } },
    { command: "start-connector-session", request: { id: null, connector_id: "connector_schema", credential_id: "credential_schema", owner_id: "worker_schema", lease_ms: 60000, state: "connecting", metadata: null, idempotency_key: null } },
    { command: "heartbeat-connector-session", request: { session_id: "connector_session_schema", owner_id: "worker_schema", lease_token: "lease_schema", lease_ms: 60000, state: "connected", metadata: null } },
    { command: "finish-connector-session", request: { session_id: "connector_session_schema", owner_id: "worker_schema", lease_token: "lease_schema", state: "disconnected", metadata: null, error: null } },
    { command: "list-connector-sessions", request: { connector_id: null, state: null, owner_id: null, limit: null } }
  ]
}

function channelRequests() {
  return [
    { command: "put-channel-binding", request: { id: null, connector_id: "connector_schema", channel_kind: "telegram", channel_id: "bot_schema", external_identity_id: "external_schema", principal_id: "user_schema", display_name: null, metadata: null, idempotency_key: null } },
    { command: "list-channel-bindings", request: { connector_id: null, channel_kind: null, channel_id: null, principal_id: null, external_identity_id: null, state: null, limit: null } },
    { command: "revoke-channel-binding", request: { binding_id: "binding_schema" } },
    { command: "ingest-channel-inbound-event", request: { id: null, connector_id: "connector_schema", channel_kind: "telegram", channel_id: "bot_schema", external_event_id: "event_external_schema", external_thread_id: null, sender_external_identity_id: "sender_schema", principal_id: null, payload: { text: "hello" }, metadata: null, received_at: null, idempotency_key: null } },
    { command: "list-channel-inbound-events", request: { connector_id: null, channel_kind: null, channel_id: null, state: "received", after_received_at: null, limit: null } },
    { command: "update-channel-inbound-event-state", request: { event_id: "inbound_schema", state: "projected", metadata: null } },
    { command: "submit-channel-delivery", request: { id: null, connector_id: "connector_schema", channel_kind: "telegram", channel_id: "bot_schema", target_external_identity_id: null, external_thread_id: null, principal_id: "user_schema", payload: { text: "reply" }, metadata: null, job_id: null, idempotency_key: null, scheduled_at: null, not_before: null, priority: null, max_attempts: null, retry_policy: null, budget_grant_id: null } },
    { command: "complete-channel-delivery", request: { delivery_id: "delivery_schema", worker_id: "worker_schema", lease_token: "lease_schema", result: null, metadata: null } },
    { command: "fail-channel-delivery", request: { delivery_id: "delivery_schema", worker_id: "worker_schema", lease_token: "lease_schema", error: { message: "failed" }, metadata: null } },
    { command: "project-channel-inbound-event", request: { id: null, inbound_event_id: "inbound_schema", target: { kind: "ignored", reason: "test" }, metadata: null, idempotency_key: null } },
    { command: "list-channel-projections", request: { inbound_event_id: null, target_kind: "ignored", limit: null } }
  ]
}
