import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { encodedPackageName } from "../sdk/distribution-policy.mjs"
import { createNativeNpmPackageManifest } from "../sdk/native-package-manifest.mjs"

export async function loadSdkRegistryPackages(policy, report) {
  const packages = []
  for (const packageInfo of policy.packages) {
    const artifact = report.packages.find((item) => item.name === packageInfo.name)
    if (artifact === undefined) {
      throw new Error(`missing SDK artifact for registry: ${packageInfo.name}`)
    }
    const manifest = JSON.parse(await readFile(join(
      policy.outputDir,
      "staging",
      encodedPackageName(packageInfo.name),
      "package.json"
    ), "utf8"))
    const bytes = await readFile(join(
      policy.outputDir,
      "tarballs",
      artifact.filename
    ))
    packages.push({ manifest, filename: artifact.filename, bytes })
  }
  return packages
}

export async function loadNativeRegistryPackages(policy, nativeReport) {
  const runtime = policy.packages.find((item) => item.name === "@wanex/runtime")
  if (runtime === undefined) {
    throw new Error("Runtime package is required for native registry metadata")
  }
  const packages = []
  for (const nativePackage of policy.nativePackages) {
    const expectedManifest = createNativeNpmPackageManifest(
      nativePackage,
      runtime.manifest.version
    )
    if (nativePackage.targetId !== nativeReport.targetId) {
      packages.push({
        manifest: expectedManifest,
        filename: nativeTarballFilename(
          nativePackage.name,
          runtime.manifest.version
        )
      })
      continue
    }
    const manifest = JSON.parse(await readFile(
      join(nativeReport.stagingDir, "package.json"),
      "utf8"
    ))
    if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
      throw new Error(
        `native registry manifest differs for ${nativePackage.name}`
      )
    }
    const bytes = await readFile(nativeReport.tarballPath)
    if (
      bytes.byteLength !== nativeReport.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== nativeReport.sha256
    ) {
      throw new Error(`native registry tarball differs for ${nativePackage.name}`)
    }
    packages.push({
      manifest,
      filename: nativeReport.filename,
      bytes
    })
  }
  return packages
}

export async function startReadOnlyNpmRegistry(options) {
  const packageByName = new Map(
    options.packages.map((item) => [item.manifest.name, packageRecord(item)])
  )
  const tarballByName = new Map(
    options.packages
      .filter((item) => item.bytes !== undefined)
      .map((item) => [item.filename, item.bytes])
  )
  const requests = []
  let endpoint = ""
  const server = createServer((request, response) => {
    void handleRequest({
      request,
      response,
      endpoint,
      packageByName,
      tarballByName,
      requests
    })
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (address === null || typeof address === "string") {
    server.close()
    throw new Error("SDK registry did not bind a TCP address")
  }
  endpoint = `http://127.0.0.1:${address.port}`
  let closed = false
  return {
    endpoint,
    requests,
    async close() {
      if (closed) return
      closed = true
      await new Promise((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error))
      })
    }
  }
}

async function handleRequest(context) {
  const method = context.request.method ?? "GET"
  const url = new URL(context.request.url ?? "/", context.endpoint)
  context.requests.push({ method, path: url.pathname })
  if (method !== "GET") {
    json(context.response, 405, { error: "method_not_allowed" })
    return
  }
  if (url.pathname === "/-/ping") {
    json(context.response, 200, {})
    return
  }
  if (url.pathname.startsWith("/tarballs/")) {
    const filename = decodeURIComponent(url.pathname.slice("/tarballs/".length))
    const bytes = context.tarballByName.get(filename)
    if (bytes === undefined) {
      json(context.response, 404, { error: "tarball_not_found" })
      return
    }
    context.response.writeHead(200, {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable"
    })
    context.response.end(bytes)
    return
  }
  let packageName
  try {
    packageName = decodeURIComponent(url.pathname.slice(1))
  } catch {
    json(context.response, 400, { error: "invalid_package_path" })
    return
  }
  const record = context.packageByName.get(packageName)
  if (record === undefined) {
    json(context.response, 404, { error: "package_not_found" })
    return
  }
  const tarball = `${context.endpoint}/tarballs/${encodeURIComponent(record.filename)}`
  json(context.response, 200, {
    name: packageName,
    "dist-tags": { latest: record.manifest.version },
    versions: {
      [record.manifest.version]: {
        ...record.manifest,
        dist: {
          tarball,
          shasum: record.sha1,
          integrity: record.integrity
        }
      }
    }
  })
}

function packageRecord(item) {
  const digestBytes = item.bytes ?? Buffer.from(
    `${item.manifest.name}@${item.manifest.version}`
  )
  return {
    manifest: item.manifest,
    filename: item.filename,
    sha1: createHash("sha1").update(digestBytes).digest("hex"),
    integrity: `sha512-${createHash("sha512").update(digestBytes).digest("base64")}`
  }
}

function nativeTarballFilename(name, version) {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`
}

function json(response, status, body) {
  const text = `${JSON.stringify(body)}\n`
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(text))
  })
  response.end(text)
}
