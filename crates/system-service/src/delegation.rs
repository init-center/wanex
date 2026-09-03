use crate::event_store::append_event_tx;
use crate::rows::{
    row_to_delegation_graph, row_to_delegation_graph_dependency, row_to_delegation_graph_node,
};
use crate::scheduler::enqueue_job_tx;
use crate::{
    AttachDelegationGraphNodeJob, DelegationGraphDependencyRecord, DelegationGraphNodeRecord,
    DelegationGraphRecord, EnqueueJob, EventScope, GetDelegationGraphNode,
    ListDelegationGraphDependencies, ListDelegationGraphNodes, ListDelegationGraphs,
    ListReadyDelegationGraphNodes, MaterializeReadyDelegationGraphNode,
    MaterializedDelegationGraphNode, PutDelegationGraph, PutDelegationGraphDependency,
    PutDelegationGraphNode, Result, SystemService, SystemServiceError,
    UpdateDelegationGraphNodeState, UpdateDelegationGraphState,
};
use rusqlite::{params, params_from_iter, OptionalExtension, ToSql};
use serde_json::{Map, Value};
use uuid::Uuid;

const GRAPH_SELECT: &str = "SELECT
    id, principal_id, title, state, metadata_json,
    created_at, updated_at, closed_at
 FROM delegation_graph";

const NODE_SELECT: &str = "SELECT
    id, graph_id, kind, principal_id, state, payload_json,
    scheduler_job_id, metadata_json, created_at, updated_at,
    started_at, finished_at
 FROM delegation_graph_node";

const DEPENDENCY_SELECT: &str = "SELECT
    id, graph_id, from_node_id, to_node_id, kind, created_at
 FROM delegation_graph_dependency";

