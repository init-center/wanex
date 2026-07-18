use std::sync::{Arc, Barrier};
use std::time::Duration;

use serde_json::json;
use tempfile::tempdir;
use wanex_system_service::{
    ActivateContextEpoch, AdmitSessionInput, AppendSessionMessage, AppendTeamTurn,
    ApplySessionRunControl, AttachDelegationGraphNodeJob, BudgetAmount, BudgetScopeKind,
    BudgetScopeRef, CancelRun, CleanupExpiredResourceTickets, CloneContextEpoch, CommitBudget,
    CompleteChannelDelivery, CompleteJob, DoctorCheckState, EnqueueJob, EventScope,
    FailChannelDelivery, FailJob, FailRun, FinishConnectorSession, GetActiveContextEpoch,
    GetPluginInstall, GetPluginManifest, HeartbeatConnectorSession, HeartbeatJob,
    IngestChannelInboundEvent, IngestResource, InterruptSessionRun, ListChannelBindings,
    ListChannelInboundEvents, ListChannelProjections, ListConnectorCredentials,
    ListConnectorSessions, ListContextEpochs, ListContextReplacements,
    ListDelegationGraphDependencies, ListDelegationGraphNodes, ListDelegationGraphs,
    ListObjectiveAttempts, ListObjectiveRunOperations, ListObjectiveRuns,
    ListObjectiveVerifications, ListPlanProposalOperations, ListPlanProposals, ListPluginInstalls,
    ListPluginManifests, ListReadyDelegationGraphNodes, ListResources, ListSessionRunControls,
    ListSessions, ListTeamConversations, ListTeamParticipants, ListTeamTurns,
    ListWorkspaceChangeOperations, ListWorkspaceChangeProposalOperations,
    ListWorkspaceChangeProposals, ListWorkspaceChangeSets, MaterializeReadyDelegationGraphNode,
    ObjectiveReferenceRecord, ProjectChannelInboundEvent, PruneContextEpochs, PutChannelBinding,
    PutConnectorCredential, PutConnectorRegistration, PutContextEpoch, PutContextReplacement,
    PutDelegationGraph, PutDelegationGraphDependency, PutDelegationGraphNode, PutObjectiveAttempt,
    PutObjectiveRun, PutObjectiveVerification, PutPlanProposal, PutPluginInstall,
    PutPluginManifest, PutTeamConversation, PutTeamParticipant, PutWorkspaceChangeProposal,
    PutWorkspaceChangeSet, QueryEvents, RecordBudgetUsage, RecordObjectiveRunOperation,
    RecordPlanProposalOperation, RecordWorkspaceChangeOperation,
    RecordWorkspaceChangeProposalOperation, ReserveBudget, ResourceCapability, ResourceSource,
    RetryPolicy, RetryStrategy, RevokeConnectorCredential, RuntimeEvent, SchedulerJobKind,
    StartConnectorSession, SteerSessionRun, SubmitChannelDelivery, SubmitPluginAction,
    SubmitSessionRun, SystemService, SystemServiceError, UpdateChannelInboundEventState,
    UpdateConnectorRegistrationState, UpdateDelegationGraphNodeState, UpdateDelegationGraphState,
    UpdatePluginInstallState, UpdatePluginManifestState, UpdateTeamConversationState,
    UpdateTeamParticipantState, CURRENT_SCHEMA_VERSION,
};

