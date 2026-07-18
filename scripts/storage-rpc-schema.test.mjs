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

  it("accepts every sessions command and rejects missing or open control fields", () => {
    for (const [index, request] of sessionsRequests().entries()) {
      expect(
        validateWireEnvelope({
          storage_rpc_version: 1,
          request_id: `rpc_sessions_${index}`,
          request
        }),
        JSON.stringify(validateWireEnvelope.errors)
      ).toBe(true)
    }
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
    const putEpoch = contextRequests()[0]
    const { metadata: _metadata, ...missingMetadata } = putEpoch.request
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_context_missing_metadata",
        request: {
          ...putEpoch,
          request: missingMetadata
        }
      })
    ).toBe(false)
    expect(
      validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: "rpc_context_open_request",
        request: {
          command: "activate-context-epoch",
          request: { epoch_id: "ctx_schema", extra: true }
        }
      })
    ).toBe(false)
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
    const reserve = schedulerRequests()[6]
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
    const enqueue = schedulerRequests()[11]
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
    for (const [index, request] of toolsRequests().entries()) {
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
    const put = planRequests()[0]
    const { metadata: _metadata, ...missingMetadata } = put.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_plan_missing_metadata",
      request: { ...put, request: missingMetadata }
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
    const { metadata: _metadata, ...missingMetadata } = attempt.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_objective_missing_metadata",
      request: { ...attempt, request: missingMetadata }
    })).toBe(false)
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_objective_open_filter",
      request: {
        command: "list-objective-attempts",
        request: {
          objective_id: "objective_schema",
          state: null,
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
    for (const [index, request] of teamRequests().entries()) {
      expect(validateWireEnvelope({
        storage_rpc_version: 1,
        request_id: `rpc_team_${index}`,
        request
      }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const turn = teamRequests()[7]
    const { metadata: _metadata, ...missingMetadata } = turn.request
    expect(validateWireEnvelope({
      storage_rpc_version: 1,
      request_id: "rpc_team_missing_turn_metadata",
      request: { ...turn, request: missingMetadata }
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
      expect(validateWireEnvelope({ storage_rpc_version: 1, request_id: `rpc_plugin_${index}`, request }), JSON.stringify(validateWireEnvelope.errors)).toBe(true)
    }
    const action = pluginRequests()[8]
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
      "storage.channel"
    ]
  }
}

function runtimeRequests() {
  const nullableScope = {
    session_id: null,
    run_id: null,
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
    { command: "get-config", key: "profile" },
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

function sessionsRequests() {
  const content = [{ type: "text", id: "part_schema", text: "hello" }]
  return [
    { command: "create-session", id: null, title: null, kind: null },
    { command: "get-session", id: "ses_schema" },
    {
      command: "list-sessions",
      request: {
        kind: null,
        status: null,
        updated_before: null,
        updated_after: null,
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
      command: "submit-session-run",
      request: {
        id: null,
        session_id: "ses_schema",
        principal_id: "user_schema",
        idempotency_key: "idem_submit_schema",
        input_type: null,
        content,
        origin: null,
        intent: null,
        run_control_policy: null,
        expected_run_id: null,
        job_id: null,
        job_idempotency_key: null,
        mode: null,
        max_steps: null,
        provider_profile_id: null,
        scheduled_at: null,
        not_before: null,
        priority: null,
        max_attempts: null,
        retry_policy: null,
        budget_grant_id: null
      }
    },
    {
      command: "interrupt-session-run",
      request: {
        session_id: "ses_schema",
        run_id: "run_schema",
        reason: "stop",
        principal_id: null,
        idempotency_key: null,
        origin: null,
        metadata: null
      }
    },
    {
      command: "steer-session-run",
      request: {
        session_id: "ses_schema",
        principal_id: "user_schema",
        expected_run_id: "run_schema",
        idempotency_key: "idem_steer_schema",
        content,
        origin: null,
        provider_profile_id: null,
        metadata: null
      }
    },
    {
      command: "list-session-run-controls",
      request: {
        session_id: "ses_schema",
        run_id: null,
        kind: null,
        status: null,
        limit: null
      }
    },
    {
      command: "apply-session-run-control",
      request: {
        session_id: "ses_schema",
        run_id: "run_schema",
        control_id: "control_schema",
        runner_id: "runner_schema",
        lease_token: "lease_schema"
      }
    },
    { command: "list-session-inputs", session_id: "ses_schema" },
    { command: "list-session-messages", session_id: "ses_schema" },
    {
      command: "append-session-message",
      session_id: "ses_schema",
      run_id: "run_schema",
      input_id: "inp_schema",
      runner_id: "runner_schema",
      lease_token: "lease_schema",
      idempotency_key: "message:run_schema:assistant",
      role: "assistant",
      content
    }
  ]
}

function contextRequests() {
  return [
    {
      command: "put-context-epoch",
      request: {
        id: null,
        session_id: "ses_schema",
        policy_version: "policy_schema",
        state: null,
        token_estimate_before: null,
        token_estimate_after: null,
        token_savings: null,
        replacement_count: null,
        metadata: null
      }
    },
    {
      command: "activate-context-epoch",
      request: { epoch_id: "ctx_schema" }
    },
    {
      command: "clone-context-epoch",
      request: { source_epoch_id: "ctx_schema", id: null, metadata: null }
    },
    {
      command: "prune-context-epochs",
      request: {
        session_id: "ses_schema",
        policy_version: "policy_schema",
        keep_last_superseded: null,
        older_than_updated_at: null,
        dry_run: null
      }
    },
    {
      command: "list-context-epochs",
      request: {
        session_id: "ses_schema",
        policy_version: null,
        state: null
      }
    },
    {
      command: "get-active-context-epoch",
      request: { session_id: "ses_schema", policy_version: "policy_schema" }
    },
    {
      command: "put-context-replacement",
      request: {
        id: null,
        epoch_id: "ctx_schema",
        session_id: "ses_schema",
        policy_version: "policy_schema",
        message_id: null,
        part_id: "part_schema",
        tier: "tier1_snip",
        original_token_estimate: 100,
        replacement_token_estimate: 10,
        replacement: { type: "text", id: "part_schema", text: "summary" },
        metadata: null
      }
    },
    {
      command: "list-context-replacements",
      request: {
        session_id: "ses_schema",
        policy_version: null,
        epoch_id: null
      }
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
      command: "claim-runner",
      session_id: "ses_schema",
      runner_id: "runner_schema",
      lease_ms: 60000
    },
    {
      command: "heartbeat-runner",
      session_id: "ses_schema",
      runner_id: "runner_schema",
      lease_token: "lease_schema",
      lease_ms: 60000
    },
    {
      command: "complete-run",
      session_id: "ses_schema",
      run_id: "run_schema",
      input_id: "inp_schema",
      runner_id: "runner_schema",
      lease_token: "lease_schema",
      assistant_message: null
    },
    {
      command: "fail-run",
      session_id: "ses_schema",
      run_id: "run_schema",
      input_id: "inp_schema",
      runner_id: "runner_schema",
      lease_token: "lease_schema",
      error: { message: "failed" }
    },
    {
      command: "release-runner",
      session_id: "ses_schema",
      runner_id: "runner_schema",
      lease_token: "lease_schema"
    },
    {
      command: "cancel-run",
      session_id: "ses_schema",
      run_id: "run_schema",
      input_id: "inp_schema",
      reason: "cancel"
    },
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
        kind: "session.run",
        principal_id: "user_schema",
        payload: { sessionId: "ses_schema" },
        scheduled_at: null,
        not_before: null,
        priority: null,
        max_attempts: null,
        retry_policy: null,
        idempotency_key: null,
        budget_grant_id: null
      }
    },
    {
      command: "claim-job",
      request: { worker_id: "worker_schema", lease_ms: 60000, kinds: null }
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
  return [
    {
      command: "begin-tool-execution",
      request: {
        session_id: "session", run_id: "run", input_id: "input",
        principal_id: "principal", tool_call_id: "call", tool_name: "echo",
        input: { text: "hello" }, descriptor: { name: "echo" },
        permission: { status: "allow" }, idempotency_key: "tool:run:call"
      }
    },
    {
      command: "finish-tool-execution",
      request: { execution_id: "toolx", state: "succeeded", result: { ok: true }, is_error: false, error: null }
    },
    { command: "recover-tool-execution", request: { execution_id: "toolx", action: "retry" } },
    { command: "get-tool-execution", execution_id: "toolx" },
    { command: "list-tool-executions", request: { session_id: null, run_id: "run", state: null, limit: 20 } }
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
  return [
    {
      command: "put-plan-proposal",
      request: {
        id: null,
        principal_id: "user_schema",
        title: null,
        summary: null,
        steps: [],
        references: null,
        metadata: null,
        idempotency_key: null
      }
    },
    { command: "get-plan-proposal", proposal_id: "plan_schema" },
    {
      command: "list-plan-proposals",
      request: {
        principal_id: null,
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
        actor_id: "user_schema",
        reason: null,
        metadata: null
      }
    },
    {
      command: "list-plan-proposal-operations",
      request: { proposal_id: "plan_schema" }
    }
  ]
}

function objectiveRequests() {
  return [
    {
      command: "put-objective-run",
      request: {
        id: null,
        principal_id: "user_schema",
        objective: "Ship the feature",
        scope: null,
        constraints: ["preserve public API"],
        success_criteria: ["tests pass"],
        stop_policy: { maxAttempts: 3, requireVerification: true },
        references: [{ kind: "session", reference_id: "ses_schema" }],
        metadata: null,
        idempotency_key: null
      }
    },
    { command: "get-objective-run", objective_id: "objective_schema" },
    {
      command: "list-objective-runs",
      request: {
        principal_id: null,
        state: "running",
        reference_kind: "session",
        reference_id: "ses_schema",
        limit: null
      }
    },
    {
      command: "record-objective-run-operation",
      request: {
        id: null,
        objective_id: "objective_schema",
        operation: "record_blocked",
        actor_id: "agent_schema",
        reason: null,
        metadata: { source: "schema" }
      }
    },
    {
      command: "list-objective-run-operations",
      request: { objective_id: "objective_schema" }
    },
    {
      command: "put-objective-attempt",
      request: {
        id: null,
        objective_id: "objective_schema",
        attempt_number: null,
        state: "planned",
        session_id: null,
        session_input_id: null,
        session_run_id: null,
        scheduler_job_id: null,
        delegation_graph_id: null,
        plan_proposal_id: null,
        workspace_change_proposal_id: null,
        summary: null,
        result: null,
        error: null,
        metadata: null,
        started_at: null,
        finished_at: null,
        idempotency_key: null
      }
    },
    {
      command: "list-objective-attempts",
      request: { objective_id: "objective_schema", state: null, limit: null }
    },
    {
      command: "put-objective-verification",
      request: {
        id: null,
        objective_id: "objective_schema",
        attempt_id: null,
        kind: "script",
        state: "passed",
        reason: null,
        evidence: { command: "pnpm test", exitCode: 0 },
        verifier_ref: null,
        metadata: null,
        idempotency_key: null
      }
    },
    {
      command: "list-objective-verifications",
      request: {
        objective_id: "objective_schema",
        attempt_id: null,
        state: null,
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
        job_kind: "session.run",
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
      command: "put-team-participant",
      request: {
        id: null,
        conversation_id: "team_schema",
        principal_id: "agent_schema",
        kind: "agent",
        display_name: null,
        role: null,
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
      command: "append-team-turn",
      request: {
        id: null,
        conversation_id: "team_schema",
        speaker_participant_id: "participant_schema",
        audience_participant_ids: null,
        kind: "message",
        content,
        metadata: null
      }
    },
    {
      command: "list-team-turns",
      request: {
        conversation_id: "team_schema",
        after_created_at: null,
        after_turn_id: null,
        limit: null
      }
    }
  ]
}

function pluginRequests() {
  return [
    { command: "put-plugin-manifest", request: { id: null, plugin_id: "plugin_schema", version: "1.0.0", name: null, entry: { kind: "process" }, capabilities: ["resource.read"], metadata: null, idempotency_key: null } },
    { command: "get-plugin-manifest", request: { plugin_id: "plugin_schema", version: null } },
    { command: "list-plugin-manifests", request: { state: "registered", capability: null, limit: null } },
    { command: "put-plugin-install", request: { id: null, plugin_id: "plugin_schema", version: "1.0.0", layout: { kind: "layout" }, trust: { status: "allow" }, install_root_dir: "/plugins/plugin_schema", metadata: null, idempotency_key: null } },
    { command: "get-plugin-install", request: { plugin_id: "plugin_schema", version: null } },
    { command: "list-plugin-installs", request: { plugin_id: null, state: "installed", limit: null } },
    { command: "update-plugin-install-state", request: { plugin_id: "plugin_schema", version: null, state: "disabled" } },
    { command: "update-plugin-manifest-state", request: { plugin_id: "plugin_schema", version: null, state: "disabled" } },
    { command: "submit-plugin-action", request: { plugin_id: "plugin_schema", version: null, action_id: "run", principal_id: "user_schema", payload: { value: 1 }, required_capability: "resource.read", job_id: null, job_idempotency_key: null, scheduled_at: null, not_before: null, priority: null, max_attempts: null, retry_policy: null, budget_grant_id: null } }
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
