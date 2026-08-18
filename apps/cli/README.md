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
- `wanex model-endpoint set <id>`
- `wanex model-endpoint get <id>`

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

## Model Endpoints

Model endpoints are stored through runtime config APIs:

```bash
wanex model-endpoint set local --protocol fake --provider-id fake --model fake-model
wanex model-endpoint set vision --protocol openai-chat-completions --provider-id openai --model gpt-vision --input-modalities text,image --output-modalities text --base-url https://api.example/v1 --secret-ref env://OPENAI_API_KEY
wanex run "hello" --model-endpoint local
```

Secret references are redacted from model-endpoint command output.

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
wanex support-bundle --model-endpoint local --memory-maintenance
```

The bundle includes doctor status, app diagnostics, selected safe provider
summaries, and limited event summaries. It does not include credential
references, secrets, bearer
tokens, raw chat history, or plugin stderr dumps by default.

## Memory Maintenance

Submit explicit memory compaction jobs through `@wanex/memory-runtime`:

```bash
wanex model-endpoint set local --protocol fake --provider-id fake --model fake-model --model-context-window-tokens 128000 --model-max-output-tokens 8192
wanex memory sweep --minimum-token-savings 1024
```

This command scans active agent sessions and enqueues durable
`memory.compaction` jobs when the memory plan says compaction is useful. It does
not start workers, run compaction inline, or start a gateway. The waterline is
derived from each completed Turn's frozen model limits; unknown input limits
are skipped rather than replaced by a CLI guess.
