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
export { isWanexDesktopOwnedNavigation } from "./window-policy.js"
export {
  DESKTOP_CODING_IPC,
  isCodingCommandRequest,
  isDesktopCodingProjectSelection,
  type DesktopCodingProjectSelection,
  type DesktopCodingRendererBridge,
} from "./coding-bridge.js"
export { installDesktopCodingIpc } from "./coding-ipc.js"
export type {
  DesktopCodingIpcEvent,
  DesktopCodingIpcMain,
  DesktopCodingWindow,
  DesktopCodingWebContents,
  InstallDesktopCodingIpcOptions,
} from "./coding-ipc.js"
export {
  createDesktopExtensionComposition,
  extensionInstallBaseDir,
  selectLocalExtensionDirectory,
} from "./extensions.js";
export type {
  DesktopExtensionCompositionOptions,
  NativeDirectorySelectionResult,
} from "./extensions.js";
