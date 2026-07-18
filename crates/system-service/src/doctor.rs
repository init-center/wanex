use crate::{DoctorCheck, DoctorCheckState, DoctorReport, Result, SystemService};

impl SystemService {
    pub fn doctor(&self) -> Result<DoctorReport> {
        let conn = self.connect()?;
        let schema_version = crate::util::current_schema_version(&conn)?;
        let quick_check: String = conn.query_row("PRAGMA quick_check", [], |row| row.get(0))?;
        let journal_mode: String = conn.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
        let busy_timeout_ms: i64 = conn.query_row("PRAGMA busy_timeout", [], |row| row.get(0))?;

        let checks = vec![
            DoctorCheck {
                name: "sqlite.quick_check".to_string(),
                state: if quick_check == "ok" {
                    DoctorCheckState::Ok
                } else {
                    DoctorCheckState::Error
                },
                message: quick_check,
            },
            DoctorCheck {
                name: "sqlite.journal_mode".to_string(),
                state: if journal_mode.eq_ignore_ascii_case("wal") {
                    DoctorCheckState::Ok
                } else {
                    DoctorCheckState::Warn
                },
                message: journal_mode,
            },
            DoctorCheck {
                name: "sqlite.busy_timeout_ms".to_string(),
                state: if busy_timeout_ms > 0 {
                    DoctorCheckState::Ok
                } else {
                    DoctorCheckState::Warn
                },
                message: busy_timeout_ms.to_string(),
            },
        ];

        Ok(DoctorReport {
            store_path: self.db_path.clone(),
            schema_version,
            checks,
        })
    }
}
