import { join } from "node:path"
import { createRemoteStorageControlPlane } from "@wanex/storage-control-plane"
import {
  createStorageHandle,
  OneShotSystemServiceStorageWireTransport
} from "@wanex/storage"
import { startEvalRemoteStorageServer } from "./eval-remote-storage-server.js"
import { createEvalScenario } from "./runner.js"
import { assert, isRecord } from "./scenario-utils.js"

export const remoteStorageControlPlaneIsolationScenario = createEvalScenario({
  id: "storage.remote-control-plane-isolation",
  title: "Remote storage control plane derives stores server-side",
  tags: ["storage", "remote", "security"],
  async run(context) {
    const resolvedSubjects: string[] = []
    const controlPlane = createRemoteStorageControlPlane<{
      readonly subjectId: "alpha" | "beta"
    }>({
      async authenticateBearerToken(token) {
        if (token === "alpha-token") {
          return { subjectId: "alpha" }
        }
        if (token === "beta-token") {
          return { subjectId: "beta" }
        }
        return null
      },
      async resolveStorageWireTransport(subject) {
        resolvedSubjects.push(subject.subjectId)
        return new OneShotSystemServiceStorageWireTransport({
          storeDir: join(context.storeDir, "remote", subject.subjectId),
          serviceBin: context.serviceBin
        })
      }
    })
    const server = await startEvalRemoteStorageServer(controlPlane.handle)
    const alphaHandle = createStorageHandle({
        kind: "remote-http",
        endpoint: server.endpoint,
        token: "alpha-token",
        timeoutMs: 5_000
      })
    const betaHandle = createStorageHandle({
        kind: "remote-http",
        endpoint: server.endpoint,
        token: "beta-token",
        timeoutMs: 5_000
      })
    try {
      const alpha = alphaHandle.core
      const beta = betaHandle.core

      await alpha.putConfig("profile.marker", { profile: "alpha" })
      const alphaValue = await alpha.getConfig("profile.marker")
      const betaValue = await beta.getConfig("profile.marker")
      assert(isRecord(alphaValue), "alpha marker should be visible")
      assert(alphaValue.profile === "alpha", "alpha marker should match")
      assert(betaValue === null, "beta store should not see alpha marker")

      const forbidden = await fetch(server.endpoint, {
        method: "POST",
        headers: {
          authorization: "Bearer alpha-token",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          storeDir: join(context.storeDir, "remote", "beta"),
          request: {
            command: "doctor"
          }
        })
      })
      const forbiddenBody = await forbidden.json() as {
        readonly error?: {
          readonly code?: string
        }
      }
      assert(forbidden.status === 400, "store selector should be rejected")
      assert(
        forbiddenBody.error?.code === "client_store_selector_forbidden",
        "store selector rejection should be explicit"
      )

      return {
        alphaProfile: alphaValue.profile,
        betaProfile: betaValue,
        rejectedStoreSelector: forbiddenBody.error.code,
        resolvedSubjects
      }
    } finally {
      await Promise.all([alphaHandle.dispose(), betaHandle.dispose()])
      await server.close()
    }
  }
})
