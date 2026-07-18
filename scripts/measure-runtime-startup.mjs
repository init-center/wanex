#!/usr/bin/env node
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve, join } from "node:path"
import { build } from "esbuild"

const iterations = positiveInteger(argument("--iterations") ?? "5")
const lifecycleIterations = positiveInteger(
  argument("--lifecycle-iterations") ?? "3"
)
const enforce = process.argv.includes("--enforce")
const baselinePath = resolve(
  argument("--baseline") ?? "docs/architecture/runtime-physical-baseline.json"
)
const serviceBin = resolve(
  argument("--service-bin") ?? "target/debug/wanex-system-service"
)
const tempDir = await mkdtemp(join(tmpdir(), "wanex-runtime-startup-"))
const bundlePath = join(tempDir, "runtime.mjs")

try {
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: ["packages/runtime/src/index.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node26",
    treeShaking: true,
    write: false,
    metafile: true
  })
  await writeFile(bundlePath, result.outputFiles[0].contents)
  const samples = []
  for (let index = 0; index < iterations; index += 1) {
    samples.push(await measureImport(bundlePath))
  }
  samples.sort((left, right) => left - right)
  const lifecycleSamples = []
  for (let index = 0; index < lifecycleIterations; index += 1) {
    lifecycleSamples.push(await measureCreateDispose(bundlePath, serviceBin))
  }
  lifecycleSamples.sort((left, right) => left - right)
  const report = {
    iterations,
    bundleBytes: result.outputFiles[0].contents.byteLength,
    inputCount: Object.keys(result.metafile.inputs).length,
    coldImportMs: {
      median: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      samples
    },
    createDisposeMs: {
      median: percentile(lifecycleSamples, 0.5),
      p95: percentile(lifecycleSamples, 0.95),
      samples: lifecycleSamples
    }
  }
  console.log(JSON.stringify(report, null, 2))
  if (enforce) {
    const baseline = JSON.parse(await readFile(baselinePath, "utf8"))
    enforceMaximums(report, baseline.maximum)
  }
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

function measureCreateDispose(path, servicePath) {
  const source = `
    import { mkdtemp, rm } from "node:fs/promises";
    import { tmpdir } from "node:os";
    import { join } from "node:path";
    const runtimeModule = await import(${JSON.stringify(path)});
    const storeDir = await mkdtemp(join(tmpdir(), "wanex-runtime-lifecycle-"));
    const start = performance.now();
    try {
      const runtime = await runtimeModule.createWanexRuntime({
        storage: { kind: "local-system-service", mode: "persistent", storeDir, serviceBin: ${JSON.stringify(servicePath)} },
        provider: { kind: "fake", modelId: "startup-probe" }
      });
      await runtime.dispose();
      console.log(JSON.stringify({ ms: performance.now() - start }));
    } finally {
      await rm(storeDir, { recursive: true, force: true });
    }
  `
  return measureProcess(source, "runtime create/dispose probe")
}

function measureImport(path) {
  const source = `const start=performance.now();await import(${JSON.stringify(path)});console.log(JSON.stringify({ms:performance.now()-start}))`
  return measureProcess(source, "runtime import probe")
}

function measureProcess(source, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
      stdio: ["ignore", "pipe", "inherit"]
    })
    let stdout = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.on("error", reject)
    child.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`${label} exited ${code}`))
      resolve(JSON.parse(stdout).ms)
    })
  })
}

function percentile(values, ratio) {
  return values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

function positiveInteger(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("iterations must be a positive integer")
  return parsed
}

function enforceMaximums(report, maximum) {
  const observed = {
    bundleBytes: report.bundleBytes,
    inputCount: report.inputCount,
    coldImportP95Ms: report.coldImportMs.p95,
    createDisposeP95Ms: report.createDisposeMs.p95
  }
  const failures = Object.entries(maximum)
    .filter(([metric, limit]) => observed[metric] > limit)
    .map(([metric, limit]) => `${metric}: observed ${observed[metric]}, maximum ${limit}`)
  if (failures.length > 0) {
    throw new Error(`Runtime startup budget exceeded:\n${failures.join("\n")}`)
  }
}
