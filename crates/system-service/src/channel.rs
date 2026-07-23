use crate::connector::require_connector_capability_tx;
use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_channel_binding, row_to_channel_delivery, row_to_channel_inbound_event,
    row_to_channel_projection, row_to_scheduler_job,
};
use crate::scheduler::{complete_job_tx, enqueue_job_tx, fail_job_tx};
use crate::{
    ChannelBindingRecord, ChannelDeliveryAcknowledgement, ChannelDeliveryRecord,
    ChannelDeliverySubmission, ChannelInboundEventRecord, ChannelProjectionReceipt,
    ChannelProjectionRecord, CompleteChannelDelivery, CompleteJob, EnqueueJob, EventScope,
    FailChannelDelivery, FailJob, IngestChannelInboundEvent, ListChannelBindings,
    ListChannelInboundEvents, ListChannelProjections, ProjectChannelInboundEvent,
    PutChannelBinding, Result, RevokeChannelBinding, SchedulerJobKind, SchedulerJobRecord,
    SubmitChannelDelivery, SubmitSessionTurn, SystemService, SystemServiceError,
    UpdateChannelInboundEventState,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

const CHANNEL_BINDING_SELECT: &str = "SELECT
    id, connector_id, channel_kind, channel_id, external_identity_id,
    principal_id, display_name, state, metadata_json,
    created_at, updated_at, revoked_at
 FROM channel_binding";

const CHANNEL_INBOUND_EVENT_SELECT: &str = "SELECT
    id, connector_id, channel_kind, channel_id, external_event_id,
    external_thread_id, sender_external_identity_id, principal_id,
    payload_json, state, metadata_json, received_at, created_at, updated_at
 FROM channel_inbound_event";

const CHANNEL_DELIVERY_SELECT: &str = "SELECT
    id, connector_id, channel_kind, channel_id, target_external_identity_id,
    external_thread_id, principal_id, payload_json, state, metadata_json,
    scheduler_job_id, created_at, updated_at, finished_at
 FROM channel_delivery";

const CHANNEL_PROJECTION_SELECT: &str = "SELECT
    id, inbound_event_id, target_kind, target_id, target_job_id,
    state, target_json, metadata_json, idempotency_key, created_at, updated_at
 FROM channel_projection";

const SCHEDULER_JOB_SELECT: &str = "SELECT
    id, kind, state, principal_id, payload_json, scheduled_at, not_before,
    priority, concurrency_key, attempt, max_attempts, retry_policy_json, idempotency_key,
    budget_grant_id, lease_owner, lease_token, lease_expires_at,
    result_json, last_error_json, created_at, updated_at, finished_at
 FROM scheduler_job";

impl SystemService {
    pub fn put_channel_binding(&self, request: &PutChannelBinding) -> Result<ChannelBindingRecord> {
        validate_put_channel_binding(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("bind_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        require_connector_capability_tx(&tx, &request.connector_id, "channel.connect")?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CHANNEL_BINDING_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_channel_binding,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_channel_binding(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_channel_binding_by_external_tx(
            &tx,
            &request.connector_id,
            &request.channel_id,
            &request.external_identity_id,
        )? {
            validate_existing_channel_binding(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO channel_binding (
                id, connector_id, channel_kind, channel_id, external_identity_id,
                principal_id, display_name, state, metadata_json, idempotency_key,
                created_at, updated_at, revoked_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.connector_id,
                request.channel_kind,
                request.channel_id,
                request.external_identity_id,
                request.principal_id,
                request.display_name,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.binding.put",
            &serde_json::json!({
                "connectorId": request.connector_id,
                "channelKind": request.channel_kind,
                "channelId": request.channel_id,
                "externalIdentityId": request.external_identity_id,
                "principalId": request.principal_id
            }),
            now,
        )?;
        let record = get_channel_binding_by_id_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("channel binding insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_channel_bindings(
        &self,
        request: &ListChannelBindings,
    ) -> Result<Vec<ChannelBindingRecord>> {
        validate_optional_channel_binding_state(request.state.as_deref())?;
        validate_optional_filter("connector_id", request.connector_id.as_deref())?;
        validate_optional_filter("channel_kind", request.channel_kind.as_deref())?;
        validate_optional_filter("channel_id", request.channel_id.as_deref())?;
        validate_optional_filter("principal_id", request.principal_id.as_deref())?;
        validate_optional_filter(
            "external_identity_id",
            request.external_identity_id.as_deref(),
        )?;
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{CHANNEL_BINDING_SELECT}
             WHERE (?1 IS NULL OR connector_id = ?1)
               AND (?2 IS NULL OR channel_kind = ?2)
               AND (?3 IS NULL OR channel_id = ?3)
               AND (?4 IS NULL OR principal_id = ?4)
               AND (?5 IS NULL OR external_identity_id = ?5)
               AND (?6 IS NULL OR state = ?6)
             ORDER BY updated_at DESC, id ASC
             LIMIT ?7"
        ))?;
        let records = collect_channel_bindings(stmt.query_map(
            params![
                request.connector_id,
                request.channel_kind,
                request.channel_id,
                request.principal_id,
                request.external_identity_id,
                request.state,
                limit
            ],
            row_to_channel_binding,
        )?)?;
        Ok(records)
    }

    pub fn revoke_channel_binding(
        &self,
        request: &RevokeChannelBinding,
    ) -> Result<ChannelBindingRecord> {
        if request.binding_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "channel binding id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing =
            get_channel_binding_by_id_tx(&tx, &request.binding_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel binding does not exist: {}",
                    request.binding_id
                ))
            })?;
        tx.execute(
            "UPDATE channel_binding
             SET state = 'revoked', updated_at = ?, revoked_at = ?
             WHERE id = ?",
            params![now, now, existing.id],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.binding.revoked",
            &serde_json::json!({
                "bindingId": existing.id,
                "connectorId": existing.connector_id,
                "channelId": existing.channel_id,
                "externalIdentityId": existing.external_identity_id
            }),
            now,
        )?;
        let record = get_channel_binding_by_id_tx(&tx, &existing.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "channel binding update missing: {}",
                existing.id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn ingest_channel_inbound_event(
        &self,
        request: &IngestChannelInboundEvent,
    ) -> Result<ChannelInboundEventRecord> {
        validate_ingest_channel_inbound_event(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("chin_{}", Uuid::now_v7()));
        let payload_json = serde_json::to_string(&request.payload)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let received_at = request.received_at.unwrap_or(now);
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        require_connector_capability_tx(&tx, &request.connector_id, "channel.receive")?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CHANNEL_INBOUND_EVENT_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_channel_inbound_event,
                )
                .optional()?;
            if let Some(record) = existing {
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_channel_inbound_event_by_external_tx(
            &tx,
            &request.connector_id,
            &request.channel_id,
            &request.external_event_id,
        )? {
            tx.commit()?;
            return Ok(record);
        }

        let principal_id = if request.principal_id.is_some() {
            request.principal_id.clone()
        } else {
            get_active_channel_binding_principal_tx(
                &tx,
                &request.connector_id,
                &request.channel_id,
                &request.sender_external_identity_id,
            )?
        };

        tx.execute(
            "INSERT INTO channel_inbound_event (
                id, connector_id, channel_kind, channel_id, external_event_id,
                external_thread_id, sender_external_identity_id, principal_id,
                payload_json, state, metadata_json, idempotency_key,
                received_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?)",
            params![
                id,
                request.connector_id,
                request.channel_kind,
                request.channel_id,
                request.external_event_id,
                request.external_thread_id,
                request.sender_external_identity_id,
                principal_id,
                payload_json,
                metadata_json,
                request.idempotency_key,
                received_at,
                now,
                now
            ],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.inbound.received",
            &serde_json::json!({
                "eventId": id,
                "connectorId": request.connector_id,
                "channelKind": request.channel_kind,
                "channelId": request.channel_id,
                "externalEventId": request.external_event_id,
                "principalId": principal_id
            }),
            now,
        )?;
        let record = get_channel_inbound_event_by_id_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("channel inbound event insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_channel_inbound_events(
        &self,
        request: &ListChannelInboundEvents,
    ) -> Result<Vec<ChannelInboundEventRecord>> {
        validate_optional_channel_inbound_event_state(request.state.as_deref())?;
        validate_optional_filter("connector_id", request.connector_id.as_deref())?;
        validate_optional_filter("channel_kind", request.channel_kind.as_deref())?;
        validate_optional_filter("channel_id", request.channel_id.as_deref())?;
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{CHANNEL_INBOUND_EVENT_SELECT}
             WHERE (?1 IS NULL OR connector_id = ?1)
               AND (?2 IS NULL OR channel_kind = ?2)
               AND (?3 IS NULL OR channel_id = ?3)
               AND (?4 IS NULL OR state = ?4)
               AND (?5 IS NULL OR received_at > ?5)
             ORDER BY received_at ASC, id ASC
             LIMIT ?6"
        ))?;
        let records = collect_channel_inbound_events(stmt.query_map(
            params![
                request.connector_id,
                request.channel_kind,
                request.channel_id,
                request.state,
                request.after_received_at,
                limit
            ],
            row_to_channel_inbound_event,
        )?)?;
        Ok(records)
    }

    pub fn update_channel_inbound_event_state(
        &self,
        request: &UpdateChannelInboundEventState,
    ) -> Result<ChannelInboundEventRecord> {
        validate_channel_inbound_event_state(&request.state)?;
        if request.event_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "channel inbound event id must not be empty".to_string(),
            ));
        }
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing =
            get_channel_inbound_event_by_id_tx(&tx, &request.event_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel inbound event does not exist: {}",
                    request.event_id
                ))
            })?;
        tx.execute(
            "UPDATE channel_inbound_event
             SET state = ?, metadata_json = COALESCE(?, metadata_json), updated_at = ?
             WHERE id = ?",
            params![request.state, metadata_json, now, existing.id],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.inbound.state_updated",
            &serde_json::json!({
                "eventId": existing.id,
                "fromState": existing.state,
                "toState": request.state
            }),
            now,
        )?;
        let record = get_channel_inbound_event_by_id_tx(&tx, &existing.id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "channel inbound event update missing: {}",
                existing.id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn submit_channel_delivery(
        &self,
        request: &SubmitChannelDelivery,
    ) -> Result<ChannelDeliverySubmission> {
        validate_submit_channel_delivery(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("chdel_{}", Uuid::now_v7()));
        let payload_json = serde_json::to_string(&request.payload)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        require_connector_capability_tx(&tx, &request.connector_id, "channel.deliver")?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CHANNEL_DELIVERY_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_channel_delivery,
                )
                .optional()?;
            if let Some(delivery) = existing {
                let job = get_scheduler_job_by_id_tx(
                    &tx,
                    delivery.scheduler_job_id.as_deref().ok_or_else(|| {
                        SystemServiceError::Invariant(format!(
                            "channel delivery missing scheduler job: {}",
                            delivery.id
                        ))
                    })?,
                )?;
                tx.commit()?;
                return Ok(ChannelDeliverySubmission { delivery, job });
            }
        }

        tx.execute(
            "INSERT INTO channel_delivery (
                id, connector_id, channel_kind, channel_id, target_external_identity_id,
                external_thread_id, principal_id, payload_json, state, metadata_json,
                scheduler_job_id, idempotency_key, created_at, updated_at, finished_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?, NULL)",
            params![
                id,
                request.connector_id,
                request.channel_kind,
                request.channel_id,
                request.target_external_identity_id,
                request.external_thread_id,
                request.principal_id,
                payload_json,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        let job_idempotency_key = request
            .idempotency_key
            .as_ref()
            .map(|key| format!("channel.delivery:{key}:job"))
            .unwrap_or_else(|| format!("channel.delivery:{id}:job"));
        let job = enqueue_job_tx(
            &tx,
            &EnqueueJob {
                id: request.job_id.clone(),
                kind: SchedulerJobKind::ChannelDelivery,
                principal_id: request.principal_id.clone(),
                payload: serde_json::json!({
                    "deliveryId": id,
                    "connectorId": request.connector_id,
                    "channelKind": request.channel_kind,
                    "channelId": request.channel_id,
                    "targetExternalIdentityId": request.target_external_identity_id,
                    "externalThreadId": request.external_thread_id,
                    "payload": request.payload
                }),
                scheduled_at: request.scheduled_at,
                not_before: request.not_before,
                priority: request.priority,
                concurrency_key: None,
                max_attempts: request.max_attempts,
                retry_policy: request.retry_policy.clone(),
                idempotency_key: Some(job_idempotency_key),
                budget_grant_id: request.budget_grant_id.clone(),
            },
            now,
        )?;
        tx.execute(
            "UPDATE channel_delivery
             SET scheduler_job_id = ?, updated_at = ?
             WHERE id = ?",
            params![job.id, now, id],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.delivery.submitted",
            &serde_json::json!({
                "deliveryId": id,
                "jobId": job.id,
                "connectorId": request.connector_id,
                "channelKind": request.channel_kind,
                "channelId": request.channel_id
            }),
            now,
        )?;
        let delivery = get_channel_delivery_by_id_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("channel delivery insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(ChannelDeliverySubmission { delivery, job })
    }

    pub fn complete_channel_delivery(
        &self,
        request: &CompleteChannelDelivery,
    ) -> Result<Option<ChannelDeliveryAcknowledgement>> {
        validate_complete_channel_delivery(request)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let delivery =
            get_channel_delivery_by_id_tx(&tx, &request.delivery_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel delivery does not exist: {}",
                    request.delivery_id
                ))
            })?;
        let job_id = delivery.scheduler_job_id.as_deref().ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "channel delivery missing scheduler job: {}",
                delivery.id
            ))
        })?;
        let job = get_scheduler_job_by_id_tx(&tx, job_id)?;
        validate_channel_delivery_job(&delivery, &job)?;
        if delivery.state == "sent" && job.state == "succeeded" {
            tx.commit()?;
            return Ok(Some(ChannelDeliveryAcknowledgement { delivery, job }));
        }
        if delivery.state != "pending" {
            return Err(SystemServiceError::Invariant(format!(
                "channel delivery cannot be completed from state: {}",
                delivery.state
            )));
        }

        let Some(completed_job) = complete_job_tx(
            &tx,
            &CompleteJob {
                job_id: job_id.to_string(),
                worker_id: request.worker_id.clone(),
                lease_token: request.lease_token.clone(),
                result: request.result.clone(),
            },
            now,
        )?
        else {
            tx.commit()?;
            return Ok(None);
        };
        tx.execute(
            "UPDATE channel_delivery
             SET state = 'sent',
                 metadata_json = COALESCE(?, metadata_json),
                 updated_at = ?,
                 finished_at = ?
             WHERE id = ? AND state = 'pending'",
            params![metadata_json, now, now, delivery.id],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.delivery.sent",
            &serde_json::json!({
                "deliveryId": delivery.id,
                "jobId": completed_job.id,
                "connectorId": delivery.connector_id,
                "channelKind": delivery.channel_kind,
                "channelId": delivery.channel_id
            }),
            now,
        )?;
        let updated_delivery =
            get_channel_delivery_by_id_tx(&tx, &delivery.id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel delivery complete missing: {}",
                    delivery.id
                ))
            })?;
        tx.commit()?;
        Ok(Some(ChannelDeliveryAcknowledgement {
            delivery: updated_delivery,
            job: completed_job,
        }))
    }

    pub fn fail_channel_delivery(
        &self,
        request: &FailChannelDelivery,
    ) -> Result<Option<ChannelDeliveryAcknowledgement>> {
        validate_fail_channel_delivery(request)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let delivery =
            get_channel_delivery_by_id_tx(&tx, &request.delivery_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel delivery does not exist: {}",
                    request.delivery_id
                ))
            })?;
        let job_id = delivery.scheduler_job_id.as_deref().ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "channel delivery missing scheduler job: {}",
                delivery.id
            ))
        })?;
        let job = get_scheduler_job_by_id_tx(&tx, job_id)?;
        validate_channel_delivery_job(&delivery, &job)?;
        if delivery.state == "failed" && job.state == "failed" {
            tx.commit()?;
            return Ok(Some(ChannelDeliveryAcknowledgement { delivery, job }));
        }
        if delivery.state != "pending" {
            return Err(SystemServiceError::Invariant(format!(
                "channel delivery cannot be failed from state: {}",
                delivery.state
            )));
        }

        let Some(failed_job) = fail_job_tx(
            &tx,
            &FailJob {
                job_id: job_id.to_string(),
                worker_id: request.worker_id.clone(),
                lease_token: request.lease_token.clone(),
                error: request.error.clone(),
            },
            now,
        )?
        else {
            tx.commit()?;
            return Ok(None);
        };
        let terminal = failed_job.state == "failed";
        tx.execute(
            "UPDATE channel_delivery
             SET state = ?,
                 metadata_json = COALESCE(?, metadata_json),
                 updated_at = ?,
                 finished_at = ?
             WHERE id = ? AND state = 'pending'",
            params![
                if terminal { "failed" } else { "pending" },
                metadata_json,
                now,
                if terminal { Some(now) } else { None },
                delivery.id
            ],
        )?;
        append_channel_event_tx(
            &tx,
            if terminal {
                "channel.delivery.failed"
            } else {
                "channel.delivery.retry_scheduled"
            },
            &serde_json::json!({
                "deliveryId": delivery.id,
                "jobId": failed_job.id,
                "connectorId": delivery.connector_id,
                "channelKind": delivery.channel_kind,
                "channelId": delivery.channel_id,
                "jobState": failed_job.state,
                "error": request.error
            }),
            now,
        )?;
        let updated_delivery =
            get_channel_delivery_by_id_tx(&tx, &delivery.id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel delivery fail missing: {}",
                    delivery.id
                ))
            })?;
        tx.commit()?;
        Ok(Some(ChannelDeliveryAcknowledgement {
            delivery: updated_delivery,
            job: failed_job,
        }))
    }

    pub fn project_channel_inbound_event(
        &self,
        request: &ProjectChannelInboundEvent,
    ) -> Result<ChannelProjectionReceipt> {
        validate_project_channel_inbound_event(request)?;
        let projection_id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("chproj_{}", Uuid::now_v7()));
        let target = ProjectionTarget::parse(&request.target)?;
        let target_json = serde_json::to_string(&request.target)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let inbound = get_channel_inbound_event_by_id_tx(&tx, &request.inbound_event_id)?
            .ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel inbound event does not exist: {}",
                    request.inbound_event_id
                ))
            })?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{CHANNEL_PROJECTION_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_channel_projection,
                )
                .optional()?;
            if let Some(projection) = existing {
                let job = projection
                    .target_job_id
                    .as_deref()
                    .map(|job_id| get_scheduler_job_by_id_tx(&tx, job_id))
                    .transpose()?;
                tx.commit()?;
                return Ok(ChannelProjectionReceipt { projection, job });
            }
        }

        if let Some(projection) =
            get_channel_projection_by_inbound_kind_tx(&tx, &inbound.id, target.kind())?
        {
            let job = projection
                .target_job_id
                .as_deref()
                .map(|job_id| get_scheduler_job_by_id_tx(&tx, job_id))
                .transpose()?;
            tx.commit()?;
            return Ok(ChannelProjectionReceipt { projection, job });
        }

        let outcome = apply_projection_target_tx(&tx, &projection_id, &inbound.id, &target, now)?;
        tx.execute(
            "INSERT INTO channel_projection (
                id, inbound_event_id, target_kind, target_id, target_job_id,
                state, target_json, metadata_json, idempotency_key, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                projection_id,
                inbound.id,
                target.kind(),
                outcome.target_id,
                outcome.job.as_ref().map(|job| job.id.clone()),
                if target.kind() == "ignored" {
                    "ignored"
                } else {
                    "projected"
                },
                target_json,
                metadata_json,
                request.idempotency_key,
                now,
                now
            ],
        )?;
        tx.execute(
            "UPDATE channel_inbound_event
             SET state = ?, updated_at = ?
             WHERE id = ?",
            params![
                if target.kind() == "ignored" {
                    "ignored"
                } else {
                    "projected"
                },
                now,
                inbound.id
            ],
        )?;
        append_channel_event_tx(
            &tx,
            "channel.inbound.projected",
            &serde_json::json!({
                "projectionId": projection_id,
                "inboundEventId": inbound.id,
                "targetKind": target.kind(),
                "targetId": outcome.target_id,
                "targetJobId": outcome.job.as_ref().map(|job| job.id.clone())
            }),
            now,
        )?;
        let projection =
            get_channel_projection_by_id_tx(&tx, &projection_id)?.ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel projection insert missing: {projection_id}"
                ))
            })?;
        tx.commit()?;
        Ok(ChannelProjectionReceipt {
            projection,
            job: outcome.job,
        })
    }

    pub fn list_channel_projections(
        &self,
        request: &ListChannelProjections,
    ) -> Result<Vec<ChannelProjectionRecord>> {
        validate_optional_filter("inbound_event_id", request.inbound_event_id.as_deref())?;
        if let Some(target_kind) = &request.target_kind {
            validate_projection_target_kind(target_kind)?;
        }
        let conn = self.connect()?;
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let mut stmt = conn.prepare(&format!(
            "{CHANNEL_PROJECTION_SELECT}
             WHERE (?1 IS NULL OR inbound_event_id = ?1)
               AND (?2 IS NULL OR target_kind = ?2)
             ORDER BY created_at ASC, id ASC
             LIMIT ?3"
        ))?;
        let records = collect_channel_projections(stmt.query_map(
            params![request.inbound_event_id, request.target_kind, limit],
            row_to_channel_projection,
        )?)?;
        Ok(records)
    }
}

