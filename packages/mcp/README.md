# @wanex/mcp

Optional official MCP SDK integration for Wanex Runtime tools.

This package owns MCP process/network transports and their lifecycle. Runtime
and App do not depend on it. Trusted upper applications construct transport
configuration and explicitly start, stop, and dispose MCP clients or servers.
