export {
  WANEX_DESKTOP_CREDENTIAL_ARTIFACT_FILE,
  WANEX_DESKTOP_CREDENTIAL_ARTIFACT_KIND,
  desktopTargetId,
  loadWanexDesktopCredentialBinding,
  parseWanexDesktopCredentialArtifactManifest,
  resolveWanexDesktopCredentialArtifact,
  type ResolvedWanexDesktopCredentialArtifact,
  type WanexDesktopCredentialArtifactManifest
} from "./credential-artifact.js"
export {
  createWanexDesktopOwnedLifecycle,
  type WanexDesktopOwnedLifecycle
} from "./lifecycle.js"
export { createWanexDesktopNavigationPolicy } from "./window-policy.js"
export {
  DESKTOP_SERVER_IPC,
  isDesktopServerProfileList,
  type DesktopServerRendererBridge,
} from "./server/bridge.js"
export {
  createDesktopExtensionComposition,
  extensionInstallBaseDir,
  selectLocalExtensionDirectory,
} from "./extensions.js";
export type {
  DesktopExtensionCompositionOptions,
  NativeDirectorySelectionResult,
} from "./extensions.js";
