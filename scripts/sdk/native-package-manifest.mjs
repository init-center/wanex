export function createNativeNpmPackageManifest(nativePackage, version) {
  const executableName = nativePackage.platform === "win32"
    ? "wanex-system-service.exe"
    : "wanex-system-service"
  const executablePath = `${nativePackage.targetId}/${executableName}`
  return {
    name: nativePackage.name,
    version,
    license: "UNLICENSED",
    os: [nativePackage.platform],
    cpu: [nativePackage.arch],
    files: [
      "runtime-artifacts.json",
      executablePath
    ],
    exports: {
      "./runtime-artifacts.json": "./runtime-artifacts.json"
    }
  }
}
