export const upperAppPackages = [
  "@wanex/product",
  "@wanex/plugin-command-host",
  "@wanex/desktop",
  "@wanex/local-host",
  "@wanex/web",
  "@wanex/tui"
]

export function isAppPackage(packageName) {
  return packageName === "@wanex/cli" ||
    packageName === "@wanex/product" ||
    packageName === "@wanex/plugin-command-host" ||
    packageName === "@wanex/desktop" ||
    packageName === "@wanex/local-host" ||
    packageName === "@wanex/web" ||
    packageName === "@wanex/tui"
}
