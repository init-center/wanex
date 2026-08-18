use crate::event_store::append_event_tx;
use crate::rows::{row_to_budget_grant, row_to_budget_scope, row_to_budget_usage_entry};
use crate::{
    BudgetAmount, BudgetGrantRecord, BudgetScopeRecord, BudgetWindowKind, EventScope, Result,
    SystemService, SystemServiceError,
};
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;

impl SystemService {
    pub fn reserve_budget(&self, request: &crate::ReserveBudget) -> Result<BudgetGrantRecord> {
        validate_budget_amount(&request.limit)?;
        validate_budget_amount(&request.requested)?;

        let now = crate::util::now_ms();
        let kind = request.scope.kind.as_str();
        let window_kind = request
            .scope
            .window_kind
            .unwrap_or(BudgetWindowKind::Session)
            .as_str();
        let scope_id = budget_scope_id(kind, &request.scope.owner_id, window_kind);
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;

        tx.execute(
            "INSERT INTO budget_scope (
                id, kind, owner_id, limit_json, usage_json,
                window_kind, state, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
             ON CONFLICT(kind, owner_id, window_kind) DO UPDATE SET
               limit_json = excluded.limit_json,
               updated_at = excluded.updated_at",
            params![
                scope_id,
                kind,
                request.scope.owner_id,
                serde_json::to_string(&request.limit)?,
                serde_json::to_string(&BudgetAmount::default())?,
                window_kind,
                now,
                now
            ],
        )?;

        if let Some(existing) = find_budget_grant_tx(&tx, &scope_id, &request.idempotency_key)? {
            tx.commit()?;
            return Ok(existing);
        }

        let scope = get_budget_scope_tx(&tx, &scope_id)?;
        let reserved = reserved_budget_tx(&tx, &scope_id)?;
        if !fits_budget(
            &scope.limit,
            &add_amounts(&scope.usage, &reserved),
            &request.requested,
        ) {
            append_event_tx(
                &tx,
                &format!("evt_{}", Uuid::now_v7()),
                "budget.grant.denied",
                &EventScope::default(),
                &serde_json::json!({
                    "scopeId": scope_id,
                    "reason": request.reason,
                    "requested": request.requested
                }),
                now,
            )?;
            tx.commit()?;
            return Err(SystemServiceError::BudgetDenied {
                scope_id,
                reason: "requested budget exceeds remaining limit".to_string(),
            });
        }

        let grant_id = format!("bgt_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO budget_grant (
                id, scope_id, principal_id, reason, requested_json,
                committed_json, state, idempotency_key, expires_at, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, NULL, 'reserved', ?, ?, ?, ?)",
            params![
                grant_id,
                scope.id,
                request.principal_id,
                request.reason,
                serde_json::to_string(&request.requested)?,
                request.idempotency_key,
                request.expires_at,
                now,
                now
            ],
        )?;
        append_event_tx(
            &tx,
            &format!("evt_{}", Uuid::now_v7()),
            "budget.grant.reserved",
            &EventScope::default(),
            &serde_json::json!({
                "scopeId": scope.id,
                "grantId": grant_id,
                "requested": request.requested,
                "reason": request.reason
            }),
            now,
        )?;
        let grant = get_budget_grant_tx(&tx, &grant_id)?;
        tx.commit()?;
        Ok(grant)
    }

    pub fn commit_budget(
        &self,
        request: &crate::CommitBudget,
    ) -> Result<Option<BudgetGrantRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let updated = commit_budget_grant_tx(&tx, &request.grant_id, now)?;
        tx.commit()?;
        Ok(updated)
    }

    pub fn record_budget_usage(
        &self,
        request: &crate::RecordBudgetUsage,
    ) -> Result<crate::RecordBudgetUsageReceipt> {
        validate_budget_amount(&request.usage)?;
        if request.source.is_empty()
            || request.source_id.is_empty()
            || request.idempotency_key.is_empty()
        {
            return Err(SystemServiceError::Invariant(
                "budget usage identity fields must not be empty".to_string(),
            ));
        }
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        if let Some(existing) =
            find_budget_usage_entry_tx(&tx, &request.grant_id, &request.idempotency_key)?
        {
            if existing.usage != request.usage
                || existing.source != request.source
                || existing.source_id != request.source_id
            {
                return Err(SystemServiceError::Invariant(
                    "conflicting repeated budget usage entry".to_string(),
                ));
            }
            tx.commit()?;
            return Ok(crate::RecordBudgetUsageReceipt {
                entry: existing,
                created: false,
            });
        }
        let grant = get_budget_grant_tx(&tx, &request.grant_id)?;
        if grant.state != "reserved" {
            return Err(SystemServiceError::Invariant(
                "budget usage requires a reserved grant".to_string(),
            ));
        }
        let used = budget_usage_total_tx(&tx, &grant.id)?;
        if !fits_reserved_grant(&grant.requested, &used, &request.usage) {
            return Err(SystemServiceError::BudgetDenied {
                scope_id: grant.scope_id,
                reason: "usage exceeds reserved grant".to_string(),
            });
        }
        let id = format!("bue_{}", Uuid::now_v7());
        tx.execute(
            "INSERT INTO budget_usage_entry (
               id, grant_id, usage_json, source, source_id, idempotency_key, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)",
            params![
                id,
                request.grant_id,
                serde_json::to_string(&request.usage)?,
                request.source,
                request.source_id,
                request.idempotency_key,
                now
            ],
        )?;
        let entry = get_budget_usage_entry_tx(&tx, &id)?;
        tx.commit()?;
        Ok(crate::RecordBudgetUsageReceipt {
            entry,
            created: true,
        })
    }

    pub fn release_budget(&self, grant_id: &str) -> Result<Option<BudgetGrantRecord>> {
        let now = crate::util::now_ms();
        let mut conn = self.connect()?;
        let tx = crate::db::begin_write_transaction(&mut conn)?;
        let grant = get_optional_budget_grant_tx(&tx, grant_id)?;
        let Some(grant) = grant else {
            tx.commit()?;
            return Ok(None);
        };
        if grant.state == "reserved" {
            tx.execute(
                "UPDATE budget_grant SET state = 'released', updated_at = ?
                 WHERE id = ? AND state = 'reserved'",
                params![now, grant_id],
            )?;
            append_event_tx(
                &tx,
                &format!("evt_{}", Uuid::now_v7()),
                "budget.grant.released",
                &EventScope::default(),
                &serde_json::json!({
                    "scopeId": grant.scope_id,
                    "grantId": grant_id
                }),
                now,
            )?;
        }
        let updated = get_budget_grant_tx(&tx, grant_id)?;
        tx.commit()?;
        Ok(Some(updated))
    }

    pub fn get_budget_scope(&self, scope_id: &str) -> Result<Option<BudgetScopeRecord>> {
        let conn = self.connect()?;
        conn.query_row(
            "SELECT id, kind, owner_id, limit_json, usage_json,
                    window_kind, state, created_at, updated_at
             FROM budget_scope WHERE id = ?",
            params![scope_id],
            row_to_budget_scope,
        )
        .optional()
        .map_err(Into::into)
    }

    pub fn list_budget_grants(&self, scope_id: &str) -> Result<Vec<BudgetGrantRecord>> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT id, scope_id, principal_id, reason, requested_json,
                    committed_json, state, idempotency_key, expires_at,
                    created_at, updated_at
             FROM budget_grant
             WHERE scope_id = ?
             ORDER BY created_at ASC, id ASC",
        )?;
        let rows = stmt.query_map(params![scope_id], row_to_budget_grant)?;
        let mut grants = Vec::new();
        for row in rows {
            grants.push(row?);
        }
        Ok(grants)
    }
}

