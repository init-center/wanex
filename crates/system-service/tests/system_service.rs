use std::sync::{Arc, Barrier};
use std::time::Duration;

use serde_json::json;
use sha2::{Digest, Sha256};
use tempfile::tempdir;
use wanex_system_service::{
    ActivateContextEpoch, AppendSessionMessage, AppendTeamTurn, ApplySessionTurnControl,
    AttachDelegationGraphNodeJob, BeginProviderInvocation, BeginToolExecution, BudgetAmount,
    BudgetScopeKind, BudgetScopeRef, ClaimJob, CleanupExpiredResourceTickets, CloneContextEpoch,
    CommitBudget, CompleteChannelDelivery, CompleteJob, DoctorCheckState, EnqueueJob, EventScope,
    FailChannelDelivery, FailJob, FinishConnectorSession, GetActiveContextEpoch, GetPluginInstall,
    GetPluginManifest, HeartbeatConnectorSession, HeartbeatJob, IngestChannelInboundEvent,
    IngestResource, InterruptSessionTurn, ListChannelBindings, ListChannelInboundEvents,
    ListChannelProjections, ListConnectorCredentials, ListConnectorSessions, ListContextEpochs,
    ListContextReplacements, ListDelegationGraphDependencies, ListDelegationGraphNodes,
    ListDelegationGraphs, ListObjectiveAttempts, ListObjectiveRunOperations, ListObjectiveRuns,
    ListObjectiveVerifications, ListPlanProposalOperations, ListPlanProposals, ListPluginInstalls,
    ListPluginManifests, ListReadyDelegationGraphNodes, ListResources, ListSessionAttempts,
    ListSessionTurnControls, ListSessionTurns, ListSessions, ListTeamConversations,
    ListTeamParticipants, ListTeamTurns, ListWorkspaceChangeOperations,
    ListWorkspaceChangeProposalOperations, ListWorkspaceChangeProposals, ListWorkspaceChangeSets,
    MaterializeReadyDelegationGraphNode, ObjectiveReferenceRecord, ProjectChannelInboundEvent,
    PruneContextEpochs, PutChannelBinding, PutConnectorCredential, PutConnectorRegistration,
    PutContextEpoch, PutContextReplacement, PutDelegationGraph, PutDelegationGraphDependency,
    PutDelegationGraphNode, PutObjectiveAttempt, PutObjectiveRun, PutObjectiveVerification,
    PutPlanProposal, PutPluginInstall, PutPluginManifest, PutTeamConversation, PutTeamParticipant,
    PutWorkspaceChangeProposal, PutWorkspaceChangeSet, QueryEvents, RecordBudgetUsage,
    RecordObjectiveRunOperation, RecordPlanProposalOperation, RecordWorkspaceChangeOperation,
    RecordWorkspaceChangeProposalOperation, RequestSessionTurnCancel, ReserveBudget,
    ResourceCapability, ResourceSource, RetryPolicy, RetryStrategy, RevokeConnectorCredential,
    RuntimeEvent, SchedulerJobKind, SchedulerJobRecord, SettleSessionTurn, StartConnectorSession,
    StartSessionTurnAttempt, SteerSessionTurn, SubmitChannelDelivery, SubmitPluginAction,
    SubmitSessionTurn, SubmitSessionTurnReceipt, SystemService, SystemServiceError,
    UpdateChannelInboundEventState, UpdateConnectorRegistrationState,
    UpdateDelegationGraphNodeState, UpdateDelegationGraphState, UpdatePluginInstallState,
    UpdatePluginManifestState, UpdateTeamConversationState, UpdateTeamParticipantState,
    CURRENT_SCHEMA_VERSION,
};

