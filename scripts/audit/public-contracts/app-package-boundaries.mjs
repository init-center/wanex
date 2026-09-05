export const upperAppPackages = [
  "@wanex/assistant",
  "@wanex/assistant-plugin-host",
  "@wanex/desktop",
  "@wanex/assistant-host",
  "@wanex/assistant-ui",
  "@wanex/server",
  "@wanex/tui"
]

export const removedAssistantPackages = [
  "@wanex/product",
  "@wanex/web",
  "@wanex/local-host",
  "@wanex/assistant-local-host",
  "@wanex/plugin-command-host"
]

export function isAppPackage(packageName) {
  return packageName === "@wanex/cli" ||
    packageName === "@wanex/assistant" ||
    packageName === "@wanex/assistant-plugin-host" ||
    packageName === "@wanex/desktop" ||
    packageName === "@wanex/assistant-host" ||
    packageName === "@wanex/assistant-ui" ||
    packageName === "@wanex/server" ||
    packageName === "@wanex/tui"
}
