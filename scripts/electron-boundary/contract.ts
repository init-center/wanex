export const WANEX_DESKTOP_INVOKE_CHANNEL = "wanex.desktop.v1.invoke"

export interface WanexDesktopBridge {
  invoke(request: unknown): Promise<unknown>
}
