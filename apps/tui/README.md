# @wanex/tui

Concrete terminal surface adapter for `@wanex/assistant`.

This package is a leaf upper app surface. It consumes the application
renderer-side surface client and projects canonical Assistant state into terminal
presentation.

## Entry Contract

Use this package when a assistant wants a terminal surface over application.

| Use when | Avoid when |
| --- | --- |
| A TUI should call application through `@wanex/assistant/surface`. | A backend needs to create application storage or lifecycle. |
| You want a full-screen chat surface, compact terminal overview, dynamic Assistant command workflow, or injected line session. | You need Electron, Tauri, React, or HTTP rendering. |
| You need to prove a UI does not import lower runtime packages. | You need plugin runtime, connector runtime, or runtime-composition by default. |

## Assistant Boundary

Call `createTuiSurface({ client })` with a application surface client.
The TUI surface reads descriptors, app status, home state, and surface events
through that client. It must not open storage, receive store paths, receive
service binary paths, import App Command Runtime backend constructors, or call
lower runtime packages directly.

The TUI overview includes application's provider readiness status from
`readHome()`, such as `provider:ready` or
`provider:missing_required_credential`.
It is display-only and does not add provider secret mutation to the TUI surface.

This package intentionally keeps TUI optional. It does not become
part of the default `@wanex/assistant` closure unless a assistant explicitly
depends on it.

## Full-Screen TUI

The interactive TUI uses `@earendil-works/pi-tui` for terminal input,
multiline editing, CJK width, differential rendering, resize, overlays, and
terminal restoration. Wanex owns only Assistant projection, action mapping,
draft state, and keybinding policy.

```ts
import { createTuiFullScreen } from "@wanex/tui/full-screen"

const tui = createTuiFullScreen({ client })
await tui.start()
await tui.waitUntilStopped()
```

The full-screen renderer reads canonical history through
`readSessionTranscript`, subscribes to bounded transient Assistant events, and
reconciles canonical state after invalidation or event uncertainty. It does
not poll, open the workbench, access Storage, receive host paths, or retain a
second conversation log.

Controls are `Enter` to submit, `Shift+Enter` to insert a newline, `Ctrl+O` to
open or start a conversation, `Ctrl+P` to search Assistant's current dynamic
command catalog, `F2` to choose a configured model, `Ctrl+N` to queue after
current work, `F3` to add or remove canonical attachment drafts, `F4` to review
Plans, `F5` to control Goals, `F6` to ask an ephemeral Side Query, `Ctrl+G` to
guide current work, dynamic `F7` to review required recovery or explicitly
regenerate a terminal response, `F8` to return to trusted-host Provider
management, `Ctrl+X` to stop, and `Ctrl+Q` to quit. The
command workflow collects schema-backed input, requires a runnable
Assistant preview and explicit confirmation, then executes through the same
Assistant Surface client. Tool approval always invalidates that workflow and
opens the highest-priority focused overlay. All pickers preserve the composer
draft and commit mutations only through accepted Assistant commands.

`F7` never replays ambiguous Tool work automatically. Recovery presents only
Assistant's bounded evidence and available decisions, submits the exact visible
revision after explicit confirmation, and keeps lower execution identities out
of terminal output. Regeneration starts one fresh Assistant operation only after
confirmation; a capacity failure uses the existing explicit `F2` model choice
before regeneration.

The real trusted CLI entry injects the existing bounded attachment host into
full-screen mode. The Pi renderer prompts for a path but never reads the file;
the trusted host ingests bytes and prepares Assistant's canonical attachment
draft. The renderer then rereads safe metadata through Assistant Surface. It can
submit an attachment with or without text, and a rejected submission preserves
both drafts.

## Minimal Use

```ts
import { createTuiSurface, renderTuiFrame } from "@wanex/tui"

const surface = await createTuiSurface({ client })
console.log(renderTuiFrame(surface.snapshot()).text)
await surface.client.submitConversationOperation({
  text: "hello"
})
await surface.refresh()
```

## Line Session

The package also retains an injected IO line session for automation,
accessibility consumers, CLI wrappers, tests, and simple terminals:

```ts
import { runTuiLineSession } from "@wanex/tui"

await runTuiLineSession({
  surface,
  input,
  write: (chunk) => process.stdout.write(chunk)
})
```

Supported commands are `help`, `ask <text>`, `select <session-id>`,
`workbench [session-id]`, `operation [session-id]`, `cancel [reason]`,
`regenerate [session-id]`,
`commands`, `preview <command-id> [json-input]`,
`execute <command-id> [json-input]`, `events [limit]`, `overview`, `refresh`,
and `quit`.

`ask` submits and returns immediately. `operation` reads durable progress,
`cancel` requests durable cancellation, and `regenerate` creates a fresh turn
from a terminal source operation. `workbench` only renders the canonical
transcript.

`commands` renders application's typed dynamic command catalog, including
built-in and plugin-contributed command metadata. It reads through the Assistant
App surface client and does not load plugin runtime or execute a command.

`preview <command-id> [json-input]` reads the application command invocation
policy and renders whether the command is runnable. It does not execute the
command and does not duplicate application validation in the TUI layer.

`execute <command-id> [json-input]` explicitly executes a catalog command
through the typed application surface client. The presenter prints only the
bounded completion summary or rejection/provider state; it never serializes a
raw heterogeneous command value. The one-shot CLI exposes the same `execute`
command and bounded result contract.

The line session is still a leaf surface. It only uses the application surface
client. It does not call App Command Runtime backend APIs,
storage clients, runtime-composition, plugin runtime, connector runtime,
runtime-host, or agent-runtime.

## CLI Host

`@wanex/tui` includes a local trusted CLI host:

