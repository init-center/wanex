# @wanex/storage

Transport-backed durable stores for the Rust system service.

This package is the supported Node.js boundary for runtime storage operations.
It does not expose SQLite, store paths, or process lifecycle through store
facets.

## Entry Contract

The root entry exports transport implementations, store location, common
errors, `StorageHandle`, `CoreStore`, and `createCoreStore`. Runtime packages
receive `CoreStore` or a narrower core facet.

| Use when | Avoid when |
| --- | --- |
| A trusted runtime or app owner needs durable state through the system-service boundary. | A renderer can call a product command or consume a projected read model. |
| Bootstrap must open local-profile, local-system-service, or remote HTTP storage. | Code wants to write runtime JSON files or open SQLite directly. |
| An optional capability owner needs its explicit store subpath. | Product account, authentication, tenant selection, or UI policy is being added to Storage. |

```ts
import { createStorageHandle } from "@wanex/storage"

const handle = createStorageHandle({
  kind: "local-profile",
  rootDir,
  profileId,
  serviceBin
})

try {
  await handle.core.doctor()
} finally {
  await handle.dispose()
}
```

Remote handles provide endpoint and token only. The authenticated server
derives the store; clients cannot select a store path or tenant database.

## Optional Stores

Optional capabilities are explicit subpaths and borrow the handle transport:

- `@wanex/storage/workspace`;
- `@wanex/storage/plan`;
- `@wanex/storage/objective`;
- `@wanex/storage/delegation`;
- `@wanex/storage/team`;
- `@wanex/storage/plugin`;
- `@wanex/storage/connector`;
- `@wanex/storage/channel`.

```ts
import { createPluginStore } from "@wanex/storage/plugin"

const plugin = createPluginStore(handle.transport)
```

Optional stores expose only their domain methods. They have no `close()` or
`dispose()` and cannot own, restart, or release the shared transport.

## Lifecycle

The component that creates a handle owns it and calls `dispose()` exactly once;
disposal is idempotent. A component receiving an injected handle, transport, or
store borrows it and must not dispose it. `stop()` controls worker activity and
does not imply storage disposal.

Persistent local transports fail the in-flight call if the child process
closes, returns malformed stdout, or cannot be written to. They do not replay
possibly non-idempotent requests. The next call may start a fresh child after a
bounded backoff.

Transport failures use stable `StorageTransportError` codes for local one-shot,
local persistent, and remote HTTP failures.