pub(crate) fn reserve_remaining_objective_budget_tx(
    tx: &rusqlite::Transaction<'_>,
    objective_id: &str,
    principal_id: &str,
    limit: &BudgetAmount,
    idempotency_key: &str,
    expires_at: Option<i64>,
    now: i64,
) -> Result<Option<BudgetGrantRecord>> {
    validate_budget_amount(limit)?;
    let scope_id = budget_scope_id("objective", objective_id, "run");
    let limit_json = serde_json::to_string(limit)?;
    tx.execute(
        "INSERT INTO budget_scope (
            id, kind, owner_id, limit_json, usage_json,
            window_kind, state, created_at, updated_at
         ) VALUES (?, 'objective', ?, ?, ?, 'run', 'active', ?, ?)
         ON CONFLICT(kind, owner_id, window_kind) DO NOTHING",
        params![
            scope_id,
            objective_id,
            limit_json,
            serde_json::to_string(&BudgetAmount::default())?,
            now,
            now
        ],
    )?;
    let scope = get_budget_scope_tx(tx, &scope_id)?;
    if scope.limit != *limit {
        return Err(SystemServiceError::Invariant(
            "objective budget scope limit does not match frozen stop policy".to_string(),
        ));
    }
    if let Some(existing) = find_budget_grant_tx(tx, &scope_id, idempotency_key)? {
        return Ok(Some(existing));
    }
    let consumed = add_amounts(&scope.usage, &reserved_budget_tx(tx, &scope_id)?);
    let Some(requested) = remaining_budget(limit, &consumed) else {
        return Ok(None);
    };
    let grant_id = format!("bgt_{}", Uuid::now_v7());
    tx.execute(
        "INSERT INTO budget_grant (
            id, scope_id, principal_id, reason, requested_json,
            committed_json, state, idempotency_key, expires_at, created_at, updated_at
         ) VALUES (?, ?, ?, 'objective attempt', ?, NULL, 'reserved', ?, ?, ?, ?)",
        params![
            grant_id,
            scope_id,
            principal_id,
            serde_json::to_string(&requested)?,
            idempotency_key,
            expires_at,
            now,
            now
        ],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "budget.grant.reserved",
        &EventScope {
            objective_id: Some(objective_id.to_string()),
            ..EventScope::default()
        },
        &serde_json::json!({
            "scopeId": scope_id,
            "grantId": grant_id,
            "requested": requested,
            "reason": "objective attempt"
        }),
        now,
    )?;
    Ok(Some(get_budget_grant_tx(tx, &grant_id)?))
}

