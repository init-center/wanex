mod atomic_file;
mod budget;
mod channel;
mod config;
mod connector;
mod context;
mod db;
mod delegation;
mod doctor;
mod error;
mod event_store;
mod events;
mod execution_environment;
mod media_generation;
mod messages;
mod models;
mod objective;
mod plan;
mod plugin;
mod provider_invocations;
mod resources;
mod rows;
mod run_control;
mod scheduler;
mod secret_references;
mod sessions;
mod team;
mod tools;
mod turns;
mod util;
mod workspace;
mod workspace_child;
mod workspace_lock;
mod workspace_snapshot;
mod workspace_transaction;

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub use error::{Result, SystemServiceError};
pub use models::*;
pub use workspace_child::run_workspace_child_helper;
pub use workspace_lock::run_workspace_lock_helper;
pub use workspace_snapshot::run_workspace_snapshot_helper;
pub use workspace_transaction::run_workspace_transaction_helper;

pub const SERVICE_NAME: &str = "wanex-system-service";
pub const CURRENT_SCHEMA_VERSION: i64 = 20;
const BASELINE_SCHEMA: &str = include_str!("../schema.sql");

#[derive(Debug)]
pub struct SystemService {
    root_dir: PathBuf,
    db_path: PathBuf,
    workspace_apply_claim_gate: Mutex<()>,
}

impl SystemService {
    pub fn open(root_dir: impl AsRef<Path>) -> Result<Self> {
        let root_dir = root_dir.as_ref().to_path_buf();
        fs::create_dir_all(&root_dir)?;
        fs::create_dir_all(root_dir.join("files"))?;
        let db_path = root_dir.join("state.db");
        let service = Self {
            root_dir,
            db_path,
            workspace_apply_claim_gate: Mutex::new(()),
        };
        service.initialize_schema()?;
        Ok(service)
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}