impl SystemService {
    pub fn put_delegation_graph(
        &self,
        request: &PutDelegationGraph,
    ) -> Result<DelegationGraphRecord> {
        validate_put_graph(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("dgraph_{}", Uuid::now_v7()));
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{GRAPH_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_delegation_graph,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_graph(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_graph_tx(&tx, &id)? {
            validate_existing_graph(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO delegation_graph (
                id, principal_id, title, state, metadata_json,
                idempotency_key, created_at, updated_at, closed_at
             ) VALUES (?, ?, ?, 'open', ?, ?, ?, ?, NULL)",
            params![
                id,
                request.principal_id,
                request.title,
                metadata_json,
                request.idempotency_key,
                now,
                now,
            ],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.graph.created",
            &serde_json::json!({
                "graphId": id,
                "principalId": request.principal_id,
                "state": "open",
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_graph_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("delegation graph insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn get_delegation_graph(&self, graph_id: &str) -> Result<Option<DelegationGraphRecord>> {
        if graph_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation graph id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{GRAPH_SELECT} WHERE id = ?"),
            params![graph_id],
            row_to_delegation_graph,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_delegation_graphs(
        &self,
        request: &ListDelegationGraphs,
    ) -> Result<Vec<DelegationGraphRecord>> {
        validate_optional_graph_state(request.state.as_deref())?;
        let mut sql = format!("{GRAPH_SELECT} WHERE 1 = 1");
        let mut values: Vec<Box<dyn ToSql>> = Vec::new();
        if let Some(principal_id) = &request.principal_id {
            sql.push_str(" AND principal_id = ?");
            values.push(Box::new(principal_id.clone()));
        }
        if let Some(state) = &request.state {
            sql.push_str(" AND state = ?");
            values.push(Box::new(state.clone()));
        }
        sql.push_str(" ORDER BY updated_at DESC, id ASC LIMIT ?");
        values.push(Box::new(request.limit.unwrap_or(100).clamp(1, 1000)));

        let conn = self.connect()?;
        let mut stmt = conn.prepare(&sql)?;
        let records = collect_graphs(stmt.query_map(
            params_from_iter(values.iter().map(|value| value.as_ref())),
            row_to_delegation_graph,
        )?)?;
        Ok(records)
    }

    pub fn put_delegation_graph_node(
        &self,
        request: &PutDelegationGraphNode,
    ) -> Result<DelegationGraphNodeRecord> {
        validate_put_node(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("dnode_{}", Uuid::now_v7()));
        let payload_json = serde_json::to_string(&request.payload)?;
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        if get_graph_tx(&tx, &request.graph_id)?.is_none() {
            return Err(SystemServiceError::Invariant(format!(
                "delegation graph does not exist: {}",
                request.graph_id
            )));
        }

        if let Some(idempotency_key) = &request.idempotency_key {
            let existing = tx
                .query_row(
                    &format!("{NODE_SELECT} WHERE idempotency_key = ?"),
                    params![idempotency_key],
                    row_to_delegation_graph_node,
                )
                .optional()?;
            if let Some(record) = existing {
                validate_existing_node(&record, request)?;
                tx.commit()?;
                return Ok(record);
            }
        }

        if let Some(record) = get_node_tx(&tx, &id)? {
            validate_existing_node(&record, request)?;
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO delegation_graph_node (
                id, graph_id, kind, principal_id, state, payload_json,
                scheduler_job_id, metadata_json, idempotency_key,
                created_at, updated_at, started_at, finished_at
             ) VALUES (?, ?, ?, ?, 'pending', ?, NULL, ?, ?, ?, ?, NULL, NULL)",
            params![
                id,
                request.graph_id,
                request.kind,
                request.principal_id,
                payload_json,
                metadata_json,
                request.idempotency_key,
                now,
                now,
            ],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.node.created",
            &serde_json::json!({
                "graphId": request.graph_id,
                "nodeId": id,
                "kind": request.kind,
                "state": "pending",
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_node_tx(&tx, &id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("delegation node insert missing: {id}"))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_delegation_graph_nodes(
        &self,
        request: &ListDelegationGraphNodes,
    ) -> Result<Vec<DelegationGraphNodeRecord>> {
        if request.graph_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation node graph_id must not be empty".to_string(),
            ));
        }
        validate_optional_node_state(request.state.as_deref())?;
        let conn = self.connect()?;
        if let Some(state) = &request.state {
            let mut stmt = conn.prepare(&format!(
                "{NODE_SELECT}
                 WHERE graph_id = ? AND state = ?
                 ORDER BY created_at ASC, id ASC"
            ))?;
            let records = collect_nodes(stmt.query_map(
                params![request.graph_id, state],
                row_to_delegation_graph_node,
            )?)?;
            return Ok(records);
        }
        let mut stmt = conn.prepare(&format!(
            "{NODE_SELECT}
             WHERE graph_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_nodes(
            stmt.query_map(params![request.graph_id], row_to_delegation_graph_node)?,
        )?;
        Ok(records)
    }

    pub fn get_delegation_graph_node(
        &self,
        request: &GetDelegationGraphNode,
    ) -> Result<Option<DelegationGraphNodeRecord>> {
        if request.node_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation node id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        conn.query_row(
            &format!("{NODE_SELECT} WHERE id = ?"),
            params![request.node_id],
            row_to_delegation_graph_node,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn put_delegation_graph_dependency(
        &self,
        request: &PutDelegationGraphDependency,
    ) -> Result<DelegationGraphDependencyRecord> {
        validate_put_dependency(request)?;
        let id = request
            .id
            .clone()
            .unwrap_or_else(|| format!("ddep_{}", Uuid::now_v7()));
        let kind = request
            .kind
            .clone()
            .unwrap_or_else(|| "after_success".to_string());
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        let from_node = get_node_tx(&tx, &request.from_node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation dependency from node does not exist: {}",
                request.from_node_id
            ))
        })?;
        let to_node = get_node_tx(&tx, &request.to_node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation dependency to node does not exist: {}",
                request.to_node_id
            ))
        })?;
        if from_node.graph_id != request.graph_id || to_node.graph_id != request.graph_id {
            return Err(SystemServiceError::Invariant(
                "delegation dependency nodes must belong to graph".to_string(),
            ));
        }
        if request.from_node_id == request.to_node_id {
            return Err(SystemServiceError::Invariant(
                "delegation dependency cannot target the same node".to_string(),
            ));
        }

        let existing = tx
            .query_row(
                &format!(
                    "{DEPENDENCY_SELECT}
                     WHERE graph_id = ? AND from_node_id = ? AND to_node_id = ? AND kind = ?"
                ),
                params![
                    request.graph_id,
                    request.from_node_id,
                    request.to_node_id,
                    kind
                ],
                row_to_delegation_graph_dependency,
            )
            .optional()?;
        if let Some(record) = existing {
            tx.commit()?;
            return Ok(record);
        }

        tx.execute(
            "INSERT INTO delegation_graph_dependency (
                id, graph_id, from_node_id, to_node_id, kind, created_at
             ) VALUES (?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.graph_id,
                request.from_node_id,
                request.to_node_id,
                kind,
                now,
            ],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.dependency.created",
            &serde_json::json!({
                "graphId": request.graph_id,
                "dependencyId": id,
                "fromNodeId": request.from_node_id,
                "toNodeId": request.to_node_id,
                "kind": kind
            }),
            now,
        )?;
        let record = get_dependency_tx(&tx, &id)?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_delegation_graph_dependencies(
        &self,
        request: &ListDelegationGraphDependencies,
    ) -> Result<Vec<DelegationGraphDependencyRecord>> {
        if request.graph_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation dependency graph_id must not be empty".to_string(),
            ));
        }
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{DEPENDENCY_SELECT}
             WHERE graph_id = ?
             ORDER BY created_at ASC, id ASC"
        ))?;
        let records = collect_dependencies(stmt.query_map(
            params![request.graph_id],
            row_to_delegation_graph_dependency,
        )?)?;
        Ok(records)
    }

    pub fn update_delegation_graph_state(
        &self,
        request: &UpdateDelegationGraphState,
    ) -> Result<DelegationGraphRecord> {
        validate_graph_state(&request.state)?;
        if request.graph_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation graph id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let closed_at = if graph_state_is_terminal(&request.state) {
            Some(now)
        } else {
            None
        };
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_graph_tx(&tx, &request.graph_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation graph does not exist: {}",
                request.graph_id
            ))
        })?;
        validate_graph_transition(&existing.state, &request.state)?;
        tx.execute(
            "UPDATE delegation_graph
             SET state = ?, updated_at = ?, closed_at = ?
             WHERE id = ?",
            params![request.state, now, closed_at, request.graph_id],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.graph.state_updated",
            &serde_json::json!({
                "graphId": request.graph_id,
                "fromState": existing.state,
                "toState": request.state,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_graph_tx(&tx, &request.graph_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation graph update missing: {}",
                request.graph_id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn update_delegation_graph_node_state(
        &self,
        request: &UpdateDelegationGraphNodeState,
    ) -> Result<DelegationGraphNodeRecord> {
        validate_node_state(&request.state)?;
        if request.node_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation node id must not be empty".to_string(),
            ));
        }
        let metadata_json = request
            .metadata
            .as_ref()
            .map(serde_json::to_string)
            .transpose()?;
        let now = crate::util::now_ms();
        let started_at = if request.state == "running" {
            Some(now)
        } else {
            None
        };
        let finished_at = if node_state_is_terminal(&request.state) {
            Some(now)
        } else {
            None
        };
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_node_tx(&tx, &request.node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation node does not exist: {}",
                request.node_id
            ))
        })?;
        validate_node_transition(&existing.state, &request.state)?;
        tx.execute(
            "UPDATE delegation_graph_node
             SET state = ?,
                 scheduler_job_id = COALESCE(?, scheduler_job_id),
                 metadata_json = COALESCE(?, metadata_json),
                 updated_at = ?,
                 started_at = COALESCE(started_at, ?),
                 finished_at = COALESCE(?, finished_at)
             WHERE id = ?",
            params![
                request.state,
                request.scheduler_job_id,
                metadata_json,
                now,
                started_at,
                finished_at,
                request.node_id,
            ],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.node.state_updated",
            &serde_json::json!({
                "graphId": existing.graph_id,
                "nodeId": request.node_id,
                "fromState": existing.state,
                "toState": request.state,
                "schedulerJobId": request.scheduler_job_id,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_node_tx(&tx, &request.node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation node update missing: {}",
                request.node_id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn attach_delegation_graph_node_job(
        &self,
        request: &AttachDelegationGraphNodeJob,
    ) -> Result<DelegationGraphNodeRecord> {
        if request.node_id.is_empty() || request.scheduler_job_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation node id and scheduler_job_id must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let existing = get_node_tx(&tx, &request.node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation node does not exist: {}",
                request.node_id
            ))
        })?;
        tx.execute(
            "UPDATE delegation_graph_node
             SET scheduler_job_id = ?, updated_at = ?
             WHERE id = ?",
            params![request.scheduler_job_id, now, request.node_id],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.node.job_attached",
            &serde_json::json!({
                "graphId": existing.graph_id,
                "nodeId": request.node_id,
                "schedulerJobId": request.scheduler_job_id,
                "updatedAt": now
            }),
            now,
        )?;
        let record = get_node_tx(&tx, &request.node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!(
                "delegation node attach missing: {}",
                request.node_id
            ))
        })?;
        tx.commit()?;
        Ok(record)
    }

    pub fn list_ready_delegation_graph_nodes(
        &self,
        request: &ListReadyDelegationGraphNodes,
    ) -> Result<Vec<DelegationGraphNodeRecord>> {
        if request.graph_id.is_empty() {
            return Err(SystemServiceError::Invariant(
                "delegation ready graph_id must not be empty".to_string(),
            ));
        }
        let limit = request.limit.unwrap_or(100).clamp(1, 1000);
        let conn = self.connect()?;
        let mut stmt = conn.prepare(&format!(
            "{NODE_SELECT}
             WHERE graph_id = ?
               AND state IN ('pending', 'ready')
               AND scheduler_job_id IS NULL
               AND EXISTS (
                 SELECT 1 FROM delegation_graph graph
                 WHERE graph.id = delegation_graph_node.graph_id
                   AND graph.state IN ('open', 'running')
               )
               AND NOT EXISTS (
                 SELECT 1 FROM delegation_graph_dependency dep
                 JOIN delegation_graph_node source ON source.id = dep.from_node_id
                 WHERE dep.graph_id = delegation_graph_node.graph_id
                   AND dep.to_node_id = delegation_graph_node.id
                   AND (
                     (dep.kind = 'after_success' AND source.state != 'succeeded')
                     OR
                     (dep.kind = 'after_terminal'
                      AND source.state NOT IN ('succeeded', 'failed', 'cancelled', 'skipped'))
                   )
               )
             ORDER BY created_at ASC, id ASC
             LIMIT ?"
        ))?;
        let records = collect_nodes(stmt.query_map(
            params![request.graph_id, limit],
            row_to_delegation_graph_node,
        )?)?;
        Ok(records)
    }

    pub fn materialize_ready_delegation_graph_node(
        &self,
        request: &MaterializeReadyDelegationGraphNode,
    ) -> Result<Option<MaterializedDelegationGraphNode>> {
        validate_materialize_ready_node(request)?;
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let Some(node_id) = find_materializable_node_tx(&tx, request)? else {
            tx.commit()?;
            return Ok(None);
        };
        let existing = get_node_tx(&tx, &node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("delegation node missing: {node_id}"))
        })?;
        let materializing_token = format!("materializing_{}", Uuid::now_v7());
        let updated = tx.execute(
            "UPDATE delegation_graph_node
             SET state = 'running',
                 scheduler_job_id = ?,
                 updated_at = ?,
                 started_at = COALESCE(started_at, ?)
             WHERE id = ?
               AND graph_id = ?
               AND state IN ('pending', 'ready')
               AND scheduler_job_id IS NULL
               AND EXISTS (
                 SELECT 1 FROM delegation_graph graph
                 WHERE graph.id = delegation_graph_node.graph_id
                   AND graph.state IN ('open', 'running')
               )
               AND NOT EXISTS (
                 SELECT 1 FROM delegation_graph_dependency dep
                 JOIN delegation_graph_node source ON source.id = dep.from_node_id
                 WHERE dep.graph_id = delegation_graph_node.graph_id
                   AND dep.to_node_id = delegation_graph_node.id
                   AND (
                     (dep.kind = 'after_success' AND source.state != 'succeeded')
                     OR
                     (dep.kind = 'after_terminal'
                      AND source.state NOT IN ('succeeded', 'failed', 'cancelled', 'skipped'))
                   )
               )",
            params![materializing_token, now, now, node_id, request.graph_id],
        )?;
        if updated == 0 {
            tx.commit()?;
            return Ok(None);
        }

        let job_payload = serde_json::json!({
            "delegationGraphId": request.graph_id,
            "delegationNodeId": node_id,
            "nodeKind": existing.kind,
            "payload": request.job_payload.clone().unwrap_or_else(|| existing.payload.clone())
        });
        let job_idempotency_key = request
            .job_idempotency_key
            .clone()
            .unwrap_or_else(|| format!("delegation:{}:{}:job", request.graph_id, node_id));
        let job = enqueue_job_tx(
            &tx,
            &EnqueueJob {
                id: request.job_id.clone(),
                kind: request.job_kind,
                queue: None,
                principal_id: existing.principal_id.clone(),
                payload: job_payload,
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
        let metadata = materialized_node_metadata(
            existing.metadata.clone(),
            &request.worker_id,
            request.job_kind.as_str(),
            &job.id,
            now,
        );
        tx.execute(
            "UPDATE delegation_graph_node
             SET scheduler_job_id = ?,
                 metadata_json = ?,
                 updated_at = ?
             WHERE id = ? AND scheduler_job_id = ?",
            params![
                job.id,
                serde_json::to_string(&metadata)?,
                now,
                node_id,
                materializing_token
            ],
        )?;
        append_delegation_event_tx(
            &tx,
            "delegation.node.materialized",
            &serde_json::json!({
                "graphId": request.graph_id,
                "nodeId": node_id,
                "schedulerJobId": job.id,
                "schedulerJobKind": request.job_kind.as_str(),
                "workerId": request.worker_id,
                "updatedAt": now
            }),
            now,
        )?;
        let node = get_node_tx(&tx, &node_id)?.ok_or_else(|| {
            SystemServiceError::Invariant(format!("delegation node materialize missing: {node_id}"))
        })?;
        tx.commit()?;
        Ok(Some(MaterializedDelegationGraphNode { node, job }))
    }
}

