use crate::generated::storage_rpc::{
    ChannelStorageRpcCommand, ConnectorStorageRpcCommand, ContextStorageRpcCommand,
    DelegationStorageRpcCommand, MediaGenerationStorageRpcCommand, ObjectiveStorageRpcCommand,
    PlanStorageRpcCommand, PluginStorageRpcCommand, RuntimeStorageRpcCommand,
    SchedulerStorageRpcCommand, SessionsStorageRpcCommand, StorageRpcCommand,
    StorageRpcRequestEnvelope, TeamStorageRpcCommand, ToolsStorageRpcCommand,
    WorkspaceStorageRpcCommand, STORAGE_RPC_SCHEMA_SHA256,
};
use base64::prelude::*;
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{self, BufRead, Read, Write};
use std::path::PathBuf;
use std::sync::OnceLock;
use wanex_system_service::{
    AcceptMediaGenerationOperation, ActivateContextEpoch, ActivatePluginInstall,
    AdmitObjectiveAttempt, AdmitSessionInput, AdmitTeamMessage, AppendSessionMessage,
    ApplySessionTurnControl, AttachDelegationGraphNodeJob, BeginContextEpoch,
    BeginMediaGenerationOperation, BeginProviderInvocation, BeginToolExecution, CancelJob,
    ChangeObjectiveState, ClaimJob, CleanupExpiredResourceTickets, CommitBudget,
    CompleteChannelDelivery, CompleteJob, CompleteMediaGenerationOperation,
    ContextEpochMutationIdentity, CreateObjective, CreatePlanProposal, DeferToolExecution,
    EnqueueJob, ExecuteApprovedPlan, FailChannelDelivery, FailJob, FailTeamDeliveryMaterialization,
    FinishConnectorSession, FinishContextEpochGeneration, FinishProviderInvocation,
    FinishToolExecution, GetActiveContextEpoch, GetDelegationGraphNode, GetJob,
    GetMediaGenerationOperation, GetPluginActionExecutionAdmission, GetPluginInstall,
    GetPluginManifest, GetToolExecutionByCall, HeartbeatConnectorSession, HeartbeatJob,
    IngestChannelInboundEvent, IngestResource, InterruptSessionTurn, ListChannelBindings,
    ListChannelInboundEvents, ListChannelProjections, ListConnectorCredentials,
    ListConnectorRegistrations, ListConnectorSessions, ListContextEpochs,
    ListDelegationGraphDependencies, ListDelegationGraphNodes, ListDelegationGraphs, ListJobs,
    ListMediaGenerationOperations, ListObjectiveAttemptReviews, ListObjectiveAttempts,
    ListObjectiveVerifications, ListObjectives, ListPlanProposalOperations, ListPlanProposals,
    ListPluginInstalls, ListPluginManifests, ListProviderInvocations,
    ListReadyDelegationGraphNodes, ListResourceProvenance, ListResources, ListSessionAttempts,
    ListSessionTurnControls, ListSessionTurns, ListSessions, ListTeamConversations,
    ListTeamDeliveries, ListTeamDiscussionRounds, ListTeamMessages, ListTeamParticipants,
    ListTeamRoutingDecisions, ListToolActivities, ListToolExecutionAttempts, ListToolExecutions,
    ListWorkspaceChangeOperations, ListWorkspaceChangeProposalOperations,
    ListWorkspaceChangeProposals, ListWorkspaceChangeSets, MarkContextEpochOutputObserved,
    MarkProviderInvocationOutput, MaterializeReadyDelegationGraphNode, MaterializeTeamDelivery,
    ProjectChannelInboundEvent, ProjectTeamDeliveryOutcome, PruneContextEpochs, PutChannelBinding,
    PutConnectorCredential, PutConnectorRegistration, PutDelegationGraph,
    PutDelegationGraphDependency, PutDelegationGraphNode, PutPluginInstall, PutPluginManifest,
    PutTeamConversation, PutTeamParticipant, PutWorkspaceChangeProposal, PutWorkspaceChangeSet,
    QueryEvents, ReadTeamConversationPage, ReconcileObjectiveCancellation, RecordBudgetUsage,
    RecordMediaGenerationOutputs, RecordPlanProposalOperation, RecordResourceProvenance,
    RecordWorkspaceChangeOperation, RecordWorkspaceChangeProposalOperation, RenameSession,
    RequestMediaGenerationCancel, RequestObjectiveCancel, RequestSessionTurnCancel,
    RequireToolExecutionRecovery, ReserveBudget, ResolveToolExecutionApproval,
    ResolveToolExecutionRecovery, ResourceCapability, ReviewObjectiveAttempt, RevokeChannelBinding,
    RevokeConnectorCredential, RouteTeamMessage, RuntimeEvent, SessionStateTransition,
    SetTeamConversationLead, SettleMediaGenerationOperation, SettleSessionTurn,
    StartConnectorSession, StartSessionTurnAttempt, SteerSessionTurn, SubmitChannelDelivery,
    SubmitMediaGenerationOperation, SubmitPluginAction, SubmitSessionTurn,
    SuspendMediaGenerationOperation, SystemService, SystemServiceError,
    UpdateChannelInboundEventState, UpdateConnectorRegistrationState,
    UpdateDelegationGraphNodeState, UpdateDelegationGraphState, UpdatePluginInstallState,
    UpdatePluginManifestState, UpdateTeamConversationState, UpdateTeamParticipantState,
};

const STORAGE_RPC_VERSION: i64 = 1;
const STORAGE_RPC_SCHEMA: &str =
    include_str!("../../../schemas/storage-rpc/storage-rpc.schema.json");
static STORAGE_RPC_PRESENCE_SCHEMA: OnceLock<Result<StorageRpcPresenceSchema, String>> =
    OnceLock::new();

struct StorageRpcPresenceSchema {
    schema: Value,
    command_definitions: HashMap<String, String>,
}

pub struct RpcOutput {
    pub response: Value,
    pub ok: bool,
}

enum ParsedRequest {
    Describe {
        request_id: String,
    },
    Runtime {
        request_id: String,
        request: RuntimeStorageRpcCommand,
    },
    Sessions {
        request_id: String,
        request: SessionsStorageRpcCommand,
    },
    Context {
        request_id: String,
        request: ContextStorageRpcCommand,
    },
    Scheduler {
        request_id: String,
        request: SchedulerStorageRpcCommand,
    },
    Tools {
        request_id: String,
        request: ToolsStorageRpcCommand,
    },
    Workspace {
        request_id: String,
        request: WorkspaceStorageRpcCommand,
    },
    Plan {
        request_id: String,
        request: PlanStorageRpcCommand,
    },
    Objective {
        request_id: String,
        request: ObjectiveStorageRpcCommand,
    },
    Delegation {
        request_id: String,
        request: DelegationStorageRpcCommand,
    },
    Team {
        request_id: String,
        request: TeamStorageRpcCommand,
    },
    Plugin {
        request_id: String,
        request: PluginStorageRpcCommand,
    },
    Connector {
        request_id: String,
        request: ConnectorStorageRpcCommand,
    },
    Channel {
        request_id: String,
        request: ChannelStorageRpcCommand,
    },
    MediaGeneration {
        request_id: String,
        request: MediaGenerationStorageRpcCommand,
    },
}

struct ProtocolFailure {
    request_id: Option<String>,
    code: &'static str,
    message: String,
}

