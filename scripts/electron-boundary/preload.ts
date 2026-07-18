import { contextBridge, ipcRenderer } from "electron"
import {
  WANEX_DESKTOP_INVOKE_CHANNEL,
  type WanexDesktopBridge
} from "./contract.js"

const bridge: WanexDesktopBridge = Object.freeze({
  async invoke(request: unknown): Promise<unknown> {
    return await ipcRenderer.invoke(
      WANEX_DESKTOP_INVOKE_CHANNEL,
      structuredClone(request)
    )
  }
})

contextBridge.exposeInMainWorld("wanexDesktop", bridge)
