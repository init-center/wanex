export const LOCAL_MCP_SERVER_PREFIX = "assistant.mcp.server." as const

const SERVER_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u

export function isLocalMcpServerId(value: string): boolean {
  return SERVER_ID_PATTERN.test(value)
}

export function localMcpServerKey(serverId: string): string {
  if (!isLocalMcpServerId(serverId)) {
    throw new Error("MCP server ID is invalid")
  }
  return `${LOCAL_MCP_SERVER_PREFIX}${serverId}`
}