fn admit_input(
    id: Option<&str>,
    session_id: &str,
    principal_id: &str,
    idempotency_key: &str,
    input_type: &str,
    content: serde_json::Value,
) -> AdmitSessionInput {
    AdmitSessionInput {
        id: id.map(ToOwned::to_owned),
        session_id: session_id.to_string(),
        principal_id: principal_id.to_string(),
        idempotency_key: idempotency_key.to_string(),
        input_type: Some(input_type.to_string()),
        content,
        origin: None,
        intent: None,
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
        locked.pragma_update(None, "busy_timeout", 0).unwrap();
        let tx = locked.transaction().unwrap();
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
                run_id: None,
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
                run_id: None,
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
                    run_id: None,
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
            session_run_id: Some("run_objective".to_string()),
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
            session_run_id: Some("run_objective".to_string()),
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
fn admits_session_input_idempotently_and_claims_one_runner() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    let session = service
        .create_session(Some("ses_phase2"), Some("Phase 2"), Some("chat"))
        .unwrap();

    assert_eq!(session.id, "ses_phase2");
    assert_eq!(session.status, "active");

    let first = service
        .admit_session_input(&admit_input(
            Some("inp_phase2_a"),
            "ses_phase2",
            "user_1",
            "idem_1",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "hello" }]),
        ))
        .unwrap();
    let second = service
        .admit_session_input(&admit_input(
            Some("inp_phase2_b"),
            "ses_phase2",
            "user_1",
            "idem_1",
            "user",
            json!([{ "type": "text", "id": "part_2", "text": "duplicate" }]),
        ))
        .unwrap();

    assert_eq!(first.input_id, "inp_phase2_a");
    assert_eq!(second.input_id, "inp_phase2_a");

    let claim = service
        .claim_runner("ses_phase2", "runner_1", 60_000)
        .unwrap()
        .unwrap();
    assert_eq!(claim.input_id, "inp_phase2_a");
    assert!(service
        .claim_runner("ses_phase2", "runner_2", 60_000)
        .unwrap()
        .is_none());

    let inputs = service.list_session_inputs("ses_phase2").unwrap();
    assert_eq!(inputs.len(), 1);
    assert_eq!(inputs[0].origin, None);
    assert_eq!(inputs[0].intent, "normal");
    assert_eq!(inputs[0].run_control_policy, None);
    assert_eq!(inputs[0].expected_run_id, None);
    assert_eq!(inputs[0].status, "claimed");
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

    assert!(matches!(
        service.list_sessions(&ListSessions {
            kind: Some("invalid".to_string()),
            status: None,
            updated_before: None,
            updated_after: None,
            limit: Some(10),
        }),
        Err(SystemServiceError::InvalidJobRequest(_))
    ));
}

