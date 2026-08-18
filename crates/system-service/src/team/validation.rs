use super::*;

pub(super) fn validate_put_conversation(request: &PutTeamConversation) -> Result<()> {
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team conversation principal_id must not be empty".to_string(),
        ));
    }
    validate_optional_conversation_mode(request.mode.as_deref())?;
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team conversation id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_set_conversation_lead(request: &SetTeamConversationLead) -> Result<()> {
    if request.conversation_id.is_empty()
        || request.expected_lead_participant_id.as_deref() == Some("")
        || request.lead_participant_id.as_deref() == Some("")
    {
        return Err(SystemServiceError::Invariant(
            "team lead identity fields must not be empty".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_put_participant(request: &PutTeamParticipant) -> Result<()> {
    if request.conversation_id.is_empty() || request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team participant conversation_id/principal_id must not be empty".to_string(),
        ));
    }
    validate_participant_kind(&request.kind)?;
    match (request.kind.as_str(), request.agent_session_id.as_deref()) {
        ("agent", Some(session_id)) if !session_id.is_empty() => {}
        ("agent", _) => {
            return Err(SystemServiceError::Invariant(
                "team agent participant requires agent_session_id".to_string(),
            ));
        }
        (_, None) => {}
        _ => {
            return Err(SystemServiceError::Invariant(
                "only team agent participants may bind an agent session".to_string(),
            ));
        }
    }
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "team participant id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_admit_message(request: &AdmitTeamMessage) -> Result<()> {
    if request.conversation_id.is_empty() || request.author_participant_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "team message conversation_id/author_participant_id must not be empty".to_string(),
        ));
    }
    validate_team_public_content(&request.content)?;
    if let Some(kind) = &request.kind {
        validate_message_kind(kind)?;
    }
    if request.id.as_deref() == Some("")
        || request.parent_message_id.as_deref() == Some("")
        || request.idempotency_key.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "team message identity fields must not be empty".to_string(),
        ));
    }
    if request.targets.len() > MAX_TEAM_TARGETS {
        return Err(SystemServiceError::Invariant(format!(
            "team message targets exceed {MAX_TEAM_TARGETS}"
        )));
    }
    let mut targets = HashSet::new();
    for target in &request.targets {
        validate_team_target(target)?;
        let key = match target.kind.as_str() {
            "participant" => format!(
                "participant:{}",
                target.participant_id.as_deref().unwrap_or_default()
            ),
            kind => kind.to_string(),
        };
        if !targets.insert(key) {
            return Err(SystemServiceError::Invariant(
                "team message targets must be unique".to_string(),
            ));
        }
    }
    Ok(())
}

pub(super) fn validate_team_public_content(content: &serde_json::Value) -> Result<()> {
    let parts = content.as_array().ok_or_else(|| {
        SystemServiceError::Invariant("team message content must be an array".to_string())
    })?;
    if parts.is_empty() || parts.len() > MAX_TEAM_MESSAGE_PARTS {
        return Err(SystemServiceError::Invariant(format!(
            "team message content must contain 1 to {MAX_TEAM_MESSAGE_PARTS} parts"
        )));
    }
    if serde_json::to_vec(content)?.len() > MAX_TEAM_MESSAGE_CONTENT_BYTES {
        return Err(SystemServiceError::Invariant(format!(
            "team message content exceeds {MAX_TEAM_MESSAGE_CONTENT_BYTES} bytes"
        )));
    }
    let mut part_ids = HashSet::new();
    let mut resource_evidence = Vec::new();
    for part in parts {
        let object = part.as_object().ok_or_else(|| {
            SystemServiceError::Invariant("team message parts must be objects".to_string())
        })?;
        let part_id = object
            .get("id")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                SystemServiceError::Invariant(
                    "team message part id must be a non-empty string".to_string(),
                )
            })?;
        if !part_ids.insert(part_id.to_string()) {
            return Err(SystemServiceError::Invariant(
                "team message part ids must be unique".to_string(),
            ));
        }
        if object
            .get("visibility")
            .is_some_and(|visibility| !matches!(visibility.as_str(), Some("user" | "assistant")))
        {
            return Err(SystemServiceError::Invariant(
                "team message parts must be public".to_string(),
            ));
        }
        match object.get("type").and_then(serde_json::Value::as_str) {
            Some("text") => {
                validate_team_part_keys(object, &["type", "id", "text", "visibility"])?;
                object
                    .get("text")
                    .and_then(serde_json::Value::as_str)
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| {
                        SystemServiceError::Invariant(
                            "team text part must contain non-empty text".to_string(),
                        )
                    })?;
            }
            Some("resource") => {
                validate_team_part_keys(
                    object,
                    &[
                        "type",
                        "id",
                        "resourceId",
                        "sha256",
                        "sizeBytes",
                        "kind",
                        "mediaType",
                        "visibility",
                    ],
                )?;
                let mut evidence = serde_json::Map::new();
                for key in ["resourceId", "sha256", "sizeBytes", "kind", "mediaType"] {
                    if let Some(value) = object.get(key) {
                        evidence.insert(key.to_string(), value.clone());
                    }
                }
                resource_evidence.push(serde_json::Value::Object(evidence));
            }
            _ => {
                return Err(SystemServiceError::Invariant(
                    "team message parts must be public text or resource".to_string(),
                ));
            }
        }
    }
    crate::sessions::validate_resource_bindings(&resource_evidence)?;
    Ok(())
}

