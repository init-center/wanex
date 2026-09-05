# @wanex/mcp

Optional official MCP SDK integration for Wanex Runtime tools.

This package owns MCP process/network transports and their lifecycle. Runtime
and App do not depend on it. Trusted upper applications construct transport
configuration and explicitly start, stop, and dispose MCP clients or servers.

Both `connectTimeoutMs` and `requestTimeoutMs` are mandatory positive
integers. Streamable HTTP credentials belong in trusted request headers, not
in the URL. Header values are live connection inputs and are excluded from
Tool binding evidence.

Stdio clients require an explicit `cwd` and a borrowed Wanex Execution scope
whose admitted process policy is managed with `durable_supervisor` cleanup.
The transport uses the official SDK framing and protocol client, but starts
and terminates the process through that scope so Host shutdown waits for
process-tree cleanup evidence. Environment values are live inputs and must be
admitted by the Execution policy; they are excluded from Tool binding
evidence. Credentials must not be placed in command arguments or other
persisted literal configuration.

`WanexMcpRuntimeClient` requires an explicit `capabilityRevision`. MCP discovery
describes tool schemas but cannot prove that a remote or subprocess server kept
the same executable semantics across a Runtime restart. The trusted host must
bump this revision when the selected MCP server implementation changes. Wanex
combines it with client/tool identity and a non-secret transport configuration
digest in the Runtime Tool Registry snapshot. The digest commits to transport
identity, timeout behavior, environment/header names, and the Execution
Provider/capability/policy binding without retaining a process object, header
value, or environment value.
