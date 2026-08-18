import { describe, expect, it } from "vitest"
import type { PluginActionHost } from "../src/index.js"
import { createCompositePluginActionHost } from "../src/index.js"

describe("composite plugin action host", () => {
  it("routes resolve and execute by exact plugin version", async () => {
    const first = recordingHost("first")
    const second = recordingHost("second")
    const composite = createCompositePluginActionHost([
      { pluginId: "plugin.same", version: "1.0.0", host: first.host },
      { pluginId: "plugin.same", version: "2.0.0", host: second.host }
    ])

    await expect(
      composite.resolve({
        pluginId: "plugin.same",
        version: "2.0.0",
        actionId: "echo"
      })
    ).resolves.toEqual({ capability: "config.read", version: "2.0.0" })
    expect(
      await composite.resolve({
        pluginId: "plugin.same",
        version: "3.0.0",
        actionId: "echo"
      })
    ).toBeUndefined()
    await expect(
      composite.execute({
        job: {} as never,
        manifest: { pluginId: "plugin.same", version: "1.0.0" } as never,
        actionId: "echo",
        capability: "config.read",
        payload: null,
        storage: {} as never,
        signal: new AbortController().signal,
        heartbeat: async () => undefined
      })
    ).resolves.toEqual({ host: "first" })

    expect(first.executions).toBe(1)
    expect(second.resolutions).toBe(1)
  })

  it("rejects empty, duplicate, and unknown execute targets", async () => {
    expect(() => createCompositePluginActionHost([])).toThrow(
      "requires at least one entry"
    )
    const host = recordingHost("only").host
    expect(() =>
      createCompositePluginActionHost([
        { pluginId: "plugin.same", version: "1.0.0", host },
        { pluginId: "plugin.same", version: "1.0.0", host }
      ])
    ).toThrow("duplicate")
    const composite = createCompositePluginActionHost([
      { pluginId: "plugin.only", version: "1.0.0", host }
    ])
    await expect(async () =>
      await composite.execute({
        manifest: { pluginId: "plugin.only", version: "2.0.0" }
      } as never)
    ).rejects.toThrow("plugin.only@2.0.0")
  })
})

function recordingHost(label: string): {
  readonly host: PluginActionHost
  readonly executions: number
  readonly resolutions: number
} {
  const state = { executions: 0, resolutions: 0 }
  return {
    get executions() {
      return state.executions
    },
    get resolutions() {
      return state.resolutions
    },
    host: {
      async resolve(request) {
        state.resolutions += 1
        return { capability: "config.read", version: request.version }
      },
      async execute() {
        state.executions += 1
        return { host: label }
      }
    }
  }
}