fn validate_team_part_keys(
    object: &serde_json::Map<String, serde_json::Value>,
    allowed: &[&str],
) -> Result<()> {
    if object.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(SystemServiceError::Invariant(
            "team message part contains unsupported fields".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn validate_team_target(target: &TeamTarget) -> Result<()> {
    match (target.kind.as_str(), target.participant_id.as_deref()) {
        ("participant", Some(participant_id)) if !participant_id.is_empty() => Ok(()),
        ("lead" | "all", None) => Ok(()),
        _ => Err(SystemServiceError::Invariant(
            "invalid team message target".to_string(),
        )),
    }
}

pub(super) fn validate_route_message(request: &RouteTeamMessage) -> Result<()> {
    validate_conversation_mode(&request.mode)?;
    validate_routing_outcome(&request.outcome)?;
    if request.message_id.is_empty()
        || request.actor_principal_id.is_empty()
        || request.idempotency_key.is_empty()
        || request.id.as_deref() == Some("")
        || request.expected_lead_participant_id.as_deref() == Some("")
    {
        return Err(SystemServiceError::Invariant(
            "team route identity fields must not be empty".to_string(),
        ));
    }
    if request.expected_revision <= 0 {
        return Err(SystemServiceError::Invariant(
            "team route expected_revision must be positive".to_string(),
        ));
    }
    if request.reason.trim().is_empty() || request.reason.len() > MAX_ROUTING_REASON_BYTES {
        return Err(SystemServiceError::Invariant(format!(
            "team route reason must contain 1 to {MAX_ROUTING_REASON_BYTES} bytes"
        )));
    }
    if request.deliveries.len() > MAX_TEAM_DELIVERIES {
        return Err(SystemServiceError::Invariant(format!(
            "team route deliveries exceed {MAX_TEAM_DELIVERIES}"
        )));
    }
    match request.outcome.as_str() {
        "deliver" if request.deliveries.is_empty() => {
            return Err(SystemServiceError::Invariant(
                "team deliver route requires at least one delivery".to_string(),
            ));
        }
        "blocked" if !request.deliveries.is_empty() => {
            return Err(SystemServiceError::Invariant(
                "team blocked route must not create deliveries".to_string(),
            ));
        }
        _ => {}
    }
    let mut participants = HashSet::new();
    let mut ids = HashSet::new();
    for delivery in &request.deliveries {
        validate_route_delivery(delivery)?;
        if !participants.insert(delivery.target_participant_id.clone()) {
            return Err(SystemServiceError::Invariant(
                "team route delivery participant must be unique".to_string(),
            ));
        }
        if let Some(id) = &delivery.id {
            if !ids.insert(id.clone()) {
                return Err(SystemServiceError::Invariant(
                    "team route delivery ids must be unique".to_string(),
                ));
            }
        }
    }
    Ok(())
}

pub(super) fn validate_route_delivery(delivery: &RouteTeamDelivery) -> Result<()> {
    if delivery.target_participant_id.is_empty()
        || delivery.id.as_deref() == Some("")
        || delivery.budget_grant_id.as_deref() == Some("")
    {
        return Err(SystemServiceError::Invariant(
            "team delivery identity fields must not be empty".to_string(),
        ));
    }
    validate_delivery_role(&delivery.role)?;
    validate_delivery_trigger(&delivery.trigger)
}

pub(super) fn validate_existing_conversation(
    record: &TeamConversationRecord,
    request: &PutTeamConversation,
    mode: &str,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.principal_id != request.principal_id
        || record.title != request.title
        || record.mode != mode
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "team conversation id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

pub(super) fn validate_existing_participant(
    record: &TeamParticipantRecord,
    request: &PutTeamParticipant,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.conversation_id != request.conversation_id
        || record.principal_id != request.principal_id
        || record.kind != request.kind
        || record.display_name != request.display_name
        || record.role != request.role
        || record.agent_session_id != request.agent_session_id
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "team participant id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

pub(super) fn validate_existing_message(
    record: &TeamMessageRecord,
    request: &AdmitTeamMessage,
    kind: &str,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    let id_matches = request.id.as_ref().is_none_or(|id| id == &record.id);
    if !id_matches
        || record.conversation_id != request.conversation_id
        || record.author_participant_id != request.author_participant_id
        || record.parent_message_id != request.parent_message_id
        || record.kind != kind
        || record.targets != request.targets
        || record.content != request.content
        || !metadata_matches
        || record.idempotency_key != request.idempotency_key
    {
        return Err(SystemServiceError::Invariant(format!(
            "team message identity already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

pub(super) fn validate_existing_route(
    message: &TeamMessageRecord,
    decision: &TeamRoutingDecisionRecord,
    round: Option<&TeamDiscussionRoundRecord>,
    deliveries: &[TeamDeliveryRecord],
    dispatch_jobs: &[SchedulerJobRecord],
    request: &RouteTeamMessage,
) -> Result<()> {
    let metadata_matches = match (&decision.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    let id_matches = request.id.as_ref().is_none_or(|id| id == &decision.id);
    if !id_matches
        || decision.message_id != request.message_id
        || decision.mode != request.mode
        || decision.outcome != request.outcome
        || decision.lead_participant_id != request.expected_lead_participant_id
        || decision.actor_principal_id != request.actor_principal_id
        || decision.reason != request.reason
        || !metadata_matches
        || decision.idempotency_key != request.idempotency_key
        || deliveries.len() != request.deliveries.len()
        || dispatch_jobs.len() != deliveries.len()
    {
        return Err(SystemServiceError::Invariant(format!(
            "team routing decision identity already exists with different content: {}",
            decision.id
        )));
    }
    match (request.outcome.as_str(), round) {
        ("deliver", Some(round)) => {
            super::round::validate_discussion_round_record(round)?;
            if round.conversation_id != decision.conversation_id
                || round.source_message_id != decision.message_id
                || round.routing_decision_id != decision.id
                || round.mode != decision.mode
                || round.expected_delivery_count != deliveries.len() as i64
                || round.idempotency_key != format!("team-round:{}", decision.id)
                || message.discussion_round_id.as_deref() != Some(round.id.as_str())
                || deliveries
                    .iter()
                    .any(|delivery| delivery.discussion_round_id != round.id)
            {
                return Err(SystemServiceError::Invariant(format!(
                    "team routing decision has a mismatched discussion round: {}",
                    decision.id
                )));
            }
        }
        ("blocked", None) if message.discussion_round_id.is_none() => {}
        _ => {
            return Err(SystemServiceError::Invariant(format!(
                "team routing decision has an invalid discussion round: {}",
                decision.id
            )));
        }
    }
    for requested in &request.deliveries {
        let existing = deliveries.iter().find(|delivery| {
            delivery.target_participant_id == requested.target_participant_id
                && delivery.role == requested.role
        });
        let Some(existing) = existing else {
            return Err(SystemServiceError::Invariant(format!(
                "team routing decision identity already exists with different deliveries: {}",
                decision.id
            )));
        };
        let delivery_id_matches = requested.id.as_ref().is_none_or(|id| id == &existing.id);
        if !delivery_id_matches
            || existing.trigger != requested.trigger
            || existing.budget_grant_id != requested.budget_grant_id
        {
            return Err(SystemServiceError::Invariant(format!(
                "team routing decision identity already exists with different deliveries: {}",
                decision.id
            )));
        }
        let dispatch_job = dispatch_jobs
            .iter()
            .find(|job| job.id == existing.dispatch_job_id)
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "team routing decision is missing a dispatch job: {}",
                    decision.id
                ))
            })?;
        if dispatch_job.kind != "team.delivery"
            || dispatch_job.idempotency_key.as_deref()
                != Some(&format!("{}:dispatch", existing.idempotency_key))
            || dispatch_job.payload["teamDeliveryId"] != existing.id
            || dispatch_job.payload["teamConversationId"] != existing.conversation_id
            || dispatch_job.payload["teamMessageId"] != existing.message_id
            || dispatch_job.payload["teamDiscussionRoundId"] != existing.discussion_round_id
            || dispatch_job.payload["targetParticipantId"] != existing.target_participant_id
            || dispatch_job.payload["targetSessionId"] != existing.target_session_id
        {
            return Err(SystemServiceError::Invariant(format!(
                "team routing decision has a mismatched dispatch job: {}",
                decision.id
            )));
        }
    }
    Ok(())
}

pub(super) fn validate_conversation_mode(mode: &str) -> Result<()> {
    if !matches!(mode, "orchestrated" | "peer" | "hybrid") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team conversation mode: {mode}"
        )));
    }
    Ok(())
}

pub(super) fn validate_optional_conversation_mode(mode: Option<&str>) -> Result<()> {
    if let Some(mode) = mode {
        validate_conversation_mode(mode)?;
    }
    Ok(())
}

pub(super) fn validate_conversation_state(state: &str) -> Result<()> {
    if !matches!(state, "open" | "paused" | "closed" | "cancelled") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team conversation state: {state}"
        )));
    }
    Ok(())
}