pub fn run_once(store_dir: PathBuf) -> RpcOutput {
    match read_request().and_then(parse_request_envelope) {
        Ok(ParsedRequest::Describe { request_id }) => {
            success_response(request_id, protocol_descriptor())
        }
        Ok(ParsedRequest::Runtime {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_runtime_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Sessions {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_sessions_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Context {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_context_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Scheduler {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_scheduler_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Tools {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_tools_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Workspace {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_workspace_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Plan {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_plan_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Objective {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_objective_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Delegation {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_delegation_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Team {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_team_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Plugin {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_plugin_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Connector {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_connector_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::Channel {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_channel_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Ok(ParsedRequest::MediaGeneration {
            request_id,
            request,
        }) => {
            let result = SystemService::open(store_dir)
                .and_then(|service| handle_media_generation_request(&service, request));
            response_for_result(Some(request_id), result)
        }
        Err(error) => protocol_error_response(error),
    }
}

pub fn run_serve(store_dir: PathBuf) -> Result<(), SystemServiceError> {
    let service = SystemService::open(store_dir)?;
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let response = match parse_request_envelope(line) {
            Ok(ParsedRequest::Describe { request_id }) => {
                success_response(request_id, protocol_descriptor())
            }
            Ok(ParsedRequest::Runtime {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_runtime_request(&service, request)),
            Ok(ParsedRequest::Sessions {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_sessions_request(&service, request)),
            Ok(ParsedRequest::Context {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_context_request(&service, request)),
            Ok(ParsedRequest::Scheduler {
                request_id,
                request,
            }) => response_for_result(
                Some(request_id),
                handle_scheduler_request(&service, request),
            ),
            Ok(ParsedRequest::Tools {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_tools_request(&service, request)),
            Ok(ParsedRequest::Workspace {
                request_id,
                request,
            }) => response_for_result(
                Some(request_id),
                handle_workspace_request(&service, request),
            ),
            Ok(ParsedRequest::Plan {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_plan_request(&service, request)),
            Ok(ParsedRequest::Objective {
                request_id,
                request,
            }) => response_for_result(
                Some(request_id),
                handle_objective_request(&service, request),
            ),
            Ok(ParsedRequest::Delegation {
                request_id,
                request,
            }) => response_for_result(
                Some(request_id),
                handle_delegation_request(&service, request),
            ),
            Ok(ParsedRequest::Team {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_team_request(&service, request)),
            Ok(ParsedRequest::Plugin {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_plugin_request(&service, request)),
            Ok(ParsedRequest::Connector {
                request_id,
                request,
            }) => response_for_result(
                Some(request_id),
                handle_connector_request(&service, request),
            ),
            Ok(ParsedRequest::Channel {
                request_id,
                request,
            }) => response_for_result(Some(request_id), handle_channel_request(&service, request)),
            Ok(ParsedRequest::MediaGeneration {
                request_id,
                request,
            }) => response_for_result(
                Some(request_id),
                handle_media_generation_request(&service, request),
            ),
            Err(error) => protocol_error_response(error),
        };
        writeln!(
            stdout,
            "{}",
            serde_json::to_string(&response.response).expect("response should serialize")
        )?;
        stdout.flush()?;
    }
    Ok(())
}

pub fn response_for_result(
    request_id: Option<String>,
    result: Result<Value, SystemServiceError>,
) -> RpcOutput {
    match result {
        Ok(value) => success_response(
            request_id.expect("successful RPC response must have request id"),
            value,
        ),
        Err(error) => RpcOutput {
            response: serde_json::json!({
                "storage_rpc_version": STORAGE_RPC_VERSION,
                "request_id": request_id,
                "ok": false,
                "error": {
                    "code": error_code(&error),
                    "message": error.to_string(),
                }
            }),
            ok: false,
        },
    }
}

fn success_response(request_id: String, value: Value) -> RpcOutput {
    RpcOutput {
        response: serde_json::json!({
            "storage_rpc_version": STORAGE_RPC_VERSION,
            "request_id": request_id,
            "ok": true,
            "value": value,
        }),
        ok: true,
    }
}

fn protocol_error_response(error: ProtocolFailure) -> RpcOutput {
    RpcOutput {
        response: serde_json::json!({
            "storage_rpc_version": STORAGE_RPC_VERSION,
            "request_id": error.request_id,
            "ok": false,
            "error": {
                "code": error.code,
                "message": error.message,
            },
        }),
        ok: false,
    }
}

fn protocol_descriptor() -> Value {
    serde_json::json!({
        "selected_version": STORAGE_RPC_VERSION,
        "supported_versions": [STORAGE_RPC_VERSION],
        "service_version": env!("CARGO_PKG_VERSION"),
        "schema_sha256": STORAGE_RPC_SCHEMA_SHA256,
        "capabilities": [
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
    })
}

fn handle_runtime_request(
    service: &SystemService,
    request: RuntimeStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        RuntimeStorageRpcCommand::AppendEventCommand(command) => {
            let event = command.event;
            let runtime_event = RuntimeEvent {
                id: event.id,
                event_type: event.type_,
                scope: project_wire(event.scope)?,
                payload: project_wire(event.payload)?,
                occurred_at: event.occurred_at,
            };
            service.append_event(&runtime_event)?;
            Ok(Value::Null)
        }
        RuntimeStorageRpcCommand::QueryEventsCommand(command) => {
            let query: QueryEvents = project_wire(command.query)?;
            serde_json::to_value(service.query_events(query)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::PutConfigCommand(command) => {
            let value = project_wire(command.value)?;
            service.put_config(&command.key, &value)?;
            Ok(Value::Null)
        }
        RuntimeStorageRpcCommand::ApplyConfigMutationsCommand(command) => {
            let puts = command
                .puts
                .into_iter()
                .map(|entry| {
                    let value: Value = project_wire(entry.value)?;
                    Ok((String::from(entry.key), value))
                })
                .collect::<Result<Vec<_>, SystemServiceError>>()?;
            let deletes = command
                .deletes
                .into_iter()
                .map(String::from)
                .collect::<Vec<_>>();
            service.apply_config_mutations(&puts, &deletes)?;
            Ok(Value::Null)
        }
        RuntimeStorageRpcCommand::HasLiveSecretReferenceCommand(command) => Ok(Value::Bool(
            service.has_live_secret_reference(&String::from(command.secret_ref))?,
        )),
        RuntimeStorageRpcCommand::GetConfigCommand(command) => {
            serde_json::to_value(service.get_config(&command.key)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::WriteAtomicFileCommand(command) => {
            let content = decode_base64(&command.content_base64)?;
            serde_json::to_value(service.write_atomic_file(
                &command.logical_path,
                &content,
                command.expected_sha256.0.as_deref(),
            )?)
            .map_err(Into::into)
        }
        RuntimeStorageRpcCommand::IngestResourceCommand(command) => {
            let request = command.request;
            let ingest = IngestResource {
                id: request.id.0,
                logical_path: request.logical_path.0,
                content: decode_base64(&request.content_base64)?,
                media_type: request.media_type.0,
                kind: request.kind.0.map(|value| value.to_string()),
                origin: request.origin.0.map(|value| value.to_string()),
                label: request.label.0,
                source: project_wire(request.source)?,
                metadata: project_wire(request.metadata)?,
                width: request.width.0,
                height: request.height.0,
                duration_ms: request.duration_ms.0,
                expected_sha256: request.expected_sha256.0,
            };
            serde_json::to_value(service.ingest_resource(&ingest)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::GetResourceCommand(command) => {
            serde_json::to_value(service.get_resource(&command.resource_id)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::ReadResourceContentCommand(command) => {
            let chunk = service.read_resource_content(
                &command.resource_id,
                &command.expected_sha256,
                command.offset,
                command.limit.get(),
            )?;
            match chunk {
                None => Ok(Value::Null),
                Some(chunk) => Ok(serde_json::json!({
                    "resource_id": chunk.resource_id,
                    "sha256": chunk.sha256,
                    "total_size_bytes": chunk.total_size_bytes,
                    "offset": chunk.offset,
                    "content_base64": BASE64_STANDARD.encode(chunk.content),
                    "eof": chunk.eof
                })),
            }
        }
        RuntimeStorageRpcCommand::ListResourcesCommand(command) => {
            let request: ListResources = project_wire(command.request)?;
            serde_json::to_value(service.list_resources(&request)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::CreateResourceTicketCommand(command) => {
            let capability: ResourceCapability = project_wire(command.capability)?;
            serde_json::to_value(service.create_resource_ticket(
                &command.principal_id,
                &command.resource_id,
                capability,
                command.expires_at,
            )?)
            .map_err(Into::into)
        }
        RuntimeStorageRpcCommand::CleanupExpiredResourceTicketsCommand(command) => {
            let request: CleanupExpiredResourceTickets = project_wire(command.request)?;
            serde_json::to_value(service.cleanup_expired_resource_tickets(&request)?)
                .map_err(Into::into)
        }
        RuntimeStorageRpcCommand::RecordResourceProvenanceCommand(command) => {
            let request: RecordResourceProvenance = project_wire(command.request)?;
            serde_json::to_value(service.record_resource_provenance(&request)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::ListResourceProvenanceCommand(command) => {
            let request: ListResourceProvenance = project_wire(command.request)?;
            serde_json::to_value(service.list_resource_provenance(&request)?).map_err(Into::into)
        }
        RuntimeStorageRpcCommand::DoctorCommand(_) => {
            serde_json::to_value(service.doctor()?).map_err(Into::into)
        }
    }
}

fn handle_media_generation_request(
    service: &SystemService,
    request: MediaGenerationStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        MediaGenerationStorageRpcCommand::SubmitMediaGenerationCommand(command) => {
            let request: SubmitMediaGenerationOperation = project_wire(command.request)?;
            serde_json::to_value(service.submit_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::BeginMediaGenerationCommand(command) => {
            let request: BeginMediaGenerationOperation = project_wire(command.request)?;
            serde_json::to_value(service.begin_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::AcceptMediaGenerationCommand(command) => {
            let request: AcceptMediaGenerationOperation = project_wire(command.request)?;
            serde_json::to_value(service.accept_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::SuspendMediaGenerationCommand(command) => {
            let request: SuspendMediaGenerationOperation = project_wire(command.request)?;
            serde_json::to_value(service.suspend_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::RecordMediaGenerationOutputsCommand(command) => {
            let request: RecordMediaGenerationOutputs = project_wire(command.request)?;
            serde_json::to_value(service.record_media_generation_outputs(&request)?)
                .map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::CompleteMediaGenerationCommand(command) => {
            let request: CompleteMediaGenerationOperation = project_wire(command.request)?;
            serde_json::to_value(service.complete_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::SettleMediaGenerationCommand(command) => {
            let request: SettleMediaGenerationOperation = project_wire(command.request)?;
            serde_json::to_value(service.settle_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::RequestMediaGenerationCancelCommand(command) => {
            let request: RequestMediaGenerationCancel = project_wire(command.request)?;
            serde_json::to_value(service.request_media_generation_cancel(&request)?)
                .map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::GetMediaGenerationCommand(command) => {
            let request = GetMediaGenerationOperation {
                operation_id: command.operation_id,
            };
            serde_json::to_value(service.get_media_generation(&request)?).map_err(Into::into)
        }
        MediaGenerationStorageRpcCommand::ListMediaGenerationCommand(command) => {
            let request: ListMediaGenerationOperations = project_wire(command.request)?;
            serde_json::to_value(service.list_media_generations(&request)?).map_err(Into::into)
        }
    }
}

fn handle_sessions_request(
    service: &SystemService,
    request: SessionsStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        SessionsStorageRpcCommand::CreateSessionCommand(command) => {
            let kind = command.kind.0.map(|value| value.to_string());
            serde_json::to_value(service.create_session(
                command.id.0.as_deref(),
                command.title.0.as_deref(),
                kind.as_deref(),
            )?)
            .map_err(Into::into)
        }
        SessionsStorageRpcCommand::GetSessionCommand(command) => {
            serde_json::to_value(service.get_session(&command.id)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::ListSessionsCommand(command) => {
            let request: ListSessions = project_wire(command.request)?;
            serde_json::to_value(service.list_sessions(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::RenameSessionCommand(command) => {
            let request: RenameSession = project_wire(command.request)?;
            serde_json::to_value(service.rename_session(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::ArchiveSessionCommand(command) => {
            let request: SessionStateTransition = project_wire(command.request)?;
            serde_json::to_value(service.archive_session(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::RestoreSessionCommand(command) => {
            let request: SessionStateTransition = project_wire(command.request)?;
            serde_json::to_value(service.restore_session(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::AdmitSessionInputCommand(command) => {
            let request = AdmitSessionInput {
                id: command.id.0,
                session_id: command.session_id,
                principal_id: command.principal_id,
                idempotency_key: command.idempotency_key,
                input_type: Some(command.input_type.to_string()),
                content: project_wire(command.content)?,
                origin: project_wire(command.origin)?,
                intent: command.intent.0.map(|value| value.to_string()),
            };
            serde_json::to_value(service.admit_session_input(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::SubmitSessionTurnCommand(command) => {
            let request: SubmitSessionTurn = project_wire(command.request)?;
            serde_json::to_value(service.submit_session_turn(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::StartSessionTurnAttemptCommand(command) => {
            let request: StartSessionTurnAttempt = project_wire(command.request)?;
            serde_json::to_value(service.start_session_turn_attempt(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::SettleSessionTurnCommand(command) => {
            let request: SettleSessionTurn = project_wire(command.request)?;
            serde_json::to_value(service.settle_session_turn(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::BeginProviderInvocationCommand(command) => {
            let request: BeginProviderInvocation = project_wire(command.request)?;
            serde_json::to_value(service.begin_provider_invocation(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::MarkProviderInvocationOutputCommand(command) => {
            let request: MarkProviderInvocationOutput = project_wire(command.request)?;
            serde_json::to_value(service.mark_provider_invocation_output(&request)?)
                .map_err(Into::into)
        }
        SessionsStorageRpcCommand::FinishProviderInvocationCommand(command) => {
            let request: FinishProviderInvocation = project_wire(command.request)?;
            serde_json::to_value(service.finish_provider_invocation(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::ListProviderInvocationsCommand(command) => {
            let request: ListProviderInvocations = project_wire(command.request)?;
            serde_json::to_value(service.list_provider_invocations(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::RequestSessionTurnCancelCommand(command) => {
            let request: RequestSessionTurnCancel = project_wire(command.request)?;
            serde_json::to_value(service.request_session_turn_cancel(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::InterruptSessionTurnCommand(command) => {
            let request: InterruptSessionTurn = project_wire(command.request)?;
            serde_json::to_value(service.interrupt_session_turn(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::SteerSessionTurnCommand(command) => {
            let request: SteerSessionTurn = project_wire(command.request)?;
            serde_json::to_value(service.steer_session_turn(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::ListSessionTurnControlsCommand(command) => {
            let request: ListSessionTurnControls = project_wire(command.request)?;
            serde_json::to_value(service.list_session_turn_controls(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::ApplySessionTurnControlCommand(command) => {
            let request: ApplySessionTurnControl = project_wire(command.request)?;
            serde_json::to_value(service.apply_session_turn_control(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::ListSessionInputsCommand(command) => {
            let status = command.status.0.map(|value| value.to_string());
            let limit = optional_positive_i64(command.limit, "session input limit")?;
            serde_json::to_value(service.list_session_input_window(
                &command.session_id,
                status.as_deref(),
                limit,
            )?)
            .map_err(Into::into)
        }
        SessionsStorageRpcCommand::ListSessionMessagesCommand(command) => {
            if command.turn_ids.is_some()
                && (command.before_sequence.is_some() || command.limit.is_some())
            {
                return Err(SystemServiceError::InvalidInput(
                    "session message turn_ids and window filters are mutually exclusive"
                        .to_string(),
                ));
            }
            if let Some(turn_ids) = command.turn_ids {
                let turn_ids = turn_ids.into_iter().map(Into::into).collect::<Vec<_>>();
                return serde_json::to_value(
                    service.list_session_messages_by_turn_ids(&command.session_id, &turn_ids)?,
                )
                .map_err(Into::into);
            }
            let before_sequence =
                optional_positive_i64(command.before_sequence, "session message before_sequence")?;
            let limit = optional_positive_i64(command.limit, "session message limit")?;
            serde_json::to_value(service.list_session_message_window(
                &command.session_id,
                before_sequence,
                limit,
            )?)
            .map_err(Into::into)
        }
        SessionsStorageRpcCommand::ListSessionTurnsCommand(command) => {
            if command.state.0.is_some() && command.turn_ids.is_some() {
                return Err(SystemServiceError::InvalidInput(
                    "session turn state and turn_ids filters are mutually exclusive".to_string(),
                ));
            }
            match command.turn_ids {
                Some(turn_ids) => {
                    let turn_ids = turn_ids.into_iter().map(Into::into).collect::<Vec<_>>();
                    serde_json::to_value(
                        service.list_session_turns_by_ids(&command.session_id, &turn_ids)?,
                    )
                    .map_err(Into::into)
                }
                None => {
                    let request = ListSessionTurns {
                        session_id: command.session_id,
                        state: command.state.0.map(|state| state.to_string()),
                    };
                    serde_json::to_value(service.list_session_turns(&request)?).map_err(Into::into)
                }
            }
        }
        SessionsStorageRpcCommand::ListSessionAttemptsCommand(command) => {
            let request = ListSessionAttempts {
                turn_id: command.turn_id,
            };
            serde_json::to_value(service.list_session_attempts(&request)?).map_err(Into::into)
        }
        SessionsStorageRpcCommand::AppendSessionMessageCommand(command) => {
            let request = AppendSessionMessage {
                session_id: command.session_id,
                turn_id: command.turn_id,
                attempt_id: command.attempt_id,
                input_id: command.input_id,
                job_id: command.job_id,
                worker_id: command.worker_id,
                lease_token: command.lease_token,
                idempotency_key: command.idempotency_key,
                role: command.role.to_string(),
                content: project_wire(command.content)?,
                provider_state: project_wire(command.provider_state)?,
            };
            serde_json::to_value(service.append_session_message(&request)?).map_err(Into::into)
        }
    }
}

fn handle_context_request(
    service: &SystemService,
    request: ContextStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        ContextStorageRpcCommand::BeginContextEpochCommand(command) => {
            let request: BeginContextEpoch = project_wire(command.request)?;
            serde_json::to_value(service.begin_context_epoch(&request)?).map_err(Into::into)
        }
        ContextStorageRpcCommand::MarkContextEpochDispatchedCommand(command) => {
            let request: ContextEpochMutationIdentity = project_wire(command.request)?;
            serde_json::to_value(service.mark_context_epoch_dispatched(&request)?)
                .map_err(Into::into)
        }
        ContextStorageRpcCommand::MarkContextEpochOutputObservedCommand(command) => {
            let request: MarkContextEpochOutputObserved = project_wire(command.request)?;
            serde_json::to_value(service.mark_context_epoch_output_observed(&request)?)
                .map_err(Into::into)
        }
        ContextStorageRpcCommand::FinishContextEpochGenerationCommand(command) => {
            let request: FinishContextEpochGeneration = project_wire(command.request)?;
            serde_json::to_value(service.finish_context_epoch_generation(&request)?)
                .map_err(Into::into)
        }
        ContextStorageRpcCommand::ActivateContextEpochCommand(command) => {
            let request: ActivateContextEpoch = project_wire(command.request)?;
            serde_json::to_value(service.activate_context_epoch(&request)?).map_err(Into::into)
        }
        ContextStorageRpcCommand::PruneContextEpochsCommand(command) => {
            let request: PruneContextEpochs = project_wire(command.request)?;
            serde_json::to_value(service.prune_context_epochs(&request)?).map_err(Into::into)
        }
        ContextStorageRpcCommand::ListContextEpochsCommand(command) => {
            let request: ListContextEpochs = project_wire(command.request)?;
            serde_json::to_value(service.list_context_epochs(&request)?).map_err(Into::into)
        }
        ContextStorageRpcCommand::GetActiveContextEpochCommand(command) => {
            let request: GetActiveContextEpoch = project_wire(command.request)?;
            serde_json::to_value(service.get_active_context_epoch(&request)?).map_err(Into::into)
        }
    }
}

fn handle_scheduler_request(
    service: &SystemService,
    request: SchedulerStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        SchedulerStorageRpcCommand::ReserveBudgetCommand(command) => {
            let request: ReserveBudget = project_wire(command.request)?;
            serde_json::to_value(service.reserve_budget(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::CommitBudgetCommand(command) => {
            let request: CommitBudget = project_wire(command.request)?;
            serde_json::to_value(service.commit_budget(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::RecordBudgetUsageCommand(command) => {
            let request: RecordBudgetUsage = project_wire(command.request)?;
            serde_json::to_value(service.record_budget_usage(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::ReleaseBudgetCommand(command) => {
            serde_json::to_value(service.release_budget(&command.grant_id)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::GetBudgetScopeCommand(command) => {
            serde_json::to_value(service.get_budget_scope(&command.scope_id)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::ListBudgetGrantsCommand(command) => {
            serde_json::to_value(service.list_budget_grants(&command.scope_id)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::EnqueueJobCommand(command) => {
            let request: EnqueueJob = project_wire(command.request)?;
            serde_json::to_value(service.enqueue_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::ClaimJobCommand(command) => {
            let request: ClaimJob = project_wire(command.request)?;
            serde_json::to_value(service.claim_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::HeartbeatJobCommand(command) => {
            let request: HeartbeatJob = project_wire(command.request)?;
            serde_json::to_value(service.heartbeat_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::CompleteJobCommand(command) => {
            let request: CompleteJob = project_wire(command.request)?;
            serde_json::to_value(service.complete_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::FailJobCommand(command) => {
            let request: FailJob = project_wire(command.request)?;
            serde_json::to_value(service.fail_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::CancelJobCommand(command) => {
            let request: CancelJob = project_wire(command.request)?;
            serde_json::to_value(service.cancel_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::GetJobCommand(command) => {
            let request: GetJob = project_wire(command.request)?;
            serde_json::to_value(service.get_job(&request)?).map_err(Into::into)
        }
        SchedulerStorageRpcCommand::ListJobsCommand(command) => {
            let request: ListJobs = project_wire(command.request)?;
            serde_json::to_value(service.list_jobs(&request)?).map_err(Into::into)
        }
    }
}

fn handle_tools_request(
    service: &SystemService,
    request: ToolsStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        ToolsStorageRpcCommand::BeginToolExecutionCommand(command) => {
            let request: BeginToolExecution = project_wire(command.request)?;
            serde_json::to_value(service.begin_tool_execution(&request)?).map_err(Into::into)
        }
        ToolsStorageRpcCommand::DeferToolExecutionCommand(command) => {
            let request: DeferToolExecution = project_wire(command.request)?;
            serde_json::to_value(service.defer_tool_execution(&request)?).map_err(Into::into)
        }
        ToolsStorageRpcCommand::FinishToolExecutionCommand(command) => {
            let request: FinishToolExecution = project_wire(command.request)?;
            serde_json::to_value(service.finish_tool_execution(&request)?).map_err(Into::into)
        }
        ToolsStorageRpcCommand::RequireToolExecutionRecoveryCommand(command) => {
            let request: RequireToolExecutionRecovery = project_wire(command.request)?;
            serde_json::to_value(service.require_tool_execution_recovery(&request)?)
                .map_err(Into::into)
        }
        ToolsStorageRpcCommand::ResolveToolExecutionRecoveryCommand(command) => {
            let request: ResolveToolExecutionRecovery = project_wire(command.request)?;
            serde_json::to_value(service.resolve_tool_execution_recovery(&request)?)
                .map_err(Into::into)
        }
        ToolsStorageRpcCommand::ResolveToolExecutionApprovalCommand(command) => {
            let request: ResolveToolExecutionApproval = project_wire(command.request)?;
            serde_json::to_value(service.resolve_tool_execution_approval(&request)?)
                .map_err(Into::into)
        }
        ToolsStorageRpcCommand::GetToolExecutionCommand(command) => {
            serde_json::to_value(service.get_tool_execution(&command.execution_id)?)
                .map_err(Into::into)
        }
        ToolsStorageRpcCommand::GetToolExecutionByCallCommand(command) => {
            let request: GetToolExecutionByCall = project_wire(command.request)?;
            serde_json::to_value(service.get_tool_execution_by_call(&request)?).map_err(Into::into)
        }
        ToolsStorageRpcCommand::ListToolExecutionsCommand(command) => {
            let request: ListToolExecutions = project_wire(command.request)?;
            serde_json::to_value(service.list_tool_executions(&request)?).map_err(Into::into)
        }
        ToolsStorageRpcCommand::ListToolActivitiesCommand(command) => {
            let request: ListToolActivities = project_wire(command.request)?;
            serde_json::to_value(service.list_tool_activities(&request)?).map_err(Into::into)
        }
        ToolsStorageRpcCommand::ListToolExecutionAttemptsCommand(command) => {
            let request: ListToolExecutionAttempts = project_wire(command.request)?;
            serde_json::to_value(service.list_tool_execution_attempts(&request)?)
                .map_err(Into::into)
        }
    }
}

fn handle_workspace_request(
    service: &SystemService,
    request: WorkspaceStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        WorkspaceStorageRpcCommand::PutWorkspaceChangeSetCommand(command) => {
            let request: PutWorkspaceChangeSet = project_wire(command.request)?;
            serde_json::to_value(service.put_workspace_changeset(&request)?).map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::GetWorkspaceChangeSetCommand(command) => {
            serde_json::to_value(service.get_workspace_changeset(&command.change_set_id)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::ListWorkspaceChangeSetsCommand(command) => {
            let request: ListWorkspaceChangeSets = project_wire(command.request)?;
            serde_json::to_value(service.list_workspace_changesets(&request)?).map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::RecordWorkspaceChangeOperationCommand(command) => {
            let request: RecordWorkspaceChangeOperation = project_wire(command.request)?;
            serde_json::to_value(service.record_workspace_change_operation(&request)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::ListWorkspaceChangeOperationsCommand(command) => {
            let request: ListWorkspaceChangeOperations = project_wire(command.request)?;
            serde_json::to_value(service.list_workspace_change_operations(&request)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::PutWorkspaceChangeProposalCommand(command) => {
            let request: PutWorkspaceChangeProposal = project_wire(command.request)?;
            serde_json::to_value(service.put_workspace_change_proposal(&request)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::GetWorkspaceChangeProposalCommand(command) => {
            serde_json::to_value(service.get_workspace_change_proposal(&command.proposal_id)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::ListWorkspaceChangeProposalsCommand(command) => {
            let request: ListWorkspaceChangeProposals = project_wire(command.request)?;
            serde_json::to_value(service.list_workspace_change_proposals(&request)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::RecordWorkspaceChangeProposalOperationCommand(command) => {
            let request: RecordWorkspaceChangeProposalOperation = project_wire(command.request)?;
            serde_json::to_value(service.record_workspace_change_proposal_operation(&request)?)
                .map_err(Into::into)
        }
        WorkspaceStorageRpcCommand::ListWorkspaceChangeProposalOperationsCommand(command) => {
            let request: ListWorkspaceChangeProposalOperations = project_wire(command.request)?;
            serde_json::to_value(service.list_workspace_change_proposal_operations(&request)?)
                .map_err(Into::into)
        }
    }
}

fn handle_plan_request(
    service: &SystemService,
    request: PlanStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        PlanStorageRpcCommand::CreatePlanProposalCommand(command) => {
            let request: CreatePlanProposal = project_wire(command.request)?;
            serde_json::to_value(service.create_plan_proposal(&request)?).map_err(Into::into)
        }
        PlanStorageRpcCommand::GetPlanProposalCommand(command) => {
            serde_json::to_value(service.get_plan_proposal(&command.proposal_id)?)
                .map_err(Into::into)
        }
        PlanStorageRpcCommand::ListPlanProposalsCommand(command) => {
            let request: ListPlanProposals = project_wire(command.request)?;
            serde_json::to_value(service.list_plan_proposals(&request)?).map_err(Into::into)
        }
        PlanStorageRpcCommand::RecordPlanProposalOperationCommand(command) => {
            let request: RecordPlanProposalOperation = project_wire(command.request)?;
            serde_json::to_value(service.record_plan_proposal_operation(&request)?)
                .map_err(Into::into)
        }
        PlanStorageRpcCommand::ExecuteApprovedPlanCommand(command) => {
            let request: ExecuteApprovedPlan = project_wire(command.request)?;
            serde_json::to_value(service.execute_approved_plan(&request)?).map_err(Into::into)
        }
        PlanStorageRpcCommand::ListPlanProposalOperationsCommand(command) => {
            let request: ListPlanProposalOperations = project_wire(command.request)?;
            serde_json::to_value(service.list_plan_proposal_operations(&request)?)
                .map_err(Into::into)
        }
    }
}

fn handle_objective_request(
    service: &SystemService,
    request: ObjectiveStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        ObjectiveStorageRpcCommand::CreateObjectiveCommand(command) => {
            let request: CreateObjective = project_wire(command.request)?;
            serde_json::to_value(service.create_objective(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::GetObjectiveCommand(command) => {
            serde_json::to_value(service.get_objective(&command.objective_id)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ListObjectivesCommand(command) => {
            let request: ListObjectives = project_wire(command.request)?;
            serde_json::to_value(service.list_objectives(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::PauseObjectiveCommand(command) => {
            let request: ChangeObjectiveState = project_wire(command.request)?;
            serde_json::to_value(service.pause_objective(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ResumeObjectiveCommand(command) => {
            let request: ChangeObjectiveState = project_wire(command.request)?;
            serde_json::to_value(service.resume_objective(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::AdmitObjectiveAttemptCommand(command) => {
            let request: AdmitObjectiveAttempt = project_wire(command.request)?;
            serde_json::to_value(service.admit_objective_attempt(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ReviewObjectiveAttemptCommand(command) => {
            let request: ReviewObjectiveAttempt = project_wire(command.request)?;
            serde_json::to_value(service.review_objective_attempt(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::RequestObjectiveCancelCommand(command) => {
            let request: RequestObjectiveCancel = project_wire(command.request)?;
            serde_json::to_value(service.request_objective_cancel(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ReconcileObjectiveCancellationCommand(command) => {
            let request: ReconcileObjectiveCancellation = project_wire(command.request)?;
            serde_json::to_value(service.reconcile_objective_cancellation(&request)?)
                .map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ListObjectiveAttemptsCommand(command) => {
            let request: ListObjectiveAttempts = project_wire(command.request)?;
            serde_json::to_value(service.list_objective_attempts(&request)?).map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ListObjectiveAttemptReviewsCommand(command) => {
            let request: ListObjectiveAttemptReviews = project_wire(command.request)?;
            serde_json::to_value(service.list_objective_attempt_reviews(&request)?)
                .map_err(Into::into)
        }
        ObjectiveStorageRpcCommand::ListObjectiveVerificationsCommand(command) => {
            let request: ListObjectiveVerifications = project_wire(command.request)?;
            serde_json::to_value(service.list_objective_verifications(&request)?)
                .map_err(Into::into)
        }
    }
}

fn handle_delegation_request(
    service: &SystemService,
    request: DelegationStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        DelegationStorageRpcCommand::PutDelegationGraphCommand(command) => {
            let request: PutDelegationGraph = project_wire(command.request)?;
            serde_json::to_value(service.put_delegation_graph(&request)?).map_err(Into::into)
        }
        DelegationStorageRpcCommand::GetDelegationGraphCommand(command) => {
            serde_json::to_value(service.get_delegation_graph(&command.graph_id)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::ListDelegationGraphsCommand(command) => {
            let request: ListDelegationGraphs = project_wire(command.request)?;
            serde_json::to_value(service.list_delegation_graphs(&request)?).map_err(Into::into)
        }
        DelegationStorageRpcCommand::PutDelegationGraphNodeCommand(command) => {
            let request: PutDelegationGraphNode = project_wire(command.request)?;
            serde_json::to_value(service.put_delegation_graph_node(&request)?).map_err(Into::into)
        }
        DelegationStorageRpcCommand::GetDelegationGraphNodeCommand(command) => {
            let request: GetDelegationGraphNode = project_wire(command.request)?;
            serde_json::to_value(service.get_delegation_graph_node(&request)?).map_err(Into::into)
        }
        DelegationStorageRpcCommand::ListDelegationGraphNodesCommand(command) => {
            let request: ListDelegationGraphNodes = project_wire(command.request)?;
            serde_json::to_value(service.list_delegation_graph_nodes(&request)?).map_err(Into::into)
        }
        DelegationStorageRpcCommand::PutDelegationGraphDependencyCommand(command) => {
            let request: PutDelegationGraphDependency = project_wire(command.request)?;
            serde_json::to_value(service.put_delegation_graph_dependency(&request)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::ListDelegationGraphDependenciesCommand(command) => {
            let request: ListDelegationGraphDependencies = project_wire(command.request)?;
            serde_json::to_value(service.list_delegation_graph_dependencies(&request)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::UpdateDelegationGraphStateCommand(command) => {
            let request: UpdateDelegationGraphState = project_wire(command.request)?;
            serde_json::to_value(service.update_delegation_graph_state(&request)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::UpdateDelegationGraphNodeStateCommand(command) => {
            let request: UpdateDelegationGraphNodeState = project_wire(command.request)?;
            serde_json::to_value(service.update_delegation_graph_node_state(&request)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::AttachDelegationGraphNodeJobCommand(command) => {
            let request: AttachDelegationGraphNodeJob = project_wire(command.request)?;
            serde_json::to_value(service.attach_delegation_graph_node_job(&request)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::ListReadyDelegationGraphNodesCommand(command) => {
            let request: ListReadyDelegationGraphNodes = project_wire(command.request)?;
            serde_json::to_value(service.list_ready_delegation_graph_nodes(&request)?)
                .map_err(Into::into)
        }
        DelegationStorageRpcCommand::MaterializeReadyDelegationGraphNodeCommand(command) => {
            let request: MaterializeReadyDelegationGraphNode = project_wire(command.request)?;
            serde_json::to_value(service.materialize_ready_delegation_graph_node(&request)?)
                .map_err(Into::into)
        }
    }
}

fn handle_team_request(
    service: &SystemService,
    request: TeamStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        TeamStorageRpcCommand::PutTeamConversationCommand(command) => {
            let request: PutTeamConversation = project_wire(command.request)?;
            serde_json::to_value(service.put_team_conversation(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamConversationCommand(command) => {
            serde_json::to_value(service.get_team_conversation(&command.conversation_id)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamConversationsCommand(command) => {
            let request: ListTeamConversations = project_wire(command.request)?;
            serde_json::to_value(service.list_team_conversations(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::UpdateTeamConversationStateCommand(command) => {
            let request: UpdateTeamConversationState = project_wire(command.request)?;
            serde_json::to_value(service.update_team_conversation_state(&request)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::SetTeamConversationLeadCommand(command) => {
            let request: SetTeamConversationLead = project_wire(command.request)?;
            serde_json::to_value(service.set_team_conversation_lead(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::PutTeamParticipantCommand(command) => {
            let request: PutTeamParticipant = project_wire(command.request)?;
            serde_json::to_value(service.put_team_participant(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamParticipantsCommand(command) => {
            let request: ListTeamParticipants = project_wire(command.request)?;
            serde_json::to_value(service.list_team_participants(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::UpdateTeamParticipantStateCommand(command) => {
            let request: UpdateTeamParticipantState = project_wire(command.request)?;
            serde_json::to_value(service.update_team_participant_state(&request)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::AdmitTeamMessageCommand(command) => {
            let request: AdmitTeamMessage = project_wire(command.request)?;
            serde_json::to_value(service.admit_team_message(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamMessageCommand(command) => {
            serde_json::to_value(service.get_team_message(&command.message_id)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamMessagesCommand(command) => {
            let request: ListTeamMessages = project_wire(command.request)?;
            serde_json::to_value(service.list_team_messages(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::RouteTeamMessageCommand(command) => {
            let request: RouteTeamMessage = project_wire(command.request)?;
            serde_json::to_value(service.route_team_message(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamRoutingDecisionByMessageCommand(command) => {
            serde_json::to_value(service.get_team_routing_decision_by_message(&command.message_id)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamRoutingDecisionsCommand(command) => {
            let request: ListTeamRoutingDecisions = project_wire(command.request)?;
            serde_json::to_value(service.list_team_routing_decisions(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamDeliveriesCommand(command) => {
            let request: ListTeamDeliveries = project_wire(command.request)?;
            serde_json::to_value(service.list_team_deliveries(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamDiscussionRoundCommand(command) => {
            serde_json::to_value(service.get_team_discussion_round(&command.round_id)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamDelegationOperationCommand(command) => {
            serde_json::to_value(service.get_team_delegation_operation(&command.operation_id)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamDelegationOperationByToolExecutionCommand(command) => {
            serde_json::to_value(
                service
                    .get_team_delegation_operation_by_tool_execution(&command.tool_execution_id)?,
            )
            .map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamDelegationTasksCommand(command) => {
            serde_json::to_value(service.list_team_delegation_tasks(&command.operation_id)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::ListTeamDiscussionRoundsCommand(command) => {
            let request: ListTeamDiscussionRounds = project_wire(command.request)?;
            serde_json::to_value(service.list_team_discussion_rounds(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::ReadTeamConversationPageCommand(command) => {
            let request: ReadTeamConversationPage = project_wire(command.request)?;
            serde_json::to_value(service.read_team_conversation_page(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::GetTeamDeliveryMaterializationContextCommand(command) => {
            serde_json::to_value(
                service.get_team_delivery_materialization_context(&command.delivery_id)?,
            )
            .map_err(Into::into)
        }
        TeamStorageRpcCommand::MaterializeTeamDeliveryCommand(command) => {
            let request: MaterializeTeamDelivery = project_wire(command.request)?;
            serde_json::to_value(service.materialize_team_delivery(&request)?).map_err(Into::into)
        }
        TeamStorageRpcCommand::FailTeamDeliveryMaterializationCommand(command) => {
            let request: FailTeamDeliveryMaterialization = project_wire(command.request)?;
            serde_json::to_value(service.fail_team_delivery_materialization(&request)?)
                .map_err(Into::into)
        }
        TeamStorageRpcCommand::ProjectTeamDeliveryOutcomeCommand(command) => {
            let request: ProjectTeamDeliveryOutcome = project_wire(command.request)?;
            serde_json::to_value(service.project_team_delivery_outcome(&request)?)
                .map_err(Into::into)
        }
    }
}

fn handle_plugin_request(
    service: &SystemService,
    request: PluginStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        PluginStorageRpcCommand::PutPluginManifestCommand(command) => {
            let request: PutPluginManifest = project_wire(command.request)?;
            serde_json::to_value(service.put_plugin_manifest(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::GetPluginManifestCommand(command) => {
            let request: GetPluginManifest = project_wire(command.request)?;
            serde_json::to_value(service.get_plugin_manifest(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::ListPluginManifestsCommand(command) => {
            let request: ListPluginManifests = project_wire(command.request)?;
            serde_json::to_value(service.list_plugin_manifests(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::PutPluginInstallCommand(command) => {
            let request: PutPluginInstall = project_wire(command.request)?;
            serde_json::to_value(service.put_plugin_install(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::ActivatePluginInstallCommand(command) => {
            let request: ActivatePluginInstall = project_wire(command.request)?;
            serde_json::to_value(service.activate_plugin_install(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::GetPluginInstallCommand(command) => {
            let request: GetPluginInstall = project_wire(command.request)?;
            serde_json::to_value(service.get_plugin_install(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::ListPluginInstallsCommand(command) => {
            let request: ListPluginInstalls = project_wire(command.request)?;
            serde_json::to_value(service.list_plugin_installs(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::UpdatePluginInstallStateCommand(command) => {
            let request: UpdatePluginInstallState = project_wire(command.request)?;
            serde_json::to_value(service.update_plugin_install_state(&request)?).map_err(Into::into)
        }
        PluginStorageRpcCommand::UpdatePluginManifestStateCommand(command) => {
            let request: UpdatePluginManifestState = project_wire(command.request)?;
            serde_json::to_value(service.update_plugin_manifest_state(&request)?)
                .map_err(Into::into)
        }
        PluginStorageRpcCommand::GetPluginActionExecutionAdmissionCommand(command) => {
            let request: GetPluginActionExecutionAdmission = project_wire(command.request)?;
            serde_json::to_value(service.get_plugin_action_execution_admission(&request)?)
                .map_err(Into::into)
        }
        PluginStorageRpcCommand::SubmitPluginActionCommand(command) => {
            let request: SubmitPluginAction = project_wire(command.request)?;
            serde_json::to_value(service.submit_plugin_action(&request)?).map_err(Into::into)
        }
    }
}

fn handle_connector_request(
    service: &SystemService,
    request: ConnectorStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        ConnectorStorageRpcCommand::PutConnectorRegistrationCommand(command) => {
            let request: PutConnectorRegistration = project_wire(command.request)?;
            serde_json::to_value(service.put_connector_registration(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::ListConnectorRegistrationsCommand(command) => {
            let request: ListConnectorRegistrations = project_wire(command.request)?;
            serde_json::to_value(service.list_connector_registrations(&request)?)
                .map_err(Into::into)
        }
        ConnectorStorageRpcCommand::UpdateConnectorRegistrationStateCommand(command) => {
            let request: UpdateConnectorRegistrationState = project_wire(command.request)?;
            serde_json::to_value(service.update_connector_registration_state(&request)?)
                .map_err(Into::into)
        }
        ConnectorStorageRpcCommand::PutConnectorCredentialCommand(command) => {
            let request: PutConnectorCredential = project_wire(command.request)?;
            serde_json::to_value(service.put_connector_credential(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::ListConnectorCredentialsCommand(command) => {
            let request: ListConnectorCredentials = project_wire(command.request)?;
            serde_json::to_value(service.list_connector_credentials(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::RevokeConnectorCredentialCommand(command) => {
            let request: RevokeConnectorCredential = project_wire(command.request)?;
            serde_json::to_value(service.revoke_connector_credential(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::StartConnectorSessionCommand(command) => {
            let request: StartConnectorSession = project_wire(command.request)?;
            serde_json::to_value(service.start_connector_session(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::HeartbeatConnectorSessionCommand(command) => {
            let request: HeartbeatConnectorSession = project_wire(command.request)?;
            serde_json::to_value(service.heartbeat_connector_session(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::FinishConnectorSessionCommand(command) => {
            let request: FinishConnectorSession = project_wire(command.request)?;
            serde_json::to_value(service.finish_connector_session(&request)?).map_err(Into::into)
        }
        ConnectorStorageRpcCommand::ListConnectorSessionsCommand(command) => {
            let request: ListConnectorSessions = project_wire(command.request)?;
            serde_json::to_value(service.list_connector_sessions(&request)?).map_err(Into::into)
        }
    }
}

fn project_wire<T: Serialize, U: DeserializeOwned>(value: T) -> Result<U, SystemServiceError> {
    serde_json::from_value(serde_json::to_value(value)?).map_err(Into::into)
}

fn decode_base64(value: &str) -> Result<Vec<u8>, SystemServiceError> {
    BASE64_STANDARD.decode(value).map_err(|error| {
        SystemServiceError::InvalidLogicalPath(format!("invalid base64 content: {error}"))
    })
}

fn handle_channel_request(
    service: &SystemService,
    request: ChannelStorageRpcCommand,
) -> Result<Value, SystemServiceError> {
    match request {
        ChannelStorageRpcCommand::PutChannelBindingCommand(command) => {
            let request: PutChannelBinding = project_wire(command.request)?;
            serde_json::to_value(service.put_channel_binding(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::ListChannelBindingsCommand(command) => {
            let request: ListChannelBindings = project_wire(command.request)?;
            serde_json::to_value(service.list_channel_bindings(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::RevokeChannelBindingCommand(command) => {
            let request: RevokeChannelBinding = project_wire(command.request)?;
            serde_json::to_value(service.revoke_channel_binding(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::IngestChannelInboundEventCommand(command) => {
            let request: IngestChannelInboundEvent = project_wire(command.request)?;
            serde_json::to_value(service.ingest_channel_inbound_event(&request)?)
                .map_err(Into::into)
        }
        ChannelStorageRpcCommand::ListChannelInboundEventsCommand(command) => {
            let request: ListChannelInboundEvents = project_wire(command.request)?;
            serde_json::to_value(service.list_channel_inbound_events(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::UpdateChannelInboundEventStateCommand(command) => {
            let request: UpdateChannelInboundEventState = project_wire(command.request)?;
            serde_json::to_value(service.update_channel_inbound_event_state(&request)?)
                .map_err(Into::into)
        }
        ChannelStorageRpcCommand::SubmitChannelDeliveryCommand(command) => {
            let request: SubmitChannelDelivery = project_wire(command.request)?;
            serde_json::to_value(service.submit_channel_delivery(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::CompleteChannelDeliveryCommand(command) => {
            let request: CompleteChannelDelivery = project_wire(command.request)?;
            serde_json::to_value(service.complete_channel_delivery(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::FailChannelDeliveryCommand(command) => {
            let request: FailChannelDelivery = project_wire(command.request)?;
            serde_json::to_value(service.fail_channel_delivery(&request)?).map_err(Into::into)
        }
        ChannelStorageRpcCommand::ProjectChannelInboundEventCommand(command) => {
            let request: ProjectChannelInboundEvent = project_wire(command.request)?;
            serde_json::to_value(service.project_channel_inbound_event(&request)?)
                .map_err(Into::into)
        }
        ChannelStorageRpcCommand::ListChannelProjectionsCommand(command) => {
            let request: ListChannelProjections = project_wire(command.request)?;
            serde_json::to_value(service.list_channel_projections(&request)?).map_err(Into::into)
        }
    }
}

fn read_request() -> Result<String, ProtocolFailure> {
    let mut input = String::new();
    io::stdin()
        .read_to_string(&mut input)
        .map_err(|error| ProtocolFailure {
            request_id: None,
            code: "invalid_storage_rpc_envelope",
            message: error.to_string(),
        })?;
    Ok(input)
}

fn parse_request_envelope(input: String) -> Result<ParsedRequest, ProtocolFailure> {
    let value: Value = serde_json::from_str(&input).map_err(|error| ProtocolFailure {
        request_id: None,
        code: "invalid_storage_rpc_envelope",
        message: error.to_string(),
    })?;
    let request_id = value
        .get("request_id")
        .and_then(Value::as_str)
        .map(str::to_owned);
    let version = value.get("storage_rpc_version").and_then(Value::as_i64);
    if version != Some(STORAGE_RPC_VERSION) {
        return Err(ProtocolFailure {
            request_id,
            code: "unsupported_storage_rpc_version",
            message: format!(
                "unsupported storage RPC version: {}",
                version.map_or_else(|| "missing".to_string(), |item| item.to_string())
            ),
        });
    }
    validate_storage_rpc_required_fields(&value, request_id.clone())?;
    let envelope =
        serde_json::from_value::<StorageRpcRequestEnvelope>(value.clone()).map_err(|error| {
            ProtocolFailure {
                request_id: request_id.clone(),
                code: "invalid_storage_rpc_envelope",
                message: error.to_string(),
            }
        })?;
    let request_id = String::from(envelope.request_id);
    match envelope.request {
        StorageRpcCommand::StorageRpcDescribeCommand(_) => {
            Ok(ParsedRequest::Describe { request_id })
        }
        StorageRpcCommand::RuntimeStorageRpcCommand(request) => Ok(ParsedRequest::Runtime {
            request_id,
            request,
        }),
        StorageRpcCommand::SessionsStorageRpcCommand(request) => Ok(ParsedRequest::Sessions {
            request_id,
            request,
        }),
        StorageRpcCommand::ContextStorageRpcCommand(request) => Ok(ParsedRequest::Context {
            request_id,
            request,
        }),
        StorageRpcCommand::SchedulerStorageRpcCommand(request) => Ok(ParsedRequest::Scheduler {
            request_id,
            request,
        }),
        StorageRpcCommand::ToolsStorageRpcCommand(request) => Ok(ParsedRequest::Tools {
            request_id,
            request,
        }),
        StorageRpcCommand::WorkspaceStorageRpcCommand(request) => Ok(ParsedRequest::Workspace {
            request_id,
            request,
        }),
        StorageRpcCommand::PlanStorageRpcCommand(request) => Ok(ParsedRequest::Plan {
            request_id,
            request,
        }),
        StorageRpcCommand::ObjectiveStorageRpcCommand(request) => Ok(ParsedRequest::Objective {
            request_id,
            request,
        }),
        StorageRpcCommand::DelegationStorageRpcCommand(request) => Ok(ParsedRequest::Delegation {
            request_id,
            request,
        }),
        StorageRpcCommand::TeamStorageRpcCommand(request) => Ok(ParsedRequest::Team {
            request_id,
            request,
        }),
        StorageRpcCommand::PluginStorageRpcCommand(request) => Ok(ParsedRequest::Plugin {
            request_id,
            request,
        }),
        StorageRpcCommand::ConnectorStorageRpcCommand(request) => Ok(ParsedRequest::Connector {
            request_id,
            request,
        }),
        StorageRpcCommand::ChannelStorageRpcCommand(request) => Ok(ParsedRequest::Channel {
            request_id,
            request,
        }),
        StorageRpcCommand::MediaGenerationStorageRpcCommand(request) => {
            Ok(ParsedRequest::MediaGeneration {
                request_id,
                request,
            })
        }
    }
}

fn validate_storage_rpc_required_fields(
    value: &Value,
    request_id: Option<String>,
) -> Result<(), ProtocolFailure> {
    let presence_schema = STORAGE_RPC_PRESENCE_SCHEMA.get_or_init(|| {
        let schema: Value = serde_json::from_str(STORAGE_RPC_SCHEMA)
            .map_err(|error| format!("embedded storage RPC schema is invalid JSON: {error}"))?;
        let definitions = schema
            .get("$defs")
            .and_then(Value::as_object)
            .ok_or_else(|| "embedded storage RPC schema has no $defs object".to_string())?;
        let command_definitions = definitions
            .iter()
            .filter_map(|(name, definition)| {
                let values = definition.pointer("/properties/command/enum")?.as_array()?;
                if values.len() != 1 {
                    return None;
                }
                values[0]
                    .as_str()
                    .map(|command| (command.to_string(), name.clone()))
            })
            .collect();
        Ok(StorageRpcPresenceSchema {
            schema,
            command_definitions,
        })
    });
    let presence_schema = presence_schema
        .as_ref()
        .map_err(|message| ProtocolFailure {
            request_id: request_id.clone(),
            code: "invalid_storage_rpc_envelope",
            message: message.clone(),
        })?;
    let Some(command) = value.pointer("/request/command").and_then(Value::as_str) else {
        return Ok(());
    };
    let Some(definition_name) = presence_schema.command_definitions.get(command) else {
        return Err(ProtocolFailure {
            request_id,
            code: "unknown_storage_rpc_command",
            message: format!("unknown storage RPC command: {command}"),
        });
    };
    let request = value
        .get("request")
        .expect("command presence requires a request object");
    let definition = presence_schema
        .schema
        .pointer(&format!("/$defs/{definition_name}"))
        .expect("indexed command definition must exist");
    validate_required_fields(request, definition, &presence_schema.schema, "request").map_err(
        |message| ProtocolFailure {
            request_id,
            code: "invalid_storage_rpc_envelope",
            message,
        },
    )
}

fn validate_required_fields(
    value: &Value,
    schema: &Value,
    root_schema: &Value,
    path: &str,
) -> Result<(), String> {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        let pointer = reference
            .strip_prefix('#')
            .ok_or_else(|| format!("unsupported non-local schema reference: {reference}"))?;
        let target = root_schema
            .pointer(pointer)
            .ok_or_else(|| format!("missing schema reference: {reference}"))?;
        return validate_required_fields(value, target, root_schema, path);
    }
    for keyword in ["oneOf", "anyOf"] {
        if let Some(branches) = schema.get(keyword).and_then(Value::as_array) {
            if let Some(branch) = branches
                .iter()
                .find(|branch| schema_shape_matches(value, branch, root_schema))
            {
                return validate_required_fields(value, branch, root_schema, path);
            }
            return Ok(());
        }
    }
    if schema.get("type").and_then(Value::as_str) == Some("object") {
        let Some(object) = value.as_object() else {
            return Ok(());
        };
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for field in required.iter().filter_map(Value::as_str) {
                if !object.contains_key(field) {
                    return Err(format!("{path} is missing required field {field}"));
                }
            }
        }
        if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
            for (field, field_schema) in properties {
                if let Some(field_value) = object.get(field) {
                    validate_required_fields(
                        field_value,
                        field_schema,
                        root_schema,
                        &format!("{path}.{field}"),
                    )?;
                }
            }
        }
    } else if schema.get("type").and_then(Value::as_str) == Some("array") {
        if let (Some(items), Some(values)) = (schema.get("items"), value.as_array()) {
            for (index, item) in values.iter().enumerate() {
                validate_required_fields(item, items, root_schema, &format!("{path}[{index}]"))?;
            }
        }
    }
    Ok(())
}

fn schema_shape_matches(value: &Value, schema: &Value, root_schema: &Value) -> bool {
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        let Some(pointer) = reference.strip_prefix('#') else {
            return false;
        };
        return root_schema
            .pointer(pointer)
            .is_some_and(|target| schema_shape_matches(value, target, root_schema));
    }
    let type_matches = match schema.get("type").and_then(Value::as_str) {
        Some("null") => value.is_null(),
        Some("object") => value.is_object(),
        Some("array") => value.is_array(),
        Some("string") => value.is_string(),
        Some("integer") | Some("number") => value.is_number(),
        Some("boolean") => value.is_boolean(),
        _ => true,
    };
    if !type_matches {
        return false;
    }
    if let (Some(object), Some(properties)) = (
        value.as_object(),
        schema.get("properties").and_then(Value::as_object),
    ) {
        for (field, field_schema) in properties {
            let Some(field_value) = object.get(field) else {
                continue;
            };
            let resolved = if let Some(reference) = field_schema.get("$ref").and_then(Value::as_str)
            {
                reference
                    .strip_prefix('#')
                    .and_then(|pointer| root_schema.pointer(pointer))
                    .unwrap_or(field_schema)
            } else {
                field_schema
            };
            if resolved
                .get("enum")
                .and_then(Value::as_array)
                .is_some_and(|values| !values.contains(field_value))
            {
                return false;
            }
        }
    }
    true
}

fn error_code(error: &SystemServiceError) -> &'static str {
    match error {
        SystemServiceError::Sqlite(_) => "sqlite",
        SystemServiceError::Io(_) => "io",
        SystemServiceError::Json(_) => "json",
        SystemServiceError::InvalidLogicalPath(_) => "invalid_input",
        SystemServiceError::InvalidInput(_) => "invalid_input",
        SystemServiceError::NotFound(_) => "not_found",
        SystemServiceError::Conflict(_) => "conflict",
        SystemServiceError::Sha256Mismatch { .. } => "sha256_mismatch",
        SystemServiceError::BudgetDenied { .. } => "budget_denied",
        SystemServiceError::InvalidJobRequest(_) => "invalid_job_request",
        SystemServiceError::Invariant(_) => "invariant",
    }
}

fn optional_positive_i64(
    value: Option<std::num::NonZeroU64>,
    field: &str,
) -> Result<Option<i64>, SystemServiceError> {
    value
        .map(|value| {
            i64::try_from(value.get()).map_err(|_| {
                SystemServiceError::InvalidInput(format!("{field} exceeds supported range"))
            })
        })
        .transpose()
}