pub(crate) fn objective_budget_has_remaining_tx(
    tx: &rusqlite::Transaction<'_>,
    objective_id: &str,
    limit: &BudgetAmount,
) -> Result<bool> {
    validate_budget_amount(limit)?;
    let scope_id = budget_scope_id("objective", objective_id, "run");
    let Some(scope) = get_optional_budget_scope_tx(tx, &scope_id)? else {
        return Ok(remaining_budget(limit, &BudgetAmount::default()).is_some());
    };
    if scope.limit != *limit {
        return Err(SystemServiceError::Invariant(
            "objective budget scope limit does not match frozen stop policy".to_string(),
        ));
    }
    let consumed = add_amounts(&scope.usage, &reserved_budget_tx(tx, &scope_id)?);
    Ok(remaining_budget(limit, &consumed).is_some())
}

pub(crate) fn commit_budget_grant_tx(
    tx: &rusqlite::Transaction<'_>,
    grant_id: &str,
    now: i64,
) -> Result<Option<BudgetGrantRecord>> {
    let Some(grant) = get_optional_budget_grant_tx(tx, grant_id)? else {
        return Ok(None);
    };
    if grant.state != "reserved" {
        return Ok(Some(grant));
    }
    let usage = budget_usage_total_tx(tx, &grant.id)?;
    let scope = get_budget_scope_tx(tx, &grant.scope_id)?;
    if !fits_budget(&scope.limit, &scope.usage, &usage) {
        return Err(SystemServiceError::BudgetDenied {
            scope_id: scope.id,
            reason: "committed usage exceeds scope limit".to_string(),
        });
    }
    let scope_usage = add_amounts(&scope.usage, &usage);
    tx.execute(
        "UPDATE budget_scope SET usage_json = ?, updated_at = ? WHERE id = ?",
        params![serde_json::to_string(&scope_usage)?, now, scope.id],
    )?;
    tx.execute(
        "UPDATE budget_grant
         SET state = 'committed', committed_json = ?, updated_at = ?
         WHERE id = ? AND state = 'reserved'",
        params![serde_json::to_string(&usage)?, now, grant_id],
    )?;
    append_event_tx(
        tx,
        &format!("evt_{}", Uuid::now_v7()),
        "budget.grant.committed",
        &EventScope::default(),
        &serde_json::json!({
            "scopeId": scope.id,
            "grantId": grant_id,
            "usage": usage
        }),
        now,
    )?;
    Ok(Some(get_budget_grant_tx(tx, grant_id)?))
}

