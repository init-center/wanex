import type { ChildProcessWithoutNullStreams } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { createStorageProcessTreeTerminator } from "../src/transport-process-tree.js"

describe("storage process tree termination", () => {
  it("falls back to the owned child when process-group signaling is denied", async () => {
    const processKill = vi.spyOn(process, "kill").mockImplementation(() => {
      const error = new Error("operation not permitted") as NodeJS.ErrnoException
      error.code = "EPERM"
      throw error
    })
    const childKill = vi.fn(() => true)
    const child = {
      pid: 12345,
      exitCode: null,
      signalCode: null,
      kill: childKill,
    } as unknown as ChildProcessWithoutNullStreams

    try {
      await createStorageProcessTreeTerminator().terminate({
        child,
        platform: "darwin",
        graceMs: 25,
        waitForClose: async () => true,
      })
    } finally {
      processKill.mockRestore()
    }

    expect(childKill).toHaveBeenCalledWith("SIGTERM")
  })
})
