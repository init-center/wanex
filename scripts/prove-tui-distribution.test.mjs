import { readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  writeInstalledTuiProofReceipt
} from "./prove-tui-distribution.mjs"
import { distributionRoot } from "../apps/tui/scripts/distribution.mjs"

const testReceiptPath = join(distributionRoot, "test-installed-proof.json")

afterEach(async () => {
  await rm(testReceiptPath, { force: true })
})

describe("installed TUI proof receipt", () => {
  it("writes a standalone JSON receipt for distribution audits", async () => {
    const receipt = {
      kind: "wanex.tui.installed-proof-receipt",
      ok: true,
      host: { platform: "darwin", arch: "arm64" }
    }
    await expect(
      writeInstalledTuiProofReceipt(receipt, testReceiptPath)
    ).resolves.toBe(
      testReceiptPath
    )
    await expect(readFile(testReceiptPath, "utf8")).resolves.toBe(
      `${JSON.stringify(receipt, null, 2)}\n`
    )
  })
})
