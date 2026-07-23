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
mod sessions;
mod team;
mod tools;
mod turns;
mod util;
mod workspace;

use std::fs;
use std::path::{Path, PathBuf};

pub use error::{Result, SystemServiceError};
pub use models::*;

pub const SERVICE_NAME: &str = "wanex-system-service";
pub const CURRENT_SCHEMA_VERSION: i64 = 1;
const BASELINE_SCHEMA: &str = include_str!("../schema.sql");

#[derive(Debug)]
pub struct SystemService {
    root_dir: PathBuf,
    db_path: PathBuf,
}

impl SystemService {
    pub fn open(root_dir: impl AsRef<Path>) -> Result<Self> {
        let root_dir = root_dir.as_ref().to_path_buf();
        fs::create_dir_all(&root_dir)?;
        fs::create_dir_all(root_dir.join("files"))?;
        let db_path = root_dir.join("state.db");
        let service = Self { root_dir, db_path };
        service.initialize_schema()?;
        Ok(service)
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}
