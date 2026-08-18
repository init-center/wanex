use crate::{
    BudgetAmount, BudgetGrantRecord, BudgetScopeRecord, BudgetUsageEntryRecord,
    ChannelBindingRecord, ChannelDeliveryRecord, ChannelInboundEventRecord,
    ChannelProjectionRecord, ConnectorCredentialRecord, ConnectorRegistrationRecord,
    ConnectorSessionRecord, ContextEpochRecord, DelegationGraphDependencyRecord,
    DelegationGraphNodeRecord, DelegationGraphRecord, EventScope, MediaGenerationOperationRecord,
    ObjectiveAttemptRecord, ObjectiveAttemptReviewRecord, ObjectiveRecord, ObjectiveStateReason,
    ObjectiveVerificationRecord, PlanProposalContentRecord, PlanProposalExecutionBindingRecord,
    PlanProposalGenerationRecord, PlanProposalOperationRecord, PlanProposalRecord,
    PlanProposalReferenceRecord, PlanProposalSourceRecord, PluginInstallRecord,
    PluginManifestRecord, ProviderInvocationRecord, ResourceRecord, ResourceSource, Result,
    RuntimeEvent, SchedulerJobRecord, SessionAttemptRecord, SessionInputRecord,
    SessionMessageRecord, SessionRecord, SessionTurnControlRecord, SessionTurnRecord,
    TeamConversationRecord, TeamDelegationOperationRecord, TeamDelegationTaskRecord,
    TeamDeliveryRecord, TeamDiscussionRoundRecord, TeamMessageRecord, TeamParticipantRecord,
    TeamRoutingDecisionRecord, ToolExecutionAttemptRecord, ToolExecutionRecord,
    WorkspaceChangeOperationRecord, WorkspaceChangeProposalOperationRecord,
    WorkspaceChangeProposalRecord, WorkspaceChangeSetRecord,
};

