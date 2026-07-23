# @wanex/product-app-web

Lightweight web/desktop-like surface projection for `@wanex/product-app`.

This package is an upper app surface. Its root entry consumes only the Product
App renderer-side surface client and projects Product App state into a safe view
model and static HTML string. It does not create a browser app, start a dev
server, register Electron IPC, or depend on React, Vite, Electron, Tauri,
storage, runtime-composition, plugin runtime, connector runtime, runtime-host,
or Product App backend constructors.

## Product Boundary

Trusted host code owns Product App shell creation, storage paths, service binary
paths, and the Product App surface adapter. Renderer-like code should receive
only a Product App surface client:

```ts
import {
  createProductAppWebController,
  createProductAppWebSurface,
  handleProductAppWebRequest,
  parseProductAppWebActionInput,
  renderProductAppWebHtml,
  renderProductAppWebStylesheet
} from "@wanex/product-app-web"

const surface = await createProductAppWebSurface({ client })
const html = renderProductAppWebHtml(surface.snapshot())
const css = renderProductAppWebStylesheet()
const parsed = parseProductAppWebActionInput({
  action: "select-session",
  fields: {
    sessionId: "ses_product"
  }
})
if (parsed.ok) {
  await surface.dispatchAction(parsed.action)
}
```

For the usual framework-free host loop, prefer the controller:

```ts
const web = await createProductAppWebController({ client })
const firstDocument = web.document()
const submitted = await web.submitActionInput({
  action: "select-session",
  fields: {
    sessionId: "ses_product"
  }
})
const nextDocument = submitted.document

const started = await web.submitActionInput({
  action: "submit-conversation",
  fields: {
    text: "start a new session"
  }
})

const followedUp = await web.submitActionInput({
  action: "submit-conversation",
  fields: {
    sessionId: started.document.snapshot.conversation.sessionId,
    text: "continue this session"
  }
})
console.log(followedUp.document.snapshot.conversation.state)

const previewed = await web.submitActionInput({
  action: "preview-command",
  fields: {
    commandId: "product.agent.submit",
    inputJson: "{\"text\":\"hello\"}"
  }
})
console.log(previewed.document.snapshot.commandPreview.state)
```

The controller is still renderer-like. It only composes snapshot/render, action
input parsing, dispatch, bounded event polling, and re-rendering. It does not
own DOM listeners, browser globals, IPC registration, server routes, Product
App shell lifecycle, storage paths, or service binaries.

Concrete platform hosts can also use the request envelope:

```ts
const response = await handleProductAppWebRequest(web, {
  kind: "product-app-web.request",
  operation: "submitActionInput",
  requestId: "req_1",
  input: {
    action: "set-mode",
    fields: {
      mode: "workbench"
    }
  },
  options: {
    pollAfterAction: {
      limit: 20
    }
  }
})
```

The envelope is a platform-neutral message contract for IPC, Tauri commands,
local HTTP handlers, worker messages, or in-process tests. It validates request
ids, operation names, and bounded poll options, then delegates action fields to
`parseProductAppWebActionInput(...)`.

Trusted host code can create that client through the host-only subpath:

```ts
import { createProductAppWebHostSurfaceClient } from "@wanex/product-app-web/host"

const client = createProductAppWebHostSurfaceClient({ surface })
```

The host subpath accepts a Product App surface adapter and wraps it through the
Product App message transport contract. It does not create a Product App shell,
open storage, resolve service binaries, load plugins, start connectors, or
start a gateway/server.

`parseProductAppWebActionInput(...)` is the framework-free input boundary for
forms, worker messages, local APIs, or desktop IPC. It accepts only known action
ids and validates layout, mode, theme, density, required session fields, and
bounded conversation messages before a host dispatches the resulting typed action.

The web snapshot includes two distinct projections. `conversation` carries the
tracked asynchronous operation, durable progress, matching transient assistant
deltas, and cancel/regenerate capabilities. `workbench` is a read-only canonical
transcript view opened explicitly with `open-workbench`; it never submits text.

`submit-conversation` accepts bounded text with an optional session id. Product
App owns session creation, selection, operation tracking, and durable
reconciliation. `refresh-conversation`, `cancel-conversation`, and
`regenerate-conversation` operate on that tracked reference. Web renderers do
not generate operation identities or call lower storage/runtime APIs directly.

The snapshot also projects Product App home's bounded recent-session list into
`view.recentSessions`. When sessions are available, the `select-session` action
descriptor uses a select field populated from that list; when no sessions are
available, it falls back to a text field. The static HTML projection renders a
session navigation panel with normal `select-session` forms, so platform hosts
do not need a separate session-selection protocol.
Empty sessions, events, diagnostics, and workbench states render stable empty
rows in the static HTML projection instead of blank panels.

The snapshot also includes redacted provider profile rows. The static Settings
panel renders those rows and the active-profile selector so a user can confirm
which provider profiles are available and switch the active profile by id. It
also renders Product App's provider readiness summary from `readHome()`, such
as whether the active provider can run or needs host attention. It does not
include provider-profile creation, updates, raw API keys, secret references,
provider base URLs, protocol-version fields, or secret mutation controls;
those remain trusted host responsibilities.

The view model also projects a `providerRunGate` from the same redacted
readiness state. The static HTML renders a provider run-gate panel and disables
conversation submission when the active provider cannot run. This is a renderer
UX guard only: provider setup still happens in trusted host code such as
`@wanex/product-app-local`'s `providerSetup` facade or the host-side setup CLI.

The Web action boundary also supports `preview-command`. It accepts a
`commandId` and optional `inputJson`, calls Product App's
`previewProductCommandInvocation(...)` through the surface client, and renders
the latest command preview in the static HTML. This is read-only: it does not
execute the command, start a provider run, create sessions, or expose provider
setup mutation to renderer-like code.

The surface reads Product App's typed product-command catalog through
`readProductCommands()`. The Web view model projects bounded command rows with
id, title, category, handler reference, source, and trust metadata. The static
HTML renders those rows and uses them as the `preview-command` selector. If the
catalog is unavailable or empty, preview falls back to a command-id text field
and emits a diagnostic; core Web readiness remains independent from this
optional discovery projection. Product App Web does not import Product
Skeleton, load plugins, or execute dynamic commands while building the catalog.

Dynamic execution is a separate explicit `execute-command` action. It uses the
same catalog-backed command selector and calls only
`ProductAppSurfaceClient.executeProductCommand(...)`. Completed execution
renders Product App's bounded summary (`valueKind` plus allow-listed opaque
references); rejected execution renders reason and redacted provider readiness.
Raw heterogeneous command values never enter the Web snapshot or HTML. Preview
remains read-only and never triggers execution automatically.

The root entry also exports `renderProductAppWebStylesheet()`. The stylesheet
is a static, framework-free document-shell asset for the HTML projection. Hosts
may serve it beside the request envelope, but the stylesheet does not imply a
server, bundler, renderer framework, or Product App lifecycle owner.

The static HTML root projects Product App's renderer state into stable
attributes:

- `data-product-layout`
- `data-product-mode`
- `data-product-theme`
- `data-product-density`

The stylesheet uses those attributes so layout and mode have visible product
effects while remaining pure presentation. `single` is a one-column,
workbench-first view; `split` is the normal three-column workspace; and
`diagnostics` widens the diagnostics rail. Workbench and diagnostics modes
emphasize their corresponding panels without hiding settings or other escape
paths.

Use this package as the first embeddable web/desktop view contract. Concrete
Electron, Tauri, browser, or WebWorker hosts can later supply the `send` bridge
above `@wanex/product-app/surface-client`.