fn validate_put_channel_binding(request: &PutChannelBinding) -> Result<()> {
    validate_non_empty("connector_id", &request.connector_id)?;
    validate_non_empty("channel_kind", &request.channel_kind)?;
    validate_non_empty("channel_id", &request.channel_id)?;
    validate_non_empty("external_identity_id", &request.external_identity_id)?;
    validate_non_empty("principal_id", &request.principal_id)?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    Ok(())
}

fn validate_ingest_channel_inbound_event(request: &IngestChannelInboundEvent) -> Result<()> {
    validate_non_empty("connector_id", &request.connector_id)?;
    validate_non_empty("channel_kind", &request.channel_kind)?;
    validate_non_empty("channel_id", &request.channel_id)?;
    validate_non_empty("external_event_id", &request.external_event_id)?;
    validate_non_empty(
        "sender_external_identity_id",
        &request.sender_external_identity_id,
    )?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter("external_thread_id", request.external_thread_id.as_deref())?;
    validate_optional_filter("principal_id", request.principal_id.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    Ok(())
}

fn validate_submit_channel_delivery(request: &SubmitChannelDelivery) -> Result<()> {
    validate_non_empty("connector_id", &request.connector_id)?;
    validate_non_empty("channel_kind", &request.channel_kind)?;
    validate_non_empty("channel_id", &request.channel_id)?;
    validate_non_empty("principal_id", &request.principal_id)?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter(
        "target_external_identity_id",
        request.target_external_identity_id.as_deref(),
    )?;
    validate_optional_filter("external_thread_id", request.external_thread_id.as_deref())?;
    validate_optional_filter("job_id", request.job_id.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    Ok(())
}

fn validate_complete_channel_delivery(request: &CompleteChannelDelivery) -> Result<()> {
    validate_non_empty("delivery_id", &request.delivery_id)?;
    validate_non_empty("worker_id", &request.worker_id)?;
    validate_non_empty("lease_token", &request.lease_token)?;
    Ok(())
}

fn validate_fail_channel_delivery(request: &FailChannelDelivery) -> Result<()> {
    validate_non_empty("delivery_id", &request.delivery_id)?;
    validate_non_empty("worker_id", &request.worker_id)?;
    validate_non_empty("lease_token", &request.lease_token)?;
    Ok(())
}

fn validate_project_channel_inbound_event(request: &ProjectChannelInboundEvent) -> Result<()> {
    validate_non_empty("inbound_event_id", &request.inbound_event_id)?;
    validate_optional_filter("id", request.id.as_deref())?;
    validate_optional_filter("idempotency_key", request.idempotency_key.as_deref())?;
    Ok(())
}

fn validate_projection_target_kind(kind: &str) -> Result<()> {
    if !matches!(
        kind,
        "session.turn" | "team.turn" | "workspace.task" | "ignored"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid channel projection target kind: {kind}"
        )));
    }
    Ok(())
}