fn validate_put_graph(request: &PutDelegationGraph) -> Result<()> {
    if request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "delegation graph principal_id must not be empty".to_string(),
        ));
    }
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "delegation graph id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_put_node(request: &PutDelegationGraphNode) -> Result<()> {
    if request.graph_id.is_empty() || request.principal_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "delegation node graph_id/principal_id must not be empty".to_string(),
        ));
    }
    validate_node_kind(&request.kind)?;
    if request.id.as_deref() == Some("") || request.idempotency_key.as_deref() == Some("") {
        return Err(SystemServiceError::Invariant(
            "delegation node id/idempotency_key must not be empty".to_string(),
        ));
    }
    Ok(())
}

fn validate_put_dependency(request: &PutDelegationGraphDependency) -> Result<()> {
    if request.graph_id.is_empty()
        || request.from_node_id.is_empty()
        || request.to_node_id.is_empty()
    {
        return Err(SystemServiceError::Invariant(
            "delegation dependency graph/from/to ids must not be empty".to_string(),
        ));
    }
    if let Some(kind) = &request.kind {
        validate_dependency_kind(kind)?;
    }
    Ok(())
}

fn validate_materialize_ready_node(request: &MaterializeReadyDelegationGraphNode) -> Result<()> {
    if request.graph_id.is_empty() || request.worker_id.is_empty() {
        return Err(SystemServiceError::Invariant(
            "delegation materialize graph_id/worker_id must not be empty".to_string(),
        ));
    }
    if request.node_id.as_deref() == Some("")
        || request.job_id.as_deref() == Some("")
        || request.job_idempotency_key.as_deref() == Some("")
    {
        return Err(SystemServiceError::Invariant(
            "delegation materialize node/job/idempotency ids must not be empty".to_string(),
        ));
    }
    if request.job_kind == crate::SchedulerJobKind::SessionTurn {
        return Err(SystemServiceError::Invariant(
            "delegation materialization cannot create an orphan session.turn job".to_string(),
        ));
    }
    Ok(())
}

