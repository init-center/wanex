# @wanex/storage-control-plane

Optional server-side reference contract for remote Wanex storage endpoints.

This package does not start a server or gateway. Upper applications adapt their
HTTP framework to `createRemoteStorageControlPlane`.

Clients send endpoint/token only. The control plane authenticates the token,
derives the store server-side, and forwards the storage RPC envelope.

For a real remote service, keep one long-lived transport per resolved store or
subject. Do not create a fresh one-shot system-service process for every HTTP
request to the same SQLite store; concurrent requests can otherwise compete for
the same database file lock.

```ts
const pool = createStorageTransportPool({
  createTransport(subject) {
    return new PersistentSystemServiceStorageTransport({
      storeDir: storeForSubject(subject),
      serviceBin
    })
  }
})

const controlPlane = createRemoteStorageControlPlane({
  authenticateBearerToken,
  resolveStorageTransport: pool.resolveStorageTransport
})

// Close the pool during server shutdown.
await pool.close()
```