fn validate_channel_delivery_job(
    delivery: &ChannelDeliveryRecord,
    job: &SchedulerJobRecord,
) -> Result<()> {
    if job.kind != "channel.delivery" {
        return Err(SystemServiceError::Invariant(format!(
            "channel delivery job has invalid kind: {}",
            job.kind
        )));
    }
    if delivery.scheduler_job_id.as_deref() != Some(&job.id) {
        return Err(SystemServiceError::Invariant(
            "channel delivery scheduler job mismatch".to_string(),
        ));
    }
    Ok(())
}

fn validate_non_empty(name: &str, value: &str) -> Result<()> {
    if value.is_empty() {
        return Err(SystemServiceError::Invariant(format!(
            "channel {name} must not be empty"
        )));
    }
    Ok(())
}

fn validate_optional_filter(name: &str, value: Option<&str>) -> Result<()> {
    if value == Some("") {
        return Err(SystemServiceError::Invariant(format!(
            "channel {name} must not be empty"
        )));
    }
    Ok(())
}

fn validate_channel_binding_state(state: &str) -> Result<()> {
    if !matches!(state, "active" | "revoked") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid channel binding state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_channel_binding_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_channel_binding_state(state)?;
    }
    Ok(())
}

fn validate_channel_inbound_event_state(state: &str) -> Result<()> {
    if !matches!(state, "received" | "projected" | "ignored" | "failed") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid channel inbound event state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_channel_inbound_event_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_channel_inbound_event_state(state)?;
    }
    Ok(())
}