fn test_execution_binding(label: &str) -> serde_json::Value {
    let profile = json!({
        "id": format!("profile_{label}"),
        "kind": "fake",
        "providerId": "fake",
        "modelId": format!("model_{label}"),
        "capabilities": { "input": ["text"], "output": ["text"] }
    });
    let profile_digest = sha256_json(&profile);
    let mut binding = json!({
        "createdAt": 1,
        "provider": {
            "profileId": format!("profile_{label}"),
            "profileDigest": profile_digest,
            "adapterId": "fake",
            "providerId": "fake",
            "modelId": format!("model_{label}"),
            "capabilities": { "input": ["text"], "output": ["text"] }
        },
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

fn sha256_json(value: &serde_json::Value) -> String {
    Sha256::digest(serde_json::to_string(value).unwrap().as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
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

fn submit_test_turn(service: &SystemService, request: TestTurn<'_>) -> SubmitSessionTurnReceipt {
    service
        .submit_session_turn(&SubmitSessionTurn {
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
            parent_turn_id: None,
            regenerates_turn_id: None,
            scheduled_at: None,
            not_before: None,
            priority: None,
            budget_grant_id: None,
        })
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

#[test]
fn opens_baseline_idempotently_and_reports_doctor_status() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let reopened = SystemService::open(dir.path()).unwrap();

    let report = reopened.doctor().unwrap();

    assert_eq!(report.store_path, service.db_path());
    assert_eq!(report.schema_version, CURRENT_SCHEMA_VERSION);
    let conn = rusqlite::Connection::open(service.db_path()).unwrap();
    assert_eq!(schema_markers(&conn), vec![(1, "baseline".to_string())]);
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
fn upserts_and_lists_context_replacements() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_ctx"), None, Some("agent"))
        .unwrap();
    let epoch = service
        .put_context_epoch(&PutContextEpoch {
            id: Some("ctxepoch_ctx_build".to_string()),
            session_id: "ses_ctx".to_string(),
            policy_version: "policy_v1".to_string(),
            state: Some("building".to_string()),
            token_estimate_before: None,
            token_estimate_after: None,
            token_savings: None,
            replacement_count: None,
            metadata: None,
        })
        .unwrap();
    assert_eq!(epoch.state, "building");

    let first = service
        .put_context_replacement(&PutContextReplacement {
            id: Some("ctxrep_one".to_string()),
            epoch_id: "ctxepoch_ctx_build".to_string(),
            session_id: "ses_ctx".to_string(),
            policy_version: "policy_v1".to_string(),
            message_id: Some("msg_ctx".to_string()),
            part_id: "part_ctx".to_string(),
            tier: "tier1_snip".to_string(),
            original_token_estimate: 100,
            replacement_token_estimate: 10,
            replacement: json!({ "type": "text", "id": "part_ctx", "text": "short" }),
            metadata: Some(json!({ "source": "test" })),
        })
        .unwrap();
    assert_eq!(first.id, "ctxrep_one");

    let second = service
        .put_context_replacement(&PutContextReplacement {
            id: Some("ctxrep_two_ignored".to_string()),
            epoch_id: "ctxepoch_ctx_build".to_string(),
            session_id: "ses_ctx".to_string(),
            policy_version: "policy_v1".to_string(),
            message_id: Some("msg_ctx".to_string()),
            part_id: "part_ctx".to_string(),
            tier: "tier2_placeholder".to_string(),
            original_token_estimate: 100,
            replacement_token_estimate: 4,
            replacement: json!({ "type": "text", "id": "part_ctx", "text": "[compacted]" }),
            metadata: None,
        })
        .unwrap();

    assert_eq!(second.id, "ctxrep_one");
    assert_eq!(second.tier, "tier2_placeholder");
    let listed = service
        .list_context_replacements(&ListContextReplacements {
            session_id: "ses_ctx".to_string(),
            policy_version: Some("policy_v1".to_string()),
            epoch_id: Some("ctxepoch_ctx_build".to_string()),
        })
        .unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].replacement["text"], "[compacted]");

    let active = service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: "ctxepoch_ctx_build".to_string(),
        })
        .unwrap();
    assert_eq!(active.state, "active");
    let active_lookup = service
        .get_active_context_epoch(&GetActiveContextEpoch {
            session_id: "ses_ctx".to_string(),
            policy_version: "policy_v1".to_string(),
        })
        .unwrap();
    assert_eq!(active_lookup.unwrap().id, "ctxepoch_ctx_build");

    let active_write = service
        .put_context_replacement(&PutContextReplacement {
            id: Some("ctxrep_after_active".to_string()),
            epoch_id: "ctxepoch_ctx_build".to_string(),
            session_id: "ses_ctx".to_string(),
            policy_version: "policy_v1".to_string(),
            message_id: Some("msg_ctx".to_string()),
            part_id: "part_after_active".to_string(),
            tier: "tier1_snip".to_string(),
            original_token_estimate: 10,
            replacement_token_estimate: 5,
            replacement: json!({ "type": "text", "id": "part_after_active", "text": "short" }),
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(active_write, SystemServiceError::Invariant(_)));

    service
        .put_context_epoch(&PutContextEpoch {
            id: Some("ctxepoch_ctx_next".to_string()),
            session_id: "ses_ctx".to_string(),
            policy_version: "policy_v1".to_string(),
            state: None,
            token_estimate_before: None,
            token_estimate_after: None,
            token_savings: None,
            replacement_count: None,
            metadata: None,
        })
        .unwrap();
    service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: "ctxepoch_ctx_next".to_string(),
        })
        .unwrap();
    let epochs = service
        .list_context_epochs(&ListContextEpochs {
            session_id: "ses_ctx".to_string(),
            policy_version: Some("policy_v1".to_string()),
            state: None,
        })
        .unwrap();
    assert_eq!(
        epochs
            .iter()
            .map(|epoch| (epoch.id.as_str(), epoch.state.as_str()))
            .collect::<Vec<_>>(),
        vec![
            ("ctxepoch_ctx_build", "superseded"),
            ("ctxepoch_ctx_next", "active")
        ]
    );
}

