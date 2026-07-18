import type {
  PluginCapability,
  PluginInstallState,
  PluginManifestState
} from "@wanex/protocol"
import { expectArray, expectString } from "./codec-common.js"

export function expectPluginManifestState(value: unknown): PluginManifestState {
  const state = expectString(value, "plugin_manifest.state")
  if (state !== "registered" && state !== "disabled") {
    throw new Error(`invalid plugin manifest state: ${state}`)
  }
  return state
}

export function expectPluginInstallState(value: unknown): PluginInstallState {
  const state = expectString(value, "plugin_install.state")
  if (state !== "installed" && state !== "disabled" && state !== "removed") {
    throw new Error(`invalid plugin install state: ${state}`)
  }
  return state
}

export function expectPluginCapability(value: unknown): PluginCapability {
  const capability = expectString(value, "plugin capability")
  if (
    capability !== "resource.read" &&
    capability !== "resource.write" &&
    capability !== "workspace.change.propose" &&
    capability !== "delegation.graph.read" &&
    capability !== "delegation.graph.write" &&
    capability !== "team.conversation.read" &&
    capability !== "team.conversation.write" &&
    capability !== "channel.connect" &&
    capability !== "channel.receive" &&
    capability !== "channel.deliver" &&
    capability !== "config.read" &&
    capability !== "config.write" &&
    capability !== "network.fetch"
  ) {
    throw new Error(`invalid plugin capability: ${capability}`)
  }
  return capability
}

export function expectPluginCapabilities(value: unknown): readonly PluginCapability[] {
  const capabilities = expectArray(value, "plugin_manifest.capabilities")
  return capabilities.map((capability, index) => {
    try {
      return expectPluginCapability(capability)
    } catch (error) {
      throw new Error(`plugin capability ${index}: ${(error as Error).message}`)
    }
  })
}