fn validate_existing_channel_binding(
    record: &ChannelBindingRecord,
    request: &PutChannelBinding,
) -> Result<()> {
    if record.connector_id != request.connector_id
        || record.channel_kind != request.channel_kind
        || record.channel_id != request.channel_id
        || record.external_identity_id != request.external_identity_id
        || record.principal_id != request.principal_id
    {
        return Err(SystemServiceError::Invariant(
            "channel binding idempotency conflict".to_string(),
        ));
    }
    Ok(())
}

fn get_channel_binding_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ChannelBindingRecord>> {
    tx.query_row(
        &format!("{CHANNEL_BINDING_SELECT} WHERE id = ?"),
        params![id],
        row_to_channel_binding,
    )
    .optional()
    .map_err(Into::into)
}

fn get_channel_binding_by_external_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    channel_id: &str,
    external_identity_id: &str,
) -> Result<Option<ChannelBindingRecord>> {
    tx.query_row(
        &format!(
            "{CHANNEL_BINDING_SELECT}
             WHERE connector_id = ? AND channel_id = ? AND external_identity_id = ?"
        ),
        params![connector_id, channel_id, external_identity_id],
        row_to_channel_binding,
    )
    .optional()
    .map_err(Into::into)
}

fn get_active_channel_binding_principal_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    channel_id: &str,
    external_identity_id: &str,
) -> Result<Option<String>> {
    tx.query_row(
        "SELECT principal_id
         FROM channel_binding
         WHERE connector_id = ?
           AND channel_id = ?
           AND external_identity_id = ?
           AND state = 'active'
         ORDER BY updated_at DESC, id ASC
         LIMIT 1",
        params![connector_id, channel_id, external_identity_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

fn get_channel_inbound_event_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ChannelInboundEventRecord>> {
    tx.query_row(
        &format!("{CHANNEL_INBOUND_EVENT_SELECT} WHERE id = ?"),
        params![id],
        row_to_channel_inbound_event,
    )
    .optional()
    .map_err(Into::into)
}

fn get_channel_inbound_event_by_external_tx(
    tx: &rusqlite::Transaction<'_>,
    connector_id: &str,
    channel_id: &str,
    external_event_id: &str,
) -> Result<Option<ChannelInboundEventRecord>> {
    tx.query_row(
        &format!(
            "{CHANNEL_INBOUND_EVENT_SELECT}
             WHERE connector_id = ? AND channel_id = ? AND external_event_id = ?"
        ),
        params![connector_id, channel_id, external_event_id],
        row_to_channel_inbound_event,
    )
    .optional()
    .map_err(Into::into)
}

fn get_channel_delivery_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ChannelDeliveryRecord>> {
    tx.query_row(
        &format!("{CHANNEL_DELIVERY_SELECT} WHERE id = ?"),
        params![id],
        row_to_channel_delivery,
    )
    .optional()
    .map_err(Into::into)
}

fn get_channel_projection_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<Option<ChannelProjectionRecord>> {
    tx.query_row(
        &format!("{CHANNEL_PROJECTION_SELECT} WHERE id = ?"),
        params![id],
        row_to_channel_projection,
    )
    .optional()
    .map_err(Into::into)
}

fn get_channel_projection_by_inbound_kind_tx(
    tx: &rusqlite::Transaction<'_>,
    inbound_event_id: &str,
    target_kind: &str,
) -> Result<Option<ChannelProjectionRecord>> {
    tx.query_row(
        &format!(
            "{CHANNEL_PROJECTION_SELECT}
             WHERE inbound_event_id = ? AND target_kind = ?"
        ),
        params![inbound_event_id, target_kind],
        row_to_channel_projection,
    )
    .optional()
    .map_err(Into::into)
}

fn get_scheduler_job_by_id_tx(
    tx: &rusqlite::Transaction<'_>,
    job_id: &str,
) -> Result<SchedulerJobRecord> {
    tx.query_row(
        &format!("{SCHEDULER_JOB_SELECT} WHERE id = ?"),
        params![job_id],
        row_to_scheduler_job,
    )
    .optional()?
    .ok_or_else(|| SystemServiceError::Invariant(format!("scheduler job not found: {job_id}")))
}

fn apply_projection_target_tx(
    tx: &rusqlite::Transaction<'_>,
    projection_id: &str,
    inbound_event_id: &str,
    target: &ProjectionTarget,
    now: i64,
) -> Result<ProjectionOutcome> {
    match target {
        ProjectionTarget::SessionTurn(target) => {
            let receipt = submit_session_turn_projection_tx(
                tx,
                projection_id,
                inbound_event_id,
                target,
                now,
            )?;
            Ok(ProjectionOutcome {
                target_id: Some(receipt.turn.id),
                job: Some(receipt.job),
            })
        }
        ProjectionTarget::TeamTurn(target) => {
            let turn_id = append_team_turn_projection_tx(tx, projection_id, target, now)?;
            Ok(ProjectionOutcome {
                target_id: Some(turn_id),
                job: None,
            })
        }
        ProjectionTarget::WorkspaceTask(target) => {
            let job = enqueue_workspace_task_projection_tx(
                tx,
                projection_id,
                inbound_event_id,
                target,
                now,
            )?;
            Ok(ProjectionOutcome {
                target_id: target.task_id.clone(),
                job: Some(job),
            })
        }
        ProjectionTarget::Ignored(_) => Ok(ProjectionOutcome {
            target_id: None,
            job: None,
        }),
    }
}

fn submit_session_turn_projection_tx(
    tx: &rusqlite::Transaction<'_>,
    projection_id: &str,
    inbound_event_id: &str,
    target: &SessionTurnProjectionTarget,
    now: i64,
) -> Result<crate::SubmitSessionTurnReceipt> {
    crate::sessions::submit_session_turn_tx(
        tx,
        &SubmitSessionTurn {
            id: target
                .input_id
                .clone()
                .or_else(|| Some(format!("inp_{projection_id}"))),
            turn_id: target
                .turn_id
                .clone()
                .or_else(|| Some(format!("turn_{projection_id}"))),
            session_id: target.session_id.clone(),
            principal_id: target.principal_id.clone(),
            idempotency_key: format!("channel.projection:{inbound_event_id}:session.turn"),
            input_type: target.input_type.clone(),
            content: target.content.clone(),
            origin: Some(serde_json::json!({
                "kind": "connector",
                "sourceRef": inbound_event_id,
                "parentRef": projection_id
            })),
            intent: Some("normal".to_string()),
            run_control_policy: None,
            expected_turn_id: None,
            job_id: target.job_id.clone(),
            job_idempotency_key: Some(format!(
                "channel.projection:{inbound_event_id}:session.turn:job"
            )),
            execution_binding: target.execution_binding.clone(),
            max_steps: target.max_steps,
            parent_turn_id: target.parent_turn_id.clone(),
            regenerates_turn_id: target.regenerates_turn_id.clone(),
            scheduled_at: target.scheduled_at,
            not_before: target.not_before,
            priority: target.priority,
            budget_grant_id: target.budget_grant_id.clone(),
        },
        now,
    )
}

fn append_team_turn_projection_tx(
    tx: &rusqlite::Transaction<'_>,
    projection_id: &str,
    target: &TeamTurnProjectionTarget,
    now: i64,
) -> Result<String> {
    crate::team::append_team_turn_tx(
        tx,
        &crate::AppendTeamTurn {
            id: target
                .turn_id
                .clone()
                .or_else(|| Some(format!("tturn_{projection_id}"))),
            conversation_id: target.conversation_id.clone(),
            speaker_participant_id: target.speaker_participant_id.clone(),
            audience_participant_ids: target.audience_participant_ids.clone(),
            kind: target.turn_kind.clone(),
            content: target.content.clone(),
            metadata: target.metadata.clone(),
        },
        now,
    )
    .map(|turn| turn.id)
}

fn enqueue_workspace_task_projection_tx(
    tx: &rusqlite::Transaction<'_>,
    projection_id: &str,
    inbound_event_id: &str,
    target: &WorkspaceTaskProjectionTarget,
    now: i64,
) -> Result<SchedulerJobRecord> {
    enqueue_job_tx(
        tx,
        &EnqueueJob {
            id: target
                .job_id
                .clone()
                .or_else(|| Some(format!("job_{projection_id}"))),
            kind: SchedulerJobKind::WorkspaceTask,
            principal_id: target.principal_id.clone(),
            payload: workspace_task_payload(target),
            scheduled_at: target.scheduled_at,
            not_before: target.not_before,
            priority: target.priority,
            concurrency_key: None,
            max_attempts: target.max_attempts,
            retry_policy: target.retry_policy.clone(),
            idempotency_key: Some(format!(
                "channel.projection:{inbound_event_id}:workspace.task:job"
            )),
            budget_grant_id: target.budget_grant_id.clone(),
        },
        now,
    )
}

fn workspace_task_payload(target: &WorkspaceTaskProjectionTarget) -> serde_json::Value {
    let mut payload = serde_json::json!({
        "handlerId": target.handler_id,
        "principalId": target.principal_id
    });
    if let Some(task_id) = &target.task_id {
        payload["taskId"] = serde_json::json!(task_id);
    }
    if let Some(workspace_id) = &target.workspace_id {
        payload["workspaceId"] = serde_json::json!(workspace_id);
    }
    if let Some(job_id) = &target.job_id {
        payload["jobId"] = serde_json::json!(job_id);
    }
    if let Some(agent_id) = &target.agent_id {
        payload["agentId"] = serde_json::json!(agent_id);
    }
    if let Some(keep_lease) = target.keep_lease {
        payload["keepLease"] = serde_json::json!(keep_lease);
    }
    if let Some(isolation) = &target.isolation {
        payload["isolation"] = isolation.clone();
    }
    if let Some(metadata) = &target.metadata {
        payload["metadata"] = metadata.clone();
    }
    payload
}

struct ProjectionOutcome {
    target_id: Option<String>,
    job: Option<SchedulerJobRecord>,
}

#[derive(Debug)]
enum ProjectionTarget {
    SessionTurn(SessionTurnProjectionTarget),
    TeamTurn(TeamTurnProjectionTarget),
    WorkspaceTask(WorkspaceTaskProjectionTarget),
    Ignored(()),
}

impl ProjectionTarget {
    fn parse(value: &serde_json::Value) -> Result<Self> {
        let kind = expect_json_string(value, "kind")?;
        validate_projection_target_kind(kind)?;
        match kind {
            "session.turn" => Ok(Self::SessionTurn(SessionTurnProjectionTarget::parse(
                value,
            )?)),
            "team.turn" => Ok(Self::TeamTurn(TeamTurnProjectionTarget::parse(value)?)),
            "workspace.task" => Ok(Self::WorkspaceTask(WorkspaceTaskProjectionTarget::parse(
                value,
            )?)),
            "ignored" => {
                let reason = expect_json_string(value, "reason")?;
                if reason.is_empty() {
                    return Err(SystemServiceError::Invariant(
                        "ignored projection reason must not be empty".to_string(),
                    ));
                }
                Ok(Self::Ignored(()))
            }
            _ => unreachable!("projection target kind already validated"),
        }
    }

    fn kind(&self) -> &'static str {
        match self {
            Self::SessionTurn(_) => "session.turn",
            Self::TeamTurn(_) => "team.turn",
            Self::WorkspaceTask(_) => "workspace.task",
            Self::Ignored(_) => "ignored",
        }
    }
}

#[derive(Debug)]
struct SessionTurnProjectionTarget {
    session_id: String,
    principal_id: String,
    content: serde_json::Value,
    input_id: Option<String>,
    turn_id: Option<String>,
    input_type: Option<String>,
    execution_binding: serde_json::Value,
    max_steps: Option<i64>,
    parent_turn_id: Option<String>,
    regenerates_turn_id: Option<String>,
    job_id: Option<String>,
    scheduled_at: Option<i64>,
    not_before: Option<i64>,
    priority: Option<i64>,
    budget_grant_id: Option<String>,
}

impl SessionTurnProjectionTarget {
    fn parse(value: &serde_json::Value) -> Result<Self> {
        Ok(Self {
            session_id: required_string(value, "sessionId")?,
            principal_id: required_string(value, "principalId")?,
            content: required_json(value, "content")?.clone(),
            input_id: optional_string_json(value, "inputId")?,
            turn_id: optional_string_json(value, "turnId")?,
            input_type: optional_string_json(value, "inputType")?,
            execution_binding: required_json(value, "executionBinding")?.clone(),
            max_steps: optional_i64_json(value, "maxSteps")?,
            parent_turn_id: optional_string_json(value, "parentTurnId")?,
            regenerates_turn_id: optional_string_json(value, "regeneratesTurnId")?,
            job_id: optional_string_json(value, "jobId")?,
            scheduled_at: optional_i64_json(value, "scheduledAt")?,
            not_before: optional_i64_json(value, "notBefore")?,
            priority: optional_i64_json(value, "priority")?,
            budget_grant_id: optional_string_json(value, "budgetGrantId")?,
        })
    }
}

#[derive(Debug)]
struct TeamTurnProjectionTarget {
    conversation_id: String,
    speaker_participant_id: String,
    content: serde_json::Value,
    turn_id: Option<String>,
    audience_participant_ids: Option<Vec<String>>,
    turn_kind: Option<String>,
    metadata: Option<serde_json::Value>,
}

impl TeamTurnProjectionTarget {
    fn parse(value: &serde_json::Value) -> Result<Self> {
        Ok(Self {
            conversation_id: required_string(value, "conversationId")?,
            speaker_participant_id: required_string(value, "speakerParticipantId")?,
            content: required_json(value, "content")?.clone(),
            turn_id: optional_string_json(value, "turnId")?,
            audience_participant_ids: optional_string_array_json(value, "audienceParticipantIds")?,
            turn_kind: optional_string_json(value, "turnKind")?,
            metadata: optional_json(value, "metadata").cloned(),
        })
    }
}

#[derive(Debug)]
struct WorkspaceTaskProjectionTarget {
    handler_id: String,
    principal_id: String,
    task_id: Option<String>,
    workspace_id: Option<String>,
    job_id: Option<String>,
    agent_id: Option<String>,
    keep_lease: Option<bool>,
    isolation: Option<serde_json::Value>,
    metadata: Option<serde_json::Value>,
    scheduled_at: Option<i64>,
    not_before: Option<i64>,
    priority: Option<i64>,
    max_attempts: Option<i64>,
    retry_policy: Option<crate::RetryPolicy>,
    budget_grant_id: Option<String>,
}

impl WorkspaceTaskProjectionTarget {
    fn parse(value: &serde_json::Value) -> Result<Self> {
        Ok(Self {
            handler_id: required_string(value, "handlerId")?,
            principal_id: required_string(value, "principalId")?,
            task_id: optional_string_json(value, "taskId")?,
            workspace_id: optional_string_json(value, "workspaceId")?,
            job_id: optional_string_json(value, "jobId")?,
            agent_id: optional_string_json(value, "agentId")?,
            keep_lease: optional_bool_json(value, "keepLease")?,
            isolation: optional_json(value, "isolation").cloned(),
            metadata: optional_json(value, "metadata").cloned(),
            scheduled_at: optional_i64_json(value, "scheduledAt")?,
            not_before: optional_i64_json(value, "notBefore")?,
            priority: optional_i64_json(value, "priority")?,
            max_attempts: optional_i64_json(value, "maxAttempts")?,
            retry_policy: optional_retry_policy_json(value, "retryPolicy")?,
            budget_grant_id: optional_string_json(value, "budgetGrantId")?,
        })
    }
}

fn required_string(value: &serde_json::Value, field: &str) -> Result<String> {
    let raw = expect_json_string(value, field)?;
    if raw.is_empty() {
        return Err(SystemServiceError::Invariant(format!(
            "channel projection {field} must not be empty"
        )));
    }
    Ok(raw.to_string())
}

fn expect_json_string<'a>(value: &'a serde_json::Value, field: &str) -> Result<&'a str> {
    required_json(value, field)?.as_str().ok_or_else(|| {
        SystemServiceError::Invariant(format!("channel projection {field} must be a string"))
    })
}