fn budget_scope_id(kind: &str, owner_id: &str, window_kind: &str) -> String {
    format!(
        "bgs_{}",
        crate::util::hex_sha256(format!("{kind}:{owner_id}:{window_kind}").as_bytes())
    )
}

fn validate_budget_amount(amount: &BudgetAmount) -> Result<()> {
    for value in [
        amount.tokens,
        amount.cost_micros,
        amount.wall_time_ms,
        amount.tool_calls,
    ]
    .into_iter()
    .flatten()
    {
        if value < 0 {
            return Err(SystemServiceError::Invariant(
                "budget amounts must not be negative".to_string(),
            ));
        }
    }
    Ok(())
}

fn fits_budget(limit: &BudgetAmount, used: &BudgetAmount, requested: &BudgetAmount) -> bool {
    fits_dimension(limit.tokens, used.tokens, requested.tokens)
        && fits_dimension(limit.cost_micros, used.cost_micros, requested.cost_micros)
        && fits_dimension(
            limit.wall_time_ms,
            used.wall_time_ms,
            requested.wall_time_ms,
        )
        && fits_dimension(limit.tool_calls, used.tool_calls, requested.tool_calls)
}

fn fits_dimension(limit: Option<i64>, used: Option<i64>, requested: Option<i64>) -> bool {
    match limit {
        Some(limit) => used.unwrap_or(0) + requested.unwrap_or(0) <= limit,
        None => true,
    }
}

fn fits_reserved_grant(limit: &BudgetAmount, used: &BudgetAmount, delta: &BudgetAmount) -> bool {
    fits_reserved_dimension(limit.tokens, used.tokens, delta.tokens)
        && fits_reserved_dimension(limit.cost_micros, used.cost_micros, delta.cost_micros)
        && fits_reserved_dimension(limit.wall_time_ms, used.wall_time_ms, delta.wall_time_ms)
        && fits_reserved_dimension(limit.tool_calls, used.tool_calls, delta.tool_calls)
}

fn fits_reserved_dimension(limit: Option<i64>, used: Option<i64>, delta: Option<i64>) -> bool {
    used.unwrap_or(0) + delta.unwrap_or(0) <= limit.unwrap_or(0)
}

fn add_amounts(left: &BudgetAmount, right: &BudgetAmount) -> BudgetAmount {
    BudgetAmount {
        tokens: add_optional(left.tokens, right.tokens),
        cost_micros: add_optional(left.cost_micros, right.cost_micros),
        wall_time_ms: add_optional(left.wall_time_ms, right.wall_time_ms),
        tool_calls: add_optional(left.tool_calls, right.tool_calls),
    }
}

fn add_optional(left: Option<i64>, right: Option<i64>) -> Option<i64> {
    match (left, right) {
        (Some(left), Some(right)) => Some(left + right),
        (Some(value), None) | (None, Some(value)) => Some(value),
        (None, None) => None,
    }
}

fn reserved_budget_tx(tx: &rusqlite::Transaction<'_>, scope_id: &str) -> Result<BudgetAmount> {
    let mut stmt = tx.prepare(
        "SELECT requested_json FROM budget_grant
         WHERE scope_id = ? AND state = 'reserved'",
    )?;
    let rows = stmt.query_map(params![scope_id], |row| row.get::<_, String>(0))?;
    let mut total = BudgetAmount::default();
    for row in rows {
        let amount: BudgetAmount = serde_json::from_str(&row?)?;
        total = add_amounts(&total, &amount);
    }
    Ok(total)
}

fn budget_usage_total_tx(tx: &rusqlite::Transaction<'_>, grant_id: &str) -> Result<BudgetAmount> {
    let mut stmt = tx.prepare(
        "SELECT usage_json FROM budget_usage_entry
         WHERE grant_id = ? ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![grant_id], |row| row.get::<_, String>(0))?;
    let mut total = BudgetAmount::default();
    for row in rows {
        let amount: BudgetAmount = serde_json::from_str(&row?)?;
        total = add_amounts(&total, &amount);
    }
    Ok(total)
}

