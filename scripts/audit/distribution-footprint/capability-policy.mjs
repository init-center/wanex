const optionalCapabilities = [
  "@wanex/plugin",
  "@wanex/connector",
  "@wanex/workspace"
]

// Host composition may supply read-only Workspace tools. Emitted-code limits
// are enforced separately by the TUI distribution closure check.
const workspaceHosts = new Set(["@wanex/assistant-host", "@wanex/tui"])

export function forbiddenCapabilityPackages(entry, closure) {
  return optionalCapabilities.filter((name) =>
    closure.includes(name) &&
    !(name === "@wanex/workspace" && workspaceHosts.has(entry))
  )
}
