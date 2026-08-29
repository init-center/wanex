import { describe, expect, it } from "vitest"
import { containsSensitiveText } from "../src/sensitive-value.js"

describe("@wanex/assistant-host sensitive value inspection", () => {
  it("finds host paths in nested structured values without JSON escaping", () => {
    const windowsPath = "C:\\Users\\runner\\AppData\\Local\\wanex"
    const value = {
      document: {
        entries: [{ path: windowsPath }]
      }
    }

    expect(containsSensitiveText(value, windowsPath)).toBe(true)
    expect(containsSensitiveText(value, "C:\\Users\\other")).toBe(false)
  })

  it("terminates on repeated and cyclic object references", () => {
    const cyclic: { value?: unknown; self?: unknown } = {}
    cyclic.value = { message: "safe" }
    cyclic.self = cyclic

    expect(containsSensitiveText([cyclic, cyclic], "missing")).toBe(false)
  })
})