fn validate_existing_graph(
    record: &DelegationGraphRecord,
    request: &PutDelegationGraph,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.principal_id != request.principal_id
        || record.title != request.title
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "delegation graph id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn validate_existing_node(
    record: &DelegationGraphNodeRecord,
    request: &PutDelegationGraphNode,
) -> Result<()> {
    let metadata_matches = match (&record.metadata, &request.metadata) {
        (None, None) => true,
        (Some(left), Some(right)) => left == right,
        _ => false,
    };
    if record.graph_id != request.graph_id
        || record.kind != request.kind
        || record.principal_id != request.principal_id
        || record.payload != request.payload
        || !metadata_matches
    {
        return Err(SystemServiceError::Invariant(format!(
            "delegation node id already exists with different content: {}",
            record.id
        )));
    }
    Ok(())
}

fn validate_node_kind(kind: &str) -> Result<()> {
    if !matches!(
        kind,
        "agent_task" | "workspace_task" | "tool_task" | "aggregation"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid delegation node kind: {kind}"
        )));
    }
    Ok(())
}

fn validate_dependency_kind(kind: &str) -> Result<()> {
    if !matches!(kind, "after_success" | "after_terminal") {
        return Err(SystemServiceError::Invariant(format!(
            "invalid delegation dependency kind: {kind}"
        )));
    }
    Ok(())
}

