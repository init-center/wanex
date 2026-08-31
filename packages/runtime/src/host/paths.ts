/**
 * Browser-safe HTTP paths shared by the Host client and trusted consumers.
 * Keep transport-independent validation code able to use these constants
 * without importing the Node HTTP implementation.
 */
export const REMOTE_AGENT_HOST_MESSAGE_PATH = "/v1/agent-host/message" as const;