```bash
pnpm --filter @wanex/tui start overview
pnpm --filter @wanex/tui start overview --json
pnpm --filter @wanex/tui start commands
pnpm --filter @wanex/tui start commands --json
pnpm --filter @wanex/tui start events --limit 10
pnpm --filter @wanex/tui start preview assistant.agent.submit '{"text":"hello"}'
pnpm --filter @wanex/tui start execute assistant.status
pnpm --filter @wanex/tui start interactive
pnpm --filter @wanex/tui start fullscreen
```

From the workspace root, use the demo runner when you want a temporary store
that is cleaned up after the command exits:

```bash
pnpm demo:tui
pnpm demo:tui:json
pnpm demo:tui:interactive
pnpm demo:tui:fullscreen
```

The CLI host owns local lifecycle for development and executable assistant
checks. It starts the presentation-neutral lifecycle from
`@wanex/assistant-host/application`, then creates the surface client through the
application message transport contract. That shared composition owns storage,
Assistant Shell, durable Team runtime, Team execution, and reverse-order cleanup;
it starts no Web or HTTP host for the TUI. `SIGINT` and `SIGTERM` stop
full-screen rendering first, restore the terminal, then dispose the owned
Assistant and System Service lifecycle.

When no Provider is configured, the trusted host collects a bounded Provider
preset, model ID, optional custom base URL, and masked credential before it
starts the renderer. `F8` later stops and restores the renderer, lets the same
host list redacted Providers and add, rotate, edit a model ID, or remove a
connection, then creates a fresh renderer over the same application and System
Service. Adding a second Provider does not replace the active selection;
removing the active Provider uses App's deterministic fallback, and removing
the final Provider returns to an explicit unconfigured chat state. Custom base
URL changes use add-then-remove rather than a misleading in-place edit.

Provider mutation remains an App-owned trusted-host capability. The Pi
renderer receives only the opaque `provider-management` exit reason and never
receives the coordinator, credential store, secret reference, store path, or
raw credential.

The trusted entry accepts one exact model endpoint through environment
metadata:

| Variable | Meaning |
| --- | --- |
| `WANEX_STORE_DIR` | Local profile/store location. Defaults to `.wanex-tui`. |
| `WANEX_SYSTEM_SERVICE_BIN` | Optional explicit development System Service binary. Installed distributions normally resolve their artifact automatically. |
| `WANEX_MODEL_ENDPOINT_ID` | Opaque endpoint identity. |
| `WANEX_PROVIDER_CONNECTION_ID` | Optional connection identity; defaults to the endpoint identity. |
| `WANEX_PROVIDER_PROTOCOL` | `fake`, `openai-chat-completions`, or `anthropic-messages`. |
| `WANEX_PROVIDER_PROTOCOL_VERSION` | Optional Provider protocol version evidence. |
| `WANEX_PROVIDER_ID` | Provider identity, such as `openai-compatible` or `anthropic`. |
| `WANEX_PROVIDER_BASE_URL` | Required for real Provider protocols. |
| `WANEX_PROVIDER_SECRET_REF` | Required opaque `env://...` or profile-owned `wanex-keychain://...` reference for real Providers. |
| `WANEX_PROVIDER_MODEL_ID` | Provider model identity. |
| `WANEX_MODEL_OPERATIONS` | Comma-separated operations; defaults to `conversation`. |
| `WANEX_MODEL_INPUT_MODALITIES` | Comma-separated input modalities; defaults to `text`. |
| `WANEX_MODEL_OUTPUT_MODALITIES` | Comma-separated output modalities; defaults to `text`. |
| `WANEX_MODEL_FEATURES` | Optional comma-separated canonical features. |
| `WANEX_MODEL_REASONING_REPLAY` | Optional canonical reasoning replay behavior. Requires the `reasoning` feature. |

For an environment-backed OpenAI-compatible endpoint:

```bash
export OPENAI_API_KEY='...'
export WANEX_MODEL_ENDPOINT_ID='my-openai-endpoint'
export WANEX_PROVIDER_PROTOCOL='openai-chat-completions'
export WANEX_PROVIDER_ID='openai-compatible'
export WANEX_PROVIDER_BASE_URL='https://api.openai.com/v1'
export WANEX_PROVIDER_SECRET_REF='env://OPENAI_API_KEY'
export WANEX_PROVIDER_MODEL_ID='gpt-5.1'
pnpm --filter @wanex/tui start fullscreen
```

The endpoint is parsed by Runtime's canonical Provider schema before Assistant
startup. Real endpoints require both base URL and opaque secret reference; raw
credentials are not endpoint fields. Environment references are resolved
without loading the native keychain. Profile-owned keychain references lazy
load the shared `@wanex/local-credential-store` adapter using the same
store-derived namespace as Assistant Local/Desktop.

This CLI host is trusted assistant entry code. Renderer-like surface code still
receives only the borrowed Assistant Surface client and optional attachment host;
it does not receive store paths, service binary paths, endpoint metadata,
secret references, credentials, keychain access, or Provider adapters.

For host wiring tests or assistant hosts that want the same boundary, use:

- `createTuiHostSurfaceClient({ surface })`;
- `sendTuiHostSurfaceMessage(surface, request)`.

These helpers do not start a gateway or server. They model the same app-owned
message boundary that Electron, Tauri, Web Worker, or local API integrations can
wrap later.

## Lifecycle

The TUI surface does not own application storage or service
lifecycle. The trusted app backend or CLI host owns the application shell and
surface adapter. The TUI owns only canonical snapshot presentation, Assistant
Surface command invocation, line-session orchestration, and terminal rendering
helpers.

The package exposes only its root and `./full-screen`. Assistant's dynamic
command catalog is the sole generic command authority; there is no static TUI
palette, generic shell controller, or TUI contribution resolver.