fn validate_graph_state(state: &str) -> Result<()> {
    if !matches!(
        state,
        "open" | "running" | "succeeded" | "failed" | "cancelled"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid delegation graph state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_graph_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_graph_state(state)?;
    }
    Ok(())
}

fn validate_node_state(state: &str) -> Result<()> {
    if !matches!(
        state,
        "pending" | "ready" | "running" | "succeeded" | "failed" | "cancelled" | "skipped"
    ) {
        return Err(SystemServiceError::Invariant(format!(
            "invalid delegation node state: {state}"
        )));
    }
    Ok(())
}

fn validate_optional_node_state(state: Option<&str>) -> Result<()> {
    if let Some(state) = state {
        validate_node_state(state)?;
    }
    Ok(())
}

fn validate_graph_transition(from: &str, to: &str) -> Result<()> {
    if graph_state_is_terminal(from) && from != to {
        return Err(SystemServiceError::Invariant(format!(
            "invalid delegation graph transition: {from}/{to}"
        )));
    }
    Ok(())
}

fn validate_node_transition(from: &str, to: &str) -> Result<()> {
    if node_state_is_terminal(from) && from != to {
        return Err(SystemServiceError::Invariant(format!(
            "invalid delegation node transition: {from}/{to}"
        )));
    }
    Ok(())
}

