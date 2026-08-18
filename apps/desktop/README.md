# @wanex/desktop

Private Electron leaf for the Wanex desktop Product.

It owns Electron process, window, security, native-resource, and shutdown
lifecycle. It loads the real Product Web UI from an app-owned ephemeral
loopback Host. Electron does not enter Product Local, Product Web, App, Runtime,
or Kernel dependencies.

The package is pre-release and does not define installer, updater, signing,
notarization, publishing, or release-channel policy.

The packaged ASAR contains only `main.cjs` and `package.json`. System Service
and OS-keychain bindings are independently manifested resources under
`native/` and `credentials/`; no general dependency tree is shipped.

From the repository root, start the real persistent desktop Product with:

```bash
pnpm start:desktop
```

The command builds the host System Service, bundles the existing Electron main,
stages the host keychain binding, and enters the normal Product lifecycle. It
does not select a fake Provider, use proof receipts, or delete Product state on
exit.

From the repository root, stage the current native service before packaging:

```bash
pnpm stage:native -- --target darwin-arm64
pnpm build:desktop
pnpm proof:desktop
```

Use the matching target identifier on Intel macOS or Windows. The proof drives
the real Product DOM with an isolated OpenAI-compatible Provider fixture;
normal app launches start unconfigured and use the existing trusted Provider
onboarding path. In each packaged launch, the proof configures two Providers,
edits one model without resubmitting its credential, chats through that model,
removes the active Provider, verifies deterministic fallback, and chats again
without restarting Electron or the Product Local Host. It removes the
remaining proof Provider before shutdown and never writes raw credentials or
secret references into the report.

The same proof submits a multiline Markdown first message and rejects the
Product unless the header and Chat list show the exact concise canonical
Session title while the complete rich heading and code remain visible in the
conversation. The proof-only Provider fixture and generated credential remain
outside the packaged ASAR and production dependency closure.

The proof also runs a separate eleven-process same-profile relaunch journey. Only
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
unconfigured blocked state. All 28 Provider requests are authorized, and only
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

## Packaged visual and accessibility proof

The packaged proof is also the desktop acceptance boundary for the current
Product surface. It drives the real Electron renderer and checks the DOM after
the same lifecycle setup; it does not replace the renderer with a screenshot
fixture or make Electron a second Product UI implementation.

It verifies both logical content viewports:

- normal: `1280 x 748`;
- narrow: `760 x 748`, where the permanent sidebar becomes the same compact
  session drawer.

The normal proof checks the semantic conversation log, unframed completed
messages, brand-free Product chrome, reduced-motion stylesheet, Composer
visibility, and horizontal overflow. It then opens Settings and verifies dialog
focus entry, forward/backward Tab containment, background `inert`, Escape close,
and focus restoration to the opener.

The narrow proof checks the hidden initial sidebar, mobile navigation entry,
drawer dialog semantics, focus entry, background `inert`, Tab containment,
Escape close, focus restoration, and a reopened drawer screenshot state.

The latest evidence is written to:

- `/Users/asuna/workspace/my/wanex/target/distribution/product-desktop/product-desktop-report.json`;
- `/Users/asuna/workspace/my/wanex/target/distribution/product-desktop/product-desktop-proof-normal.png`;
- `/Users/asuna/workspace/my/wanex/target/distribution/product-desktop/product-desktop-proof-narrow.png`.

The report records CSS viewport dimensions separately from physical screenshot
dimensions and DPI scale. The proof passed with five lifecycle samples,
28 authorized Provider requests, no `EPERM` rename, no owned-process residue,
and an ASAR containing only `main.cjs` and `package.json` with no application
`node_modules`.
