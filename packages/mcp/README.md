# @wanex/mcp

Optional official MCP SDK integration for Wanex Runtime tools.

This package owns MCP process/network transports and their lifecycle. Runtime
and App do not depend on it. Trusted upper applications construct transport
configuration and explicitly start, stop, and dispose MCP clients or servers.

`WanexMcpRuntimeClient` requires an explicit `capabilityRevision`. MCP discovery
describes tool schemas but cannot prove that a remote or subprocess server kept
the same executable semantics across a Runtime restart. The trusted host must
bump this revision when the selected MCP server implementation changes. Wanex
combines it with client/tool identity and a non-secret transport configuration
digest in the Runtime Tool Registry snapshot; header and environment values are
never persisted.
