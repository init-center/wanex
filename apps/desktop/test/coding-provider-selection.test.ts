import { describe, expect, it } from "vitest"
import { createDesktopExecutionEnvironment } from "../src/execution.js"

describe("Desktop Coding execution provider selection", () => {
  it("keeps explicit Native composition available", async () => {
    const environment = createDesktopExecutionEnvironment({
      kind: "native",
      environmentId: "desktop_native_selection",
      serviceBin: "/private/wanex-system-service"
    })
    try {
      expect(environment.descriptor.providerId).toBe("wanex.execution.native")
      expect(environment.capabilities.isolation.enforcement).toBe("none")
    } finally {
      await environment.close()
    }
  })

  it.runIf(process.platform === "darwin")(
    "selects Seatbelt as an OS-enforcing Desktop provider",
    async () => {
      const environment = createDesktopExecutionEnvironment({
        kind: "macos-seatbelt",
        environmentId: "desktop_seatbelt_selection",
        serviceBin: "/private/wanex-system-service"
      })
      try {
        expect(environment.descriptor.providerId).toBe(
          "wanex.execution.macos-seatbelt",
        )
        expect(environment.capabilities.isolation.enforcement).toBe("os")
      } finally {
        await environment.close()
      }
    },
  )
})
