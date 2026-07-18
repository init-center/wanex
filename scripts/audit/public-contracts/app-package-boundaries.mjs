export const upperAppPackages = [
  "@wanex/product-app",
  "@wanex/product-app-command-host",
  "@wanex/product-app-local",
  "@wanex/product-app-web",
  "@wanex/product-app-tui"
]

export function isAppPackage(packageName) {
  return packageName === "@wanex/cli" ||
    packageName === "@wanex/product-app" ||
    packageName === "@wanex/product-app-command-host" ||
    packageName === "@wanex/product-app-local" ||
    packageName === "@wanex/product-app-web" ||
    packageName === "@wanex/product-app-tui"
}
