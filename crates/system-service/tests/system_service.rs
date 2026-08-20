use std::sync::{mpsc, Arc, Barrier};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::json;
use sha2::{Digest, Sha256};
use tempfile::tempdir;
use wanex_system_service::{
    ActivateContextEpoch, ActivatePluginInstall, AdmitObjectiveAttempt,
    AdmitObjectiveAttemptReceipt, AdmitSessionInput, AdmitTeamMessage, AppendSessionMessage,
    ApplySessionTurnControl, AttachDelegationGraphNodeJob, BeginContextEpoch,
    BeginProviderInvocation, BeginToolExecution, BeginWorkspaceChangeTransaction,
    BeginWorkspaceChangeTransactionCommit, BeginWorkspaceTaskCollection, BeginWorkspaceTaskRun,
    BudgetAmount, BudgetScopeKind, BudgetScopeRef, ChangeObjectiveState, ClaimJob,
    ClaimWorkspaceChangeProposalApply, ClaimWorkspaceChangeTransactionRecovery,
    ClaimWorkspaceTaskRecovery, CleanupExpiredResourceTickets, CommitBudget,
    CompleteChannelDelivery, CompleteJob, ConfigMutationCondition, ContextEpochMutationIdentity,
    CreateObjective, CreatePlanProposal, DoctorCheckState, EnqueueJob, EventScope,
    ExecuteApprovedPlan, FailChannelDelivery, FailJob, FailTeamDeliveryMaterialization,
    FinalizeWorkspaceChangeTransaction, FinalizeWorkspaceTaskCollection, FinishConnectorSession,
    FinishContextEpochGeneration, GetActiveContextEpoch, GetPluginInstall, GetPluginManifest,
    HeartbeatConnectorSession, HeartbeatJob, IngestChannelInboundEvent, IngestResource,
    InterruptSessionTurn, ListChannelBindings, ListChannelInboundEvents, ListChannelProjections,
    ListConnectorCredentials, ListConnectorSessions, ListContextEpochs,
    ListDelegationGraphDependencies, ListDelegationGraphNodes, ListDelegationGraphs,
    ListObjectiveAttemptReviews, ListObjectiveAttempts, ListObjectiveVerifications,
    ListPlanProposalOperations, ListPlanProposals, ListPluginInstalls, ListPluginManifests,
    ListReadyDelegationGraphNodes, ListResources, ListSessionAttempts, ListSessionTurnControls,
    ListSessionTurns, ListSessions, ListTeamConversations, ListTeamDeliveries,
    ListTeamDiscussionRounds, ListTeamMessages, ListTeamParticipants, ListTeamRoutingDecisions,
    ListWorkspaceChangeOperations, ListWorkspaceChangeProposalOperations,
    ListWorkspaceChangeProposals, ListWorkspaceChangeSets, ListWorkspaceTaskAttempts,
    ListWorkspaceTaskRuns, MarkContextEpochOutputObserved,
    MarkWorkspaceChangeProposalRecoveryRequired, MarkWorkspaceChangeTransactionPrepared,
    MarkWorkspaceTaskActive, MaterializeReadyDelegationGraphNode, MaterializeTeamDelivery,
    PlanProposalContentRecord, PlanProposalGenerationRecord, PlanProposalReferenceRecord,
    PlanProposalSourceRecord, ProjectChannelInboundEvent, ProjectTeamDeliveryOutcome,
    PruneContextEpochs, PutChannelBinding, PutConnectorCredential, PutConnectorRegistration,
    PutDelegationGraph, PutDelegationGraphDependency, PutDelegationGraphNode, PutPluginInstall,
    PutPluginManifest, PutTeamConversation, PutTeamParticipant, PutWorkspaceChangeProposal,
    PutWorkspaceChangeSet, QueryEvents, ReadTeamConversationPage, ReconcileObjectiveCancellation,
    ReconcileWorkspaceChangeTransactionFiles, RecordBudgetUsage, RecordPlanProposalOperation,
    RecordWorkspaceChangeOperation, RecordWorkspaceChangeProposalOperation,
    RecordWorkspaceChangeTransactionFileCommitted, RecordWorkspaceChangeTransactionPlan,
    RenameSession, RenewWorkspaceChangeProposalApply, RenewWorkspaceChangeTransaction,
    RequestObjectiveCancel, RequestSessionTurnCancel, RequireToolExecutionRecovery, ReserveBudget,
    ResolveToolExecutionRecovery, ResourceCapability, ResourceSource, RetryPolicy, RetryStrategy,
    ReviewObjectiveAttempt, RevokeConnectorCredential, RouteTeamDelivery, RouteTeamMessage,
    RuntimeEvent, SchedulerJobKind, SchedulerJobRecord, SessionStateTransition,
    SetTeamConversationLead, SettleSessionTurn, SettleWorkspaceChangeProposalApply,
    StartConnectorSession, StartSessionTurnAttempt, SteerSessionTurn, SubmitChannelDelivery,
    SubmitPluginAction, SubmitSessionTurn, SubmitSessionTurnReceipt, SystemService,
    SystemServiceError, TeamTarget, ToolResultContentPart, UpdateChannelInboundEventState,
    UpdateConnectorRegistrationState, UpdateDelegationGraphNodeState, UpdateDelegationGraphState,
    UpdatePluginInstallState, UpdatePluginManifestState, UpdateTeamConversationState,
    UpdateTeamParticipantState, WorkspaceChangeTransactionFileObservation,
    WorkspaceChangeTransactionFilePlan, WorkspaceChangeTransactionProposalBinding,
    WorkspaceTaskRunIdentity, CURRENT_SCHEMA_VERSION,
};

fn test_execution_binding(label: &str) -> serde_json::Value {
    let endpoint = json!({
        "id": format!("endpoint_{label}"),
        "connection": {
            "id": format!("connection_{label}"),
            "providerId": "fake"
        },
        "protocol": { "id": "fake" },
        "model": {
            "id": format!("model_{label}"),
            "operations": ["conversation"],
            "inputModalities": ["text"],
            "outputModalities": ["text"],
            "features": [],
            "catalog": {
                "source": "custom",
                "catalogId": format!("test.model_{label}"),
                "revision": "1"
            }
        }
    });
    let endpoint_digest = sha256_json(&endpoint);
    let mut binding = json!({
        "createdAt": 1,
        "modelEndpoint": {
            "endpointId": format!("endpoint_{label}"),
            "endpointDigest": endpoint_digest,
            "connection": endpoint["connection"].clone(),
            "protocol": endpoint["protocol"].clone(),
            "model": endpoint["model"].clone()
        },
        "completion": { "maxOutputTokens": 4096 },
        "capabilityRoutes": [],
        "resources": [],
        "recovery": {
            "providerMaxAttempts": 2,
            "idempotentToolMaxAttempts": 2
        }
    });
    let digest = sha256_json(&binding);
    binding
        .as_object_mut()
        .unwrap()
        .insert("digest".to_string(), json!(digest));
    binding
}

fn test_execution_binding_with_secret(label: &str, secret_ref: &str) -> serde_json::Value {
    let mut binding = test_execution_binding(label);
    binding["modelEndpoint"]["connection"]["secretRef"] = json!(secret_ref);
    let endpoint = json!({
        "id": binding["modelEndpoint"]["endpointId"].clone(),
        "connection": binding["modelEndpoint"]["connection"].clone(),
        "protocol": binding["modelEndpoint"]["protocol"].clone(),
        "model": binding["modelEndpoint"]["model"].clone()
    });
    binding["modelEndpoint"]["endpointDigest"] = json!(sha256_json(&endpoint));
    refresh_execution_binding_digest(&mut binding);
    binding
}

fn sha256_json(value: &serde_json::Value) -> String {
    Sha256::digest(serde_json::to_string(value).unwrap().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn tool_json_content(value: serde_json::Value) -> (Vec<ToolResultContentPart>, String) {
    let digest = sha256_json(&json!([{ "type": "json", "value": value }]));
    (vec![ToolResultContentPart::Json { value }], digest)
}

fn refresh_execution_binding_digest(binding: &mut serde_json::Value) {
    binding.as_object_mut().unwrap().remove("digest");
    let digest = sha256_json(binding);
    binding
        .as_object_mut()
        .unwrap()
        .insert("digest".to_string(), json!(digest));
}

fn empty_source_plan_request(id: &str, session_id: &str) -> CreatePlanProposal {
    let output = json!([{
        "type": "text",
        "id": format!("part_{id}_output"),
        "text": "{\"title\":\"Test plan\"}"
    }]);
    CreatePlanProposal {
        id: Some(id.to_string()),
        principal_id: "agent_plan_test".to_string(),
        source: PlanProposalSourceRecord {
            session_id: session_id.to_string(),
            head_sequence: 0,
            head_message_id: None,
            head_turn_id: None,
            analysis_input_digest: "a".repeat(64),
            planning_request: json!([{
                "type": "text",
                "id": format!("part_{id}_request"),
                "text": "Plan the test"
            }]),
        },
        generation: PlanProposalGenerationRecord {
            endpoint_id: "endpoint_plan_test".to_string(),
            endpoint_digest: "b".repeat(64),
            protocol_id: "fake".to_string(),
            provider_id: "fake".to_string(),
            model_id: "model_plan_test".to_string(),
            generated_at: 1,
            output_digest: sha256_json(&output),
            output,
        },
        content: PlanProposalContentRecord {
            title: "Test plan".to_string(),
            summary: "Test the durable Plan contract".to_string(),
            steps: json!([{ "id": "step_1", "title": "Run the test" }]),
            references: vec![],
        },
        idempotency_key: format!("create:{id}"),
    }
}

struct TestTurn<'a> {
    session_id: &'a str,
    input_id: &'a str,
    turn_id: &'a str,
    job_id: &'a str,
    principal_id: &'a str,
    idempotency_key: &'a str,
    text: &'a str,
}

fn test_turn_request(request: TestTurn<'_>) -> SubmitSessionTurn {
    SubmitSessionTurn {
        id: Some(request.input_id.to_string()),
        turn_id: Some(request.turn_id.to_string()),
        session_id: request.session_id.to_string(),
        principal_id: request.principal_id.to_string(),
        idempotency_key: request.idempotency_key.to_string(),
        input_type: Some("user".to_string()),
        content: json!([{
            "type": "text",
            "id": format!("part_{}", request.input_id),
            "text": request.text
        }]),
        origin: None,
        intent: None,
        run_control_policy: None,
        expected_turn_id: None,
        job_id: Some(request.job_id.to_string()),
        job_idempotency_key: Some(format!("job:{}", request.idempotency_key)),
        execution_binding: test_execution_binding(request.turn_id),
        max_steps: Some(4),
        regenerates_turn_id: None,
        scheduled_at: None,
        not_before: None,
        priority: None,
        budget_grant_id: None,
    }
}

fn submit_test_turn(service: &SystemService, request: TestTurn<'_>) -> SubmitSessionTurnReceipt {
    service
        .submit_session_turn(&test_turn_request(request))
        .unwrap()
}

fn claim_session_turn_job(
    service: &SystemService,
    worker_id: &str,
    lease_ms: i64,
) -> Option<SchedulerJobRecord> {
    service
        .claim_job(&ClaimJob {
            worker_id: worker_id.to_string(),
            lease_ms,
            kinds: Some(vec![SchedulerJobKind::SessionTurn]),
        })
        .unwrap()
}

fn shorten_test_job_lease(service: &SystemService, job: &SchedulerJobRecord, worker_id: &str) {
    service
        .heartbeat_job(&HeartbeatJob {
            job_id: job.id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            lease_ms: 10,
        })
        .unwrap()
        .expect("test job still owns its lease");
}

fn start_test_turn(
    service: &SystemService,
    submitted: &SubmitSessionTurnReceipt,
    job: &SchedulerJobRecord,
    worker_id: &str,
) -> wanex_system_service::StartSessionTurnAttemptReceipt {
    service
        .start_session_turn_attempt(&StartSessionTurnAttempt {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            input_id: submitted.turn.primary_input_id.clone(),
            job_id: job.id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.clone().unwrap(),
        })
        .unwrap()
}

fn begin_test_provider_invocation(
    service: &SystemService,
    submitted: &SubmitSessionTurnReceipt,
    started: &wanex_system_service::StartSessionTurnAttemptReceipt,
    job: &SchedulerJobRecord,
    worker_id: &str,
) -> wanex_system_service::ProviderInvocationRecord {
    service
        .begin_provider_invocation(&BeginProviderInvocation {
            id: None,
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: job.id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            step: 1,
            invocation_number: 1,
            request_digest: sha256_json(&json!({"turnId": submitted.turn.id})),
        })
        .unwrap()
}

fn prepare_delegated_task_settlement(
    service: &SystemService,
    task: &wanex_system_service::TeamDelegationTaskRecord,
    job: &SchedulerJobRecord,
    worker_id: &str,
    outcome: &str,
    assistant_message: Option<serde_json::Value>,
    error: Option<serde_json::Value>,
) -> SettleSessionTurn {
    let started = service
        .start_session_turn_attempt(&StartSessionTurnAttempt {
            session_id: task.target_session_id.clone(),
            turn_id: task.child_turn_id.clone(),
            input_id: task.child_input_id.clone(),
            job_id: task.child_job_id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.clone().unwrap(),
        })
        .unwrap();
    let provider_invocation_id = if outcome == "succeeded" {
        Some(
            service
                .begin_provider_invocation(&BeginProviderInvocation {
                    id: None,
                    session_id: task.target_session_id.clone(),
                    turn_id: task.child_turn_id.clone(),
                    attempt_id: started.attempt.id.clone(),
                    input_id: task.child_input_id.clone(),
                    job_id: task.child_job_id.clone(),
                    worker_id: worker_id.to_string(),
                    lease_token: job.lease_token.clone().unwrap(),
                    step: 1,
                    invocation_number: 1,
                    request_digest: sha256_json(&json!({ "turnId": task.child_turn_id })),
                })
                .unwrap()
                .id,
        )
    } else {
        None
    };
    SettleSessionTurn {
        session_id: task.target_session_id.clone(),
        turn_id: task.child_turn_id.clone(),
        attempt_id: started.attempt.id,
        input_id: task.child_input_id.clone(),
        job_id: task.child_job_id.clone(),
        worker_id: worker_id.to_string(),
        lease_token: job.lease_token.clone().unwrap(),
        outcome: outcome.to_string(),
        provider_invocation_id,
        assistant_message,
        provider_state: None,
        result: Some(json!({ "delegated": true })),
        error,
        reason: (outcome != "succeeded").then(|| "delegated task did not succeed".to_string()),
    }
}

struct AmbiguousToolFixture {
    submitted: SubmitSessionTurnReceipt,
    job: SchedulerJobRecord,
    started: wanex_system_service::StartSessionTurnAttemptReceipt,
    source_message_id: String,
    execution: wanex_system_service::ToolExecutionRecord,
    invocation_attempt: wanex_system_service::ToolExecutionAttemptRecord,
    recovery: wanex_system_service::RequireToolExecutionRecoveryReceipt,
    budget_scope_id: Option<String>,
}

fn prepare_ambiguous_tool(
    service: &SystemService,
    suffix: &str,
    idempotent: bool,
    with_budget: bool,
) -> AmbiguousToolFixture {
    let session_id = format!("ses_tool_ambiguous_{suffix}");
    let input_id = format!("inp_tool_ambiguous_{suffix}");
    let turn_id = format!("turn_tool_ambiguous_{suffix}");
    let job_id = format!("job_tool_ambiguous_{suffix}");
    let principal_id = format!("user_tool_ambiguous_{suffix}");
    let worker_id = format!("worker_tool_ambiguous_{suffix}");
    let tool_call_id = format!("call_tool_ambiguous_{suffix}");
    service
        .create_session(Some(&session_id), None, Some("agent"))
        .unwrap();

    let budget = with_budget.then(|| {
        service
            .reserve_budget(&ReserveBudget {
                scope: BudgetScopeRef {
                    kind: BudgetScopeKind::Session,
                    owner_id: session_id.clone(),
                    window_kind: None,
                },
                limit: BudgetAmount {
                    tokens: Some(100),
                    cost_micros: None,
                    wall_time_ms: None,
                    tool_calls: Some(4),
                },
                requested: BudgetAmount {
                    tokens: Some(50),
                    cost_micros: None,
                    wall_time_ms: None,
                    tool_calls: Some(2),
                },
                principal_id: principal_id.clone(),
                reason: "agent.turn".to_string(),
                idempotency_key: format!("budget_tool_ambiguous_{suffix}"),
                expires_at: None,
            })
            .unwrap()
    });
    let mut submit = test_turn_request(TestTurn {
        session_id: &session_id,
        input_id: &input_id,
        turn_id: &turn_id,
        job_id: &job_id,
        principal_id: &principal_id,
        idempotency_key: &format!("idem_tool_ambiguous_{suffix}"),
        text: "perform remote work",
    });
    submit.budget_grant_id = budget.as_ref().map(|grant| grant.id.clone());
    let submitted = service.submit_session_turn(&submit).unwrap();
    let job = claim_session_turn_job(service, &worker_id, 60_000).unwrap();
    let started = start_test_turn(service, &submitted, &job, &worker_id);
    let provider = begin_test_provider_invocation(service, &submitted, &started, &job, &worker_id);
    let source = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: input_id.clone(),
            job_id: job.id.clone(),
            worker_id: worker_id.clone(),
            lease_token: job.lease_token.clone().unwrap(),
            invocation_id: provider.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "tool_call",
                "id": format!("part_{tool_call_id}"),
                "toolCallId": tool_call_id,
                "toolName": "remote_operation",
                "input": {"value": suffix}
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let begun = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: input_id.clone(),
            source_message_id: source.id.clone(),
            job_id: job.id.clone(),
            worker_id: worker_id.clone(),
            lease_token: job.lease_token.clone().unwrap(),
            principal_id,
            tool_call_id,
            tool_name: "remote_operation".to_string(),
            input: json!({"value": suffix}),
            descriptor: json!({
                "name": "remote_operation",
                "risk": "external",
                "idempotent": idempotent
            }),
            permission: json!({"status": "allow", "reason": "test"}),
            activity: None,
            state: "running".to_string(),
            idempotency_key: format!("tool:ambiguous:{suffix}"),
        })
        .unwrap();
    let invocation_attempt = begun.invocation_attempt.unwrap();
    let recovery = service
        .require_tool_execution_recovery(&RequireToolExecutionRecovery {
            session_id,
            turn_id,
            session_attempt_id: started.attempt.id.clone(),
            input_id,
            job_id: job.id.clone(),
            worker_id,
            lease_token: job.lease_token.clone().unwrap(),
            execution_id: begun.execution.id.clone(),
            invocation_attempt_id: invocation_attempt.id.clone(),
            evidence: json!({
                "type": "ambiguous_tool_outcome",
                "message": "remote effect may have succeeded",
                "reconciliationRef": format!("remote-{suffix}")
            }),
        })
        .unwrap()
        .unwrap();
    AmbiguousToolFixture {
        submitted,
        job,
        started,
        source_message_id: source.id,
        execution: begun.execution,
        invocation_attempt,
        recovery,
        budget_scope_id: budget.map(|grant| grant.scope_id),
    }
}

#[test]
fn opens_baseline_idempotently_and_reports_doctor_status() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let reopened = SystemService::open(dir.path()).unwrap();

    let report = reopened.doctor().unwrap();

    assert_eq!(report.store_path, service.db_path());
    assert_eq!(report.schema_version, CURRENT_SCHEMA_VERSION);
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    assert_eq!(
        schema_markers(&conn),
        vec![(CURRENT_SCHEMA_VERSION, "baseline".to_string())]
    );
    assert!(report
        .checks
        .iter()
        .any(|check| check.name == "sqlite.quick_check" && check.state == DoctorCheckState::Ok));
    assert!(report.checks.iter().any(|check| {
        check.name == "sqlite.busy_timeout_ms"
            && check.state == DoctorCheckState::Ok
            && check.message == "5000"
    }));
}

#[test]
fn opens_empty_store_concurrently_without_duplicate_baseline() {
    let dir = tempdir().unwrap();
    let barrier = Arc::new(Barrier::new(4));
    let workers = (0..4)
        .map(|_| {
            let root = dir.path().to_path_buf();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                barrier.wait();
                SystemService::open(root)
                    .and_then(|service| service.doctor())
                    .map(|report| report.schema_version)
            })
        })
        .collect::<Vec<_>>();

    for worker in workers {
        assert_eq!(worker.join().unwrap().unwrap(), CURRENT_SCHEMA_VERSION);
    }
}

#[test]
fn opens_initialized_store_without_waiting_for_a_write_lock() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let holder_db_path = service.db_path().to_path_buf();
    let (lock_ready_tx, lock_ready_rx) = mpsc::channel();
    let (release_tx, release_rx) = mpsc::channel();
    let holder = std::thread::spawn(move || {
        let mut locked = rusqlite::Connection::open(holder_db_path).unwrap();
        let transaction = locked
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        lock_ready_tx.send(()).unwrap();
        release_rx.recv().unwrap();
        transaction.rollback()
    });
    lock_ready_rx.recv().unwrap();

    let root = dir.path().to_path_buf();
    let (opened_tx, opened_rx) = mpsc::channel();
    let opener = std::thread::spawn(move || {
        opened_tx
            .send(SystemService::open(root).map(|_| ()))
            .unwrap();
    });
    let opened_while_locked = opened_rx.recv_timeout(Duration::from_secs(1));

    release_tx.send(()).unwrap();
    holder.join().unwrap().unwrap();
    opener.join().unwrap();
    assert!(
        matches!(opened_while_locked, Ok(Ok(()))),
        "opening an initialized store requested the active SQLite write lock: {opened_while_locked:?}"
    );
}

#[test]
fn waits_for_short_lived_sqlite_write_lock() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let writer_service = SystemService::open(dir.path()).unwrap();
    let holder_db_path = service.db_path().to_path_buf();
    let lock_ready = Arc::new(Barrier::new(2));
    let writer_started = Arc::new(Barrier::new(2));
    let holder_lock_ready = Arc::clone(&lock_ready);
    let holder_writer_started = Arc::clone(&writer_started);
    let holder = std::thread::spawn(move || {
        let mut locked = rusqlite::Connection::open(holder_db_path).unwrap();
        locked.busy_timeout(Duration::from_secs(5)).unwrap();
        let tx = locked
            .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
            .unwrap();
        tx.execute(
            "INSERT INTO config_entry (key, value_json, updated_at)
             VALUES ('lock.holder', '{}', 1)",
            [],
        )
        .unwrap();
        holder_lock_ready.wait();
        holder_writer_started.wait();
        std::thread::sleep(Duration::from_millis(100));
        tx.commit()
    });

    lock_ready.wait();
    let writer = std::thread::spawn(move || {
        writer_started.wait();
        writer_service.put_config("lock.waited", &json!({ "ok": true }))
    });
    holder.join().unwrap().unwrap();
    writer.join().unwrap().unwrap();

    assert_eq!(
        service.get_config("lock.waited").unwrap(),
        Some(json!({ "ok": true }))
    );
}

#[test]
fn rejects_unsupported_pre_release_store_schema() {
    let dir = tempdir().unwrap();
    create_unsupported_store(dir.path(), true);

    let error = SystemService::open(dir.path()).unwrap_err();
    assert!(matches!(
        error,
        SystemServiceError::Invariant(message)
            if message.contains("unsupported pre-release store schema")
    ));
}

#[test]
fn rejects_unmarked_non_empty_store() {
    let dir = tempdir().unwrap();
    create_unsupported_store(dir.path(), false);

    let error = SystemService::open(dir.path()).unwrap_err();
    assert!(matches!(
        error,
        SystemServiceError::Invariant(message)
            if message.contains("current baseline marker is missing")
    ));
}

#[test]
fn appends_and_queries_events_by_session() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    service
        .append_event(&RuntimeEvent {
            id: "evt_1".to_string(),
            event_type: "session.input.admitted".to_string(),
            scope: EventScope {
                session_id: Some("ses_1".to_string()),
                turn_id: None,
                input_id: Some("inp_1".to_string()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            payload: json!({ "text": "hello" }),
            occurred_at: 10,
        })
        .unwrap();

    service
        .append_event(&RuntimeEvent {
            id: "evt_2".to_string(),
            event_type: "session.input.admitted".to_string(),
            scope: EventScope {
                session_id: Some("ses_2".to_string()),
                turn_id: None,
                input_id: Some("inp_2".to_string()),
                message_id: None,
                resource_id: None,
                ..EventScope::default()
            },
            payload: json!({ "text": "other" }),
            occurred_at: 11,
        })
        .unwrap();

    let events = service
        .query_events(QueryEvents {
            session_id: Some("ses_1".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();

    assert_eq!(events.len(), 1);
    assert_eq!(events[0].id, "evt_1");
    assert_eq!(events[0].payload, json!({ "text": "hello" }));
}

#[test]
fn queries_events_after_stable_cursor_without_skipping_same_millisecond_events() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    for id in ["evt_a", "evt_b", "evt_c"] {
        service
            .append_event(&RuntimeEvent {
                id: id.to_string(),
                event_type: "test.event".to_string(),
                scope: EventScope {
                    session_id: Some("ses_cursor".to_string()),
                    turn_id: None,
                    input_id: None,
                    message_id: None,
                    resource_id: None,
                    ..EventScope::default()
                },
                payload: json!({ "id": id }),
                occurred_at: 100,
            })
            .unwrap();
    }

    let first = service
        .query_events(QueryEvents {
            session_id: Some("ses_cursor".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(1),
        })
        .unwrap();
    assert_eq!(first[0].id, "evt_a");

    let next = service
        .query_events(QueryEvents {
            session_id: Some("ses_cursor".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: Some(first[0].occurred_at),
            after_event_id: Some(first[0].id.clone()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(
        next.iter()
            .map(|event| event.id.as_str())
            .collect::<Vec<_>>(),
        vec!["evt_b", "evt_c"]
    );

    let old_timestamp_only_cursor = service
        .query_events(QueryEvents {
            session_id: Some("ses_cursor".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: Some(100),
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert!(old_timestamp_only_cursor.is_empty());
}

#[test]
fn persists_lease_fenced_semantic_context_epoch_lifecycle() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    seed_context_turns(&service, "ses_ctx", 2);
    let canonical_before = service.list_session_messages("ses_ctx").unwrap();
    let wrong_job = claim_context_job(
        &service,
        "job_ctx_wrong_session",
        "worker_ctx_wrong_session",
        "ses_other",
    );
    let wrong_request = context_epoch_request(
        "ctxepoch_ctx_wrong_session",
        &wrong_job,
        "worker_ctx_wrong_session",
        &canonical_before,
        1,
        None,
        "f",
    );
    let wrong_error = service.begin_context_epoch(&wrong_request).unwrap_err();
    assert!(wrong_error
        .to_string()
        .contains("not authorized for its session"));
    let job = claim_context_job(&service, "job_ctx", "worker_ctx", "ses_ctx");
    let messages = service.list_session_messages("ses_ctx").unwrap();
    let request =
        context_epoch_request("ctxepoch_ctx", &job, "worker_ctx", &messages, 1, None, "a");

    let prepared = service.begin_context_epoch(&request).unwrap();
    assert_eq!(prepared.generation_state, "prepared");
    assert_eq!(service.begin_context_epoch(&request).unwrap(), prepared);

    let stale = service
        .mark_context_epoch_dispatched(&ContextEpochMutationIdentity {
            epoch_id: prepared.id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_ctx".to_string(),
            lease_token: "stale-lease".to_string(),
        })
        .unwrap_err();
    assert!(matches!(stale, SystemServiceError::Invariant(_)));

    let identity = context_epoch_identity(&prepared.id, &job, "worker_ctx");
    let first_dispatch = service.mark_context_epoch_dispatched(&identity).unwrap();
    assert_eq!(first_dispatch.generation_attempt, 1);
    let retryable = service
        .finish_context_epoch_generation(&FinishContextEpochGeneration {
            epoch_id: prepared.id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_ctx".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            generation_attempt: 1,
            outcome: "failed_before_output".to_string(),
            retryable: Some(true),
            summary: None,
            summary_digest: None,
            usage: None,
            error: Some(json!({ "category": "network" })),
            token_estimate_after: None,
            token_savings: None,
        })
        .unwrap();
    assert_eq!(retryable.state, "building");
    assert_eq!(retryable.generation_state, "failed_before_output");

    let second_dispatch = service.mark_context_epoch_dispatched(&identity).unwrap();
    assert_eq!(second_dispatch.generation_attempt, 2);
    service
        .mark_context_epoch_output_observed(&MarkContextEpochOutputObserved {
            epoch_id: prepared.id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_ctx".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            generation_attempt: 2,
        })
        .unwrap();
    let summary = "## Goal\nPreserve semantic context";
    let succeeded = service
        .finish_context_epoch_generation(&FinishContextEpochGeneration {
            epoch_id: prepared.id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_ctx".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            generation_attempt: 2,
            outcome: "succeeded".to_string(),
            retryable: None,
            summary: Some(summary.to_string()),
            summary_digest: Some(sha256_hex(summary.as_bytes())),
            usage: Some(json!({ "inputTokens": 80, "outputTokens": 12 })),
            error: None,
            token_estimate_after: Some(50),
            token_savings: Some(150),
        })
        .unwrap();
    assert_eq!(succeeded.generation_state, "succeeded");

    let active = service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: prepared.id,
            job_id: job.id,
            worker_id: "worker_ctx".to_string(),
            lease_token: job.lease_token.unwrap(),
            expected_previous_epoch_id: None,
        })
        .unwrap();
    assert_eq!(active.state, "active");
    assert_eq!(active.summary.as_deref(), Some(summary));
    assert_eq!(
        service
            .get_active_context_epoch(&GetActiveContextEpoch {
                session_id: "ses_ctx".to_string(),
            })
            .unwrap()
            .unwrap()
            .id,
        active.id
    );
    assert_eq!(
        service.list_session_messages("ses_ctx").unwrap(),
        canonical_before
    );
}

#[test]
fn rejects_stale_context_predecessor_and_prunes_superseded_epochs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    seed_context_turns(&service, "ses_ctx_race", 3);
    let messages = service.list_session_messages("ses_ctx_race").unwrap();

    let first_job = claim_context_job(
        &service,
        "job_ctx_first",
        "worker_ctx_first",
        "ses_ctx_race",
    );
    let first_request = context_epoch_request(
        "ctxepoch_ctx_first",
        &first_job,
        "worker_ctx_first",
        &messages,
        1,
        None,
        "b",
    );
    let first = complete_context_epoch(&service, &first_request, &first_job, "worker_ctx_first");
    let first_active = service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: first.id.clone(),
            job_id: first_job.id,
            worker_id: "worker_ctx_first".to_string(),
            lease_token: first_job.lease_token.unwrap(),
            expected_previous_epoch_id: None,
        })
        .unwrap();

    let candidate_job = claim_context_job(
        &service,
        "job_ctx_candidate",
        "worker_ctx_candidate",
        "ses_ctx_race",
    );
    let candidate_request = context_epoch_request(
        "ctxepoch_ctx_candidate",
        &candidate_job,
        "worker_ctx_candidate",
        &messages,
        3,
        Some(&first_active),
        "c",
    );
    let candidate = complete_context_epoch(
        &service,
        &candidate_request,
        &candidate_job,
        "worker_ctx_candidate",
    );

    let winner_job = claim_context_job(
        &service,
        "job_ctx_winner",
        "worker_ctx_winner",
        "ses_ctx_race",
    );
    let winner_request = context_epoch_request(
        "ctxepoch_ctx_winner",
        &winner_job,
        "worker_ctx_winner",
        &messages,
        3,
        Some(&first_active),
        "d",
    );
    let winner =
        complete_context_epoch(&service, &winner_request, &winner_job, "worker_ctx_winner");
    let winner = service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: winner.id,
            job_id: winner_job.id,
            worker_id: "worker_ctx_winner".to_string(),
            lease_token: winner_job.lease_token.unwrap(),
            expected_previous_epoch_id: Some(first_active.id.clone()),
        })
        .unwrap();

    let stale_activation = service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: candidate.id,
            job_id: candidate_job.id,
            worker_id: "worker_ctx_candidate".to_string(),
            lease_token: candidate_job.lease_token.unwrap(),
            expected_previous_epoch_id: Some(first_active.id),
        })
        .unwrap_err();
    assert!(matches!(stale_activation, SystemServiceError::Invariant(_)));
    assert_eq!(
        service
            .get_active_context_epoch(&GetActiveContextEpoch {
                session_id: "ses_ctx_race".to_string(),
            })
            .unwrap()
            .unwrap()
            .id,
        winner.id
    );

    let dry_run = service
        .prune_context_epochs(&PruneContextEpochs {
            session_id: "ses_ctx_race".to_string(),
            keep_last_superseded: Some(0),
            older_than_updated_at: None,
            dry_run: Some(true),
        })
        .unwrap();
    assert!(dry_run.dry_run);
    assert_eq!(dry_run.scanned_count, 1);
    assert_eq!(dry_run.deleted_epoch_ids, vec!["ctxepoch_ctx_first"]);
    assert_eq!(
        service
            .list_context_epochs(&ListContextEpochs {
                session_id: "ses_ctx_race".to_string(),
                state: Some("superseded".to_string()),
            })
            .unwrap()
            .len(),
        1
    );
    let pruned = service
        .prune_context_epochs(&PruneContextEpochs {
            session_id: "ses_ctx_race".to_string(),
            keep_last_superseded: Some(0),
            older_than_updated_at: None,
            dry_run: None,
        })
        .unwrap();
    assert_eq!(pruned.deleted_epoch_ids, vec!["ctxepoch_ctx_first"]);
}

fn seed_context_turns(service: &SystemService, session_id: &str, count: usize) {
    service
        .create_session(Some(session_id), None, Some("agent"))
        .unwrap();
    for index in 1..=count {
        let suffix = format!("{session_id}_{index}");
        let submission = submit_test_turn(
            service,
            TestTurn {
                session_id,
                input_id: &format!("inp_{suffix}"),
                turn_id: &format!("turn_{suffix}"),
                job_id: &format!("job_turn_{suffix}"),
                principal_id: "user_context",
                idempotency_key: &format!("idem_{suffix}"),
                text: "remember canonical context",
            },
        );
        settle_test_turn_success(service, &submission, &format!("worker_turn_{suffix}"));
    }
}

fn claim_context_job(
    service: &SystemService,
    job_id: &str,
    worker_id: &str,
    session_id: &str,
) -> SchedulerJobRecord {
    service
        .enqueue_job(&EnqueueJob {
            id: Some(job_id.to_string()),
            kind: SchedulerJobKind::MemoryCompaction,
            principal_id: "context_worker".to_string(),
            payload: json!({ "evidence": { "sessionId": session_id } }),
            scheduled_at: None,
            not_before: None,
            priority: None,
            concurrency_key: None,
            max_attempts: Some(1),
            retry_policy: None,
            idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap();
    service
        .claim_job(&ClaimJob {
            worker_id: worker_id.to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::MemoryCompaction]),
        })
        .unwrap()
        .unwrap()
}

fn context_epoch_request(
    epoch_id: &str,
    job: &SchedulerJobRecord,
    worker_id: &str,
    messages: &[wanex_system_service::SessionMessageRecord],
    cut_message_index: usize,
    previous: Option<&wanex_system_service::ContextEpochRecord>,
    digest_seed: &str,
) -> BeginContextEpoch {
    let cut = &messages[cut_message_index];
    let retained = &messages[cut_message_index + 1];
    let head = messages.last().unwrap();
    BeginContextEpoch {
        id: epoch_id.to_string(),
        session_id: cut.session_id.clone(),
        job_id: job.id.clone(),
        worker_id: worker_id.to_string(),
        lease_token: job.lease_token.clone().unwrap(),
        max_provider_attempts: 2,
        previous_epoch_id: previous.map(|epoch| epoch.id.clone()),
        previous_summary_digest: previous.and_then(|epoch| epoch.summary_digest.clone()),
        source_head_sequence: head.sequence,
        source_head_message_id: head.id.clone(),
        cut_sequence: cut.sequence,
        cut_message_id: cut.id.clone(),
        retained_from_sequence: retained.sequence,
        retained_from_message_id: retained.id.clone(),
        source_digest: digest_seed.repeat(64),
        policy: json!({ "algorithm": "semantic-summary", "seed": digest_seed }),
        policy_digest: digest_seed.repeat(64),
        model_endpoint: test_execution_binding(digest_seed)["modelEndpoint"].clone(),
        request_digest: digest_seed.repeat(64),
        token_estimate_before: 200,
    }
}

fn context_epoch_identity(
    epoch_id: &str,
    job: &SchedulerJobRecord,
    worker_id: &str,
) -> ContextEpochMutationIdentity {
    ContextEpochMutationIdentity {
        epoch_id: epoch_id.to_string(),
        job_id: job.id.clone(),
        worker_id: worker_id.to_string(),
        lease_token: job.lease_token.clone().unwrap(),
    }
}

fn complete_context_epoch(
    service: &SystemService,
    request: &BeginContextEpoch,
    job: &SchedulerJobRecord,
    worker_id: &str,
) -> wanex_system_service::ContextEpochRecord {
    let prepared = service.begin_context_epoch(request).unwrap();
    let dispatched = service
        .mark_context_epoch_dispatched(&context_epoch_identity(&prepared.id, job, worker_id))
        .unwrap();
    service
        .mark_context_epoch_output_observed(&MarkContextEpochOutputObserved {
            epoch_id: prepared.id.clone(),
            job_id: job.id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            generation_attempt: dispatched.generation_attempt,
        })
        .unwrap();
    let summary = format!("## Goal\nSummary for {}", prepared.id);
    service
        .finish_context_epoch_generation(&FinishContextEpochGeneration {
            epoch_id: prepared.id,
            job_id: job.id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            generation_attempt: dispatched.generation_attempt,
            outcome: "succeeded".to_string(),
            retryable: None,
            summary: Some(summary.clone()),
            summary_digest: Some(sha256_hex(summary.as_bytes())),
            usage: None,
            error: None,
            token_estimate_after: Some(50),
            token_savings: Some(150),
        })
        .unwrap()
}

#[test]
fn records_workspace_changesets_and_operation_history() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let changeset = json!({
        "id": "cs_system_workspace",
        "title": "System workspace test",
        "baseRevision": "rev_a",
        "changes": [
            {
                "path": "src/app.ts",
                "kind": "update",
                "baseText": "one\n",
                "targetText": "two\n"
            }
        ]
    });

    let first = service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_a".to_string(),
            principal_id: "agent_a".to_string(),
            changeset: changeset.clone(),
        })
        .unwrap();
    let duplicate = service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_a".to_string(),
            principal_id: "agent_a".to_string(),
            changeset: changeset.clone(),
        })
        .unwrap();
    assert_eq!(first.id, "cs_system_workspace");
    assert_eq!(duplicate.id, first.id);
    assert_eq!(first.current_state, "submitted");

    let operation = service
        .record_workspace_change_operation(&RecordWorkspaceChangeOperation {
            id: Some("wop_system_apply".to_string()),
            changeset_id: "cs_system_workspace".to_string(),
            operation: "apply".to_string(),
            receipt: json!({
                "changeSetId": "cs_system_workspace",
                "status": "applied",
                "files": [
                    {
                        "path": "src/app.ts",
                        "kind": "update",
                        "beforeText": "one\n",
                        "afterText": "two\n",
                        "beforeSha256": sha256_hex(b"one\n"),
                        "afterSha256": sha256_hex(b"two\n")
                    }
                ],
                "conflicts": []
            }),
        })
        .unwrap();
    assert_eq!(operation.status, "applied");

    let listed = service
        .list_workspace_changesets(&ListWorkspaceChangeSets {
            workspace_id: Some("workspace_a".to_string()),
            state: Some("applied".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].current_state, "applied");

    let operations = service
        .list_workspace_change_operations(&ListWorkspaceChangeOperations {
            changeset_id: "cs_system_workspace".to_string(),
        })
        .unwrap();
    assert_eq!(operations.len(), 1);
    assert_eq!(operations[0].id, "wop_system_apply");
}

#[test]
fn rejects_workspace_operation_receipt_mismatch() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_mismatch".to_string(),
            principal_id: "agent_mismatch".to_string(),
            changeset: json!({
                "id": "cs_workspace_mismatch",
                "changes": [
                    {
                        "path": "file.txt",
                        "kind": "create",
                        "targetText": "hello\n"
                    }
                ]
            }),
        })
        .unwrap();

    let error = service
        .record_workspace_change_operation(&RecordWorkspaceChangeOperation {
            id: None,
            changeset_id: "cs_workspace_mismatch".to_string(),
            operation: "apply".to_string(),
            receipt: json!({
                "changeSetId": "cs_other",
                "status": "applied",
                "files": [],
                "conflicts": []
            }),
        })
        .unwrap_err();

    assert!(matches!(error, SystemServiceError::Invariant(_)));
}

#[test]
fn records_workspace_change_proposal_review_history() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_review".to_string(),
            principal_id: "agent_review".to_string(),
            changeset: json!({
                "id": "cs_review",
                "title": "Review me",
                "changes": [
                    {
                        "path": "src/review.ts",
                        "kind": "create",
                        "targetText": "review\n"
                    }
                ]
            }),
        })
        .unwrap();

    let proposal = service
        .put_workspace_change_proposal(&PutWorkspaceChangeProposal {
            id: Some("wcp_review".to_string()),
            workspace_id: "workspace_review".to_string(),
            changeset_id: "cs_review".to_string(),
            principal_id: "agent_review".to_string(),
            title: Some("Review proposal".to_string()),
            summary: Some("A proposed change".to_string()),
            metadata: Some(json!({ "source": "test" })),
            idempotency_key: Some("review-key".to_string()),
        })
        .unwrap();
    let duplicate = service
        .put_workspace_change_proposal(&PutWorkspaceChangeProposal {
            id: None,
            workspace_id: "workspace_review".to_string(),
            changeset_id: "cs_review".to_string(),
            principal_id: "agent_review".to_string(),
            title: Some("Review proposal".to_string()),
            summary: Some("A proposed change".to_string()),
            metadata: Some(json!({ "source": "test" })),
            idempotency_key: Some("review-key".to_string()),
        })
        .unwrap();
    assert_eq!(proposal.id, "wcp_review");
    assert_eq!(duplicate.id, proposal.id);
    assert_eq!(proposal.state, "open");

    let approved = service
        .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
            id: Some("wcpo_approve".to_string()),
            proposal_id: "wcp_review".to_string(),
            operation: "approve".to_string(),
            actor_id: "user_review".to_string(),
            reason: Some("looks good".to_string()),
            metadata: None,
        })
        .unwrap();
    assert_eq!(approved.from_state, "open");
    assert_eq!(approved.to_state, "approved");

    let apply_requested = service
        .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
            id: Some("wcpo_apply".to_string()),
            proposal_id: "wcp_review".to_string(),
            operation: "request_apply".to_string(),
            actor_id: "user_review".to_string(),
            reason: None,
            metadata: Some(json!({ "target": "workspace" })),
        })
        .unwrap();
    assert_eq!(apply_requested.from_state, "approved");
    assert_eq!(apply_requested.to_state, "apply_requested");

    let fetched = service
        .get_workspace_change_proposal("wcp_review")
        .unwrap()
        .unwrap();
    assert_eq!(fetched.state, "apply_requested");
    assert_eq!(fetched.closed_at, None);

    let listed = service
        .list_workspace_change_proposals(&ListWorkspaceChangeProposals {
            workspace_id: Some("workspace_review".to_string()),
            state: Some("apply_requested".to_string()),
            changeset_id: Some("cs_review".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "wcp_review");

    let operations = service
        .list_workspace_change_proposal_operations(&ListWorkspaceChangeProposalOperations {
            proposal_id: "wcp_review".to_string(),
        })
        .unwrap();
    assert_eq!(
        operations
            .iter()
            .map(|operation| operation.operation.as_str())
            .collect::<Vec<_>>(),
        vec!["approve", "request_apply"]
    );

    let retired_terminal_operation = service
        .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
            id: None,
            proposal_id: "wcp_review".to_string(),
            operation: "mark_applied".to_string(),
            actor_id: "proposal_apply_runtime".to_string(),
            reason: None,
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(
        retired_terminal_operation,
        SystemServiceError::Invariant(_)
    ));
}

#[test]
fn claims_renews_and_fences_workspace_proposal_apply() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_apply_requested_proposal(&service, "wcp_claim", "cs_claim");
    let token = "a".repeat(43);

    let claimed = service
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            owner_id: "host_claim".to_string(),
            claim_token: token.clone(),
            lease_ms: 60_000,
            metadata: Some(json!({ "source": "test" })),
        })
        .unwrap();
    assert_eq!(claimed.status, "claimed");
    assert_eq!(claimed.proposal.state, "applying");
    assert_eq!(claimed.attempt.as_ref().unwrap().state, "active");
    let persisted_token_hash: String = rusqlite::Connection::open(service.db_path())
        .unwrap()
        .query_row(
            "SELECT claim_token_sha256 FROM workspace_change_proposal_apply_attempt WHERE id = ?",
            ["wcpa_claim"],
            |row| row.get(0),
        )
        .unwrap();
    assert_ne!(persisted_token_hash, token);
    assert_eq!(persisted_token_hash.len(), 64);
    let serialized_attempt = serde_json::to_value(claimed.attempt.as_ref().unwrap()).unwrap();
    assert!(serialized_attempt.get("claim_token_sha256").is_none());
    assert!(serialized_attempt.get("claimTokenSha256").is_none());

    let busy = service
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_loser".to_string(),
            owner_id: "host_loser".to_string(),
            claim_token: "b".repeat(43),
            lease_ms: 60_000,
            metadata: None,
        })
        .unwrap();
    assert_eq!(busy.status, "busy");

    let stale = service
        .renew_workspace_change_proposal_apply(&RenewWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: "wrong-token-that-is-at-least-32-bytes".to_string(),
            lease_ms: 60_000,
        })
        .unwrap_err();
    assert!(matches!(stale, SystemServiceError::Conflict(_)));

    let renewed = service
        .renew_workspace_change_proposal_apply(&RenewWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    assert!(renewed.lease_expires_at >= claimed.attempt.unwrap().lease_expires_at);

    let missing_evidence = service
        .settle_workspace_change_proposal_apply(&SettleWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: token.clone(),
            outcome: "applied".to_string(),
            workspace_operation_id: None,
            failure: None,
        })
        .unwrap_err();
    assert!(matches!(
        missing_evidence,
        SystemServiceError::InvalidInput(_)
    ));

    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_claim".to_string(),
            principal_id: "agent_claim".to_string(),
            changeset: json!({
                "id": "cs_foreign_claim",
                "changes": [{ "path": "foreign.txt", "kind": "create", "targetText": "no\n" }]
            }),
        })
        .unwrap();
    let foreign_operation = service
        .record_workspace_change_operation(&RecordWorkspaceChangeOperation {
            id: Some("wop_foreign_claim".to_string()),
            changeset_id: "cs_foreign_claim".to_string(),
            operation: "apply".to_string(),
            receipt: json!({
                "changeSetId": "cs_foreign_claim",
                "status": "applied",
                "files": [],
                "conflicts": []
            }),
        })
        .unwrap();
    let foreign_evidence = service
        .settle_workspace_change_proposal_apply(&SettleWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: token.clone(),
            outcome: "applied".to_string(),
            workspace_operation_id: Some(foreign_operation.id),
            failure: None,
        })
        .unwrap_err();
    assert!(matches!(foreign_evidence, SystemServiceError::Conflict(_)));

    let workspace_operation = service
        .record_workspace_change_operation(&RecordWorkspaceChangeOperation {
            id: Some("wop_claim".to_string()),
            changeset_id: "cs_claim".to_string(),
            operation: "apply".to_string(),
            receipt: json!({
                "changeSetId": "cs_claim",
                "status": "applied",
                "files": [],
                "conflicts": []
            }),
        })
        .unwrap();
    let wrong_settlement_token = service
        .settle_workspace_change_proposal_apply(&SettleWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: "wrong-token-that-is-at-least-32-bytes".to_string(),
            outcome: "applied".to_string(),
            workspace_operation_id: Some(workspace_operation.id.clone()),
            failure: None,
        })
        .unwrap_err();
    assert!(matches!(
        wrong_settlement_token,
        SystemServiceError::Conflict(_)
    ));

    let settled = service
        .settle_workspace_change_proposal_apply(&SettleWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: token.clone(),
            outcome: "applied".to_string(),
            workspace_operation_id: Some(workspace_operation.id),
            failure: None,
        })
        .unwrap();
    assert_eq!(settled.proposal.state, "applied");
    assert_eq!(settled.attempt.state, "applied");
    assert!(settled.attempt.finished_at.is_some());

    let old_owner = service
        .settle_workspace_change_proposal_apply(&SettleWorkspaceChangeProposalApply {
            proposal_id: "wcp_claim".to_string(),
            attempt_id: "wcpa_claim".to_string(),
            claim_token: token,
            outcome: "apply_failed".to_string(),
            workspace_operation_id: None,
            failure: Some(json!({ "message": "late" })),
        })
        .unwrap_err();
    assert!(matches!(old_owner, SystemServiceError::Conflict(_)));
}

#[test]
fn expired_workspace_proposal_apply_requires_recovery_and_survives_restart() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_apply_requested_proposal(&service, "wcp_expire", "cs_expire");
    service
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_expire".to_string(),
            attempt_id: "wcpa_expire".to_string(),
            owner_id: "host_expire".to_string(),
            claim_token: "c".repeat(43),
            lease_ms: 10,
            metadata: None,
        })
        .unwrap();
    drop(service);
    std::thread::sleep(std::time::Duration::from_millis(20));

    let restarted = SystemService::open(dir.path()).unwrap();
    let recovery = restarted
        .mark_workspace_change_proposal_recovery_required(
            &MarkWorkspaceChangeProposalRecoveryRequired {
                proposal_id: "wcp_expire".to_string(),
            },
        )
        .unwrap();
    assert_eq!(recovery.status, "marked");
    assert_eq!(recovery.proposal.state, "recovery_required");
    assert_eq!(recovery.attempt.unwrap().state, "recovery_required");

    let retry = restarted
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_expire".to_string(),
            attempt_id: "wcpa_retry".to_string(),
            owner_id: "host_retry".to_string(),
            claim_token: "d".repeat(43),
            lease_ms: 60_000,
            metadata: None,
        })
        .unwrap();
    assert_eq!(retry.status, "recovery_required");
}

#[test]
fn active_workspace_proposal_apply_reports_ambiguous_mutation_for_recovery() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_apply_requested_proposal(&service, "wcp_ambiguous", "cs_ambiguous");
    let token = "ambiguous-token-that-is-at-least-32-bytes".to_string();
    service
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_ambiguous".to_string(),
            attempt_id: "wcpa_ambiguous".to_string(),
            owner_id: "host_ambiguous".to_string(),
            claim_token: token.clone(),
            lease_ms: 60_000,
            metadata: None,
        })
        .unwrap();

    let settled = service
        .settle_workspace_change_proposal_apply(&SettleWorkspaceChangeProposalApply {
            proposal_id: "wcp_ambiguous".to_string(),
            attempt_id: "wcpa_ambiguous".to_string(),
            claim_token: token,
            outcome: "recovery_required".to_string(),
            workspace_operation_id: None,
            failure: Some(json!({ "type": "workspace.apply_error" })),
        })
        .unwrap();
    assert_eq!(settled.proposal.state, "recovery_required");
    assert_eq!(settled.proposal.closed_at, None);
    assert_eq!(settled.attempt.state, "recovery_required");
    assert_eq!(
        settled.attempt.failure,
        Some(json!({ "type": "workspace.apply_error" }))
    );
    assert!(settled.attempt.finished_at.is_some());

    let retry = service
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_ambiguous".to_string(),
            attempt_id: "wcpa_ambiguous_retry".to_string(),
            owner_id: "host_ambiguous_retry".to_string(),
            claim_token: "ambiguous-retry-token-that-is-at-least-32-bytes".to_string(),
            lease_ms: 60_000,
            metadata: None,
        })
        .unwrap();
    assert_eq!(retry.status, "recovery_required");
}

#[test]
fn concurrent_workspace_proposal_apply_has_one_claim_winner() {
    let dir = tempdir().unwrap();
    let service = Arc::new(SystemService::open(dir.path()).unwrap());
    put_apply_requested_proposal(&service, "wcp_concurrent_claim", "cs_concurrent_claim");
    let barrier = Arc::new(Barrier::new(100));
    let mut workers = Vec::new();
    for index in 0..100 {
        let service = Arc::clone(&service);
        let barrier = Arc::clone(&barrier);
        workers.push(std::thread::spawn(move || {
            barrier.wait();
            service
                .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
                    proposal_id: "wcp_concurrent_claim".to_string(),
                    attempt_id: format!("wcpa_concurrent_{index}"),
                    owner_id: format!("host_concurrent_{index}"),
                    claim_token: format!("token-concurrent-{index:03}-{}", "x".repeat(32)),
                    lease_ms: 60_000,
                    metadata: None,
                })
                .unwrap()
                .status
        }));
    }
    let statuses = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        statuses
            .iter()
            .filter(|status| *status == "claimed")
            .count(),
        1
    );
    assert_eq!(
        statuses.iter().filter(|status| *status == "busy").count(),
        99
    );
}

#[test]
fn independent_services_fence_concurrent_workspace_proposal_apply() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_apply_requested_proposal(
        &service,
        "wcp_cross_service_claim",
        "cs_cross_service_claim",
    );
    let root = dir.path().to_path_buf();
    let barrier = Arc::new(Barrier::new(32));
    let workers = (0..32)
        .map(|index| {
            let root = root.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let service = SystemService::open(root).unwrap();
                barrier.wait();
                service
                    .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
                        proposal_id: "wcp_cross_service_claim".to_string(),
                        attempt_id: format!("wcpa_cross_service_{index}"),
                        owner_id: format!("host_cross_service_{index}"),
                        claim_token: format!("token-cross-service-{index:03}-{}", "x".repeat(32)),
                        lease_ms: 60_000,
                        metadata: None,
                    })
                    .unwrap()
                    .status
            })
        })
        .collect::<Vec<_>>();
    let statuses = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        statuses
            .iter()
            .filter(|status| *status == "claimed")
            .count(),
        1
    );
    assert_eq!(
        statuses.iter().filter(|status| *status == "busy").count(),
        31
    );
}

#[test]
fn workspace_change_transaction_finalizes_operation_from_durable_file_evidence() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_transaction_changeset(&service, "cs_tx_apply", "workspace_tx_apply");
    let claim_token = format!("transaction-token-{}", "x".repeat(32));
    let claim = service
        .begin_workspace_change_transaction(&BeginWorkspaceChangeTransaction {
            id: "wtx_apply".to_string(),
            workspace_id: "workspace_tx_apply".to_string(),
            changeset_id: "cs_tx_apply".to_string(),
            operation: "apply".to_string(),
            undo_source_operation_id: None,
            source_kind: "host".to_string(),
            source_id: "host-request-apply".to_string(),
            idempotency_key: "workspace-tx:apply".to_string(),
            root_identity_sha256: "a".repeat(64),
            proposal: None,
            attempt_id: "wtxa_apply".to_string(),
            owner_id: "host_apply".to_string(),
            claim_token: claim_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    assert_eq!(claim.status, "claimed");
    let serialized = serde_json::to_string(&claim).unwrap();
    assert!(!serialized.contains(&claim_token));
    assert!(!serialized.contains("claim_token_sha256"));

    let plan = transaction_file_plan(0, "src/main.ts", Some("before"), Some("after"));
    let snapshot = service
        .record_workspace_change_transaction_plan(&RecordWorkspaceChangeTransactionPlan {
            transaction_id: "wtx_apply".to_string(),
            attempt_id: "wtxa_apply".to_string(),
            claim_token: claim_token.clone(),
            files: vec![plan.clone()],
        })
        .unwrap();
    assert_eq!(snapshot.transaction.state, "planning");
    assert!(snapshot.transaction.plan_digest.is_some());
    assert_eq!(snapshot.files[0].state, "pending");

    let replay = service
        .record_workspace_change_transaction_plan(&RecordWorkspaceChangeTransactionPlan {
            transaction_id: "wtx_apply".to_string(),
            attempt_id: "wtxa_apply".to_string(),
            claim_token: claim_token.clone(),
            files: vec![plan],
        })
        .unwrap();
    assert_eq!(
        replay.transaction.plan_digest,
        snapshot.transaction.plan_digest
    );

    service
        .mark_workspace_change_transaction_prepared(&MarkWorkspaceChangeTransactionPrepared {
            transaction_id: "wtx_apply".to_string(),
            attempt_id: "wtxa_apply".to_string(),
            claim_token: claim_token.clone(),
        })
        .unwrap();
    service
        .begin_workspace_change_transaction_commit(&BeginWorkspaceChangeTransactionCommit {
            transaction_id: "wtx_apply".to_string(),
            attempt_id: "wtxa_apply".to_string(),
            claim_token: claim_token.clone(),
        })
        .unwrap();
    service
        .record_workspace_change_transaction_file_committed(
            &RecordWorkspaceChangeTransactionFileCommitted {
                transaction_id: "wtx_apply".to_string(),
                attempt_id: "wtxa_apply".to_string(),
                claim_token: claim_token.clone(),
                ordinal: 0,
            },
        )
        .unwrap();

    let finalize = FinalizeWorkspaceChangeTransaction {
        transaction_id: "wtx_apply".to_string(),
        attempt_id: "wtxa_apply".to_string(),
        claim_token: claim_token.clone(),
        outcome: "applied".to_string(),
        operation_id: Some("wop_tx_apply".to_string()),
        receipt: Some(json!({
            "changeSetId": "cs_tx_apply",
            "status": "applied",
            "files": [],
            "conflicts": []
        })),
        failure: None,
    };
    let finalization = service
        .finalize_workspace_change_transaction(&finalize)
        .unwrap();
    assert_eq!(finalization.snapshot.transaction.state, "applied");
    assert_eq!(finalization.operation.unwrap().id, "wop_tx_apply");
    assert!(finalization.snapshot.active_attempt.is_none());

    let replay = service
        .finalize_workspace_change_transaction(&finalize)
        .unwrap();
    assert_eq!(replay.snapshot.transaction.state, "applied");
    assert_eq!(
        service
            .list_workspace_change_operations(&ListWorkspaceChangeOperations {
                changeset_id: "cs_tx_apply".to_string(),
            })
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn workspace_change_transaction_atomically_settles_bound_proposal() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_apply_requested_proposal(&service, "wcp_tx_apply", "cs_tx_proposal");
    let proposal_token = format!("proposal-token-{}", "p".repeat(32));
    service
        .claim_workspace_change_proposal_apply(&ClaimWorkspaceChangeProposalApply {
            proposal_id: "wcp_tx_apply".to_string(),
            attempt_id: "wcpa_tx_apply".to_string(),
            owner_id: "proposal_host".to_string(),
            claim_token: proposal_token.clone(),
            lease_ms: 60_000,
            metadata: None,
        })
        .unwrap();
    let transaction_token = format!("transaction-token-{}", "t".repeat(32));
    service
        .begin_workspace_change_transaction(&BeginWorkspaceChangeTransaction {
            id: "wtx_proposal".to_string(),
            workspace_id: "workspace_claim".to_string(),
            changeset_id: "cs_tx_proposal".to_string(),
            operation: "apply".to_string(),
            undo_source_operation_id: None,
            source_kind: "proposal".to_string(),
            source_id: "wcp_tx_apply".to_string(),
            idempotency_key: "workspace-tx:proposal".to_string(),
            root_identity_sha256: "b".repeat(64),
            proposal: Some(WorkspaceChangeTransactionProposalBinding {
                proposal_id: "wcp_tx_apply".to_string(),
                proposal_attempt_id: "wcpa_tx_apply".to_string(),
                proposal_claim_token: proposal_token,
            }),
            attempt_id: "wtxa_proposal".to_string(),
            owner_id: "proposal_host".to_string(),
            claim_token: transaction_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    service
        .record_workspace_change_transaction_plan(&RecordWorkspaceChangeTransactionPlan {
            transaction_id: "wtx_proposal".to_string(),
            attempt_id: "wtxa_proposal".to_string(),
            claim_token: transaction_token.clone(),
            files: vec![transaction_file_plan(
                0,
                "proposal.txt",
                Some("before"),
                Some("after"),
            )],
        })
        .unwrap();
    service
        .mark_workspace_change_transaction_prepared(&MarkWorkspaceChangeTransactionPrepared {
            transaction_id: "wtx_proposal".to_string(),
            attempt_id: "wtxa_proposal".to_string(),
            claim_token: transaction_token.clone(),
        })
        .unwrap();
    service
        .begin_workspace_change_transaction_commit(&BeginWorkspaceChangeTransactionCommit {
            transaction_id: "wtx_proposal".to_string(),
            attempt_id: "wtxa_proposal".to_string(),
            claim_token: transaction_token.clone(),
        })
        .unwrap();
    service
        .record_workspace_change_transaction_file_committed(
            &RecordWorkspaceChangeTransactionFileCommitted {
                transaction_id: "wtx_proposal".to_string(),
                attempt_id: "wtxa_proposal".to_string(),
                claim_token: transaction_token.clone(),
                ordinal: 0,
            },
        )
        .unwrap();
    let result = service
        .finalize_workspace_change_transaction(&FinalizeWorkspaceChangeTransaction {
            transaction_id: "wtx_proposal".to_string(),
            attempt_id: "wtxa_proposal".to_string(),
            claim_token: transaction_token,
            outcome: "applied".to_string(),
            operation_id: Some("wop_tx_proposal".to_string()),
            receipt: Some(json!({
                "changeSetId": "cs_tx_proposal",
                "status": "applied",
                "files": [],
                "conflicts": []
            })),
            failure: None,
        })
        .unwrap();
    assert_eq!(result.proposal.unwrap().state, "applied");
    let proposal_attempt = result.proposal_attempt.unwrap();
    assert_eq!(proposal_attempt.state, "applied");
    assert_eq!(
        proposal_attempt.workspace_operation_id.as_deref(),
        Some("wop_tx_proposal")
    );
}

#[test]
fn workspace_change_transaction_recovery_fences_old_owner_and_persists_decision() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    put_transaction_changeset(&service, "cs_tx_recovery", "workspace_tx_recovery");
    let old_token = format!("old-transaction-token-{}", "o".repeat(32));
    service
        .begin_workspace_change_transaction(&BeginWorkspaceChangeTransaction {
            id: "wtx_recovery".to_string(),
            workspace_id: "workspace_tx_recovery".to_string(),
            changeset_id: "cs_tx_recovery".to_string(),
            operation: "apply".to_string(),
            undo_source_operation_id: None,
            source_kind: "tool".to_string(),
            source_id: "tool-call-recovery".to_string(),
            idempotency_key: "workspace-tx:recovery".to_string(),
            root_identity_sha256: "c".repeat(64),
            proposal: None,
            attempt_id: "wtxa_old".to_string(),
            owner_id: "old_host".to_string(),
            claim_token: old_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    service
        .record_workspace_change_transaction_plan(&RecordWorkspaceChangeTransactionPlan {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_old".to_string(),
            claim_token: old_token.clone(),
            files: vec![
                transaction_file_plan(0, "first.txt", Some("one"), Some("ONE")),
                transaction_file_plan(1, "second.txt", Some("two"), Some("TWO")),
            ],
        })
        .unwrap();
    service
        .mark_workspace_change_transaction_prepared(&MarkWorkspaceChangeTransactionPrepared {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_old".to_string(),
            claim_token: old_token.clone(),
        })
        .unwrap();
    service
        .begin_workspace_change_transaction_commit(&BeginWorkspaceChangeTransactionCommit {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_old".to_string(),
            claim_token: old_token.clone(),
        })
        .unwrap();
    service
        .record_workspace_change_transaction_file_committed(
            &RecordWorkspaceChangeTransactionFileCommitted {
                transaction_id: "wtx_recovery".to_string(),
                attempt_id: "wtxa_old".to_string(),
                claim_token: old_token.clone(),
                ordinal: 0,
            },
        )
        .unwrap();
    rusqlite::Connection::open(service.db_path())
        .unwrap()
        .execute(
            "UPDATE workspace_change_transaction_attempt SET lease_expires_at = 0 WHERE id = ?",
            ["wtxa_old"],
        )
        .unwrap();

    let recovery_token = format!("recovery-token-{}", "r".repeat(32));
    let recovery = service
        .claim_workspace_change_transaction_recovery(&ClaimWorkspaceChangeTransactionRecovery {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_recovery".to_string(),
            owner_id: "recovery_host".to_string(),
            claim_token: recovery_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    assert_eq!(recovery.status, "claimed");
    assert!(matches!(
        service.renew_workspace_change_transaction(&RenewWorkspaceChangeTransaction {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_old".to_string(),
            claim_token: old_token,
            lease_ms: 60_000,
        }),
        Err(SystemServiceError::Conflict(_))
    ));
    let reconciliation = service
        .reconcile_workspace_change_transaction_files(&ReconcileWorkspaceChangeTransactionFiles {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_recovery".to_string(),
            claim_token: recovery_token.clone(),
            observations: vec![
                WorkspaceChangeTransactionFileObservation {
                    ordinal: 0,
                    current: "after".to_string(),
                },
                WorkspaceChangeTransactionFileObservation {
                    ordinal: 1,
                    current: "before".to_string(),
                },
            ],
        })
        .unwrap();
    assert_eq!(reconciliation.decision, "finish_forward");
    assert_eq!(
        reconciliation
            .snapshot
            .transaction
            .recovery_decision
            .as_deref(),
        Some("finish_forward")
    );
    service
        .record_workspace_change_transaction_file_committed(
            &RecordWorkspaceChangeTransactionFileCommitted {
                transaction_id: "wtx_recovery".to_string(),
                attempt_id: "wtxa_recovery".to_string(),
                claim_token: recovery_token.clone(),
                ordinal: 1,
            },
        )
        .unwrap();
    let finalized = service
        .finalize_workspace_change_transaction(&FinalizeWorkspaceChangeTransaction {
            transaction_id: "wtx_recovery".to_string(),
            attempt_id: "wtxa_recovery".to_string(),
            claim_token: recovery_token,
            outcome: "applied".to_string(),
            operation_id: Some("wop_tx_recovery".to_string()),
            receipt: Some(json!({
                "changeSetId": "cs_tx_recovery",
                "status": "applied",
                "files": [],
                "conflicts": []
            })),
            failure: None,
        })
        .unwrap();
    assert_eq!(finalized.snapshot.transaction.state, "applied");
}

#[test]
fn workspace_task_run_atomically_projects_and_survives_reopen() {
    let root = tempdir().unwrap();
    let service = SystemService::open(root.path()).unwrap();
    let token = "task-execution-token-00000000000000000000000000000000".to_string();
    let identity = WorkspaceTaskRunIdentity {
        run_id: "wtsk_atomic".to_string(),
        attempt_id: "wtat_atomic".to_string(),
        claim_token: token.clone(),
    };
    let claim = service
        .begin_workspace_task_run(&BeginWorkspaceTaskRun {
            id: identity.run_id.clone(),
            workspace_id: "workspace_task_atomic".to_string(),
            principal_id: "agent_task_atomic".to_string(),
            access: "writable".to_string(),
            repository_id: "repo_task_atomic".to_string(),
            isolation_id: "wiso_task_atomic".to_string(),
            attempt_id: identity.attempt_id.clone(),
            owner_id: "host_task_atomic".to_string(),
            claim_token: token,
            lease_ms: 60_000,
        })
        .unwrap();
    assert_eq!(claim.status, "claimed");
    assert_eq!(claim.snapshot.run.state, "preparing");
    assert!(!serde_json::to_string(&claim).unwrap().contains("token"));

    let exact_replay = service
        .begin_workspace_task_run(&BeginWorkspaceTaskRun {
            id: identity.run_id.clone(),
            workspace_id: "workspace_task_atomic".to_string(),
            principal_id: "agent_task_atomic".to_string(),
            access: "writable".to_string(),
            repository_id: "repo_task_atomic".to_string(),
            isolation_id: "wiso_task_atomic".to_string(),
            attempt_id: identity.attempt_id.clone(),
            owner_id: "host_task_atomic".to_string(),
            claim_token: identity.claim_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    assert_eq!(exact_replay.status, "claimed");
    assert!(matches!(
        service.begin_workspace_task_run(&BeginWorkspaceTaskRun {
            id: identity.run_id.clone(),
            workspace_id: "workspace_task_changed".to_string(),
            principal_id: "agent_task_atomic".to_string(),
            access: "writable".to_string(),
            repository_id: "repo_task_atomic".to_string(),
            isolation_id: "wiso_task_atomic".to_string(),
            attempt_id: identity.attempt_id.clone(),
            owner_id: "host_task_atomic".to_string(),
            claim_token: identity.claim_token.clone(),
            lease_ms: 60_000,
        }),
        Err(SystemServiceError::Conflict(_))
    ));
    assert!(matches!(
        service.begin_workspace_task_run(&BeginWorkspaceTaskRun {
            id: identity.run_id.clone(),
            workspace_id: "workspace_task_atomic".to_string(),
            principal_id: "agent_task_atomic".to_string(),
            access: "writable".to_string(),
            repository_id: "repo_task_atomic".to_string(),
            isolation_id: "wiso_task_atomic".to_string(),
            attempt_id: identity.attempt_id.clone(),
            owner_id: "host_task_changed".to_string(),
            claim_token: "task-changed-token-000000000000000000000000000000000".to_string(),
            lease_ms: 60_000,
        }),
        Err(SystemServiceError::Conflict(_))
    ));

    let base_revision = "a".repeat(40);
    service
        .mark_workspace_task_active(&MarkWorkspaceTaskActive {
            run_id: identity.run_id.clone(),
            attempt_id: identity.attempt_id.clone(),
            claim_token: identity.claim_token.clone(),
            base_revision: Some(base_revision.clone()),
            runtime_ref: Some("refs/heads/wanex/task-atomic".to_string()),
        })
        .unwrap();
    let collection = BeginWorkspaceTaskCollection {
        run_id: identity.run_id.clone(),
        attempt_id: identity.attempt_id.clone(),
        claim_token: identity.claim_token.clone(),
        execution_outcome: "completed".to_string(),
        summary: Some("created task output".to_string()),
        resource_ids: vec!["res_task_log".to_string()],
        failure: None,
    };
    service
        .begin_workspace_task_collection(&collection)
        .unwrap();
    assert_eq!(
        service
            .begin_workspace_task_collection(&collection)
            .unwrap()
            .run
            .state,
        "collecting"
    );
    let mut changed_collection = collection.clone();
    changed_collection.summary = Some("changed evidence".to_string());
    assert!(matches!(
        service.begin_workspace_task_collection(&changed_collection),
        Err(SystemServiceError::Conflict(_))
    ));
    let finalization = FinalizeWorkspaceTaskCollection {
        run_id: identity.run_id.clone(),
        attempt_id: identity.attempt_id.clone(),
        claim_token: identity.claim_token.clone(),
        outcome: "proposed".to_string(),
        changeset: Some(json!({
            "id": "wcs_task_atomic",
            "baseRevision": base_revision,
            "changes": [{
                "path": "src/task.ts",
                "kind": "create",
                "targetText": "export const task = true\n"
            }]
        })),
        proposal_id: Some("wcp_task_atomic".to_string()),
        title: Some("Task output".to_string()),
        proposal_metadata: Some(json!({ "incomplete": false })),
    };
    let proposed = service
        .finalize_workspace_task_collection(&finalization)
        .unwrap();
    assert_eq!(proposed.run.state, "proposed");
    assert_eq!(
        proposed.run.changeset_id.as_deref(),
        Some("wcs_task_atomic")
    );
    assert_eq!(proposed.run.proposal_id.as_deref(), Some("wcp_task_atomic"));
    assert!(service
        .get_workspace_changeset("wcs_task_atomic")
        .unwrap()
        .is_some());
    assert!(service
        .get_workspace_change_proposal("wcp_task_atomic")
        .unwrap()
        .is_some());
    assert_eq!(
        service
            .finalize_workspace_task_collection(&finalization)
            .unwrap()
            .run
            .proposal_id
            .as_deref(),
        Some("wcp_task_atomic")
    );
    let mut changed_finalization = finalization.clone();
    changed_finalization.proposal_metadata = Some(json!({ "incomplete": true }));
    assert!(matches!(
        service.finalize_workspace_task_collection(&changed_finalization),
        Err(SystemServiceError::Conflict(_))
    ));

    service.begin_workspace_task_release(&identity).unwrap();
    service.finalize_workspace_task_release(&identity).unwrap();
    assert_eq!(
        service
            .finalize_workspace_task_release(&identity)
            .unwrap()
            .run
            .state,
        "released"
    );
    drop(service);

    let reopened = SystemService::open(root.path()).unwrap();
    let restored = reopened
        .get_workspace_task_run("wtsk_atomic")
        .unwrap()
        .unwrap();
    assert_eq!(restored.run.state, "released");
    assert_eq!(restored.run.outcome.as_deref(), Some("proposed"));
    assert!(restored.active_attempt.is_none());
    let attempts = reopened
        .list_workspace_task_attempts(&ListWorkspaceTaskAttempts {
            run_id: "wtsk_atomic".to_string(),
            limit: None,
        })
        .unwrap();
    assert_eq!(attempts.len(), 1);
    assert_eq!(attempts[0].state, "completed");
    let serialized = serde_json::to_string(&restored).unwrap();
    assert!(!serialized.contains(root.path().to_string_lossy().as_ref()));
    assert!(!serialized.contains("task-execution-token"));
    let events = reopened
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap();
    let serialized_events = serde_json::to_string(&events).unwrap();
    assert!(!serialized_events.contains(root.path().to_string_lossy().as_ref()));
    assert!(!serialized_events.contains(&identity.claim_token));
    assert!(!serialized_events.contains("src/task.ts"));
}

#[test]
fn workspace_task_recovery_fences_expired_owner_and_lists_due_run() {
    let root = tempdir().unwrap();
    let service = SystemService::open(root.path()).unwrap();
    let old_token = "task-old-owner-token-0000000000000000000000000000000".to_string();
    service
        .begin_workspace_task_run(&BeginWorkspaceTaskRun {
            id: "wtsk_recovery".to_string(),
            workspace_id: "workspace_task_recovery".to_string(),
            principal_id: "agent_task_recovery".to_string(),
            access: "writable".to_string(),
            repository_id: "repo_task_recovery".to_string(),
            isolation_id: "wiso_task_recovery".to_string(),
            attempt_id: "wtat_old".to_string(),
            owner_id: "host_old".to_string(),
            claim_token: old_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute(
        "UPDATE workspace_task_attempt SET lease_expires_at = 0 WHERE id = ?",
        ["wtat_old"],
    )
    .unwrap();
    let due = service
        .list_workspace_task_runs(&ListWorkspaceTaskRuns {
            workspace_id: Some("workspace_task_recovery".to_string()),
            repository_id: Some("repo_task_recovery".to_string()),
            state: Some("preparing".to_string()),
            lease_expires_before: Some(test_now_ms()),
            limit: None,
        })
        .unwrap();
    assert_eq!(due.len(), 1);
    let other_repository = service
        .list_workspace_task_runs(&ListWorkspaceTaskRuns {
            workspace_id: Some("workspace_task_recovery".to_string()),
            repository_id: Some("repo_task_other".to_string()),
            state: Some("preparing".to_string()),
            lease_expires_before: Some(test_now_ms()),
            limit: None,
        })
        .unwrap();
    assert!(other_repository.is_empty());

    let recovery_token = "task-recovery-token-00000000000000000000000000000000".to_string();
    let claimed = service
        .claim_workspace_task_recovery(&ClaimWorkspaceTaskRecovery {
            run_id: "wtsk_recovery".to_string(),
            attempt_id: "wtat_recovery".to_string(),
            owner_id: "host_recovery".to_string(),
            claim_token: recovery_token.clone(),
            lease_ms: 60_000,
        })
        .unwrap();
    assert_eq!(claimed.status, "claimed");
    assert_eq!(claimed.snapshot.active_attempt.unwrap().kind, "recovery");
    assert!(matches!(
        service.mark_workspace_task_active(&MarkWorkspaceTaskActive {
            run_id: "wtsk_recovery".to_string(),
            attempt_id: "wtat_old".to_string(),
            claim_token: old_token,
            base_revision: Some("b".repeat(40)),
            runtime_ref: Some("refs/heads/wanex/stale".to_string()),
        }),
        Err(SystemServiceError::Conflict(_))
    ));
    let active = service
        .mark_workspace_task_active(&MarkWorkspaceTaskActive {
            run_id: "wtsk_recovery".to_string(),
            attempt_id: "wtat_recovery".to_string(),
            claim_token: recovery_token,
            base_revision: Some("b".repeat(40)),
            runtime_ref: Some("refs/heads/wanex/recovered".to_string()),
        })
        .unwrap();
    assert_eq!(active.run.state, "active");
    let attempts = service
        .list_workspace_task_attempts(&ListWorkspaceTaskAttempts {
            run_id: "wtsk_recovery".to_string(),
            limit: None,
        })
        .unwrap();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0].state, "expired");
    assert_eq!(attempts[1].state, "active");
}

#[test]
fn workspace_task_proposal_conflict_rolls_back_changeset_and_run_linkage() {
    let root = tempdir().unwrap();
    let service = SystemService::open(root.path()).unwrap();
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_existing".to_string(),
            principal_id: "agent_existing".to_string(),
            changeset: json!({
                "id": "wcs_existing",
                "changes": [{
                    "path": "existing.txt",
                    "kind": "create",
                    "targetText": "existing\n"
                }]
            }),
        })
        .unwrap();
    service
        .put_workspace_change_proposal(&PutWorkspaceChangeProposal {
            id: Some("wcp_conflict".to_string()),
            workspace_id: "workspace_existing".to_string(),
            changeset_id: "wcs_existing".to_string(),
            principal_id: "agent_existing".to_string(),
            title: None,
            summary: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let token = "task-conflict-token-00000000000000000000000000000000".to_string();
    let identity = WorkspaceTaskRunIdentity {
        run_id: "wtsk_atomic_conflict".to_string(),
        attempt_id: "wtat_atomic_conflict".to_string(),
        claim_token: token.clone(),
    };
    service
        .begin_workspace_task_run(&BeginWorkspaceTaskRun {
            id: identity.run_id.clone(),
            workspace_id: "workspace_task_conflict".to_string(),
            principal_id: "agent_task_conflict".to_string(),
            access: "writable".to_string(),
            repository_id: "repo_task_conflict".to_string(),
            isolation_id: "wiso_task_conflict".to_string(),
            attempt_id: identity.attempt_id.clone(),
            owner_id: "host_task_conflict".to_string(),
            claim_token: token,
            lease_ms: 60_000,
        })
        .unwrap();
    let base_revision = "d".repeat(40);
    service
        .mark_workspace_task_active(&MarkWorkspaceTaskActive {
            run_id: identity.run_id.clone(),
            attempt_id: identity.attempt_id.clone(),
            claim_token: identity.claim_token.clone(),
            base_revision: Some(base_revision.clone()),
            runtime_ref: Some("refs/heads/wanex/task-conflict".to_string()),
        })
        .unwrap();
    service
        .begin_workspace_task_collection(&BeginWorkspaceTaskCollection {
            run_id: identity.run_id.clone(),
            attempt_id: identity.attempt_id.clone(),
            claim_token: identity.claim_token.clone(),
            execution_outcome: "completed".to_string(),
            summary: None,
            resource_ids: vec![],
            failure: None,
        })
        .unwrap();
    assert!(service
        .finalize_workspace_task_collection(&FinalizeWorkspaceTaskCollection {
            run_id: identity.run_id.clone(),
            attempt_id: identity.attempt_id,
            claim_token: identity.claim_token,
            outcome: "proposed".to_string(),
            changeset: Some(json!({
                "id": "wcs_should_rollback",
                "baseRevision": base_revision,
                "changes": [{
                    "path": "task.txt",
                    "kind": "create",
                    "targetText": "task\n"
                }]
            })),
            proposal_id: Some("wcp_conflict".to_string()),
            title: None,
            proposal_metadata: None,
        })
        .is_err());
    assert!(service
        .get_workspace_changeset("wcs_should_rollback")
        .unwrap()
        .is_none());
    let run = service
        .get_workspace_task_run("wtsk_atomic_conflict")
        .unwrap()
        .unwrap();
    assert_eq!(run.run.state, "collecting");
    assert!(run.run.changeset_id.is_none());
    assert!(run.run.proposal_id.is_none());
}

fn put_transaction_changeset(service: &SystemService, changeset_id: &str, workspace_id: &str) {
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: workspace_id.to_string(),
            principal_id: "agent_workspace_transaction".to_string(),
            changeset: json!({
                "id": changeset_id,
                "changes": [{
                    "path": "placeholder.txt",
                    "kind": "update",
                    "baseText": "before",
                    "targetText": "after"
                }]
            }),
        })
        .unwrap();
}

fn transaction_file_plan(
    ordinal: i64,
    path: &str,
    before: Option<&str>,
    after: Option<&str>,
) -> WorkspaceChangeTransactionFilePlan {
    WorkspaceChangeTransactionFilePlan {
        ordinal,
        path: path.to_string(),
        before_text: before.map(str::to_string),
        before_sha256: before.map(|text| sha256_hex(text.as_bytes())),
        after_text: after.map(str::to_string),
        after_sha256: after.map(|text| sha256_hex(text.as_bytes())),
    }
}

fn put_apply_requested_proposal(service: &SystemService, proposal_id: &str, changeset_id: &str) {
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_claim".to_string(),
            principal_id: "agent_claim".to_string(),
            changeset: json!({
                "id": changeset_id,
                "changes": [{ "path": "claim.txt", "kind": "create", "targetText": "ok\n" }]
            }),
        })
        .unwrap();
    service
        .put_workspace_change_proposal(&PutWorkspaceChangeProposal {
            id: Some(proposal_id.to_string()),
            workspace_id: "workspace_claim".to_string(),
            changeset_id: changeset_id.to_string(),
            principal_id: "agent_claim".to_string(),
            title: None,
            summary: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    for operation in ["approve", "request_apply"] {
        service
            .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
                id: None,
                proposal_id: proposal_id.to_string(),
                operation: operation.to_string(),
                actor_id: "reviewer_claim".to_string(),
                reason: None,
                metadata: None,
            })
            .unwrap();
    }
}

#[test]
fn rejects_invalid_workspace_change_proposal_transitions() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_reject".to_string(),
            principal_id: "agent_reject".to_string(),
            changeset: json!({
                "id": "cs_reject",
                "changes": [
                    {
                        "path": "reject.txt",
                        "kind": "create",
                        "targetText": "reject\n"
                    }
                ]
            }),
        })
        .unwrap();
    service
        .put_workspace_change_proposal(&PutWorkspaceChangeProposal {
            id: Some("wcp_reject".to_string()),
            workspace_id: "workspace_reject".to_string(),
            changeset_id: "cs_reject".to_string(),
            principal_id: "agent_reject".to_string(),
            title: None,
            summary: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let error = service
        .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
            id: None,
            proposal_id: "wcp_reject".to_string(),
            operation: "request_apply".to_string(),
            actor_id: "user_reject".to_string(),
            reason: None,
            metadata: None,
        })
        .unwrap_err();

    assert!(matches!(error, SystemServiceError::Invariant(_)));
}

#[test]
fn records_plan_proposal_lifecycle_references_and_events() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_plan"), Some("Plan source"), Some("agent"))
        .unwrap();
    service
        .put_workspace_changeset(&PutWorkspaceChangeSet {
            workspace_id: "workspace_plan".to_string(),
            principal_id: "agent_plan".to_string(),
            changeset: json!({
                "id": "cs_plan",
                "changes": [
                    {
                        "path": "plan.txt",
                        "kind": "create",
                        "targetText": "plan\n"
                    }
                ]
            }),
        })
        .unwrap();
    service
        .put_workspace_change_proposal(&PutWorkspaceChangeProposal {
            id: Some("wcp_plan".to_string()),
            workspace_id: "workspace_plan".to_string(),
            changeset_id: "cs_plan".to_string(),
            principal_id: "agent_plan".to_string(),
            title: Some("Workspace change".to_string()),
            summary: Some("Referenced by plan".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let generation_output = json!([{
        "type": "text",
        "id": "part_plan_generation",
        "text": "{\"title\":\"Plan proposal\"}"
    }]);
    let request = CreatePlanProposal {
        id: Some("planp_system".to_string()),
        principal_id: "agent_plan".to_string(),
        source: PlanProposalSourceRecord {
            session_id: "ses_plan".to_string(),
            head_sequence: 0,
            head_message_id: None,
            head_turn_id: None,
            analysis_input_digest: "a".repeat(64),
            planning_request: json!([{
                "type": "text",
                "id": "part_plan_request",
                "text": "Plan this change"
            }]),
        },
        generation: PlanProposalGenerationRecord {
            endpoint_id: "endpoint_plan".to_string(),
            endpoint_digest: "b".repeat(64),
            protocol_id: "fake".to_string(),
            provider_id: "fake".to_string(),
            model_id: "model_plan".to_string(),
            generated_at: 1,
            output_digest: sha256_json(&generation_output),
            output: generation_output,
        },
        content: PlanProposalContentRecord {
            title: "Plan proposal".to_string(),
            summary: "Durable plan proposal".to_string(),
            steps: json!([
                { "id": "step_1", "title": "Inspect" },
                { "id": "step_2", "title": "Implement", "detail": "Use system-service" }
            ]),
            references: vec![PlanProposalReferenceRecord {
                kind: "workspace_change_proposal".to_string(),
                reference_id: "wcp_plan".to_string(),
                role: Some("related".to_string()),
                metadata: None,
            }],
        },
        idempotency_key: "plan-system-key".to_string(),
    };
    let proposal = service.create_plan_proposal(&request).unwrap();
    let duplicate = service.create_plan_proposal(&request).unwrap();

    assert_eq!(proposal.id, "planp_system");
    assert_eq!(duplicate.id, proposal.id);
    assert_eq!(proposal.state, "open");
    assert_eq!(proposal.revision, 1);
    assert_eq!(proposal.source.session_id, "ses_plan");
    assert_eq!(proposal.references.len(), 1);

    let stale_revision = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_stale".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "revise".to_string(),
            expected_revision: 99,
            actor_kind: "human".to_string(),
            actor_id: "user_plan".to_string(),
            content: Some(request.content.clone()),
            reason: None,
            idempotency_key: "plan-operation-stale".to_string(),
        })
        .unwrap_err();
    assert!(matches!(stale_revision, SystemServiceError::Conflict(_)));

    let revised_content = PlanProposalContentRecord {
        title: "Revised plan proposal".to_string(),
        summary: "Human-reviewed durable plan proposal".to_string(),
        steps: json!([
            { "id": "step_1", "title": "Inspect exact source" },
            { "id": "step_2", "title": "Implement atomically" }
        ]),
        references: request.content.references.clone(),
    };
    let revised = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_revise".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "revise".to_string(),
            expected_revision: 1,
            actor_kind: "human".to_string(),
            actor_id: "user_plan".to_string(),
            content: Some(revised_content),
            reason: Some("tighten the plan".to_string()),
            idempotency_key: "plan-operation-revise".to_string(),
        })
        .unwrap();
    assert_eq!(revised.from_revision, 1);
    assert_eq!(revised.to_revision, 2);
    assert_eq!(revised.from_state, "open");
    assert_eq!(revised.to_state, "open");

    let approved = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_approve".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "approve".to_string(),
            expected_revision: 2,
            actor_kind: "human".to_string(),
            actor_id: "user_plan".to_string(),
            content: None,
            reason: Some("looks correct".to_string()),
            idempotency_key: "plan-operation-approve".to_string(),
        })
        .unwrap();
    assert_eq!(approved.from_state, "open");
    assert_eq!(approved.to_state, "approved");
    assert_eq!(approved.from_revision, 2);
    assert_eq!(approved.to_revision, 3);

    let mut turn = test_turn_request(TestTurn {
        session_id: "ses_plan",
        input_id: "inp_plan_execution",
        turn_id: "turn_plan_execution",
        job_id: "job_plan_execution",
        principal_id: "agent_plan",
        idempotency_key: "plan-turn-execution",
        text: "Execute the approved plan",
    });
    let invalid_execution = service
        .execute_approved_plan(&ExecuteApprovedPlan {
            proposal_id: proposal.id.clone(),
            expected_revision: 3,
            idempotency_key: "plan-execution-invalid".to_string(),
            turn: turn.clone(),
        })
        .unwrap_err();
    assert!(matches!(
        invalid_execution,
        SystemServiceError::Invariant(_)
    ));
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: "ses_plan".to_string(),
            state: None,
        })
        .unwrap()
        .is_empty());

    turn.origin = Some(json!({
        "kind": "plan",
        "sourceRef": proposal.id
    }));
    let mut invalid_binding_turn = turn.clone();
    invalid_binding_turn.execution_binding["provider"]["modelId"] = json!("tampered");
    let invalid_binding = service
        .execute_approved_plan(&ExecuteApprovedPlan {
            proposal_id: proposal.id.clone(),
            expected_revision: 3,
            idempotency_key: "plan-execution-invalid-binding".to_string(),
            turn: invalid_binding_turn,
        })
        .unwrap_err();
    assert!(matches!(
        invalid_binding,
        SystemServiceError::InvalidJobRequest(_)
    ));
    assert!(service.list_session_inputs("ses_plan").unwrap().is_empty());
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: "ses_plan".to_string(),
            state: None,
        })
        .unwrap()
        .is_empty());
    assert!(service
        .get_plan_proposal(&proposal.id)
        .unwrap()
        .unwrap()
        .execution
        .is_none());

    let execution_request = ExecuteApprovedPlan {
        proposal_id: proposal.id.clone(),
        expected_revision: 3,
        idempotency_key: "plan-execution-system".to_string(),
        turn,
    };
    let executed = service.execute_approved_plan(&execution_request).unwrap();
    let duplicate_execution = service.execute_approved_plan(&execution_request).unwrap();
    assert_eq!(duplicate_execution, executed);
    assert_eq!(executed.proposal.state, "approved");
    assert_eq!(executed.proposal.revision, 3);
    assert_eq!(
        executed.proposal.execution.as_ref().unwrap().turn_id,
        "turn_plan_execution"
    );
    assert_eq!(executed.submission.job.id, "job_plan_execution");

    let conflicting_execution = service
        .execute_approved_plan(&ExecuteApprovedPlan {
            idempotency_key: "different-plan-execution".to_string(),
            ..execution_request.clone()
        })
        .unwrap_err();
    assert!(matches!(
        conflicting_execution,
        SystemServiceError::Conflict(_)
    ));

    let fetched = service.get_plan_proposal(&proposal.id).unwrap().unwrap();
    assert_eq!(fetched.state, "approved");
    assert_eq!(fetched.revision, 3);
    assert!(fetched.decided_at.is_some());
    assert!(fetched.execution.is_some());

    let listed_by_reference = service
        .list_plan_proposals(&ListPlanProposals {
            principal_id: None,
            source_session_id: Some("ses_plan".to_string()),
            state: Some("approved".to_string()),
            reference_kind: Some("workspace_change_proposal".to_string()),
            reference_id: Some("wcp_plan".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed_by_reference.len(), 1);
    assert_eq!(listed_by_reference[0].id, proposal.id);

    let listed_by_principal = service
        .list_plan_proposals(&ListPlanProposals {
            principal_id: Some("agent_plan".to_string()),
            source_session_id: None,
            state: None,
            reference_kind: None,
            reference_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed_by_principal.len(), 1);

    let operations = service
        .list_plan_proposal_operations(&ListPlanProposalOperations {
            proposal_id: proposal.id.clone(),
        })
        .unwrap();
    assert_eq!(
        operations
            .iter()
            .map(|operation| operation.operation.as_str())
            .collect::<Vec<_>>(),
        vec!["revise", "approve"]
    );

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: Some(proposal.id),
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(
        events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>(),
        vec![
            "plan.proposal.created",
            "plan.proposal.operation_recorded",
            "plan.proposal.operation_recorded",
            "plan.proposal.execution_bound"
        ]
    );
    assert!(events
        .iter()
        .all(|event| event.scope.plan_proposal_id.as_deref() == Some("planp_system")));
}

#[test]
fn blocks_approved_plan_execution_after_source_head_drift() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(
            Some("ses_plan_stale"),
            Some("Stale Plan source"),
            Some("agent"),
        )
        .unwrap();
    let proposal = service
        .create_plan_proposal(&empty_source_plan_request("planp_stale", "ses_plan_stale"))
        .unwrap();
    service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_stale_approve".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "approve".to_string(),
            expected_revision: 1,
            actor_kind: "human".to_string(),
            actor_id: "user_plan".to_string(),
            content: None,
            reason: None,
            idempotency_key: "plan-stale-approve".to_string(),
        })
        .unwrap();

    let drift = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_plan_stale",
            input_id: "inp_plan_drift",
            turn_id: "turn_plan_drift",
            job_id: "job_plan_drift",
            principal_id: "agent_plan_test",
            idempotency_key: "plan-drift-turn",
            text: "Change the canonical head",
        },
    );
    let job = claim_session_turn_job(&service, "worker_plan_drift", 60_000).unwrap();
    let started = start_test_turn(&service, &drift, &job, "worker_plan_drift");
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: "ses_plan_stale".to_string(),
            turn_id: drift.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: drift.admission.input_id,
            job_id: job.id.clone(),
            worker_id: "worker_plan_drift".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            outcome: "failed".to_string(),
            provider_invocation_id: None,
            assistant_message: None,
            provider_state: None,
            result: None,
            error: Some(json!({ "code": "test_failure" })),
            reason: Some("intentional test failure".to_string()),
        })
        .unwrap();

    let mut turn = test_turn_request(TestTurn {
        session_id: "ses_plan_stale",
        input_id: "inp_plan_stale_execution",
        turn_id: "turn_plan_stale_execution",
        job_id: "job_plan_stale_execution",
        principal_id: "agent_plan_test",
        idempotency_key: "plan-stale-execution-turn",
        text: "Execute stale plan",
    });
    turn.origin = Some(json!({
        "kind": "plan",
        "sourceRef": proposal.id
    }));
    let error = service
        .execute_approved_plan(&ExecuteApprovedPlan {
            proposal_id: proposal.id.clone(),
            expected_revision: 2,
            idempotency_key: "plan-stale-execution".to_string(),
            turn,
        })
        .unwrap_err();
    assert!(matches!(error, SystemServiceError::Conflict(_)));
    assert!(service
        .get_plan_proposal(&proposal.id)
        .unwrap()
        .unwrap()
        .execution
        .is_none());
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: "ses_plan_stale".to_string(),
                state: None,
            })
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn objective_contract_binds_exact_turn_and_gates_success_with_verification() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_objective"), Some("Objective"), Some("agent"))
        .unwrap();

    let request = test_objective_request(
        "objective_system",
        "ses_objective",
        "objective-system-create",
        3,
        None,
    );
    let objective = service.create_objective(&request).unwrap();
    assert_eq!(service.create_objective(&request).unwrap(), objective);
    assert_eq!(objective.state, "active");
    assert_eq!(objective.revision, 1);

    let duplicate_live = service
        .create_objective(&test_objective_request(
            "objective_duplicate_live",
            "ses_objective",
            "objective-duplicate-live-create",
            3,
            None,
        ))
        .unwrap_err();
    assert!(matches!(duplicate_live, SystemServiceError::Conflict(_)));

    let admission_request = test_objective_admission(
        &objective.id,
        objective.revision,
        "initial",
        "objective-system-admit-1",
        "ses_objective",
        "inp_objective_1",
        "turn_objective_1",
        "job_objective_1",
    );
    let (admitted_objective, attempt, submission) =
        expect_admitted(service.admit_objective_attempt(&admission_request).unwrap());
    assert_eq!(admitted_objective.revision, 2);
    assert_eq!(
        admitted_objective.active_attempt_id.as_deref(),
        Some(attempt.id.as_str())
    );
    assert_eq!(attempt.input_id, submission.admission.input_id);
    assert_eq!(attempt.turn_id, submission.turn.id);
    assert_eq!(attempt.job_id, submission.job.id);
    assert_eq!(
        attempt.execution_binding_digest,
        submission.turn.execution_binding_digest
    );
    assert_eq!(attempt.attempt_number, 1);
    assert_eq!(attempt.trigger, "initial");

    let (_, retried_attempt, retried_submission) =
        expect_admitted(service.admit_objective_attempt(&admission_request).unwrap());
    assert_eq!(retried_attempt, attempt);
    assert_eq!(retried_submission.turn, submission.turn);

    let stale_pause = service
        .pause_objective(&ChangeObjectiveState {
            objective_id: objective.id.clone(),
            expected_revision: 1,
            reason: Some("stale writer".to_string()),
            idempotency_key: "objective-system-stale-pause".to_string(),
        })
        .unwrap_err();
    assert!(matches!(stale_pause, SystemServiceError::Conflict(_)));

    let paused = service
        .pause_objective(&ChangeObjectiveState {
            objective_id: objective.id.clone(),
            expected_revision: 2,
            reason: Some("review direction".to_string()),
            idempotency_key: "objective-system-pause".to_string(),
        })
        .unwrap();
    assert_eq!(paused.state, "paused");
    assert_eq!(paused.revision, 3);
    assert_eq!(paused.active_attempt_id, Some(attempt.id.clone()));

    let losing_pause = service
        .pause_objective(&ChangeObjectiveState {
            objective_id: objective.id.clone(),
            expected_revision: 2,
            reason: None,
            idempotency_key: "objective-system-losing-pause".to_string(),
        })
        .unwrap_err();
    assert!(matches!(losing_pause, SystemServiceError::Conflict(_)));

    let resumed = service
        .resume_objective(&ChangeObjectiveState {
            objective_id: objective.id.clone(),
            expected_revision: 3,
            reason: Some("direction accepted".to_string()),
            idempotency_key: "objective-system-resume".to_string(),
        })
        .unwrap();
    assert_eq!(resumed.state, "active");
    assert_eq!(resumed.revision, 4);
    assert_eq!(resumed.active_attempt_id, Some(attempt.id.clone()));

    let premature_review = service
        .review_objective_attempt(&ReviewObjectiveAttempt {
            id: Some("objectivereview_premature".to_string()),
            objective_id: objective.id.clone(),
            attempt_id: attempt.id.clone(),
            expected_revision: 4,
            disposition: "succeeded".to_string(),
            reason: Some("too early".to_string()),
            verifications: passed_objective_verifications(),
            idempotency_key: "objective-system-premature-review".to_string(),
        })
        .unwrap_err();
    assert!(matches!(premature_review, SystemServiceError::Conflict(_)));

    settle_test_turn_success(&service, &submission, "worker_objective_success");

    let unverified_success = service
        .review_objective_attempt(&ReviewObjectiveAttempt {
            id: Some("objectivereview_unverified".to_string()),
            objective_id: objective.id.clone(),
            attempt_id: attempt.id.clone(),
            expected_revision: 4,
            disposition: "succeeded".to_string(),
            reason: Some("missing evidence".to_string()),
            verifications: json!([]),
            idempotency_key: "objective-system-unverified-review".to_string(),
        })
        .unwrap_err();
    assert!(matches!(
        unverified_success,
        SystemServiceError::Invariant(_)
    ));
    assert_eq!(
        service
            .get_objective(&objective.id)
            .unwrap()
            .unwrap()
            .active_attempt_id,
        Some(attempt.id.clone())
    );

    let review_request = ReviewObjectiveAttempt {
        id: Some("objectivereview_success".to_string()),
        objective_id: objective.id.clone(),
        attempt_id: attempt.id.clone(),
        expected_revision: 4,
        disposition: "succeeded".to_string(),
        reason: Some("all checks passed".to_string()),
        verifications: passed_objective_verifications(),
        idempotency_key: "objective-system-success-review".to_string(),
    };
    let reviewed = service.review_objective_attempt(&review_request).unwrap();
    assert_eq!(reviewed.objective.state, "succeeded");
    assert_eq!(reviewed.objective.reason.code, "verification_succeeded");
    assert_eq!(reviewed.objective.revision, 5);
    assert!(reviewed.objective.active_attempt_id.is_none());
    assert!(reviewed.objective.closed_at.is_some());
    assert_eq!(reviewed.review.disposition, "succeeded");
    assert_eq!(reviewed.verifications.len(), 1);
    assert_eq!(reviewed.verifications[0].result, "passed");
    assert_eq!(
        service.review_objective_attempt(&review_request).unwrap(),
        reviewed
    );

    assert_eq!(
        service
            .list_objective_attempts(&ListObjectiveAttempts {
                objective_id: objective.id.clone(),
                limit: Some(10),
            })
            .unwrap(),
        vec![attempt.clone()]
    );
    assert_eq!(
        service
            .list_objective_attempt_reviews(&ListObjectiveAttemptReviews {
                objective_id: objective.id.clone(),
                attempt_id: Some(attempt.id.clone()),
                limit: Some(10),
            })
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        service
            .list_objective_verifications(&ListObjectiveVerifications {
                objective_id: objective.id.clone(),
                attempt_id: Some(attempt.id),
                requirement_id: Some("requirement_tests".to_string()),
                result: Some("passed".to_string()),
                limit: Some(10),
            })
            .unwrap()
            .len(),
        1
    );

    let replacement = service
        .create_objective(&test_objective_request(
            "objective_after_success",
            "ses_objective",
            "objective-after-success-create",
            1,
            None,
        ))
        .unwrap();
    assert_eq!(replacement.state, "active");

    let objective_events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: Some(objective.id),
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    assert!(objective_events
        .iter()
        .any(|event| event.event_type == "objective.created"));
    assert!(objective_events
        .iter()
        .any(|event| event.event_type == "objective.attempt.admitted"));
    assert!(objective_events
        .iter()
        .any(|event| event.event_type == "objective.verification.recorded"));
    assert!(objective_events
        .iter()
        .any(|event| event.event_type == "objective.attempt.reviewed"));
}

#[test]
fn objective_admission_yields_to_user_work_and_enforces_attempt_limit() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_objective_priority"), None, Some("agent"))
        .unwrap();
    let objective = service
        .create_objective(&test_objective_request(
            "objective_priority",
            "ses_objective_priority",
            "objective-priority-create",
            1,
            None,
        ))
        .unwrap();
    let user_turn = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_objective_priority",
            input_id: "inp_objective_user",
            turn_id: "turn_objective_user",
            job_id: "job_objective_user",
            principal_id: "user_objective",
            idempotency_key: "objective-user-work",
            text: "user work wins",
        },
    );

    let attempt_request = test_objective_admission(
        &objective.id,
        1,
        "initial",
        "objective-priority-admit-1",
        "ses_objective_priority",
        "inp_objective_priority_1",
        "turn_objective_priority_1",
        "job_objective_priority_1",
    );
    let blocked = service
        .admit_objective_attempt(&attempt_request)
        .unwrap_err();
    assert!(matches!(blocked, SystemServiceError::Conflict(_)));
    assert!(service
        .list_objective_attempts(&ListObjectiveAttempts {
            objective_id: objective.id.clone(),
            limit: None,
        })
        .unwrap()
        .is_empty());

    service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: user_turn.turn.session_id,
            turn_id: user_turn.turn.id,
            input_id: user_turn.admission.input_id,
            job_id: user_turn.job.id,
            reason: "release priority test".to_string(),
        })
        .unwrap();

    let (active, attempt, submission) =
        expect_admitted(service.admit_objective_attempt(&attempt_request).unwrap());
    assert_eq!(active.revision, 2);
    settle_test_turn_success(&service, &submission, "worker_objective_limit");
    let limited = service
        .review_objective_attempt(&ReviewObjectiveAttempt {
            id: Some("objectivereview_limit".to_string()),
            objective_id: objective.id.clone(),
            attempt_id: attempt.id,
            expected_revision: 2,
            disposition: "continue".to_string(),
            reason: Some("verification needs another attempt".to_string()),
            verifications: failed_objective_verifications(),
            idempotency_key: "objective-priority-limit-review".to_string(),
        })
        .unwrap();
    assert_eq!(limited.objective.state, "limit_reached");
    assert_eq!(limited.objective.reason.code, "max_attempts");
    assert!(limited.objective.closed_at.is_some());
}

#[test]
fn objective_budget_is_reserved_per_attempt_and_enforced_after_settlement() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_objective_budget"), None, Some("agent"))
        .unwrap();
    let objective = service
        .create_objective(&test_objective_request(
            "objective_budget",
            "ses_objective_budget",
            "objective-budget-create",
            3,
            Some(json!({
                "tokens": 10,
                "costMicros": null,
                "wallTimeMs": null,
                "toolCalls": null
            })),
        ))
        .unwrap();
    assert_eq!(
        objective.stop_policy.budget.as_ref().unwrap().tokens,
        Some(10)
    );

    let admission_request = test_objective_admission(
        &objective.id,
        1,
        "initial",
        "objective-budget-admit-1",
        "ses_objective_budget",
        "inp_objective_budget_1",
        "turn_objective_budget_1",
        "job_objective_budget_1",
    );
    let (_, attempt, submission) =
        expect_admitted(service.admit_objective_attempt(&admission_request).unwrap());
    let grant_id = attempt
        .budget_grant_id
        .clone()
        .expect("objective budget grant");
    let (_, retried_attempt, _) =
        expect_admitted(service.admit_objective_attempt(&admission_request).unwrap());
    assert_eq!(
        retried_attempt.budget_grant_id.as_deref(),
        Some(grant_id.as_str())
    );
    service
        .record_budget_usage(&RecordBudgetUsage {
            grant_id,
            usage: BudgetAmount {
                tokens: Some(10),
                cost_micros: None,
                wall_time_ms: None,
                tool_calls: None,
            },
            source: "objective-test".to_string(),
            source_id: attempt.id.clone(),
            idempotency_key: "objective-budget-usage".to_string(),
        })
        .unwrap();
    settle_test_turn_success(&service, &submission, "worker_objective_budget");

    let reviewed = service
        .review_objective_attempt(&ReviewObjectiveAttempt {
            id: Some("objectivereview_budget".to_string()),
            objective_id: objective.id,
            attempt_id: attempt.id,
            expected_revision: 2,
            disposition: "continue".to_string(),
            reason: Some("budget consumed".to_string()),
            verifications: failed_objective_verifications(),
            idempotency_key: "objective-budget-review".to_string(),
        })
        .unwrap();
    assert_eq!(reviewed.objective.state, "limit_reached");
    assert_eq!(reviewed.objective.reason.code, "budget");
}

#[test]
fn objective_cancellation_waits_for_an_exact_running_turn_settlement() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_objective_cancel_queued"), None, Some("agent"))
        .unwrap();
    let queued_objective = service
        .create_objective(&test_objective_request(
            "objective_cancel_queued",
            "ses_objective_cancel_queued",
            "objective-cancel-queued-create",
            3,
            None,
        ))
        .unwrap();
    let (_, _, queued_submission) = expect_admitted(
        service
            .admit_objective_attempt(&test_objective_admission(
                &queued_objective.id,
                1,
                "initial",
                "objective-cancel-queued-admit",
                "ses_objective_cancel_queued",
                "inp_objective_cancel_queued",
                "turn_objective_cancel_queued",
                "job_objective_cancel_queued",
            ))
            .unwrap(),
    );
    let queued_cancelled = service
        .request_objective_cancel(&RequestObjectiveCancel {
            objective_id: queued_objective.id,
            expected_revision: 2,
            reason: "cancel queued objective".to_string(),
            idempotency_key: "objective-cancel-queued".to_string(),
        })
        .unwrap();
    assert_eq!(queued_cancelled.objective.state, "cancelled");
    assert_eq!(
        queued_cancelled.turn_cancellation.unwrap().status,
        "cancelled"
    );
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: queued_submission.turn.session_id,
                state: Some("cancelled".to_string()),
            })
            .unwrap()
            .len(),
        1
    );

    service
        .create_session(Some("ses_objective_cancel_running"), None, Some("agent"))
        .unwrap();
    let running_objective = service
        .create_objective(&test_objective_request(
            "objective_cancel_running",
            "ses_objective_cancel_running",
            "objective-cancel-running-create",
            3,
            None,
        ))
        .unwrap();
    let (_, running_attempt, running_submission) = expect_admitted(
        service
            .admit_objective_attempt(&test_objective_admission(
                &running_objective.id,
                1,
                "initial",
                "objective-cancel-running-admit",
                "ses_objective_cancel_running",
                "inp_objective_cancel_running",
                "turn_objective_cancel_running",
                "job_objective_cancel_running",
            ))
            .unwrap(),
    );
    let job = claim_session_turn_job(&service, "worker_objective_cancel", 60_000).unwrap();
    assert_eq!(job.id, running_submission.job.id);
    let started = start_test_turn(
        &service,
        &running_submission,
        &job,
        "worker_objective_cancel",
    );
    let requested = service
        .request_objective_cancel(&RequestObjectiveCancel {
            objective_id: running_objective.id.clone(),
            expected_revision: 2,
            reason: "cancel running objective".to_string(),
            idempotency_key: "objective-cancel-running".to_string(),
        })
        .unwrap();
    assert_eq!(requested.objective.state, "cancel_requested");
    assert_eq!(requested.objective.revision, 3);
    assert_eq!(
        requested.turn_cancellation.as_ref().unwrap().status,
        "cancel_requested"
    );

    let premature_reconcile = service
        .reconcile_objective_cancellation(&ReconcileObjectiveCancellation {
            objective_id: running_objective.id.clone(),
            attempt_id: running_attempt.id.clone(),
            expected_revision: 3,
            idempotency_key: "objective-cancel-running-premature-reconcile".to_string(),
        })
        .unwrap_err();
    assert!(matches!(
        premature_reconcile,
        SystemServiceError::Conflict(_)
    ));

    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: running_submission.turn.session_id,
            turn_id: running_submission.turn.id,
            attempt_id: started.attempt.id,
            input_id: running_submission.admission.input_id,
            job_id: job.id,
            worker_id: "worker_objective_cancel".to_string(),
            lease_token: job.lease_token.unwrap(),
            outcome: "cancelled".to_string(),
            provider_invocation_id: None,
            assistant_message: None,
            provider_state: None,
            result: None,
            error: None,
            reason: Some("cancel running objective".to_string()),
        })
        .unwrap();
    let cancelled = service
        .reconcile_objective_cancellation(&ReconcileObjectiveCancellation {
            objective_id: running_objective.id,
            attempt_id: running_attempt.id,
            expected_revision: 3,
            idempotency_key: "objective-cancel-running-reconcile".to_string(),
        })
        .unwrap();
    assert_eq!(cancelled.state, "cancelled");
    assert_eq!(cancelled.reason.code, "cancelled");
    assert_eq!(cancelled.revision, 4);
    assert!(cancelled.active_attempt_id.is_none());
    assert!(cancelled.closed_at.is_some());
}

fn test_objective_request(
    id: &str,
    session_id: &str,
    idempotency_key: &str,
    max_attempts: i64,
    budget: Option<serde_json::Value>,
) -> CreateObjective {
    let mut stop_policy = json!({
        "maxAttempts": max_attempts,
        "maxConsecutiveBlockedAttempts": 2
    });
    if let Some(budget) = budget {
        stop_policy["budget"] = budget;
    }
    CreateObjective {
        id: Some(id.to_string()),
        session_id: session_id.to_string(),
        principal_id: "agent_objective".to_string(),
        objective: "Reduce login LCP below 2.5s".to_string(),
        boundaries: json!(["apps/web"]),
        constraints: json!(["do not change the public auth API"]),
        success_criteria: json!([{
            "id": "criterion_tests",
            "description": "the verification suite passes"
        }]),
        verification_policy: json!({
            "requirements": [{
                "id": "requirement_tests",
                "criterionIds": ["criterion_tests"],
                "verifierKind": "script",
                "verifierRef": "test-suite"
            }]
        }),
        stop_policy,
        idempotency_key: idempotency_key.to_string(),
    }
}

#[allow(clippy::too_many_arguments)]
fn test_objective_admission(
    objective_id: &str,
    expected_revision: i64,
    trigger: &str,
    idempotency_key: &str,
    session_id: &str,
    input_id: &str,
    turn_id: &str,
    job_id: &str,
) -> AdmitObjectiveAttempt {
    let mut turn = test_turn_request(TestTurn {
        session_id,
        input_id,
        turn_id,
        job_id,
        principal_id: "agent_objective",
        idempotency_key: &format!("{idempotency_key}:turn"),
        text: "Continue the objective",
    });
    turn.origin = Some(json!({
        "kind": "objective",
        "sourceRef": objective_id
    }));
    AdmitObjectiveAttempt {
        objective_id: objective_id.to_string(),
        expected_revision,
        trigger: trigger.to_string(),
        idempotency_key: idempotency_key.to_string(),
        turn,
    }
}

fn expect_admitted(
    receipt: AdmitObjectiveAttemptReceipt,
) -> (
    wanex_system_service::ObjectiveRecord,
    wanex_system_service::ObjectiveAttemptRecord,
    SubmitSessionTurnReceipt,
) {
    match receipt {
        AdmitObjectiveAttemptReceipt::Admitted {
            objective,
            attempt,
            submission,
        } => (*objective, attempt, *submission),
        AdmitObjectiveAttemptReceipt::LimitReached { objective } => {
            panic!("expected admitted objective, got {}", objective.state)
        }
    }
}

fn passed_objective_verifications() -> serde_json::Value {
    json!([{
        "requirementId": "requirement_tests",
        "verifierKind": "script",
        "verifierRef": "test-suite",
        "result": "passed",
        "reason": "verification passed",
        "evidence": [{
            "kind": "runtime_projection",
            "referenceId": "verification-output",
            "digest": "a".repeat(64)
        }]
    }])
}

fn failed_objective_verifications() -> serde_json::Value {
    json!([{
        "requirementId": "requirement_tests",
        "verifierKind": "script",
        "verifierRef": "test-suite",
        "result": "failed",
        "reason": "verification failed",
        "evidence": [{
            "kind": "runtime_projection",
            "referenceId": "verification-output",
            "digest": "b".repeat(64)
        }]
    }])
}

fn settle_test_turn_success(
    service: &SystemService,
    submission: &SubmitSessionTurnReceipt,
    worker_id: &str,
) {
    let job = claim_session_turn_job(service, worker_id, 60_000).unwrap();
    assert_eq!(job.id, submission.job.id);
    let started = start_test_turn(service, submission, &job, worker_id);
    let invocation = begin_test_provider_invocation(service, submission, &started, &job, worker_id);
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: submission.turn.session_id.clone(),
            turn_id: submission.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: submission.admission.input_id.clone(),
            job_id: job.id,
            worker_id: worker_id.to_string(),
            lease_token: job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": format!("assistant_{}", submission.turn.id),
                "text": "Objective attempt completed"
            }])),
            provider_state: None,
            result: Some(json!({ "steps": 1 })),
            error: None,
            reason: None,
        })
        .unwrap();
}

#[test]
fn upserts_and_reads_config_json() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    service
        .put_config(
            "provider.default",
            &json!({ "id": "deepseek", "apiKey": "sk-secret" }),
        )
        .unwrap();
    service
        .put_config("provider.default", &json!({ "id": "openai" }))
        .unwrap();

    let value = service.get_config("provider.default").unwrap();

    assert_eq!(value, Some(json!({ "id": "openai" })));
    let entry = service
        .get_config_entry("provider.default")
        .unwrap()
        .unwrap();
    assert_eq!(entry.revision, 2);
    assert_eq!(entry.value, json!({ "id": "openai" }));

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();
    let config_events = events
        .iter()
        .filter(|event| event.event_type == "config.updated")
        .collect::<Vec<_>>();

    assert_eq!(config_events.len(), 2);
    assert_eq!(
        config_events[0].payload.get("key"),
        Some(&json!("provider.default"))
    );
    assert!(config_events[0].payload.get("updatedAt").is_some());
    assert!(config_events[0].payload.get("value").is_none());
    assert!(config_events[0].payload.get("apiKey").is_none());
    assert!(!config_events[0].payload.to_string().contains("sk-secret"));
    assert_eq!(config_events[0].payload.get("revision"), Some(&json!(1)));
    assert_eq!(config_events[1].payload.get("revision"), Some(&json!(2)));
}

#[test]
fn conditionally_creates_config_once_and_reports_stale_evidence() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let key = "schedule.occurrence.definition-1.2026-08-19T12:00:00Z";
    let condition = ConfigMutationCondition {
        key: key.to_string(),
        expected_revision: None,
    };

    let created = service
        .compare_and_apply_config_mutations(
            std::slice::from_ref(&condition),
            &[(key.to_string(), json!({ "claimant": "first" }))],
            &[],
        )
        .unwrap();
    assert!(created.applied);
    assert!(created.conflicts.is_empty());
    assert_eq!(created.entries.len(), 1);
    assert_eq!(created.entries[0].revision, 1);

    let stale = service
        .compare_and_apply_config_mutations(
            &[condition],
            &[(key.to_string(), json!({ "claimant": "second" }))],
            &[],
        )
        .unwrap();
    assert!(!stale.applied);
    assert!(stale.entries.is_empty());
    assert_eq!(stale.conflicts.len(), 1);
    assert_eq!(stale.conflicts[0].expected_revision, None);
    assert_eq!(stale.conflicts[0].current.as_ref().unwrap().revision, 1);
    assert_eq!(
        service.get_config(key).unwrap(),
        Some(json!({ "claimant": "first" }))
    );
}

#[test]
fn rejects_conditional_config_batches_atomically_on_any_stale_revision() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .put_config("schedule.definition.alpha", &json!({ "enabled": true }))
        .unwrap();
    service
        .put_config("schedule.definition.beta", &json!({ "enabled": true }))
        .unwrap();
    service
        .put_config("schedule.definition.beta", &json!({ "enabled": false }))
        .unwrap();

    let result = service
        .compare_and_apply_config_mutations(
            &[
                ConfigMutationCondition {
                    key: "schedule.definition.alpha".to_string(),
                    expected_revision: Some(1),
                },
                ConfigMutationCondition {
                    key: "schedule.definition.beta".to_string(),
                    expected_revision: Some(1),
                },
            ],
            &[
                (
                    "schedule.definition.alpha".to_string(),
                    json!({ "enabled": false }),
                ),
                (
                    "schedule.definition.beta".to_string(),
                    json!({ "enabled": true }),
                ),
            ],
            &[],
        )
        .unwrap();

    assert!(!result.applied);
    assert_eq!(result.conflicts.len(), 1);
    assert_eq!(result.conflicts[0].key, "schedule.definition.beta");
    assert_eq!(result.conflicts[0].current.as_ref().unwrap().revision, 2);
    assert_eq!(
        service.get_config("schedule.definition.alpha").unwrap(),
        Some(json!({ "enabled": true }))
    );
    assert_eq!(
        service.get_config("schedule.definition.beta").unwrap(),
        Some(json!({ "enabled": false }))
    );
}

#[test]
fn conditionally_deletes_config_and_pages_by_prefix() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    for suffix in ["alpha", "beta", "gamma"] {
        service
            .put_config(
                &format!("schedule.definition.{suffix}"),
                &json!({ "id": suffix }),
            )
            .unwrap();
    }
    service
        .put_config("provider.default", &json!({ "id": "unrelated" }))
        .unwrap();

    let first_page = service
        .list_config_entries("schedule.definition.", None, Some(2))
        .unwrap();
    assert_eq!(
        first_page
            .iter()
            .map(|entry| entry.key.as_str())
            .collect::<Vec<_>>(),
        ["schedule.definition.alpha", "schedule.definition.beta"]
    );
    let second_page = service
        .list_config_entries("schedule.definition.", Some(&first_page[1].key), Some(2))
        .unwrap();
    assert_eq!(second_page.len(), 1);
    assert_eq!(second_page[0].key, "schedule.definition.gamma");

    let deleted = service
        .compare_and_apply_config_mutations(
            &[ConfigMutationCondition {
                key: "schedule.definition.beta".to_string(),
                expected_revision: Some(1),
            }],
            &[],
            &["schedule.definition.beta".to_string()],
        )
        .unwrap();
    assert!(deleted.applied);
    assert!(deleted.entries.is_empty());
    assert_eq!(
        service
            .get_config_entry("schedule.definition.beta")
            .unwrap(),
        None
    );

    let repeated = service
        .compare_and_apply_config_mutations(
            &[ConfigMutationCondition {
                key: "schedule.definition.beta".to_string(),
                expected_revision: Some(1),
            }],
            &[],
            &["schedule.definition.beta".to_string()],
        )
        .unwrap();
    assert!(!repeated.applied);
    assert_eq!(repeated.conflicts[0].current, None);
}

#[test]
fn permits_only_one_concurrent_config_occurrence_claim() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_path_buf();
    let seed = SystemService::open(&root).unwrap();
    seed.put_config(
        "schedule.definition.daily",
        &json!({ "expression": "0 9 * * *" }),
    )
    .unwrap();

    let barrier = Arc::new(Barrier::new(3));
    let handles = (0..2)
        .map(|claimant| {
            let root = root.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let service = SystemService::open(root).unwrap();
                barrier.wait();
                service
                    .compare_and_apply_config_mutations(
                        &[
                            ConfigMutationCondition {
                                key: "schedule.definition.daily".to_string(),
                                expected_revision: Some(1),
                            },
                            ConfigMutationCondition {
                                key: "schedule.occurrence.daily.2026-08-20".to_string(),
                                expected_revision: None,
                            },
                        ],
                        &[(
                            "schedule.occurrence.daily.2026-08-20".to_string(),
                            json!({ "claimant": claimant }),
                        )],
                        &[],
                    )
                    .unwrap()
            })
        })
        .collect::<Vec<_>>();
    barrier.wait();

    let results = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect::<Vec<_>>();
    assert_eq!(results.iter().filter(|result| result.applied).count(), 1);
    assert_eq!(results.iter().filter(|result| !result.applied).count(), 1);
    let stored = seed
        .get_config("schedule.occurrence.daily.2026-08-20")
        .unwrap()
        .unwrap();
    assert!(stored == json!({ "claimant": 0 }) || stored == json!({ "claimant": 1 }));
}

#[test]
fn applies_config_mutations_atomically_and_redacts_events() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .put_config("config.old", &json!({ "secret": "old" }))
        .unwrap();

    service
        .apply_config_mutations(
            &[
                ("config.first".to_string(), json!({ "secret": "first" })),
                ("config.second".to_string(), json!({ "secret": "second" })),
            ],
            &["config.old".to_string()],
        )
        .unwrap();

    assert_eq!(
        service.get_config("config.first").unwrap(),
        Some(json!({ "secret": "first" }))
    );
    assert_eq!(
        service.get_config("config.second").unwrap(),
        Some(json!({ "secret": "second" }))
    );
    assert_eq!(service.get_config("config.old").unwrap(), None);

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();
    let mutation_events = events
        .iter()
        .filter(|event| event.event_type == "config.updated")
        .collect::<Vec<_>>();
    assert_eq!(mutation_events.len(), 4);
    assert!(mutation_events
        .iter()
        .all(|event| !event.payload.to_string().contains("secret")));
}

#[test]
fn retains_secret_references_until_durable_execution_is_settled() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let secret_ref = "wanex-keychain://namespace/provider.revision";
    service
        .create_session(Some("ses_secret_liveness"), None, Some("agent"))
        .unwrap();
    let mut request = test_turn_request(TestTurn {
        session_id: "ses_secret_liveness",
        input_id: "inp_secret_liveness",
        turn_id: "turn_secret_liveness",
        job_id: "job_secret_liveness",
        principal_id: "user_secret_liveness",
        idempotency_key: "idem_secret_liveness",
        text: "retain the exact credential",
    });
    request.execution_binding = test_execution_binding_with_secret("secret_liveness", secret_ref);
    service.submit_session_turn(&request).unwrap();

    assert!(service.has_live_secret_reference(secret_ref).unwrap());
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute(
        "UPDATE session_turn SET state = 'recovery_required' WHERE id = ?",
        ["turn_secret_liveness"],
    )
    .unwrap();
    assert!(service.has_live_secret_reference(secret_ref).unwrap());
    conn.execute(
        "UPDATE session_turn SET state = 'succeeded', finished_at = 1 WHERE id = ?",
        ["turn_secret_liveness"],
    )
    .unwrap();
    assert!(!service.has_live_secret_reference(secret_ref).unwrap());
}

#[test]
fn retains_media_secret_references_until_generation_is_settled() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let secret_ref = "wanex-keychain://namespace/media.revision";
    let submitted = service
        .submit_media_generation(&wanex_system_service::SubmitMediaGenerationOperation {
            id: Some("media-operation-secret-liveness".to_string()),
            job_id: Some("media-job-secret-liveness".to_string()),
            principal_id: "media-secret-user".to_string(),
            idempotency_key: "media-secret-liveness".to_string(),
            binding: media_generation_binding_with_secret("secret-liveness", secret_ref),
            priority: None,
        })
        .unwrap();

    assert!(service.has_live_secret_reference(secret_ref).unwrap());
    let cancelled = service
        .request_media_generation_cancel(&wanex_system_service::RequestMediaGenerationCancel {
            operation_id: submitted.operation.id,
            reason: "finish secret liveness test".to_string(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(cancelled.state, "cancelled");
    assert!(!service.has_live_secret_reference(secret_ref).unwrap());
}

#[test]
fn rejects_the_entire_config_batch_when_mutation_keys_conflict() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let error = service
        .apply_config_mutations(
            &[("config.same".to_string(), json!({ "value": 1 }))],
            &["config.same".to_string()],
        )
        .unwrap_err();

    assert!(error.to_string().contains("keys must be unique"));
    assert_eq!(service.get_config("config.same").unwrap(), None);
}

#[test]
fn writes_files_atomically_and_rejects_path_traversal() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let record = service
        .write_atomic_file("sessions/ses_1/output.txt", b"hello", None)
        .unwrap();

    assert_eq!(record.logical_path, "sessions/ses_1/output.txt");
    assert_eq!(record.size_bytes, 5);
    assert_eq!(
        std::fs::read_to_string(record.absolute_path).unwrap(),
        "hello"
    );

    let error = service
        .write_atomic_file("../escape.txt", b"bad", None)
        .unwrap_err();
    assert!(matches!(error, SystemServiceError::InvalidLogicalPath(_)));
}

#[test]
fn atomically_replaces_existing_files_with_non_ascii_paths() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let logical_path = "资料 空格/output.txt";

    service
        .write_atomic_file(logical_path, b"first", None)
        .unwrap();
    let record = service
        .write_atomic_file(logical_path, b"second complete value", None)
        .unwrap();

    assert_eq!(
        std::fs::read(&record.absolute_path).unwrap(),
        b"second complete value"
    );
    assert_eq!(record.sha256, sha256_hex(b"second complete value"));
    assert_eq!(
        service
            .get_resource(&record.resource_id)
            .unwrap()
            .unwrap()
            .sha256,
        record.sha256
    );
    assert_no_atomic_temp_files(record.absolute_path.parent().unwrap());
}

#[test]
fn concurrent_atomic_replacement_never_exposes_partial_content() {
    const WRITERS: usize = 8;
    let dir = tempdir().unwrap();
    SystemService::open(dir.path()).unwrap();
    let root = dir.path().to_path_buf();
    let barrier = Arc::new(Barrier::new(WRITERS));
    let payloads = (0..WRITERS)
        .map(|index| format!("writer-{index}:{}", "x".repeat(64 * 1024)).into_bytes())
        .collect::<Vec<_>>();
    let threads = payloads
        .iter()
        .cloned()
        .map(|payload| {
            let root = root.clone();
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let service = SystemService::open(root).unwrap();
                barrier.wait();
                service
                    .write_atomic_file("concurrent/共享 output.txt", &payload, None)
                    .unwrap()
            })
        })
        .collect::<Vec<_>>();
    let records = threads
        .into_iter()
        .map(|thread| thread.join().unwrap())
        .collect::<Vec<_>>();

    let final_content = std::fs::read(&records[0].absolute_path).unwrap();
    assert!(payloads.iter().any(|payload| payload == &final_content));
    let service = SystemService::open(dir.path()).unwrap();
    let stored = service
        .get_resource(&records[0].resource_id)
        .unwrap()
        .unwrap();
    assert_eq!(stored.sha256, sha256_hex(&final_content));
    assert_eq!(stored.size_bytes, final_content.len() as i64);
    assert_no_atomic_temp_files(records[0].absolute_path.parent().unwrap());
}

#[test]
fn rejects_sha256_mismatch_before_writing() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let error = service
        .write_atomic_file("bad.txt", b"hello", Some("not-the-hash"))
        .unwrap_err();

    assert!(matches!(error, SystemServiceError::Sha256Mismatch { .. }));
    assert!(!dir.path().join("files/bad.txt").exists());
}

#[test]
fn creates_resource_tickets_for_written_resources() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let record = service
        .write_atomic_file("artifact.txt", b"artifact", None)
        .unwrap();
    let resource_id = format!("res_{}", sha256_hex(record.logical_path.as_bytes()));

    let ticket = service
        .create_resource_ticket("user_1", &resource_id, ResourceCapability::Read, 12345)
        .unwrap();

    assert_eq!(ticket.principal_id, "user_1");
    assert_eq!(ticket.resource_id, resource_id);
    assert_eq!(ticket.capability, ResourceCapability::Read);
    assert_eq!(ticket.expires_at, 12345);
}

#[test]
fn cleanup_expired_resource_tickets_revokes_only_expired_active_tickets() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let record = service
        .write_atomic_file("cleanup/artifact.txt", b"artifact", None)
        .unwrap();

    let expired = service
        .create_resource_ticket("user_1", &record.resource_id, ResourceCapability::Read, 100)
        .unwrap();
    let also_expired = service
        .create_resource_ticket(
            "user_2",
            &record.resource_id,
            ResourceCapability::Write,
            200,
        )
        .unwrap();
    let future = service
        .create_resource_ticket(
            "user_3",
            &record.resource_id,
            ResourceCapability::Read,
            1_000,
        )
        .unwrap();

    let receipt = service
        .cleanup_expired_resource_tickets(&CleanupExpiredResourceTickets {
            now_ms: Some(500),
            limit: Some(10),
        })
        .unwrap();

    assert_eq!(receipt.revoked_count, 2);
    assert_eq!(
        receipt.revoked_ticket_ids,
        vec![expired.id, also_expired.id]
    );
    assert_eq!(receipt.now_ms, 500);

    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    let expired_revoked_at: i64 = conn
        .query_row(
            "SELECT revoked_at FROM resource_ticket WHERE id = ?",
            [&receipt.revoked_ticket_ids[0]],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(expired_revoked_at, 500);
    let future_revoked_at: Option<i64> = conn
        .query_row(
            "SELECT revoked_at FROM resource_ticket WHERE id = ?",
            [&future.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(future_revoked_at, None);

    let second = service
        .cleanup_expired_resource_tickets(&CleanupExpiredResourceTickets {
            now_ms: Some(500),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(second.revoked_count, 0);

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == "resource.ticket.cleanup"));
}

#[test]
fn durable_turns_hide_queued_input_and_preserve_canonical_order() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_turn_order"), Some("Turn order"), Some("agent"))
        .unwrap();

    let first = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_turn_order",
            input_id: "inp_turn_a",
            turn_id: "turn_a",
            job_id: "job_turn_a",
            principal_id: "user_turn",
            idempotency_key: "idem_turn_a",
            text: "first user message",
        },
    );
    let duplicate = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_turn_order",
            input_id: "inp_turn_a",
            turn_id: "turn_a",
            job_id: "job_turn_a",
            principal_id: "user_turn",
            idempotency_key: "idem_turn_a",
            text: "first user message",
        },
    );
    let second = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_turn_order",
            input_id: "inp_turn_b",
            turn_id: "turn_b",
            job_id: "job_turn_b",
            principal_id: "user_turn",
            idempotency_key: "idem_turn_b",
            text: "second user message",
        },
    );

    assert_eq!(duplicate.turn.id, first.turn.id);
    assert_eq!(
        service.list_session_messages("ses_turn_order").unwrap(),
        vec![]
    );

    let first_job = claim_session_turn_job(&service, "worker_turn_a", 60_000).unwrap();
    assert_eq!(first_job.id, first.job.id);
    assert!(claim_session_turn_job(&service, "worker_turn_blocked", 60_000).is_none());

    let first_started = start_test_turn(&service, &first, &first_job, "worker_turn_a");
    let first_invocation = begin_test_provider_invocation(
        &service,
        &first,
        &first_started,
        &first_job,
        "worker_turn_a",
    );
    let messages = service.list_session_messages("ses_turn_order").unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].turn_id, "turn_a");
    assert_eq!(messages[0].role, "user");
    assert_eq!(messages[0].sequence, 1);
    let inputs = service.list_session_inputs("ses_turn_order").unwrap();
    assert_eq!(
        inputs
            .iter()
            .find(|input| input.id == second.admission.input_id)
            .unwrap()
            .status,
        "admitted"
    );

    let first_settlement = service
        .settle_session_turn(&SettleSessionTurn {
            session_id: "ses_turn_order".to_string(),
            turn_id: first.turn.id.clone(),
            attempt_id: first_started.attempt.id.clone(),
            input_id: first.admission.input_id.clone(),
            job_id: first_job.id.clone(),
            worker_id: "worker_turn_a".to_string(),
            lease_token: first_job.lease_token.clone().unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(first_invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_turn_a",
                "text": "first assistant reply"
            }])),
            provider_state: Some(json!([{
                "providerId": "fake",
                "modelId": "model_turn_a",
                "kind": "continuation",
                "replayPolicy": "optional",
                "payload": {"token": "state-a"}
            }])),
            result: Some(json!({"steps": 1})),
            error: None,
            reason: None,
        })
        .unwrap();
    assert_eq!(first_settlement.turn.state, "succeeded");
    assert_eq!(first_settlement.job.state, "succeeded");

    let second_job = claim_session_turn_job(&service, "worker_turn_b", 60_000).unwrap();
    assert_eq!(second_job.id, second.job.id);
    let second_started = start_test_turn(&service, &second, &second_job, "worker_turn_b");
    let second_invocation = begin_test_provider_invocation(
        &service,
        &second,
        &second_started,
        &second_job,
        "worker_turn_b",
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: "ses_turn_order".to_string(),
            turn_id: second.turn.id.clone(),
            attempt_id: second_started.attempt.id,
            input_id: second.admission.input_id.clone(),
            job_id: second_job.id.clone(),
            worker_id: "worker_turn_b".to_string(),
            lease_token: second_job.lease_token.clone().unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(second_invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_turn_b",
                "text": "second assistant reply"
            }])),
            provider_state: None,
            result: Some(json!({"steps": 1})),
            error: None,
            reason: None,
        })
        .unwrap();

    let messages = service.list_session_messages("ses_turn_order").unwrap();
    assert_eq!(messages.len(), 4);
    assert_eq!(
        messages
            .iter()
            .map(|message| (
                message.sequence,
                message.turn_id.as_str(),
                message.role.as_str()
            ))
            .collect::<Vec<_>>(),
        vec![
            (1, "turn_a", "user"),
            (2, "turn_a", "assistant"),
            (3, "turn_b", "user"),
            (4, "turn_b", "assistant"),
        ]
    );
    assert_eq!(
        messages[1].provider_state,
        Some(json!([{
            "providerId": "fake",
            "modelId": "model_turn_a",
            "kind": "continuation",
            "replayPolicy": "optional",
            "payload": {"token": "state-a"}
        }]))
    );
    assert_eq!(
        messages[0].execution_binding_digest,
        first.turn.execution_binding_digest
    );
    assert_eq!(
        messages[1].execution_binding_digest,
        first.turn.execution_binding_digest
    );
    assert_eq!(
        service
            .list_session_message_window("ses_turn_order", None, Some(2))
            .unwrap()
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        vec![3, 4]
    );
    assert_eq!(
        service
            .list_session_message_window("ses_turn_order", Some(4), Some(2))
            .unwrap()
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        vec![2, 3]
    );
    assert_eq!(
        service
            .list_session_messages_by_turn_ids("ses_turn_order", &["turn_a".to_string()])
            .unwrap()
            .iter()
            .map(|message| message.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert_eq!(
        service
            .list_session_turns_by_ids("ses_turn_order", &["turn_b".to_string()])
            .unwrap()
            .iter()
            .map(|turn| turn.id.as_str())
            .collect::<Vec<_>>(),
        vec!["turn_b"]
    );
    assert!(service
        .list_session_message_window("ses_turn_order", Some(0), Some(2))
        .is_err());
    assert!(service
        .list_session_message_window("ses_turn_order", None, Some(0))
        .is_err());
    assert_eq!(
        service
            .list_session_input_window("ses_turn_order", Some("completed"), Some(1))
            .unwrap()
            .iter()
            .map(|input| input.id.as_str())
            .collect::<Vec<_>>(),
        vec!["inp_turn_b"]
    );

    let mut invalid_binding = test_execution_binding("invalid");
    invalid_binding["provider"]["modelId"] = json!("tampered");
    let invalid = service.submit_session_turn(&SubmitSessionTurn {
        id: Some("inp_invalid_binding".to_string()),
        turn_id: Some("turn_invalid_binding".to_string()),
        session_id: "ses_turn_order".to_string(),
        principal_id: "user_turn".to_string(),
        idempotency_key: "idem_invalid_binding".to_string(),
        input_type: Some("user".to_string()),
        content: json!([{"type": "text", "id": "part_invalid", "text": "invalid"}]),
        origin: None,
        intent: None,
        run_control_policy: None,
        expected_turn_id: None,
        job_id: Some("job_invalid_binding".to_string()),
        job_idempotency_key: None,
        execution_binding: invalid_binding,
        max_steps: Some(1),
        regenerates_turn_id: None,
        scheduled_at: None,
        not_before: None,
        priority: None,
        budget_grant_id: None,
    });
    assert!(matches!(
        invalid,
        Err(SystemServiceError::InvalidJobRequest(_))
    ));
}

#[test]
fn validates_complete_capability_routes_and_rejects_duplicate_requirements() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_capability_valid"), None, Some("agent"))
        .unwrap();
    service
        .create_session(Some("ses_capability_duplicate"), None, Some("agent"))
        .unwrap();
    let media = media_generation_binding("turn-route");
    let route = json!({
        "requirement": {
            "operation": "image.generate",
            "inputModalities": ["text"],
            "outputModalities": ["image"],
            "features": []
        },
        "source": "configured",
        "modelEndpoint": {
            "endpointId": media["endpointId"],
            "endpointDigest": media["endpointDigest"],
            "connection": media["connection"],
            "protocol": media["protocol"],
            "model": media["model"]
        }
    });
    let mut binding = test_execution_binding("capability_valid");
    binding["capabilityRoutes"] = json!([route.clone()]);
    refresh_execution_binding_digest(&mut binding);
    let mut valid = test_turn_request(TestTurn {
        session_id: "ses_capability_valid",
        input_id: "inp_capability_valid",
        turn_id: "turn_capability_valid",
        job_id: "job_capability_valid",
        principal_id: "capability_user",
        idempotency_key: "capability_valid",
        text: "use one exact route",
    });
    valid.execution_binding = binding.clone();
    let receipt = service.submit_session_turn(&valid).unwrap();
    assert_eq!(
        receipt.turn.execution_binding["capabilityRoutes"][0]["modelEndpoint"]["endpointId"],
        "media-endpoint-turn-route"
    );

    binding["capabilityRoutes"] = json!([route.clone(), route]);
    refresh_execution_binding_digest(&mut binding);
    let mut duplicate = test_turn_request(TestTurn {
        session_id: "ses_capability_duplicate",
        input_id: "inp_capability_duplicate",
        turn_id: "turn_capability_duplicate",
        job_id: "job_capability_duplicate",
        principal_id: "capability_user",
        idempotency_key: "capability_duplicate",
        text: "reject duplicate routes",
    });
    duplicate.execution_binding = binding;
    assert!(matches!(
        service.submit_session_turn(&duplicate),
        Err(SystemServiceError::InvalidJobRequest(_))
    ));
}

#[test]
fn follow_up_admission_requires_the_exact_current_session_head() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_follow_up_head"), None, Some("agent"))
        .unwrap();

    let parent = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_follow_up_head",
            input_id: "inp_follow_up_parent",
            turn_id: "turn_follow_up_parent",
            job_id: "job_follow_up_parent",
            principal_id: "user_follow_up",
            idempotency_key: "idem_follow_up_parent",
            text: "long running parent",
        },
    );
    let mut follow_up = test_turn_request(TestTurn {
        session_id: "ses_follow_up_head",
        input_id: "inp_follow_up_child",
        turn_id: "turn_follow_up_child",
        job_id: "job_follow_up_child",
        principal_id: "user_follow_up",
        idempotency_key: "idem_follow_up_child",
        text: "summarize after the parent",
    });
    follow_up.origin = Some(json!({
        "kind": "interactive",
        "sourceRef": "guided-follow-up",
        "parentRef": parent.turn.id
    }));
    follow_up.intent = Some("follow_up".to_string());
    follow_up.run_control_policy = Some("queue_after_current".to_string());
    follow_up.expected_turn_id = Some(parent.turn.id.clone());

    let accepted = service.submit_session_turn(&follow_up).unwrap();
    assert_eq!(accepted.turn.state, "queued");

    let mut later_queued_target = test_turn_request(TestTurn {
        session_id: "ses_follow_up_head",
        input_id: "inp_follow_up_later_target",
        turn_id: "turn_follow_up_later_target",
        job_id: "job_follow_up_later_target",
        principal_id: "user_follow_up",
        idempotency_key: "idem_follow_up_later_target",
        text: "must not target a later queued turn",
    });
    later_queued_target.intent = Some("follow_up".to_string());
    later_queued_target.run_control_policy = Some("queue_after_current".to_string());
    later_queued_target.expected_turn_id = Some(accepted.turn.id.clone());
    assert!(matches!(
        service.submit_session_turn(&later_queued_target),
        Err(SystemServiceError::Conflict(_))
    ));
    assert_eq!(
        service
            .list_session_inputs("ses_follow_up_head")
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: "ses_follow_up_head".to_string(),
                state: None,
            })
            .unwrap()
            .len(),
        2
    );

    let worker_id = "worker_follow_up_parent";
    let parent_job = claim_session_turn_job(&service, worker_id, 60_000).unwrap();
    assert_eq!(parent_job.id, parent.job.id);
    let started = start_test_turn(&service, &parent, &parent_job, worker_id);
    let invocation =
        begin_test_provider_invocation(&service, &parent, &started, &parent_job, worker_id);
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: parent.turn.session_id.clone(),
            turn_id: parent.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: parent.admission.input_id.clone(),
            job_id: parent_job.id.clone(),
            worker_id: worker_id.to_string(),
            lease_token: parent_job.lease_token.clone().unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_follow_up_parent",
                "text": "parent complete"
            }])),
            provider_state: None,
            result: Some(json!({"steps": 1})),
            error: None,
            reason: None,
        })
        .unwrap();

    let replayed = service.submit_session_turn(&follow_up).unwrap();
    assert_eq!(replayed.admission.input_id, accepted.admission.input_id);
    assert_eq!(replayed.turn.id, accepted.turn.id);
    assert_eq!(replayed.job.id, accepted.job.id);

    let mut stale_parent = test_turn_request(TestTurn {
        session_id: "ses_follow_up_head",
        input_id: "inp_follow_up_stale_parent",
        turn_id: "turn_follow_up_stale_parent",
        job_id: "job_follow_up_stale_parent",
        principal_id: "user_follow_up",
        idempotency_key: "idem_follow_up_stale_parent",
        text: "stale parent must fail",
    });
    stale_parent.intent = Some("follow_up".to_string());
    stale_parent.run_control_policy = Some("queue_after_current".to_string());
    stale_parent.expected_turn_id = Some(parent.turn.id.clone());
    assert!(matches!(
        service.submit_session_turn(&stale_parent),
        Err(SystemServiceError::Conflict(_))
    ));
    assert_eq!(
        service
            .list_session_inputs("ses_follow_up_head")
            .unwrap()
            .len(),
        2
    );

    let mut invalid_policy = test_turn_request(TestTurn {
        session_id: "ses_follow_up_head",
        input_id: "inp_follow_up_invalid_policy",
        turn_id: "turn_follow_up_invalid_policy",
        job_id: "job_follow_up_invalid_policy",
        principal_id: "user_follow_up",
        idempotency_key: "idem_follow_up_invalid_policy",
        text: "invalid policy",
    });
    invalid_policy.intent = Some("follow_up".to_string());
    invalid_policy.expected_turn_id = Some(accepted.turn.id);
    assert!(matches!(
        service.submit_session_turn(&invalid_policy),
        Err(SystemServiceError::InvalidJobRequest(_))
    ));
}

#[test]
fn exact_turn_job_input_identity_cannot_be_swapped() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_exact_turn"), None, Some("agent"))
        .unwrap();
    let first = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_exact_turn",
            input_id: "inp_exact_a",
            turn_id: "turn_exact_a",
            job_id: "job_exact_a",
            principal_id: "user_exact",
            idempotency_key: "idem_exact_a",
            text: "first",
        },
    );
    let second = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_exact_turn",
            input_id: "inp_exact_b",
            turn_id: "turn_exact_b",
            job_id: "job_exact_b",
            principal_id: "user_exact",
            idempotency_key: "idem_exact_b",
            text: "second",
        },
    );
    let job = claim_session_turn_job(&service, "worker_exact", 60_000).unwrap();

    let swapped = service.start_session_turn_attempt(&StartSessionTurnAttempt {
        session_id: "ses_exact_turn".to_string(),
        turn_id: first.turn.id.clone(),
        input_id: second.admission.input_id.clone(),
        job_id: job.id.clone(),
        worker_id: "worker_exact".to_string(),
        lease_token: job.lease_token.clone().unwrap(),
    });
    assert!(matches!(swapped, Err(SystemServiceError::Invariant(_))));
    assert!(service
        .list_session_messages("ses_exact_turn")
        .unwrap()
        .is_empty());

    let started = start_test_turn(&service, &first, &job, "worker_exact");
    let invocation =
        begin_test_provider_invocation(&service, &first, &started, &job, "worker_exact");
    assert_eq!(
        started.input_message.input_id.as_deref(),
        Some("inp_exact_a")
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: "ses_exact_turn".to_string(),
            turn_id: first.turn.id,
            attempt_id: started.attempt.id,
            input_id: first.admission.input_id,
            job_id: job.id,
            worker_id: "worker_exact".to_string(),
            lease_token: job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_exact",
                "text": "done"
            }])),
            provider_state: None,
            result: None,
            error: None,
            reason: None,
        })
        .unwrap();
}

#[test]
fn different_sessions_can_own_turn_leases_concurrently() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    for session_id in ["ses_parallel_a", "ses_parallel_b"] {
        service
            .create_session(Some(session_id), None, Some("agent"))
            .unwrap();
    }
    let first = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_parallel_a",
            input_id: "inp_parallel_a",
            turn_id: "turn_parallel_a",
            job_id: "job_parallel_a",
            principal_id: "user_parallel",
            idempotency_key: "idem_parallel_a",
            text: "first",
        },
    );
    let second = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_parallel_b",
            input_id: "inp_parallel_b",
            turn_id: "turn_parallel_b",
            job_id: "job_parallel_b",
            principal_id: "user_parallel",
            idempotency_key: "idem_parallel_b",
            text: "second",
        },
    );

    let first_job = claim_session_turn_job(&service, "worker_parallel_a", 60_000).unwrap();
    let second_job = claim_session_turn_job(&service, "worker_parallel_b", 60_000).unwrap();
    assert_ne!(first_job.concurrency_key, second_job.concurrency_key);
    let first_started = start_test_turn(&service, &first, &first_job, "worker_parallel_a");
    let second_started = start_test_turn(&service, &second, &second_job, "worker_parallel_b");

    assert_eq!(first_started.turn.state, "running");
    assert_eq!(second_started.turn.state, "running");
}

#[test]
fn queued_cancel_is_terminal_but_running_cancel_waits_for_owner() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_cancel_queued"), None, Some("agent"))
        .unwrap();
    let queued = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_cancel_queued",
            input_id: "inp_cancel_queued",
            turn_id: "turn_cancel_queued",
            job_id: "job_cancel_queued",
            principal_id: "user_cancel",
            idempotency_key: "idem_cancel_queued",
            text: "queued",
        },
    );
    let cancelled = service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: queued.turn.session_id.clone(),
            turn_id: queued.turn.id.clone(),
            input_id: queued.admission.input_id.clone(),
            job_id: queued.job.id.clone(),
            reason: "cancel before start".to_string(),
        })
        .unwrap();
    assert_eq!(cancelled.status, "cancelled");
    assert_eq!(cancelled.turn.unwrap().state, "cancelled");
    assert_eq!(cancelled.job.unwrap().state, "cancelled");
    assert_eq!(
        service.list_session_inputs("ses_cancel_queued").unwrap()[0].status,
        "cancelled"
    );
    assert!(service
        .list_session_messages("ses_cancel_queued")
        .unwrap()
        .is_empty());

    service
        .create_session(Some("ses_cancel_running"), None, Some("agent"))
        .unwrap();
    let running = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_cancel_running",
            input_id: "inp_cancel_running",
            turn_id: "turn_cancel_running",
            job_id: "job_cancel_running",
            principal_id: "user_cancel",
            idempotency_key: "idem_cancel_running",
            text: "running",
        },
    );
    let job = claim_session_turn_job(&service, "worker_cancel_running", 60_000).unwrap();
    let started = start_test_turn(&service, &running, &job, "worker_cancel_running");
    let requested = service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: running.turn.session_id.clone(),
            turn_id: running.turn.id.clone(),
            input_id: running.admission.input_id.clone(),
            job_id: running.job.id.clone(),
            reason: "cancel at safe point".to_string(),
        })
        .unwrap();
    assert_eq!(requested.status, "cancel_requested");
    assert_eq!(requested.turn.as_ref().unwrap().state, "cancel_requested");
    assert_eq!(requested.job.as_ref().unwrap().state, "running");

    let duplicate = service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: running.turn.session_id.clone(),
            turn_id: running.turn.id.clone(),
            input_id: running.admission.input_id.clone(),
            job_id: running.job.id.clone(),
            reason: "different duplicate reason".to_string(),
        })
        .unwrap();
    assert_eq!(duplicate.status, "cancel_requested");
    assert_eq!(
        duplicate.turn.as_ref().unwrap().cancel_reason.as_deref(),
        Some("cancel at safe point")
    );

    let settlement = service
        .settle_session_turn(&SettleSessionTurn {
            session_id: running.turn.session_id,
            turn_id: running.turn.id,
            attempt_id: started.attempt.id,
            input_id: running.admission.input_id,
            job_id: job.id,
            worker_id: "worker_cancel_running".to_string(),
            lease_token: job.lease_token.unwrap(),
            outcome: "cancelled".to_string(),
            provider_invocation_id: None,
            assistant_message: None,
            provider_state: None,
            result: None,
            error: None,
            reason: Some("cancel at safe point".to_string()),
        })
        .unwrap();
    assert_eq!(settlement.turn.state, "cancelled");
    assert_eq!(settlement.job.state, "cancelled");
}

#[test]
fn worker_failure_settles_unstarted_and_promoted_turns_atomically() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_fail_before"), None, Some("agent"))
        .unwrap();
    let before = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_fail_before",
            input_id: "inp_fail_before",
            turn_id: "turn_fail_before",
            job_id: "job_fail_before",
            principal_id: "user_fail",
            idempotency_key: "idem_fail_before",
            text: "before",
        },
    );
    let before_job = claim_session_turn_job(&service, "worker_fail_before", 60_000).unwrap();
    let failed_job = service
        .fail_job(&FailJob {
            job_id: before_job.id.clone(),
            worker_id: "worker_fail_before".to_string(),
            lease_token: before_job.lease_token.unwrap(),
            error: json!({"message": "handler rejected payload"}),
        })
        .unwrap()
        .unwrap();
    assert_eq!(failed_job.state, "failed");
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: "ses_fail_before".to_string(),
                state: None,
            })
            .unwrap()[0]
            .state,
        "failed"
    );
    assert_eq!(
        service.list_session_inputs("ses_fail_before").unwrap()[0].status,
        "failed"
    );
    assert!(service
        .list_session_attempts(&ListSessionAttempts {
            turn_id: before.turn.id,
        })
        .unwrap()
        .is_empty());

    service
        .create_session(Some("ses_fail_after"), None, Some("agent"))
        .unwrap();
    let after = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_fail_after",
            input_id: "inp_fail_after",
            turn_id: "turn_fail_after",
            job_id: "job_fail_after",
            principal_id: "user_fail",
            idempotency_key: "idem_fail_after",
            text: "after",
        },
    );
    let after_job = claim_session_turn_job(&service, "worker_fail_after", 60_000).unwrap();
    let started = start_test_turn(&service, &after, &after_job, "worker_fail_after");
    let provider_invocation =
        begin_test_provider_invocation(&service, &after, &started, &after_job, "worker_fail_after");
    let failed_job = service
        .fail_job(&FailJob {
            job_id: after_job.id.clone(),
            worker_id: "worker_fail_after".to_string(),
            lease_token: after_job.lease_token.unwrap(),
            error: json!({"message": "escaped after provider output"}),
        })
        .unwrap()
        .unwrap();
    assert_eq!(failed_job.state, "failed");
    let turn = service
        .list_session_turns(&ListSessionTurns {
            session_id: "ses_fail_after".to_string(),
            state: None,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(turn.state, "recovery_required");
    let attempt = service
        .list_session_attempts(&ListSessionAttempts {
            turn_id: after.turn.id.clone(),
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(attempt.id, started.attempt.id);
    assert_eq!(attempt.state, "recovery_required");
    let stored_invocation = service
        .list_provider_invocations(&wanex_system_service::ListProviderInvocations {
            turn_id: after.turn.id,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(stored_invocation.id, provider_invocation.id);
    assert_eq!(stored_invocation.state, "ambiguous");
    assert_eq!(
        service.list_session_inputs("ses_fail_after").unwrap()[0].status,
        "failed"
    );
}

#[test]
fn non_successful_settlement_cannot_hide_an_open_provider_invocation() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_open_provider"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_open_provider",
            input_id: "inp_open_provider",
            turn_id: "turn_open_provider",
            job_id: "job_open_provider",
            principal_id: "user_open_provider",
            idempotency_key: "idem_open_provider",
            text: "open",
        },
    );
    let job = claim_session_turn_job(&service, "worker_open_provider", 60_000).unwrap();
    let started = start_test_turn(&service, &submitted, &job, "worker_open_provider");
    let provider_invocation = begin_test_provider_invocation(
        &service,
        &submitted,
        &started,
        &job,
        "worker_open_provider",
    );
    let identity = SettleSessionTurn {
        session_id: submitted.turn.session_id.clone(),
        turn_id: submitted.turn.id.clone(),
        attempt_id: started.attempt.id.clone(),
        input_id: submitted.admission.input_id.clone(),
        job_id: job.id.clone(),
        worker_id: "worker_open_provider".to_string(),
        lease_token: job.lease_token.clone().unwrap(),
        outcome: "failed".to_string(),
        provider_invocation_id: None,
        assistant_message: None,
        provider_state: None,
        result: None,
        error: Some(json!({"message": "unexpected failure"})),
        reason: Some("unexpected failure".to_string()),
    };

    let rejected = service.settle_session_turn(&identity);
    assert!(matches!(rejected, Err(SystemServiceError::Invariant(_))));
    assert_eq!(
        service
            .list_provider_invocations(&wanex_system_service::ListProviderInvocations {
                turn_id: submitted.turn.id.clone(),
            })
            .unwrap()[0]
            .state,
        "dispatched"
    );
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: submitted.turn.session_id.clone(),
                state: None,
            })
            .unwrap()[0]
            .state,
        "running"
    );

    let settled = service
        .settle_session_turn(&SettleSessionTurn {
            outcome: "recovery_required".to_string(),
            error: Some(json!({"message": "provider outcome is unknown"})),
            reason: Some("provider outcome is unknown".to_string()),
            ..identity
        })
        .unwrap();
    assert_eq!(settled.turn.state, "recovery_required");
    assert_eq!(settled.attempt.state, "recovery_required");
    assert_eq!(settled.job.state, "failed");
    let stored_invocation = service
        .list_provider_invocations(&wanex_system_service::ListProviderInvocations {
            turn_id: submitted.turn.id,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(stored_invocation.id, provider_invocation.id);
    assert_eq!(stored_invocation.state, "ambiguous");
}

#[test]
fn scheduler_lease_expiry_reuses_promoted_input_only_at_a_safe_checkpoint() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_expire_before"), None, Some("agent"))
        .unwrap();
    let before = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_expire_before",
            input_id: "inp_expire_before",
            turn_id: "turn_expire_before",
            job_id: "job_expire_before",
            principal_id: "user_expire",
            idempotency_key: "idem_expire_before",
            text: "before",
        },
    );
    let old_job = claim_session_turn_job(&service, "worker_expire_old", 10).unwrap();
    std::thread::sleep(Duration::from_millis(20));
    let reclaimed = claim_session_turn_job(&service, "worker_expire_new", 60_000).unwrap();
    assert_eq!(reclaimed.id, old_job.id);
    assert_ne!(reclaimed.lease_token, old_job.lease_token);
    let started = start_test_turn(&service, &before, &reclaimed, "worker_expire_new");
    let invocation = begin_test_provider_invocation(
        &service,
        &before,
        &started,
        &reclaimed,
        "worker_expire_new",
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: before.turn.session_id,
            turn_id: before.turn.id,
            attempt_id: started.attempt.id,
            input_id: before.admission.input_id,
            job_id: reclaimed.id,
            worker_id: "worker_expire_new".to_string(),
            lease_token: reclaimed.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_expire_before",
                "text": "done"
            }])),
            provider_state: None,
            result: None,
            error: None,
            reason: None,
        })
        .unwrap();

    service
        .create_session(Some("ses_expire_after"), None, Some("agent"))
        .unwrap();
    let after = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_expire_after",
            input_id: "inp_expire_after",
            turn_id: "turn_expire_after",
            job_id: "job_expire_after",
            principal_id: "user_expire",
            idempotency_key: "idem_expire_after",
            text: "after",
        },
    );
    let after_job = claim_session_turn_job(&service, "worker_expire_after", 60_000).unwrap();
    let abandoned = start_test_turn(&service, &after, &after_job, "worker_expire_after");
    shorten_test_job_lease(&service, &after_job, "worker_expire_after");
    std::thread::sleep(Duration::from_millis(20));

    service
        .create_session(Some("ses_expire_trigger"), None, Some("agent"))
        .unwrap();
    let trigger = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_expire_trigger",
            input_id: "inp_expire_trigger",
            turn_id: "turn_expire_trigger",
            job_id: "job_expire_trigger",
            principal_id: "user_expire",
            idempotency_key: "idem_expire_trigger",
            text: "trigger",
        },
    );
    let recovered_job =
        claim_session_turn_job(&service, "worker_expire_recovered", 60_000).unwrap();
    assert_eq!(recovered_job.id, after.job.id);
    let recovered_started =
        start_test_turn(&service, &after, &recovered_job, "worker_expire_recovered");

    let recovered = service
        .list_session_turns(&ListSessionTurns {
            session_id: "ses_expire_after".to_string(),
            state: None,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(recovered.state, "running");
    let attempts = service
        .list_session_attempts(&ListSessionAttempts {
            turn_id: after.turn.id.clone(),
        })
        .unwrap();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0].id, abandoned.attempt.id);
    assert_eq!(attempts[0].state, "interrupted");
    assert_eq!(attempts[1].id, recovered_started.attempt.id);
    assert_eq!(attempts[1].attempt_number, 2);
    assert_eq!(attempts[1].state, "running");
    let messages = service.list_session_messages("ses_expire_after").unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].role, "user");
    assert_eq!(messages[0].input_id.as_deref(), Some("inp_expire_after"));

    let invocation = begin_test_provider_invocation(
        &service,
        &after,
        &recovered_started,
        &recovered_job,
        "worker_expire_recovered",
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: after.turn.session_id,
            turn_id: after.turn.id,
            attempt_id: recovered_started.attempt.id.clone(),
            input_id: after.admission.input_id,
            job_id: recovered_job.id,
            worker_id: "worker_expire_recovered".to_string(),
            lease_token: recovered_job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_expire_recovered",
                "text": "done"
            }])),
            provider_state: None,
            result: None,
            error: None,
            reason: None,
        })
        .unwrap();

    let trigger_job = claim_session_turn_job(&service, "worker_expire_trigger", 60_000).unwrap();
    assert_eq!(trigger_job.id, trigger.job.id);
}

#[test]
fn restart_requeues_retryable_provider_failure_without_duplicate_input() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_provider_retry"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_provider_retry",
            input_id: "inp_provider_retry",
            turn_id: "turn_provider_retry",
            job_id: "job_provider_retry",
            principal_id: "user_provider_retry",
            idempotency_key: "idem_provider_retry",
            text: "retry",
        },
    );
    let first_job = claim_session_turn_job(&service, "worker_provider_old", 60_000).unwrap();
    let first_started = start_test_turn(&service, &submitted, &first_job, "worker_provider_old");
    let first_invocation = service
        .begin_provider_invocation(&BeginProviderInvocation {
            id: None,
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: first_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: first_job.id.clone(),
            worker_id: "worker_provider_old".to_string(),
            lease_token: first_job.lease_token.clone().unwrap(),
            step: 1,
            invocation_number: 1,
            request_digest: "provider-retry-request".to_string(),
        })
        .unwrap();
    service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: first_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: first_job.id.clone(),
            worker_id: "worker_provider_old".to_string(),
            lease_token: first_job.lease_token.clone().unwrap(),
            invocation_id: first_invocation.id,
            outcome: "failed_before_output".to_string(),
            assistant_message: None,
            provider_state: None,
            provider_request_id: None,
            error: Some(json!({
                "category": "network",
                "message": "connection reset",
                "retryable": true,
                "outputObserved": false
            })),
        })
        .unwrap()
        .unwrap();
    shorten_test_job_lease(&service, &first_job, "worker_provider_old");
    drop(service);
    std::thread::sleep(Duration::from_millis(20));

    let recovered_service = SystemService::open(dir.path()).unwrap();
    let recovered_job =
        claim_session_turn_job(&recovered_service, "worker_provider_new", 60_000).unwrap();
    assert_eq!(recovered_job.id, submitted.job.id);
    let recovered_started = start_test_turn(
        &recovered_service,
        &submitted,
        &recovered_job,
        "worker_provider_new",
    );
    let second_invocation = recovered_service
        .begin_provider_invocation(&BeginProviderInvocation {
            id: None,
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: recovered_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: recovered_job.id.clone(),
            worker_id: "worker_provider_new".to_string(),
            lease_token: recovered_job.lease_token.clone().unwrap(),
            step: 1,
            invocation_number: 2,
            request_digest: "provider-retry-request".to_string(),
        })
        .unwrap();
    assert_eq!(second_invocation.invocation_number, 2);
    let messages = recovered_service
        .list_session_messages("ses_provider_retry")
        .unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].role, "user");
    let attempts = recovered_service
        .list_session_attempts(&ListSessionAttempts {
            turn_id: submitted.turn.id,
        })
        .unwrap();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0].state, "interrupted");
    assert_eq!(attempts[1].state, "running");
}

#[test]
fn restart_never_replays_a_dispatched_provider_invocation() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_provider_ambiguous"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_provider_ambiguous",
            input_id: "inp_provider_ambiguous",
            turn_id: "turn_provider_ambiguous",
            job_id: "job_provider_ambiguous",
            principal_id: "user_provider_ambiguous",
            idempotency_key: "idem_provider_ambiguous",
            text: "ambiguous",
        },
    );
    let job = claim_session_turn_job(&service, "worker_provider_ambiguous", 60_000).unwrap();
    let started = start_test_turn(&service, &submitted, &job, "worker_provider_ambiguous");
    service
        .begin_provider_invocation(&BeginProviderInvocation {
            id: None,
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: submitted.admission.input_id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_provider_ambiguous".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            step: 1,
            invocation_number: 1,
            request_digest: "provider-ambiguous-request".to_string(),
        })
        .unwrap();
    shorten_test_job_lease(&service, &job, "worker_provider_ambiguous");
    drop(service);
    std::thread::sleep(Duration::from_millis(20));

    let recovered_service = SystemService::open(dir.path()).unwrap();
    recovered_service
        .create_session(Some("ses_provider_trigger"), None, Some("agent"))
        .unwrap();
    let trigger = submit_test_turn(
        &recovered_service,
        TestTurn {
            session_id: "ses_provider_trigger",
            input_id: "inp_provider_trigger",
            turn_id: "turn_provider_trigger",
            job_id: "job_provider_trigger",
            principal_id: "user_provider_trigger",
            idempotency_key: "idem_provider_trigger",
            text: "trigger",
        },
    );
    let claimed =
        claim_session_turn_job(&recovered_service, "worker_provider_trigger", 60_000).unwrap();
    assert_eq!(claimed.id, trigger.job.id);
    let turn = recovered_service
        .list_session_turns(&ListSessionTurns {
            session_id: submitted.turn.session_id.clone(),
            state: None,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(turn.state, "recovery_required");
    let invocations = recovered_service
        .list_provider_invocations(&wanex_system_service::ListProviderInvocations {
            turn_id: submitted.turn.id,
        })
        .unwrap();
    assert_eq!(invocations.len(), 1);
    assert_eq!(invocations[0].state, "ambiguous");
}

#[test]
fn restart_retries_only_idempotent_tools_with_a_new_fenced_attempt() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_tool_recovery"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_tool_recovery",
            input_id: "inp_tool_recovery",
            turn_id: "turn_tool_recovery",
            job_id: "job_tool_recovery",
            principal_id: "user_tool_recovery",
            idempotency_key: "idem_tool_recovery",
            text: "tool",
        },
    );
    let first_job = claim_session_turn_job(&service, "worker_tool_old", 60_000).unwrap();
    let first_started = start_test_turn(&service, &submitted, &first_job, "worker_tool_old");
    let invocation = begin_test_provider_invocation(
        &service,
        &submitted,
        &first_started,
        &first_job,
        "worker_tool_old",
    );
    let source = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: first_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: first_job.id.clone(),
            worker_id: "worker_tool_old".to_string(),
            lease_token: first_job.lease_token.clone().unwrap(),
            invocation_id: invocation.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "tool_call",
                "id": "part_tool_recovery",
                "toolCallId": "call_tool_recovery",
                "toolName": "safe_read",
                "input": {"path": "README.md"}
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let first_tool = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: first_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            source_message_id: source.id.clone(),
            job_id: first_job.id.clone(),
            worker_id: "worker_tool_old".to_string(),
            lease_token: first_job.lease_token.clone().unwrap(),
            principal_id: "user_tool_recovery".to_string(),
            tool_call_id: "call_tool_recovery".to_string(),
            tool_name: "safe_read".to_string(),
            input: json!({"path": "README.md"}),
            descriptor: json!({
                "name": "safe_read",
                "risk": "read_only",
                "idempotent": true
            }),
            permission: json!({"status": "allow", "reason": "test"}),
            activity: Some(wanex_system_service::ToolActivityEvidence {
                call: wanex_system_service::ToolActivityPresentation {
                    summary: "Read project file".to_string(),
                    details: Some(vec![wanex_system_service::ToolActivityPresentationDetail {
                        label: "Path".to_string(),
                        value: "README.md".to_string(),
                    }]),
                },
                result: None,
            }),
            state: "running".to_string(),
            idempotency_key: "tool:recovery:call".to_string(),
        })
        .unwrap();
    let first_tool_attempt = first_tool.invocation_attempt.unwrap();
    shorten_test_job_lease(&service, &first_job, "worker_tool_old");
    drop(service);
    std::thread::sleep(Duration::from_millis(20));

    let recovered_service = SystemService::open(dir.path()).unwrap();
    let recovered_job =
        claim_session_turn_job(&recovered_service, "worker_tool_new", 60_000).unwrap();
    assert_eq!(recovered_job.id, submitted.job.id);
    let logical = recovered_service
        .get_tool_execution(&first_tool.execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(logical.state, "retry_ready");
    let recovered_started = start_test_turn(
        &recovered_service,
        &submitted,
        &recovered_job,
        "worker_tool_new",
    );
    let recovered_tool = recovered_service
        .begin_tool_execution(&BeginToolExecution {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: recovered_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            source_message_id: source.id,
            job_id: recovered_job.id.clone(),
            worker_id: "worker_tool_new".to_string(),
            lease_token: recovered_job.lease_token.clone().unwrap(),
            principal_id: "user_tool_recovery".to_string(),
            tool_call_id: "call_tool_recovery".to_string(),
            tool_name: "safe_read".to_string(),
            input: json!({"path": "README.md"}),
            descriptor: json!({
                "name": "safe_read",
                "risk": "read_only",
                "idempotent": true
            }),
            permission: json!({"status": "allow", "reason": "test"}),
            activity: first_tool.execution.activity.clone(),
            state: "running".to_string(),
            idempotency_key: "tool:recovery:call".to_string(),
        })
        .unwrap();
    let recovered_tool_attempt = recovered_tool.invocation_attempt.unwrap();
    assert_eq!(recovered_tool.execution.id, first_tool.execution.id);
    assert_eq!(recovered_tool.execution.attempt_count, 2);
    assert_ne!(recovered_tool_attempt.id, first_tool_attempt.id);

    let (late_content, late_content_digest) = tool_json_content(json!({"late": true}));
    let late_old_finish = recovered_service
        .finish_tool_execution(&wanex_system_service::FinishToolExecution {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            session_attempt_id: first_started.attempt.id,
            input_id: submitted.admission.input_id.clone(),
            job_id: first_job.id,
            worker_id: "worker_tool_old".to_string(),
            lease_token: first_job.lease_token.unwrap(),
            execution_id: first_tool.execution.id.clone(),
            invocation_attempt_id: first_tool_attempt.id,
            state: "succeeded".to_string(),
            content: Some(late_content),
            content_digest: Some(late_content_digest),
            is_error: Some(false),
            result_presentation: None,
            error: None,
        })
        .unwrap();
    assert!(late_old_finish.is_none());
    let (success_content, success_content_digest) = tool_json_content(json!({"ok": true}));
    recovered_service
        .finish_tool_execution(&wanex_system_service::FinishToolExecution {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id,
            session_attempt_id: recovered_started.attempt.id,
            input_id: submitted.admission.input_id,
            job_id: recovered_job.id,
            worker_id: "worker_tool_new".to_string(),
            lease_token: recovered_job.lease_token.unwrap(),
            execution_id: first_tool.execution.id.clone(),
            invocation_attempt_id: recovered_tool_attempt.id,
            state: "succeeded".to_string(),
            content: Some(success_content),
            content_digest: Some(success_content_digest),
            is_error: Some(false),
            result_presentation: Some(wanex_system_service::ToolActivityPresentation {
                summary: "Project file read".to_string(),
                details: Some(vec![wanex_system_service::ToolActivityPresentationDetail {
                    label: "Bytes".to_string(),
                    value: "128".to_string(),
                }]),
            }),
            error: None,
        })
        .unwrap()
        .unwrap();
    let attempts = recovered_service
        .list_tool_execution_attempts(&wanex_system_service::ListToolExecutionAttempts {
            execution_id: first_tool.execution.id,
        })
        .unwrap();
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0].state, "interrupted");
    assert_eq!(attempts[1].state, "succeeded");
    let activities = recovered_service
        .list_tool_activities(&wanex_system_service::ListToolActivities {
            session_id: submitted.turn.session_id,
            source_message_ids: vec![first_tool.execution.source_message_id],
        })
        .unwrap();
    assert_eq!(activities.len(), 1);
    assert_eq!(
        activities[0].activity.as_ref().unwrap().call.summary,
        "Read project file"
    );
    assert_eq!(
        activities[0]
            .activity
            .as_ref()
            .unwrap()
            .result
            .as_ref()
            .unwrap()
            .summary,
        "Project file read"
    );
}

#[test]
fn restart_requires_recovery_for_non_idempotent_tool_without_blocking_other_sessions() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_tool_unsafe"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_tool_unsafe",
            input_id: "inp_tool_unsafe",
            turn_id: "turn_tool_unsafe",
            job_id: "job_tool_unsafe",
            principal_id: "user_tool_unsafe",
            idempotency_key: "idem_tool_unsafe",
            text: "mutate",
        },
    );
    let abandoned_job = claim_session_turn_job(&service, "worker_tool_unsafe", 60_000).unwrap();
    let abandoned_attempt =
        start_test_turn(&service, &submitted, &abandoned_job, "worker_tool_unsafe");
    let invocation = begin_test_provider_invocation(
        &service,
        &submitted,
        &abandoned_attempt,
        &abandoned_job,
        "worker_tool_unsafe",
    );
    let source = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: abandoned_attempt.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: abandoned_job.id.clone(),
            worker_id: "worker_tool_unsafe".to_string(),
            lease_token: abandoned_job.lease_token.clone().unwrap(),
            invocation_id: invocation.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "tool_call",
                "id": "part_tool_unsafe",
                "toolCallId": "call_tool_unsafe",
                "toolName": "workspace_write",
                "input": {"path": "README.md", "content": "changed"}
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let running_tool = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: abandoned_attempt.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            source_message_id: source.id,
            job_id: abandoned_job.id.clone(),
            worker_id: "worker_tool_unsafe".to_string(),
            lease_token: abandoned_job.lease_token.clone().unwrap(),
            principal_id: "user_tool_unsafe".to_string(),
            tool_call_id: "call_tool_unsafe".to_string(),
            tool_name: "workspace_write".to_string(),
            input: json!({"path": "README.md", "content": "changed"}),
            descriptor: json!({
                "name": "workspace_write",
                "risk": "write",
                "idempotent": false
            }),
            permission: json!({"status": "allow", "reason": "test"}),
            activity: None,
            state: "running".to_string(),
            idempotency_key: "tool:unsafe:call".to_string(),
        })
        .unwrap();
    let physical_attempt = running_tool.invocation_attempt.unwrap();
    shorten_test_job_lease(&service, &abandoned_job, "worker_tool_unsafe");
    drop(service);
    std::thread::sleep(Duration::from_millis(20));

    let recovered_service = SystemService::open(dir.path()).unwrap();
    recovered_service
        .create_session(Some("ses_tool_independent"), None, Some("agent"))
        .unwrap();
    let independent = submit_test_turn(
        &recovered_service,
        TestTurn {
            session_id: "ses_tool_independent",
            input_id: "inp_tool_independent",
            turn_id: "turn_tool_independent",
            job_id: "job_tool_independent",
            principal_id: "user_tool_independent",
            idempotency_key: "idem_tool_independent",
            text: "continue",
        },
    );
    let claimed =
        claim_session_turn_job(&recovered_service, "worker_tool_independent", 60_000).unwrap();
    assert_eq!(claimed.id, independent.job.id);

    let turn = recovered_service
        .list_session_turns(&ListSessionTurns {
            session_id: submitted.turn.session_id.clone(),
            state: None,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(turn.state, "recovery_required");
    let attempts = recovered_service
        .list_session_attempts(&ListSessionAttempts {
            turn_id: submitted.turn.id.clone(),
        })
        .unwrap();
    assert_eq!(attempts.len(), 1);
    assert_eq!(attempts[0].id, abandoned_attempt.attempt.id);
    assert_eq!(attempts[0].state, "recovery_required");

    let logical = recovered_service
        .get_tool_execution(&running_tool.execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(logical.state, "recovery_required");
    assert_eq!(logical.attempt_count, 1);
    let physical = recovered_service
        .list_tool_execution_attempts(&wanex_system_service::ListToolExecutionAttempts {
            execution_id: running_tool.execution.id,
        })
        .unwrap();
    assert_eq!(physical.len(), 1);
    assert_eq!(physical[0].id, physical_attempt.id);
    assert_eq!(physical[0].state, "recovery_required");
    assert_eq!(
        recovered_service
            .get_job(&wanex_system_service::GetJob {
                job_id: abandoned_job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "failed"
    );
}

#[test]
fn ambiguous_tool_recovery_survives_restart_and_confirmations_requeue_exact_turn() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = prepare_ambiguous_tool(&service, "confirm", false, true);
    assert_eq!(fixture.recovery.execution.state, "recovery_required");
    assert_eq!(fixture.recovery.execution.recovery_revision, 1);
    assert_eq!(fixture.recovery.turn.state, "recovery_required");
    assert_eq!(fixture.recovery.attempt.state, "recovery_required");
    assert_eq!(fixture.recovery.job.state, "failed");
    assert_eq!(
        service
            .list_session_inputs(&fixture.submitted.turn.session_id)
            .unwrap()[0]
            .status,
        "failed"
    );
    let scope_id = fixture.budget_scope_id.clone().unwrap();
    assert_eq!(
        service.list_budget_grants(&scope_id).unwrap()[0].state,
        "reserved"
    );
    drop(service);

    let service = SystemService::open(dir.path()).unwrap();
    let persisted = service
        .get_tool_execution(&fixture.execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(persisted.state, "recovery_required");
    assert_eq!(
        persisted.recovery.unwrap()["reconciliationRef"],
        json!("remote-confirm")
    );
    let (late_content, late_content_digest) = tool_json_content(json!({"late": true}));
    let late = service
        .finish_tool_execution(&wanex_system_service::FinishToolExecution {
            session_id: fixture.submitted.turn.session_id.clone(),
            turn_id: fixture.submitted.turn.id.clone(),
            session_attempt_id: fixture.started.attempt.id.clone(),
            input_id: fixture.submitted.admission.input_id.clone(),
            job_id: fixture.job.id.clone(),
            worker_id: fixture.invocation_attempt.worker_id.clone(),
            lease_token: fixture.job.lease_token.clone().unwrap(),
            execution_id: fixture.execution.id.clone(),
            invocation_attempt_id: fixture.invocation_attempt.id.clone(),
            state: "succeeded".to_string(),
            content: Some(late_content),
            content_digest: Some(late_content_digest),
            is_error: Some(false),
            result_presentation: None,
            error: None,
        })
        .unwrap();
    assert!(late.is_none());

    let (confirmed_content, confirmed_content_digest) =
        tool_json_content(json!({"remoteId": "remote-confirm", "ok": true}));
    let decision_request = ResolveToolExecutionRecovery {
        execution_id: fixture.execution.id.clone(),
        expected_recovery_revision: 1,
        decision: "confirm_succeeded".to_string(),
        principal_id: "reconciler".to_string(),
        reason: "verified with remote operation log".to_string(),
        idempotency_key: "recover:confirm:succeeded".to_string(),
        content: Some(confirmed_content),
        content_digest: Some(confirmed_content_digest),
        error: None,
    };
    let resolved = service
        .resolve_tool_execution_recovery(&decision_request)
        .unwrap();
    assert_eq!(resolved.execution.state, "succeeded");
    assert_eq!(resolved.execution.recovery_revision, 2);
    assert_eq!(resolved.recovery_decision.action, "turn_requeued");
    let duplicate = service
        .resolve_tool_execution_recovery(&decision_request)
        .unwrap();
    assert_eq!(
        duplicate.recovery_decision.id,
        resolved.recovery_decision.id
    );
    let stale = service
        .resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
            idempotency_key: "recover:confirm:stale".to_string(),
            ..decision_request.clone()
        })
        .unwrap_err();
    assert!(matches!(stale, SystemServiceError::Conflict(_)));
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: fixture.submitted.turn.session_id.clone(),
                state: None,
            })
            .unwrap()[0]
            .state,
        "queued"
    );
    assert_eq!(
        service
            .list_session_inputs(&fixture.submitted.turn.session_id)
            .unwrap()[0]
            .status,
        "promoted"
    );
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: fixture.job.id.clone(),
            })
            .unwrap()
            .unwrap()
            .state,
        "ready"
    );
    assert_eq!(
        service.list_budget_grants(&scope_id).unwrap()[0].state,
        "reserved"
    );

    let recovered_job = claim_session_turn_job(&service, "worker_confirm_resumed", 60_000).unwrap();
    let recovered_started = start_test_turn(
        &service,
        &fixture.submitted,
        &recovered_job,
        "worker_confirm_resumed",
    );
    let reused = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: fixture.submitted.turn.session_id,
            turn_id: fixture.submitted.turn.id,
            attempt_id: recovered_started.attempt.id.clone(),
            input_id: fixture.submitted.admission.input_id,
            source_message_id: fixture.source_message_id,
            job_id: recovered_job.id,
            worker_id: "worker_confirm_resumed".to_string(),
            lease_token: recovered_job.lease_token.unwrap(),
            principal_id: fixture.execution.principal_id,
            tool_call_id: fixture.execution.tool_call_id,
            tool_name: fixture.execution.tool_name,
            input: fixture.execution.input,
            descriptor: fixture.execution.descriptor,
            permission: fixture.execution.permission,
            activity: fixture.execution.activity,
            state: "running".to_string(),
            idempotency_key: fixture.execution.idempotency_key,
        })
        .unwrap();
    assert!(!reused.created);
    assert!(reused.invocation_attempt.is_none());
    assert_eq!(reused.execution.state, "succeeded");
    assert_eq!(reused.execution.attempt_count, 1);
}

#[test]
fn ambiguous_tool_retry_is_bounded_idempotent_and_fences_old_attempt() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = prepare_ambiguous_tool(&service, "retry", true, false);
    let resolved = service
        .resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
            execution_id: fixture.execution.id.clone(),
            expected_recovery_revision: 1,
            decision: "retry".to_string(),
            principal_id: "reconciler".to_string(),
            reason: "remote idempotency key is authoritative".to_string(),
            idempotency_key: "recover:retry:idempotent".to_string(),
            content: None,
            content_digest: None,
            error: None,
        })
        .unwrap();
    assert_eq!(resolved.execution.state, "retry_ready");
    assert_eq!(resolved.recovery_decision.action, "turn_requeued");
    let recovered_job = claim_session_turn_job(&service, "worker_retry_resumed", 60_000).unwrap();
    let recovered_started = start_test_turn(
        &service,
        &fixture.submitted,
        &recovered_job,
        "worker_retry_resumed",
    );
    let retried = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: fixture.submitted.turn.session_id.clone(),
            turn_id: fixture.submitted.turn.id.clone(),
            attempt_id: recovered_started.attempt.id.clone(),
            input_id: fixture.submitted.admission.input_id.clone(),
            source_message_id: fixture.source_message_id,
            job_id: recovered_job.id.clone(),
            worker_id: "worker_retry_resumed".to_string(),
            lease_token: recovered_job.lease_token.clone().unwrap(),
            principal_id: fixture.execution.principal_id.clone(),
            tool_call_id: fixture.execution.tool_call_id.clone(),
            tool_name: fixture.execution.tool_name.clone(),
            input: fixture.execution.input.clone(),
            descriptor: fixture.execution.descriptor.clone(),
            permission: fixture.execution.permission.clone(),
            activity: fixture.execution.activity.clone(),
            state: "running".to_string(),
            idempotency_key: fixture.execution.idempotency_key.clone(),
        })
        .unwrap();
    let retry_attempt = retried.invocation_attempt.unwrap();
    assert_eq!(retried.execution.attempt_count, 2);
    assert_ne!(retry_attempt.id, fixture.invocation_attempt.id);
    let (late_content, late_content_digest) = tool_json_content(json!({"late": true}));
    let late = service
        .finish_tool_execution(&wanex_system_service::FinishToolExecution {
            session_id: fixture.submitted.turn.session_id.clone(),
            turn_id: fixture.submitted.turn.id.clone(),
            session_attempt_id: fixture.started.attempt.id.clone(),
            input_id: fixture.submitted.admission.input_id.clone(),
            job_id: fixture.job.id.clone(),
            worker_id: fixture.invocation_attempt.worker_id.clone(),
            lease_token: fixture.job.lease_token.clone().unwrap(),
            execution_id: fixture.execution.id.clone(),
            invocation_attempt_id: fixture.invocation_attempt.id.clone(),
            state: "succeeded".to_string(),
            content: Some(late_content),
            content_digest: Some(late_content_digest),
            is_error: Some(false),
            result_presentation: None,
            error: None,
        })
        .unwrap();
    assert!(late.is_none());
    let second_recovery = service
        .require_tool_execution_recovery(&RequireToolExecutionRecovery {
            session_id: fixture.submitted.turn.session_id.clone(),
            turn_id: fixture.submitted.turn.id.clone(),
            session_attempt_id: recovered_started.attempt.id,
            input_id: fixture.submitted.admission.input_id.clone(),
            job_id: recovered_job.id.clone(),
            worker_id: "worker_retry_resumed".to_string(),
            lease_token: recovered_job.lease_token.clone().unwrap(),
            execution_id: retried.execution.id.clone(),
            invocation_attempt_id: retry_attempt.id,
            evidence: json!({
                "type": "ambiguous_tool_outcome",
                "message": "second remote response was also lost"
            }),
        })
        .unwrap()
        .unwrap();
    assert_eq!(second_recovery.execution.recovery_revision, 3);
    let exhausted = service
        .resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
            execution_id: retried.execution.id,
            expected_recovery_revision: 3,
            decision: "retry".to_string(),
            principal_id: "reconciler".to_string(),
            reason: "request a third physical attempt".to_string(),
            idempotency_key: "recover:retry:exhausted".to_string(),
            content: None,
            content_digest: None,
            error: None,
        })
        .unwrap_err();
    assert!(matches!(exhausted, SystemServiceError::Conflict(_)));
    assert_eq!(
        service
            .get_tool_execution(&fixture.execution.id)
            .unwrap()
            .unwrap()
            .state,
        "recovery_required"
    );

    let unsafe_fixture = prepare_ambiguous_tool(&service, "retry_unsafe", false, false);
    let rejected = service
        .resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
            execution_id: unsafe_fixture.execution.id.clone(),
            expected_recovery_revision: 1,
            decision: "retry".to_string(),
            principal_id: "reconciler".to_string(),
            reason: "unsafe retry request".to_string(),
            idempotency_key: "recover:retry:unsafe".to_string(),
            content: None,
            content_digest: None,
            error: None,
        })
        .unwrap_err();
    assert!(matches!(rejected, SystemServiceError::Conflict(_)));
    assert_eq!(
        service
            .get_tool_execution(&unsafe_fixture.execution.id)
            .unwrap()
            .unwrap()
            .state,
        "recovery_required"
    );
}

#[test]
fn ambiguous_tool_confirmed_failure_and_abandonment_preserve_truthful_replay() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let failed_fixture = prepare_ambiguous_tool(&service, "confirm_failed", false, false);
    let (failed_content, failed_content_digest) =
        tool_json_content(json!({"error": "remote_rejected"}));
    let confirmed = service
        .resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
            execution_id: failed_fixture.execution.id.clone(),
            expected_recovery_revision: 1,
            decision: "confirm_failed".to_string(),
            principal_id: "reconciler".to_string(),
            reason: "remote operation log records a rejected request".to_string(),
            idempotency_key: "recover:confirm:failed".to_string(),
            content: Some(failed_content.clone()),
            content_digest: Some(failed_content_digest.clone()),
            error: Some(json!({"code": "REMOTE_REJECTED"})),
        })
        .unwrap();
    assert_eq!(confirmed.execution.state, "failed");
    assert_eq!(confirmed.execution.is_error, Some(true));
    assert_eq!(confirmed.execution.content, Some(failed_content));
    assert_eq!(
        confirmed.execution.content_digest,
        Some(failed_content_digest)
    );
    assert_eq!(confirmed.recovery_decision.action, "turn_requeued");

    let abandon_dir = tempdir().unwrap();
    let abandon_service = SystemService::open(abandon_dir.path()).unwrap();
    let abandoned_fixture = prepare_ambiguous_tool(&abandon_service, "abandon", false, true);
    let scope_id = abandoned_fixture.budget_scope_id.clone().unwrap();
    let abandoned = abandon_service
        .resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
            execution_id: abandoned_fixture.execution.id.clone(),
            expected_recovery_revision: 1,
            decision: "abandon_turn".to_string(),
            principal_id: "reconciler".to_string(),
            reason: "remote system has no reconciliation endpoint".to_string(),
            idempotency_key: "recover:abandon".to_string(),
            content: None,
            content_digest: None,
            error: None,
        })
        .unwrap();
    assert_eq!(abandoned.execution.state, "failed");
    assert_eq!(abandoned.execution.is_error, Some(true));
    assert_eq!(abandoned.recovery_decision.action, "turn_abandoned");
    let turns = abandon_service
        .list_session_turns(&ListSessionTurns {
            session_id: abandoned_fixture.submitted.turn.session_id.clone(),
            state: None,
        })
        .unwrap();
    assert_eq!(turns[0].state, "failed");
    assert_eq!(
        abandon_service.list_budget_grants(&scope_id).unwrap()[0].state,
        "committed"
    );
    let messages = abandon_service
        .list_session_messages(&abandoned_fixture.submitted.turn.session_id)
        .unwrap();
    let tool_message = messages
        .iter()
        .find(|message| message.role == "tool")
        .expect("abandonment appends an exact tool result batch");
    assert_eq!(tool_message.content.as_array().unwrap().len(), 1);
    assert_eq!(
        tool_message.content[0]["toolCallId"],
        json!(abandoned_fixture.execution.tool_call_id)
    );
    assert_eq!(
        tool_message.content[0]["content"][0]["value"]["error"],
        json!("tool_outcome_unknown")
    );
    assert_eq!(tool_message.content[0]["isError"], json!(true));
}

#[test]
fn tool_execution_is_fenced_by_canonical_source_message() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_tool_fence"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_tool_fence",
            input_id: "inp_tool_fence",
            turn_id: "turn_tool_fence",
            job_id: "job_tool_fence",
            principal_id: "user_tool",
            idempotency_key: "idem_tool_fence",
            text: "tool",
        },
    );
    let job = claim_session_turn_job(&service, "worker_tool_fence", 60_000).unwrap();
    let started = start_test_turn(&service, &submitted, &job, "worker_tool_fence");
    let source = service
        .append_session_message(&AppendSessionMessage {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_tool_fence".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
            idempotency_key: "tool-source".to_string(),
            role: "assistant".to_string(),
            content: json!([{
                "type": "tool_call",
                "id": "part_call_read",
                "toolCallId": "call_read",
                "toolName": "workspace_read",
                "input": {"path": "README.md"}
            }]),
            provider_state: None,
        })
        .unwrap()
        .unwrap();

    let request = BeginToolExecution {
        session_id: submitted.turn.session_id.clone(),
        turn_id: submitted.turn.id.clone(),
        attempt_id: started.attempt.id.clone(),
        input_id: submitted.admission.input_id.clone(),
        source_message_id: source.id.clone(),
        job_id: job.id.clone(),
        worker_id: "worker_tool_fence".to_string(),
        lease_token: job.lease_token.clone().unwrap(),
        principal_id: "user_tool".to_string(),
        tool_call_id: "call_read".to_string(),
        tool_name: "workspace_read".to_string(),
        input: json!({"path": "README.md"}),
        descriptor: json!({"name": "workspace_read", "risk": "read_only", "idempotent": true}),
        permission: json!({"status": "deny", "reason": "policy"}),
        activity: None,
        state: "denied".to_string(),
        idempotency_key: "tool:source:call_read".to_string(),
    };
    let first = service.begin_tool_execution(&request).unwrap();
    let duplicate = service.begin_tool_execution(&request).unwrap();
    assert!(first.created);
    assert!(!duplicate.created);
    assert_eq!(first.execution.id, duplicate.execution.id);
    assert_eq!(first.execution.state, "denied");
    assert_eq!(first.execution.attempt_count, 0);
    assert!(first.execution.current_invocation_attempt_id.is_none());
    assert!(first.execution.finished_at.is_some());

    let missing_call = service.begin_tool_execution(&BeginToolExecution {
        tool_call_id: "call_missing".to_string(),
        idempotency_key: "tool:source:call_missing".to_string(),
        ..request
    });
    assert!(matches!(
        missing_call,
        Err(SystemServiceError::Invariant(_))
    ));
}

#[test]
fn turn_controls_require_exact_attempt_and_owner_lease() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_turn_control"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_turn_control",
            input_id: "inp_turn_control",
            turn_id: "turn_control",
            job_id: "job_turn_control",
            principal_id: "user_control",
            idempotency_key: "idem_turn_control",
            text: "control",
        },
    );
    let job = claim_session_turn_job(&service, "worker_turn_control", 60_000).unwrap();
    let started = start_test_turn(&service, &submitted, &job, "worker_turn_control");

    let rejected = service.steer_session_turn(&SteerSessionTurn {
        session_id: submitted.turn.session_id.clone(),
        principal_id: "user_control".to_string(),
        expected_turn_id: submitted.turn.id.clone(),
        expected_attempt_id: "attempt_wrong".to_string(),
        idempotency_key: "steer_wrong".to_string(),
        content: json!([{"type": "text", "id": "part_wrong", "text": "wrong"}]),
        origin: None,
        metadata: None,
    });
    assert!(matches!(rejected, Err(SystemServiceError::Invariant(_))));

    service
        .steer_session_turn(&SteerSessionTurn {
            session_id: submitted.turn.session_id.clone(),
            principal_id: "user_control".to_string(),
            expected_turn_id: submitted.turn.id.clone(),
            expected_attempt_id: started.attempt.id.clone(),
            idempotency_key: "steer_valid".to_string(),
            content: json!([{"type": "text", "id": "part_steer", "text": "focus tests"}]),
            origin: Some(json!({"kind": "interactive"})),
            metadata: None,
        })
        .unwrap();
    let steer = service
        .list_session_turn_controls(&ListSessionTurnControls {
            session_id: submitted.turn.session_id.clone(),
            turn_id: Some(submitted.turn.id.clone()),
            attempt_id: Some(started.attempt.id.clone()),
            kind: Some("steer".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap()
        .pop()
        .unwrap();
    assert!(service
        .apply_session_turn_control(&ApplySessionTurnControl {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            control_id: steer.id.clone(),
            job_id: job.id.clone(),
            worker_id: "worker_wrong".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
        })
        .unwrap()
        .is_none());
    let applied = service
        .apply_session_turn_control(&ApplySessionTurnControl {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            control_id: steer.id,
            job_id: job.id.clone(),
            worker_id: "worker_turn_control".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(applied.effect, "steer_promoted_input");

    service
        .interrupt_session_turn(&InterruptSessionTurn {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            reason: "stop".to_string(),
            principal_id: Some("user_control".to_string()),
            idempotency_key: Some("interrupt_valid".to_string()),
            origin: None,
            metadata: None,
        })
        .unwrap();
    let interrupt = service
        .list_session_turn_controls(&ListSessionTurnControls {
            session_id: submitted.turn.session_id.clone(),
            turn_id: Some(submitted.turn.id.clone()),
            attempt_id: Some(started.attempt.id.clone()),
            kind: Some("interrupt".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap()
        .pop()
        .unwrap();
    let applied = service
        .apply_session_turn_control(&ApplySessionTurnControl {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            control_id: interrupt.id,
            job_id: job.id.clone(),
            worker_id: "worker_turn_control".to_string(),
            lease_token: job.lease_token.clone().unwrap(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(applied.effect, "interrupt_requested_cancel");

    let control_events = service
        .query_events(QueryEvents {
            session_id: Some(submitted.turn.session_id.clone()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    let control_event_types = control_events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect::<Vec<_>>();
    assert!(control_event_types.contains(&"session.turn.steer_accepted"));
    assert!(control_event_types.contains(&"session.turn.interrupt_requested"));
    assert!(control_event_types.contains(&"session.turn.control_applied"));

    let turn = service
        .list_session_turns(&ListSessionTurns {
            session_id: submitted.turn.session_id.clone(),
            state: None,
        })
        .unwrap()
        .pop()
        .unwrap();
    assert_eq!(turn.state, "cancel_requested");
    assert_eq!(job.state, "running");
}

#[test]
fn pending_steer_survives_safe_provider_checkpoint_recovery() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_steer_recovery"), None, Some("agent"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: "ses_steer_recovery",
            input_id: "inp_steer_recovery",
            turn_id: "turn_steer_recovery",
            job_id: "job_steer_recovery",
            principal_id: "user_steer_recovery",
            idempotency_key: "idem_steer_recovery",
            text: "initial",
        },
    );
    let first_job = claim_session_turn_job(&service, "worker_steer_old", 60_000).unwrap();
    let first_started = start_test_turn(&service, &submitted, &first_job, "worker_steer_old");
    service
        .steer_session_turn(&SteerSessionTurn {
            session_id: submitted.turn.session_id.clone(),
            principal_id: "user_steer_recovery".to_string(),
            expected_turn_id: submitted.turn.id.clone(),
            expected_attempt_id: first_started.attempt.id.clone(),
            idempotency_key: "steer_recovery".to_string(),
            content: json!([{
                "type": "text",
                "id": "part_steer_recovery",
                "text": "adjusted"
            }]),
            origin: None,
            metadata: None,
        })
        .unwrap();
    let invocation = begin_test_provider_invocation(
        &service,
        &submitted,
        &first_started,
        &first_job,
        "worker_steer_old",
    );
    let skipped_control = service.settle_session_turn(&SettleSessionTurn {
        session_id: submitted.turn.session_id.clone(),
        turn_id: submitted.turn.id.clone(),
        attempt_id: first_started.attempt.id.clone(),
        input_id: submitted.admission.input_id.clone(),
        job_id: first_job.id.clone(),
        worker_id: "worker_steer_old".to_string(),
        lease_token: first_job.lease_token.clone().unwrap(),
        outcome: "succeeded".to_string(),
        provider_invocation_id: Some(invocation.id.clone()),
        assistant_message: Some(json!([{
            "type": "text",
            "id": "assistant_skipped_steer",
            "text": "before steer"
        }])),
        provider_state: None,
        result: None,
        error: None,
        reason: None,
    });
    assert!(matches!(
        skipped_control,
        Err(SystemServiceError::Invariant(_))
    ));
    service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: first_started.attempt.id.clone(),
            input_id: submitted.admission.input_id.clone(),
            job_id: first_job.id.clone(),
            worker_id: "worker_steer_old".to_string(),
            lease_token: first_job.lease_token.clone().unwrap(),
            invocation_id: invocation.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "assistant_steer_checkpoint",
                "text": "before steer"
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap();

    shorten_test_job_lease(&service, &first_job, "worker_steer_old");
    std::thread::sleep(Duration::from_millis(20));
    let recovered_job = claim_session_turn_job(&service, "worker_steer_new", 60_000).unwrap();
    assert_eq!(recovered_job.id, first_job.id);
    let recovered_started =
        start_test_turn(&service, &submitted, &recovered_job, "worker_steer_new");
    let pending = service
        .list_session_turn_controls(&ListSessionTurnControls {
            session_id: submitted.turn.session_id.clone(),
            turn_id: Some(submitted.turn.id.clone()),
            attempt_id: Some(recovered_started.attempt.id.clone()),
            kind: Some("steer".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].idempotency_key, "steer_recovery");
    let applied = service
        .apply_session_turn_control(&ApplySessionTurnControl {
            session_id: submitted.turn.session_id.clone(),
            turn_id: submitted.turn.id.clone(),
            attempt_id: recovered_started.attempt.id.clone(),
            control_id: pending[0].id.clone(),
            job_id: recovered_job.id,
            worker_id: "worker_steer_new".to_string(),
            lease_token: recovered_job.lease_token.unwrap(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(applied.effect, "steer_promoted_input");

    let messages = service
        .list_session_messages(&submitted.turn.session_id)
        .unwrap();
    assert_eq!(
        messages
            .iter()
            .map(|message| message.role.as_str())
            .collect::<Vec<_>>(),
        vec!["user", "assistant", "user"]
    );
    assert_eq!(
        messages[2].input_id.as_deref(),
        applied.control.input_id.as_deref()
    );
}

#[test]
fn lists_sessions_with_filters_and_limits() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let chat = service
        .create_session(Some("ses_list_chat"), Some("Chat"), Some("chat"))
        .unwrap();
    let agent = service
        .create_session(Some("ses_list_agent"), Some("Agent"), Some("agent"))
        .unwrap();

    let all = service
        .list_sessions(&ListSessions {
            kind: None,
            status: None,
            updated_before: None,
            updated_after: None,
            limit: Some(10),
        })
        .unwrap();
    assert!(all.iter().any(|session| session.id == chat.id));
    assert!(all.iter().any(|session| session.id == agent.id));

    let agents = service
        .list_sessions(&ListSessions {
            kind: Some("agent".to_string()),
            status: Some("active".to_string()),
            updated_before: None,
            updated_after: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(
        agents
            .iter()
            .map(|session| session.id.as_str())
            .collect::<Vec<_>>(),
        vec!["ses_list_agent"]
    );

    let bounded = service
        .list_sessions(&ListSessions {
            kind: None,
            status: None,
            updated_before: Some(agent.updated_at + 1),
            updated_after: Some(chat.updated_at - 1),
            limit: Some(1),
        })
        .unwrap();
    assert_eq!(bounded.len(), 1);
    assert!(bounded[0].updated_at <= agent.updated_at);
}

#[test]
fn enforces_durable_session_lifecycle_revisions_and_admission_fences() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let created = service
        .create_session(Some("ses_lifecycle"), Some("Initial"), Some("chat"))
        .unwrap();
    assert_eq!(created.revision, 1);
    assert_eq!(created.status, "active");

    let renamed = service
        .rename_session(&RenameSession {
            session_id: created.id.clone(),
            title: "  Durable title  ".to_string(),
            expected_revision: created.revision,
        })
        .unwrap();
    assert_eq!(renamed.title.as_deref(), Some("Durable title"));
    assert_eq!(renamed.revision, 2);

    assert!(matches!(
        service.rename_session(&RenameSession {
            session_id: created.id.clone(),
            title: "Stale".to_string(),
            expected_revision: 1,
        }),
        Err(SystemServiceError::Conflict(_))
    ));

    let archived = service
        .archive_session(&SessionStateTransition {
            session_id: created.id.clone(),
            expected_revision: renamed.revision,
        })
        .unwrap();
    assert_eq!(archived.status, "archived");
    assert_eq!(archived.revision, 3);
    assert!(archived.archived_at.is_some());

    assert!(matches!(
        service.admit_session_input(&AdmitSessionInput {
            id: Some("inp_archived".to_string()),
            session_id: created.id.clone(),
            principal_id: "principal_lifecycle".to_string(),
            idempotency_key: "lifecycle:archived".to_string(),
            input_type: Some("user".to_string()),
            content: json!([{ "type": "text", "id": "part_archived", "text": "no" }]),
            origin: None,
            intent: None,
        }),
        Err(SystemServiceError::Conflict(_))
    ));

    let archived_turn = test_turn_request(TestTurn {
        session_id: &created.id,
        input_id: "inp_archived_turn",
        turn_id: "turn_archived",
        job_id: "job_archived",
        principal_id: "principal_lifecycle",
        idempotency_key: "lifecycle:archived-turn",
        text: "no durable turn",
    });
    assert!(matches!(
        service.submit_session_turn(&archived_turn),
        Err(SystemServiceError::Conflict(_))
    ));
    assert!(service.list_session_inputs(&created.id).unwrap().is_empty());
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: created.id.clone(),
            state: None,
        })
        .unwrap()
        .is_empty());
    assert!(service
        .get_job(&wanex_system_service::GetJob {
            job_id: "job_archived".to_string(),
        })
        .unwrap()
        .is_none());

    let restored = service
        .restore_session(&SessionStateTransition {
            session_id: created.id.clone(),
            expected_revision: archived.revision,
        })
        .unwrap();
    assert_eq!(restored.status, "active");
    assert_eq!(restored.revision, 4);
    assert_eq!(restored.archived_at, None);

    service
        .admit_session_input(&AdmitSessionInput {
            id: Some("inp_active".to_string()),
            session_id: created.id.clone(),
            principal_id: "principal_lifecycle".to_string(),
            idempotency_key: "lifecycle:active".to_string(),
            input_type: Some("user".to_string()),
            content: json!([{ "type": "text", "id": "part_active", "text": "yes" }]),
            origin: None,
            intent: None,
        })
        .unwrap();

    assert!(matches!(
        service.archive_session(&SessionStateTransition {
            session_id: created.id.clone(),
            expected_revision: restored.revision,
        }),
        Err(SystemServiceError::Conflict(_))
    ));

    let renamed_with_work = service
        .rename_session(&RenameSession {
            session_id: created.id.clone(),
            title: "Renamed with work".to_string(),
            expected_revision: restored.revision,
        })
        .unwrap();
    assert_eq!(renamed_with_work.revision, 5);
    assert_eq!(service.list_session_inputs(&created.id).unwrap().len(), 1);

    assert!(matches!(
        service.rename_session(&RenameSession {
            session_id: "ses_missing".to_string(),
            title: "Missing".to_string(),
            expected_revision: 1,
        }),
        Err(SystemServiceError::NotFound(_))
    ));
    assert!(matches!(
        service.rename_session(&RenameSession {
            session_id: created.id,
            title: "   ".to_string(),
            expected_revision: renamed_with_work.revision,
        }),
        Err(SystemServiceError::InvalidInput(_))
    ));
}

#[test]
fn renaming_a_running_session_preserves_execution_and_transcript() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let session = service
        .create_session(Some("ses_running_rename"), Some("Before"), Some("chat"))
        .unwrap();
    let submitted = submit_test_turn(
        &service,
        TestTurn {
            session_id: &session.id,
            input_id: "inp_running_rename",
            turn_id: "turn_running_rename",
            job_id: "job_running_rename",
            principal_id: "principal_running_rename",
            idempotency_key: "running-rename:turn",
            text: "keep this execution immutable",
        },
    );
    let claimed = claim_session_turn_job(&service, "worker_running_rename", 60_000).unwrap();
    let started = start_test_turn(&service, &submitted, &claimed, "worker_running_rename");
    assert_eq!(started.turn.state, "running");

    let turns_before = service
        .list_session_turns(&ListSessionTurns {
            session_id: session.id.clone(),
            state: None,
        })
        .unwrap();
    let job_before = service
        .get_job(&wanex_system_service::GetJob {
            job_id: submitted.job.id.clone(),
        })
        .unwrap();
    let attempts_before = service
        .list_session_attempts(&ListSessionAttempts {
            turn_id: submitted.turn.id.clone(),
        })
        .unwrap();
    let messages_before = service.list_session_messages(&session.id).unwrap();

    let renamed = service
        .rename_session(&RenameSession {
            session_id: session.id.clone(),
            title: "After".to_string(),
            expected_revision: session.revision,
        })
        .unwrap();
    assert_eq!(renamed.title.as_deref(), Some("After"));
    assert_eq!(renamed.revision, 2);
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: session.id.clone(),
                state: None,
            })
            .unwrap(),
        turns_before
    );
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: submitted.job.id,
            })
            .unwrap(),
        job_before
    );
    assert_eq!(
        service
            .list_session_attempts(&ListSessionAttempts {
                turn_id: submitted.turn.id,
            })
            .unwrap(),
        attempts_before
    );
    assert_eq!(
        service.list_session_messages(&session.id).unwrap(),
        messages_before
    );
}

#[test]
fn reserves_commits_releases_and_denies_budget_grants() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let scope = BudgetScopeRef {
        kind: BudgetScopeKind::Session,
        owner_id: "ses_budget".to_string(),
        window_kind: None,
    };
    let limit = BudgetAmount {
        tokens: Some(100),
        cost_micros: Some(1_000),
        wall_time_ms: None,
        tool_calls: Some(4),
    };

    let first = service
        .reserve_budget(&ReserveBudget {
            scope: scope.clone(),
            limit: limit.clone(),
            requested: BudgetAmount {
                tokens: Some(60),
                cost_micros: Some(200),
                wall_time_ms: None,
                tool_calls: Some(1),
            },
            principal_id: "user_budget".to_string(),
            reason: "agent.turn".to_string(),
            idempotency_key: "idem_budget_1".to_string(),
            expires_at: None,
        })
        .unwrap();
    assert_eq!(first.state, "reserved");

    let duplicate = service
        .reserve_budget(&ReserveBudget {
            scope: scope.clone(),
            limit: limit.clone(),
            requested: BudgetAmount {
                tokens: Some(60),
                cost_micros: Some(200),
                wall_time_ms: None,
                tool_calls: Some(1),
            },
            principal_id: "user_budget".to_string(),
            reason: "agent.turn".to_string(),
            idempotency_key: "idem_budget_1".to_string(),
            expires_at: None,
        })
        .unwrap();
    assert_eq!(duplicate.id, first.id);

    let denied = service
        .reserve_budget(&ReserveBudget {
            scope: scope.clone(),
            limit: limit.clone(),
            requested: BudgetAmount {
                tokens: Some(50),
                cost_micros: Some(100),
                wall_time_ms: None,
                tool_calls: Some(1),
            },
            principal_id: "user_budget".to_string(),
            reason: "agent.turn".to_string(),
            idempotency_key: "idem_budget_denied".to_string(),
            expires_at: None,
        })
        .unwrap_err();
    assert!(matches!(denied, SystemServiceError::BudgetDenied { .. }));

    service
        .record_budget_usage(&RecordBudgetUsage {
            grant_id: first.id.clone(),
            usage: BudgetAmount {
                tokens: Some(55),
                cost_micros: Some(180),
                wall_time_ms: None,
                tool_calls: Some(1),
            },
            source: "test".to_string(),
            source_id: "budget_test".to_string(),
            idempotency_key: "usage_budget_test".to_string(),
        })
        .unwrap();
    let committed = service
        .commit_budget(&CommitBudget {
            grant_id: first.id.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(committed.state, "committed");

    let second = service
        .reserve_budget(&ReserveBudget {
            scope: scope.clone(),
            limit,
            requested: BudgetAmount {
                tokens: Some(40),
                cost_micros: Some(100),
                wall_time_ms: None,
                tool_calls: Some(1),
            },
            principal_id: "user_budget".to_string(),
            reason: "agent.turn".to_string(),
            idempotency_key: "idem_budget_2".to_string(),
            expires_at: None,
        })
        .unwrap();
    let released = service.release_budget(&second.id).unwrap().unwrap();
    assert_eq!(released.state, "released");

    let scope_record = service.get_budget_scope(&first.scope_id).unwrap().unwrap();
    assert_eq!(scope_record.usage.tokens, Some(55));
    let grants = service.list_budget_grants(&first.scope_id).unwrap();
    assert_eq!(grants.len(), 2);
}

#[test]
fn scheduler_enqueues_claims_heartbeats_and_completes_jobs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let low = service
        .enqueue_job(&EnqueueJob {
            id: Some("job_low".to_string()),
            kind: SchedulerJobKind::MemoryCompaction,
            principal_id: "user_scheduler".to_string(),
            payload: json!({ "sessionId": "ses_low" }),
            scheduled_at: Some(10),
            not_before: Some(10),
            priority: Some(1),
            concurrency_key: None,
            max_attempts: Some(2),
            retry_policy: Some(RetryPolicy {
                strategy: RetryStrategy::Fixed,
                initial_delay_ms: Some(100),
                max_delay_ms: Some(100),
            }),
            idempotency_key: Some("same_job".to_string()),
            budget_grant_id: None,
        })
        .unwrap();
    let duplicate = service
        .enqueue_job(&EnqueueJob {
            id: Some("job_duplicate".to_string()),
            kind: SchedulerJobKind::MemoryCompaction,
            principal_id: "user_scheduler".to_string(),
            payload: json!({ "sessionId": "ses_duplicate" }),
            scheduled_at: Some(10),
            not_before: Some(10),
            priority: Some(1),
            concurrency_key: None,
            max_attempts: Some(2),
            retry_policy: None,
            idempotency_key: Some("same_job".to_string()),
            budget_grant_id: None,
        })
        .unwrap();
    assert_eq!(duplicate.id, low.id);

    service
        .enqueue_job(&EnqueueJob {
            id: Some("job_high".to_string()),
            kind: SchedulerJobKind::ResourceCleanup,
            principal_id: "user_scheduler".to_string(),
            payload: json!({ "path": "files/tmp" }),
            scheduled_at: Some(10),
            not_before: Some(10),
            priority: Some(10),
            concurrency_key: None,
            max_attempts: Some(1),
            retry_policy: None,
            idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap();

    let claim = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_1".to_string(),
            lease_ms: 60_000,
            kinds: None,
        })
        .unwrap()
        .unwrap();
    assert_eq!(claim.id, "job_high");
    assert_eq!(claim.state, "running");
    assert_eq!(claim.attempt, 1);

    let heartbeat = service
        .heartbeat_job(&HeartbeatJob {
            job_id: claim.id.clone(),
            worker_id: "worker_1".to_string(),
            lease_token: claim.lease_token.clone().unwrap(),
            lease_ms: 60_000,
        })
        .unwrap()
        .unwrap();
    assert!(heartbeat.lease_expires_at >= claim.lease_expires_at);

    let completed = service
        .complete_job(&CompleteJob {
            job_id: claim.id.clone(),
            worker_id: "worker_1".to_string(),
            lease_token: claim.lease_token.unwrap(),
            result: Some(json!({ "ok": true })),
        })
        .unwrap()
        .unwrap();
    assert_eq!(completed.state, "succeeded");
    assert_eq!(completed.result, Some(json!({ "ok": true })));
    assert_eq!(completed.last_error, None);

    let fetched = service
        .get_job(&wanex_system_service::GetJob {
            job_id: "job_high".to_string(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(fetched.id, "job_high");
    assert_eq!(fetched.state, "succeeded");
    assert_eq!(fetched.result, Some(json!({ "ok": true })));

    let missing = service
        .get_job(&wanex_system_service::GetJob {
            job_id: "job_missing".to_string(),
        })
        .unwrap();
    assert!(missing.is_none());

    let ready = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_2".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::MemoryCompaction]),
        })
        .unwrap()
        .unwrap();
    assert_eq!(ready.id, "job_low");
}

#[test]
fn scheduler_accepts_workspace_task_jobs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let enqueued = service
        .enqueue_job(&EnqueueJob {
            id: Some("job_workspace_task".to_string()),
            kind: SchedulerJobKind::WorkspaceTask,
            principal_id: "user_workspace_task".to_string(),
            payload: json!({
                "handlerId": "handler.workspace",
                "taskId": "wtsk_system",
                "workspaceId": "workspace_system"
            }),
            scheduled_at: Some(10),
            not_before: Some(10),
            priority: Some(3),
            concurrency_key: None,
            max_attempts: Some(1),
            retry_policy: None,
            idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert_eq!(enqueued.kind, "workspace.task");

    let claimed = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_workspace_task".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::WorkspaceTask]),
        })
        .unwrap()
        .unwrap();
    assert_eq!(claimed.id, "job_workspace_task");
    assert_eq!(claimed.kind, "workspace.task");
    assert_eq!(claimed.state, "running");

    let completed = service
        .complete_job(&CompleteJob {
            job_id: claimed.id,
            worker_id: "worker_workspace_task".to_string(),
            lease_token: claimed.lease_token.unwrap(),
            result: Some(json!({
                "taskId": "wtsk_system",
                "status": "succeeded",
                "resourceIds": []
            })),
        })
        .unwrap()
        .unwrap();
    assert_eq!(completed.state, "succeeded");
    assert_eq!(completed.result.as_ref().unwrap()["taskId"], "wtsk_system");
}

#[test]
fn scheduler_retries_reclaims_expired_leases_and_cancels_jobs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .enqueue_job(&EnqueueJob {
            id: Some("job_retry".to_string()),
            kind: SchedulerJobKind::ProviderRetry,
            principal_id: "user_scheduler".to_string(),
            payload: json!({ "provider": "fake" }),
            scheduled_at: Some(10),
            not_before: Some(10),
            priority: Some(1),
            concurrency_key: None,
            max_attempts: Some(2),
            retry_policy: Some(RetryPolicy {
                strategy: RetryStrategy::Fixed,
                initial_delay_ms: Some(0),
                max_delay_ms: Some(0),
            }),
            idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap();
    let first = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_retry".to_string(),
            lease_ms: 60_000,
            kinds: None,
        })
        .unwrap()
        .unwrap();
    let retry = service
        .fail_job(&FailJob {
            job_id: first.id.clone(),
            worker_id: "worker_retry".to_string(),
            lease_token: first.lease_token.unwrap(),
            error: json!({ "type": "provider.timeout" }),
        })
        .unwrap()
        .unwrap();
    assert_eq!(retry.state, "retry_scheduled");

    let second = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_retry_2".to_string(),
            lease_ms: 1,
            kinds: None,
        })
        .unwrap()
        .unwrap();
    assert_eq!(second.id, "job_retry");
    assert_eq!(second.attempt, 2);

    std::thread::sleep(std::time::Duration::from_millis(5));

    let reclaimed = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_retry_3".to_string(),
            lease_ms: 60_000,
            kinds: None,
        })
        .unwrap()
        .unwrap();
    assert_eq!(reclaimed.id, "job_retry");
    assert_eq!(reclaimed.attempt, 3);

    let cancelled = service
        .cancel_job(&wanex_system_service::CancelJob {
            job_id: reclaimed.id,
            reason: "no longer needed".to_string(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(cancelled.state, "cancelled");
    assert!(service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "worker_after_cancel".to_string(),
            lease_ms: 60_000,
            kinds: None,
        })
        .unwrap()
        .is_none());
}

#[test]
fn ingests_lists_and_emits_resource_metadata() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let content = b"fake-png-bytes".to_vec();
    let expected_sha256 = sha256_hex(&content);

    let record = service
        .ingest_resource(&IngestResource {
            id: Some("res_image_test".to_string()),
            logical_path: Some("resources/image/test.png".to_string()),
            content: content.clone(),
            media_type: Some("image/png".to_string()),
            kind: Some("image".to_string()),
            origin: Some("model_output".to_string()),
            label: Some("preview".to_string()),
            source: Some(ResourceSource {
                provider: Some("openai".to_string()),
                provider_file_id: Some("file_123".to_string()),
                provider_operation_id: None,
                source_url: None,
                source_expires_at: None,
            }),
            metadata: Some(json!({ "prompt": "draw a square" })),
            width: Some(2),
            height: Some(3),
            duration_ms: None,
            expected_sha256: Some(expected_sha256.clone()),
        })
        .unwrap();

    assert_eq!(record.id, "res_image_test");
    assert_eq!(record.kind, "image");
    assert_eq!(record.origin, "model_output");
    assert_eq!(record.state, "available");
    assert_eq!(record.media_type, Some("image/png".to_string()));
    assert_eq!(record.label, Some("preview".to_string()));
    assert_eq!(record.sha256, expected_sha256);
    assert_eq!(record.width, Some(2));
    assert_eq!(record.height, Some(3));
    assert_eq!(record.metadata, Some(json!({ "prompt": "draw a square" })));
    assert_eq!(
        record
            .source
            .as_ref()
            .and_then(|source| source.provider.as_deref()),
        Some("openai")
    );
    assert_eq!(
        record
            .source
            .as_ref()
            .and_then(|source| source.provider_file_id.as_deref()),
        Some("file_123")
    );
    assert_eq!(
        std::fs::read(dir.path().join("files/resources/image/test.png")).unwrap(),
        content
    );

    let fetched = service.get_resource("res_image_test").unwrap().unwrap();
    assert_eq!(fetched.logical_path, "resources/image/test.png");

    let listed = service
        .list_resources(&ListResources {
            kind: Some("image".to_string()),
            origin: Some("model_output".to_string()),
            state: Some("available".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, "res_image_test");

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(10),
        })
        .unwrap();
    let event = events
        .iter()
        .find(|event| event.event_type == "resource.ingested")
        .expect("resource.ingested event should be emitted");
    assert_eq!(event.scope.resource_id.as_deref(), Some("res_image_test"));
    assert_eq!(event.payload["resourceId"], "res_image_test");
    assert_eq!(event.payload["logicalPath"], "resources/image/test.png");
    assert_eq!(event.payload["sizeBytes"], content.len() as i64);
    assert!(
        !event.payload.to_string().contains("fake-png-bytes"),
        "events must not carry raw resource bytes"
    );

    let first = service
        .read_resource_content("res_image_test", &expected_sha256, 0, 5)
        .unwrap()
        .unwrap();
    assert_eq!(first.content, b"fake-".to_vec());
    assert_eq!(first.offset, 0);
    assert_eq!(first.total_size_bytes, content.len() as u64);
    assert!(!first.eof);

    let second = service
        .read_resource_content("res_image_test", &expected_sha256, 5, 1024)
        .unwrap()
        .unwrap();
    assert_eq!(second.content, b"png-bytes".to_vec());
    assert_eq!(second.offset, 5);
    assert!(second.eof);
}

#[test]
fn resource_snapshots_are_idempotent_and_immutable() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let request = IngestResource {
        id: Some("res_immutable".to_string()),
        logical_path: Some("resources/document/immutable.txt".to_string()),
        content: b"original".to_vec(),
        media_type: Some("text/plain".to_string()),
        kind: Some("document".to_string()),
        origin: Some("user_upload".to_string()),
        label: Some("immutable".to_string()),
        source: None,
        metadata: None,
        width: None,
        height: None,
        duration_ms: None,
        expected_sha256: None,
    };

    let original = service.ingest_resource(&request).unwrap();
    let repeated = service.ingest_resource(&request).unwrap();
    assert_eq!(repeated, original);

    let mut default_user_snapshot = request.clone();
    default_user_snapshot.logical_path = None;
    default_user_snapshot.id = None;
    let default_user = service.ingest_resource(&default_user_snapshot).unwrap();
    assert_eq!(
        service.ingest_resource(&default_user_snapshot).unwrap(),
        default_user
    );

    let mut same_bytes_different_snapshot = default_user_snapshot.clone();
    same_bytes_different_snapshot.origin = Some("model_output".to_string());
    let distinct = service
        .ingest_resource(&same_bytes_different_snapshot)
        .unwrap();
    assert_ne!(distinct.id, default_user.id);
    assert_ne!(distinct.logical_path, default_user.logical_path);
    assert_eq!(distinct.sha256, default_user.sha256);
    assert_eq!(distinct.size_bytes, default_user.size_bytes);

    let mut metadata_replacement = request.clone();
    metadata_replacement.label = Some("changed label".to_string());
    assert!(matches!(
        service.ingest_resource(&metadata_replacement).unwrap_err(),
        SystemServiceError::Invariant(message)
            if message.contains("resource snapshots are immutable")
    ));

    let mut replacement = request.clone();
    replacement.content = b"replacement".to_vec();
    let error = service.ingest_resource(&replacement).unwrap_err();
    assert!(matches!(
        error,
        SystemServiceError::Invariant(message)
            if message.contains("resource snapshots are immutable")
    ));
    assert_eq!(
        std::fs::read(dir.path().join("files/resources/document/immutable.txt")).unwrap(),
        b"original"
    );
}

#[test]
fn rejects_resource_sha256_mismatch_before_writing_bytes() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let error = service
        .ingest_resource(&IngestResource {
            id: Some("res_bad_hash".to_string()),
            logical_path: Some("resources/image/bad.png".to_string()),
            content: b"real bytes".to_vec(),
            media_type: Some("image/png".to_string()),
            kind: Some("image".to_string()),
            origin: Some("model_output".to_string()),
            label: None,
            source: None,
            metadata: None,
            width: None,
            height: None,
            duration_ms: None,
            expected_sha256: Some("not-the-real-hash".to_string()),
        })
        .unwrap_err();

    assert!(matches!(error, SystemServiceError::Sha256Mismatch { .. }));
    assert!(!dir.path().join("files/resources/image/bad.png").exists());
}

#[test]
fn persists_delegation_graph_topology_and_ready_nodes() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let graph = service
        .put_delegation_graph(&PutDelegationGraph {
            id: None,
            principal_id: "controller_agent".to_string(),
            title: Some("Parallel coding plan".to_string()),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: Some("delegation-graph-key".to_string()),
        })
        .unwrap();
    let duplicate_graph = service
        .put_delegation_graph(&PutDelegationGraph {
            id: Some("ignored_graph_id".to_string()),
            principal_id: "controller_agent".to_string(),
            title: Some("Parallel coding plan".to_string()),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: Some("delegation-graph-key".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_graph.id, graph.id);
    assert_eq!(graph.state, "open");

    let source = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: None,
            graph_id: graph.id.clone(),
            kind: "agent_task".to_string(),
            principal_id: "agent_a".to_string(),
            payload: json!({ "prompt": "inspect runtime" }),
            metadata: None,
            idempotency_key: Some("delegation-node-source".to_string()),
        })
        .unwrap();
    let duplicate_source = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: Some("ignored_node_id".to_string()),
            graph_id: graph.id.clone(),
            kind: "agent_task".to_string(),
            principal_id: "agent_a".to_string(),
            payload: json!({ "prompt": "inspect runtime" }),
            metadata: None,
            idempotency_key: Some("delegation-node-source".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_source.id, source.id);
    let fetched_source = service
        .get_delegation_graph_node(&wanex_system_service::GetDelegationGraphNode {
            node_id: source.id.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(fetched_source.id, source.id);
    assert_eq!(fetched_source.graph_id, graph.id);
    assert_eq!(fetched_source.kind, "agent_task");
    let missing_node = service
        .get_delegation_graph_node(&wanex_system_service::GetDelegationGraphNode {
            node_id: "node_missing".to_string(),
        })
        .unwrap();
    assert!(missing_node.is_none());

    let target = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: Some("node_aggregate".to_string()),
            graph_id: graph.id.clone(),
            kind: "aggregation".to_string(),
            principal_id: "controller_agent".to_string(),
            payload: json!({ "mode": "merge_reports" }),
            metadata: Some(json!({ "lane": "summary" })),
            idempotency_key: None,
        })
        .unwrap();

    let dependency = service
        .put_delegation_graph_dependency(&PutDelegationGraphDependency {
            id: None,
            graph_id: graph.id.clone(),
            from_node_id: source.id.clone(),
            to_node_id: target.id.clone(),
            kind: None,
        })
        .unwrap();
    let duplicate_dependency = service
        .put_delegation_graph_dependency(&PutDelegationGraphDependency {
            id: Some("ignored_dependency_id".to_string()),
            graph_id: graph.id.clone(),
            from_node_id: source.id.clone(),
            to_node_id: target.id.clone(),
            kind: Some("after_success".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_dependency.id, dependency.id);

    let ready_before = service
        .list_ready_delegation_graph_nodes(&ListReadyDelegationGraphNodes {
            graph_id: graph.id.clone(),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(
        ready_before
            .iter()
            .map(|node| node.id.as_str())
            .collect::<Vec<_>>(),
        vec![source.id.as_str()]
    );

    let attached = service
        .attach_delegation_graph_node_job(&AttachDelegationGraphNodeJob {
            node_id: source.id.clone(),
            scheduler_job_id: "job_delegation_source".to_string(),
        })
        .unwrap();
    assert_eq!(
        attached.scheduler_job_id.as_deref(),
        Some("job_delegation_source")
    );

    service
        .update_delegation_graph_state(&UpdateDelegationGraphState {
            graph_id: graph.id.clone(),
            state: "running".to_string(),
        })
        .unwrap();
    let running_source = service
        .update_delegation_graph_node_state(&UpdateDelegationGraphNodeState {
            node_id: source.id.clone(),
            state: "running".to_string(),
            scheduler_job_id: None,
            metadata: None,
        })
        .unwrap();
    assert!(running_source.started_at.is_some());
    let ready_while_running = service
        .list_ready_delegation_graph_nodes(&ListReadyDelegationGraphNodes {
            graph_id: graph.id.clone(),
            limit: Some(10),
        })
        .unwrap();
    assert!(ready_while_running.is_empty());

    let succeeded_source = service
        .update_delegation_graph_node_state(&UpdateDelegationGraphNodeState {
            node_id: source.id.clone(),
            state: "succeeded".to_string(),
            scheduler_job_id: None,
            metadata: Some(json!({ "result": "done" })),
        })
        .unwrap();
    assert!(succeeded_source.finished_at.is_some());
    assert_eq!(succeeded_source.metadata, Some(json!({ "result": "done" })));

    let ready_after = service
        .list_ready_delegation_graph_nodes(&ListReadyDelegationGraphNodes {
            graph_id: graph.id.clone(),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(ready_after.len(), 1);
    assert_eq!(ready_after[0].id, target.id);

    let listed_graphs = service
        .list_delegation_graphs(&ListDelegationGraphs {
            principal_id: Some("controller_agent".to_string()),
            state: Some("running".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed_graphs.len(), 1);
    assert_eq!(listed_graphs[0].id, graph.id);

    let listed_nodes = service
        .list_delegation_graph_nodes(&ListDelegationGraphNodes {
            graph_id: graph.id.clone(),
            state: Some("succeeded".to_string()),
        })
        .unwrap();
    assert_eq!(listed_nodes.len(), 1);
    assert_eq!(listed_nodes[0].id, source.id);

    let listed_dependencies = service
        .list_delegation_graph_dependencies(&ListDelegationGraphDependencies {
            graph_id: graph.id.clone(),
        })
        .unwrap();
    assert_eq!(listed_dependencies.len(), 1);
    assert_eq!(listed_dependencies[0].kind, "after_success");

    let closed = service
        .update_delegation_graph_state(&UpdateDelegationGraphState {
            graph_id: graph.id.clone(),
            state: "succeeded".to_string(),
        })
        .unwrap();
    assert_eq!(closed.state, "succeeded");
    assert!(closed.closed_at.is_some());
}

#[test]
fn rejects_invalid_delegation_graph_dependencies() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let graph_a = service
        .put_delegation_graph(&PutDelegationGraph {
            id: Some("graph_a".to_string()),
            principal_id: "controller".to_string(),
            title: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let graph_b = service
        .put_delegation_graph(&PutDelegationGraph {
            id: Some("graph_b".to_string()),
            principal_id: "controller".to_string(),
            title: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let node_a = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: Some("node_a".to_string()),
            graph_id: graph_a.id.clone(),
            kind: "agent_task".to_string(),
            principal_id: "agent_a".to_string(),
            payload: json!({}),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let node_b = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: Some("node_b".to_string()),
            graph_id: graph_b.id.clone(),
            kind: "agent_task".to_string(),
            principal_id: "agent_b".to_string(),
            payload: json!({}),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let self_dependency = service
        .put_delegation_graph_dependency(&PutDelegationGraphDependency {
            id: None,
            graph_id: graph_a.id.clone(),
            from_node_id: node_a.id.clone(),
            to_node_id: node_a.id.clone(),
            kind: Some("after_success".to_string()),
        })
        .unwrap_err();
    assert!(matches!(self_dependency, SystemServiceError::Invariant(_)));

    let cross_graph_dependency = service
        .put_delegation_graph_dependency(&PutDelegationGraphDependency {
            id: None,
            graph_id: graph_a.id.clone(),
            from_node_id: node_a.id.clone(),
            to_node_id: node_b.id.clone(),
            kind: Some("after_success".to_string()),
        })
        .unwrap_err();
    assert!(matches!(
        cross_graph_dependency,
        SystemServiceError::Invariant(_)
    ));

    let invalid_kind = service
        .put_delegation_graph_dependency(&PutDelegationGraphDependency {
            id: None,
            graph_id: graph_a.id,
            from_node_id: node_a.id,
            to_node_id: node_b.id,
            kind: Some("after_unknown".to_string()),
        })
        .unwrap_err();
    assert!(matches!(invalid_kind, SystemServiceError::Invariant(_)));
}

#[test]
fn materializes_ready_delegation_graph_nodes_atomically() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let graph = service
        .put_delegation_graph(&PutDelegationGraph {
            id: Some("graph_materialize".to_string()),
            principal_id: "controller".to_string(),
            title: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let source = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: Some("node_materialize_source".to_string()),
            graph_id: graph.id.clone(),
            kind: "agent_task".to_string(),
            principal_id: "agent_a".to_string(),
            payload: json!({ "sessionId": "ses_a", "mode": "once" }),
            metadata: Some(json!({ "lane": "inspect" })),
            idempotency_key: None,
        })
        .unwrap();
    let target = service
        .put_delegation_graph_node(&PutDelegationGraphNode {
            id: Some("node_materialize_target".to_string()),
            graph_id: graph.id.clone(),
            kind: "workspace_task".to_string(),
            principal_id: "agent_b".to_string(),
            payload: json!({ "handlerId": "merge" }),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .put_delegation_graph_dependency(&PutDelegationGraphDependency {
            id: None,
            graph_id: graph.id.clone(),
            from_node_id: source.id.clone(),
            to_node_id: target.id.clone(),
            kind: Some("after_success".to_string()),
        })
        .unwrap();

    let first = service
        .materialize_ready_delegation_graph_node(&MaterializeReadyDelegationGraphNode {
            graph_id: graph.id.clone(),
            node_id: None,
            worker_id: "orchestrator_a".to_string(),
            job_id: Some("job_materialized_source".to_string()),
            job_kind: SchedulerJobKind::WorkspaceTask,
            job_payload: None,
            scheduled_at: None,
            not_before: None,
            priority: Some(5),
            max_attempts: Some(2),
            retry_policy: None,
            job_idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap()
        .expect("source node should materialize");
    assert_eq!(first.node.id, source.id);
    assert_eq!(first.node.state, "running");
    assert_eq!(
        first.node.scheduler_job_id.as_deref(),
        Some(first.job.id.as_str())
    );
    assert_eq!(first.job.id, "job_materialized_source");
    assert_eq!(first.job.kind, "workspace.task");
    assert_eq!(first.job.payload["delegationGraphId"], graph.id);
    assert_eq!(first.job.payload["delegationNodeId"], source.id);
    assert_eq!(first.job.payload["nodeKind"], "agent_task");
    assert_eq!(first.job.payload["payload"]["sessionId"], "ses_a");
    assert_eq!(
        first.node.metadata.as_ref().unwrap()["materializedBy"],
        "orchestrator_a"
    );

    let duplicate = service
        .materialize_ready_delegation_graph_node(&MaterializeReadyDelegationGraphNode {
            graph_id: graph.id.clone(),
            node_id: Some(source.id.clone()),
            worker_id: "orchestrator_b".to_string(),
            job_id: Some("job_duplicate_source".to_string()),
            job_kind: SchedulerJobKind::WorkspaceTask,
            job_payload: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            job_idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert!(duplicate.is_none());

    let gated = service
        .materialize_ready_delegation_graph_node(&MaterializeReadyDelegationGraphNode {
            graph_id: graph.id.clone(),
            node_id: Some(target.id.clone()),
            worker_id: "orchestrator_a".to_string(),
            job_id: Some("job_materialized_target_early".to_string()),
            job_kind: SchedulerJobKind::WorkspaceTask,
            job_payload: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            job_idempotency_key: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert!(gated.is_none());

    service
        .update_delegation_graph_node_state(&UpdateDelegationGraphNodeState {
            node_id: source.id,
            state: "succeeded".to_string(),
            scheduler_job_id: None,
            metadata: None,
        })
        .unwrap();
    let second = service
        .materialize_ready_delegation_graph_node(&MaterializeReadyDelegationGraphNode {
            graph_id: graph.id,
            node_id: Some(target.id.clone()),
            worker_id: "orchestrator_a".to_string(),
            job_id: Some("job_materialized_target".to_string()),
            job_kind: SchedulerJobKind::WorkspaceTask,
            job_payload: Some(json!({ "handlerId": "override" })),
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            job_idempotency_key: Some("materialized-target-key".to_string()),
            budget_grant_id: None,
        })
        .unwrap()
        .expect("target node should materialize after source success");
    assert_eq!(second.node.id, target.id);
    assert_eq!(second.job.kind, "workspace.task");
    assert_eq!(second.job.payload["payload"]["handlerId"], "override");
}

#[test]
fn enforces_durable_team_lead_authority_with_atomic_compare_and_set() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_lead_authority".to_string()),
            principal_id: "team_lead_owner".to_string(),
            title: Some("Lead authority".to_string()),
            mode: Some("orchestrated".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    assert!(conversation.lead_participant_id.is_none());

    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_lead_user".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_lead_user_principal".to_string(),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .create_session(Some("ses_team_lead_a"), None, Some("agent"))
        .unwrap();
    let agent_a = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_lead_agent_a".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_lead_agent_a_principal".to_string(),
            kind: "agent".to_string(),
            display_name: Some("Agent A".to_string()),
            role: Some("reviewer".to_string()),
            agent_session_id: Some("ses_team_lead_a".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .create_session(Some("ses_team_lead_b"), None, Some("agent"))
        .unwrap();
    let agent_b = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_lead_agent_b".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_lead_agent_b_principal".to_string(),
            kind: "agent".to_string(),
            display_name: Some("Agent B".to_string()),
            role: Some("implementer".to_string()),
            agent_session_id: Some("ses_team_lead_b".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let assign_a = SetTeamConversationLead {
        conversation_id: conversation.id.clone(),
        expected_lead_participant_id: None,
        lead_participant_id: Some(agent_a.id.clone()),
    };
    let assigned_a = service.set_team_conversation_lead(&assign_a).unwrap();
    assert_eq!(
        assigned_a.lead_participant_id.as_deref(),
        Some(agent_a.id.as_str())
    );
    assert_eq!(
        service.set_team_conversation_lead(&assign_a).unwrap(),
        assigned_a
    );

    let stale_reassignment = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(agent_b.id.clone()),
        })
        .unwrap_err();
    assert!(matches!(
        stale_reassignment,
        SystemServiceError::Conflict(_)
    ));

    let assigned_b = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: Some(agent_a.id.clone()),
            lead_participant_id: Some(agent_b.id.clone()),
        })
        .unwrap();
    assert_eq!(
        assigned_b.lead_participant_id.as_deref(),
        Some(agent_b.id.as_str())
    );
    for state in ["muted", "left"] {
        let error = service
            .update_team_participant_state(&UpdateTeamParticipantState {
                participant_id: agent_b.id.clone(),
                state: state.to_string(),
            })
            .unwrap_err();
        assert!(matches!(error, SystemServiceError::Conflict(_)));
    }

    let cleared = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: Some(agent_b.id.clone()),
            lead_participant_id: None,
        })
        .unwrap();
    assert!(cleared.lead_participant_id.is_none());
    assert_eq!(
        service
            .update_team_participant_state(&UpdateTeamParticipantState {
                participant_id: agent_b.id.clone(),
                state: "muted".to_string(),
            })
            .unwrap()
            .state,
        "muted"
    );

    let non_agent = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(user.id),
        })
        .unwrap_err();
    assert!(matches!(non_agent, SystemServiceError::Invariant(_)));
    let inactive_agent = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(agent_b.id.clone()),
        })
        .unwrap_err();
    assert!(matches!(inactive_agent, SystemServiceError::Invariant(_)));

    let foreign_conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_lead_foreign".to_string()),
            principal_id: "team_lead_owner".to_string(),
            title: None,
            mode: Some("orchestrated".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .create_session(Some("ses_team_lead_foreign"), None, Some("agent"))
        .unwrap();
    let foreign_agent = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_lead_foreign_agent".to_string()),
            conversation_id: foreign_conversation.id,
            principal_id: "team_lead_foreign_agent_principal".to_string(),
            kind: "agent".to_string(),
            display_name: None,
            role: None,
            agent_session_id: Some("ses_team_lead_foreign".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let foreign_lead = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(foreign_agent.id.clone()),
        })
        .unwrap_err();
    assert!(matches!(foreign_lead, SystemServiceError::Invariant(_)));

    let peer = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_lead_peer".to_string()),
            principal_id: "team_lead_owner".to_string(),
            title: None,
            mode: Some("peer".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let peer_lead = service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: peer.id,
            expected_lead_participant_id: None,
            lead_participant_id: Some(foreign_agent.id),
        })
        .unwrap_err();
    assert!(matches!(peer_lead, SystemServiceError::Invariant(_)));

    service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(agent_a.id.clone()),
        })
        .unwrap();
    let lead_events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap()
        .into_iter()
        .filter(|event| {
            event.event_type == "team.conversation.lead_updated"
                && event.payload["conversationId"] == conversation.id
        })
        .collect::<Vec<_>>();
    assert_eq!(lead_events.len(), 4);
    assert_eq!(
        lead_events.last().unwrap().payload["toLeadParticipantId"],
        agent_a.id
    );

    drop(service);
    let reopened = SystemService::open(dir.path()).unwrap();
    assert_eq!(
        reopened
            .get_team_conversation(&conversation.id)
            .unwrap()
            .unwrap()
            .lead_participant_id
            .as_deref(),
        Some(agent_a.id.as_str())
    );
    reopened
        .update_team_conversation_state(&UpdateTeamConversationState {
            conversation_id: conversation.id.clone(),
            state: "closed".to_string(),
        })
        .unwrap();
    let terminal_mutation = reopened
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id,
            expected_lead_participant_id: Some(agent_a.id),
            lead_participant_id: None,
        })
        .unwrap_err();
    assert!(matches!(
        terminal_mutation,
        SystemServiceError::Invariant(_)
    ));
}

#[test]
fn enforces_fenced_orchestrated_direct_routing_policy() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_orchestrated_route".to_string()),
            principal_id: "team_orchestrated_owner".to_string(),
            title: None,
            mode: Some("orchestrated".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_orchestrated_user".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_orchestrated_user_principal".to_string(),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .create_session(Some("ses_team_orchestrated_lead"), None, Some("agent"))
        .unwrap();
    let lead = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_orchestrated_lead".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_orchestrated_lead_principal".to_string(),
            kind: "agent".to_string(),
            display_name: None,
            role: None,
            agent_session_id: Some("ses_team_orchestrated_lead".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .create_session(Some("ses_team_orchestrated_direct"), None, Some("agent"))
        .unwrap();
    let direct = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_orchestrated_direct".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_orchestrated_direct_principal".to_string(),
            kind: "agent".to_string(),
            display_name: None,
            role: None,
            agent_session_id: Some("ses_team_orchestrated_direct".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let default_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_orchestrated_default_message".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{ "type": "text", "id": "part_orchestrated_default", "text": "Plan this." }]),
            metadata: None,
            idempotency_key: "team-orchestrated-default-message".to_string(),
        })
        .unwrap();
    let missing_lead = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_orchestrated_missing_lead_route".to_string()),
            message_id: default_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "orchestrated".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: user.principal_id.clone(),
            reason: "Orchestrated lead route".to_string(),
            metadata: None,
            idempotency_key: "team-orchestrated-missing-lead-route".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: None,
                target_participant_id: lead.id.clone(),
                role: "speaker".to_string(),
                trigger: "lead".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap_err();
    assert!(matches!(missing_lead, SystemServiceError::Invariant(_)));

    service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(lead.id.clone()),
        })
        .unwrap();
    let default_route = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_orchestrated_default_route".to_string()),
            message_id: default_message.id,
            expected_revision: 1,
            expected_lead_participant_id: Some(lead.id.clone()),
            mode: "orchestrated".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: user.principal_id.clone(),
            reason: "Orchestrated lead route".to_string(),
            metadata: None,
            idempotency_key: "team-orchestrated-default-route".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: Some("team_orchestrated_default_delivery".to_string()),
                target_participant_id: lead.id.clone(),
                role: "speaker".to_string(),
                trigger: "lead".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap();
    assert_eq!(
        default_route.decision.lead_participant_id.as_deref(),
        Some(lead.id.as_str())
    );
    assert_eq!(default_route.deliveries.len(), 1);
    assert_eq!(default_route.deliveries[0].target_participant_id, lead.id);
    assert_eq!(default_route.deliveries[0].trigger, "lead");

    let direct_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_orchestrated_direct_message".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![TeamTarget {
                kind: "participant".to_string(),
                participant_id: Some(direct.id.clone()),
            }],
            content: json!([{ "type": "text", "id": "part_orchestrated_direct", "text": "Answer directly." }]),
            metadata: None,
            idempotency_key: "team-orchestrated-direct-message".to_string(),
        })
        .unwrap();
    for (key, mode, actor, target, role, trigger) in [
        (
            "wrong-mode",
            "peer",
            user.principal_id.as_str(),
            direct.id.as_str(),
            "speaker",
            "direct",
        ),
        (
            "wrong-actor",
            "orchestrated",
            "forged_actor",
            direct.id.as_str(),
            "speaker",
            "direct",
        ),
        (
            "wrong-target",
            "orchestrated",
            user.principal_id.as_str(),
            lead.id.as_str(),
            "speaker",
            "direct",
        ),
        (
            "wrong-role",
            "orchestrated",
            user.principal_id.as_str(),
            direct.id.as_str(),
            "observer",
            "direct",
        ),
        (
            "wrong-trigger",
            "orchestrated",
            user.principal_id.as_str(),
            direct.id.as_str(),
            "speaker",
            "lead",
        ),
    ] {
        let error = service
            .route_team_message(&RouteTeamMessage {
                id: None,
                message_id: direct_message.id.clone(),
                expected_revision: 1,
                expected_lead_participant_id: (mode == "orchestrated").then(|| lead.id.clone()),
                mode: mode.to_string(),
                outcome: "deliver".to_string(),
                actor_principal_id: actor.to_string(),
                reason: "Explicit participant target".to_string(),
                metadata: None,
                idempotency_key: format!("team-orchestrated-{key}"),
                deliveries: vec![RouteTeamDelivery {
                    id: None,
                    target_participant_id: target.to_string(),
                    role: role.to_string(),
                    trigger: trigger.to_string(),
                    budget_grant_id: None,
                }],
            })
            .unwrap_err();
        assert!(matches!(error, SystemServiceError::Invariant(_)));
    }

    let direct_route = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_orchestrated_direct_route".to_string()),
            message_id: direct_message.id,
            expected_revision: 1,
            expected_lead_participant_id: Some(lead.id.clone()),
            mode: "orchestrated".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: user.principal_id.clone(),
            reason: "Explicit participant target".to_string(),
            metadata: None,
            idempotency_key: "team-orchestrated-direct-route".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: Some("team_orchestrated_direct_delivery".to_string()),
                target_participant_id: direct.id.clone(),
                role: "speaker".to_string(),
                trigger: "direct".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap();
    assert_eq!(direct_route.deliveries.len(), 1);
    assert_eq!(direct_route.deliveries[0].target_participant_id, direct.id);
    assert_eq!(direct_route.deliveries[0].trigger, "direct");

    let stale_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_orchestrated_stale_message".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{ "type": "text", "id": "part_orchestrated_stale", "text": "Use the current lead." }]),
            metadata: None,
            idempotency_key: "team-orchestrated-stale-message".to_string(),
        })
        .unwrap();
    service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: Some(lead.id.clone()),
            lead_participant_id: Some(direct.id.clone()),
        })
        .unwrap();
    let stale_route = service
        .route_team_message(&RouteTeamMessage {
            id: None,
            message_id: stale_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: Some(lead.id.clone()),
            mode: "orchestrated".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: user.principal_id.clone(),
            reason: "Orchestrated lead route".to_string(),
            metadata: None,
            idempotency_key: "team-orchestrated-stale-route".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: None,
                target_participant_id: lead.id,
                role: "speaker".to_string(),
                trigger: "lead".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap_err();
    assert!(matches!(stale_route, SystemServiceError::Conflict(_)));

    for (id, targets) in [
        (
            "team_orchestrated_all_message",
            vec![TeamTarget {
                kind: "all".to_string(),
                participant_id: None,
            }],
        ),
        (
            "team_orchestrated_multi_message",
            vec![
                TeamTarget {
                    kind: "lead".to_string(),
                    participant_id: None,
                },
                TeamTarget {
                    kind: "participant".to_string(),
                    participant_id: Some(direct.id.clone()),
                },
            ],
        ),
    ] {
        let message = service
            .admit_team_message(&AdmitTeamMessage {
                id: Some(id.to_string()),
                conversation_id: conversation.id.clone(),
                author_participant_id: user.id.clone(),
                parent_message_id: None,
                kind: None,
                targets,
                content: json!([{ "type": "text", "id": format!("part_{id}"), "text": "Unsupported target." }]),
                metadata: None,
                idempotency_key: format!("{id}-admit"),
            })
            .unwrap();
        let error = service
            .route_team_message(&RouteTeamMessage {
                id: None,
                message_id: message.id,
                expected_revision: 1,
                expected_lead_participant_id: Some(direct.id.clone()),
                mode: "orchestrated".to_string(),
                outcome: "deliver".to_string(),
                actor_principal_id: user.principal_id.clone(),
                reason: "Orchestrated lead route".to_string(),
                metadata: None,
                idempotency_key: format!("{id}-route"),
                deliveries: vec![RouteTeamDelivery {
                    id: None,
                    target_participant_id: direct.id.clone(),
                    role: "speaker".to_string(),
                    trigger: "lead".to_string(),
                    budget_grant_id: None,
                }],
            })
            .unwrap_err();
        assert!(matches!(error, SystemServiceError::Invariant(_)));
    }
}

#[test]
fn atomically_admits_lead_delegation_without_expanding_public_team_delivery() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let suffix = "atomic_lead_delegation";
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some(format!("team_{suffix}")),
            principal_id: format!("owner_{suffix}"),
            title: None,
            mode: Some("orchestrated".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some(format!("user_{suffix}")),
            conversation_id: conversation.id.clone(),
            principal_id: format!("user_principal_{suffix}"),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let mut agents = Vec::new();
    for role in ["lead", "research", "review", "synthesis"] {
        let session_id = format!("ses_{suffix}_{role}");
        service
            .create_session(Some(&session_id), None, Some("agent"))
            .unwrap();
        let participant = service
            .put_team_participant(&PutTeamParticipant {
                id: Some(format!("participant_{suffix}_{role}")),
                conversation_id: conversation.id.clone(),
                principal_id: format!("principal_{suffix}_{role}"),
                kind: "agent".to_string(),
                display_name: Some(role.to_string()),
                role: None,
                agent_session_id: Some(session_id.clone()),
                metadata: None,
                idempotency_key: None,
            })
            .unwrap();
        agents.push((role, participant, session_id));
    }
    let lead = &agents[0];
    service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: None,
            lead_participant_id: Some(lead.1.id.clone()),
        })
        .unwrap();
    let message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some(format!("message_{suffix}")),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{
                "type": "text",
                "id": format!("part_{suffix}"),
                "text": "Research, review, then synthesize."
            }]),
            metadata: None,
            idempotency_key: format!("message-{suffix}"),
        })
        .unwrap();
    let routed = service
        .route_team_message(&RouteTeamMessage {
            id: Some(format!("route_{suffix}")),
            message_id: message.id.clone(),
            expected_revision: message.revision,
            expected_lead_participant_id: Some(lead.1.id.clone()),
            mode: "orchestrated".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: user.principal_id.clone(),
            reason: "Current lead owns orchestration".to_string(),
            metadata: None,
            idempotency_key: format!("route-{suffix}"),
            deliveries: vec![RouteTeamDelivery {
                id: Some(format!("delivery_{suffix}")),
                target_participant_id: lead.1.id.clone(),
                role: "speaker".to_string(),
                trigger: "lead".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap();
    let delivery = routed.deliveries[0].clone();
    let materialized = materialize_team_delivery_fixture_with_binding(
        &service,
        &TeamDeliveryTestFixture {
            conversation_id: conversation.id.clone(),
            participant_id: lead.1.id.clone(),
            participant_principal_id: lead.1.principal_id.clone(),
            session_id: lead.2.clone(),
            message_id: message.id.clone(),
            delivery_id: delivery.id.clone(),
            dispatch_job_id: delivery.dispatch_job_id.clone(),
            round_id: routed.round.as_ref().unwrap().id.clone(),
        },
        suffix,
        test_execution_binding(suffix),
    );
    let worker_id = format!("lead_worker_{suffix}");
    let parent_job = claim_session_turn_job(&service, &worker_id, 60_000).unwrap();
    assert_eq!(parent_job.id, materialized.submission.job.id);
    let started = start_test_turn(&service, &materialized.submission, &parent_job, &worker_id);
    let provider = begin_test_provider_invocation(
        &service,
        &materialized.submission,
        &started,
        &parent_job,
        &worker_id,
    );
    let tool_input = json!({
        "tasks": [
            {"key": "research", "targetParticipantId": agents[1].1.id, "prompt": "Research."},
            {"key": "review", "targetParticipantId": agents[2].1.id, "prompt": "Review."},
            {"key": "synthesis", "targetParticipantId": agents[3].1.id, "prompt": "Synthesize.", "dependsOn": ["research"]}
        ]
    });
    let tool_call_id = format!("call_{suffix}");
    let source = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: lead.2.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: parent_job.id.clone(),
            worker_id: worker_id.clone(),
            lease_token: parent_job.lease_token.clone().unwrap(),
            invocation_id: provider.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "tool_call",
                "id": format!("part_tool_{suffix}"),
                "toolCallId": tool_call_id,
                "toolName": "team_delegate",
                "input": tool_input
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let descriptor = json!({
        "name": "team_delegate",
        "description": "Delegate bounded work to active Team agents.",
        "inputSchema": {"type": "object"},
        "risk": "external",
        "idempotent": true,
        "concurrency": "exclusive",
        "resultMode": "deferred",
        "runtimeBinding": {
            "implementationId": "wanex.team.tool.delegate",
            "implementationRevision": "1",
            "configurationDigest": sha256_json(&json!({"deliveryId": delivery.id}))
        }
    });
    let begun = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: lead.2.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            source_message_id: source.id.clone(),
            job_id: parent_job.id.clone(),
            worker_id: worker_id.clone(),
            lease_token: parent_job.lease_token.clone().unwrap(),
            principal_id: lead.1.principal_id.clone(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "team_delegate".to_string(),
            input: tool_input,
            descriptor,
            permission: json!({"status": "allow", "reason": "test"}),
            activity: None,
            state: "running".to_string(),
            idempotency_key: format!("team-delegate-tool-{suffix}"),
        })
        .unwrap();
    let tool_attempt = begun.invocation_attempt.unwrap();
    let task = |index: usize, dependencies: Vec<String>| {
        let key = ["research", "review", "synthesis"][index];
        wanex_system_service::DeferredTeamDelegationTask {
            id: format!("team_task_{suffix}_{key}"),
            graph_node_id: format!("dnode_{suffix}_{key}"),
            target_participant_id: agents[index + 1].1.id.clone(),
            target_session_id: agents[index + 1].2.clone(),
            prompt: format!("{key} delegated prompt"),
            depends_on_task_ids: dependencies,
            child_input_id: format!("inp_{suffix}_{key}"),
            child_turn_id: format!("turn_{suffix}_{key}"),
            child_job_id: format!("job_{suffix}_{key}"),
            input_idempotency_key: format!("team-delegation-input-{suffix}-{key}"),
            job_idempotency_key: format!("team-delegation-job-{suffix}-{key}"),
            execution_binding: test_execution_binding(&format!("{suffix}_{key}")),
            max_steps: Some(8),
            priority: Some(2),
        }
    };
    let research_id = format!("team_task_{suffix}_research");
    let request = wanex_system_service::DeferToolExecution {
        session_id: lead.2.clone(),
        turn_id: materialized.submission.turn.id.clone(),
        session_attempt_id: started.attempt.id.clone(),
        input_id: materialized.submission.admission.input_id.clone(),
        source_message_id: source.id,
        session_job_id: parent_job.id.clone(),
        worker_id: worker_id.clone(),
        lease_token: parent_job.lease_token.clone().unwrap(),
        tool_execution_id: begun.execution.id,
        tool_invocation_attempt_id: tool_attempt.id,
        tool_call_id,
        operation: wanex_system_service::DeferredToolOperation::TeamDelegation {
            operation_id: format!("team_operation_{suffix}"),
            conversation_id: conversation.id.clone(),
            source_delivery_id: delivery.id.clone(),
            lead_participant_id: lead.1.id.clone(),
            graph_id: format!("dgraph_{suffix}"),
            tasks: vec![task(0, vec![]), task(1, vec![]), task(2, vec![research_id])],
        },
    };
    let mut forged_source = request.clone();
    if let wanex_system_service::DeferredToolOperation::TeamDelegation {
        source_delivery_id, ..
    } = &mut forged_source.operation
    {
        *source_delivery_id = "delivery_forged".to_string();
    }
    assert!(service.defer_tool_execution(&forged_source).is_err());

    let mut stale_lead = request.clone();
    if let wanex_system_service::DeferredToolOperation::TeamDelegation {
        lead_participant_id,
        ..
    } = &mut stale_lead.operation
    {
        *lead_participant_id = agents[1].1.id.clone();
    }
    assert!(service.defer_tool_execution(&stale_lead).is_err());

    let mut self_target = request.clone();
    if let wanex_system_service::DeferredToolOperation::TeamDelegation { tasks, .. } =
        &mut self_target.operation
    {
        tasks[0].target_participant_id = lead.1.id.clone();
        tasks[0].target_session_id = lead.2.clone();
    }
    assert!(service.defer_tool_execution(&self_target).is_err());

    let mut cycle = request.clone();
    if let wanex_system_service::DeferredToolOperation::TeamDelegation { tasks, .. } =
        &mut cycle.operation
    {
        tasks[0].depends_on_task_ids = vec![tasks[2].id.clone()];
    }
    assert!(service.defer_tool_execution(&cycle).is_err());

    let mut over_cap = request.clone();
    if let wanex_system_service::DeferredToolOperation::TeamDelegation { tasks, .. } =
        &mut over_cap.operation
    {
        while tasks.len() <= 8 {
            let mut extra = tasks[0].clone();
            extra.id = format!("over-cap-task-{}", tasks.len());
            extra.graph_node_id = format!("over-cap-node-{}", tasks.len());
            extra.child_input_id = format!("over-cap-input-{}", tasks.len());
            extra.child_turn_id = format!("over-cap-turn-{}", tasks.len());
            extra.child_job_id = format!("over-cap-job-{}", tasks.len());
            extra.input_idempotency_key = format!("over-cap-input-key-{}", tasks.len());
            extra.job_idempotency_key = format!("over-cap-job-key-{}", tasks.len());
            tasks.push(extra);
        }
    }
    assert!(service.defer_tool_execution(&over_cap).is_err());

    let fault = rusqlite::Connection::open(service.db_path()).unwrap();
    fault
        .execute_batch(
            "CREATE TRIGGER force_team_delegation_admission_rollback
             BEFORE INSERT ON team_delegation_task
             BEGIN
               SELECT RAISE(ABORT, 'forced Team delegation admission rollback');
             END;",
        )
        .unwrap();
    assert!(service.defer_tool_execution(&request).is_err());
    fault
        .execute_batch("DROP TRIGGER force_team_delegation_admission_rollback;")
        .unwrap();
    assert!(service
        .get_delegation_graph(&format!("dgraph_{suffix}"))
        .unwrap()
        .is_none());
    assert!(service
        .get_team_delegation_operation(&format!("team_operation_{suffix}"))
        .unwrap()
        .is_none());
    assert_eq!(
        service
            .get_tool_execution(&request.tool_execution_id)
            .unwrap()
            .unwrap()
            .state,
        "running"
    );
    let receipt = service.defer_tool_execution(&request).unwrap();
    let (operation, tasks, nodes, dependencies, jobs) = match &receipt.operation {
        wanex_system_service::DeferredToolOperationReceipt::TeamDelegation {
            record,
            tasks,
            nodes,
            dependencies,
            jobs,
            ..
        } => (record, tasks, nodes, dependencies, jobs),
        _ => panic!("expected Team delegation receipt"),
    };
    assert_eq!(operation.state, "running");
    assert_eq!(tasks.len(), 3);
    assert_eq!(dependencies.len(), 1);
    assert_eq!(jobs.len(), 2);
    assert_eq!(
        nodes.iter().filter(|node| node.state == "running").count(),
        2
    );
    assert_eq!(
        nodes.iter().filter(|node| node.state == "pending").count(),
        1
    );
    assert_eq!(
        tasks
            .iter()
            .filter(|task| task.materialized_at.is_some())
            .count(),
        2
    );
    assert_eq!(
        service
            .get_team_delegation_operation_by_tool_execution(&request.tool_execution_id,)
            .unwrap()
            .as_ref(),
        Some(operation.as_ref())
    );
    assert_eq!(
        service.list_team_delegation_tasks(&operation.id).unwrap(),
        tasks.clone()
    );
    assert_eq!(receipt.turn.state, "waiting");
    assert_eq!(receipt.session_attempt.state, "suspended");
    assert_eq!(receipt.session_job.state, "waiting");
    assert_eq!(receipt.tool_execution.state, "waiting");
    assert_eq!(receipt.tool_invocation_attempt.state, "suspended");
    assert_eq!(
        service
            .list_team_deliveries(&ListTeamDeliveries {
                conversation_id: Some(conversation.id.clone()),
                message_id: None,
                routing_decision_id: None,
                state: None,
                limit: None,
            })
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        service
            .list_team_messages(&ListTeamMessages {
                conversation_id: conversation.id.clone(),
                state: None,
                after_created_at: None,
                after_message_id: None,
                limit: None,
            })
            .unwrap()
            .len(),
        1
    );
    let replay = service.defer_tool_execution(&request).unwrap();
    match replay.operation {
        wanex_system_service::DeferredToolOperationReceipt::TeamDelegation {
            tasks, jobs, ..
        } => {
            assert_eq!(tasks.len(), 3);
            assert_eq!(jobs.len(), 2);
        }
        _ => panic!("expected Team delegation replay"),
    }
    let claimed_a = claim_session_turn_job(&service, "delegated_worker_a", 60_000).unwrap();
    let claimed_b = claim_session_turn_job(&service, "delegated_worker_b", 60_000).unwrap();
    assert_ne!(claimed_a.concurrency_key, claimed_b.concurrency_key);
    assert!(jobs.iter().any(|job| job.id == claimed_a.id));
    assert!(jobs.iter().any(|job| job.id == claimed_b.id));

    let research_task = tasks
        .iter()
        .find(|task| task.id.ends_with("_research"))
        .unwrap()
        .clone();
    let review_task = tasks
        .iter()
        .find(|task| task.id.ends_with("_review"))
        .unwrap()
        .clone();
    let synthesis_task = tasks
        .iter()
        .find(|task| task.id.ends_with("_synthesis"))
        .unwrap()
        .clone();
    let (research_job, review_job) = if claimed_a.id == research_task.child_job_id {
        (claimed_a, claimed_b)
    } else {
        (claimed_b, claimed_a)
    };
    assert_eq!(review_job.id, review_task.child_job_id);
    let research_worker = research_job.lease_owner.clone().unwrap();
    let review_worker = review_job.lease_owner.clone().unwrap();

    let research_settlement = prepare_delegated_task_settlement(
        &service,
        &research_task,
        &research_job,
        &research_worker,
        "succeeded",
        Some(json!([
            {
                "type": "reasoning",
                "id": "part_private_delegated_reasoning",
                "text": "private chain of thought",
                "visibility": "internal"
            },
            {
                "type": "text",
                "id": "part_delegated_research",
                "text": "x".repeat(10_000),
                "providerMetadata": { "trace": "must-not-leak" }
            }
        ])),
        None,
    );
    fault
        .execute_batch(&format!(
            "CREATE TRIGGER force_team_delegation_downstream_rollback
             BEFORE INSERT ON session_input WHEN NEW.id = '{}'
             BEGIN
               SELECT RAISE(ABORT, 'forced downstream rollback');
             END;",
            synthesis_task.child_input_id
        ))
        .unwrap();
    assert!(service.settle_session_turn(&research_settlement).is_err());
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: synthesis_task.target_session_id.clone(),
            state: None,
        })
        .unwrap()
        .iter()
        .all(|turn| turn.id != synthesis_task.child_turn_id));
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: research_task.target_session_id.clone(),
                state: None,
            })
            .unwrap()
            .iter()
            .find(|turn| turn.id == research_task.child_turn_id)
            .unwrap()
            .state,
        "running"
    );
    fault
        .execute_batch("DROP TRIGGER force_team_delegation_downstream_rollback;")
        .unwrap();
    service.settle_session_turn(&research_settlement).unwrap();

    let progressed_tasks = service.list_team_delegation_tasks(&operation.id).unwrap();
    assert!(progressed_tasks
        .iter()
        .find(|task| task.id == synthesis_task.id)
        .unwrap()
        .materialized_at
        .is_some());
    let synthesis_input = service
        .list_session_inputs(&synthesis_task.target_session_id)
        .unwrap()
        .into_iter()
        .find(|input| input.id == synthesis_task.child_input_id)
        .unwrap();
    assert_eq!(synthesis_input.content[0]["text"], synthesis_task.prompt);
    let encoded_dependency_input = serde_json::to_string(&synthesis_input.content).unwrap();
    assert!(encoded_dependency_input.contains(&research_task.id));
    assert!(encoded_dependency_input.contains("Additional dependency output was truncated"));
    assert!(!encoded_dependency_input.contains("private chain of thought"));
    assert!(!encoded_dependency_input.contains("must-not-leak"));
    assert_eq!(
        service
            .get_tool_execution(&request.tool_execution_id)
            .unwrap()
            .unwrap()
            .state,
        "waiting"
    );
    assert_eq!(
        service
            .list_session_turns(&ListSessionTurns {
                session_id: lead.2.clone(),
                state: None,
            })
            .unwrap()
            .iter()
            .find(|turn| turn.id == materialized.submission.turn.id)
            .unwrap()
            .state,
        "waiting"
    );

    let review_settlement = prepare_delegated_task_settlement(
        &service,
        &review_task,
        &review_job,
        &review_worker,
        "failed",
        None,
        Some(json!({
            "message": "secret provider detail at /tmp/private-path",
            "rawToolEvidence": "must-not-leak"
        })),
    );
    service.settle_session_turn(&review_settlement).unwrap();
    service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: Some(lead.1.id.clone()),
            lead_participant_id: Some(agents[1].1.id.clone()),
        })
        .unwrap();

    let synthesis_job = claim_session_turn_job(&service, "delegated_worker_synthesis", 60_000)
        .expect("dependency-ready synthesis must be claimable");
    assert_eq!(synthesis_job.id, synthesis_task.child_job_id);
    let synthesis_settlement = prepare_delegated_task_settlement(
        &service,
        &synthesis_task,
        &synthesis_job,
        "delegated_worker_synthesis",
        "succeeded",
        Some(json!([{
            "type": "text",
            "id": "part_delegated_synthesis",
            "text": "Synthesis complete."
        }])),
        None,
    );
    service.settle_session_turn(&synthesis_settlement).unwrap();
    service
        .settle_session_turn(&synthesis_settlement)
        .expect("terminal response-loss replay must be idempotent");

    let completed_operation = service
        .get_team_delegation_operation(&operation.id)
        .unwrap()
        .unwrap();
    assert_eq!(completed_operation.state, "failed");
    assert!(completed_operation.finished_at.is_some());
    assert_eq!(
        service
            .get_delegation_graph(&operation.delegation_graph_id)
            .unwrap()
            .unwrap()
            .state,
        "failed"
    );
    let parent_turn = service
        .list_session_turns(&ListSessionTurns {
            session_id: lead.2.clone(),
            state: None,
        })
        .unwrap()
        .into_iter()
        .find(|turn| turn.id == materialized.submission.turn.id)
        .unwrap();
    assert_eq!(parent_turn.state, "queued");
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: parent_job.id.clone(),
            })
            .unwrap()
            .unwrap()
            .state,
        "ready"
    );
    let settled_tool = service
        .get_tool_execution(&request.tool_execution_id)
        .unwrap()
        .unwrap();
    assert_eq!(settled_tool.state, "succeeded");
    let collection = match settled_tool.content.as_deref() {
        Some([ToolResultContentPart::Json { value }]) => value,
        _ => panic!("expected one bounded Team delegation JSON result"),
    };
    assert_eq!(collection["kind"], "team.delegation_result");
    assert_eq!(collection["graphState"], "failed");
    let task_results = collection["tasks"].as_array().unwrap();
    assert_eq!(task_results.len(), 3);
    let research_result = task_results
        .iter()
        .find(|result| result["taskId"] == research_task.id)
        .unwrap();
    assert_eq!(research_result["state"], "succeeded");
    assert_eq!(research_result["truncation"]["truncated"], true);
    assert_eq!(
        research_result["output"]["parts"][0]["text"]
            .as_str()
            .unwrap()
            .len(),
        8 * 1024
    );
    let review_result = task_results
        .iter()
        .find(|result| result["taskId"] == review_task.id)
        .unwrap();
    assert_eq!(review_result["state"], "failed");
    assert_eq!(review_result["error"]["code"], "child_turn_failed");
    let encoded_collection = serde_json::to_string(collection).unwrap();
    assert!(!encoded_collection.contains("private chain of thought"));
    assert!(!encoded_collection.contains("must-not-leak"));
    assert!(!encoded_collection.contains("/tmp/private-path"));
    assert!(encoded_collection.len() <= 128 * 1024);
    assert_eq!(
        service
            .list_team_messages(&ListTeamMessages {
                conversation_id: conversation.id.clone(),
                state: None,
                after_created_at: None,
                after_message_id: None,
                limit: None,
            })
            .unwrap()
            .len(),
        1
    );

    service
        .set_team_conversation_lead(&SetTeamConversationLead {
            conversation_id: conversation.id.clone(),
            expected_lead_participant_id: Some(agents[1].1.id.clone()),
            lead_participant_id: Some(lead.1.id.clone()),
        })
        .unwrap();
    let resumed_parent_job = claim_session_turn_job(&service, "lead_cancel_worker", 60_000)
        .expect("collected lead Turn must resume");
    assert_eq!(resumed_parent_job.id, parent_job.id);
    let resumed_parent = start_test_turn(
        &service,
        &materialized.submission,
        &resumed_parent_job,
        "lead_cancel_worker",
    );
    let resumed_provider = service
        .begin_provider_invocation(&BeginProviderInvocation {
            id: None,
            session_id: materialized.submission.turn.session_id.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: resumed_parent.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: resumed_parent_job.id.clone(),
            worker_id: "lead_cancel_worker".to_string(),
            lease_token: resumed_parent_job.lease_token.clone().unwrap(),
            step: 2,
            invocation_number: 1,
            request_digest: sha256_json(&json!({
                "turnId": materialized.submission.turn.id,
                "step": 2
            })),
        })
        .unwrap();
    let cancel_tool_call_id = format!("call_{suffix}_cancel");
    let cancel_tool_input = json!({
        "tasks": [
            {"key": "cancel-review", "targetParticipantId": agents[2].1.id, "prompt": "Review cancellation."},
            {"key": "cancel-synthesis", "targetParticipantId": agents[3].1.id, "prompt": "Synthesize cancellation."}
        ]
    });
    let cancel_source = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: lead.2.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: resumed_parent.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: resumed_parent_job.id.clone(),
            worker_id: "lead_cancel_worker".to_string(),
            lease_token: resumed_parent_job.lease_token.clone().unwrap(),
            invocation_id: resumed_provider.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "tool_call",
                "id": format!("part_tool_{suffix}_cancel"),
                "toolCallId": cancel_tool_call_id,
                "toolName": "team_delegate",
                "input": cancel_tool_input
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let cancel_tool = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: lead.2.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: resumed_parent.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            source_message_id: cancel_source.id.clone(),
            job_id: resumed_parent_job.id.clone(),
            worker_id: "lead_cancel_worker".to_string(),
            lease_token: resumed_parent_job.lease_token.clone().unwrap(),
            principal_id: lead.1.principal_id.clone(),
            tool_call_id: cancel_tool_call_id.clone(),
            tool_name: "team_delegate".to_string(),
            input: cancel_tool_input,
            descriptor: json!({
                "name": "team_delegate",
                "description": "Delegate bounded work to active Team agents.",
                "inputSchema": {"type": "object"},
                "risk": "external",
                "idempotent": true,
                "concurrency": "exclusive",
                "resultMode": "deferred",
                "runtimeBinding": {
                    "implementationId": "wanex.team.tool.delegate",
                    "implementationRevision": "1",
                    "configurationDigest": sha256_json(&json!({"deliveryId": delivery.id}))
                }
            }),
            permission: json!({"status": "allow", "reason": "test"}),
            activity: None,
            state: "running".to_string(),
            idempotency_key: format!("team-delegate-tool-{suffix}-cancel"),
        })
        .unwrap();
    let cancel_tool_attempt = cancel_tool.invocation_attempt.unwrap();
    let cancel_task = |index: usize, key: &str| wanex_system_service::DeferredTeamDelegationTask {
        id: format!("team_task_{suffix}_{key}"),
        graph_node_id: format!("dnode_{suffix}_{key}"),
        target_participant_id: agents[index].1.id.clone(),
        target_session_id: agents[index].2.clone(),
        prompt: format!("{key} delegated prompt"),
        depends_on_task_ids: vec![],
        child_input_id: format!("inp_{suffix}_{key}"),
        child_turn_id: format!("turn_{suffix}_{key}"),
        child_job_id: format!("job_{suffix}_{key}"),
        input_idempotency_key: format!("team-delegation-input-{suffix}-{key}"),
        job_idempotency_key: format!("team-delegation-job-{suffix}-{key}"),
        execution_binding: test_execution_binding(&format!("{suffix}_{key}")),
        max_steps: Some(8),
        priority: Some(2),
    };
    let cancel_request = wanex_system_service::DeferToolExecution {
        session_id: lead.2.clone(),
        turn_id: materialized.submission.turn.id.clone(),
        session_attempt_id: resumed_parent.attempt.id.clone(),
        input_id: materialized.submission.admission.input_id.clone(),
        source_message_id: cancel_source.id,
        session_job_id: resumed_parent_job.id.clone(),
        worker_id: "lead_cancel_worker".to_string(),
        lease_token: resumed_parent_job.lease_token.clone().unwrap(),
        tool_execution_id: cancel_tool.execution.id.clone(),
        tool_invocation_attempt_id: cancel_tool_attempt.id,
        tool_call_id: cancel_tool_call_id,
        operation: wanex_system_service::DeferredToolOperation::TeamDelegation {
            operation_id: format!("team_operation_{suffix}_cancel"),
            conversation_id: conversation.id.clone(),
            source_delivery_id: delivery.id.clone(),
            lead_participant_id: lead.1.id.clone(),
            graph_id: format!("dgraph_{suffix}_cancel"),
            tasks: vec![
                cancel_task(2, "cancel-review"),
                cancel_task(3, "cancel-synthesis"),
            ],
        },
    };
    let cancel_admission = service.defer_tool_execution(&cancel_request).unwrap();
    let cancel_tasks = match cancel_admission.operation {
        wanex_system_service::DeferredToolOperationReceipt::TeamDelegation { tasks, .. } => tasks,
        _ => panic!("expected cancellable Team delegation"),
    };
    let running_child_job = claim_session_turn_job(&service, "delegated_cancel_running", 60_000)
        .expect("one delegated cancellation child must be claimable");
    let running_child_task = cancel_tasks
        .iter()
        .find(|task| task.child_job_id == running_child_job.id)
        .unwrap()
        .clone();
    let running_child_attempt = service
        .start_session_turn_attempt(&StartSessionTurnAttempt {
            session_id: running_child_task.target_session_id.clone(),
            turn_id: running_child_task.child_turn_id.clone(),
            input_id: running_child_task.child_input_id.clone(),
            job_id: running_child_task.child_job_id.clone(),
            worker_id: "delegated_cancel_running".to_string(),
            lease_token: running_child_job.lease_token.clone().unwrap(),
        })
        .unwrap();
    let cancellation = service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: lead.2.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: resumed_parent_job.id.clone(),
            reason: "cancel delegated lead work".to_string(),
        })
        .unwrap();
    assert_eq!(cancellation.status, "cancel_requested");
    assert_eq!(
        cancellation.cascade_job_ids,
        vec![running_child_job.id.clone()]
    );
    assert_eq!(
        cancellation.turn.as_ref().unwrap().state,
        "cancel_requested"
    );
    assert_eq!(
        service
            .get_team_delegation_operation(&format!("team_operation_{suffix}_cancel"))
            .unwrap()
            .unwrap()
            .state,
        "cancel_requested"
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: running_child_task.target_session_id,
            turn_id: running_child_task.child_turn_id,
            attempt_id: running_child_attempt.attempt.id,
            input_id: running_child_task.child_input_id,
            job_id: running_child_job.id.clone(),
            worker_id: "delegated_cancel_running".to_string(),
            lease_token: running_child_job.lease_token.unwrap(),
            outcome: "cancelled".to_string(),
            provider_invocation_id: None,
            assistant_message: None,
            provider_state: None,
            result: None,
            error: None,
            reason: Some("parent Team delegation was cancelled".to_string()),
        })
        .unwrap();
    assert_eq!(
        service
            .get_team_delegation_operation(&format!("team_operation_{suffix}_cancel"))
            .unwrap()
            .unwrap()
            .state,
        "cancelled"
    );
    assert_eq!(
        service
            .get_tool_execution(&cancel_request.tool_execution_id)
            .unwrap()
            .unwrap()
            .state,
        "failed"
    );
    let cancelled_parent = service
        .list_session_turns(&ListSessionTurns {
            session_id: lead.2.clone(),
            state: None,
        })
        .unwrap()
        .into_iter()
        .find(|turn| turn.id == materialized.submission.turn.id)
        .unwrap();
    assert_eq!(cancelled_parent.state, "cancel_requested");
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: resumed_parent_job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "ready"
    );
}

#[test]
fn persists_team_message_routing_and_delivery_ledger() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: None,
            principal_id: "team_owner".to_string(),
            title: Some("Kernel team".to_string()),
            mode: Some("hybrid".to_string()),
            metadata: Some(json!({ "graphId": "graph_team" })),
            idempotency_key: Some("team-conversation-key".to_string()),
        })
        .unwrap();
    let duplicate = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("ignored_team_id".to_string()),
            principal_id: "team_owner".to_string(),
            title: Some("Kernel team".to_string()),
            mode: Some("hybrid".to_string()),
            metadata: Some(json!({ "graphId": "graph_team" })),
            idempotency_key: Some("team-conversation-key".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate.id, conversation.id);
    assert_eq!(conversation.mode, "hybrid");
    assert_eq!(conversation.state, "open");

    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_part_user".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "user_1".to_string(),
            kind: "user".to_string(),
            display_name: Some("User".to_string()),
            role: Some("requester".to_string()),
            agent_session_id: None,
            metadata: None,
            idempotency_key: Some("team-part-user".to_string()),
        })
        .unwrap();
    let agent_session = service
        .create_session(Some("ses_team_agent_one"), None, Some("agent"))
        .unwrap();
    let agent = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_part_agent".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "agent_1".to_string(),
            kind: "agent".to_string(),
            display_name: Some("Agent".to_string()),
            role: Some("reviewer".to_string()),
            agent_session_id: Some(agent_session.id.clone()),
            metadata: Some(json!({ "profile": "coder" })),
            idempotency_key: None,
        })
        .unwrap();
    let duplicate_user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("ignored_participant_id".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "user_1".to_string(),
            kind: "user".to_string(),
            display_name: Some("User".to_string()),
            role: Some("requester".to_string()),
            agent_session_id: None,
            metadata: None,
            idempotency_key: Some("team-part-user".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_user.id, user.id);

    let first_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_message_one".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: Some("message".to_string()),
            targets: vec![TeamTarget {
                kind: "participant".to_string(),
                participant_id: Some(agent.id.clone()),
            }],
            content: json!([
                { "type": "text", "id": "part_team_1", "text": "Please review this plan." }
            ]),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: "team-message-key".to_string(),
        })
        .unwrap();
    assert_eq!(first_message.id, "team_message_one");
    assert_eq!(first_message.state, "admitted");
    assert_eq!(first_message.revision, 1);
    assert_eq!(
        first_message.targets[0].participant_id,
        Some(agent.id.clone())
    );
    let duplicate_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_message_one".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: Some("message".to_string()),
            targets: vec![TeamTarget {
                kind: "participant".to_string(),
                participant_id: Some(agent.id.clone()),
            }],
            content: json!([
                { "type": "text", "id": "part_team_1", "text": "Please review this plan." }
            ]),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: "team-message-key".to_string(),
        })
        .unwrap();
    assert_eq!(duplicate_message.id, first_message.id);
    assert!(service
        .admit_team_message(&AdmitTeamMessage {
            id: None,
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{
                "type": "reasoning",
                "id": "team_private_reasoning",
                "text": "private chain"
            }]),
            metadata: None,
            idempotency_key: "team-private-reasoning".to_string(),
        })
        .is_err());
    assert!(service
        .admit_team_message(&AdmitTeamMessage {
            id: None,
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{
                "type": "text",
                "id": "team_internal_text",
                "text": "hidden",
                "visibility": "internal"
            }]),
            metadata: None,
            idempotency_key: "team-internal-text".to_string(),
        })
        .is_err());

    let listed_conversations = service
        .list_team_conversations(&ListTeamConversations {
            principal_id: Some("team_owner".to_string()),
            state: Some("open".to_string()),
            mode: Some("hybrid".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed_conversations.len(), 1);
    assert_eq!(listed_conversations[0].id, conversation.id);

    let active_participants = service
        .list_team_participants(&ListTeamParticipants {
            conversation_id: conversation.id.clone(),
            state: Some("active".to_string()),
        })
        .unwrap();
    assert_eq!(
        active_participants
            .iter()
            .map(|participant| participant.id.as_str())
            .collect::<Vec<_>>(),
        vec![user.id.as_str(), agent.id.as_str()]
    );

    let messages = service
        .list_team_messages(&ListTeamMessages {
            conversation_id: conversation.id.clone(),
            state: Some("admitted".to_string()),
            after_created_at: None,
            after_message_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].content[0]["text"], "Please review this plan.");

    let empty_delivery_route = service
        .route_team_message(&RouteTeamMessage {
            id: None,
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Missing delivery".to_string(),
            metadata: None,
            idempotency_key: "team-route-empty-delivery".to_string(),
            deliveries: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        empty_delivery_route,
        SystemServiceError::Invariant(_)
    ));
    let blocked_with_delivery = service
        .route_team_message(&RouteTeamMessage {
            id: None,
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "blocked".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Blocked route with a delivery".to_string(),
            metadata: None,
            idempotency_key: "team-route-blocked-delivery".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: None,
                target_participant_id: agent.id.clone(),
                role: "speaker".to_string(),
                trigger: "direct".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap_err();
    assert!(matches!(
        blocked_with_delivery,
        SystemServiceError::Invariant(_)
    ));
    let duplicate_delivery = service
        .route_team_message(&RouteTeamMessage {
            id: None,
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Duplicate participant role".to_string(),
            metadata: None,
            idempotency_key: "team-route-duplicate-delivery".to_string(),
            deliveries: vec![
                RouteTeamDelivery {
                    id: Some("team_delivery_duplicate_one".to_string()),
                    target_participant_id: agent.id.clone(),
                    role: "speaker".to_string(),
                    trigger: "direct".to_string(),
                    budget_grant_id: None,
                },
                RouteTeamDelivery {
                    id: Some("team_delivery_duplicate_two".to_string()),
                    target_participant_id: agent.id.clone(),
                    role: "observer".to_string(),
                    trigger: "mention".to_string(),
                    budget_grant_id: None,
                },
            ],
        })
        .unwrap_err();
    assert!(matches!(
        duplicate_delivery,
        SystemServiceError::Invariant(_)
    ));

    let routed = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_one".to_string()),
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Explicit participant target".to_string(),
            metadata: Some(json!({ "policy": "test" })),
            idempotency_key: "team-route-key".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: Some("team_delivery_one".to_string()),
                target_participant_id: agent.id.clone(),
                role: "speaker".to_string(),
                trigger: "mention".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap();
    assert!(routed.created);
    assert_eq!(routed.message.state, "routed");
    assert_eq!(routed.message.revision, 2);
    let round = routed
        .round
        .as_ref()
        .expect("deliver route must create a discussion round");
    assert_eq!(round.id, "tround_team_route_one");
    assert_eq!(round.state, "open");
    assert_eq!(round.expected_delivery_count, 1);
    assert_eq!(
        routed.message.discussion_round_id.as_deref(),
        Some(round.id.as_str())
    );
    assert_eq!(routed.deliveries.len(), 1);
    assert_eq!(routed.deliveries[0].state, "queued");
    assert_eq!(routed.deliveries[0].discussion_round_id, round.id);
    assert_eq!(routed.deliveries[0].target_session_id, agent_session.id);
    assert_eq!(routed.dispatch_jobs.len(), 1);
    assert_eq!(routed.dispatch_jobs[0].kind, "team.delivery");
    assert_eq!(routed.dispatch_jobs[0].state, "ready");
    assert_eq!(
        routed.dispatch_jobs[0].payload["teamDiscussionRoundId"],
        round.id
    );
    let admission_replay_after_route = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_message_one".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: Some("message".to_string()),
            targets: vec![TeamTarget {
                kind: "participant".to_string(),
                participant_id: Some(agent.id.clone()),
            }],
            content: json!([
                { "type": "text", "id": "part_team_1", "text": "Please review this plan." }
            ]),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: "team-message-key".to_string(),
        })
        .unwrap();
    assert_eq!(admission_replay_after_route, routed.message);
    assert_eq!(
        service.get_team_discussion_round(&round.id).unwrap(),
        Some(round.clone())
    );
    assert_eq!(
        service
            .list_team_discussion_rounds(&ListTeamDiscussionRounds {
                conversation_id: conversation.id.clone(),
                state: Some("open".to_string()),
                after_created_at: None,
                after_round_id: None,
                limit: Some(10),
            })
            .unwrap(),
        vec![round.clone()]
    );

    let replay = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_one".to_string()),
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Explicit participant target".to_string(),
            metadata: Some(json!({ "policy": "test" })),
            idempotency_key: "team-route-key".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: Some("team_delivery_one".to_string()),
                target_participant_id: agent.id.clone(),
                role: "speaker".to_string(),
                trigger: "mention".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap();
    assert!(!replay.created);
    assert_eq!(replay.decision.id, routed.decision.id);
    assert_eq!(replay.round, routed.round);
    assert_eq!(replay.deliveries[0].id, routed.deliveries[0].id);
    let changed_replay = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_one".to_string()),
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Changed replay payload".to_string(),
            metadata: Some(json!({ "policy": "test" })),
            idempotency_key: "team-route-key".to_string(),
            deliveries: vec![RouteTeamDelivery {
                id: Some("team_delivery_one".to_string()),
                target_participant_id: agent.id.clone(),
                role: "speaker".to_string(),
                trigger: "mention".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap_err();
    assert!(matches!(changed_replay, SystemServiceError::Invariant(_)));

    let decisions = service
        .list_team_routing_decisions(&ListTeamRoutingDecisions {
            conversation_id: Some(conversation.id.clone()),
            message_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(decisions.len(), 1);
    let deliveries = service
        .list_team_deliveries(&ListTeamDeliveries {
            conversation_id: Some(conversation.id.clone()),
            message_id: Some(first_message.id.clone()),
            routing_decision_id: Some(routed.decision.id.clone()),
            state: Some("queued".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(deliveries.len(), 1);
    assert!(service
        .list_team_discussion_rounds(&ListTeamDiscussionRounds {
            conversation_id: conversation.id.clone(),
            state: None,
            after_created_at: Some(round.created_at),
            after_round_id: None,
            limit: Some(10),
        })
        .is_err());

    let blocked_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_message_blocked".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{
                "type": "text",
                "id": "part_team_blocked",
                "text": "This message should be blocked."
            }]),
            metadata: None,
            idempotency_key: "team-message-blocked".to_string(),
        })
        .unwrap();
    let blocked = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_blocked".to_string()),
            message_id: blocked_message.id,
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "blocked".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "No eligible participant".to_string(),
            metadata: None,
            idempotency_key: "team-route-blocked".to_string(),
            deliveries: vec![],
        })
        .unwrap();
    assert!(blocked.round.is_none());
    assert!(blocked.deliveries.is_empty());
    assert!(blocked.dispatch_jobs.is_empty());
    assert!(blocked.message.discussion_round_id.is_none());
    let blocked_replay = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_blocked".to_string()),
            message_id: blocked.message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "blocked".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "No eligible participant".to_string(),
            metadata: None,
            idempotency_key: "team-route-blocked".to_string(),
            deliveries: vec![],
        })
        .unwrap();
    assert!(!blocked_replay.created);
    assert!(blocked_replay.round.is_none());

    let second_agent_session = service
        .create_session(Some("ses_team_agent_two"), None, Some("agent"))
        .unwrap();
    let second_agent = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_part_agent_two".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "agent_2".to_string(),
            kind: "agent".to_string(),
            display_name: Some("Agent Two".to_string()),
            role: Some("reviewer".to_string()),
            agent_session_id: Some(second_agent_session.id),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let rollback_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_message_rollback".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![TeamTarget {
                kind: "all".to_string(),
                participant_id: None,
            }],
            content: json!([{
                "type": "text",
                "id": "part_team_rollback",
                "text": "This route must remain atomic."
            }]),
            metadata: None,
            idempotency_key: "team-message-rollback".to_string(),
        })
        .unwrap();
    service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_rollback".to_string()),
            message_id: rollback_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Force a second delivery insert failure".to_string(),
            metadata: None,
            idempotency_key: "team-route-rollback".to_string(),
            deliveries: vec![
                RouteTeamDelivery {
                    id: Some("team_delivery_rollback_first".to_string()),
                    target_participant_id: agent.id.clone(),
                    role: "speaker".to_string(),
                    trigger: "direct".to_string(),
                    budget_grant_id: None,
                },
                RouteTeamDelivery {
                    id: Some("team_delivery_one".to_string()),
                    target_participant_id: second_agent.id,
                    role: "observer".to_string(),
                    trigger: "direct".to_string(),
                    budget_grant_id: None,
                },
            ],
        })
        .unwrap_err();
    let after_failed_route = service
        .get_team_message(&rollback_message.id)
        .unwrap()
        .expect("failed route must retain the admitted message");
    assert_eq!(after_failed_route.state, "admitted");
    assert_eq!(after_failed_route.revision, 1);
    assert!(service
        .get_team_routing_decision_by_message(&rollback_message.id)
        .unwrap()
        .is_none());
    assert!(service
        .list_team_deliveries(&ListTeamDeliveries {
            conversation_id: None,
            message_id: Some(rollback_message.id.clone()),
            routing_decision_id: None,
            state: None,
            limit: Some(10),
        })
        .unwrap()
        .is_empty());
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    let rollback_round_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM team_discussion_round WHERE source_message_id = ?",
            rusqlite::params![rollback_message.id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(rollback_round_count, 0);
    let team_events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap();
    assert!(team_events.iter().any(|event| {
        event.event_type == "team.message.admitted"
            && event.payload["messageId"] == first_message.id
    }));
    assert!(team_events.iter().any(|event| {
        event.event_type == "team.message.routed" && event.payload["messageId"] == first_message.id
    }));
    assert!(!team_events.iter().any(|event| {
        event.event_type == "team.message.routed"
            && event.payload["messageId"] == rollback_message.id
    }));

    let conflicting_route = service
        .route_team_message(&RouteTeamMessage {
            id: Some("team_route_conflict".to_string()),
            message_id: first_message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "blocked".to_string(),
            actor_principal_id: "team_owner".to_string(),
            reason: "Conflicting route".to_string(),
            metadata: None,
            idempotency_key: "team-route-conflict".to_string(),
            deliveries: vec![],
        })
        .unwrap_err();
    assert!(matches!(
        conflicting_route,
        SystemServiceError::Invariant(_)
    ));

    service
        .update_team_participant_state(&UpdateTeamParticipantState {
            participant_id: agent.id.clone(),
            state: "muted".to_string(),
        })
        .unwrap();
    let muted_author = service
        .admit_team_message(&AdmitTeamMessage {
            id: None,
            conversation_id: conversation.id.clone(),
            author_participant_id: agent.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{ "type": "text", "id": "part_team_muted", "text": "Muted." }]),
            metadata: None,
            idempotency_key: "team-message-muted".to_string(),
        })
        .unwrap_err();
    assert!(matches!(muted_author, SystemServiceError::Invariant(_)));

    let closed = service
        .update_team_conversation_state(&UpdateTeamConversationState {
            conversation_id: conversation.id.clone(),
            state: "closed".to_string(),
        })
        .unwrap();
    assert!(closed.closed_at.is_some());
    let closed_message = service
        .admit_team_message(&AdmitTeamMessage {
            id: None,
            conversation_id: conversation.id,
            author_participant_id: user.id,
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{ "type": "text", "id": "part_team_closed", "text": "Nope." }]),
            metadata: None,
            idempotency_key: "team-message-closed".to_string(),
        })
        .unwrap_err();
    assert!(matches!(closed_message, SystemServiceError::Invariant(_)));
}

#[test]
fn rejects_a_second_open_peer_round_in_the_route_transaction() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_single_peer_round".to_string()),
            principal_id: "peer_owner".to_string(),
            title: None,
            mode: Some("peer".to_string()),
            metadata: None,
            idempotency_key: Some("team-single-peer-round".to_string()),
        })
        .unwrap();
    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_single_peer_user".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "peer_user".to_string(),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let session = service
        .create_session(Some("ses_single_peer_agent"), None, Some("agent"))
        .unwrap();
    let agent = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_single_peer_agent".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "peer_agent".to_string(),
            kind: "agent".to_string(),
            display_name: None,
            role: None,
            agent_session_id: Some(session.id),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let admit = |id: &str| {
        service
            .admit_team_message(&AdmitTeamMessage {
                id: Some(id.to_string()),
                conversation_id: conversation.id.clone(),
                author_participant_id: user.id.clone(),
                parent_message_id: None,
                kind: None,
                targets: vec![TeamTarget {
                    kind: "participant".to_string(),
                    participant_id: Some(agent.id.clone()),
                }],
                content: json!([{ "type": "text", "id": format!("part_{id}"), "text": id }]),
                metadata: None,
                idempotency_key: format!("admit-{id}"),
            })
            .unwrap()
    };
    let first = admit("peer_message_first");
    let second = admit("peer_message_second");
    let route = |message_id: &str, key: &str| RouteTeamMessage {
        id: Some(format!("route_{key}")),
        message_id: message_id.to_string(),
        expected_revision: 1,
        expected_lead_participant_id: None,
        mode: "peer".to_string(),
        outcome: "deliver".to_string(),
        actor_principal_id: "peer_user".to_string(),
        reason: "Finite peer round".to_string(),
        metadata: None,
        idempotency_key: key.to_string(),
        deliveries: vec![RouteTeamDelivery {
            id: Some(format!("delivery_{key}")),
            target_participant_id: agent.id.clone(),
            role: "speaker".to_string(),
            trigger: "round".to_string(),
            budget_grant_id: None,
        }],
    };

    let first_route = route(&first.id, "peer-route-first");
    service.route_team_message(&first_route).unwrap();
    let error = service
        .route_team_message(&route(&second.id, "peer-route-second"))
        .unwrap_err();
    assert!(error
        .to_string()
        .contains("peer team conversation already has an open round"));
    assert!(!service.route_team_message(&first_route).unwrap().created);
}

#[test]
fn closes_a_multi_participant_round_only_after_every_opportunity_is_terminal() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixtures = create_multi_delivery_round_fixture(&service, "round_partial", 2);
    let round_id = fixtures[0].round_id.clone();

    let claimed_dispatch = service
        .claim_job(&ClaimJob {
            worker_id: "round_partial_materializer".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .unwrap();
    let first = fixtures
        .iter()
        .find(|fixture| fixture.dispatch_job_id == claimed_dispatch.id)
        .unwrap();
    let second = fixtures
        .iter()
        .find(|fixture| fixture.dispatch_job_id != claimed_dispatch.id)
        .unwrap();
    let materialized = service
        .materialize_team_delivery(&MaterializeTeamDelivery {
            delivery_id: first.delivery_id.clone(),
            dispatch_job_id: first.dispatch_job_id.clone(),
            worker_id: "round_partial_materializer".to_string(),
            lease_token: claimed_dispatch.lease_token.unwrap(),
            execution_binding: test_execution_binding("round_partial"),
            max_steps: Some(8),
            child_priority: Some(2),
        })
        .unwrap();
    settle_and_project_team_delivery_success(&service, first, &materialized, "round_partial");

    let still_open = service
        .get_team_discussion_round(&round_id)
        .unwrap()
        .unwrap();
    assert_eq!(still_open.state, "open");
    assert!(still_open.result.is_none());
    service
        .cancel_job(&wanex_system_service::CancelJob {
            job_id: second.dispatch_job_id.clone(),
            reason: "participant opportunity withdrawn".to_string(),
        })
        .unwrap()
        .unwrap();

    let closed = service
        .get_team_discussion_round(&round_id)
        .unwrap()
        .unwrap();
    assert_eq!(closed.state, "closed");
    assert_eq!(closed.outcome.as_deref(), Some("partial"));
    assert_eq!(
        closed.result,
        Some(wanex_system_service::TeamDiscussionRoundResult {
            expected: 2,
            responded: 1,
            passed: 0,
            failed: 0,
            cancelled: 1,
        })
    );
    assert!(closed.closed_at.is_some());
    let page = service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: fixtures[0].conversation_id.clone(),
            before_created_at: None,
            before_message_id: None,
            limit: Some(10),
        })
        .unwrap()
        .unwrap();
    assert_eq!(page.messages.len(), 2);
    assert_eq!(page.participants.len(), 3);
    assert_eq!(page.routing_decisions.len(), 1);
    assert_eq!(page.rounds, vec![closed.clone()]);
    assert_eq!(page.deliveries.len(), 2);
    assert!(page.next_cursor.is_none());
    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap();
    assert_eq!(
        events
            .iter()
            .filter(|event| {
                event.event_type == "team.discussion_round.closed"
                    && event.payload["discussionRoundId"] == round_id
            })
            .count(),
        1
    );
}

#[test]
fn validates_canonical_public_team_text_and_resource_content() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_content_contract".to_string()),
            principal_id: "team_content_owner".to_string(),
            title: None,
            mode: Some("peer".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let author = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_content_author".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_content_author_principal".to_string(),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();

    let admitted = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_content_valid".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: author.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([
                {
                    "type": "text",
                    "id": "team_content_text",
                    "text": "Inspect this image",
                    "visibility": "user"
                },
                {
                    "type": "resource",
                    "id": "team_content_image",
                    "resourceId": "res_team_content_image",
                    "sha256": "a".repeat(64),
                    "sizeBytes": 128,
                    "kind": "image",
                    "mediaType": "image/png"
                }
            ]),
            metadata: None,
            idempotency_key: "team-content-valid".to_string(),
        })
        .unwrap();
    assert_eq!(admitted.content.as_array().unwrap().len(), 2);

    for (id, content) in [
        (
            "team_content_provider_metadata",
            json!([{
                "type": "text",
                "id": "team_content_private_text",
                "text": "must reject provider metadata",
                "providerMetadata": { "trace": "private" }
            }]),
        ),
        (
            "team_content_malformed_resource",
            json!([{
                "type": "resource",
                "id": "team_content_bad_image",
                "resourceId": "res_team_content_bad_image",
                "sizeBytes": 128,
                "kind": "image",
                "mediaType": "image/png"
            }]),
        ),
        (
            "team_content_tool_call",
            json!([{
                "type": "tool_call",
                "id": "team_content_private_tool",
                "toolCallId": "call_private",
                "toolName": "private_tool",
                "input": {}
            }]),
        ),
    ] {
        assert!(service
            .admit_team_message(&AdmitTeamMessage {
                id: Some(id.to_string()),
                conversation_id: conversation.id.clone(),
                author_participant_id: author.id.clone(),
                parent_message_id: None,
                kind: None,
                targets: vec![],
                content,
                metadata: None,
                idempotency_key: id.to_string(),
            })
            .is_err());
    }
}

#[test]
fn reads_team_conversation_pages_with_a_same_millisecond_stable_cursor() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_page_cursor".to_string()),
            principal_id: "team_page_owner".to_string(),
            title: None,
            mode: Some("peer".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let participant = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_page_author".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "team_page_author_principal".to_string(),
            kind: "user".to_string(),
            display_name: Some("Page author".to_string()),
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    for index in 1..=3 {
        service
            .admit_team_message(&AdmitTeamMessage {
                id: Some(format!("team_page_message_{index}")),
                conversation_id: conversation.id.clone(),
                author_participant_id: participant.id.clone(),
                parent_message_id: None,
                kind: None,
                targets: vec![],
                content: json!([{
                    "type": "text",
                    "id": format!("team_page_part_{index}"),
                    "text": format!("Page message {index}")
                }]),
                metadata: None,
                idempotency_key: format!("team-page-message-{index}"),
            })
            .unwrap();
    }
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute(
        "UPDATE team_message SET created_at = 42, updated_at = 42
         WHERE conversation_id = ?",
        rusqlite::params![conversation.id],
    )
    .unwrap();

    let first = service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: conversation.id.clone(),
            before_created_at: None,
            before_message_id: None,
            limit: Some(1),
        })
        .unwrap()
        .unwrap();
    assert_eq!(first.messages[0].id, "team_page_message_3");
    assert_eq!(first.participants, vec![participant.clone()]);
    let cursor = first.next_cursor.unwrap();
    assert_eq!(cursor.created_at, 42);
    assert_eq!(cursor.message_id, "team_page_message_3");

    service
        .admit_team_message(&AdmitTeamMessage {
            id: Some("team_page_message_4".to_string()),
            conversation_id: conversation.id.clone(),
            author_participant_id: participant.id.clone(),
            parent_message_id: None,
            kind: None,
            targets: vec![],
            content: json!([{
                "type": "text",
                "id": "team_page_part_4",
                "text": "Page message 4"
            }]),
            metadata: None,
            idempotency_key: "team-page-message-4".to_string(),
        })
        .unwrap();
    conn.execute(
        "UPDATE team_message SET created_at = 43, updated_at = 43 WHERE id = ?",
        rusqlite::params!["team_page_message_4"],
    )
    .unwrap();

    let second = service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: conversation.id.clone(),
            before_created_at: Some(cursor.created_at),
            before_message_id: Some(cursor.message_id),
            limit: Some(1),
        })
        .unwrap()
        .unwrap();
    assert_eq!(second.messages[0].id, "team_page_message_2");
    let second_cursor = second.next_cursor.unwrap();
    let third = service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: conversation.id.clone(),
            before_created_at: Some(second_cursor.created_at),
            before_message_id: Some(second_cursor.message_id),
            limit: Some(1),
        })
        .unwrap()
        .unwrap();
    assert_eq!(third.messages[0].id, "team_page_message_1");
    assert!(third.next_cursor.is_none());
    assert_eq!(
        [
            second.messages[0].id.as_str(),
            third.messages[0].id.as_str()
        ],
        ["team_page_message_2", "team_page_message_1"]
    );

    let fresh = service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: conversation.id.clone(),
            before_created_at: None,
            before_message_id: None,
            limit: Some(1),
        })
        .unwrap()
        .unwrap();
    assert_eq!(fresh.messages[0].id, "team_page_message_4");
    assert!(fresh.next_cursor.is_some());
    assert!(service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: conversation.id.clone(),
            before_created_at: Some(42),
            before_message_id: None,
            limit: Some(1),
        })
        .is_err());
    assert!(service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: conversation.id,
            before_created_at: None,
            before_message_id: None,
            limit: Some(51),
        })
        .is_err());
    assert!(service
        .read_team_conversation_page(&ReadTeamConversationPage {
            conversation_id: "missing_team_page".to_string(),
            before_created_at: None,
            before_message_id: None,
            limit: Some(1),
        })
        .unwrap()
        .is_none());
}

#[test]
fn rolls_back_delivery_cancellation_when_round_closure_fails() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "round_closure_rollback");
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER fail_team_round_closure
         BEFORE UPDATE OF state ON team_discussion_round
         WHEN NEW.state = 'closed'
         BEGIN
           SELECT RAISE(ABORT, 'forced team round closure failure');
         END;",
    )
    .unwrap();

    assert!(service
        .cancel_job(&wanex_system_service::CancelJob {
            job_id: fixture.dispatch_job_id.clone(),
            reason: "exercise atomic closure".to_string(),
        })
        .is_err());
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: fixture.dispatch_job_id.clone(),
            })
            .unwrap()
            .unwrap()
            .state,
        "ready"
    );
    assert_eq!(
        service
            .get_team_delivery_materialization_context(&fixture.delivery_id)
            .unwrap()
            .unwrap()
            .delivery
            .state,
        "queued"
    );
    assert_eq!(
        service
            .get_team_discussion_round(&fixture.round_id)
            .unwrap()
            .unwrap()
            .state,
        "open"
    );

    conn.execute_batch("DROP TRIGGER fail_team_round_closure;")
        .unwrap();
    service
        .cancel_job(&wanex_system_service::CancelJob {
            job_id: fixture.dispatch_job_id,
            reason: "exercise atomic closure".to_string(),
        })
        .unwrap()
        .unwrap();
    let closed = service
        .get_team_discussion_round(&fixture.round_id)
        .unwrap()
        .unwrap();
    assert_eq!(closed.state, "closed");
    assert_eq!(closed.outcome.as_deref(), Some("cancelled"));
}

#[test]
fn materializes_team_delivery_with_exact_child_turn_and_replay_fencing() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "materialize");

    let context = service
        .get_team_delivery_materialization_context(&fixture.delivery_id)
        .unwrap()
        .expect("routed delivery must expose materialization context");
    assert_eq!(context.conversation.id, fixture.conversation_id);
    assert_eq!(context.participant.id, fixture.participant_id);
    assert_eq!(
        context.participant.agent_session_id.as_deref(),
        Some(fixture.session_id.as_str())
    );
    assert_eq!(context.message.id, fixture.message_id);
    assert_eq!(context.delivery.target_session_id, fixture.session_id);
    assert_eq!(context.dispatch_job.id, fixture.dispatch_job_id);
    assert_eq!(context.child_plan.session_id, fixture.session_id);
    assert_eq!(
        context.child_plan.input_id,
        format!("inp_team_{}", fixture.delivery_id)
    );
    assert_eq!(
        context.child_plan.turn_id,
        format!("turn_team_{}", fixture.delivery_id)
    );
    assert_eq!(
        context.child_plan.job_id,
        format!("job_team_turn_{}", fixture.delivery_id)
    );
    assert_eq!(context.child_plan.content, context.message.content);
    assert_eq!(
        context.child_plan.origin["metadata"]["teamDeliveryId"],
        fixture.delivery_id
    );

    let generic_completion = service
        .complete_job(&CompleteJob {
            job_id: fixture.dispatch_job_id.clone(),
            worker_id: "team_materializer".to_string(),
            lease_token: "not_claimed".to_string(),
            result: None,
        })
        .unwrap_err();
    assert!(matches!(
        generic_completion,
        SystemServiceError::InvalidJobRequest(_)
    ));

    let claimed = service
        .claim_job(&ClaimJob {
            worker_id: "team_materializer".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("team delivery dispatch job must be claimable");
    let lease_token = claimed
        .lease_token
        .clone()
        .expect("claimed dispatch job must have a lease token");
    let binding = test_execution_binding("team_materialize");
    let request = MaterializeTeamDelivery {
        delivery_id: fixture.delivery_id.clone(),
        dispatch_job_id: fixture.dispatch_job_id.clone(),
        worker_id: "team_materializer".to_string(),
        lease_token: lease_token.clone(),
        execution_binding: binding.clone(),
        max_steps: Some(9),
        child_priority: Some(4),
    };

    let stale = service
        .materialize_team_delivery(&MaterializeTeamDelivery {
            lease_token: "stale_lease".to_string(),
            ..request.clone()
        })
        .unwrap_err();
    assert!(matches!(stale, SystemServiceError::Invariant(_)));
    assert!(service
        .list_session_inputs(&fixture.session_id)
        .unwrap()
        .is_empty());
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: fixture.session_id.clone(),
            state: None,
        })
        .unwrap()
        .is_empty());

    let materialized = service.materialize_team_delivery(&request).unwrap();
    assert!(materialized.created);
    assert_eq!(materialized.delivery.state, "dispatched");
    assert_eq!(materialized.dispatch_job.state, "succeeded");
    assert_eq!(materialized.submission.turn.session_id, fixture.session_id);
    assert_eq!(materialized.submission.turn.max_steps, 9);
    assert_eq!(materialized.submission.turn.execution_binding, binding);
    assert_eq!(materialized.submission.job.kind, "session.turn");
    assert_eq!(materialized.submission.job.priority, 4);
    assert_eq!(
        materialized.delivery.child_input_id.as_deref(),
        Some(format!("inp_team_{}", fixture.delivery_id).as_str())
    );
    assert_eq!(
        materialized.delivery.child_turn_id.as_deref(),
        Some(format!("turn_team_{}", fixture.delivery_id).as_str())
    );
    assert_eq!(
        materialized.delivery.child_turn_job_id.as_deref(),
        Some(format!("job_team_turn_{}", fixture.delivery_id).as_str())
    );

    let replay = service.materialize_team_delivery(&request).unwrap();
    assert!(!replay.created);
    assert_eq!(replay.delivery, materialized.delivery);
    assert_eq!(replay.submission.turn.id, materialized.submission.turn.id);
    assert_eq!(replay.submission.job.id, materialized.submission.job.id);

    let changed_binding = service
        .materialize_team_delivery(&MaterializeTeamDelivery {
            execution_binding: test_execution_binding("team_materialize_changed"),
            ..request
        })
        .unwrap_err();
    assert!(matches!(changed_binding, SystemServiceError::Invariant(_)));
}

#[test]
fn rejects_team_delivery_materialization_after_participant_binding_changes() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "stale_participant");
    let claimed = service
        .claim_job(&ClaimJob {
            worker_id: "team_stale_participant_worker".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("stale participant delivery must be claimable");
    service
        .update_team_participant_state(&UpdateTeamParticipantState {
            participant_id: fixture.participant_id.clone(),
            state: "muted".to_string(),
        })
        .unwrap();

    let error = service
        .materialize_team_delivery(&MaterializeTeamDelivery {
            delivery_id: fixture.delivery_id.clone(),
            dispatch_job_id: fixture.dispatch_job_id,
            worker_id: "team_stale_participant_worker".to_string(),
            lease_token: claimed.lease_token.unwrap(),
            execution_binding: test_execution_binding("team_stale_participant"),
            max_steps: None,
            child_priority: None,
        })
        .unwrap_err();
    assert!(matches!(error, SystemServiceError::Invariant(message)
        if message.contains("participant/session binding is no longer active")));
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: fixture.session_id,
            state: None,
        })
        .unwrap()
        .is_empty());
    assert_eq!(
        service
            .get_team_delivery_materialization_context(&fixture.delivery_id)
            .unwrap()
            .unwrap()
            .delivery
            .state,
        "queued"
    );
}

#[test]
fn synchronizes_team_delivery_retry_failure_and_cancellation() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let retry_fixture = create_team_delivery_fixture(&service, "retry");
    let first_claim = service
        .claim_job(&ClaimJob {
            worker_id: "team_retry_one".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("retry dispatch job must be claimable");
    let first_error = json!({ "type": "resolver", "message": "temporary" });
    let retry = service
        .fail_team_delivery_materialization(&FailTeamDeliveryMaterialization {
            delivery_id: retry_fixture.delivery_id.clone(),
            dispatch_job_id: retry_fixture.dispatch_job_id.clone(),
            worker_id: "team_retry_one".to_string(),
            lease_token: first_claim.lease_token.unwrap(),
            error: first_error.clone(),
        })
        .unwrap();
    assert_eq!(retry.dispatch_job.state, "retry_scheduled");
    assert_eq!(retry.delivery.state, "queued");
    assert_eq!(retry.delivery.last_error, Some(first_error));

    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute(
        "UPDATE scheduler_job SET not_before = 0, max_attempts = 2 WHERE id = ?",
        rusqlite::params![retry_fixture.dispatch_job_id],
    )
    .unwrap();
    let second_claim = service
        .claim_job(&ClaimJob {
            worker_id: "team_retry_two".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("retried dispatch job must be claimable");
    let terminal_error = json!({ "type": "resolver", "message": "terminal" });
    let failed_request = FailTeamDeliveryMaterialization {
        delivery_id: retry_fixture.delivery_id.clone(),
        dispatch_job_id: retry_fixture.dispatch_job_id.clone(),
        worker_id: "team_retry_two".to_string(),
        lease_token: second_claim.lease_token.unwrap(),
        error: terminal_error.clone(),
    };
    let failed = service
        .fail_team_delivery_materialization(&failed_request)
        .unwrap();
    assert_eq!(failed.dispatch_job.state, "failed");
    assert_eq!(failed.delivery.state, "failed");
    assert_eq!(failed.delivery.last_error, Some(terminal_error));
    assert!(failed.delivery.finished_at.is_some());
    assert_team_round_result(&service, &retry_fixture, "failed", 0, 0, 1, 0);
    assert_eq!(
        service
            .fail_team_delivery_materialization(&failed_request)
            .unwrap(),
        failed
    );
    assert!(service
        .fail_team_delivery_materialization(&FailTeamDeliveryMaterialization {
            error: json!({ "type": "resolver", "message": "changed" }),
            ..failed_request
        })
        .is_err());

    let cancelled_fixture = create_team_delivery_fixture(&service, "cancelled");
    let cancelled = service
        .cancel_job(&wanex_system_service::CancelJob {
            job_id: cancelled_fixture.dispatch_job_id.clone(),
            reason: "conversation closed".to_string(),
        })
        .unwrap()
        .expect("queued Team dispatch job must be cancellable");
    assert_eq!(cancelled.state, "cancelled");
    let cancelled_context = service
        .get_team_delivery_materialization_context(&cancelled_fixture.delivery_id)
        .unwrap()
        .unwrap();
    assert_eq!(cancelled_context.delivery.state, "cancelled");
    assert!(cancelled_context.delivery.finished_at.is_some());
    assert_team_round_result(&service, &cancelled_fixture, "cancelled", 0, 0, 0, 1);

    let generic_failure_fixture = create_team_delivery_fixture(&service, "generic_failure");
    conn.execute(
        "UPDATE scheduler_job SET max_attempts = 1 WHERE id = ?",
        rusqlite::params![generic_failure_fixture.dispatch_job_id],
    )
    .unwrap();
    let generic_claim = service
        .claim_job(&ClaimJob {
            worker_id: "team_generic_failure".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("generic failure dispatch job must be claimable");
    let generic_failed = service
        .fail_job(&FailJob {
            job_id: generic_failure_fixture.dispatch_job_id.clone(),
            worker_id: "team_generic_failure".to_string(),
            lease_token: generic_claim.lease_token.unwrap(),
            error: json!({ "type": "worker", "message": "terminal" }),
        })
        .unwrap()
        .unwrap();
    assert_eq!(generic_failed.state, "failed");
    let generic_failure_context = service
        .get_team_delivery_materialization_context(&generic_failure_fixture.delivery_id)
        .unwrap()
        .unwrap();
    assert_eq!(generic_failure_context.delivery.state, "failed");
}

#[test]
fn rolls_back_team_delivery_materialization_without_partial_child_records() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "rollback");
    let claimed = service
        .claim_job(&ClaimJob {
            worker_id: "team_rollback".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("rollback dispatch job must be claimable");
    let lease_token = claimed.lease_token.clone().unwrap();
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER force_team_materialization_rollback
         BEFORE UPDATE OF state ON team_delivery
         WHEN NEW.state = 'dispatched'
         BEGIN
           SELECT RAISE(ABORT, 'forced Team materialization rollback');
         END;",
    )
    .unwrap();

    service
        .materialize_team_delivery(&MaterializeTeamDelivery {
            delivery_id: fixture.delivery_id.clone(),
            dispatch_job_id: fixture.dispatch_job_id.clone(),
            worker_id: "team_rollback".to_string(),
            lease_token,
            execution_binding: test_execution_binding("team_rollback"),
            max_steps: Some(7),
            child_priority: Some(2),
        })
        .unwrap_err();

    let context = service
        .get_team_delivery_materialization_context(&fixture.delivery_id)
        .unwrap()
        .unwrap();
    assert_eq!(context.delivery.state, "queued");
    assert_eq!(context.dispatch_job.state, "running");
    assert!(context.delivery.child_input_id.is_none());
    assert!(context.delivery.child_turn_id.is_none());
    assert!(context.delivery.child_turn_job_id.is_none());
    assert!(service
        .list_session_inputs(&fixture.session_id)
        .unwrap()
        .is_empty());
    assert!(service
        .list_session_turns(&ListSessionTurns {
            session_id: fixture.session_id.clone(),
            state: None,
        })
        .unwrap()
        .is_empty());
    assert!(service
        .get_job(&wanex_system_service::GetJob {
            job_id: format!("job_team_turn_{}", fixture.delivery_id),
        })
        .unwrap()
        .is_none());
    assert!(!service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap()
        .iter()
        .any(|event| {
            event.event_type == "team.delivery.materialized"
                && event.payload["deliveryId"] == fixture.delivery_id
        }));
}

#[test]
fn projects_successful_team_child_turn_into_one_canonical_reply() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "outcome_success");
    let materialized = materialize_team_delivery_fixture(&service, &fixture, "outcome_success");
    assert!(matches!(
        service
            .complete_job(&CompleteJob {
                job_id: materialized.submission.job.id.clone(),
                worker_id: "invalid_generic_child_completion".to_string(),
                lease_token: "not_claimed".to_string(),
                result: None,
            })
            .unwrap_err(),
        SystemServiceError::InvalidJobRequest(_)
    ));
    assert!(matches!(
        service
            .cancel_job(&wanex_system_service::CancelJob {
                job_id: materialized.submission.job.id.clone(),
                reason: "invalid generic child cancellation".to_string(),
            })
            .unwrap_err(),
        SystemServiceError::InvalidJobRequest(_)
    ));
    let child_job = claim_session_turn_job(&service, "team_child_success", 60_000)
        .expect("Team child session turn must be claimable");
    assert_eq!(child_job.id, materialized.submission.job.id);
    let started = start_test_turn(
        &service,
        &materialized.submission,
        &child_job,
        "team_child_success",
    );
    let invocation = begin_test_provider_invocation(
        &service,
        &materialized.submission,
        &started,
        &child_job,
        "team_child_success",
    );
    let settlement_request = SettleSessionTurn {
        session_id: fixture.session_id.clone(),
        turn_id: materialized.submission.turn.id.clone(),
        attempt_id: started.attempt.id,
        input_id: materialized.submission.admission.input_id.clone(),
        job_id: child_job.id.clone(),
        worker_id: "team_child_success".to_string(),
        lease_token: child_job.lease_token.clone().unwrap(),
        outcome: "succeeded".to_string(),
        provider_invocation_id: Some(invocation.id),
        assistant_message: Some(json!([
            {
                "type": "reasoning",
                "id": "part_team_outcome_private_reasoning",
                "text": "Private analysis",
                "visibility": "internal"
            },
            {
                "type": "text",
                "id": "part_team_outcome_success",
                "text": "The plan is sound.",
                "visibility": "assistant",
                "providerMetadata": { "trace": "must not become public" }
            }
        ])),
        provider_state: None,
        result: Some(json!({ "steps": 1 })),
        error: None,
        reason: None,
    };
    let settled = service.settle_session_turn(&settlement_request).unwrap();
    assert_eq!(settled.turn.state, "succeeded");
    let before_projection = service
        .get_team_delivery_materialization_context(&fixture.delivery_id)
        .unwrap()
        .unwrap();
    assert_eq!(before_projection.delivery.state, "dispatched");
    let outcome_job_id = before_projection
        .delivery
        .outcome_job_id
        .clone()
        .expect("terminal child turn must atomically enqueue an outcome job");
    let outcome_job = service
        .get_job(&wanex_system_service::GetJob {
            job_id: outcome_job_id.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(outcome_job.kind, "team.delivery.outcome");
    assert_eq!(outcome_job.state, "ready");
    assert_eq!(outcome_job.payload["childTurnId"], settled.turn.id);
    let generic_completion = service
        .complete_job(&CompleteJob {
            job_id: outcome_job_id.clone(),
            worker_id: "team_outcome_projector".to_string(),
            lease_token: "not_claimed".to_string(),
            result: None,
        })
        .unwrap_err();
    assert!(matches!(
        generic_completion,
        SystemServiceError::InvalidJobRequest(_)
    ));

    service
        .update_team_participant_state(&UpdateTeamParticipantState {
            participant_id: fixture.participant_id.clone(),
            state: "muted".to_string(),
        })
        .unwrap();
    service
        .update_team_conversation_state(&UpdateTeamConversationState {
            conversation_id: fixture.conversation_id.clone(),
            state: "closed".to_string(),
        })
        .unwrap();
    let claimed = service
        .claim_job(&ClaimJob {
            worker_id: "team_outcome_projector".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .expect("Team outcome job must be claimable");
    assert_eq!(claimed.id, outcome_job_id);
    let request = ProjectTeamDeliveryOutcome {
        delivery_id: fixture.delivery_id.clone(),
        outcome_job_id: claimed.id.clone(),
        worker_id: "team_outcome_projector".to_string(),
        lease_token: claimed.lease_token.clone().unwrap(),
    };
    assert!(service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            outcome_job_id: "job_team_outcome_wrong_delivery".to_string(),
            ..request.clone()
        })
        .is_err());
    assert!(service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            lease_token: "stale_lease".to_string(),
            ..request.clone()
        })
        .is_err());
    let projected = service.project_team_delivery_outcome(&request).unwrap();
    assert!(projected.created);
    assert_eq!(projected.delivery.state, "responded");
    assert_eq!(projected.outcome_job.state, "succeeded");
    assert_eq!(
        projected.child_assistant_message.as_ref().unwrap().id,
        settled.assistant_message.as_ref().unwrap().id
    );
    let reply = projected
        .reply_message
        .as_ref()
        .expect("successful Team child turn must produce a reply message");
    assert_eq!(reply.state, "visible");
    assert_eq!(reply.author_participant_id, fixture.participant_id);
    assert_eq!(
        reply.parent_message_id.as_deref(),
        Some(fixture.message_id.as_str())
    );
    assert_eq!(
        reply.discussion_round_id.as_deref(),
        Some(fixture.round_id.as_str())
    );
    assert!(reply.targets.is_empty());
    assert_eq!(reply.content.as_array().unwrap().len(), 1);
    assert_eq!(reply.content[0]["text"], "The plan is sound.");
    assert_eq!(reply.content[0]["visibility"], "assistant");
    assert!(reply.content[0].get("providerMetadata").is_none());
    assert_eq!(
        projected.delivery.reply_message_id.as_deref(),
        Some(reply.id.as_str())
    );
    assert_team_round_result(&service, &fixture, "completed", 1, 0, 0, 0);

    let replay = service.project_team_delivery_outcome(&request).unwrap();
    assert!(!replay.created);
    assert_eq!(replay.delivery, projected.delivery);
    assert_eq!(replay.reply_message, projected.reply_message);
    let round_close_events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap()
        .into_iter()
        .filter(|event| {
            event.event_type == "team.discussion_round.closed"
                && event.payload["discussionRoundId"] == fixture.round_id
        })
        .count();
    assert_eq!(round_close_events, 1);
    service.settle_session_turn(&settlement_request).unwrap();
    assert_eq!(
        service
            .list_jobs(&wanex_system_service::ListJobs {
                state: None,
                kind: Some("team.delivery.outcome".to_string()),
                limit: Some(10),
            })
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn projects_team_child_failure_and_cancellation_without_fake_messages() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let failed_fixture = create_team_delivery_fixture(&service, "outcome_failed");
    let failed_materialized =
        materialize_team_delivery_fixture(&service, &failed_fixture, "outcome_failed");
    let failed_child_job = claim_session_turn_job(&service, "team_child_failed", 60_000).unwrap();
    let failed_started = start_test_turn(
        &service,
        &failed_materialized.submission,
        &failed_child_job,
        "team_child_failed",
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: failed_fixture.session_id.clone(),
            turn_id: failed_materialized.submission.turn.id.clone(),
            attempt_id: failed_started.attempt.id,
            input_id: failed_materialized.submission.admission.input_id,
            job_id: failed_child_job.id,
            worker_id: "team_child_failed".to_string(),
            lease_token: failed_child_job.lease_token.unwrap(),
            outcome: "failed".to_string(),
            provider_invocation_id: None,
            assistant_message: None,
            provider_state: None,
            result: None,
            error: Some(json!({ "type": "provider", "message": "unavailable" })),
            reason: Some("provider unavailable".to_string()),
        })
        .unwrap();
    let failed_outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: "team_outcome_failed".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let failed = service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            delivery_id: failed_fixture.delivery_id.clone(),
            outcome_job_id: failed_outcome_job.id,
            worker_id: "team_outcome_failed".to_string(),
            lease_token: failed_outcome_job.lease_token.unwrap(),
        })
        .unwrap();
    assert_eq!(failed.delivery.state, "failed");
    assert!(failed.reply_message.is_none());
    assert!(failed.delivery.reply_message_id.is_none());
    assert_team_round_result(&service, &failed_fixture, "failed", 0, 0, 1, 0);
    assert_eq!(
        service
            .list_team_messages(&ListTeamMessages {
                conversation_id: failed_fixture.conversation_id,
                state: None,
                after_created_at: None,
                after_message_id: None,
                limit: Some(10),
            })
            .unwrap()
            .len(),
        1
    );

    let cancelled_fixture = create_team_delivery_fixture(&service, "outcome_cancelled");
    let cancelled_materialized =
        materialize_team_delivery_fixture(&service, &cancelled_fixture, "outcome_cancelled");
    let cancelled = service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: cancelled_fixture.session_id.clone(),
            turn_id: cancelled_materialized.submission.turn.id.clone(),
            input_id: cancelled_materialized.submission.admission.input_id,
            job_id: cancelled_materialized.submission.job.id,
            reason: "no longer needed".to_string(),
        })
        .unwrap();
    assert_eq!(cancelled.status, "cancelled");
    let cancelled_outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: "team_outcome_cancelled".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let cancelled_projection = service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            delivery_id: cancelled_fixture.delivery_id.clone(),
            outcome_job_id: cancelled_outcome_job.id,
            worker_id: "team_outcome_cancelled".to_string(),
            lease_token: cancelled_outcome_job.lease_token.unwrap(),
        })
        .unwrap();
    assert_eq!(cancelled_projection.delivery.state, "cancelled");
    assert!(cancelled_projection.reply_message.is_none());
    assert_team_round_result(&service, &cancelled_fixture, "cancelled", 0, 0, 0, 1);

    let before_attempt_fixture =
        create_team_delivery_fixture(&service, "outcome_before_attempt_failure");
    let before_attempt_materialized = materialize_team_delivery_fixture(
        &service,
        &before_attempt_fixture,
        "outcome_before_attempt_failure",
    );
    let before_attempt_job =
        claim_session_turn_job(&service, "team_child_before_attempt", 60_000).unwrap();
    assert_eq!(
        before_attempt_job.id,
        before_attempt_materialized.submission.job.id
    );
    service
        .fail_job(&FailJob {
            job_id: before_attempt_job.id,
            worker_id: "team_child_before_attempt".to_string(),
            lease_token: before_attempt_job.lease_token.unwrap(),
            error: json!({ "type": "worker", "message": "spawn failed" }),
        })
        .unwrap()
        .unwrap();
    let before_attempt_outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: "team_outcome_before_attempt".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let before_attempt_projection = service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            delivery_id: before_attempt_fixture.delivery_id,
            outcome_job_id: before_attempt_outcome_job.id,
            worker_id: "team_outcome_before_attempt".to_string(),
            lease_token: before_attempt_outcome_job.lease_token.unwrap(),
        })
        .unwrap();
    assert_eq!(before_attempt_projection.delivery.state, "failed");
    assert!(before_attempt_projection.reply_message.is_none());
}

#[test]
fn rolls_back_team_outcome_projection_without_partial_reply() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "outcome_rollback");
    let materialized = materialize_team_delivery_fixture(&service, &fixture, "outcome_rollback");
    let child_job = claim_session_turn_job(&service, "team_child_rollback", 60_000).unwrap();
    let started = start_test_turn(
        &service,
        &materialized.submission,
        &child_job,
        "team_child_rollback",
    );
    let invocation = begin_test_provider_invocation(
        &service,
        &materialized.submission,
        &started,
        &child_job,
        "team_child_rollback",
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: fixture.session_id.clone(),
            turn_id: materialized.submission.turn.id,
            attempt_id: started.attempt.id,
            input_id: materialized.submission.admission.input_id,
            job_id: child_job.id,
            worker_id: "team_child_rollback".to_string(),
            lease_token: child_job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "part_team_outcome_rollback",
                "text": "This reply must roll back."
            }])),
            provider_state: None,
            result: Some(json!({ "steps": 1 })),
            error: None,
            reason: None,
        })
        .unwrap();
    let outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: "team_outcome_rollback".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER force_team_outcome_rollback
         BEFORE UPDATE OF state ON team_delivery
         WHEN NEW.state = 'responded'
         BEGIN
           SELECT RAISE(ABORT, 'forced Team outcome rollback');
         END;",
    )
    .unwrap();
    service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            delivery_id: fixture.delivery_id.clone(),
            outcome_job_id: outcome_job.id.clone(),
            worker_id: "team_outcome_rollback".to_string(),
            lease_token: outcome_job.lease_token.unwrap(),
        })
        .unwrap_err();

    let context = service
        .get_team_delivery_materialization_context(&fixture.delivery_id)
        .unwrap()
        .unwrap();
    assert_eq!(context.delivery.state, "dispatched");
    assert!(context.delivery.reply_message_id.is_none());
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: outcome_job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "running"
    );
    assert!(service
        .get_team_message(&format!("tmsg_team_reply_{}", fixture.delivery_id))
        .unwrap()
        .is_none());
    assert_eq!(
        service
            .list_team_messages(&ListTeamMessages {
                conversation_id: fixture.conversation_id,
                state: None,
                after_created_at: None,
                after_message_id: None,
                limit: Some(10),
            })
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn rolls_back_child_terminal_settlement_when_team_outcome_outbox_fails() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "outbox_rollback");
    let materialized = materialize_team_delivery_fixture(&service, &fixture, "outbox_rollback");
    let child_job = claim_session_turn_job(&service, "team_outbox_rollback", 60_000).unwrap();
    let started = start_test_turn(
        &service,
        &materialized.submission,
        &child_job,
        "team_outbox_rollback",
    );
    let invocation = begin_test_provider_invocation(
        &service,
        &materialized.submission,
        &started,
        &child_job,
        "team_outbox_rollback",
    );
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER force_team_outcome_outbox_rollback
         BEFORE INSERT ON scheduler_job
         WHEN NEW.kind = 'team.delivery.outcome'
         BEGIN
           SELECT RAISE(ABORT, 'forced Team outcome outbox rollback');
         END;",
    )
    .unwrap();
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: fixture.session_id.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: materialized.submission.admission.input_id,
            job_id: child_job.id.clone(),
            worker_id: "team_outbox_rollback".to_string(),
            lease_token: child_job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": "part_team_outbox_rollback",
                "text": "This settlement must roll back."
            }])),
            provider_state: None,
            result: Some(json!({ "steps": 1 })),
            error: None,
            reason: None,
        })
        .unwrap_err();

    let turn = service
        .list_session_turns(&ListSessionTurns {
            session_id: fixture.session_id.clone(),
            state: None,
        })
        .unwrap()
        .into_iter()
        .find(|turn| turn.id == materialized.submission.turn.id)
        .unwrap();
    assert_eq!(turn.state, "running");
    assert!(turn.finished_at.is_none());
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: child_job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "running"
    );
    assert!(service
        .list_session_messages(&fixture.session_id)
        .unwrap()
        .iter()
        .all(|message| message.role != "assistant"));
    let delivery = service
        .get_team_delivery_materialization_context(&fixture.delivery_id)
        .unwrap()
        .unwrap()
        .delivery;
    assert_eq!(delivery.state, "dispatched");
    assert!(delivery.outcome_job_id.is_none());
    assert!(service
        .list_jobs(&wanex_system_service::ListJobs {
            state: None,
            kind: Some("team.delivery.outcome".to_string()),
            limit: Some(10),
        })
        .unwrap()
        .is_empty());
}

#[test]
fn synchronizes_terminal_team_outcome_worker_failure_and_cancellation() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let failed_fixture = create_team_delivery_fixture(&service, "outcome_worker_failed");
    let failed_materialized =
        materialize_team_delivery_fixture(&service, &failed_fixture, "outcome_worker_failed");
    service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: failed_fixture.session_id.clone(),
            turn_id: failed_materialized.submission.turn.id,
            input_id: failed_materialized.submission.admission.input_id,
            job_id: failed_materialized.submission.job.id,
            reason: "create terminal child outcome".to_string(),
        })
        .unwrap();
    let failed_outcome_job_id = service
        .get_team_delivery_materialization_context(&failed_fixture.delivery_id)
        .unwrap()
        .unwrap()
        .delivery
        .outcome_job_id
        .unwrap();
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute(
        "UPDATE scheduler_job SET max_attempts = 1 WHERE id = ?",
        rusqlite::params![failed_outcome_job_id],
    )
    .unwrap();
    let failed_claim = service
        .claim_job(&ClaimJob {
            worker_id: "team_outcome_worker_failed".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let failed_job = service
        .fail_job(&FailJob {
            job_id: failed_claim.id,
            worker_id: "team_outcome_worker_failed".to_string(),
            lease_token: failed_claim.lease_token.unwrap(),
            error: json!({ "type": "projection", "message": "terminal failure" }),
        })
        .unwrap()
        .unwrap();
    assert_eq!(failed_job.state, "failed");
    assert_eq!(
        service
            .get_team_delivery_materialization_context(&failed_fixture.delivery_id)
            .unwrap()
            .unwrap()
            .delivery
            .state,
        "failed"
    );

    let cancelled_fixture = create_team_delivery_fixture(&service, "outcome_worker_cancelled");
    let cancelled_materialized =
        materialize_team_delivery_fixture(&service, &cancelled_fixture, "outcome_worker_cancelled");
    service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: cancelled_fixture.session_id.clone(),
            turn_id: cancelled_materialized.submission.turn.id,
            input_id: cancelled_materialized.submission.admission.input_id,
            job_id: cancelled_materialized.submission.job.id,
            reason: "create cancellable outcome job".to_string(),
        })
        .unwrap();
    let cancelled_outcome_job_id = service
        .get_team_delivery_materialization_context(&cancelled_fixture.delivery_id)
        .unwrap()
        .unwrap()
        .delivery
        .outcome_job_id
        .unwrap();
    service
        .cancel_job(&wanex_system_service::CancelJob {
            job_id: cancelled_outcome_job_id,
            reason: "operator cancelled projection".to_string(),
        })
        .unwrap()
        .unwrap();
    let cancelled_delivery = service
        .get_team_delivery_materialization_context(&cancelled_fixture.delivery_id)
        .unwrap()
        .unwrap()
        .delivery;
    assert_eq!(cancelled_delivery.state, "cancelled");
    assert_eq!(
        cancelled_delivery.last_error.unwrap()["type"],
        "outcome_projection_cancelled"
    );
}

#[test]
fn projects_exact_bound_team_pass_without_creating_a_reply() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "explicit_pass");
    let materialized =
        materialize_team_delivery_fixture_with_pass(&service, &fixture, "explicit_pass");
    let executions = settle_team_child_with_pass_tools(
        &service,
        &fixture,
        &materialized,
        "explicit_pass",
        1,
        false,
    );
    let pass_execution = &executions[0];
    let outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: "team_pass_projector".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let request = ProjectTeamDeliveryOutcome {
        delivery_id: fixture.delivery_id.clone(),
        outcome_job_id: outcome_job.id,
        worker_id: "team_pass_projector".to_string(),
        lease_token: outcome_job.lease_token.unwrap(),
    };
    let projected = service.project_team_delivery_outcome(&request).unwrap();
    assert_eq!(projected.delivery.state, "passed");
    assert_team_round_result(&service, &fixture, "completed", 0, 1, 0, 0);
    assert_eq!(
        projected
            .delivery
            .participation_tool_execution_id
            .as_deref(),
        Some(pass_execution.id.as_str())
    );
    assert!(projected.delivery.reply_message_id.is_none());
    assert!(projected.reply_message.is_none());
    assert_eq!(
        projected.child_assistant_message.as_ref().unwrap().content[0]["text"],
        "Pass recorded."
    );
    assert_eq!(
        projected.outcome_job.result.as_ref().unwrap()["participationToolExecutionId"],
        pass_execution.id
    );
    assert_eq!(
        service
            .list_team_messages(&ListTeamMessages {
                conversation_id: fixture.conversation_id,
                state: None,
                after_created_at: None,
                after_message_id: None,
                limit: Some(10),
            })
            .unwrap()
            .len(),
        1
    );
    let replay = service.project_team_delivery_outcome(&request).unwrap();
    assert!(!replay.created);
    assert_eq!(replay.delivery, projected.delivery);
    assert!(replay.reply_message.is_none());
}

#[test]
fn rejects_forged_or_duplicate_team_pass_evidence() {
    for (suffix, pass_count, forge_first_result, expected_message) in [
        ("forged_pass", 1, true, "result does not match"),
        ("duplicate_pass", 2, false, "multiple successful pass"),
    ] {
        let dir = tempdir().unwrap();
        let service = SystemService::open(dir.path()).unwrap();
        let fixture = create_team_delivery_fixture(&service, suffix);
        let materialized = materialize_team_delivery_fixture_with_pass(&service, &fixture, suffix);
        settle_team_child_with_pass_tools(
            &service,
            &fixture,
            &materialized,
            suffix,
            pass_count,
            forge_first_result,
        );
        let outcome_job = service
            .claim_job(&ClaimJob {
                worker_id: format!("team_{suffix}_projector"),
                lease_ms: 60_000,
                kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
            })
            .unwrap()
            .unwrap();
        let error = service
            .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
                delivery_id: fixture.delivery_id.clone(),
                outcome_job_id: outcome_job.id.clone(),
                worker_id: format!("team_{suffix}_projector"),
                lease_token: outcome_job.lease_token.unwrap(),
            })
            .unwrap_err();
        assert!(error.to_string().contains(expected_message));
        let context = service
            .get_team_delivery_materialization_context(&fixture.delivery_id)
            .unwrap()
            .unwrap();
        assert_eq!(context.delivery.state, "dispatched");
        assert!(context.delivery.participation_tool_execution_id.is_none());
        assert_eq!(
            service
                .get_job(&wanex_system_service::GetJob {
                    job_id: outcome_job.id,
                })
                .unwrap()
                .unwrap()
                .state,
            "running"
        );
    }
}

#[test]
fn rolls_back_team_pass_projection_without_partial_terminal_state() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = create_team_delivery_fixture(&service, "pass_rollback");
    let materialized =
        materialize_team_delivery_fixture_with_pass(&service, &fixture, "pass_rollback");
    settle_team_child_with_pass_tools(&service, &fixture, &materialized, "pass_rollback", 1, false);
    let outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: "team_pass_rollback_projector".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute_batch(
        "CREATE TRIGGER force_team_pass_projection_rollback
         BEFORE UPDATE OF state ON team_delivery
         WHEN NEW.state = 'passed'
         BEGIN
           SELECT RAISE(ABORT, 'forced Team pass projection rollback');
         END;",
    )
    .unwrap();
    service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            delivery_id: fixture.delivery_id.clone(),
            outcome_job_id: outcome_job.id.clone(),
            worker_id: "team_pass_rollback_projector".to_string(),
            lease_token: outcome_job.lease_token.unwrap(),
        })
        .unwrap_err();
    let context = service
        .get_team_delivery_materialization_context(&fixture.delivery_id)
        .unwrap()
        .unwrap();
    assert_eq!(context.delivery.state, "dispatched");
    assert!(context.delivery.participation_tool_execution_id.is_none());
    assert!(context.delivery.reply_message_id.is_none());
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: outcome_job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "running"
    );
}

struct TeamDeliveryTestFixture {
    conversation_id: String,
    participant_id: String,
    participant_principal_id: String,
    session_id: String,
    message_id: String,
    delivery_id: String,
    dispatch_job_id: String,
    round_id: String,
}

fn create_team_delivery_fixture(service: &SystemService, suffix: &str) -> TeamDeliveryTestFixture {
    let conversation_id = format!("team_materialization_{suffix}");
    let user_id = format!("team_materialization_user_{suffix}");
    let participant_id = format!("team_materialization_agent_{suffix}");
    let participant_principal_id = format!("team_agent_principal_{suffix}");
    let session_id = format!("ses_team_materialization_{suffix}");
    let message_id = format!("team_materialization_message_{suffix}");
    let delivery_id = format!("team_delivery_{suffix}");
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some(conversation_id.clone()),
            principal_id: format!("team_owner_{suffix}"),
            title: None,
            mode: Some("hybrid".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some(user_id),
            conversation_id: conversation.id.clone(),
            principal_id: format!("team_user_principal_{suffix}"),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    service
        .create_session(Some(&session_id), None, Some("agent"))
        .unwrap();
    let agent = service
        .put_team_participant(&PutTeamParticipant {
            id: Some(participant_id.clone()),
            conversation_id: conversation.id.clone(),
            principal_id: participant_principal_id.clone(),
            kind: "agent".to_string(),
            display_name: None,
            role: None,
            agent_session_id: Some(session_id.clone()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some(message_id.clone()),
            conversation_id: conversation.id,
            author_participant_id: user.id,
            parent_message_id: None,
            kind: Some("message".to_string()),
            targets: vec![TeamTarget {
                kind: "participant".to_string(),
                participant_id: Some(agent.id.clone()),
            }],
            content: json!([{
                "type": "text",
                "id": format!("part_team_materialization_{suffix}"),
                "text": format!("Materialize delivery {suffix}")
            }]),
            metadata: None,
            idempotency_key: format!("team-materialization-message-{suffix}"),
        })
        .unwrap();
    let routed = service
        .route_team_message(&RouteTeamMessage {
            id: Some(format!("team_materialization_route_{suffix}")),
            message_id: message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "hybrid".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: format!("team_owner_{suffix}"),
            reason: "Materialization test".to_string(),
            metadata: None,
            idempotency_key: format!("team-materialization-route-{suffix}"),
            deliveries: vec![RouteTeamDelivery {
                id: Some(delivery_id.clone()),
                target_participant_id: agent.id,
                role: "speaker".to_string(),
                trigger: "direct".to_string(),
                budget_grant_id: None,
            }],
        })
        .unwrap();
    TeamDeliveryTestFixture {
        conversation_id,
        participant_id,
        participant_principal_id,
        session_id,
        message_id,
        delivery_id,
        dispatch_job_id: routed.dispatch_jobs[0].id.clone(),
        round_id: routed.round.unwrap().id,
    }
}

fn create_multi_delivery_round_fixture(
    service: &SystemService,
    suffix: &str,
    participant_count: usize,
) -> Vec<TeamDeliveryTestFixture> {
    let conversation_id = format!("team_multi_{suffix}");
    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some(conversation_id.clone()),
            principal_id: format!("team_multi_owner_{suffix}"),
            title: None,
            mode: Some("peer".to_string()),
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let user = service
        .put_team_participant(&PutTeamParticipant {
            id: Some(format!("team_multi_user_{suffix}")),
            conversation_id: conversation.id.clone(),
            principal_id: format!("team_multi_user_principal_{suffix}"),
            kind: "user".to_string(),
            display_name: None,
            role: None,
            agent_session_id: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap();
    let mut agents = Vec::new();
    for index in 0..participant_count {
        let session_id = format!("ses_team_multi_{suffix}_{index}");
        service
            .create_session(Some(&session_id), None, Some("agent"))
            .unwrap();
        let participant_id = format!("team_multi_agent_{suffix}_{index}");
        let principal_id = format!("team_multi_agent_principal_{suffix}_{index}");
        let participant = service
            .put_team_participant(&PutTeamParticipant {
                id: Some(participant_id),
                conversation_id: conversation.id.clone(),
                principal_id: principal_id.clone(),
                kind: "agent".to_string(),
                display_name: None,
                role: None,
                agent_session_id: Some(session_id.clone()),
                metadata: None,
                idempotency_key: None,
            })
            .unwrap();
        agents.push((participant, principal_id, session_id));
    }
    let message = service
        .admit_team_message(&AdmitTeamMessage {
            id: Some(format!("team_multi_message_{suffix}")),
            conversation_id: conversation.id.clone(),
            author_participant_id: user.id,
            parent_message_id: None,
            kind: None,
            targets: vec![TeamTarget {
                kind: "all".to_string(),
                participant_id: None,
            }],
            content: json!([{
                "type": "text",
                "id": format!("part_team_multi_{suffix}"),
                "text": "Give every selected participant one opportunity."
            }]),
            metadata: None,
            idempotency_key: format!("team-multi-message-{suffix}"),
        })
        .unwrap();
    let routed = service
        .route_team_message(&RouteTeamMessage {
            id: Some(format!("team_multi_route_{suffix}")),
            message_id: message.id.clone(),
            expected_revision: 1,
            expected_lead_participant_id: None,
            mode: "peer".to_string(),
            outcome: "deliver".to_string(),
            actor_principal_id: format!("team_multi_owner_{suffix}"),
            reason: "Finite peer fan-out".to_string(),
            metadata: None,
            idempotency_key: format!("team-multi-route-{suffix}"),
            deliveries: agents
                .iter()
                .enumerate()
                .map(|(index, (participant, _, _))| RouteTeamDelivery {
                    id: Some(format!("team_multi_delivery_{suffix}_{index}")),
                    target_participant_id: participant.id.clone(),
                    role: "speaker".to_string(),
                    trigger: "round".to_string(),
                    budget_grant_id: None,
                })
                .collect(),
        })
        .unwrap();
    let round_id = routed.round.unwrap().id;
    routed
        .deliveries
        .into_iter()
        .map(|delivery| {
            let (_, principal_id, session_id) = agents
                .iter()
                .find(|(participant, _, _)| participant.id == delivery.target_participant_id)
                .unwrap();
            TeamDeliveryTestFixture {
                conversation_id: conversation_id.clone(),
                participant_id: delivery.target_participant_id,
                participant_principal_id: principal_id.clone(),
                session_id: session_id.clone(),
                message_id: message.id.clone(),
                delivery_id: delivery.id,
                dispatch_job_id: delivery.dispatch_job_id,
                round_id: round_id.clone(),
            }
        })
        .collect()
}

fn materialize_team_delivery_fixture(
    service: &SystemService,
    fixture: &TeamDeliveryTestFixture,
    suffix: &str,
) -> wanex_system_service::MaterializeTeamDeliveryReceipt {
    materialize_team_delivery_fixture_with_binding(
        service,
        fixture,
        suffix,
        test_execution_binding(suffix),
    )
}

fn materialize_team_delivery_fixture_with_pass(
    service: &SystemService,
    fixture: &TeamDeliveryTestFixture,
    suffix: &str,
) -> wanex_system_service::MaterializeTeamDeliveryReceipt {
    let mut binding = test_execution_binding(suffix);
    binding["toolSnapshot"] = json!({
        "tools": [{
            "descriptor": team_pass_tool_descriptor(&fixture.delivery_id),
            "runtimeBinding": team_pass_runtime_binding(&fixture.delivery_id)
        }]
    });
    refresh_execution_binding_digest(&mut binding);
    materialize_team_delivery_fixture_with_binding(service, fixture, suffix, binding)
}

fn materialize_team_delivery_fixture_with_binding(
    service: &SystemService,
    fixture: &TeamDeliveryTestFixture,
    suffix: &str,
    execution_binding: serde_json::Value,
) -> wanex_system_service::MaterializeTeamDeliveryReceipt {
    let worker_id = format!("team_materializer_{suffix}");
    let claimed = service
        .claim_job(&ClaimJob {
            worker_id: worker_id.clone(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDelivery]),
        })
        .unwrap()
        .expect("Team delivery materialization job must be claimable");
    assert_eq!(claimed.id, fixture.dispatch_job_id);
    service
        .materialize_team_delivery(&MaterializeTeamDelivery {
            delivery_id: fixture.delivery_id.clone(),
            dispatch_job_id: fixture.dispatch_job_id.clone(),
            worker_id,
            lease_token: claimed.lease_token.unwrap(),
            execution_binding,
            max_steps: Some(8),
            child_priority: Some(2),
        })
        .unwrap()
}

fn settle_and_project_team_delivery_success(
    service: &SystemService,
    fixture: &TeamDeliveryTestFixture,
    materialized: &wanex_system_service::MaterializeTeamDeliveryReceipt,
    suffix: &str,
) {
    let child_worker = format!("team_round_child_{suffix}");
    let child_job = claim_session_turn_job(service, &child_worker, 60_000).unwrap();
    let started = start_test_turn(service, &materialized.submission, &child_job, &child_worker);
    let invocation = begin_test_provider_invocation(
        service,
        &materialized.submission,
        &started,
        &child_job,
        &child_worker,
    );
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: fixture.session_id.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: child_job.id,
            worker_id: child_worker,
            lease_token: child_job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(invocation.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": format!("part_team_round_reply_{suffix}"),
                "text": "Participant response."
            }])),
            provider_state: None,
            result: Some(json!({ "steps": 1 })),
            error: None,
            reason: None,
        })
        .unwrap();
    let outcome_worker = format!("team_round_outcome_{suffix}");
    let outcome_job = service
        .claim_job(&ClaimJob {
            worker_id: outcome_worker.clone(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::TeamDeliveryOutcome]),
        })
        .unwrap()
        .unwrap();
    service
        .project_team_delivery_outcome(&ProjectTeamDeliveryOutcome {
            delivery_id: fixture.delivery_id.clone(),
            outcome_job_id: outcome_job.id,
            worker_id: outcome_worker,
            lease_token: outcome_job.lease_token.unwrap(),
        })
        .unwrap();
}

fn assert_team_round_result(
    service: &SystemService,
    fixture: &TeamDeliveryTestFixture,
    outcome: &str,
    responded: i64,
    passed: i64,
    failed: i64,
    cancelled: i64,
) {
    let round = service
        .get_team_discussion_round(&fixture.round_id)
        .unwrap()
        .unwrap();
    assert_eq!(round.state, "closed");
    assert_eq!(round.outcome.as_deref(), Some(outcome));
    assert_eq!(
        round.result,
        Some(wanex_system_service::TeamDiscussionRoundResult {
            expected: responded + passed + failed + cancelled,
            responded,
            passed,
            failed,
            cancelled,
        })
    );
}

fn team_pass_tool_descriptor(delivery_id: &str) -> serde_json::Value {
    json!({
        "name": "team_pass",
        "description": "Decline this Team delivery when no useful reply should be added.",
        "inputSchema": {
            "type": "object",
            "additionalProperties": false,
            "required": ["deliveryId"],
            "properties": {
                "deliveryId": { "type": "string", "const": delivery_id },
                "reason": { "type": "string", "minLength": 1, "maxLength": 1024 }
            }
        },
        "risk": "read_only",
        "idempotent": true,
        "concurrency": "parallel_safe",
        "resultMode": "immediate",
        "annotations": {
            "readOnlyHint": true,
            "idempotentHint": true,
            "openWorldHint": false
        }
    })
}

fn team_pass_runtime_binding(delivery_id: &str) -> serde_json::Value {
    json!({
        "implementationId": "wanex.team.tool.pass",
        "implementationRevision": "1",
        "configurationDigest": sha256_json(&json!({ "deliveryId": delivery_id }))
    })
}

fn team_pass_execution_descriptor(delivery_id: &str) -> serde_json::Value {
    let mut descriptor = team_pass_tool_descriptor(delivery_id);
    descriptor["runtimeBinding"] = team_pass_runtime_binding(delivery_id);
    descriptor
}

fn settle_team_child_with_pass_tools(
    service: &SystemService,
    fixture: &TeamDeliveryTestFixture,
    materialized: &wanex_system_service::MaterializeTeamDeliveryReceipt,
    suffix: &str,
    pass_count: usize,
    forge_first_result: bool,
) -> Vec<wanex_system_service::ToolExecutionRecord> {
    let worker_id = format!("team_pass_worker_{suffix}");
    let child_job = claim_session_turn_job(service, &worker_id, 60_000).unwrap();
    let started = start_test_turn(service, &materialized.submission, &child_job, &worker_id);
    let first_provider = begin_test_provider_invocation(
        service,
        &materialized.submission,
        &started,
        &child_job,
        &worker_id,
    );
    let calls = (0..pass_count)
        .map(|index| {
            json!({
                "type": "tool_call",
                "id": format!("part_team_pass_{suffix}_{index}"),
                "toolCallId": format!("call_team_pass_{suffix}_{index}"),
                "toolName": "team_pass",
                "input": {
                    "deliveryId": fixture.delivery_id,
                    "reason": format!("No contribution {index}")
                }
            })
        })
        .collect::<Vec<_>>();
    let source = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: fixture.session_id.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: child_job.id.clone(),
            worker_id: worker_id.clone(),
            lease_token: child_job.lease_token.clone().unwrap(),
            invocation_id: first_provider.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(serde_json::Value::Array(calls)),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let mut executions = Vec::new();
    for index in 0..pass_count {
        let tool_call_id = format!("call_team_pass_{suffix}_{index}");
        let input = json!({
            "deliveryId": fixture.delivery_id,
            "reason": format!("No contribution {index}")
        });
        let begun = service
            .begin_tool_execution(&BeginToolExecution {
                session_id: fixture.session_id.clone(),
                turn_id: materialized.submission.turn.id.clone(),
                attempt_id: started.attempt.id.clone(),
                input_id: materialized.submission.admission.input_id.clone(),
                source_message_id: source.id.clone(),
                job_id: child_job.id.clone(),
                worker_id: worker_id.clone(),
                lease_token: child_job.lease_token.clone().unwrap(),
                principal_id: fixture.participant_principal_id.clone(),
                tool_call_id,
                tool_name: "team_pass".to_string(),
                input: input.clone(),
                descriptor: team_pass_execution_descriptor(&fixture.delivery_id),
                permission: json!({ "status": "allow", "reason": "Team pass test" }),
                activity: None,
                state: "running".to_string(),
                idempotency_key: format!("team-pass:{suffix}:{index}"),
            })
            .unwrap();
        let attempt = begun.invocation_attempt.unwrap();
        let result = if forge_first_result && index == 0 {
            json!({
                "kind": "team.pass",
                "deliveryId": "team_delivery_forged",
                "reason": format!("No contribution {index}")
            })
        } else {
            json!({
                "kind": "team.pass",
                "deliveryId": fixture.delivery_id,
                "reason": format!("No contribution {index}")
            })
        };
        let (content, content_digest) = tool_json_content(result);
        let execution = service
            .finish_tool_execution(&wanex_system_service::FinishToolExecution {
                session_id: fixture.session_id.clone(),
                turn_id: materialized.submission.turn.id.clone(),
                session_attempt_id: started.attempt.id.clone(),
                input_id: materialized.submission.admission.input_id.clone(),
                job_id: child_job.id.clone(),
                worker_id: worker_id.clone(),
                lease_token: child_job.lease_token.clone().unwrap(),
                execution_id: begun.execution.id,
                invocation_attempt_id: attempt.id,
                state: "succeeded".to_string(),
                content: Some(content),
                content_digest: Some(content_digest),
                is_error: Some(false),
                result_presentation: None,
                error: None,
            })
            .unwrap()
            .unwrap();
        executions.push(execution);
    }
    let final_provider = service
        .begin_provider_invocation(&BeginProviderInvocation {
            id: None,
            session_id: fixture.session_id.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: child_job.id.clone(),
            worker_id: worker_id.clone(),
            lease_token: child_job.lease_token.clone().unwrap(),
            step: 2,
            invocation_number: 1,
            request_digest: sha256_json(&json!({ "step": 2, "suffix": suffix })),
        })
        .unwrap();
    service
        .settle_session_turn(&SettleSessionTurn {
            session_id: fixture.session_id.clone(),
            turn_id: materialized.submission.turn.id.clone(),
            attempt_id: started.attempt.id,
            input_id: materialized.submission.admission.input_id.clone(),
            job_id: child_job.id,
            worker_id,
            lease_token: child_job.lease_token.unwrap(),
            outcome: "succeeded".to_string(),
            provider_invocation_id: Some(final_provider.id),
            assistant_message: Some(json!([{
                "type": "text",
                "id": format!("part_team_pass_final_{suffix}"),
                "text": "Pass recorded."
            }])),
            provider_state: None,
            result: Some(json!({ "steps": 2 })),
            error: None,
            reason: None,
        })
        .unwrap();
    executions
}

#[test]
fn registers_plugin_manifest_and_submits_action_jobs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let manifest = service
        .put_plugin_manifest(&PutPluginManifest {
            id: None,
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            name: Some("Telegram Connector".to_string()),
            entry: Some(json!({ "kind": "process", "command": "telegram-connector" })),
            capabilities: vec![
                "channel.connect".to_string(),
                "channel.receive".to_string(),
                "channel.deliver".to_string(),
                "resource.write".to_string(),
                "team.conversation.write".to_string(),
            ],
            metadata: Some(json!({ "connector": true })),
            idempotency_key: Some("plugin-telegram-key".to_string()),
        })
        .unwrap();
    let duplicate = service
        .put_plugin_manifest(&PutPluginManifest {
            id: Some("ignored_plugin_manifest".to_string()),
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            name: Some("Telegram Connector".to_string()),
            entry: Some(json!({ "kind": "process", "command": "telegram-connector" })),
            capabilities: manifest.capabilities.clone(),
            metadata: Some(json!({ "connector": true })),
            idempotency_key: Some("plugin-telegram-key".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate.id, manifest.id);
    assert_eq!(manifest.state, "registered");
    assert!(manifest
        .capabilities
        .iter()
        .any(|capability| capability == "channel.deliver"));

    let fetched = service
        .get_plugin_manifest(&GetPluginManifest {
            plugin_id: "connector.telegram".to_string(),
            version: None,
        })
        .unwrap()
        .expect("plugin manifest should exist");
    assert_eq!(fetched.id, manifest.id);

    let deliver_plugins = service
        .list_plugin_manifests(&ListPluginManifests {
            state: Some("registered".to_string()),
            capability: Some("channel.deliver".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(deliver_plugins.len(), 1);
    assert_eq!(deliver_plugins[0].plugin_id, "connector.telegram");

    let layout = json!({
        "kind": "wanex.plugin.package.layout.v1",
        "pluginId": "connector.telegram",
        "version": "1.0.0"
    });
    let trust = json!({
        "kind": "wanex.plugin.package.trust.v1",
        "pluginId": "connector.telegram",
        "version": "1.0.0",
        "source": { "kind": "local" },
        "install": { "rootDir": "/plugins/connector.telegram/1.0.0" },
        "decision": { "status": "allow" }
    });
    let install = service
        .put_plugin_install(&PutPluginInstall {
            id: None,
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            layout: layout.clone(),
            trust: trust.clone(),
            install_root_dir: "/plugins/connector.telegram/1.0.0".to_string(),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: Some("plugin-install-telegram-key".to_string()),
        })
        .unwrap();
    assert_eq!(install.plugin_id, "connector.telegram");
    assert_eq!(install.version, "1.0.0");
    assert_eq!(install.state, "installed");
    assert_eq!(install.layout, layout);
    assert_eq!(install.trust, trust);

    let duplicate_install = service
        .put_plugin_install(&PutPluginInstall {
            id: Some("ignored_plugin_install".to_string()),
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            layout: layout.clone(),
            trust: trust.clone(),
            install_root_dir: "/plugins/connector.telegram/1.0.0".to_string(),
            metadata: Some(json!({ "source": "system-test" })),
            idempotency_key: Some("plugin-install-telegram-key".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_install.id, install.id);

    let fetched_install = service
        .get_plugin_install(&GetPluginInstall {
            plugin_id: "connector.telegram".to_string(),
            version: Some("1.0.0".to_string()),
        })
        .unwrap()
        .expect("plugin install should exist");
    assert_eq!(fetched_install.id, install.id);

    let installs = service
        .list_plugin_installs(&ListPluginInstalls {
            plugin_id: Some("connector.telegram".to_string()),
            state: Some("installed".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(installs.len(), 1);
    assert_eq!(installs[0].id, install.id);

    let unchanged_install = service
        .update_plugin_install_state(&UpdatePluginInstallState {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            expected_state: "installed".to_string(),
            state: "installed".to_string(),
        })
        .unwrap();
    assert_eq!(unchanged_install.updated_at, install.updated_at);

    let stale_install_update = service.update_plugin_install_state(&UpdatePluginInstallState {
        plugin_id: "connector.telegram".to_string(),
        version: "1.0.0".to_string(),
        expected_state: "disabled".to_string(),
        state: "removed".to_string(),
    });
    assert!(matches!(
        stale_install_update,
        Err(SystemServiceError::Invariant(message))
            if message.contains("state conflict")
    ));

    let disabled_install = service
        .update_plugin_install_state(&UpdatePluginInstallState {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            expected_state: "installed".to_string(),
            state: "disabled".to_string(),
        })
        .unwrap();
    assert_eq!(disabled_install.id, install.id);
    assert_eq!(disabled_install.state, "disabled");
    assert!(disabled_install.disabled_at.is_some());
    assert!(disabled_install.removed_at.is_none());

    let removed_install = service
        .update_plugin_install_state(&UpdatePluginInstallState {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            expected_state: "disabled".to_string(),
            state: "removed".to_string(),
        })
        .unwrap();
    assert_eq!(removed_install.id, install.id);
    assert_eq!(removed_install.state, "removed");
    assert!(removed_install.disabled_at.is_none());
    assert!(removed_install.removed_at.is_some());

    let restored_install = service
        .update_plugin_install_state(&UpdatePluginInstallState {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            expected_state: "removed".to_string(),
            state: "installed".to_string(),
        })
        .unwrap();
    assert_eq!(restored_install.id, install.id);
    assert_eq!(restored_install.state, "installed");
    assert!(restored_install.disabled_at.is_none());
    assert!(restored_install.removed_at.is_none());

    let conflicting_install = service.put_plugin_install(&PutPluginInstall {
        id: None,
        plugin_id: "connector.telegram".to_string(),
        version: "1.0.0".to_string(),
        layout: json!({ "changed": true }),
        trust: trust.clone(),
        install_root_dir: "/plugins/connector.telegram/1.0.0".to_string(),
        metadata: Some(json!({ "source": "system-test" })),
        idempotency_key: None,
    });
    assert!(matches!(
        conflicting_install,
        Err(SystemServiceError::Invariant(_))
    ));

    let submission = service
        .submit_plugin_action(&SubmitPluginAction {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            action_id: "deliver-message".to_string(),
            principal_id: "principal_channel".to_string(),
            payload: json!({ "chatId": "123", "text": "hello" }),
            required_capability: Some("channel.deliver".to_string()),
            job_id: Some("job_plugin_telegram_deliver".to_string()),
            job_idempotency_key: Some("plugin-telegram-deliver-job".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: Some(3),
            max_attempts: Some(2),
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert_eq!(submission.manifest.id, manifest.id);
    assert_eq!(submission.job.id, "job_plugin_telegram_deliver");
    assert_eq!(submission.job.kind, "plugin.action");
    assert_eq!(submission.job.payload["pluginId"], "connector.telegram");
    assert_eq!(submission.job.payload["actionId"], "deliver-message");
    assert_eq!(
        submission.job.payload["requiredCapability"],
        "channel.deliver"
    );
    assert_eq!(submission.job.payload["payload"]["text"], "hello");

    let missing_capability = service
        .submit_plugin_action(&SubmitPluginAction {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            action_id: "fetch-url".to_string(),
            principal_id: "principal_channel".to_string(),
            payload: json!({ "url": "https://example.com" }),
            required_capability: Some("network.fetch".to_string()),
            job_id: None,
            job_idempotency_key: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap_err();
    assert!(matches!(
        missing_capability,
        SystemServiceError::Invariant(_)
    ));

    let disabled = service
        .update_plugin_manifest_state(&UpdatePluginManifestState {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            state: "disabled".to_string(),
        })
        .unwrap();
    assert_eq!(disabled.state, "disabled");
    assert!(disabled.disabled_at.is_some());

    let disabled_submission = service
        .submit_plugin_action(&SubmitPluginAction {
            plugin_id: "connector.telegram".to_string(),
            version: "1.0.0".to_string(),
            action_id: "deliver-message".to_string(),
            principal_id: "principal_channel".to_string(),
            payload: json!({}),
            required_capability: Some("channel.deliver".to_string()),
            job_id: None,
            job_idempotency_key: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap_err();
    assert!(matches!(
        disabled_submission,
        SystemServiceError::Invariant(_)
    ));
}

#[test]
fn activates_plugin_install_atomically_and_idempotently() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let request = ActivatePluginInstall {
        manifest: PutPluginManifest {
            id: None,
            plugin_id: "plugin.atomic".to_string(),
            version: "1.0.0".to_string(),
            name: Some("Atomic Plugin".to_string()),
            entry: Some(json!({ "kind": "process", "command": "bin/plugin" })),
            capabilities: vec!["resource.read".to_string()],
            metadata: Some(json!({ "source": "atomic-test" })),
            idempotency_key: Some("plugin-atomic-manifest".to_string()),
        },
        install: PutPluginInstall {
            id: None,
            plugin_id: "plugin.atomic".to_string(),
            version: "1.0.0".to_string(),
            layout: json!({ "kind": "wanex.plugin.package.layout.v1" }),
            trust: json!({ "decision": { "status": "allow" } }),
            install_root_dir: "/plugins/plugin.atomic/1.0.0/artifact".to_string(),
            metadata: Some(json!({ "source": "atomic-test" })),
            idempotency_key: Some("plugin-atomic-install".to_string()),
        },
    };

    let activated = service.activate_plugin_install(&request).unwrap();
    assert_eq!(activated.manifest.plugin_id, "plugin.atomic");
    assert_eq!(activated.install.plugin_id, "plugin.atomic");

    let repeated = service.activate_plugin_install(&request).unwrap();
    assert_eq!(repeated.manifest.id, activated.manifest.id);
    assert_eq!(repeated.install.id, activated.install.id);

    let mut version_two = request.clone();
    version_two.manifest.version = "2.0.0".to_string();
    version_two.manifest.idempotency_key = Some("plugin-atomic-manifest-v2".to_string());
    version_two.install.version = "2.0.0".to_string();
    version_two.install.layout = json!({
        "kind": "wanex.plugin.package.layout.v1",
        "pluginId": "plugin.atomic",
        "version": "2.0.0"
    });
    version_two.install.trust = json!({
        "kind": "wanex.plugin.package.trust.v1",
        "pluginId": "plugin.atomic",
        "version": "2.0.0",
        "source": { "kind": "local" },
        "install": { "rootDir": "/plugins/plugin.atomic/2.0.0/artifact" },
        "decision": { "status": "allow" }
    });
    version_two.install.install_root_dir = "/plugins/plugin.atomic/2.0.0/artifact".to_string();
    version_two.install.idempotency_key = Some("plugin-atomic-install-v2".to_string());
    let activated_two = service.activate_plugin_install(&version_two).unwrap();
    assert_eq!(activated_two.install.state, "installed");
    assert_eq!(
        service
            .get_plugin_install(&GetPluginInstall {
                plugin_id: "plugin.atomic".to_string(),
                version: Some("1.0.0".to_string()),
            })
            .unwrap()
            .unwrap()
            .state,
        "disabled"
    );

    let stale_replay = service.activate_plugin_install(&request).unwrap();
    assert_eq!(stale_replay.install.state, "disabled");
    assert_eq!(
        service
            .list_plugin_installs(&ListPluginInstalls {
                plugin_id: Some("plugin.atomic".to_string()),
                state: Some("installed".to_string()),
                limit: Some(10),
            })
            .unwrap()
            .iter()
            .map(|install| install.version.as_str())
            .collect::<Vec<_>>(),
        vec!["2.0.0"]
    );

    let restored_one = service
        .update_plugin_install_state(&UpdatePluginInstallState {
            plugin_id: "plugin.atomic".to_string(),
            version: "1.0.0".to_string(),
            expected_state: "disabled".to_string(),
            state: "installed".to_string(),
        })
        .unwrap();
    assert_eq!(restored_one.state, "installed");
    assert_eq!(
        service
            .get_plugin_install(&GetPluginInstall {
                plugin_id: "plugin.atomic".to_string(),
                version: Some("2.0.0".to_string()),
            })
            .unwrap()
            .unwrap()
            .state,
        "disabled"
    );

    let conflicting = service.activate_plugin_install(&ActivatePluginInstall {
        manifest: PutPluginManifest {
            id: None,
            plugin_id: "plugin.rollback".to_string(),
            version: "1.0.0".to_string(),
            name: Some("Rollback Plugin".to_string()),
            entry: Some(json!({ "kind": "process", "command": "bin/plugin" })),
            capabilities: vec!["resource.read".to_string()],
            metadata: None,
            idempotency_key: Some("plugin-rollback-manifest".to_string()),
        },
        install: PutPluginInstall {
            id: None,
            plugin_id: "plugin.rollback".to_string(),
            version: "1.0.0".to_string(),
            layout: json!({ "kind": "wanex.plugin.package.layout.v1" }),
            trust: json!({ "decision": { "status": "allow" } }),
            install_root_dir: "/plugins/plugin.rollback/1.0.0/artifact".to_string(),
            metadata: None,
            idempotency_key: Some("plugin-atomic-install".to_string()),
        },
    });
    assert!(matches!(conflicting, Err(SystemServiceError::Invariant(_))));
    assert!(service
        .get_plugin_manifest(&GetPluginManifest {
            plugin_id: "plugin.rollback".to_string(),
            version: Some("1.0.0".to_string()),
        })
        .unwrap()
        .is_none());
}

#[test]
fn serializes_concurrent_plugin_version_activation() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    for version in ["1.0.0", "2.0.0"] {
        service
            .put_plugin_manifest(&PutPluginManifest {
                id: None,
                plugin_id: "plugin.concurrent".to_string(),
                version: version.to_string(),
                name: None,
                entry: None,
                capabilities: vec!["resource.read".to_string()],
                metadata: None,
                idempotency_key: Some(format!("plugin-concurrent-manifest-{version}")),
            })
            .unwrap();
    }

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
    let mut workers = Vec::new();
    for version in ["1.0.0", "2.0.0"] {
        let store_dir = dir.path().to_path_buf();
        let barrier = barrier.clone();
        workers.push(std::thread::spawn(move || {
            let service = SystemService::open(store_dir).unwrap();
            let install_root = format!("/plugins/plugin.concurrent/{version}");
            barrier.wait();
            service
                .put_plugin_install(&PutPluginInstall {
                    id: None,
                    plugin_id: "plugin.concurrent".to_string(),
                    version: version.to_string(),
                    layout: json!({
                        "kind": "wanex.plugin.package.layout.v1",
                        "pluginId": "plugin.concurrent",
                        "version": version
                    }),
                    trust: json!({
                        "kind": "wanex.plugin.package.trust.v1",
                        "pluginId": "plugin.concurrent",
                        "version": version,
                        "source": { "kind": "local" },
                        "install": { "rootDir": install_root },
                        "decision": { "status": "allow" }
                    }),
                    install_root_dir: install_root,
                    metadata: None,
                    idempotency_key: Some(format!("plugin-concurrent-install-{version}")),
                })
                .unwrap()
        }));
    }
    for worker in workers {
        worker.join().unwrap();
    }

    let active = service
        .list_plugin_installs(&ListPluginInstalls {
            plugin_id: Some("plugin.concurrent".to_string()),
            state: Some("installed".to_string()),
            limit: Some(10),
        })
        .unwrap();
    let all = service
        .list_plugin_installs(&ListPluginInstalls {
            plugin_id: Some("plugin.concurrent".to_string()),
            state: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(active.len(), 1);
    assert_eq!(all.len(), 2);
    assert_eq!(
        all.iter()
            .filter(|install| install.state == "disabled")
            .count(),
        1
    );
}

#[test]
fn records_channel_bindings_inbound_events_and_delivery_jobs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    register_test_connector(
        &service,
        "connector.telegram",
        &["channel.connect", "channel.receive", "channel.deliver"],
    );

    let binding = service
        .put_channel_binding(&PutChannelBinding {
            id: Some("bind_telegram_user_1".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_identity_id: "tg_user_1".to_string(),
            principal_id: "principal_user_1".to_string(),
            display_name: Some("Ada".to_string()),
            metadata: Some(json!({ "locale": "en" })),
            idempotency_key: Some("telegram-user-1-binding".to_string()),
        })
        .unwrap();
    assert_eq!(binding.state, "active");
    assert_eq!(binding.principal_id, "principal_user_1");

    let duplicate_binding = service
        .put_channel_binding(&PutChannelBinding {
            id: Some("ignored_binding_id".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_identity_id: "tg_user_1".to_string(),
            principal_id: "principal_user_1".to_string(),
            display_name: Some("Ada".to_string()),
            metadata: Some(json!({ "locale": "en" })),
            idempotency_key: Some("telegram-user-1-binding".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_binding.id, binding.id);

    let bindings = service
        .list_channel_bindings(&ListChannelBindings {
            connector_id: Some("connector.telegram".to_string()),
            channel_kind: Some("telegram".to_string()),
            channel_id: Some("bot-main".to_string()),
            principal_id: Some("principal_user_1".to_string()),
            external_identity_id: None,
            state: Some("active".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(bindings.len(), 1);
    assert_eq!(bindings[0].id, binding.id);

    let inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("chin_telegram_evt_1".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "telegram-update-1".to_string(),
            external_thread_id: Some("telegram-chat-1".to_string()),
            sender_external_identity_id: "tg_user_1".to_string(),
            principal_id: None,
            payload: json!({ "message": { "text": "hello" } }),
            metadata: Some(json!({ "transport": "polling" })),
            received_at: Some(10),
            idempotency_key: Some("telegram-update-1".to_string()),
        })
        .unwrap();
    assert_eq!(inbound.state, "received");
    assert_eq!(inbound.principal_id.as_deref(), Some("principal_user_1"));

    let duplicate_inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("ignored_inbound_id".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "telegram-update-1".to_string(),
            external_thread_id: Some("telegram-chat-1".to_string()),
            sender_external_identity_id: "tg_user_1".to_string(),
            principal_id: None,
            payload: json!({ "message": { "text": "hello" } }),
            metadata: None,
            received_at: Some(10),
            idempotency_key: Some("telegram-update-1".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_inbound.id, inbound.id);

    let inbound_events = service
        .list_channel_inbound_events(&ListChannelInboundEvents {
            connector_id: Some("connector.telegram".to_string()),
            channel_kind: Some("telegram".to_string()),
            channel_id: Some("bot-main".to_string()),
            state: Some("received".to_string()),
            after_received_at: Some(0),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(inbound_events.len(), 1);
    assert_eq!(inbound_events[0].id, inbound.id);

    let projected = service
        .update_channel_inbound_event_state(&UpdateChannelInboundEventState {
            event_id: inbound.id.clone(),
            state: "projected".to_string(),
            metadata: Some(json!({ "projectedTo": "session.input" })),
        })
        .unwrap();
    assert_eq!(projected.state, "projected");
    assert_eq!(projected.metadata.unwrap()["projectedTo"], "session.input");

    let submission = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: Some("chdel_telegram_1".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_user_1".to_string()),
            external_thread_id: Some("telegram-chat-1".to_string()),
            principal_id: "principal_user_1".to_string(),
            payload: json!({ "text": "hi back" }),
            metadata: Some(json!({ "replyTo": "telegram-update-1" })),
            job_id: Some("job_channel_delivery_telegram_1".to_string()),
            idempotency_key: Some("telegram-delivery-1".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: Some(5),
            max_attempts: Some(3),
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert_eq!(submission.delivery.id, "chdel_telegram_1");
    assert_eq!(submission.delivery.state, "pending");
    assert_eq!(
        submission.delivery.scheduler_job_id.as_deref(),
        Some("job_channel_delivery_telegram_1")
    );
    assert_eq!(submission.job.kind, "channel.delivery");
    assert_eq!(submission.job.payload["deliveryId"], "chdel_telegram_1");
    assert_eq!(submission.job.payload["payload"]["text"], "hi back");

    let duplicate_submission = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: Some("ignored_delivery_id".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_user_1".to_string()),
            external_thread_id: Some("telegram-chat-1".to_string()),
            principal_id: "principal_user_1".to_string(),
            payload: json!({ "text": "hi back" }),
            metadata: None,
            job_id: Some("ignored_job_id".to_string()),
            idempotency_key: Some("telegram-delivery-1".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: Some(5),
            max_attempts: Some(3),
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert_eq!(duplicate_submission.delivery.id, submission.delivery.id);
    assert_eq!(duplicate_submission.job.id, submission.job.id);

    let revoked = service
        .revoke_channel_binding(&wanex_system_service::RevokeChannelBinding {
            binding_id: binding.id,
        })
        .unwrap();
    assert_eq!(revoked.state, "revoked");
    assert!(revoked.revoked_at.is_some());

    let invalid = service
        .put_channel_binding(&PutChannelBinding {
            id: None,
            connector_id: "".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_identity_id: "tg_user_2".to_string(),
            principal_id: "principal_user_2".to_string(),
            display_name: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap_err();
    assert!(matches!(invalid, SystemServiceError::Invariant(_)));
}

#[test]
fn enforces_connector_capabilities_for_channel_transport_operations() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let missing_registration = service
        .put_channel_binding(&PutChannelBinding {
            id: None,
            connector_id: "connector.missing".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_identity_id: "tg_missing".to_string(),
            principal_id: "principal_missing".to_string(),
            display_name: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap_err();
    assert!(matches!(
        missing_registration,
        SystemServiceError::Invariant(_)
    ));

    register_test_connector(&service, "connector.receive_only", &["channel.receive"]);
    let missing_connect = service
        .put_channel_binding(&PutChannelBinding {
            id: None,
            connector_id: "connector.receive_only".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_identity_id: "tg_receive_only".to_string(),
            principal_id: "principal_receive_only".to_string(),
            display_name: None,
            metadata: None,
            idempotency_key: None,
        })
        .unwrap_err();
    assert!(matches!(missing_connect, SystemServiceError::Invariant(_)));

    let inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("chin_receive_only".to_string()),
            connector_id: "connector.receive_only".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "receive-only-event".to_string(),
            external_thread_id: None,
            sender_external_identity_id: "tg_receive_only".to_string(),
            principal_id: Some("principal_receive_only".to_string()),
            payload: json!({ "message": { "text": "allowed" } }),
            metadata: None,
            received_at: None,
            idempotency_key: Some("receive-only-event".to_string()),
        })
        .unwrap();
    assert_eq!(inbound.state, "received");

    let missing_deliver = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: None,
            connector_id: "connector.receive_only".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_receive_only".to_string()),
            external_thread_id: None,
            principal_id: "principal_receive_only".to_string(),
            payload: json!({ "text": "blocked" }),
            metadata: None,
            job_id: None,
            idempotency_key: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap_err();
    assert!(matches!(missing_deliver, SystemServiceError::Invariant(_)));

    let disabled_connector = service
        .update_connector_registration_state(&UpdateConnectorRegistrationState {
            connector_id: "connector.receive_only".to_string(),
            state: "disabled".to_string(),
        })
        .unwrap();
    assert_eq!(disabled_connector.state, "disabled");
    let disabled_ingest = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: None,
            connector_id: "connector.receive_only".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "receive-only-disabled".to_string(),
            external_thread_id: None,
            sender_external_identity_id: "tg_receive_only".to_string(),
            principal_id: Some("principal_receive_only".to_string()),
            payload: json!({}),
            metadata: None,
            received_at: None,
            idempotency_key: None,
        })
        .unwrap_err();
    assert!(matches!(disabled_ingest, SystemServiceError::Invariant(_)));

    register_test_connector(&service, "connector.disabled_plugin", &["channel.deliver"]);
    service
        .update_plugin_manifest_state(&UpdatePluginManifestState {
            plugin_id: "plugin.connector.disabled_plugin".to_string(),
            version: "1.0.0".to_string(),
            state: "disabled".to_string(),
        })
        .unwrap();
    let disabled_plugin_delivery = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: None,
            connector_id: "connector.disabled_plugin".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_disabled_plugin".to_string()),
            external_thread_id: None,
            principal_id: "principal_disabled_plugin".to_string(),
            payload: json!({ "text": "blocked" }),
            metadata: None,
            job_id: None,
            idempotency_key: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap_err();
    assert!(matches!(
        disabled_plugin_delivery,
        SystemServiceError::Invariant(_)
    ));
}

#[test]
fn manages_connector_credentials_and_session_lifecycle() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    register_test_connector(
        &service,
        "connector.session_test",
        &["channel.connect", "channel.receive", "channel.deliver"],
    );

    let credential = service
        .put_connector_credential(&PutConnectorCredential {
            id: Some("conncred_session_test".to_string()),
            connector_id: "connector.session_test".to_string(),
            kind: "bot-token".to_string(),
            secret_ref: "keychain://wanex/session-test/bot".to_string(),
            metadata: Some(json!({ "label": "session test bot" })),
            idempotency_key: Some("credential-session-test".to_string()),
        })
        .unwrap();
    assert_eq!(credential.state, "active");
    assert_eq!(credential.secret_ref, "keychain://wanex/session-test/bot");

    let duplicate_credential = service
        .put_connector_credential(&PutConnectorCredential {
            id: Some("ignored_conncred_session_test".to_string()),
            connector_id: "connector.session_test".to_string(),
            kind: "bot-token".to_string(),
            secret_ref: "keychain://wanex/session-test/bot".to_string(),
            metadata: None,
            idempotency_key: Some("credential-session-test".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_credential.id, credential.id);

    let active_credentials = service
        .list_connector_credentials(&ListConnectorCredentials {
            connector_id: Some("connector.session_test".to_string()),
            state: Some("active".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(active_credentials.len(), 1);

    let session = service
        .start_connector_session(&StartConnectorSession {
            id: Some("connses_session_test".to_string()),
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id.clone(),
            owner_id: "connector_worker_1".to_string(),
            lease_ms: 60_000,
            state: Some("connecting".to_string()),
            metadata: Some(json!({ "phase": "boot" })),
            idempotency_key: Some("session-start-test".to_string()),
        })
        .unwrap();
    assert_eq!(session.state, "connecting");
    assert_eq!(session.owner_id, "connector_worker_1");

    let duplicate_session = service
        .start_connector_session(&StartConnectorSession {
            id: Some("ignored_connses_session_test".to_string()),
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id.clone(),
            owner_id: "connector_worker_1".to_string(),
            lease_ms: 60_000,
            state: Some("connected".to_string()),
            metadata: Some(json!({ "phase": "ignored" })),
            idempotency_key: Some("session-start-test".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_session.id, session.id);
    assert_eq!(duplicate_session.state, "connecting");

    let wrong_owner = service
        .heartbeat_connector_session(&HeartbeatConnectorSession {
            session_id: session.id.clone(),
            owner_id: "connector_worker_2".to_string(),
            lease_token: session.lease_token.clone(),
            lease_ms: 60_000,
            state: Some("connected".to_string()),
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(wrong_owner, SystemServiceError::Invariant(_)));

    let connected = service
        .heartbeat_connector_session(&HeartbeatConnectorSession {
            session_id: session.id.clone(),
            owner_id: "connector_worker_1".to_string(),
            lease_token: session.lease_token.clone(),
            lease_ms: 60_000,
            state: Some("connected".to_string()),
            metadata: Some(json!({ "phase": "ready" })),
        })
        .unwrap();
    assert_eq!(connected.state, "connected");
    assert_eq!(connected.metadata.unwrap()["phase"], "ready");

    let live_conflict = service
        .start_connector_session(&StartConnectorSession {
            id: None,
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id.clone(),
            owner_id: "connector_worker_2".to_string(),
            lease_ms: 60_000,
            state: Some("connecting".to_string()),
            metadata: None,
            idempotency_key: Some("session-live-conflict".to_string()),
        })
        .unwrap_err();
    assert!(matches!(live_conflict, SystemServiceError::Invariant(_)));

    let failed = service
        .finish_connector_session(&FinishConnectorSession {
            session_id: session.id.clone(),
            owner_id: "connector_worker_1".to_string(),
            lease_token: session.lease_token.clone(),
            state: "failed".to_string(),
            metadata: Some(json!({ "attempt": 1 })),
            error: Some(json!({ "message": "transport closed" })),
        })
        .unwrap();
    assert_eq!(failed.state, "failed");
    assert_eq!(failed.last_error.unwrap()["message"], "transport closed");
    assert!(failed.finished_at.is_some());

    let replacement = service
        .start_connector_session(&StartConnectorSession {
            id: Some("connses_session_replacement".to_string()),
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id.clone(),
            owner_id: "connector_worker_2".to_string(),
            lease_ms: 60_000,
            state: Some("connected".to_string()),
            metadata: None,
            idempotency_key: Some("session-replacement-test".to_string()),
        })
        .unwrap();
    assert_eq!(replacement.state, "connected");
    let disconnected = service
        .finish_connector_session(&FinishConnectorSession {
            session_id: replacement.id.clone(),
            owner_id: "connector_worker_2".to_string(),
            lease_token: replacement.lease_token,
            state: "disconnected".to_string(),
            metadata: None,
            error: None,
        })
        .unwrap();
    assert_eq!(disconnected.state, "disconnected");

    let expiring = service
        .start_connector_session(&StartConnectorSession {
            id: Some("connses_expiring".to_string()),
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id.clone(),
            owner_id: "connector_worker_old".to_string(),
            lease_ms: 1,
            state: Some("connecting".to_string()),
            metadata: None,
            idempotency_key: Some("session-expiring-test".to_string()),
        })
        .unwrap();
    std::thread::sleep(Duration::from_millis(5));
    let expired_heartbeat = service
        .heartbeat_connector_session(&HeartbeatConnectorSession {
            session_id: expiring.id.clone(),
            owner_id: "connector_worker_old".to_string(),
            lease_token: expiring.lease_token,
            lease_ms: 60_000,
            state: Some("connected".to_string()),
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(
        expired_heartbeat,
        SystemServiceError::Invariant(_)
    ));

    let reclaimed = service
        .start_connector_session(&StartConnectorSession {
            id: Some("connses_reclaimed".to_string()),
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id.clone(),
            owner_id: "connector_worker_new".to_string(),
            lease_ms: 60_000,
            state: Some("connected".to_string()),
            metadata: None,
            idempotency_key: Some("session-reclaimed-test".to_string()),
        })
        .unwrap();
    assert_eq!(reclaimed.id, "connses_reclaimed");
    assert_eq!(reclaimed.owner_id, "connector_worker_new");

    let listed_sessions = service
        .list_connector_sessions(&ListConnectorSessions {
            connector_id: Some("connector.session_test".to_string()),
            state: None,
            owner_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert!(listed_sessions
        .iter()
        .any(|record| record.id == expiring.id && record.state == "expired"));
    assert!(listed_sessions
        .iter()
        .any(|record| record.id == reclaimed.id && record.state == "connected"));

    let revoked = service
        .revoke_connector_credential(&RevokeConnectorCredential {
            credential_id: credential.id.clone(),
        })
        .unwrap();
    assert_eq!(revoked.state, "revoked");
    assert!(revoked.revoked_at.is_some());
    let revoked_start = service
        .start_connector_session(&StartConnectorSession {
            id: None,
            connector_id: "connector.session_test".to_string(),
            credential_id: credential.id,
            owner_id: "connector_worker_after_revoke".to_string(),
            lease_ms: 60_000,
            state: Some("connecting".to_string()),
            metadata: None,
            idempotency_key: Some("session-after-revoke".to_string()),
        })
        .unwrap_err();
    assert!(matches!(revoked_start, SystemServiceError::Invariant(_)));

    let disabled = service
        .update_connector_registration_state(&UpdateConnectorRegistrationState {
            connector_id: "connector.session_test".to_string(),
            state: "disabled".to_string(),
        })
        .unwrap();
    assert_eq!(disabled.state, "disabled");
    let disabled_credential = service
        .put_connector_credential(&PutConnectorCredential {
            id: None,
            connector_id: "connector.session_test".to_string(),
            kind: "bot-token".to_string(),
            secret_ref: "keychain://wanex/session-test/disabled".to_string(),
            metadata: None,
            idempotency_key: Some("credential-disabled-test".to_string()),
        })
        .unwrap_err();
    assert!(matches!(
        disabled_credential,
        SystemServiceError::Invariant(_)
    ));

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(100),
        })
        .unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == "connector.credential.put"));
    assert!(events
        .iter()
        .any(|event| event.event_type == "connector.session.started"));
    assert!(events.iter().all(|event| !event
        .payload
        .to_string()
        .contains("keychain://wanex/session-test/bot")));
}

#[test]
fn acknowledges_channel_delivery_atomically_with_scheduler_jobs() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    register_test_connector(
        &service,
        "connector.telegram",
        &["channel.connect", "channel.receive", "channel.deliver"],
    );

    let success = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: Some("chdel_ack_success".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_user_ack".to_string()),
            external_thread_id: Some("telegram-chat-ack".to_string()),
            principal_id: "principal_ack".to_string(),
            payload: json!({ "text": "success" }),
            metadata: None,
            job_id: Some("job_channel_ack_success".to_string()),
            idempotency_key: Some("channel-ack-success".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap();
    assert_eq!(success.delivery.state, "pending");
    let claimed = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "connector_worker_success".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::ChannelDelivery]),
        })
        .unwrap()
        .expect("channel delivery job should be claimable");
    let ack = service
        .complete_channel_delivery(&CompleteChannelDelivery {
            delivery_id: success.delivery.id.clone(),
            worker_id: "connector_worker_success".to_string(),
            lease_token: claimed.lease_token.clone().unwrap(),
            result: Some(json!({ "externalMessageId": "telegram-message-1" })),
            metadata: Some(json!({ "transport": "sendMessage" })),
        })
        .unwrap()
        .expect("delivery acknowledgement should succeed");
    assert_eq!(ack.delivery.state, "sent");
    assert_eq!(ack.delivery.finished_at, ack.job.finished_at);
    assert_eq!(ack.job.state, "succeeded");
    assert_eq!(
        ack.job.result.unwrap()["externalMessageId"],
        "telegram-message-1"
    );
    let repeated = service
        .complete_channel_delivery(&CompleteChannelDelivery {
            delivery_id: success.delivery.id.clone(),
            worker_id: "connector_worker_success".to_string(),
            lease_token: claimed.lease_token.unwrap(),
            result: Some(json!({ "externalMessageId": "ignored" })),
            metadata: None,
        })
        .unwrap()
        .expect("terminal success acknowledgement is idempotent");
    assert_eq!(repeated.delivery.state, "sent");
    assert_eq!(repeated.job.state, "succeeded");
    assert_eq!(
        repeated.job.result.unwrap()["externalMessageId"],
        "telegram-message-1"
    );

    let retryable = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: Some("chdel_ack_retry".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_user_retry".to_string()),
            external_thread_id: None,
            principal_id: "principal_ack".to_string(),
            payload: json!({ "text": "retry" }),
            metadata: None,
            job_id: Some("job_channel_ack_retry".to_string()),
            idempotency_key: Some("channel-ack-retry".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: Some(2),
            retry_policy: Some(RetryPolicy {
                strategy: RetryStrategy::Fixed,
                initial_delay_ms: Some(0),
                max_delay_ms: Some(0),
            }),
            budget_grant_id: None,
        })
        .unwrap();
    let claimed_retry = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "connector_worker_retry".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::ChannelDelivery]),
        })
        .unwrap()
        .expect("retryable delivery should be claimable");
    assert_eq!(claimed_retry.id, retryable.job.id);
    let retry_ack = service
        .fail_channel_delivery(&FailChannelDelivery {
            delivery_id: retryable.delivery.id.clone(),
            worker_id: "connector_worker_retry".to_string(),
            lease_token: claimed_retry.lease_token.unwrap(),
            error: json!({ "type": "network", "message": "timeout" }),
            metadata: Some(json!({ "attempt": 1 })),
        })
        .unwrap()
        .expect("retry acknowledgement should succeed");
    assert_eq!(retry_ack.delivery.state, "pending");
    assert!(retry_ack.delivery.finished_at.is_none());
    assert_eq!(retry_ack.job.state, "retry_scheduled");

    let terminal_claim = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "connector_worker_terminal".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::ChannelDelivery]),
        })
        .unwrap()
        .expect("retry_scheduled delivery should be claimable again");
    assert_eq!(terminal_claim.id, retryable.job.id);
    let terminal_ack = service
        .fail_channel_delivery(&FailChannelDelivery {
            delivery_id: retryable.delivery.id,
            worker_id: "connector_worker_terminal".to_string(),
            lease_token: terminal_claim.lease_token.unwrap(),
            error: json!({ "type": "platform", "message": "blocked" }),
            metadata: Some(json!({ "attempt": 2 })),
        })
        .unwrap()
        .expect("terminal failure acknowledgement should succeed");
    assert_eq!(terminal_ack.delivery.state, "failed");
    assert!(terminal_ack.delivery.finished_at.is_some());
    assert_eq!(terminal_ack.job.state, "failed");

    let stale = service
        .submit_channel_delivery(&SubmitChannelDelivery {
            id: Some("chdel_ack_stale".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            target_external_identity_id: Some("tg_user_stale".to_string()),
            external_thread_id: None,
            principal_id: "principal_ack".to_string(),
            payload: json!({ "text": "stale" }),
            metadata: None,
            job_id: Some("job_channel_ack_stale".to_string()),
            idempotency_key: Some("channel-ack-stale".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: None,
            max_attempts: None,
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap();
    let claimed_stale = service
        .claim_job(&wanex_system_service::ClaimJob {
            worker_id: "connector_worker_stale".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::ChannelDelivery]),
        })
        .unwrap()
        .expect("stale test delivery should be claimable");
    assert_eq!(claimed_stale.id, stale.job.id);
    let stale_ack = service
        .complete_channel_delivery(&CompleteChannelDelivery {
            delivery_id: stale.delivery.id.clone(),
            worker_id: "connector_worker_stale".to_string(),
            lease_token: "wrong_lease".to_string(),
            result: Some(json!({ "externalMessageId": "should-not-commit" })),
            metadata: None,
        })
        .unwrap();
    assert!(stale_ack.is_none());
    let jobs = service
        .list_jobs(&wanex_system_service::ListJobs {
            state: Some("running".to_string()),
            kind: Some("channel.delivery".to_string()),
            limit: Some(10),
        })
        .unwrap();
    let still_running = jobs
        .iter()
        .find(|job| job.id == "job_channel_ack_stale")
        .expect("stale job should remain running");
    assert!(still_running.result.is_none());
}

#[test]
fn projects_channel_inbound_events_into_runtime_primitives() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    register_test_connector(
        &service,
        "connector.telegram",
        &["channel.connect", "channel.receive", "channel.deliver"],
    );

    service
        .create_session(
            Some("ses_projection"),
            Some("Projection Session"),
            Some("chat"),
        )
        .unwrap();
    let session_inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("chin_projection_session".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "projection-session-event".to_string(),
            external_thread_id: Some("telegram-chat-projection".to_string()),
            sender_external_identity_id: "tg_projection_user".to_string(),
            principal_id: Some("principal_projection".to_string()),
            payload: json!({ "message": { "text": "run this" } }),
            metadata: None,
            received_at: Some(10),
            idempotency_key: Some("projection-session-event".to_string()),
        })
        .unwrap();
    let session_projection = service
        .project_channel_inbound_event(&ProjectChannelInboundEvent {
            id: Some("chproj_session_turn".to_string()),
            inbound_event_id: session_inbound.id.clone(),
            target: json!({
                "kind": "session.turn",
                "sessionId": "ses_projection",
                "principalId": "principal_projection",
                "content": [{ "type": "text", "id": "part_projection_session", "text": "run this" }],
                "inputId": "inp_projection_session",
                "turnId": "turn_projection_session",
                "jobId": "job_projection_session",
                "executionBinding": test_execution_binding("channel_projection"),
                "maxSteps": 3
            }),
            metadata: Some(json!({ "source": "channel" })),
            idempotency_key: Some("projection-session-key".to_string()),
        })
        .unwrap();
    assert_eq!(session_projection.projection.target_kind, "session.turn");
    assert_eq!(
        session_projection.projection.target_id.as_deref(),
        Some("turn_projection_session")
    );
    assert_eq!(
        session_projection.projection.target_job_id.as_deref(),
        Some("job_projection_session")
    );
    assert_eq!(session_projection.job.unwrap().kind, "session.turn");
    let duplicate_session_projection = service
        .project_channel_inbound_event(&ProjectChannelInboundEvent {
            id: Some("ignored_projection_id".to_string()),
            inbound_event_id: session_inbound.id.clone(),
            target: json!({
                "kind": "session.turn",
                "sessionId": "ses_projection",
                "principalId": "principal_projection",
                "content": [{ "type": "text", "id": "ignored", "text": "ignored" }],
                "executionBinding": test_execution_binding("ignored_projection")
            }),
            metadata: None,
            idempotency_key: Some("projection-session-key".to_string()),
        })
        .unwrap();
    assert_eq!(
        duplicate_session_projection.projection.id,
        session_projection.projection.id
    );

    let conversation = service
        .put_team_conversation(&PutTeamConversation {
            id: Some("team_projection".to_string()),
            principal_id: "principal_projection".to_string(),
            title: Some("Projection Team".to_string()),
            mode: Some("hybrid".to_string()),
            metadata: None,
            idempotency_key: Some("team-projection".to_string()),
        })
        .unwrap();
    let speaker = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("tpart_projection_user".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "principal_projection".to_string(),
            kind: "user".to_string(),
            display_name: Some("Ada".to_string()),
            role: Some("user".to_string()),
            agent_session_id: None,
            metadata: None,
            idempotency_key: Some("team-projection-user".to_string()),
        })
        .unwrap();
    let team_inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("chin_projection_team".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "projection-team-event".to_string(),
            external_thread_id: Some("telegram-chat-projection".to_string()),
            sender_external_identity_id: "tg_projection_user".to_string(),
            principal_id: Some("principal_projection".to_string()),
            payload: json!({ "message": { "text": "team hello" } }),
            metadata: None,
            received_at: Some(20),
            idempotency_key: Some("projection-team-event".to_string()),
        })
        .unwrap();
    let team_projection = service
        .project_channel_inbound_event(&ProjectChannelInboundEvent {
            id: Some("chproj_team_message".to_string()),
            inbound_event_id: team_inbound.id.clone(),
            target: json!({
                "kind": "team.message",
                "conversationId": conversation.id,
                "authorParticipantId": speaker.id,
                "messageId": "tmsg_projection_team",
                "targets": [{ "kind": "all" }],
                "content": [{ "type": "text", "id": "part_projection_team", "text": "team hello" }],
                "metadata": { "source": "channel" }
            }),
            metadata: None,
            idempotency_key: Some("projection-team-key".to_string()),
        })
        .unwrap();
    assert_eq!(team_projection.projection.target_kind, "team.message");
    assert_eq!(
        team_projection.projection.target_id.as_deref(),
        Some("tmsg_projection_team")
    );
    assert!(team_projection.job.is_none());

    let workspace_inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("chin_projection_workspace".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "projection-workspace-event".to_string(),
            external_thread_id: Some("telegram-chat-projection".to_string()),
            sender_external_identity_id: "tg_projection_user".to_string(),
            principal_id: Some("principal_projection".to_string()),
            payload: json!({ "message": { "text": "fix file" } }),
            metadata: None,
            received_at: Some(30),
            idempotency_key: Some("projection-workspace-event".to_string()),
        })
        .unwrap();
    let workspace_projection = service
        .project_channel_inbound_event(&ProjectChannelInboundEvent {
            id: Some("chproj_workspace_task".to_string()),
            inbound_event_id: workspace_inbound.id.clone(),
            target: json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "access": "writable",
                "input": { "prompt": "fix file" },
                "taskId": "wtsk_projection",
                "workspaceId": "workspace_projection",
                "jobId": "job_projection_workspace"
            }),
            metadata: None,
            idempotency_key: Some("projection-workspace-key".to_string()),
        })
        .unwrap();
    assert_eq!(
        workspace_projection.projection.target_kind,
        "workspace.task"
    );
    assert_eq!(
        workspace_projection.projection.target_id.as_deref(),
        Some("wtsk_projection")
    );
    assert_eq!(
        workspace_projection.projection.target_job_id.as_deref(),
        Some("job_projection_workspace")
    );
    let workspace_job = workspace_projection.job.unwrap();
    assert_eq!(workspace_job.kind, "workspace.task");
    assert_eq!(workspace_job.payload["handlerId"], "coding.default");
    assert_eq!(workspace_job.payload["access"], "writable");
    assert_eq!(workspace_job.payload["input"]["prompt"], "fix file");

    let ignored_inbound = service
        .ingest_channel_inbound_event(&IngestChannelInboundEvent {
            id: Some("chin_projection_ignored".to_string()),
            connector_id: "connector.telegram".to_string(),
            channel_kind: "telegram".to_string(),
            channel_id: "bot-main".to_string(),
            external_event_id: "projection-ignored-event".to_string(),
            external_thread_id: Some("telegram-chat-projection".to_string()),
            sender_external_identity_id: "tg_projection_user".to_string(),
            principal_id: Some("principal_projection".to_string()),
            payload: json!({ "message": { "text": "spam" } }),
            metadata: None,
            received_at: Some(40),
            idempotency_key: Some("projection-ignored-event".to_string()),
        })
        .unwrap();
    let ignored_projection = service
        .project_channel_inbound_event(&ProjectChannelInboundEvent {
            id: Some("chproj_ignored".to_string()),
            inbound_event_id: ignored_inbound.id,
            target: json!({
                "kind": "ignored",
                "reason": "spam"
            }),
            metadata: Some(json!({ "moderation": "drop" })),
            idempotency_key: Some("projection-ignored-key".to_string()),
        })
        .unwrap();
    assert_eq!(ignored_projection.projection.target_kind, "ignored");
    assert_eq!(ignored_projection.projection.state, "ignored");
    assert!(ignored_projection.job.is_none());

    let projections = service
        .list_channel_projections(&ListChannelProjections {
            inbound_event_id: None,
            target_kind: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(projections.len(), 4);
}

#[test]
fn workspace_task_projection_rejects_incomplete_and_removed_policy_fields() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    register_test_connector(
        &service,
        "connector.workspace-policy",
        &["channel.connect", "channel.receive", "channel.deliver"],
    );
    let cases = [
        (
            "missing-access",
            json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "input": null
            }),
            "access",
        ),
        (
            "missing-input",
            json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "access": "read_only"
            }),
            "input",
        ),
        (
            "invalid-access",
            json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "access": "fixed",
                "input": null
            }),
            "access must be read_only or writable",
        ),
        (
            "keep-lease",
            json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "access": "writable",
                "input": null,
                "keepLease": true
            }),
            "unsupported field: keepLease",
        ),
        (
            "isolation",
            json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "access": "writable",
                "input": null,
                "isolation": { "rootDir": "/tmp/untrusted" }
            }),
            "unsupported field: isolation",
        ),
        (
            "metadata",
            json!({
                "kind": "workspace.task",
                "handlerId": "coding.default",
                "principalId": "principal_projection",
                "access": "writable",
                "input": null,
                "metadata": { "rootDir": "/tmp/untrusted" }
            }),
            "unsupported field: metadata",
        ),
    ];

    for (label, target, expected) in cases {
        let inbound = service
            .ingest_channel_inbound_event(&IngestChannelInboundEvent {
                id: Some(format!("chin_workspace_policy_{label}")),
                connector_id: "connector.workspace-policy".to_string(),
                channel_kind: "test".to_string(),
                channel_id: "workspace-policy".to_string(),
                external_event_id: format!("workspace-policy-{label}"),
                external_thread_id: None,
                sender_external_identity_id: "workspace_policy_user".to_string(),
                principal_id: Some("principal_projection".to_string()),
                payload: json!({ "label": label }),
                metadata: None,
                received_at: None,
                idempotency_key: Some(format!("workspace-policy-{label}")),
            })
            .unwrap();
        let error = service
            .project_channel_inbound_event(&ProjectChannelInboundEvent {
                id: Some(format!("chproj_workspace_policy_{label}")),
                inbound_event_id: inbound.id,
                target,
                metadata: None,
                idempotency_key: Some(format!("workspace-policy-projection-{label}")),
            })
            .unwrap_err();
        assert!(
            error.to_string().contains(expected),
            "{label} error did not contain {expected}: {error}"
        );
    }

    assert!(service
        .list_jobs(&wanex_system_service::ListJobs {
            state: None,
            kind: Some("workspace.task".to_string()),
            limit: Some(20),
        })
        .unwrap()
        .is_empty());
}

#[test]
fn media_generation_rejects_altered_request_evidence_before_enqueue() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let mut binding = media_generation_binding("altered-evidence");
    binding["request"]["prompt"] = json!("altered after digest");
    let result =
        service.submit_media_generation(&wanex_system_service::SubmitMediaGenerationOperation {
            id: Some("media-altered-evidence".to_string()),
            job_id: Some("media-altered-evidence-job".to_string()),
            principal_id: "media-user".to_string(),
            idempotency_key: "media-altered-evidence-key".to_string(),
            binding,
            priority: None,
        });
    assert!(matches!(result, Err(SystemServiceError::InvalidInput(_))));
    assert!(service
        .list_media_generations(&wanex_system_service::ListMediaGenerationOperations {
            principal_id: Some("media-user".to_string()),
            state: None,
            limit: None,
        })
        .unwrap()
        .is_empty());
}

#[test]
fn media_generation_submission_is_atomic_idempotent_and_lease_fenced() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let submitted = submit_media_generation(&service, "atomic");

    assert_eq!(submitted.operation.state, "queued");
    assert_eq!(submitted.job.kind, "media.generate");
    assert_eq!(submitted.job.payload["operationId"], submitted.operation.id);
    let repeated = submit_media_generation(&service, "atomic");
    assert_eq!(repeated.operation.id, submitted.operation.id);
    assert_eq!(repeated.job.id, submitted.job.id);

    let rollback =
        service.submit_media_generation(&wanex_system_service::SubmitMediaGenerationOperation {
            id: Some(submitted.operation.id.clone()),
            job_id: Some("job_media_rollback".to_string()),
            principal_id: "media-user".to_string(),
            idempotency_key: "media-key-rollback".to_string(),
            binding: media_generation_binding("rollback"),
            priority: None,
        });
    assert!(rollback.is_err());
    assert!(service
        .get_job(&wanex_system_service::GetJob {
            job_id: "job_media_rollback".to_string(),
        })
        .unwrap()
        .is_none());

    let claimed = claim_media_generation(&service, "media-worker", 60_000);
    let lease_token = claimed.lease_token.clone().unwrap();
    let fenced =
        service.begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-worker".to_string(),
            lease_token: "wrong-token".to_string(),
        });
    assert!(matches!(fenced, Err(SystemServiceError::Invariant(_))));
    let begun = service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-worker".to_string(),
            lease_token,
        })
        .unwrap()
        .unwrap();
    assert_eq!(begun.action, "started");
    assert_eq!(begun.operation.state, "submitting");
}

#[test]
fn media_generation_persists_acceptance_during_cancel_race() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let submitted = submit_media_generation(&service, "cancel-race");
    let claimed = claim_media_generation(&service, "media-cancel-worker", 60_000);
    let lease_token = claimed.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-cancel-worker".to_string(),
            lease_token: lease_token.clone(),
        })
        .unwrap();
    let cancelled = service
        .request_media_generation_cancel(&wanex_system_service::RequestMediaGenerationCancel {
            operation_id: submitted.operation.id.clone(),
            reason: "cancel raced with provider acceptance".to_string(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(cancelled.state, "cancel_requested");

    let accepted = service
        .accept_media_generation(&wanex_system_service::AcceptMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-cancel-worker".to_string(),
            lease_token: lease_token.clone(),
            external_operation_id: "provider-operation-cancel-race".to_string(),
            provider_checkpoint: Some(json!({ "cursor": 1 })),
        })
        .unwrap()
        .unwrap();
    assert_eq!(accepted.state, "cancel_requested");
    assert_eq!(
        accepted.external_operation_id.as_deref(),
        Some("provider-operation-cancel-race")
    );

    let suspension = service
        .suspend_media_generation(&wanex_system_service::SuspendMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-cancel-worker".to_string(),
            lease_token: lease_token.clone(),
            delay_ms: 60_000,
            outcome: "scheduled".to_string(),
            provider_checkpoint: None,
            progress: None,
            error: None,
        })
        .unwrap()
        .unwrap();
    assert_eq!(suspension.action, "cancel");
    assert_eq!(suspension.operation.state, "cancel_requested");
    assert_eq!(suspension.job.state, "running");

    let settled = service
        .settle_media_generation(&wanex_system_service::SettleMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-cancel-worker".to_string(),
            lease_token,
            poll_outcome: "none".to_string(),
            outcome: "cancelled".to_string(),
            error: None,
            reason: Some("provider cancellation completed".to_string()),
        })
        .unwrap()
        .unwrap();
    assert_eq!(settled.state, "cancelled");
}

#[test]
fn media_generation_suspension_releases_lease_and_resumes_only_when_due() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let submitted = submit_media_generation(&service, "suspension");
    let claimed = claim_media_generation(&service, "media-suspend-worker", 60_000);
    let lease_token = claimed.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-suspend-worker".to_string(),
            lease_token: lease_token.clone(),
        })
        .unwrap();
    service
        .accept_media_generation(&wanex_system_service::AcceptMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-suspend-worker".to_string(),
            lease_token: lease_token.clone(),
            external_operation_id: "provider-operation-suspension".to_string(),
            provider_checkpoint: Some(json!({ "cursor": 1 })),
        })
        .unwrap();
    let before_suspend = test_now_ms();
    let suspended = service
        .suspend_media_generation(&wanex_system_service::SuspendMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-suspend-worker".to_string(),
            lease_token,
            delay_ms: 60_000,
            outcome: "pending".to_string(),
            provider_checkpoint: Some(json!({ "cursor": 2 })),
            progress: Some(json!({ "percent": 50 })),
            error: None,
        })
        .unwrap()
        .unwrap();

    assert_eq!(suspended.action, "suspended");
    assert_eq!(suspended.operation.poll_count, 1);
    assert_eq!(suspended.operation.consecutive_poll_failures, 0);
    let next_poll_at = suspended.operation.next_poll_at.unwrap();
    assert!(next_poll_at >= before_suspend + 60_000);
    assert_eq!(
        suspended.operation.provider_checkpoint,
        Some(json!({ "cursor": 2 }))
    );
    assert_eq!(suspended.job.state, "pending");
    assert_eq!(suspended.job.not_before, Some(next_poll_at));
    assert!(suspended.job.lease_owner.is_none());
    assert!(suspended.job.lease_token.is_none());
    assert!(service
        .claim_job(&ClaimJob {
            worker_id: "media-too-early-worker".to_string(),
            lease_ms: 60_000,
            kinds: Some(vec![SchedulerJobKind::MediaGenerate]),
        })
        .unwrap()
        .is_none());

    let due_at = test_now_ms().saturating_sub(1);
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    conn.execute(
        "UPDATE scheduler_job SET not_before = ? WHERE id = ?",
        rusqlite::params![due_at, submitted.job.id],
    )
    .unwrap();
    conn.execute(
        "UPDATE media_generation_operation SET next_poll_at = ? WHERE id = ?",
        rusqlite::params![due_at, submitted.operation.id],
    )
    .unwrap();
    drop(conn);
    let resumed_job = claim_media_generation(&service, "media-resume-worker", 60_000);
    assert_eq!(resumed_job.id, submitted.job.id);
    let resumed = service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-resume-worker".to_string(),
            lease_token: resumed_job.lease_token.unwrap(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(resumed.action, "resume_polling");
    assert_eq!(resumed.operation.state, "polling");
    assert!(resumed.operation.next_poll_at.is_none());
}

#[test]
fn media_generation_cancel_wakes_a_suspended_provider_operation() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let submitted = submit_media_generation(&service, "suspended-cancel");
    let claimed = claim_media_generation(&service, "media-cancel-first", 60_000);
    let lease_token = claimed.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-cancel-first".to_string(),
            lease_token: lease_token.clone(),
        })
        .unwrap();
    service
        .accept_media_generation(&wanex_system_service::AcceptMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-cancel-first".to_string(),
            lease_token: lease_token.clone(),
            external_operation_id: "provider-operation-suspended-cancel".to_string(),
            provider_checkpoint: None,
        })
        .unwrap();
    service
        .suspend_media_generation(&wanex_system_service::SuspendMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-cancel-first".to_string(),
            lease_token,
            delay_ms: 60_000,
            outcome: "scheduled".to_string(),
            provider_checkpoint: None,
            progress: None,
            error: None,
        })
        .unwrap();

    let cancelled = service
        .request_media_generation_cancel(&wanex_system_service::RequestMediaGenerationCancel {
            operation_id: submitted.operation.id.clone(),
            reason: "cancel suspended provider work".to_string(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(cancelled.state, "cancel_requested");
    assert!(cancelled.next_poll_at.is_none());

    let cancellation_job = claim_media_generation(&service, "media-cancel-resume", 60_000);
    assert_eq!(cancellation_job.id, submitted.job.id);
    let begun = service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-cancel-resume".to_string(),
            lease_token: cancellation_job.lease_token.unwrap(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(begun.action, "cancel");
}

#[test]
fn deferred_media_tool_handoff_is_atomic_lease_free_and_idempotent() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = prepare_deferred_media_tool(&service, "handoff");

    assert_eq!(fixture.receipt.turn.state, "waiting");
    assert!(fixture.receipt.turn.current_attempt_id.is_none());
    assert_eq!(fixture.receipt.session_attempt.state, "suspended");
    assert_eq!(fixture.receipt.session_job.state, "waiting");
    assert!(fixture.receipt.session_job.lease_owner.is_none());
    assert!(fixture.receipt.session_job.lease_token.is_none());
    assert!(fixture.receipt.session_job.lease_expires_at.is_none());
    assert_eq!(fixture.receipt.tool_execution.state, "waiting");
    assert_eq!(fixture.receipt.tool_invocation_attempt.state, "suspended");
    assert_eq!(fixture.media_operation.state, "queued");
    assert_eq!(fixture.media_job.state, "ready");
    assert_eq!(
        fixture.media_operation.conversation.as_ref().unwrap(),
        &wanex_system_service::MediaGenerationConversationRelation {
            session_id: fixture.submitted.turn.session_id.clone(),
            turn_id: fixture.submitted.turn.id.clone(),
            source_message_id: fixture.source_message_id.clone(),
            tool_execution_id: fixture.receipt.tool_execution.id.clone(),
            tool_call_id: fixture.receipt.tool_execution.tool_call_id.clone(),
        }
    );
    assert!(claim_session_turn_job(&service, "waiting-session-worker", 60_000).is_none());

    let replay = service.defer_tool_execution(&fixture.request).unwrap();
    assert_eq!(replay, fixture.receipt);
    let operations = service
        .list_media_generations(&wanex_system_service::ListMediaGenerationOperations {
            principal_id: Some(fixture.receipt.tool_execution.principal_id.clone()),
            state: None,
            limit: None,
        })
        .unwrap();
    assert_eq!(operations.len(), 1);
}

#[test]
fn deferred_media_success_settles_resource_tool_content_and_wakes_session() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = prepare_deferred_media_tool(&service, "success");
    let media_job = claim_media_generation(&service, "deferred-success-media", 60_000);
    let lease_token = media_job.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: fixture.media_operation.id.clone(),
            worker_id: "deferred-success-media".to_string(),
            lease_token: lease_token.clone(),
        })
        .unwrap();
    let resource = service
        .ingest_resource(&IngestResource {
            id: Some("res_deferred_media_success".to_string()),
            logical_path: Some("resources/deferred/success.png".to_string()),
            content: b"deferred-media-success".to_vec(),
            media_type: Some("image/png".to_string()),
            kind: Some("image".to_string()),
            origin: Some("model_output".to_string()),
            label: Some("Generated image".to_string()),
            source: None,
            metadata: None,
            width: Some(64),
            height: Some(64),
            duration_ms: None,
            expected_sha256: None,
        })
        .unwrap();
    service
        .record_resource_provenance(&wanex_system_service::RecordResourceProvenance {
            resource: wanex_system_service::ResourceInputEvidence {
                resource_id: resource.id.clone(),
                sha256: resource.sha256.clone(),
                size_bytes: resource.size_bytes,
                kind: resource.kind.clone(),
                media_type: resource.media_type.clone(),
            },
            cause: wanex_system_service::ResourceProvenanceCause::MediaGeneration {
                operation_id: fixture.media_operation.id.clone(),
            },
            input_resources: vec![],
        })
        .unwrap();
    let completed = service
        .complete_media_generation(&wanex_system_service::CompleteMediaGenerationOperation {
            operation_id: fixture.media_operation.id.clone(),
            worker_id: "deferred-success-media".to_string(),
            lease_token,
            poll_outcome: "none".to_string(),
            output_resource_ids: vec![resource.id.clone()],
            result: None,
        })
        .unwrap()
        .unwrap();
    assert_eq!(completed.state, "succeeded");

    let tool = service
        .get_tool_execution(&fixture.receipt.tool_execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(tool.state, "succeeded");
    assert_eq!(tool.is_error, Some(false));
    assert_eq!(
        tool.content.unwrap(),
        vec![ToolResultContentPart::Resource {
            resource_id: resource.id,
            sha256: resource.sha256,
            size_bytes: resource.size_bytes,
            kind: "image".to_string(),
            media_type: Some("image/png".to_string()),
        }]
    );
    let session_job = service
        .get_job(&wanex_system_service::GetJob {
            job_id: fixture.submitted.job.id.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(session_job.state, "ready");
    assert!(session_job.lease_owner.is_none());
    let resumed_job = claim_session_turn_job(&service, "deferred-success-session", 60_000)
        .expect("deferred Session Job should wake");
    let resumed = start_test_turn(
        &service,
        &fixture.submitted,
        &resumed_job,
        "deferred-success-session",
    );
    assert_ne!(resumed.attempt.id, fixture.receipt.session_attempt.id);
    assert_eq!(resumed.attempt.attempt_number, 2);
}

#[test]
fn deferred_media_failure_and_waiting_cancellation_wake_canonical_tool_errors() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();

    let failed = prepare_deferred_media_tool(&service, "failed");
    let failed_job = claim_media_generation(&service, "deferred-failed-media", 60_000);
    let failed_token = failed_job.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: failed.media_operation.id.clone(),
            worker_id: "deferred-failed-media".to_string(),
            lease_token: failed_token.clone(),
        })
        .unwrap();
    service
        .settle_media_generation(&wanex_system_service::SettleMediaGenerationOperation {
            operation_id: failed.media_operation.id.clone(),
            worker_id: "deferred-failed-media".to_string(),
            lease_token: failed_token,
            poll_outcome: "none".to_string(),
            outcome: "failed".to_string(),
            error: Some(json!({"type": "provider_rejected", "code": "unsafe_prompt"})),
            reason: Some("provider rejected image generation".to_string()),
        })
        .unwrap();
    let failed_tool = service
        .get_tool_execution(&failed.receipt.tool_execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(failed_tool.state, "failed");
    assert_eq!(failed_tool.is_error, Some(true));
    assert_eq!(
        failed_tool.content.unwrap(),
        vec![ToolResultContentPart::Json {
            value: json!({
                "error": "media_generation_failed",
                "operationId": failed.media_operation.id,
                "message": "provider rejected image generation"
            })
        }]
    );
    assert_eq!(
        service
            .get_job(&wanex_system_service::GetJob {
                job_id: failed.submitted.job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "ready"
    );

    let cancel_dir = tempdir().unwrap();
    let cancel_service = SystemService::open(cancel_dir.path()).unwrap();
    let cancelled = prepare_deferred_media_tool(&cancel_service, "cancelled");
    let cancellation = cancel_service
        .request_session_turn_cancel(&RequestSessionTurnCancel {
            session_id: cancelled.submitted.turn.session_id.clone(),
            turn_id: cancelled.submitted.turn.id.clone(),
            input_id: cancelled.submitted.turn.primary_input_id.clone(),
            job_id: cancelled.submitted.job.id.clone(),
            reason: "user cancelled deferred generation".to_string(),
        })
        .unwrap();
    assert_eq!(cancellation.status, "cancel_requested");
    assert_eq!(
        cancellation.cascade_job_ids,
        vec![cancelled.media_job.id.clone()]
    );
    let cancel_job = claim_media_generation(&cancel_service, "deferred-cancel-media", 60_000);
    let cancel_token = cancel_job.lease_token.clone().unwrap();
    let begun = cancel_service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: cancelled.media_operation.id.clone(),
            worker_id: "deferred-cancel-media".to_string(),
            lease_token: cancel_token.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(begun.action, "cancel");
    cancel_service
        .settle_media_generation(&wanex_system_service::SettleMediaGenerationOperation {
            operation_id: cancelled.media_operation.id.clone(),
            worker_id: "deferred-cancel-media".to_string(),
            lease_token: cancel_token,
            poll_outcome: "none".to_string(),
            outcome: "cancelled".to_string(),
            error: None,
            reason: Some("user cancelled deferred generation".to_string()),
        })
        .unwrap();
    let cancelled_tool = cancel_service
        .get_tool_execution(&cancelled.receipt.tool_execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(cancelled_tool.state, "failed");
    assert_eq!(cancelled_tool.is_error, Some(true));
    let cancelled_turn = cancel_service
        .list_session_turns(&ListSessionTurns {
            session_id: cancelled.submitted.turn.session_id,
            state: None,
        })
        .unwrap()
        .into_iter()
        .find(|turn| turn.id == cancelled.submitted.turn.id)
        .unwrap();
    assert_eq!(cancelled_turn.state, "cancel_requested");
    assert_eq!(
        cancel_service
            .get_job(&wanex_system_service::GetJob {
                job_id: cancelled.submitted.job.id,
            })
            .unwrap()
            .unwrap()
            .state,
        "ready"
    );
}

#[test]
fn deferred_media_recovery_requires_reconciliation_and_rejects_retry() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let fixture = prepare_deferred_media_tool(&service, "recovery");
    let media_job = claim_media_generation(&service, "deferred-recovery-media", 60_000);
    let lease_token = media_job.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: fixture.media_operation.id.clone(),
            worker_id: "deferred-recovery-media".to_string(),
            lease_token: lease_token.clone(),
        })
        .unwrap();
    service
        .settle_media_generation(&wanex_system_service::SettleMediaGenerationOperation {
            operation_id: fixture.media_operation.id,
            worker_id: "deferred-recovery-media".to_string(),
            lease_token,
            poll_outcome: "none".to_string(),
            outcome: "recovery_required".to_string(),
            error: Some(json!({"type": "ambiguous_provider_submission"})),
            reason: Some("provider submission is ambiguous".to_string()),
        })
        .unwrap();
    let execution = service
        .get_tool_execution(&fixture.receipt.tool_execution.id)
        .unwrap()
        .unwrap();
    assert_eq!(execution.state, "recovery_required");
    let retry = service.resolve_tool_execution_recovery(&ResolveToolExecutionRecovery {
        execution_id: execution.id,
        expected_recovery_revision: execution.recovery_revision,
        decision: "retry".to_string(),
        principal_id: "reconciler".to_string(),
        reason: "try the deferred operation again".to_string(),
        idempotency_key: "deferred-recovery-retry".to_string(),
        content: None,
        content_digest: None,
        error: None,
    });
    assert!(
        matches!(retry, Err(SystemServiceError::Conflict(message)) if message == "deferred tool recovery cannot be retried")
    );
}

#[test]
fn media_generation_recovers_ambiguous_submission_without_redispatch() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let submitted = submit_media_generation(&service, "ambiguous");
    let first = claim_media_generation(&service, "media-worker-first", 1);
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-worker-first".to_string(),
            lease_token: first.lease_token.unwrap(),
        })
        .unwrap();
    std::thread::sleep(Duration::from_millis(10));

    let second = claim_media_generation(&service, "media-worker-second", 60_000);
    let recovered = service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-worker-second".to_string(),
            lease_token: second.lease_token.unwrap(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(recovered.action, "recovery_required");
    assert_eq!(recovered.operation.state, "recovery_required");
    assert!(recovered.operation.external_operation_id.is_none());
    assert_eq!(recovered.job.state, "failed");
}

#[test]
fn media_generation_completion_requires_an_available_resource() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let submitted = submit_media_generation(&service, "completion");
    let claimed = claim_media_generation(&service, "media-complete-worker", 60_000);
    let lease_token = claimed.lease_token.clone().unwrap();
    service
        .begin_media_generation(&wanex_system_service::BeginMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-complete-worker".to_string(),
            lease_token: lease_token.clone(),
        })
        .unwrap();

    let unavailable = service.complete_media_generation(
        &wanex_system_service::CompleteMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-complete-worker".to_string(),
            lease_token: lease_token.clone(),
            poll_outcome: "none".to_string(),
            output_resource_ids: vec!["resource-does-not-exist".to_string()],
            result: None,
        },
    );
    assert!(matches!(unavailable, Err(SystemServiceError::Invariant(_))));

    let resource = service
        .ingest_resource(&IngestResource {
            id: Some("res_media_generated".to_string()),
            logical_path: Some("resources/image/generated.png".to_string()),
            content: b"generated-media".to_vec(),
            media_type: Some("image/png".to_string()),
            kind: Some("image".to_string()),
            origin: Some("model_output".to_string()),
            label: None,
            source: None,
            metadata: None,
            width: None,
            height: None,
            duration_ms: None,
            expected_sha256: None,
        })
        .unwrap();
    assert_eq!(resource.state, "available");
    let missing_provenance = service.complete_media_generation(
        &wanex_system_service::CompleteMediaGenerationOperation {
            operation_id: submitted.operation.id.clone(),
            worker_id: "media-complete-worker".to_string(),
            lease_token: lease_token.clone(),
            poll_outcome: "none".to_string(),
            output_resource_ids: vec![resource.id.clone()],
            result: None,
        },
    );
    assert!(matches!(
        missing_provenance,
        Err(SystemServiceError::Invariant(_))
    ));
    service
        .record_resource_provenance(&wanex_system_service::RecordResourceProvenance {
            resource: wanex_system_service::ResourceInputEvidence {
                resource_id: resource.id.clone(),
                sha256: resource.sha256.clone(),
                size_bytes: resource.size_bytes,
                kind: resource.kind.clone(),
                media_type: resource.media_type.clone(),
            },
            cause: wanex_system_service::ResourceProvenanceCause::MediaGeneration {
                operation_id: submitted.operation.id.clone(),
            },
            input_resources: vec![],
        })
        .unwrap();
    let completed = service
        .complete_media_generation(&wanex_system_service::CompleteMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-complete-worker".to_string(),
            lease_token,
            poll_outcome: "none".to_string(),
            output_resource_ids: vec![resource.id],
            result: Some(json!({ "published": true })),
        })
        .unwrap()
        .unwrap();
    assert_eq!(completed.state, "succeeded");
    assert_eq!(completed.output_resource_ids, vec!["res_media_generated"]);
}

fn submit_media_generation(
    service: &SystemService,
    label: &str,
) -> wanex_system_service::MediaGenerationOperationSubmission {
    service
        .submit_media_generation(&wanex_system_service::SubmitMediaGenerationOperation {
            id: Some(format!("media-operation-{label}")),
            job_id: Some(format!("media-job-{label}")),
            principal_id: "media-user".to_string(),
            idempotency_key: format!("media-key-{label}"),
            binding: media_generation_binding(label),
            priority: None,
        })
        .unwrap()
}

#[derive(Clone)]
struct DeferredMediaToolFixture {
    submitted: SubmitSessionTurnReceipt,
    source_message_id: String,
    request: wanex_system_service::DeferToolExecution,
    receipt: wanex_system_service::DeferToolExecutionReceipt,
    media_operation: wanex_system_service::MediaGenerationOperationRecord,
    media_job: wanex_system_service::SchedulerJobRecord,
}

fn prepare_deferred_media_tool(service: &SystemService, label: &str) -> DeferredMediaToolFixture {
    let session_id = format!("ses_deferred_media_{label}");
    let input_id = format!("inp_deferred_media_{label}");
    let turn_id = format!("turn_deferred_media_{label}");
    let job_id = format!("job_deferred_media_{label}");
    let worker_id = format!("worker_deferred_media_{label}");
    let tool_call_id = format!("call_deferred_media_{label}");
    service
        .create_session(Some(&session_id), None, Some("agent"))
        .unwrap();
    let mut submit = test_turn_request(TestTurn {
        session_id: &session_id,
        input_id: &input_id,
        turn_id: &turn_id,
        job_id: &job_id,
        principal_id: "deferred-media-user",
        idempotency_key: &format!("deferred-media-{label}"),
        text: "generate an image",
    });
    submit.execution_binding = deferred_media_execution_binding(label);
    let submitted = service.submit_session_turn(&submit).unwrap();
    let session_job = claim_session_turn_job(service, &worker_id, 60_000).unwrap();
    let started = start_test_turn(service, &submitted, &session_job, &worker_id);
    let provider =
        begin_test_provider_invocation(service, &submitted, &started, &session_job, &worker_id);
    let source_message = service
        .finish_provider_invocation(&wanex_system_service::FinishProviderInvocation {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: input_id.clone(),
            job_id: job_id.clone(),
            worker_id: worker_id.clone(),
            lease_token: session_job.lease_token.clone().unwrap(),
            invocation_id: provider.id,
            outcome: "succeeded".to_string(),
            assistant_message: Some(json!([{
                "type": "tool_call",
                "id": format!("part_{tool_call_id}"),
                "toolCallId": tool_call_id,
                "toolName": "image_generate",
                "input": {"prompt": format!("deferred image {label}")}
            }])),
            provider_state: None,
            provider_request_id: None,
            error: None,
        })
        .unwrap()
        .unwrap()
        .assistant_message
        .unwrap();
    let requirement = image_generation_requirement();
    let begun_tool = service
        .begin_tool_execution(&BeginToolExecution {
            session_id: session_id.clone(),
            turn_id: turn_id.clone(),
            attempt_id: started.attempt.id.clone(),
            input_id: input_id.clone(),
            source_message_id: source_message.id.clone(),
            job_id: job_id.clone(),
            worker_id: worker_id.clone(),
            lease_token: session_job.lease_token.clone().unwrap(),
            principal_id: "deferred-media-user".to_string(),
            tool_call_id: tool_call_id.clone(),
            tool_name: "image_generate".to_string(),
            input: json!({"prompt": format!("deferred image {label}")}),
            descriptor: json!({
                "name": "image_generate",
                "description": "Generate an image from a text prompt.",
                "inputSchema": {"type": "object"},
                "risk": "external",
                "idempotent": true,
                "concurrency": "exclusive",
                "resultMode": "deferred",
                "requiredCapabilities": [requirement],
                "runtimeBinding": {
                    "implementationId": "wanex.test.image-generate",
                    "implementationRevision": "1"
                }
            }),
            permission: json!({"status": "allow", "reason": "test"}),
            activity: None,
            state: "running".to_string(),
            idempotency_key: format!(
                "tool:{source_message_id}:{tool_call_id}",
                source_message_id = source_message.id
            ),
        })
        .unwrap();
    let tool_attempt = begun_tool.invocation_attempt.unwrap();
    let request = wanex_system_service::DeferToolExecution {
        session_id,
        turn_id,
        session_attempt_id: started.attempt.id,
        input_id,
        source_message_id: source_message.id.clone(),
        session_job_id: job_id,
        worker_id,
        lease_token: session_job.lease_token.unwrap(),
        tool_execution_id: begun_tool.execution.id,
        tool_invocation_attempt_id: tool_attempt.id,
        tool_call_id,
        operation: wanex_system_service::DeferredToolOperation::MediaGeneration {
            binding: media_generation_binding(label),
            priority: None,
        },
    };
    let receipt = service.defer_tool_execution(&request).unwrap();
    let (media_operation, media_job) = match &receipt.operation {
        wanex_system_service::DeferredToolOperationReceipt::MediaGeneration { record, job } => {
            (record.as_ref().clone(), job.clone())
        }
        _ => panic!("expected deferred media operation"),
    };
    DeferredMediaToolFixture {
        submitted,
        source_message_id: source_message.id,
        request,
        receipt,
        media_operation,
        media_job,
    }
}

fn deferred_media_execution_binding(label: &str) -> serde_json::Value {
    let mut binding = test_execution_binding(label);
    let media = media_generation_binding(label);
    binding["capabilityRoutes"] = json!([{
        "requirement": image_generation_requirement(),
        "source": "single_candidate",
        "modelEndpoint": {
            "endpointId": media["endpointId"],
            "endpointDigest": media["endpointDigest"],
            "connection": media["connection"],
            "protocol": media["protocol"],
            "model": media["model"]
        }
    }]);
    refresh_execution_binding_digest(&mut binding);
    binding
}

fn image_generation_requirement() -> serde_json::Value {
    json!({
        "operation": "image.generate",
        "inputModalities": ["text"],
        "outputModalities": ["image"],
        "features": []
    })
}

fn media_generation_binding(label: &str) -> serde_json::Value {
    let endpoint = json!({
        "id": format!("media-endpoint-{label}"),
        "connection": {
            "id": format!("media-connection-{label}"),
            "providerId": "fake-media-provider"
        },
        "protocol": { "id": "fake-media-protocol" },
        "model": {
            "id": format!("fake-media-model-{label}"),
            "operations": ["image.generate"],
            "inputModalities": ["text"],
            "outputModalities": ["image"],
            "features": [],
            "catalog": {
                "source": "custom",
                "catalogId": format!("test.fake-media-model-{label}"),
                "revision": "1"
            }
        }
    });
    let request = json!({
        "operation": "image.generate",
        "prompt": format!("media prompt {label}"),
        "outputModality": "image",
        "inputResources": [],
        "options": null
    });
    let request_digest = sha256_json(&request);
    json!({
        "endpointId": endpoint["id"],
        "endpointDigest": sha256_json(&endpoint),
        "connection": endpoint["connection"],
        "protocol": endpoint["protocol"],
        "model": endpoint["model"],
        "request": request,
        "requestDigest": request_digest
    })
}

fn media_generation_binding_with_secret(label: &str, secret_ref: &str) -> serde_json::Value {
    let mut binding = media_generation_binding(label);
    binding["connection"]["secretRef"] = json!(secret_ref);
    let endpoint = json!({
        "id": binding["endpointId"],
        "connection": binding["connection"],
        "protocol": binding["protocol"],
        "model": binding["model"]
    });
    binding["endpointDigest"] = json!(sha256_json(&endpoint));
    binding
}

fn claim_media_generation(
    service: &SystemService,
    worker_id: &str,
    lease_ms: i64,
) -> SchedulerJobRecord {
    service
        .claim_job(&ClaimJob {
            worker_id: worker_id.to_string(),
            lease_ms,
            kinds: Some(vec![SchedulerJobKind::MediaGenerate]),
        })
        .unwrap()
        .expect("media generation job should be claimable")
}

fn test_now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as i64
}

fn assert_no_atomic_temp_files(directory: &std::path::Path) {
    let temp_files = std::fs::read_dir(directory)
        .unwrap()
        .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
        .filter(|name| name.contains(".tmp-"))
        .collect::<Vec<_>>();
    assert!(
        temp_files.is_empty(),
        "orphan atomic temp files: {temp_files:?}"
    );
}

fn sha256_hex(content: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(content);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn register_test_connector(service: &SystemService, connector_id: &str, capabilities: &[&str]) {
    let plugin_id = format!("plugin.{connector_id}");
    service
        .put_plugin_manifest(&PutPluginManifest {
            id: None,
            plugin_id: plugin_id.clone(),
            version: "1.0.0".to_string(),
            name: Some(format!("Test Connector {connector_id}")),
            entry: Some(json!({ "kind": "test" })),
            capabilities: capabilities
                .iter()
                .map(|capability| capability.to_string())
                .collect(),
            metadata: Some(json!({ "test": true })),
            idempotency_key: Some(format!("manifest:{connector_id}")),
        })
        .unwrap();
    service
        .put_connector_registration(&PutConnectorRegistration {
            id: None,
            connector_id: connector_id.to_string(),
            plugin_id,
            version: Some("1.0.0".to_string()),
            metadata: Some(json!({ "test": true })),
            idempotency_key: Some(format!("connector:{connector_id}")),
        })
        .unwrap();
}

fn create_unsupported_store(root: &std::path::Path, with_marker: bool) {
    std::fs::create_dir_all(root.join("files")).unwrap();
    let conn = rusqlite::Connection::open(root.join("state.db")).unwrap();
    conn.execute("CREATE TABLE orphaned_state (id TEXT PRIMARY KEY)", [])
        .unwrap();
    if with_marker {
        conn.execute_batch(
            "CREATE TABLE schema_metadata (
               version INTEGER PRIMARY KEY,
               name TEXT NOT NULL,
               applied_at INTEGER NOT NULL
             );
             INSERT INTO schema_metadata (version, name, applied_at)
               VALUES (8, 'budget_usage_ledger', 1);",
        )
        .unwrap();
    }
}

fn schema_markers(conn: &rusqlite::Connection) -> Vec<(i64, String)> {
    let mut stmt = conn
        .prepare("SELECT version, name FROM schema_metadata ORDER BY version")
        .unwrap();
    let rows = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap();
    rows.map(|row| row.unwrap()).collect()
}
