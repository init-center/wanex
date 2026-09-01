import { describe, expect, it } from "vitest"
import { preservePrimaryError } from "../src/application/errors.js"

describe("Assistant startup error preservation", () => {
  it("keeps the startup failure primary and exposes cleanup failure as cause", () => {
    const startup = new Error("store schema is invalid")
    const cleanup = new Error("EPERM: kill EPERM")

    const result = preservePrimaryError(startup, cleanup)

    expect(result).toBe(startup)
    expect(result.message).toBe("store schema is invalid")
    expect(result.cause).toBe(cleanup)
  })

  it("does not overwrite an existing primary cause", () => {
    const cause = new Error("provider detail")
    const startup = new Error("provider startup failed", { cause })
    const cleanup = new Error("cleanup failed")

    const result = preservePrimaryError(startup, cleanup)

    expect(result).toBeInstanceOf(AggregateError)
    expect(result.message).toBe("provider startup failed")
    expect(result.cause).toBe(startup)
    expect((result as AggregateError).errors).toEqual([startup, cleanup])
  })
})
