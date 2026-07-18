#!/usr/bin/env node
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { compileFromFile } from "json-schema-to-typescript"

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const schemaPath = join(rootDir, "schemas/storage-rpc/storage-rpc.schema.json")
const tsPath = join(rootDir, "packages/storage/src/generated/storage-rpc.ts")
const rustPath = join(rootDir, "crates/system-service/src/generated/storage_rpc.rs")
const check = process.argv.includes("--check")
const unexpected = process.argv.slice(2).filter((arg) => arg !== "--check")
if (unexpected.length > 0) {
  throw new Error(`unknown storage RPC generation argument: ${unexpected[0]}`)
}

const tempDir = await mkdtemp(join(tmpdir(), "wanex-storage-rpc-codegen-"))
try {
  const schemaSource = await readFile(schemaPath, "utf8")
  const schemaSha256 = createHash("sha256").update(schemaSource).digest("hex")
  const generatedTs = await compileFromFile(schemaPath, {
    bannerComment:
      "/* Generated from schemas/storage-rpc/storage-rpc.schema.json. Do not edit. */",
    cwd: rootDir,
    format: true,
    unknownAny: false
  })
  const tsSource = `${generatedTs.trimEnd()}\n\nexport const STORAGE_RPC_SCHEMA_SHA256 = "${schemaSha256}" as const\n`
  const generatedRustPath = join(tempDir, "storage_rpc.rs")
  await run("cargo", [
    "run",
    "--quiet",
    "--package",
    "wanex-storage-rpc-codegen",
    "--",
    schemaPath,
    generatedRustPath
  ])
  const generatedRust = await readFile(generatedRustPath, "utf8")
  await writeFile(
    generatedRustPath,
    `${generatedRust.trimEnd()}\n\npub const STORAGE_RPC_SCHEMA_SHA256: &str = "${schemaSha256}";\n`,
    "utf8"
  )
  await run("rustfmt", [generatedRustPath])
  const rustSource = await readFile(generatedRustPath, "utf8")

  if (check) {
    await assertGeneratedFile(tsPath, tsSource)
    await assertGeneratedFile(rustPath, rustSource)
  } else {
    await mkdir(dirname(tsPath), { recursive: true })
    await mkdir(dirname(rustPath), { recursive: true })
    await writeFile(tsPath, tsSource, "utf8")
    await writeFile(rustPath, rustSource, "utf8")
  }
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

async function assertGeneratedFile(path, expected) {
  let actual
  try {
    actual = await readFile(path, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`generated storage RPC file is missing: ${path}`)
    }
    throw error
  }
  if (actual !== expected) {
    throw new Error(`generated storage RPC file is stale: ${path}`)
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit"
    })
    child.on("error", reject)
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          signal === null
            ? `${command} exited with code ${code}`
            : `${command} exited with signal ${signal}`
        )
      )
    })
  })
}
