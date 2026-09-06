# @wanex/server

Concrete headless Wanex Server product. It runs where Agent work executes and
owns the application Hosts, Store, execution placement, listener, and shutdown
lifecycle for that machine.

Route 13A established the single-profile ownership foundation. Route 13B serves
the typed Assistant endpoint through a real authenticated HTTPS listener with
bounded SSE, replay, idempotency, subject isolation, and drain. Route 13C.1
adds an optional strict trusted Coding catalog. The Server bootstraps one
persistent local Store, derives the matching credential namespace, starts
Assistant and Coding against borrowed views of that Store, opens every
configured Git repository before readiness, and remains the only owner that
can close the physical Storage transport.

Remote clients cannot submit repository paths. Route 13C.2 serves Assistant or
Coding as exact one-domain sessions through the same listener and bounded
Remote Host session manager. The complete remote Coding journey follows in
Route 13C.3; distribution and installed product proof remain Route 13D work.

This package is not a Gateway, account service, generic composition framework,
or renderer dependency. Remote clients never select its Store or filesystem
paths.

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
