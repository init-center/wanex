#!/usr/bin/env node
import { createPackage, listPackage } from "@electron/asar"
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import { join } from "node:path"
import { buildDesktop, normalizeAsarEntry, stagingDir, workspaceRoot } from "./build.mjs"

if (import.meta.main) {
  console.log(JSON.stringify(await preflightDesktopBundle(), null, 2))
}

export async function preflightDesktopBundle() {
  const staging = await buildDesktop()
  const targetRoot = join(workspaceRoot, "target")
  await mkdir(targetRoot, { recursive: true })
  const root = await mkdtemp(join(targetRoot, "desktop-asar-preflight-"))
  try {
    const path = join(root, "app.asar")
    await createPackage(stagingDir, path)
    const bytes = (await stat(path)).size
    const entries = listPackage(path, { isPack: false }).map(normalizeAsarEntry).sort()
    const budget = JSON.parse(await readFile(join(workspaceRoot,
      "docs/architecture/host-distribution-budget.json"), "utf8"))
    const targets = assertDesktopBundleBudget({ bytes, entries }, budget)
    return { kind: "wanex.desktop.bundle-preflight", staging, asar: { bytes, entries }, targets }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

export function assertDesktopBundleBudget(asar, budget) {
  if (!Number.isSafeInteger(asar.bytes) || asar.bytes <= 0) throw new Error("invalid ASAR size")
  if (JSON.stringify(asar.entries) !== JSON.stringify(["/main.cjs", "/package.json", "/preload.cjs"])) {
    throw new Error("unexpected ASAR entries")
  }
  if (budget?.kind !== "wanex.host-distribution-budget" || !budget.targets || typeof budget.targets !== "object") {
    throw new Error("invalid host distribution budget")
  }
  const targets = Object.entries(budget.targets).filter(([, value]) => value?.desktop !== undefined)
  if (targets.length === 0) throw new Error("Desktop budget targets are missing")
  for (const [target, { desktop }] of targets) {
    if (!Number.isSafeInteger(desktop?.maxAsarBytes) || desktop.maxAsarBytes <= 0) {
      throw new Error(`invalid ASAR ceiling for ${target}`)
    }
    if (desktop.exactAsarEntryCount !== asar.entries.length) throw new Error(`ASAR entry count differs for ${target}`)
    if (asar.bytes > desktop.maxAsarBytes) {
      throw new Error(`Desktop ASAR bytes for ${target}: observed ${asar.bytes}, maximum ${desktop.maxAsarBytes}`)
    }
  }
  return targets.map(([target]) => target)
}