pub(super) fn validate_optional_conversation_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_conversation_state(state)?;
    }
    Ok(())
}

pub(super) fn validate_participant_kind(kind: &str) -> Result<()> {
    if !matches!(kind, "user" | "agent" | "tool" | "system") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team participant kind: {kind}"
        )));
    }
    Ok(())
}

pub(super) fn validate_participant_state(state: &str) -> Result<()> {
    if !matches!(state, "active" | "muted" | "left") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team participant state: {state}"
        )));
    }
    Ok(())
}

pub(super) fn validate_optional_participant_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_participant_state(state)?;
    }
    Ok(())
}

pub(super) fn validate_message_kind(kind: &str) -> Result<()> {
    if !matches!(kind, "message" | "decision" | "handoff" | "system") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team message kind: {kind}"
        )));
    }
    Ok(())
}

pub(super) fn validate_message_state(state: &str) -> Result<()> {
    if !matches!(
        state,
        "admitted" | "routed" | "visible" | "blocked" | "superseded"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team message state: {state}"
        )));
    }
    Ok(())
}

pub(super) fn validate_optional_message_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_message_state(state)?;
    }
    Ok(())
}

pub(super) fn validate_routing_outcome(outcome: &str) -> Result<()> {
    if !matches!(outcome, "deliver" | "blocked") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team routing outcome: {outcome}"
        )));
    }
    Ok(())
}

pub(super) fn validate_delivery_role(role: &str) -> Result<()> {
    if !matches!(role, "speaker" | "observer" | "summarizer") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team delivery role: {role}"
        )));
    }
    Ok(())
}

pub(super) fn validate_delivery_trigger(trigger: &str) -> Result<()> {
    if !matches!(
        trigger,
        "direct" | "mention" | "lead" | "round" | "delegation"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team delivery trigger: {trigger}"
        )));
    }
    Ok(())
}

pub(super) fn validate_delivery_state(state: &str) -> Result<()> {
    if !matches!(
        state,
        "queued" | "dispatched" | "responded" | "passed" | "failed" | "cancelled"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team delivery state: {state}"
        )));
    }
    Ok(())
}

pub(super) fn validate_optional_delivery_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_delivery_state(state)?;
    }
    Ok(())
}

pub(super) fn validate_discussion_round_state(state: &str) -> Result<()> {
    if !matches!(state, "open" | "closed") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid team discussion round state: {state}"
        )));
    }
    Ok(())
}

pub(super) fn validate_optional_discussion_round_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_discussion_round_state(state)?;
    }
    Ok(())
}

pub(super) fn conversation_state_is_terminal(state: &str) -> bool {
    matches!(state, "closed" | "cancelled")
}