#[test]
fn clones_and_prunes_context_epochs_safely() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_ctx_maintenance"), None, Some("agent"))
        .unwrap();

    for (epoch_id, part_id) in [
        ("ctxepoch_maintenance_one", "part_maintenance_one"),
        ("ctxepoch_maintenance_two", "part_maintenance_two"),
        ("ctxepoch_maintenance_three", "part_maintenance_three"),
    ] {
        service
            .put_context_epoch(&PutContextEpoch {
                id: Some(epoch_id.to_string()),
                session_id: "ses_ctx_maintenance".to_string(),
                policy_version: "policy_maintenance".to_string(),
                state: None,
                token_estimate_before: Some(100),
                token_estimate_after: Some(10),
                token_savings: Some(90),
                replacement_count: Some(1),
                metadata: None,
            })
            .unwrap();
        service
            .put_context_replacement(&PutContextReplacement {
                id: Some(format!("ctxrep_{part_id}")),
                epoch_id: epoch_id.to_string(),
                session_id: "ses_ctx_maintenance".to_string(),
                policy_version: "policy_maintenance".to_string(),
                message_id: Some(format!("msg_{part_id}")),
                part_id: part_id.to_string(),
                tier: "tier2_placeholder".to_string(),
                original_token_estimate: 100,
                replacement_token_estimate: 10,
                replacement: json!({ "type": "text", "id": part_id, "text": "[compacted]" }),
                metadata: None,
            })
            .unwrap();
        service
            .activate_context_epoch(&ActivateContextEpoch {
                epoch_id: epoch_id.to_string(),
            })
            .unwrap();
    }

    let superseded_reactivate = service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: "ctxepoch_maintenance_one".to_string(),
        })
        .unwrap_err();
    assert!(matches!(
        superseded_reactivate,
        SystemServiceError::Invariant(_)
    ));

    let cloned = service
        .clone_context_epoch(&CloneContextEpoch {
            source_epoch_id: "ctxepoch_maintenance_one".to_string(),
            id: Some("ctxepoch_maintenance_clone".to_string()),
            metadata: Some(json!({ "reason": "restore-old-projection" })),
        })
        .unwrap();
    assert_eq!(cloned.state, "building");
    assert_eq!(cloned.replacement_count, 1);
    let cloned_replacements = service
        .list_context_replacements(&ListContextReplacements {
            session_id: "ses_ctx_maintenance".to_string(),
            policy_version: Some("policy_maintenance".to_string()),
            epoch_id: Some("ctxepoch_maintenance_clone".to_string()),
        })
        .unwrap();
    assert_eq!(cloned_replacements.len(), 1);
    assert_ne!(cloned_replacements[0].id, "ctxrep_part_maintenance_one");
    assert_eq!(cloned_replacements[0].part_id, "part_maintenance_one");

    service
        .activate_context_epoch(&ActivateContextEpoch {
            epoch_id: "ctxepoch_maintenance_clone".to_string(),
        })
        .unwrap();
    let active = service
        .get_active_context_epoch(&GetActiveContextEpoch {
            session_id: "ses_ctx_maintenance".to_string(),
            policy_version: "policy_maintenance".to_string(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(active.id, "ctxepoch_maintenance_clone");

    let dry_run = service
        .prune_context_epochs(&PruneContextEpochs {
            session_id: "ses_ctx_maintenance".to_string(),
            policy_version: "policy_maintenance".to_string(),
            keep_last_superseded: Some(1),
            older_than_updated_at: None,
            dry_run: Some(true),
        })
        .unwrap();
    assert!(dry_run.dry_run);
    assert_eq!(dry_run.scanned_count, 3);
    assert_eq!(dry_run.deleted_epoch_ids.len(), 2);
    assert_eq!(dry_run.deleted_replacement_count, 2);
    assert_eq!(
        service
            .list_context_epochs(&ListContextEpochs {
                session_id: "ses_ctx_maintenance".to_string(),
                policy_version: Some("policy_maintenance".to_string()),
                state: Some("superseded".to_string()),
            })
            .unwrap()
            .len(),
        3
    );

    let receipt = service
        .prune_context_epochs(&PruneContextEpochs {
            session_id: "ses_ctx_maintenance".to_string(),
            policy_version: "policy_maintenance".to_string(),
            keep_last_superseded: Some(1),
            older_than_updated_at: None,
            dry_run: None,
        })
        .unwrap();
    assert!(!receipt.dry_run);
    assert_eq!(receipt.deleted_epoch_ids.len(), 2);
    assert_eq!(receipt.deleted_replacement_count, 2);
    let remaining_epochs = service
        .list_context_epochs(&ListContextEpochs {
            session_id: "ses_ctx_maintenance".to_string(),
            policy_version: Some("policy_maintenance".to_string()),
            state: None,
        })
        .unwrap();
    let mut remaining_states = remaining_epochs
        .iter()
        .map(|epoch| epoch.state.as_str())
        .collect::<Vec<_>>();
    remaining_states.sort_unstable();
    assert_eq!(remaining_states, vec!["active", "superseded"]);
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
                        "afterSha256": sha256_hex(b"two\n"),
                        "merged": false
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

    let marked_applied = service
        .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
            id: Some("wcpo_mark_applied".to_string()),
            proposal_id: "wcp_review".to_string(),
            operation: "mark_applied".to_string(),
            actor_id: "proposal_apply_runtime".to_string(),
            reason: None,
            metadata: Some(json!({ "workspaceOperationId": "wcop_apply" })),
        })
        .unwrap();
    assert_eq!(marked_applied.from_state, "apply_requested");
    assert_eq!(marked_applied.to_state, "applied");
    let terminal = service
        .record_workspace_change_proposal_operation(&RecordWorkspaceChangeProposalOperation {
            id: None,
            proposal_id: "wcp_review".to_string(),
            operation: "mark_apply_failed".to_string(),
            actor_id: "proposal_apply_runtime".to_string(),
            reason: None,
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(terminal, SystemServiceError::Invariant(_)));
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

    let request = PutPlanProposal {
        id: Some("planp_system".to_string()),
        principal_id: "agent_plan".to_string(),
        title: Some("Plan proposal".to_string()),
        summary: Some("Durable plan proposal".to_string()),
        steps: json!([
            { "id": "step_1", "title": "Inspect", "status": "pending" },
            { "id": "step_2", "title": "Implement", "detail": "Use system-service" }
        ]),
        references: Some(vec![
            wanex_system_service::PlanProposalReferenceRecord {
                kind: "session".to_string(),
                reference_id: "ses_plan".to_string(),
                role: Some("source".to_string()),
                metadata: Some(json!({ "order": 1 })),
            },
            wanex_system_service::PlanProposalReferenceRecord {
                kind: "workspace_change_proposal".to_string(),
                reference_id: "wcp_plan".to_string(),
                role: Some("related".to_string()),
                metadata: None,
            },
        ]),
        metadata: Some(json!({ "source": "system-service-test" })),
        idempotency_key: Some("plan-system-key".to_string()),
    };
    let proposal = service.put_plan_proposal(&request).unwrap();
    let duplicate = service
        .put_plan_proposal(&PutPlanProposal {
            id: Some("ignored_plan_id".to_string()),
            ..request.clone()
        })
        .unwrap();

    assert_eq!(proposal.id, "planp_system");
    assert_eq!(duplicate.id, proposal.id);
    assert_eq!(proposal.state, "open");
    assert_eq!(proposal.references.len(), 2);
    assert_eq!(proposal.references[0].metadata, Some(json!({ "order": 1 })));

    let invalid_transition = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_invalid".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "request_execution".to_string(),
            actor_id: "user_plan".to_string(),
            reason: None,
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(
        invalid_transition,
        SystemServiceError::Invariant(_)
    ));

    let approved = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_approve".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "approve".to_string(),
            actor_id: "user_plan".to_string(),
            reason: Some("looks correct".to_string()),
            metadata: None,
        })
        .unwrap();
    assert_eq!(approved.from_state, "open");
    assert_eq!(approved.to_state, "approved");

    let requested = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_request_execution".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "request_execution".to_string(),
            actor_id: "user_plan".to_string(),
            reason: None,
            metadata: Some(json!({ "target": "runtime" })),
        })
        .unwrap();
    assert_eq!(requested.from_state, "approved");
    assert_eq!(requested.to_state, "execution_requested");

    let executed = service
        .record_plan_proposal_operation(&RecordPlanProposalOperation {
            id: Some("planop_mark_executed".to_string()),
            proposal_id: proposal.id.clone(),
            operation: "mark_executed".to_string(),
            actor_id: "runtime_plan".to_string(),
            reason: None,
            metadata: Some(json!({ "jobId": "job_plan" })),
        })
        .unwrap();
    assert_eq!(executed.from_state, "execution_requested");
    assert_eq!(executed.to_state, "executed");

    let fetched = service.get_plan_proposal(&proposal.id).unwrap().unwrap();
    assert_eq!(fetched.state, "executed");
    assert!(fetched.closed_at.is_some());

    let listed_by_reference = service
        .list_plan_proposals(&ListPlanProposals {
            principal_id: None,
            state: Some("executed".to_string()),
            reference_kind: Some("session".to_string()),
            reference_id: Some("ses_plan".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed_by_reference.len(), 1);
    assert_eq!(listed_by_reference[0].id, proposal.id);

    let listed_by_principal = service
        .list_plan_proposals(&ListPlanProposals {
            principal_id: Some("agent_plan".to_string()),
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
        vec!["approve", "request_execution", "mark_executed"]
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
            "plan.proposal.operation_recorded"
        ]
    );
    assert!(events
        .iter()
        .all(|event| event.scope.plan_proposal_id.as_deref() == Some("planp_system")));
}

#[test]
fn records_objective_run_lifecycle_attempts_verifications_references_and_events() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(
            Some("ses_objective"),
            Some("Objective source"),
            Some("agent"),
        )
        .unwrap();

    let request = PutObjectiveRun {
        id: Some("objective_system".to_string()),
        principal_id: "agent_objective".to_string(),
        objective: "Reduce login LCP below 2.5s".to_string(),
        scope: Some("apps/web".to_string()),
        constraints: Some(vec![
            "do not change public auth API".to_string(),
            "run verification before success".to_string(),
        ]),
        success_criteria: Some(vec!["npm test passes".to_string()]),
        stop_policy: Some(json!({
            "maxAttempts": 3,
            "maxElapsedMs": 600000,
            "repeatedBlockThreshold": 2,
            "requireVerification": true
        })),
        references: Some(vec![ObjectiveReferenceRecord {
            kind: "session".to_string(),
            reference_id: "ses_objective".to_string(),
            role: Some("source".to_string()),
            metadata: Some(json!({ "order": 1 })),
        }]),
        metadata: Some(json!({ "source": "system-service-test" })),
        idempotency_key: Some("objective-system-key".to_string()),
    };
    let objective = service.put_objective_run(&request).unwrap();
    let duplicate = service
        .put_objective_run(&PutObjectiveRun {
            id: Some("ignored_objective_id".to_string()),
            ..request.clone()
        })
        .unwrap();

    assert_eq!(objective.id, "objective_system");
    assert_eq!(duplicate.id, objective.id);
    assert_eq!(objective.state, "open");
    assert_eq!(objective.constraints.len(), 2);
    assert_eq!(objective.success_criteria, vec!["npm test passes"]);
    assert_eq!(objective.references.len(), 1);
    assert_eq!(
        objective.references[0].metadata,
        Some(json!({ "order": 1 }))
    );

    let duplicate_mismatch = service
        .put_objective_run(&PutObjectiveRun {
            objective: "different".to_string(),
            ..request.clone()
        })
        .unwrap_err();
    assert!(matches!(
        duplicate_mismatch,
        SystemServiceError::Invariant(_)
    ));

    let invalid_transition = service
        .record_objective_run_operation(&RecordObjectiveRunOperation {
            id: Some("objectiveop_invalid".to_string()),
            objective_id: objective.id.clone(),
            operation: "mark_succeeded".to_string(),
            actor_id: "user_objective".to_string(),
            reason: None,
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(
        invalid_transition,
        SystemServiceError::Invariant(_)
    ));

    let started = service
        .record_objective_run_operation(&RecordObjectiveRunOperation {
            id: Some("objectiveop_start".to_string()),
            objective_id: objective.id.clone(),
            operation: "start".to_string(),
            actor_id: "user_objective".to_string(),
            reason: Some("approved".to_string()),
            metadata: None,
        })
        .unwrap();
    assert_eq!(started.from_state, "open");
    assert_eq!(started.to_state, "running");

    let blocked = service
        .record_objective_run_operation(&RecordObjectiveRunOperation {
            id: Some("objectiveop_blocked".to_string()),
            objective_id: objective.id.clone(),
            operation: "record_blocked".to_string(),
            actor_id: "runtime_objective".to_string(),
            reason: Some("needs credentials".to_string()),
            metadata: Some(json!({ "source": "test" })),
        })
        .unwrap();
    assert_eq!(blocked.from_state, "running");
    assert_eq!(blocked.to_state, "blocked");

    let restarted = service
        .record_objective_run_operation(&RecordObjectiveRunOperation {
            id: Some("objectiveop_restart".to_string()),
            objective_id: objective.id.clone(),
            operation: "start".to_string(),
            actor_id: "user_objective".to_string(),
            reason: Some("credentials provided".to_string()),
            metadata: None,
        })
        .unwrap();
    assert_eq!(restarted.from_state, "blocked");
    assert_eq!(restarted.to_state, "running");

    let attempt = service
        .put_objective_attempt(&PutObjectiveAttempt {
            id: Some("objectiveatt_1".to_string()),
            objective_id: objective.id.clone(),
            attempt_number: Some(1),
            state: Some("succeeded".to_string()),
            session_id: Some("ses_objective".to_string()),
            session_input_id: Some("inp_objective".to_string()),
            session_turn_id: Some("turn_objective".to_string()),
            scheduler_job_id: Some("job_objective".to_string()),
            delegation_graph_id: None,
            plan_proposal_id: None,
            workspace_change_proposal_id: None,
            summary: Some("Verified LCP target".to_string()),
            result: Some(json!({ "lcpMs": 2300 })),
            error: None,
            metadata: Some(json!({ "attempt": 1 })),
            started_at: Some(100),
            finished_at: Some(200),
            idempotency_key: Some("objective-attempt-key".to_string()),
        })
        .unwrap();
    assert_eq!(attempt.attempt_number, 1);
    assert_eq!(attempt.state, "succeeded");

    let duplicate_attempt = service
        .put_objective_attempt(&PutObjectiveAttempt {
            id: Some("ignored_attempt".to_string()),
            objective_id: objective.id.clone(),
            attempt_number: Some(1),
            state: Some("succeeded".to_string()),
            session_id: Some("ses_objective".to_string()),
            session_input_id: Some("inp_objective".to_string()),
            session_turn_id: Some("turn_objective".to_string()),
            scheduler_job_id: Some("job_objective".to_string()),
            delegation_graph_id: None,
            plan_proposal_id: None,
            workspace_change_proposal_id: None,
            summary: Some("Verified LCP target".to_string()),
            result: Some(json!({ "lcpMs": 2300 })),
            error: None,
            metadata: Some(json!({ "attempt": 1 })),
            started_at: Some(100),
            finished_at: Some(200),
            idempotency_key: Some("objective-attempt-key".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_attempt.id, attempt.id);

    let verification = service
        .put_objective_verification(&PutObjectiveVerification {
            id: Some("objectivever_1".to_string()),
            objective_id: objective.id.clone(),
            attempt_id: Some(attempt.id.clone()),
            kind: "script".to_string(),
            state: "passed".to_string(),
            reason: Some("test command passed".to_string()),
            evidence: Some(json!({ "command": "npm test", "exitCode": 0 })),
            verifier_ref: Some("local-script".to_string()),
            metadata: None,
            idempotency_key: Some("objective-verification-key".to_string()),
        })
        .unwrap();
    assert_eq!(verification.state, "passed");

    let succeeded = service
        .record_objective_run_operation(&RecordObjectiveRunOperation {
            id: Some("objectiveop_succeeded".to_string()),
            objective_id: objective.id.clone(),
            operation: "mark_succeeded".to_string(),
            actor_id: "runtime_objective".to_string(),
            reason: Some("verification passed".to_string()),
            metadata: Some(json!({ "verificationId": verification.id })),
        })
        .unwrap();
    assert_eq!(succeeded.from_state, "running");
    assert_eq!(succeeded.to_state, "succeeded");

    let fetched = service.get_objective_run(&objective.id).unwrap().unwrap();
    assert_eq!(fetched.state, "succeeded");
    assert!(fetched.closed_at.is_some());

    let listed_by_reference = service
        .list_objective_runs(&ListObjectiveRuns {
            principal_id: None,
            state: Some("succeeded".to_string()),
            reference_kind: Some("session".to_string()),
            reference_id: Some("ses_objective".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(listed_by_reference.len(), 1);
    assert_eq!(listed_by_reference[0].id, objective.id);

    let operations = service
        .list_objective_run_operations(&ListObjectiveRunOperations {
            objective_id: objective.id.clone(),
        })
        .unwrap();
    assert_eq!(
        operations
            .iter()
            .map(|operation| operation.operation.as_str())
            .collect::<Vec<_>>(),
        vec!["start", "record_blocked", "start", "mark_succeeded"]
    );

    let attempts = service
        .list_objective_attempts(&ListObjectiveAttempts {
            objective_id: objective.id.clone(),
            state: Some("succeeded".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(attempts.len(), 1);
    assert_eq!(attempts[0].id, attempt.id);

    let verifications = service
        .list_objective_verifications(&ListObjectiveVerifications {
            objective_id: objective.id.clone(),
            attempt_id: Some(attempt.id),
            state: Some("passed".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(verifications.len(), 1);
    assert_eq!(verifications[0].id, "objectivever_1");

    let events = service
        .query_events(QueryEvents {
            session_id: None,
            plan_proposal_id: None,
            objective_id: Some(objective.id),
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    assert_eq!(
        events
            .iter()
            .map(|event| event.event_type.as_str())
            .collect::<Vec<_>>(),
        vec![
            "objective.run.created",
            "objective.run.operation_recorded",
            "objective.run.operation_recorded",
            "objective.run.operation_recorded",
            "objective.attempt.recorded",
            "objective.verification.recorded",
            "objective.run.operation_recorded"
        ]
    );
    assert!(events
        .iter()
        .all(|event| event.scope.objective_id.as_deref() == Some("objective_system")));
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
        parent_turn_id: None,
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
            attempt_id: recovered_started.attempt.id,
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
            session_id: submitted.turn.session_id,
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
            state: "running".to_string(),
            idempotency_key: "tool:recovery:call".to_string(),
        })
        .unwrap();
    let recovered_tool_attempt = recovered_tool.invocation_attempt.unwrap();
    assert_eq!(recovered_tool.execution.id, first_tool.execution.id);
    assert_eq!(recovered_tool.execution.attempt_count, 2);
    assert_ne!(recovered_tool_attempt.id, first_tool_attempt.id);

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
            result: Some(json!({"late": true})),
            is_error: Some(false),
            error: None,
        })
        .unwrap();
    assert!(late_old_finish.is_none());
    recovered_service
        .finish_tool_execution(&wanex_system_service::FinishToolExecution {
            session_id: submitted.turn.session_id,
            turn_id: submitted.turn.id,
            session_attempt_id: recovered_started.attempt.id,
            input_id: submitted.admission.input_id,
            job_id: recovered_job.id,
            worker_id: "worker_tool_new".to_string(),
            lease_token: recovered_job.lease_token.unwrap(),
            execution_id: first_tool.execution.id.clone(),
            invocation_attempt_id: recovered_tool_attempt.id,
            state: "succeeded".to_string(),
            result: Some(json!({"ok": true})),
            is_error: Some(false),
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
fn persists_team_conversation_participants_and_turns() {
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
            metadata: None,
            idempotency_key: Some("team-part-user".to_string()),
        })
        .unwrap();
    let agent = service
        .put_team_participant(&PutTeamParticipant {
            id: Some("team_part_agent".to_string()),
            conversation_id: conversation.id.clone(),
            principal_id: "agent_1".to_string(),
            kind: "agent".to_string(),
            display_name: Some("Agent".to_string()),
            role: Some("reviewer".to_string()),
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
            metadata: None,
            idempotency_key: Some("team-part-user".to_string()),
        })
        .unwrap();
    assert_eq!(duplicate_user.id, user.id);

    let first_turn = service
        .append_team_turn(&AppendTeamTurn {
            id: Some("team_turn_one".to_string()),
            conversation_id: conversation.id.clone(),
            speaker_participant_id: user.id.clone(),
            audience_participant_ids: Some(vec![agent.id.clone()]),
            kind: Some("message".to_string()),
            content: json!([
                { "type": "text", "id": "part_team_1", "text": "Please review this plan." }
            ]),
            metadata: Some(json!({ "source": "system-test" })),
        })
        .unwrap();
    assert_eq!(first_turn.id, "team_turn_one");
    assert_eq!(
        first_turn.audience_participant_ids.as_ref().unwrap(),
        &vec![agent.id.clone()]
    );

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

    let turns = service
        .list_team_turns(&ListTeamTurns {
            conversation_id: conversation.id.clone(),
            after_created_at: None,
            after_turn_id: None,
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(turns.len(), 1);
    assert_eq!(turns[0].content[0]["text"], "Please review this plan.");

    service
        .update_team_participant_state(&UpdateTeamParticipantState {
            participant_id: agent.id.clone(),
            state: "muted".to_string(),
        })
        .unwrap();
    let muted_speaker = service
        .append_team_turn(&AppendTeamTurn {
            id: None,
            conversation_id: conversation.id.clone(),
            speaker_participant_id: agent.id.clone(),
            audience_participant_ids: None,
            kind: None,
            content: json!([{ "type": "text", "id": "part_team_muted", "text": "Muted." }]),
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(muted_speaker, SystemServiceError::Invariant(_)));

    let closed = service
        .update_team_conversation_state(&UpdateTeamConversationState {
            conversation_id: conversation.id.clone(),
            state: "closed".to_string(),
        })
        .unwrap();
    assert!(closed.closed_at.is_some());
    let closed_turn = service
        .append_team_turn(&AppendTeamTurn {
            id: None,
            conversation_id: conversation.id,
            speaker_participant_id: user.id,
            audience_participant_ids: None,
            kind: None,
            content: json!([{ "type": "text", "id": "part_team_closed", "text": "Nope." }]),
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(closed_turn, SystemServiceError::Invariant(_)));
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

    let disabled_install = service
        .update_plugin_install_state(&UpdatePluginInstallState {
            plugin_id: "connector.telegram".to_string(),
            version: Some("1.0.0".to_string()),
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
            version: Some("1.0.0".to_string()),
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
            version: Some("1.0.0".to_string()),
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
            version: Some("1.0.0".to_string()),
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
            version: Some("1.0.0".to_string()),
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
            version: Some("1.0.0".to_string()),
            state: "disabled".to_string(),
        })
        .unwrap();
    assert_eq!(disabled.state, "disabled");
    assert!(disabled.disabled_at.is_some());

    let disabled_submission = service
        .submit_plugin_action(&SubmitPluginAction {
            plugin_id: "connector.telegram".to_string(),
            version: Some("1.0.0".to_string()),
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
            version: Some("1.0.0".to_string()),
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
            id: Some("chproj_team_turn".to_string()),
            inbound_event_id: team_inbound.id.clone(),
            target: json!({
                "kind": "team.turn",
                "conversationId": conversation.id,
                "speakerParticipantId": speaker.id,
                "turnId": "tturn_projection_team",
                "content": [{ "type": "text", "id": "part_projection_team", "text": "team hello" }],
                "metadata": { "source": "channel" }
            }),
            metadata: None,
            idempotency_key: Some("projection-team-key".to_string()),
        })
        .unwrap();
    assert_eq!(team_projection.projection.target_kind, "team.turn");
    assert_eq!(
        team_projection.projection.target_id.as_deref(),
        Some("tturn_projection_team")
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
                "taskId": "wtsk_projection",
                "workspaceId": "workspace_projection",
                "jobId": "job_projection_workspace",
                "metadata": { "prompt": "fix file" }
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
    assert_eq!(workspace_job.payload["metadata"]["prompt"], "fix file");

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

    let settled = service
        .settle_media_generation(&wanex_system_service::SettleMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-cancel-worker".to_string(),
            lease_token,
            outcome: "cancelled".to_string(),
            error: None,
            reason: Some("provider cancellation completed".to_string()),
        })
        .unwrap()
        .unwrap();
    assert_eq!(settled.state, "cancelled");
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
    let completed = service
        .complete_media_generation(&wanex_system_service::CompleteMediaGenerationOperation {
            operation_id: submitted.operation.id,
            worker_id: "media-complete-worker".to_string(),
            lease_token,
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

fn media_generation_binding(label: &str) -> serde_json::Value {
    json!({
        "profileId": format!("media-profile-{label}"),
        "profileDigest": format!("media-profile-digest-{label}"),
        "adapterId": "fake-media-adapter",
        "providerId": "fake-media-provider",
        "modelId": format!("fake-media-model-{label}"),
        "request": {
            "prompt": format!("media prompt {label}"),
            "outputModality": "image",
            "inputResources": [],
            "options": null
        },
        "requestDigest": format!("media-request-digest-{label}")
    })
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
