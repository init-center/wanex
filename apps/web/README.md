# @wanex/web

Browser Product surface for `@wanex/product`.

This package is an upper application surface. It consumes the application
surface client and projects canonical Product state into a typed
`Snapshot`. It does not open storage, resolve the native System
Service, load plugins, start connectors, or own an execution authority.

The package has one browser renderer. Hosts consume its framework-neutral
client entry:

```ts
import {
  createHttpClient,
  mountClient,
} from "@wanex/web/client";

const client = createHttpClient({
  requestPath: "/wanex/web/request",
  eventStreamPath: "/wanex/web/events",
  hostSessionToken,
});

mountClient({
  root: document.querySelector("[data-app-root]")!,
  client,
});
```

The Node local host serves this same renderer at `/` with one same-origin
script and stylesheet. There is no second HTML renderer or compatibility
document wrapper.

## Product Boundary

The trusted host owns application shell creation, storage paths, service
binary paths, authentication, bounded binary upload and preview, Provider
credential mutation, model catalog refresh, and the SSE connection. The
renderer receives only the typed browser-facing client:

```ts
import {
  createController,
  createSurface,
  handleRequest,
} from "@wanex/web";

const surface = await createSurface({ client });
const snapshot = surface.snapshot();

const selected = await surface.dispatchAction({
  type: "select-session",
  sessionId: "ses_product",
});
console.log(snapshot.kind, selected.snapshot.view.selection);
```

For a framework-free platform host, the controller exposes the same typed
boundary:

```ts
const web = await createController({ client });
const first = web.snapshot();
const submitted = await web.dispatchAction({
  type: "submit-conversation",
  input: { text: "start a new session" },
});
console.log(first.kind, submitted.snapshot.conversation.state);
```

The request envelope is suitable for IPC, local HTTP, worker messages, or
in-process tests. Reads return a snapshot directly. Action submission returns
the typed action result and its resulting snapshot. Errors also carry the
current snapshot. No response contains rendered Product HTML.

```ts
const response = await handleRequest(controller, {
  kind: "web.request",
  operation: "dispatchAction",
  requestId: "req_1",
  action: {
    type: "set-layout",
    input: { layout: "split" },
  },
});
```

The transport validates the request envelope and known action discriminant.
The Product Surface remains the sole runtime authority for each complete typed
action payload and fails closed without mutating canonical state. React builds
typed action values directly from its controls; there is no form-field codec,
JSON string field, or compatibility decoder between the renderer and Product.

## Rendering Contract

The renderer owns ephemeral UI state such as draft text, panel visibility,
upload progress, object-URL previews, and stream connection status. Product
owns canonical sessions, messages, operations, attachments, Plans, Goals,
approvals, recovery decisions, and provider readiness. The renderer reconciles
after every action and retained event; it never writes Storage or reconstructs
a second transcript.

The primary Product layout is chat-first:

- left sidebar: new conversation, recent sessions, and settings;
- center timeline: user, assistant, reasoning, tools, approvals, recovery,
  and workflow interactions;
- composer: message, attachment, model, send, stop, queue, and guide controls;
- contextual panel: settings, workflows, or execution context only when
  requested.

Runtime identities such as job, attempt, event, and worker are not primary
conversation UI. They appear only through bounded status or recovery evidence
when a user action requires it.

Resource previews use short-lived opaque URLs issued by the trusted Host. The
URL is bound to one Resource identity and digest and never enters a canonical
snapshot or browser storage. Raw file paths, credentials, secret references,
and native service details remain outside the Renderer.

Image previews have three renderer-local states: loading, ready, and failed.
Failed reads show an explicit retry that rereads the same resource through the
trusted host. Retry does not re-upload the attachment, regenerate media, create
a Session, or change the canonical Resource. When a host does not expose
`prepareResourceDelivery`, the renderer shows an unavailable state without an
impossible retry action. Each retry requests a fresh short-lived grant for the
same canonical Resource.

Non-image timeline Resources use their canonical kind, media type, and size to
render a typed metadata card. File, video, audio, document, artifact, log,
patch, and URL Resources have distinct labels and icons. The renderer does not
show play, download, open, or retry controls when the trusted host has not
provided that capability. Non-image Resources do not request delivery merely
because their metadata is visible.

The `generated/client-script` and `generated/stylesheet` subpaths contain the
generated browser assets consumed by the local host. Rebuild them after browser
source changes:

```sh
pnpm --filter @wanex/web build:browser
```

The package check verifies that the generated bundle is current. The browser
bundle contains only React, Product Web, and their explicitly allowed browser
dependencies; it does not contain Runtime, Storage, Rust, Electron, or Node
host imports.

## Availability and event recovery

The renderer treats the canonical snapshot as the availability anchor and SSE
as a degradable incremental channel. An initial snapshot read failure renders a
retryable unavailable state instead of an indefinite loading screen. A later
refresh failure preserves the current timeline and Composer draft while showing
a bounded retry notice.

When the event stream closes, the Product remains usable and the top bar exposes
`Reconnect live updates`. Reconnect performs one canonical read and replaces the
existing subscription while preserving the client's stream cursor. There is no
renderer polling, fixed retry interval, page reload, new Session, or lower-layer
availability record.
