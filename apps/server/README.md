# @wanex/server

Concrete headless Wanex Server product. It runs where Agent work executes and
owns the application Hosts, Store, execution placement, listener, and shutdown
lifecycle for that machine.

Route 13A established the single-profile ownership foundation. Route 13B serves
the typed Assistant endpoint through a real authenticated HTTPS listener with
bounded SSE, replay, idempotency, subject isolation, and drain. The Server
bootstraps one persistent local Store, derives the matching credential
namespace, starts the Assistant application against the borrowed Store, and
remains the only owner that can close the physical Storage transport.

Remote clients cannot submit repository paths. The listener serves the
Assistant domain through the bounded Remote Host session manager.

This package is not a Gateway, account service, generic composition framework,
or renderer dependency. Remote clients never select its Store or filesystem
paths.

## Account Boundary

One Server instance exposes one resolved profile Store to one trusted account.
Programmatic startup requires `authentication.ownerSubjectId` alongside
`authenticateBearerToken`. Authentication alone is not authorization: a valid
token resolving to a different subject cannot connect to either application,
upload attachments, or read Resources. Startup snapshots this owner binding;
it cannot be changed by mutating the caller's options while the Server runs.

Multiple devices or rotated credentials may resolve to the same subject and
access its existing Sessions. The account subject is not a tool/agent
`principalId`. A multi-account service must resolve separately owned Host/Store
instances in its trusted control plane instead of returning this single Host
for every logged-in account. Existing transport-session fencing additionally
prevents one account from reusing another account's connection credentials.
The process CLI uses one configured bearer mapped to `server-process-subject`;
it does not accept an account ID or Store path from the remote client.

## Unified Workspace

Trusted Server configuration can additionally declare
`workspace.initialRoots: [{ id, path, effects }]`. Paths belong to the Server
machine; effects default to read-only. Explicit `read/write/create/remove`
grants enable controlled direct text edits, and optional Git worktree preparation
uses the same Assistant Session. Clients only reference authorized root IDs and
do not provide helper paths or need a local Git installation.

The Server derives its isolation directory from the profile store, or accepts
an absolute `workspace.worktreeDirectory` in trusted configuration. This location
is frozen for admitted work. Preparation produces a durable Proposal and does
not apply it to the original root. Missing Git or executable Git filters reject
the explicit worktree operation without affecting ordinary direct editing.
Unused global filter registrations do not disable ordinary repositories.

## Headless process

The Server has one strict process entrypoint:

```bash
WANEX_SERVER_BEARER_TOKEN='change-me' \
WANEX_SYSTEM_SERVICE_BIN='/absolute/path/wanex-system-service' \
pnpm start -- --config /absolute/path/server.json
```

The JSON file contains the normalized Server configuration plus absolute TLS
file paths:

```json
{
  "dataRoot": "/absolute/path/wanex-data",
  "profileId": "default",
  "listener": { "hostname": "127.0.0.1", "port": 8443 },
  "tls": {
    "keyFile": "/absolute/path/server.key",
    "certFile": "/absolute/path/server.crt"
  }
}
```

`WANEX_SERVER_BEARER_TOKEN` is process-only authentication material and is
never written to the Store or returned by the ready line. Provider credentials
use `env://VARIABLE_NAME` references and are resolved only inside the trusted
Server process. The process emits one `wanex.server.ready` JSON line, then
waits for `SIGINT` or `SIGTERM` and performs the normal bounded Server close. A
parent process that starts it with a Node IPC channel may instead send
`{ "kind": "wanex.server.shutdown" }`; this uses the same close path and is
the portable control mechanism for managed child processes.