fn graph_state_is_terminal(state: &str) -> bool {
    matches!(state, "succeeded" | "failed" | "cancelled")
}

fn node_state_is_terminal(state: &str) -> bool {
    matches!(state, "succeeded" | "failed" | "cancelled" | "skipped")
}

pub(crate) fn get_graph_tx(
    tx: &rusqlite::Transaction<'_>,
    graph_id: &str,
) -> Result<Option<DelegationGraphRecord>> {
    tx.query_row(
        &format!("{GRAPH_SELECT} WHERE id = ?"),
        params![graph_id],
        row_to_delegation_graph,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_node_tx(
    tx: &rusqlite::Transaction<'_>,
    node_id: &str,
) -> Result<Option<DelegationGraphNodeRecord>> {
    tx.query_row(
        &format!("{NODE_SELECT} WHERE id = ?"),
        params![node_id],
        row_to_delegation_graph_node,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn get_dependency_tx(
    tx: &rusqlite::Transaction<'_>,
    dependency_id: &str,
) -> Result<DelegationGraphDependencyRecord> {
    tx.query_row(
        &format!("{DEPENDENCY_SELECT} WHERE id = ?"),
        params![dependency_id],
        row_to_delegation_graph_dependency,
    )
    .map_err(Into::into)
}

fn find_materializable_node_tx(
    tx: &rusqlite::Transaction<'_>,
    request: &MaterializeReadyDelegationGraphNode,
) -> Result<Option<String>> {
    let node_filter = if request.node_id.is_some() {
        " AND node.id = ?"
    } else {
        ""
    };
    let sql = format!(
        "SELECT node.id
         FROM delegation_graph_node node
         JOIN delegation_graph graph ON graph.id = node.graph_id
         WHERE node.graph_id = ?
           AND graph.state IN ('open', 'running')
           AND node.state IN ('pending', 'ready')
           AND node.scheduler_job_id IS NULL
           {node_filter}
           AND NOT EXISTS (
             SELECT 1 FROM delegation_graph_dependency dep
             JOIN delegation_graph_node source ON source.id = dep.from_node_id
             WHERE dep.graph_id = node.graph_id
               AND dep.to_node_id = node.id
               AND (
                 (dep.kind = 'after_success' AND source.state != 'succeeded')
                 OR
                 (dep.kind = 'after_terminal'
                  AND source.state NOT IN ('succeeded', 'failed', 'cancelled', 'skipped'))
               )
           )
         ORDER BY node.created_at ASC, node.id ASC
         LIMIT 1"
    );
    if let Some(node_id) = &request.node_id {
        return tx
            .query_row(&sql, params![request.graph_id, node_id], |row| row.get(0))
            .optional()
            .map_err(Into::into);
    }
    tx.query_row(&sql, params![request.graph_id], |row| row.get(0))
        .optional()
        .map_err(Into::into)
}

fn materialized_node_metadata(
    existing: Option<Value>,
    worker_id: &str,
    job_kind: &str,
    job_id: &str,
    materialized_at: i64,
) -> Value {
    let mut metadata = match existing {
        Some(Value::Object(map)) => map,
        Some(value) => {
            let mut map = Map::new();
            map.insert("previous".to_string(), value);
            map
        }
        None => Map::new(),
    };
    metadata.insert(
        "materializedBy".to_string(),
        Value::String(worker_id.to_string()),
    );
    metadata.insert(
        "materializedJobKind".to_string(),
        Value::String(job_kind.to_string()),
    );
    metadata.insert(
        "materializedJobId".to_string(),
        Value::String(job_id.to_string()),
    );
    metadata.insert(
        "materializedAt".to_string(),
        Value::Number(materialized_at.into()),
    );
    Value::Object(metadata)
}

fn collect_graphs(
    rows: impl Iterator<Item = rusqlite::Result<DelegationGraphRecord>>,
) -> Result<Vec<DelegationGraphRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_nodes(
    rows: impl Iterator<Item = rusqlite::Result<DelegationGraphNodeRecord>>,
) -> Result<Vec<DelegationGraphNodeRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

fn collect_dependencies(
    rows: impl Iterator<Item = rusqlite::Result<DelegationGraphDependencyRecord>>,
) -> Result<Vec<DelegationGraphDependencyRecord>> {
    let mut records = Vec::new();
    for row in rows {
        records.push(row?);
    }
    Ok(records)
}

pub(crate) fn append_delegation_event_tx(
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
