# @wanex/desktop

Private Electron leaf for the Wanex desktop Assistant.

It owns Electron process, window, security, native-resource, and shutdown
lifecycle. It loads the real Assistant Web UI from an app-owned ephemeral
loopback Host. Electron does not enter Assistant Local, Assistant Web, App, Runtime,
or Kernel dependencies.

The package is pre-release and does not define installer, updater, signing,
notarization, publishing, or release-channel policy.

The packaged ASAR contains only `main.cjs`, `preload.cjs`, and `package.json`. System Service
and OS-keychain bindings are independently manifested resources under
`native/` and `credentials/`; no general dependency tree is shipped.

From the repository root, start the real persistent desktop Assistant with:

```bash
pnpm start:desktop
```

The command builds the host System Service, bundles the existing Electron main,
stages the host keychain binding, and enters the normal Assistant lifecycle. It
does not select a fake Provider, use proof receipts, or delete Assistant state on
exit.

From the repository root, build and prove the packaged Desktop:

```bash
pnpm build:desktop
pnpm proof:desktop
```

`proof:desktop` refreshes and verifies the current host native artifact as part
of packaging. Use the matching target identifier with `stage:native` when you
need to stage a native artifact independently on Intel macOS or Windows. The proof drives
the real Assistant DOM with an isolated OpenAI-compatible Provider fixture;
normal app launches start unconfigured and use the existing trusted Provider
onboarding path. In each packaged launch, the proof configures two Providers,
edits one model without resubmitting its credential, chats through that model,
removes the active Provider, verifies deterministic fallback, and chats again
without restarting Electron or the Assistant Host. It removes the
remaining proof Provider before shutdown and never writes raw credentials or
secret references into the report.

The same proof submits a multiline Markdown first message and rejects the
Assistant unless the header and Chat list show the exact concise canonical
Session title while the complete rich heading and code remain visible in the
conversation. The proof-only Provider fixture and generated credential remain
outside the packaged ASAR and production dependency closure.

The proof also runs a separate sixteen-process same-profile relaunch journey. Only
the first packaged process receives the raw credential and configures the
Provider. Later credential-free processes reopen the same canonical Session,
continue its conversation, cancel one response after transient output, verify
that no partial assistant row is committed, regenerate through one fresh
same-Session operation, queue one visible follow-up while a parent response is
streaming, preserve the active parent and canonical pending child, finish the
parent normally, promote the child once, ask and dismiss one tool-free Side
Query while another parent remains active without changing canonical history,
then finish that parent normally, prove file-picker, screenshot-paste, and drag/drop
multimodal attachment input, and submit an
ordinary image-generation request that the conversation model routes through
the standard `image_generate` Tool and durable media worker. A subsequent
process generates a read-only Plan proposal, observes it before execution,
explicitly approves revision 1, and executes revision 2 through the canonical
conversation Turn in the same Session. Another credential-free process starts
one bounded Goal, observes App coordinate two ordinary attempt Turns, and
renders failed-then-passed independent verification plus terminal success. The
final two processes remove the Provider through the trusted Host and verify the
unconfigured blocked state. All 35 Provider requests are authorized, and only
the configuration process receives the raw credential. All receipts are
bounded and secret-free; this is
acceptance coverage, not a production restart mode.

The current proof additionally creates the initial Chat before shutdown,
reopens it from the canonical Session/transcript projection, and submits a
follow-up under the same Session ID. The controlled fixture records both
authorized conversation requests in order.

A fifth same-profile process proves multimodal input without receiving the
credential. It rejects a PDF before Provider dispatch while preserving the
composer draft, then drives a real PNG through the file input, authenticated
upload, preview, remove/re-add, resource-bearing conversation request, and
canonical timeline preview. The fixture retains only bounded image metadata,
never the data URL or resource bytes.

The following same-profile process reuses that Session and attachment, submits
an ordinary request through the same composer, observes one succeeded
`image_generate` Tool, materializes one new immutable `model_output` Resource,
loads its trusted Blob-backed PNG preview, and waits for the final assistant
response. The controlled fixture verifies the prior upload is the only image
replayed to both conversation requests and that exactly one Images request is
authorized with the configured generation model.

## Packaged core proof and screenshot diagnostics

The release-blocking proof drives the real Electron Renderer and verifies
packaging, startup, Provider onboarding/edit/removal/fallback, conversations,
Assistant workflows, resource delivery, privacy, shutdown, and process cleanup.
It does not replace the Renderer with a fixture or make Electron a second
Assistant UI implementation.

The proof captures nonblank normal and narrow screenshots after Renderer paint:

- normal: `1280 x 748`;
- narrow: `760 x 748`.

Window managers may cap the requested content dimensions. The receipt therefore
records and validates the actual positive content/pixel dimensions and scale;
it does not require exact requested dimensions. Screenshots are packaging and
diagnostic evidence only. Temporary layout, drawer, focus, and visual styling
are not release gates while the Assistant UI is scheduled for reconstruction.
The replacement UI must freeze its own accessibility and visual acceptance
contract rather than inherit selectors or geometry from this implementation.

The latest evidence is written to:

- `/Users/asuna/workspace/my/wanex/target/distribution/desktop/desktop-report.json`;
- `/Users/asuna/workspace/my/wanex/target/distribution/desktop/desktop-proof-normal.png`;
- `/Users/asuna/workspace/my/wanex/target/distribution/desktop/desktop-proof-narrow.png`.

The report records content dimensions separately from physical screenshot
dimensions and DPI scale. The proof passed with five lifecycle samples,
35 authorized Provider requests, no `EPERM` rename, no owned-process residue,
and an ASAR containing only `main.cjs`, `preload.cjs`, and `package.json` with no application
`node_modules`.

## Coding composition boundary

Coding is a lazy domain inside this Desktop executable. Assistant startup does
not open a repository, workspace, or Coding Host. The first project selection
is owned by Electron main through the native directory picker; the Renderer
never supplies an absolute path. Main then creates the existing Coding Host
with the same local profile, storage authority, credential resolver, and active
model-endpoint resolver used by Assistant.

The preload exposes only `selectProject`, `sendCodingCommand`, and
`subscribeCodingEvents`. IPC accepts the existing `wanex.coding/1` request
contract and validates command responses, project read models, and event
envelopes before they cross the process boundary. Paths, credentials, Storage,
Runtime, Workspace, execution scopes, and process handles remain trusted-main
or Host concerns. A Coding close is idempotent and does not close the Assistant
Host or its profile Store.

Route 3A proved composition and the bridge. Route 3B.1/3B.2/3B.3/3B.4 now
provides the event-driven Coding workbench, the real approval/Proposal
journey, and explicit Tool recovery inside this same Desktop window; it does
not create a second Coding UI or a standalone Coding executable. Route 3C
extends the proof to an external installed copy.