fn required_json<'a>(value: &'a serde_json::Value, field: &str) -> Result<&'a serde_json::Value> {
    value.get(field).ok_or_else(|| {
        SystemServiceError::Invariant(format!("channel projection {field} is required"))
    })
}

fn optional_json<'a>(value: &'a serde_json::Value, field: &str) -> Option<&'a serde_json::Value> {
    value.get(field).filter(|value| !value.is_null())
}

fn optional_string_json(value: &serde_json::Value, field: &str) -> Result<Option<String>> {
    optional_json(value, field)
        .map(|raw| {
            raw.as_str()
                .map(ToOwned::to_owned)
                .ok_or_else(|| {
                    SystemServiceError::Invariant(format!(
                        "channel projection {field} must be a string"
                    ))
                })
                .and_then(|item| {
                    if item.is_empty() {
                        Err(SystemServiceError::Invariant(format!(
                            "channel projection {field} must not be empty"
                        )))
                    } else {
                        Ok(item)
                    }
                })
        })
        .transpose()
}

fn optional_i64_json(value: &serde_json::Value, field: &str) -> Result<Option<i64>> {
    optional_json(value, field)
        .map(|raw| {
            raw.as_i64().ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel projection {field} must be an integer"
                ))
            })
        })
        .transpose()
}