#[test]
fn submit_session_run_admits_input_and_enqueues_job_idempotently() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_submit"), Some("Submit"), Some("agent"))
        .unwrap();

    let first = service
        .submit_session_run(&SubmitSessionRun {
            id: Some("inp_submit".to_string()),
            session_id: "ses_submit".to_string(),
            principal_id: "user_submit".to_string(),
            idempotency_key: "idem_submit".to_string(),
            input_type: Some("user".to_string()),
            content: json!([{ "type": "text", "id": "part_submit", "text": "hello" }]),
            origin: Some(json!({ "kind": "interactive", "sourceRef": "test" })),
            intent: Some("follow_up".to_string()),
            run_control_policy: Some("queue_after_current".to_string()),
            expected_run_id: Some("run_expected_for_queue".to_string()),
            job_id: Some("job_submit".to_string()),
            job_idempotency_key: None,
            mode: Some("to_completion".to_string()),
            max_steps: Some(4),
            provider_profile_id: Some("fake-profile".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: Some(7),
            max_attempts: Some(2),
            retry_policy: Some(RetryPolicy {
                strategy: RetryStrategy::Fixed,
                initial_delay_ms: Some(10),
                max_delay_ms: Some(10),
            }),
            budget_grant_id: None,
        })
        .unwrap();
    let second = service
        .submit_session_run(&SubmitSessionRun {
            id: Some("inp_submit_duplicate".to_string()),
            session_id: "ses_submit".to_string(),
            principal_id: "user_submit".to_string(),
            idempotency_key: "idem_submit".to_string(),
            input_type: Some("user".to_string()),
            content: json!([{ "type": "text", "id": "part_duplicate", "text": "ignored" }]),
            origin: Some(json!({ "kind": "system", "sourceRef": "ignored" })),
            intent: Some("normal".to_string()),
            run_control_policy: None,
            expected_run_id: None,
            job_id: Some("job_submit_duplicate".to_string()),
            job_idempotency_key: None,
            mode: Some("to_completion".to_string()),
            max_steps: Some(4),
            provider_profile_id: Some("fake-profile".to_string()),
            scheduled_at: None,
            not_before: None,
            priority: Some(7),
            max_attempts: Some(2),
            retry_policy: None,
            budget_grant_id: None,
        })
        .unwrap();

    assert_eq!(first.admission.input_id, "inp_submit");
    assert_eq!(second.admission.input_id, "inp_submit");
    assert_eq!(first.job.id, "job_submit");
    assert_eq!(second.job.id, "job_submit");
    assert_eq!(first.job.kind, "session.run");
    assert_eq!(first.job.principal_id, "user_submit");
    assert_eq!(
        first.job.payload,
        json!({
            "sessionId": "ses_submit",
            "mode": "to_completion",
            "maxSteps": 4,
            "providerProfileId": "fake-profile"
        })
    );
    assert_eq!(
        first.job.idempotency_key.as_deref(),
        Some("session.run:ses_submit:inp_submit")
    );

    let inputs = service.list_session_inputs("ses_submit").unwrap();
    assert_eq!(inputs.len(), 1);
    assert_eq!(
        inputs[0].origin,
        Some(json!({ "kind": "interactive", "sourceRef": "test" }))
    );
    assert_eq!(inputs[0].intent, "follow_up");
    assert_eq!(
        inputs[0].run_control_policy.as_deref(),
        Some("queue_after_current")
    );
    assert_eq!(
        inputs[0].expected_run_id.as_deref(),
        Some("run_expected_for_queue")
    );
    let jobs = service
        .list_jobs(&wanex_system_service::ListJobs {
            state: Some("ready".to_string()),
            kind: Some("session.run".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(jobs.len(), 1);

    let events = service
        .query_events(QueryEvents {
            session_id: Some("ses_submit".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == "session.run.submitted"));
}

#[test]
fn expired_runner_lease_can_be_reclaimed_and_completed() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_lease"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_lease"),
            "ses_lease",
            "user_1",
            "idem_lease",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "recover" }]),
        ))
        .unwrap();

    let first = service
        .claim_runner("ses_lease", "runner_old", -1)
        .unwrap()
        .unwrap();
    assert_eq!(first.runner_id, "runner_old");

    let second = service
        .claim_runner("ses_lease", "runner_new", 60_000)
        .unwrap()
        .unwrap();
    assert_eq!(second.runner_id, "runner_new");
    assert_ne!(first.lease_token, second.lease_token);

    let heartbeat = service
        .heartbeat_runner("ses_lease", "runner_new", &second.lease_token, 60_000)
        .unwrap()
        .unwrap();
    assert_eq!(heartbeat.runner_id, "runner_new");
    assert!(heartbeat.lease_expires_at >= second.lease_expires_at);

    assert!(service
        .complete_run(
            "ses_lease",
            &second.run_id,
            &second.input_id,
            "runner_new",
            &second.lease_token,
            Some(&json!([{ "type": "text", "id": "part_reply", "text": "done" }])),
        )
        .unwrap());

    let inputs = service.list_session_inputs("ses_lease").unwrap();
    assert_eq!(inputs[0].status, "completed");
    assert!(!service
        .release_runner("ses_lease", "runner_new", &second.lease_token)
        .unwrap());
}

#[test]
fn appends_session_message_only_for_active_runner_lease() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_tool"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_tool"),
            "ses_tool",
            "user_1",
            "idem_tool",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "use tool" }]),
        ))
        .unwrap();

    let claim = service
        .claim_runner("ses_tool", "runner_tool", 60_000)
        .unwrap()
        .unwrap();

    let rejected = service
        .append_session_message(
            &AppendSessionMessage {
                session_id: "ses_tool".to_string(),
                run_id: claim.run_id.clone(),
                input_id: claim.input_id.clone(),
                runner_id: "runner_tool".to_string(),
                lease_token: "bad_lease".to_string(),
                idempotency_key: "message_bad_lease".to_string(),
                role: "tool".to_string(),
                content: json!([{ "type": "tool_result", "id": "part_bad", "toolCallId": "call_1", "result": {}, "isError": true }]),
            },
        )
        .unwrap();
    assert!(rejected.is_none());

    let appended = service
        .append_session_message(
            &AppendSessionMessage {
                session_id: "ses_tool".to_string(),
                run_id: claim.run_id.clone(),
                input_id: claim.input_id.clone(),
                runner_id: "runner_tool".to_string(),
                lease_token: claim.lease_token.clone(),
                idempotency_key: "message_tool_result".to_string(),
                role: "tool".to_string(),
                content: json!([{ "type": "tool_result", "id": "part_result", "toolCallId": "call_1", "result": { "ok": true }, "isError": false }]),
            },
        )
        .unwrap()
        .unwrap();

    assert_eq!(appended.role, "tool");
    let messages = service.list_session_messages("ses_tool").unwrap();
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].id, appended.id);
}

