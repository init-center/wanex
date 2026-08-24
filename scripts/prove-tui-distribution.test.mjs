import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  installedTuiTeamAgentSetupReadySteps,
  installedTuiTeamComposerReadySteps,
  parseTuiProofArgs,
  writeInstalledTuiProofReceipt
} from "./prove-tui-distribution.mjs"
import { distributionRoot } from "../apps/tui/scripts/distribution.mjs"

const testReceiptPath = join(distributionRoot, "test-installed-proof.json")
const tempDirs = []

afterEach(async () => {
  await rm(testReceiptPath, { force: true })
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe("installed TUI proof receipt", () => {
  it("waits for semantic Team interaction readiness and stable agent identity", () => {
    expect(installedTuiTeamAgentSetupReadySteps()).toEqual([
      "expect -exact \"Add an agent before sending\"",
      "expect -re {Send \\|[^\\r\\n]*Enter send}",
      "send -- \"\\033OR\"",
      "expect -exact \"Group details\"",
      "send -- \"\\r\"",
      "expect -exact $secondary_prompt",
      "send -- \"\\r\"",
      "expect -exact \"Agent added\"",
      "expect -exact \"Group details\""
    ])
  })

  it("uses an unambiguous Escape and draft echo to prove Team composer readiness", () => {
    expect(installedTuiTeamComposerReadySteps()).toEqual([
      "expect -re {Send \\|[^\\r\\n]*Enter send}",
      "send -- \"\\033\\\[27u\"",
      "send -- \"$team_prompt\"",
      "expect -exact $team_prompt",
      "send -- \"\\r\""
    ])
  })

  it("accepts an explicit staged native artifact directory", () => {
    expect(parseTuiProofArgs([
      "--",
      "--native-artifact-dir",
      "target/distribution/native"
    ])).toEqual({
      nativeArtifactDir: join(
        process.cwd(),
        "target/distribution/native"
      )
    })
  })

  it("rejects unknown proof arguments", () => {
    expect(() => parseTuiProofArgs(["--unknown"])).toThrow(
      "unknown TUI proof argument"
    )
  })

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

  it("creates a missing receipt directory on a clean runner", async () => {
    const root = await mkdtemp(join(tmpdir(), "wanex-tui-proof-"))
    tempDirs.push(root)
    const outputPath = join(root, "missing", "nested", "installed-proof.json")
    const receipt = {
      kind: "wanex.tui.installed-proof-receipt",
      ok: true
    }

    await expect(
      writeInstalledTuiProofReceipt(receipt, outputPath)
    ).resolves.toBe(outputPath)
    await expect(readFile(outputPath, "utf8")).resolves.toBe(
      `${JSON.stringify(receipt, null, 2)}\n`
    )
  })
})