fn optional_bool_json(value: &serde_json::Value, field: &str) -> Result<Option<bool>> {
    optional_json(value, field)
        .map(|raw| {
            raw.as_bool().ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel projection {field} must be a boolean"
                ))
            })
        })
        .transpose()
}

fn optional_string_array_json(
    value: &serde_json::Value,
    field: &str,
) -> Result<Option<Vec<String>>> {
    optional_json(value, field)
        .map(|raw| {
            let items = raw.as_array().ok_or_else(|| {
                SystemServiceError::Invariant(format!(
                    "channel projection {field} must be an array"
                ))
            })?;
            items
                .iter()
                .map(|item| {
                    item.as_str().map(ToOwned::to_owned).ok_or_else(|| {
                        SystemServiceError::Invariant(format!(
                            "channel projection {field} entries must be strings"
                        ))
                    })
                })
                .collect()
        })
        .transpose()
}

fn optional_retry_policy_json(
    value: &serde_json::Value,
    field: &str,
) -> Result<Option<crate::RetryPolicy>> {
    optional_json(value, field)
        .map(|raw| serde_json::from_value(raw.clone()).map_err(Into::into))
        .transpose()
}

fn collect_channel_bindings(
    rows: impl Iterator<Item = rusqlite::Result<ChannelBindingRecord>>,
) -> Result<Vec<ChannelBindingRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_channel_inbound_events(
    rows: impl Iterator<Item = rusqlite::Result<ChannelInboundEventRecord>>,
) -> Result<Vec<ChannelInboundEventRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_channel_projections(
    rows: impl Iterator<Item = rusqlite::Result<ChannelProjectionRecord>>,
) -> Result<Vec<ChannelProjectionRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn append_channel_event_tx(
    tx: &rusqlite::Transaction<'_>,
    event_type: &str,
    payload: &serde_json::Value,
    occurred_at: i64,
) -> Result<()> {
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        event_type,
        &EventScope::default(),
        payload,
        occurred_at,
    )
}