#[test]
fn fails_run_only_for_active_runner_lease() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_fail"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_fail"),
            "ses_fail",
            "user_1",
            "idem_fail",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "fail" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_fail", "runner_fail", 60_000)
        .unwrap()
        .unwrap();

    let rejected = service
        .fail_run(&FailRun {
            session_id: "ses_fail".to_string(),
            run_id: claim.run_id.clone(),
            input_id: claim.input_id.clone(),
            runner_id: "runner_fail".to_string(),
            lease_token: "bad_lease".to_string(),
            error: json!({ "message": "wrong lease" }),
        })
        .unwrap();
    assert!(!rejected);

    let failed = service
        .fail_run(&FailRun {
            session_id: "ses_fail".to_string(),
            run_id: claim.run_id,
            input_id: claim.input_id,
            runner_id: "runner_fail".to_string(),
            lease_token: claim.lease_token,
            error: json!({ "message": "provider failed" }),
        })
        .unwrap();
    assert!(failed);

    let inputs = service.list_session_inputs("ses_fail").unwrap();
    assert_eq!(inputs[0].status, "failed");
    assert!(service
        .claim_runner("ses_fail", "runner_next", 60_000)
        .unwrap()
        .is_none());
}

#[test]
fn emits_session_run_and_message_events_transactionally() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_events"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_events"),
            "ses_events",
            "user_1",
            "idem_events",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "events" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_events", "runner_events", 60_000)
        .unwrap()
        .unwrap();
    service
        .complete_run(
            "ses_events",
            &claim.run_id,
            &claim.input_id,
            &claim.runner_id,
            &claim.lease_token,
            Some(&json!([{ "type": "text", "id": "part_reply", "text": "done" }])),
        )
        .unwrap();

    let events = service
        .query_events(QueryEvents {
            session_id: Some("ses_events".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    let event_types: Vec<&str> = events
        .iter()
        .map(|event| event.event_type.as_str())
        .collect();

    assert_eq!(
        event_types,
        vec![
            "session.created",
            "session.input.admitted",
            "session.run.claimed",
            "session.message.appended",
            "session.run.completed"
        ]
    );
    assert_eq!(events[2].scope.run_id, Some(claim.run_id));
    assert_eq!(events[4].payload["status"], "completed");
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
            reason: "agent.run".to_string(),
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
            reason: "agent.run".to_string(),
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
            reason: "agent.run".to_string(),
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
            reason: "agent.run".to_string(),
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
fn cancels_running_run_and_invalidates_lease() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_cancel"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_cancel"),
            "ses_cancel",
            "user_1",
            "idem_cancel",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "cancel" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_cancel", "runner_cancel", 60_000)
        .unwrap()
        .unwrap();

    assert!(service
        .cancel_run(&CancelRun {
            session_id: "ses_cancel".to_string(),
            run_id: claim.run_id.clone(),
            input_id: claim.input_id.clone(),
            reason: "user requested stop".to_string(),
        })
        .unwrap());
    assert!(!service
        .complete_run(
            "ses_cancel",
            &claim.run_id,
            &claim.input_id,
            &claim.runner_id,
            &claim.lease_token,
            Some(&json!([{ "type": "text", "id": "part_reply", "text": "late" }])),
        )
        .unwrap());

    let inputs = service.list_session_inputs("ses_cancel").unwrap();
    assert_eq!(inputs[0].status, "cancelled");
    assert!(service
        .claim_runner("ses_cancel", "runner_next", 60_000)
        .unwrap()
        .is_none());

    let events = service
        .query_events(QueryEvents {
            session_id: Some("ses_cancel".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == "session.run.cancelled"));
}

#[test]
fn interrupt_session_run_is_idempotent_and_does_not_cancel_by_itself() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_interrupt"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_interrupt"),
            "ses_interrupt",
            "user_1",
            "idem_interrupt_input",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "long task" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_interrupt", "runner_interrupt", 60_000)
        .unwrap()
        .unwrap();

    let first = service
        .interrupt_session_run(&InterruptSessionRun {
            session_id: "ses_interrupt".to_string(),
            run_id: claim.run_id.clone(),
            reason: "user requested stop".to_string(),
            principal_id: Some("user_1".to_string()),
            idempotency_key: Some("idem_interrupt".to_string()),
            origin: Some(json!({ "kind": "interactive" })),
            metadata: Some(json!({ "source": "test" })),
        })
        .unwrap();
    let duplicate = service
        .interrupt_session_run(&InterruptSessionRun {
            session_id: "ses_interrupt".to_string(),
            run_id: claim.run_id.clone(),
            reason: "duplicate should not overwrite".to_string(),
            principal_id: Some("user_1".to_string()),
            idempotency_key: Some("idem_interrupt".to_string()),
            origin: None,
            metadata: None,
        })
        .unwrap();

    assert_eq!(first.status, "interrupt_requested");
    assert_eq!(duplicate.status, "interrupt_requested");
    assert_eq!(duplicate.accepted_at, first.accepted_at);

    let controls = service
        .list_session_run_controls(&ListSessionRunControls {
            session_id: "ses_interrupt".to_string(),
            run_id: Some(claim.run_id.clone()),
            kind: Some("interrupt".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(controls.len(), 1);
    assert_eq!(controls[0].reason.as_deref(), Some("user requested stop"));
    assert_eq!(controls[0].origin, Some(json!({ "kind": "interactive" })));

    assert!(service
        .complete_run(
            "ses_interrupt",
            &claim.run_id,
            &claim.input_id,
            &claim.runner_id,
            &claim.lease_token,
            Some(&json!([{ "type": "text", "id": "part_reply", "text": "safe boundary later" }])),
        )
        .unwrap());

    let events = service
        .query_events(QueryEvents {
            session_id: Some("ses_interrupt".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(20),
        })
        .unwrap();
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "session.run.interrupt_requested")
            .count(),
        1
    );
}

#[test]
fn steer_session_run_requires_active_expected_run_and_records_control_input() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_steer"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_steer_base"),
            "ses_steer",
            "user_1",
            "idem_steer_base",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "draft" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_steer", "runner_steer", 60_000)
        .unwrap()
        .unwrap();

    let rejected = service
        .steer_session_run(&SteerSessionRun {
            session_id: "ses_steer".to_string(),
            principal_id: "user_1".to_string(),
            expected_run_id: "run_wrong".to_string(),
            idempotency_key: "idem_steer_rejected".to_string(),
            content: json!([{ "type": "text", "id": "part_bad", "text": "wrong run" }]),
            origin: Some(json!({ "kind": "interactive" })),
            provider_profile_id: None,
            metadata: None,
        })
        .unwrap_err();
    assert!(matches!(rejected, SystemServiceError::InvalidJobRequest(_)));

    let first = service
        .steer_session_run(&SteerSessionRun {
            session_id: "ses_steer".to_string(),
            principal_id: "user_1".to_string(),
            expected_run_id: claim.run_id.clone(),
            idempotency_key: "idem_steer".to_string(),
            content: json!([{ "type": "text", "id": "part_steer", "text": "make it shorter" }]),
            origin: Some(json!({ "kind": "interactive", "sourceRef": "test" })),
            provider_profile_id: Some("fake-profile".to_string()),
            metadata: Some(json!({ "tone": "concise" })),
        })
        .unwrap();
    let duplicate = service
        .steer_session_run(&SteerSessionRun {
            session_id: "ses_steer".to_string(),
            principal_id: "user_1".to_string(),
            expected_run_id: claim.run_id.clone(),
            idempotency_key: "idem_steer".to_string(),
            content: json!([{ "type": "text", "id": "part_duplicate", "text": "ignored" }]),
            origin: None,
            provider_profile_id: None,
            metadata: None,
        })
        .unwrap();

    assert_eq!(first.status, "accepted");
    assert_eq!(duplicate.accepted_at, first.accepted_at);

    let controls = service
        .list_session_run_controls(&ListSessionRunControls {
            session_id: "ses_steer".to_string(),
            run_id: Some(claim.run_id.clone()),
            kind: Some("steer".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(controls.len(), 1);
    assert_eq!(
        controls[0].content.as_ref().unwrap()[0]["text"],
        "make it shorter"
    );
    assert_eq!(
        controls[0].provider_profile_id.as_deref(),
        Some("fake-profile")
    );
    assert_eq!(controls[0].metadata, Some(json!({ "tone": "concise" })));

    let inputs = service.list_session_inputs("ses_steer").unwrap();
    let steer_input = inputs
        .iter()
        .find(|input| input.intent == "steer")
        .expect("steer input should be persisted");
    assert_eq!(steer_input.status, "control_pending");
    assert_eq!(
        steer_input.run_control_policy.as_deref(),
        Some("steer_at_safe_point")
    );
    assert_eq!(
        steer_input.expected_run_id.as_deref(),
        Some(claim.run_id.as_str())
    );
    assert_eq!(steer_input.content[0]["text"], "make it shorter");

    let events = service
        .query_events(QueryEvents {
            session_id: Some("ses_steer".to_string()),
            plan_proposal_id: None,
            objective_id: None,
            after_occurred_at: None,
            after_event_id: None,
            limit: Some(30),
        })
        .unwrap();
    assert!(events
        .iter()
        .any(|event| event.event_type == "session.run.steer_rejected"));
    assert_eq!(
        events
            .iter()
            .filter(|event| event.event_type == "session.run.steer_admitted")
            .count(),
        1
    );
}

#[test]
fn apply_steer_run_control_completes_control_input_without_requeueing() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_apply_steer"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_apply_steer_base"),
            "ses_apply_steer",
            "user_1",
            "idem_apply_steer_base",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "draft" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_apply_steer", "runner_apply_steer", 60_000)
        .unwrap()
        .unwrap();
    service
        .steer_session_run(&SteerSessionRun {
            session_id: "ses_apply_steer".to_string(),
            principal_id: "user_1".to_string(),
            expected_run_id: claim.run_id.clone(),
            idempotency_key: "idem_apply_steer".to_string(),
            content: json!([{ "type": "text", "id": "part_steer", "text": "focus tests" }]),
            origin: Some(json!({ "kind": "interactive" })),
            provider_profile_id: None,
            metadata: None,
        })
        .unwrap();
    let control = service
        .list_session_run_controls(&ListSessionRunControls {
            session_id: "ses_apply_steer".to_string(),
            run_id: Some(claim.run_id.clone()),
            kind: Some("steer".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap()
        .pop()
        .unwrap();

    assert!(service
        .apply_session_run_control(&ApplySessionRunControl {
            session_id: "ses_apply_steer".to_string(),
            run_id: claim.run_id.clone(),
            control_id: control.id.clone(),
            runner_id: "wrong_runner".to_string(),
            lease_token: claim.lease_token.clone(),
        })
        .unwrap()
        .is_none());

    let applied = service
        .apply_session_run_control(&ApplySessionRunControl {
            session_id: "ses_apply_steer".to_string(),
            run_id: claim.run_id.clone(),
            control_id: control.id.clone(),
            runner_id: claim.runner_id.clone(),
            lease_token: claim.lease_token.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(applied.effect, "steer_completed_input");
    assert_eq!(applied.control.status, "applied");
    assert!(applied.control.applied_at.is_some());

    let inputs = service.list_session_inputs("ses_apply_steer").unwrap();
    let steer_input = inputs
        .iter()
        .find(|input| input.intent == "steer")
        .expect("steer input should exist");
    assert_eq!(steer_input.status, "completed");

    assert!(service
        .complete_run(
            "ses_apply_steer",
            &claim.run_id,
            &claim.input_id,
            &claim.runner_id,
            &claim.lease_token,
            Some(&json!([{ "type": "text", "id": "part_reply", "text": "done" }])),
        )
        .unwrap());
    assert!(service
        .claim_runner("ses_apply_steer", "runner_next", 60_000)
        .unwrap()
        .is_none());
}

#[test]
fn apply_interrupt_run_control_cancels_run_and_pending_sibling_controls() {
    let dir = tempdir().unwrap();
    let service = SystemService::open(dir.path()).unwrap();
    service
        .create_session(Some("ses_apply_interrupt"), None, None)
        .unwrap();
    service
        .admit_session_input(&admit_input(
            Some("inp_apply_interrupt_base"),
            "ses_apply_interrupt",
            "user_1",
            "idem_apply_interrupt_base",
            "user",
            json!([{ "type": "text", "id": "part_1", "text": "long task" }]),
        ))
        .unwrap();
    let claim = service
        .claim_runner("ses_apply_interrupt", "runner_apply_interrupt", 60_000)
        .unwrap()
        .unwrap();
    service
        .steer_session_run(&SteerSessionRun {
            session_id: "ses_apply_interrupt".to_string(),
            principal_id: "user_1".to_string(),
            expected_run_id: claim.run_id.clone(),
            idempotency_key: "idem_apply_interrupt_steer".to_string(),
            content: json!([{ "type": "text", "id": "part_steer", "text": "new direction" }]),
            origin: None,
            provider_profile_id: None,
            metadata: None,
        })
        .unwrap();
    service
        .interrupt_session_run(&InterruptSessionRun {
            session_id: "ses_apply_interrupt".to_string(),
            run_id: claim.run_id.clone(),
            reason: "stop now".to_string(),
            principal_id: Some("user_1".to_string()),
            idempotency_key: Some("idem_apply_interrupt".to_string()),
            origin: None,
            metadata: None,
        })
        .unwrap();
    let interrupt = service
        .list_session_run_controls(&ListSessionRunControls {
            session_id: "ses_apply_interrupt".to_string(),
            run_id: Some(claim.run_id.clone()),
            kind: Some("interrupt".to_string()),
            status: Some("pending".to_string()),
            limit: Some(10),
        })
        .unwrap()
        .pop()
        .unwrap();

    let applied = service
        .apply_session_run_control(&ApplySessionRunControl {
            session_id: "ses_apply_interrupt".to_string(),
            run_id: claim.run_id.clone(),
            control_id: interrupt.id.clone(),
            runner_id: claim.runner_id.clone(),
            lease_token: claim.lease_token.clone(),
        })
        .unwrap()
        .unwrap();
    assert_eq!(applied.effect, "interrupt_cancelled_run");
    assert_eq!(applied.control.status, "applied");

    assert!(!service
        .complete_run(
            "ses_apply_interrupt",
            &claim.run_id,
            &claim.input_id,
            &claim.runner_id,
            &claim.lease_token,
            Some(&json!([{ "type": "text", "id": "part_reply", "text": "late" }])),
        )
        .unwrap());

    let inputs = service.list_session_inputs("ses_apply_interrupt").unwrap();
    assert_eq!(
        inputs
            .iter()
            .find(|input| input.id == claim.input_id)
            .unwrap()
            .status,
        "cancelled"
    );
    assert_eq!(
        inputs
            .iter()
            .find(|input| input.intent == "steer")
            .unwrap()
            .status,
        "cancelled"
    );
    let cancelled_controls = service
        .list_session_run_controls(&ListSessionRunControls {
            session_id: "ses_apply_interrupt".to_string(),
            run_id: Some(claim.run_id.clone()),
            kind: Some("steer".to_string()),
            status: Some("cancelled".to_string()),
            limit: Some(10),
        })
        .unwrap();
    assert_eq!(cancelled_controls.len(), 1);
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
            job_kind: SchedulerJobKind::SessionRun,
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
    assert_eq!(first.job.kind, "session.run");
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
            job_kind: SchedulerJobKind::SessionRun,
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
            id: Some("chproj_session_run".to_string()),
            inbound_event_id: session_inbound.id.clone(),
            target: json!({
                "kind": "session.run",
                "sessionId": "ses_projection",
                "principalId": "principal_projection",
                "content": [{ "type": "text", "id": "part_projection_session", "text": "run this" }],
                "inputId": "inp_projection_session",
                "jobId": "job_projection_session",
                "mode": "once",
                "maxSteps": 3
            }),
            metadata: Some(json!({ "source": "channel" })),
            idempotency_key: Some("projection-session-key".to_string()),
        })
        .unwrap();
    assert_eq!(session_projection.projection.target_kind, "session.run");
    assert_eq!(
        session_projection.projection.target_id.as_deref(),
        Some("inp_projection_session")
    );
    assert_eq!(
        session_projection.projection.target_job_id.as_deref(),
        Some("job_projection_session")
    );
    assert_eq!(session_projection.job.unwrap().kind, "session.run");
    let duplicate_session_projection = service
        .project_channel_inbound_event(&ProjectChannelInboundEvent {
            id: Some("ignored_projection_id".to_string()),
            inbound_event_id: session_inbound.id.clone(),
            target: json!({
                "kind": "session.run",
                "sessionId": "ses_projection",
                "principalId": "principal_projection",
                "content": [{ "type": "text", "id": "ignored", "text": "ignored" }]
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
