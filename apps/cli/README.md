# Wanex CLI

The CLI is the first user-facing harness for the runtime. It stays thin:
commands use `@wanex/storage`, `agent-runtime`, and `provider-core`; it does
not write SQLite or runtime files directly.

Implemented commands:

- `wanex init`
- `wanex doctor`
- `wanex diagnostics`
- `wanex support-bundle`
- `wanex run <text>`
- `wanex events`
- `wanex memory sweep`
- `wanex provider set <id>`
- `wanex provider get <id>`

Planned commands:

- `wanex sessions`

## Storage

By default the CLI uses a local profile store under:

```text
$HOME/.wanex/profiles/default/state.db
```

Use `--store-profile <id>` to select a local profile, or `--store <dir>` for an
explicit resolved store directory. The two modes are intentionally exclusive.

The CLI uses one-shot storage clients for command execution. It does not start a
gateway or keep a background process alive.

## Provider Profiles

Provider profiles are stored through runtime config APIs:

```bash
wanex provider set local --kind fake --provider-id fake --model fake-model
wanex provider set vision --kind openai-compatible --provider-id openai --model gpt-vision --input-modalities text,image --output-modalities text --base-url https://api.example/v1 --secret-ref env:OPENAI_API_KEY
wanex run "hello" --provider local
```

Secrets are redacted from provider command output.

## Diagnostics

Read app-facing diagnostics without starting workers or a gateway:

```bash
wanex diagnostics --memory-maintenance --limit 20
```

Diagnostics are collected through `@wanex/app/diagnostics`, so the CLI keeps
the cold path free of the full runtime composition layer.

## Support Bundle

Collect a redacted support/debug bundle without starting workers:

```bash
wanex support-bundle --provider-profile local --memory-maintenance
```

The bundle includes doctor status, app diagnostics, selected safe provider
summaries, and limited event summaries. It does not include credential
references, secrets, bearer
tokens, raw chat history, or plugin stderr dumps by default.

## Memory Maintenance

Submit explicit memory compaction jobs through `@wanex/memory-runtime`:

```bash
wanex memory sweep --waterline-tokens 1 --policy-version cli-memory-v1
```

This command scans active agent sessions and enqueues durable
`memory.compaction` jobs when the memory plan says compaction is useful. It does
not start workers, run compaction inline, or start a gateway.
