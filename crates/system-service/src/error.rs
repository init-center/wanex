#[derive(Debug, thiserror::Error)]
pub enum SystemServiceError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid logical path: {0}")]
    InvalidLogicalPath(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("sha256 mismatch for {logical_path}: expected {expected}, got {actual}")]
    Sha256Mismatch {
        logical_path: String,
        expected: String,
        actual: String,
    },
    #[error("budget denied for {scope_id}: {reason}")]
    BudgetDenied { scope_id: String, reason: String },
    #[error("invalid scheduler job request: {0}")]
    InvalidJobRequest(String),
    #[error("internal invariant failed: {0}")]
    Invariant(String),
}

pub type Result<T> = std::result::Result<T, SystemServiceError>;
