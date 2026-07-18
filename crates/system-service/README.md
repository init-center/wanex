# wanex-system-service

Rust system service for SQLite, migrations, atomic file writes, resource tickets, and diagnostics.

This crate owns the low-level durability boundary. Node.js packages should use a storage client instead of writing runtime state files directly.
