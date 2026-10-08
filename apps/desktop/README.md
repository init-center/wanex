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

Internal Store schemas intentionally have no compatibility migration. If a
previous development profile is rejected, keep it intact and explicitly select
a new local profile (this does not transfer its history or model settings):

```bash
WANEX_DESKTOP_PROFILE_ID=preview-20261008 pnpm start:desktop
```

The default remains `default`; the selected profile is validated by the existing
StoreLocator. There is no automatic reset or fallback on schema rejection. Use
the same variable on subsequent launches to reopen that profile. This selects a
local Store, not a remote Server connection or user account.

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

The proof also runs a separate twenty-process same-profile relaunch journey. Only
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
unconfigured blocked state. All 36 Provider requests are authorized, and only
the configuration process receives the raw credential. All receipts are
bounded and secret-free; this is
acceptance coverage, not a production restart mode.

The current proof additionally creates the initial Chat before shutdown,
reopens it from the canonical Session/transcript projection, and submits a
follow-up under the same Session ID. The controlled fixture records both
authorized conversation requests in order.

A later same-profile process proves multimodal input without receiving the
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
36 authorized Provider requests, no `EPERM` rename, no owned-process residue,
and an ASAR containing only `main.cjs`, `preload.cjs`, and `package.json` with no application
`node_modules`.

## Unified Workspace boundary

Ordinary chat and file work use one Assistant Session. There is no separate
Coding Host, Coding transcript or mode classifier. Directory selection and
Server connection credentials remain trusted-main concerns. The Renderer uses
semantic Assistant commands and opaque root/change references; it does not own
absolute Server paths, leases or file transactions.

Desktop explicitly injects its own Renderer assets into the shared HTTP Host.
The build checks the esbuild dependency graph and rejects generic generated Web
assets in the main bundle, independently of byte budgets. This prevents shipping
both the generic browser client and the Desktop client in one application.

## Renderer CSS support

The current Renderer colour tokens require `CSS.supports("color",
"light-dark(black, white)")`. Electron 43.7.8 / Chromium 150.0.7871.250 was
checked with actual light/dark computed colours on 2026-10-08. The same runtime
supports `interpolate-size: allow-keywords` and `::details-content`; these are
animation enhancements, not prerequisites for the native disclosure behaviour.
This local probe is not accessibility, contrast or full visual acceptance.