fn find_budget_usage_entry_tx(
    tx: &rusqlite::Transaction<'_>,
    grant_id: &str,
    idempotency_key: &str,
) -> Result<Option<crate::BudgetUsageEntryRecord>> {
    tx.query_row(
        "SELECT id, grant_id, usage_json, source, source_id, idempotency_key, created_at
         FROM budget_usage_entry WHERE grant_id = ? AND idempotency_key = ?",
        params![grant_id, idempotency_key],
        row_to_budget_usage_entry,
    )
    .optional()
    .map_err(Into::into)
}

fn get_budget_usage_entry_tx(
    tx: &rusqlite::Transaction<'_>,
    id: &str,
) -> Result<crate::BudgetUsageEntryRecord> {
    tx.query_row(
        "SELECT id, grant_id, usage_json, source, source_id, idempotency_key, created_at
         FROM budget_usage_entry WHERE id = ?",
        params![id],
        row_to_budget_usage_entry,
    )
    .map_err(Into::into)
}

fn get_budget_scope_tx(
    tx: &rusqlite::Transaction<'_>,
    scope_id: &str,
) -> Result<BudgetScopeRecord> {
    tx.query_row(
        "SELECT id, kind, owner_id, limit_json, usage_json,
                window_kind, state, created_at, updated_at
         FROM budget_scope WHERE id = ?",
        params![scope_id],
        row_to_budget_scope,
    )
    .map_err(Into::into)
}

fn get_optional_budget_scope_tx(
    tx: &rusqlite::Transaction<'_>,
    scope_id: &str,
) -> Result<Option<BudgetScopeRecord>> {
    tx.query_row(
        "SELECT id, kind, owner_id, limit_json, usage_json,
                window_kind, state, created_at, updated_at
         FROM budget_scope WHERE id = ?",
        params![scope_id],
        row_to_budget_scope,
    )
    .optional()
    .map_err(Into::into)
}

fn remaining_budget(limit: &BudgetAmount, consumed: &BudgetAmount) -> Option<BudgetAmount> {
    let tokens = remaining_dimension(limit.tokens, consumed.tokens)?;
    let cost_micros = remaining_dimension(limit.cost_micros, consumed.cost_micros)?;
    let wall_time_ms = remaining_dimension(limit.wall_time_ms, consumed.wall_time_ms)?;
    let tool_calls = remaining_dimension(limit.tool_calls, consumed.tool_calls)?;
    if [tokens, cost_micros, wall_time_ms, tool_calls]
        .into_iter()
        .all(|value| value.is_none())
    {
        return None;
    }
    Some(BudgetAmount {
        tokens,
        cost_micros,
        wall_time_ms,
        tool_calls,
    })
}

fn remaining_dimension(limit: Option<i64>, consumed: Option<i64>) -> Option<Option<i64>> {
    match limit {
        None => Some(None),
        Some(limit) => {
            let remaining = limit - consumed.unwrap_or(0);
            (remaining > 0).then_some(Some(remaining))
        }
    }
}

fn find_budget_grant_tx(
    tx: &rusqlite::Transaction<'_>,
    scope_id: &str,
    idempotency_key: &str,
) -> Result<Option<BudgetGrantRecord>> {
    tx.query_row(
        "SELECT id, scope_id, principal_id, reason, requested_json,
                committed_json, state, idempotency_key, expires_at,
                created_at, updated_at
         FROM budget_grant WHERE scope_id = ? AND idempotency_key = ?",
        params![scope_id, idempotency_key],
        row_to_budget_grant,
    )
    .optional()
    .map_err(Into::into)
}

fn get_optional_budget_grant_tx(
    tx: &rusqlite::Transaction<'_>,
    grant_id: &str,
) -> Result<Option<BudgetGrantRecord>> {
    tx.query_row(
        "SELECT id, scope_id, principal_id, reason, requested_json,
                committed_json, state, idempotency_key, expires_at,
                created_at, updated_at
         FROM budget_grant WHERE id = ?",
        params![grant_id],
        row_to_budget_grant,
    )
    .optional()
    .map_err(Into::into)
}

fn get_budget_grant_tx(
    tx: &rusqlite::Transaction<'_>,
    grant_id: &str,
) -> Result<BudgetGrantRecord> {
    get_optional_budget_grant_tx(tx, grant_id)?
        .ok_or_else(|| SystemServiceError::Invariant(format!("budget grant not found: {grant_id}")))
}