pub(crate) fn row_to_event(row: &rusqlite::Row<'_>) -> rusqlite::Result<RuntimeEvent> {
    let payload_json: String = row.get(10)?;
    let payload = serde_json::from_str(&payload_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(10, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(RuntimeEvent {
        id: row.get(0)?,
        event_type: row.get(1)?,
        scope: EventScope {
            session_id: row.get(2)?,
            turn_id: row.get(3)?,
            attempt_id: row.get(4)?,
            input_id: row.get(5)?,
            message_id: row.get(6)?,
            resource_id: row.get(7)?,
            plan_proposal_id: row.get(8)?,
            objective_id: row.get(9)?,
        },
        payload,
        occurred_at: row.get(11)?,
    })
}

pub(crate) fn row_to_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionRecord> {
    Ok(SessionRecord {
        id: row.get(0)?,
        title: row.get(1)?,
        kind: row.get(2)?,
        status: row.get(3)?,
        revision: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        archived_at: row.get(7)?,
    })
}

pub(crate) fn row_to_session_input(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SessionInputRecord> {
    let content_json: String = row.get(5)?;
    let origin_json: Option<String> = row.get(6)?;
    let content = json_from_column(&content_json, 5)?;
    let origin = origin_json
        .map(|raw| json_from_column(&raw, 6))
        .transpose()?;
    Ok(SessionInputRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        principal_id: row.get(2)?,
        idempotency_key: row.get(3)?,
        input_type: row.get(4)?,
        content,
        origin,
        intent: row.get(7)?,
        run_control_policy: row.get(8)?,
        expected_turn_id: row.get(9)?,
        status: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub(crate) fn row_to_session_turn_control(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SessionTurnControlRecord> {
    let content_json: Option<String> = row.get(9)?;
    let origin_json: Option<String> = row.get(11)?;
    let metadata_json: Option<String> = row.get(12)?;
    let content = content_json
        .map(|raw| json_from_column(&raw, 9))
        .transpose()?;
    let origin = origin_json
        .map(|raw| json_from_column(&raw, 11))
        .transpose()?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 12))
        .transpose()?;
    Ok(SessionTurnControlRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        turn_id: row.get(2)?,
        attempt_id: row.get(3)?,
        input_id: row.get(4)?,
        principal_id: row.get(5)?,
        idempotency_key: row.get(6)?,
        kind: row.get(7)?,
        status: row.get(8)?,
        content,
        reason: row.get(10)?,
        origin,
        metadata,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        applied_at: row.get(15)?,
    })
}

pub(crate) fn row_to_session_message(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SessionMessageRecord> {
    let content_json: String = row.get(8)?;
    let provider_state_json: Option<String> = row.get(9)?;
    let content = serde_json::from_str(&content_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(8, rusqlite::types::Type::Text, Box::new(error))
    })?;
    let provider_state = provider_state_json
        .map(|raw| {
            serde_json::from_str(&raw).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    9,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    Ok(SessionMessageRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        sequence: row.get(2)?,
        turn_id: row.get(3)?,
        attempt_id: row.get(4)?,
        input_id: row.get(5)?,
        role: row.get(6)?,
        status: row.get(7)?,
        content,
        provider_state,
        execution_binding_digest: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

pub(crate) fn row_to_session_turn(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionTurnRecord> {
    let execution_binding_json: String = row.get(5)?;
    let result_json: Option<String> = row.get(12)?;
    let error_json: Option<String> = row.get(13)?;
    Ok(SessionTurnRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        primary_input_id: row.get(2)?,
        job_id: row.get(3)?,
        state: row.get(4)?,
        execution_binding: json_from_column(&execution_binding_json, 5)?,
        execution_binding_digest: row.get(6)?,
        max_steps: row.get(7)?,
        current_attempt_id: row.get(8)?,
        regenerates_turn_id: row.get(9)?,
        cancel_requested_at: row.get(10)?,
        cancel_reason: row.get(11)?,
        result: result_json
            .map(|raw| json_from_column(&raw, 12))
            .transpose()?,
        error: error_json
            .map(|raw| json_from_column(&raw, 13))
            .transpose()?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        finished_at: row.get(16)?,
    })
}

pub(crate) fn row_to_session_attempt(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SessionAttemptRecord> {
    let error_json: Option<String> = row.get(9)?;
    Ok(SessionAttemptRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        turn_id: row.get(2)?,
        input_id: row.get(3)?,
        job_id: row.get(4)?,
        attempt_number: row.get(5)?,
        worker_id: row.get(6)?,
        lease_token: row.get(7)?,
        state: row.get(8)?,
        error: error_json
            .map(|raw| json_from_column(&raw, 9))
            .transpose()?,
        started_at: row.get(10)?,
        updated_at: row.get(11)?,
        finished_at: row.get(12)?,
    })
}

pub(crate) fn row_to_provider_invocation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ProviderInvocationRecord> {
    let error_json: Option<String> = row.get(14)?;
    Ok(ProviderInvocationRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        turn_id: row.get(2)?,
        attempt_id: row.get(3)?,
        input_id: row.get(4)?,
        job_id: row.get(5)?,
        step: row.get(6)?,
        invocation_number: row.get(7)?,
        execution_binding_digest: row.get(8)?,
        request_digest: row.get(9)?,
        state: row.get(10)?,
        output_observed: row.get(11)?,
        provider_request_id: row.get(12)?,
        assistant_message_id: row.get(13)?,
        error: error_json
            .map(|raw| json_from_column(&raw, 14))
            .transpose()?,
        started_at: row.get(15)?,
        updated_at: row.get(16)?,
        finished_at: row.get(17)?,
    })
}

pub(crate) fn row_to_media_generation_operation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<MediaGenerationOperationRecord> {
    let session_id: Option<String> = row.get(4)?;
    let turn_id: Option<String> = row.get(5)?;
    let source_message_id: Option<String> = row.get(6)?;
    let tool_execution_id: Option<String> = row.get(7)?;
    let tool_call_id: Option<String> = row.get(8)?;
    let conversation = match (
        session_id,
        turn_id,
        source_message_id,
        tool_execution_id,
        tool_call_id,
    ) {
        (None, None, None, None, None) => None,
        (
            Some(session_id),
            Some(turn_id),
            Some(source_message_id),
            Some(tool_execution_id),
            Some(tool_call_id),
        ) => Some(crate::MediaGenerationConversationRelation {
            session_id,
            turn_id,
            source_message_id,
            tool_execution_id,
            tool_call_id,
        }),
        _ => {
            return Err(rusqlite::Error::FromSqlConversionFailure(
                4,
                rusqlite::types::Type::Text,
                "partial media generation conversation relation".into(),
            ));
        }
    };
    let binding_json: String = row.get(10)?;
    let checkpoint_json: Option<String> = row.get(13)?;
    let last_poll_error_json: Option<String> = row.get(17)?;
    let references_json: String = row.get(18)?;
    let resource_ids_json: String = row.get(19)?;
    let progress_json: Option<String> = row.get(20)?;
    let error_json: Option<String> = row.get(21)?;
    Ok(MediaGenerationOperationRecord {
        id: row.get(0)?,
        job_id: row.get(1)?,
        principal_id: row.get(2)?,
        idempotency_key: row.get(3)?,
        conversation,
        state: row.get(9)?,
        binding: json_from_column(&binding_json, 10)?,
        dispatch_attempt: row.get(11)?,
        external_operation_id: row.get(12)?,
        provider_checkpoint: checkpoint_json
            .map(|raw| json_from_column(&raw, 13))
            .transpose()?,
        poll_count: row.get(14)?,
        consecutive_poll_failures: row.get(15)?,
        next_poll_at: row.get(16)?,
        last_poll_error: last_poll_error_json
            .map(|raw| json_from_column(&raw, 17))
            .transpose()?,
        output_references: json_from_column(&references_json, 18)?,
        output_resource_ids: json_from_column(&resource_ids_json, 19)?,
        progress: progress_json
            .map(|raw| json_from_column(&raw, 20))
            .transpose()?,
        error: error_json
            .map(|raw| json_from_column(&raw, 21))
            .transpose()?,
        cancel_requested_at: row.get(22)?,
        cancel_reason: row.get(23)?,
        created_at: row.get(24)?,
        updated_at: row.get(25)?,
        finished_at: row.get(26)?,
    })
}

pub(crate) fn row_to_context_epoch(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ContextEpochRecord> {
    let policy_json: String = row.get(16)?;
    let model_endpoint_json: String = row.get(18)?;
    let usage_json: Option<String> = row.get(22)?;
    let error_json: Option<String> = row.get(23)?;
    Ok(ContextEpochRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        job_id: row.get(2)?,
        state: row.get(3)?,
        generation_state: row.get(4)?,
        generation_attempt: row.get(5)?,
        max_provider_attempts: row.get(6)?,
        previous_epoch_id: row.get(7)?,
        previous_summary_digest: row.get(8)?,
        source_head_sequence: row.get(9)?,
        source_head_message_id: row.get(10)?,
        cut_sequence: row.get(11)?,
        cut_message_id: row.get(12)?,
        retained_from_sequence: row.get(13)?,
        retained_from_message_id: row.get(14)?,
        source_digest: row.get(15)?,
        policy: json_from_column(&policy_json, 16)?,
        policy_digest: row.get(17)?,
        model_endpoint: json_from_column(&model_endpoint_json, 18)?,
        request_digest: row.get(19)?,
        summary: row.get(20)?,
        summary_digest: row.get(21)?,
        usage: usage_json
            .map(|raw| json_from_column(&raw, 22))
            .transpose()?,
        error: error_json
            .map(|raw| json_from_column(&raw, 23))
            .transpose()?,
        token_estimate_before: row.get(24)?,
        token_estimate_after: row.get(25)?,
        token_savings: row.get(26)?,
        created_at: row.get(27)?,
        activated_at: row.get(28)?,
        finished_at: row.get(29)?,
        updated_at: row.get(30)?,
    })
}

pub(crate) fn row_to_workspace_changeset(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkspaceChangeSetRecord> {
    let changeset_json: String = row.get(5)?;
    let changeset = json_from_column(&changeset_json, 5)?;
    Ok(WorkspaceChangeSetRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        principal_id: row.get(2)?,
        title: row.get(3)?,
        base_revision: row.get(4)?,
        changeset,
        current_state: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub(crate) fn row_to_workspace_change_operation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkspaceChangeOperationRecord> {
    let receipt_json: String = row.get(4)?;
    let receipt = json_from_column(&receipt_json, 4)?;
    Ok(WorkspaceChangeOperationRecord {
        id: row.get(0)?,
        changeset_id: row.get(1)?,
        operation: row.get(2)?,
        status: row.get(3)?,
        receipt,
        created_at: row.get(5)?,
    })
}

pub(crate) fn row_to_workspace_change_proposal(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkspaceChangeProposalRecord> {
    let metadata_json: Option<String> = row.get(7)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    Ok(WorkspaceChangeProposalRecord {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        changeset_id: row.get(2)?,
        principal_id: row.get(3)?,
        title: row.get(4)?,
        summary: row.get(5)?,
        state: row.get(6)?,
        metadata,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        closed_at: row.get(10)?,
    })
}

pub(crate) fn row_to_workspace_change_proposal_operation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<WorkspaceChangeProposalOperationRecord> {
    let metadata_json: Option<String> = row.get(7)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    Ok(WorkspaceChangeProposalOperationRecord {
        id: row.get(0)?,
        proposal_id: row.get(1)?,
        operation: row.get(2)?,
        actor_id: row.get(3)?,
        from_state: row.get(4)?,
        to_state: row.get(5)?,
        reason: row.get(6)?,
        metadata,
        created_at: row.get(8)?,
    })
}

pub(crate) fn row_to_plan_proposal(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<PlanProposalRecord> {
    let planning_request_json: String = row.get(8)?;
    let generation_output_json: String = row.get(16)?;
    let steps_json: String = row.get(19)?;
    let references_json: String = row.get(20)?;
    let execution_input_id: Option<String> = row.get(22)?;
    let execution = execution_input_id
        .map(|input_id| {
            Ok::<PlanProposalExecutionBindingRecord, rusqlite::Error>(
                PlanProposalExecutionBindingRecord {
                    input_id,
                    turn_id: required_plan_execution_column(row, 23, "turn_id")?,
                    job_id: required_plan_execution_column(row, 24, "job_id")?,
                    execution_binding_digest: required_plan_execution_column(
                        row,
                        25,
                        "execution_binding_digest",
                    )?,
                    digest: required_plan_execution_column(row, 26, "digest")?,
                    bound_at: row
                        .get::<_, Option<i64>>(27)?
                        .ok_or_else(|| invalid_plan_execution_column(27, "bound_at"))?,
                },
            )
        })
        .transpose()?;
    Ok(PlanProposalRecord {
        id: row.get(0)?,
        principal_id: row.get(1)?,
        revision: row.get(2)?,
        source: PlanProposalSourceRecord {
            session_id: row.get(3)?,
            head_sequence: row.get(4)?,
            head_message_id: row.get(5)?,
            head_turn_id: row.get(6)?,
            analysis_input_digest: row.get(7)?,
            planning_request: json_from_column(&planning_request_json, 8)?,
        },
        generation: PlanProposalGenerationRecord {
            endpoint_id: row.get(9)?,
            endpoint_digest: row.get(10)?,
            protocol_id: row.get(11)?,
            provider_id: row.get(12)?,
            model_id: row.get(13)?,
            generated_at: row.get(14)?,
            output_digest: row.get(15)?,
            output: json_from_column(&generation_output_json, 16)?,
        },
        title: row.get(17)?,
        summary: row.get(18)?,
        steps: json_from_column(&steps_json, 19)?,
        references: plan_references_from_json(&references_json, 20)?,
        state: row.get(21)?,
        execution,
        created_at: row.get(28)?,
        updated_at: row.get(29)?,
        decided_at: row.get(30)?,
    })
}

pub(crate) fn row_to_plan_proposal_operation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<PlanProposalOperationRecord> {
    let content_json: Option<String> = row.get(9)?;
    let content = content_json
        .map(|raw| json_from_column::<PlanProposalContentRecord>(&raw, 9))
        .transpose()?;
    Ok(PlanProposalOperationRecord {
        id: row.get(0)?,
        proposal_id: row.get(1)?,
        operation: row.get(2)?,
        actor_kind: row.get(3)?,
        actor_id: row.get(4)?,
        from_state: row.get(5)?,
        to_state: row.get(6)?,
        from_revision: row.get(7)?,
        to_revision: row.get(8)?,
        content,
        reason: row.get(10)?,
        created_at: row.get(11)?,
    })
}

fn required_plan_execution_column(
    row: &rusqlite::Row<'_>,
    column: usize,
    name: &str,
) -> rusqlite::Result<String> {
    row.get::<_, Option<String>>(column)?
        .ok_or_else(|| invalid_plan_execution_column(column, name))
}

fn invalid_plan_execution_column(column: usize, name: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        column,
        rusqlite::types::Type::Null,
        Box::new(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("plan execution binding is missing {name}"),
        )),
    )
}

pub(crate) fn row_to_objective(row: &rusqlite::Row<'_>) -> rusqlite::Result<ObjectiveRecord> {
    let boundaries_json: String = row.get(4)?;
    let constraints_json: String = row.get(5)?;
    let success_criteria_json: String = row.get(6)?;
    let verification_policy_json: String = row.get(7)?;
    let stop_policy_json: String = row.get(8)?;
    Ok(ObjectiveRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        principal_id: row.get(2)?,
        objective: row.get(3)?,
        boundaries: json_from_column(&boundaries_json, 4)?,
        constraints: json_from_column(&constraints_json, 5)?,
        success_criteria: json_from_column(&success_criteria_json, 6)?,
        verification_policy: json_from_column(&verification_policy_json, 7)?,
        stop_policy: json_from_column(&stop_policy_json, 8)?,
        revision: row.get(9)?,
        state: row.get(10)?,
        reason: ObjectiveStateReason {
            code: row.get(11)?,
            detail: row.get(12)?,
        },
        active_attempt_id: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        closed_at: row.get(16)?,
    })
}

pub(crate) fn row_to_objective_attempt(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ObjectiveAttemptRecord> {
    Ok(ObjectiveAttemptRecord {
        id: row.get(0)?,
        objective_id: row.get(1)?,
        attempt_number: row.get(2)?,
        input_id: row.get(3)?,
        turn_id: row.get(4)?,
        job_id: row.get(5)?,
        execution_binding_digest: row.get(6)?,
        trigger: row.get(7)?,
        budget_grant_id: row.get(8)?,
        idempotency_key: row.get(9)?,
        bound_at: row.get(10)?,
    })
}

pub(crate) fn row_to_objective_attempt_review(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ObjectiveAttemptReviewRecord> {
    Ok(ObjectiveAttemptReviewRecord {
        id: row.get(0)?,
        objective_id: row.get(1)?,
        attempt_id: row.get(2)?,
        disposition: row.get(3)?,
        reason: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub(crate) fn row_to_objective_verification(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ObjectiveVerificationRecord> {
    let evidence_json: String = row.get(8)?;
    Ok(ObjectiveVerificationRecord {
        id: row.get(0)?,
        objective_id: row.get(1)?,
        attempt_id: row.get(2)?,
        requirement_id: row.get(3)?,
        verifier_kind: row.get(4)?,
        verifier_ref: row.get(5)?,
        result: row.get(6)?,
        reason: row.get(7)?,
        evidence: json_from_column(&evidence_json, 8)?,
        created_at: row.get(9)?,
    })
}

pub(crate) fn row_to_delegation_graph(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<DelegationGraphRecord> {
    let metadata_json: Option<String> = row.get(4)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 4))
        .transpose()?;
    Ok(DelegationGraphRecord {
        id: row.get(0)?,
        principal_id: row.get(1)?,
        title: row.get(2)?,
        state: row.get(3)?,
        metadata,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        closed_at: row.get(7)?,
    })
}

pub(crate) fn row_to_delegation_graph_node(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<DelegationGraphNodeRecord> {
    let payload_json: String = row.get(5)?;
    let metadata_json: Option<String> = row.get(7)?;
    let payload = json_from_column(&payload_json, 5)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    Ok(DelegationGraphNodeRecord {
        id: row.get(0)?,
        graph_id: row.get(1)?,
        kind: row.get(2)?,
        principal_id: row.get(3)?,
        state: row.get(4)?,
        payload,
        scheduler_job_id: row.get(6)?,
        metadata,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        started_at: row.get(10)?,
        finished_at: row.get(11)?,
    })
}

pub(crate) fn row_to_delegation_graph_dependency(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<DelegationGraphDependencyRecord> {
    Ok(DelegationGraphDependencyRecord {
        id: row.get(0)?,
        graph_id: row.get(1)?,
        from_node_id: row.get(2)?,
        to_node_id: row.get(3)?,
        kind: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub(crate) fn row_to_team_conversation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamConversationRecord> {
    let metadata_json: Option<String> = row.get(6)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 6))
        .transpose()?;
    Ok(TeamConversationRecord {
        id: row.get(0)?,
        principal_id: row.get(1)?,
        title: row.get(2)?,
        mode: row.get(3)?,
        state: row.get(4)?,
        lead_participant_id: row.get(5)?,
        metadata,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        closed_at: row.get(9)?,
    })
}

pub(crate) fn row_to_team_participant(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamParticipantRecord> {
    let metadata_json: Option<String> = row.get(8)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 8))
        .transpose()?;
    Ok(TeamParticipantRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        principal_id: row.get(2)?,
        kind: row.get(3)?,
        display_name: row.get(4)?,
        role: row.get(5)?,
        agent_session_id: row.get(6)?,
        state: row.get(7)?,
        metadata,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub(crate) fn row_to_team_message(row: &rusqlite::Row<'_>) -> rusqlite::Result<TeamMessageRecord> {
    let targets_json: String = row.get(7)?;
    let content_json: String = row.get(8)?;
    let metadata_json: Option<String> = row.get(9)?;
    let targets = json_from_column(&targets_json, 7)?;
    let content = json_from_column(&content_json, 8)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 9))
        .transpose()?;
    Ok(TeamMessageRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        author_participant_id: row.get(2)?,
        parent_message_id: row.get(3)?,
        discussion_round_id: row.get(4)?,
        kind: row.get(5)?,
        state: row.get(6)?,
        targets,
        content,
        metadata,
        idempotency_key: row.get(10)?,
        revision: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        visible_at: row.get(14)?,
    })
}

pub(crate) fn row_to_team_routing_decision(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamRoutingDecisionRecord> {
    let metadata_json: Option<String> = row.get(8)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 8))
        .transpose()?;
    Ok(TeamRoutingDecisionRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        message_id: row.get(2)?,
        mode: row.get(3)?,
        outcome: row.get(4)?,
        lead_participant_id: row.get(5)?,
        actor_principal_id: row.get(6)?,
        reason: row.get(7)?,
        metadata,
        idempotency_key: row.get(9)?,
        created_at: row.get(10)?,
    })
}

pub(crate) fn row_to_team_discussion_round(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamDiscussionRoundRecord> {
    let result_json: Option<String> = row.get(8)?;
    let result = result_json
        .map(|raw| json_from_column(&raw, 8))
        .transpose()?;
    Ok(TeamDiscussionRoundRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        source_message_id: row.get(2)?,
        routing_decision_id: row.get(3)?,
        mode: row.get(4)?,
        state: row.get(5)?,
        expected_delivery_count: row.get(6)?,
        outcome: row.get(7)?,
        result,
        idempotency_key: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        closed_at: row.get(12)?,
    })
}

pub(crate) fn row_to_team_delivery(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamDeliveryRecord> {
    let last_error_json: Option<String> = row.get(18)?;
    let last_error = last_error_json
        .map(|raw| json_from_column(&raw, 18))
        .transpose()?;
    Ok(TeamDeliveryRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        message_id: row.get(2)?,
        routing_decision_id: row.get(3)?,
        discussion_round_id: row.get(4)?,
        target_participant_id: row.get(5)?,
        role: row.get(6)?,
        trigger: row.get(7)?,
        state: row.get(8)?,
        target_session_id: row.get(9)?,
        dispatch_job_id: row.get(10)?,
        child_input_id: row.get(11)?,
        child_turn_id: row.get(12)?,
        child_turn_job_id: row.get(13)?,
        outcome_job_id: row.get(14)?,
        reply_message_id: row.get(15)?,
        participation_tool_execution_id: row.get(16)?,
        budget_grant_id: row.get(17)?,
        last_error,
        idempotency_key: row.get(19)?,
        created_at: row.get(20)?,
        updated_at: row.get(21)?,
        materialized_at: row.get(22)?,
        finished_at: row.get(23)?,
    })
}

pub(crate) fn row_to_team_delegation_operation(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamDelegationOperationRecord> {
    Ok(TeamDelegationOperationRecord {
        id: row.get(0)?,
        conversation_id: row.get(1)?,
        source_delivery_id: row.get(2)?,
        source_routing_decision_id: row.get(3)?,
        source_discussion_round_id: row.get(4)?,
        lead_participant_id: row.get(5)?,
        parent_session_id: row.get(6)?,
        parent_input_id: row.get(7)?,
        parent_turn_id: row.get(8)?,
        parent_session_attempt_id: row.get(9)?,
        parent_session_job_id: row.get(10)?,
        parent_tool_execution_id: row.get(11)?,
        parent_tool_invocation_attempt_id: row.get(12)?,
        parent_tool_call_id: row.get(13)?,
        delegation_graph_id: row.get(14)?,
        state: row.get(15)?,
        idempotency_key: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
        finished_at: row.get(19)?,
    })
}

pub(crate) fn row_to_team_delegation_task(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TeamDelegationTaskRecord> {
    let execution_binding_json: String = row.get(11)?;
    Ok(TeamDelegationTaskRecord {
        id: row.get(0)?,
        operation_id: row.get(1)?,
        graph_node_id: row.get(2)?,
        target_participant_id: row.get(3)?,
        target_session_id: row.get(4)?,
        prompt: row.get(5)?,
        child_input_id: row.get(6)?,
        child_turn_id: row.get(7)?,
        child_job_id: row.get(8)?,
        input_idempotency_key: row.get(9)?,
        job_idempotency_key: row.get(10)?,
        execution_binding: json_from_column(&execution_binding_json, 11)?,
        execution_binding_digest: row.get(12)?,
        max_steps: row.get(13)?,
        priority: row.get(14)?,
        materialized_at: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

pub(crate) fn row_to_plugin_manifest(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<PluginManifestRecord> {
    let entry_json: Option<String> = row.get(4)?;
    let capabilities_json: String = row.get(5)?;
    let metadata_json: Option<String> = row.get(7)?;
    let entry = entry_json
        .map(|raw| json_from_column(&raw, 4))
        .transpose()?;
    let capabilities = json_from_column(&capabilities_json, 5)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    Ok(PluginManifestRecord {
        id: row.get(0)?,
        plugin_id: row.get(1)?,
        version: row.get(2)?,
        name: row.get(3)?,
        entry,
        capabilities,
        state: row.get(6)?,
        metadata,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        disabled_at: row.get(10)?,
    })
}

pub(crate) fn row_to_plugin_install(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<PluginInstallRecord> {
    let layout_json: String = row.get(4)?;
    let trust_json: String = row.get(5)?;
    let metadata_json: Option<String> = row.get(7)?;
    let layout = json_from_column(&layout_json, 4)?;
    let trust = json_from_column(&trust_json, 5)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    Ok(PluginInstallRecord {
        id: row.get(0)?,
        plugin_id: row.get(1)?,
        version: row.get(2)?,
        state: row.get(3)?,
        layout,
        trust,
        install_root_dir: row.get(6)?,
        metadata,
        installed_at: row.get(8)?,
        updated_at: row.get(9)?,
        disabled_at: row.get(10)?,
        removed_at: row.get(11)?,
    })
}

pub(crate) fn row_to_connector_registration(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ConnectorRegistrationRecord> {
    let metadata_json: Option<String> = row.get(5)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 5))
        .transpose()?;
    Ok(ConnectorRegistrationRecord {
        id: row.get(0)?,
        connector_id: row.get(1)?,
        plugin_id: row.get(2)?,
        plugin_version: row.get(3)?,
        state: row.get(4)?,
        metadata,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        disabled_at: row.get(8)?,
    })
}

pub(crate) fn row_to_connector_credential(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ConnectorCredentialRecord> {
    let metadata_json: Option<String> = row.get(5)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 5))
        .transpose()?;
    Ok(ConnectorCredentialRecord {
        id: row.get(0)?,
        connector_id: row.get(1)?,
        kind: row.get(2)?,
        secret_ref: row.get(3)?,
        state: row.get(4)?,
        metadata,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        revoked_at: row.get(8)?,
    })
}

pub(crate) fn row_to_connector_session(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ConnectorSessionRecord> {
    let metadata_json: Option<String> = row.get(7)?;
    let last_error_json: Option<String> = row.get(8)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    let last_error = last_error_json
        .map(|raw| json_from_column(&raw, 8))
        .transpose()?;
    Ok(ConnectorSessionRecord {
        id: row.get(0)?,
        connector_id: row.get(1)?,
        credential_id: row.get(2)?,
        state: row.get(3)?,
        owner_id: row.get(4)?,
        lease_token: row.get(5)?,
        lease_expires_at: row.get(6)?,
        metadata,
        last_error,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        finished_at: row.get(11)?,
    })
}

pub(crate) fn row_to_channel_binding(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ChannelBindingRecord> {
    let metadata_json: Option<String> = row.get(8)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 8))
        .transpose()?;
    Ok(ChannelBindingRecord {
        id: row.get(0)?,
        connector_id: row.get(1)?,
        channel_kind: row.get(2)?,
        channel_id: row.get(3)?,
        external_identity_id: row.get(4)?,
        principal_id: row.get(5)?,
        display_name: row.get(6)?,
        state: row.get(7)?,
        metadata,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
        revoked_at: row.get(11)?,
    })
}

pub(crate) fn row_to_channel_inbound_event(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ChannelInboundEventRecord> {
    let payload_json: String = row.get(8)?;
    let metadata_json: Option<String> = row.get(10)?;
    let payload = json_from_column(&payload_json, 8)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 10))
        .transpose()?;
    Ok(ChannelInboundEventRecord {
        id: row.get(0)?,
        connector_id: row.get(1)?,
        channel_kind: row.get(2)?,
        channel_id: row.get(3)?,
        external_event_id: row.get(4)?,
        external_thread_id: row.get(5)?,
        sender_external_identity_id: row.get(6)?,
        principal_id: row.get(7)?,
        payload,
        state: row.get(9)?,
        metadata,
        received_at: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

pub(crate) fn row_to_channel_delivery(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ChannelDeliveryRecord> {
    let payload_json: String = row.get(7)?;
    let metadata_json: Option<String> = row.get(9)?;
    let payload = json_from_column(&payload_json, 7)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 9))
        .transpose()?;
    Ok(ChannelDeliveryRecord {
        id: row.get(0)?,
        connector_id: row.get(1)?,
        channel_kind: row.get(2)?,
        channel_id: row.get(3)?,
        target_external_identity_id: row.get(4)?,
        external_thread_id: row.get(5)?,
        principal_id: row.get(6)?,
        payload,
        state: row.get(8)?,
        metadata,
        scheduler_job_id: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        finished_at: row.get(13)?,
    })
}

pub(crate) fn row_to_channel_projection(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ChannelProjectionRecord> {
    let target_json: String = row.get(6)?;
    let metadata_json: Option<String> = row.get(7)?;
    let target = json_from_column(&target_json, 6)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 7))
        .transpose()?;
    Ok(ChannelProjectionRecord {
        id: row.get(0)?,
        inbound_event_id: row.get(1)?,
        target_kind: row.get(2)?,
        target_id: row.get(3)?,
        target_job_id: row.get(4)?,
        state: row.get(5)?,
        target,
        metadata,
        idempotency_key: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub(crate) fn row_to_resource(row: &rusqlite::Row<'_>) -> rusqlite::Result<ResourceRecord> {
    let metadata_json: Option<String> = row.get(14)?;
    let metadata = metadata_json
        .map(|raw| json_from_column(&raw, 14))
        .transpose()?;
    let source = ResourceSource {
        provider: row.get(9)?,
        provider_file_id: row.get(10)?,
        provider_operation_id: row.get(11)?,
        source_url: row.get(12)?,
        source_expires_at: row.get(13)?,
    };
    let source = if source.provider.is_none()
        && source.provider_file_id.is_none()
        && source.provider_operation_id.is_none()
        && source.source_url.is_none()
        && source.source_expires_at.is_none()
    {
        None
    } else {
        Some(source)
    };
    Ok(ResourceRecord {
        id: row.get(0)?,
        logical_path: row.get(1)?,
        kind: row.get(2)?,
        origin: row.get(3)?,
        state: row.get(4)?,
        media_type: row.get(5)?,
        label: row.get(6)?,
        size_bytes: row.get(7)?,
        sha256: row.get(8)?,
        source,
        metadata,
        width: row.get(15)?,
        height: row.get(16)?,
        duration_ms: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

pub(crate) fn collect_events(
    rows: impl Iterator<Item = rusqlite::Result<RuntimeEvent>>,
) -> Result<Vec<RuntimeEvent>> {
    let mut events = Vec::new();
    for row in rows {
        events.push(row?);
    }
    Ok(events)
}

pub(crate) fn row_to_budget_scope(row: &rusqlite::Row<'_>) -> rusqlite::Result<BudgetScopeRecord> {
    let limit_json: String = row.get(3)?;
    let usage_json: String = row.get(4)?;
    let limit = budget_amount_from_json(&limit_json, 3)?;
    let usage = budget_amount_from_json(&usage_json, 4)?;
    Ok(BudgetScopeRecord {
        id: row.get(0)?,
        kind: row.get(1)?,
        owner_id: row.get(2)?,
        limit,
        usage,
        window_kind: row.get(5)?,
        state: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

pub(crate) fn row_to_budget_grant(row: &rusqlite::Row<'_>) -> rusqlite::Result<BudgetGrantRecord> {
    let requested_json: String = row.get(4)?;
    let committed_json: Option<String> = row.get(5)?;
    let requested = budget_amount_from_json(&requested_json, 4)?;
    let committed = committed_json
        .map(|raw| budget_amount_from_json(&raw, 5))
        .transpose()?;
    Ok(BudgetGrantRecord {
        id: row.get(0)?,
        scope_id: row.get(1)?,
        principal_id: row.get(2)?,
        reason: row.get(3)?,
        requested,
        committed,
        state: row.get(6)?,
        idempotency_key: row.get(7)?,
        expires_at: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

pub(crate) fn row_to_budget_usage_entry(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<BudgetUsageEntryRecord> {
    let usage_json: String = row.get(2)?;
    Ok(BudgetUsageEntryRecord {
        id: row.get(0)?,
        grant_id: row.get(1)?,
        usage: budget_amount_from_json(&usage_json, 2)?,
        source: row.get(3)?,
        source_id: row.get(4)?,
        idempotency_key: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn budget_amount_from_json(raw: &str, column: usize) -> rusqlite::Result<BudgetAmount> {
    serde_json::from_str(raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

pub(crate) fn row_to_scheduler_job(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<SchedulerJobRecord> {
    let payload_json: String = row.get(4)?;
    let retry_policy_json: String = row.get(11)?;
    let result_json: Option<String> = row.get(17)?;
    let last_error_json: Option<String> = row.get(18)?;
    let payload = json_from_column(&payload_json, 4)?;
    let retry_policy = json_from_column(&retry_policy_json, 11)?;
    let result = result_json
        .map(|raw| json_from_column(&raw, 17))
        .transpose()?;
    let last_error = last_error_json
        .map(|raw| json_from_column(&raw, 18))
        .transpose()?;
    Ok(SchedulerJobRecord {
        id: row.get(0)?,
        kind: row.get(1)?,
        state: row.get(2)?,
        principal_id: row.get(3)?,
        payload,
        scheduled_at: row.get(5)?,
        not_before: row.get(6)?,
        priority: row.get(7)?,
        concurrency_key: row.get(8)?,
        attempt: row.get(9)?,
        max_attempts: row.get(10)?,
        retry_policy,
        idempotency_key: row.get(12)?,
        budget_grant_id: row.get(13)?,
        lease_owner: row.get(14)?,
        lease_token: row.get(15)?,
        lease_expires_at: row.get(16)?,
        result,
        last_error,
        created_at: row.get(19)?,
        updated_at: row.get(20)?,
        finished_at: row.get(21)?,
    })
}

fn json_from_column<T: serde::de::DeserializeOwned>(
    raw: &str,
    column: usize,
) -> rusqlite::Result<T> {
    serde_json::from_str(raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn plan_references_from_json(
    raw: &str,
    column: usize,
) -> rusqlite::Result<Vec<PlanProposalReferenceRecord>> {
    json_from_column(raw, column)
}

pub(crate) fn row_to_tool_execution(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ToolExecutionRecord> {
    let input_json: String = row.get(8)?;
    let descriptor_json: String = row.get(9)?;
    let permission_json: String = row.get(10)?;
    let recovery_json: Option<String> = row.get(17)?;
    let content_json: Option<String> = row.get(18)?;
    let error_json: Option<String> = row.get(21)?;
    let activity_json: Option<String> = row.get(25)?;
    Ok(ToolExecutionRecord {
        id: row.get(0)?,
        session_id: row.get(1)?,
        turn_id: row.get(2)?,
        input_id: row.get(3)?,
        source_message_id: row.get(4)?,
        principal_id: row.get(5)?,
        tool_call_id: row.get(6)?,
        tool_name: row.get(7)?,
        input: json_from_column(&input_json, 8)?,
        descriptor: json_from_column(&descriptor_json, 9)?,
        permission: json_from_column(&permission_json, 10)?,
        activity: activity_json
            .map(|raw| json_from_column(&raw, 25))
            .transpose()?,
        state: row.get(11)?,
        current_invocation_attempt_id: row.get(12)?,
        attempt_count: row.get(13)?,
        idempotency_key: row.get(14)?,
        approval_revision: row.get(15)?,
        recovery_revision: row.get(16)?,
        recovery: recovery_json
            .map(|raw| json_from_column(&raw, 17))
            .transpose()?,
        content: content_json
            .map(|raw| json_from_column(&raw, 18))
            .transpose()?,
        content_digest: row.get(19)?,
        is_error: row.get(20)?,
        error: error_json
            .map(|raw| json_from_column(&raw, 21))
            .transpose()?,
        created_at: row.get(22)?,
        finished_at: row.get(23)?,
        updated_at: row.get(24)?,
    })
}

pub(crate) fn row_to_tool_activity(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<crate::ToolActivityRecord> {
    let activity_json: Option<String> = row.get(6)?;
    Ok(crate::ToolActivityRecord {
        session_id: row.get(0)?,
        turn_id: row.get(1)?,
        source_message_id: row.get(2)?,
        tool_call_id: row.get(3)?,
        tool_name: row.get(4)?,
        state: row.get(5)?,
        activity: activity_json
            .map(|raw| json_from_column(&raw, 6))
            .transpose()?,
        updated_at: row.get(7)?,
    })
}

pub(crate) fn row_to_tool_execution_attempt(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ToolExecutionAttemptRecord> {
    let error_json: Option<String> = row.get(7)?;
    Ok(ToolExecutionAttemptRecord {
        id: row.get(0)?,
        execution_id: row.get(1)?,
        session_attempt_id: row.get(2)?,
        job_id: row.get(3)?,
        worker_id: row.get(4)?,
        attempt_number: row.get(5)?,
        state: row.get(6)?,
        error: error_json
            .map(|raw| json_from_column(&raw, 7))
            .transpose()?,
        started_at: row.get(8)?,
        updated_at: row.get(9)?,
        finished_at: row.get(10)?,
    })
}
