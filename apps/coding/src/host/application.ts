import {
  CodingApplicationController,
  createCodingApplicationSurface
} from "../application/controller.js"
import type {
  CodingApplication,
  CodingProjectReadModel
} from "../application/model.js"
import { createCodingHost } from "./start.js"
import type { CodingApplicationHostOptions } from "./types.js"
import type { CodingHostDiagnostics } from "./diagnostics/types.js"

export interface OpenCodingProjectRequest {
  readonly repositoryPath: string
}

export interface CodingApplicationHost {
  readonly application: CodingApplication
  openProject(request: OpenCodingProjectRequest): Promise<CodingProjectReadModel>
  readDiagnostics(): Promise<CodingHostDiagnostics>
  close(): Promise<void>
}

export async function startCodingApplication(
  options: CodingApplicationHostOptions
): Promise<CodingApplicationHost> {
  let application: CodingApplicationController | undefined
  const host = await createCodingHost(options, (signal) => {
    application?.observeHostTurn(signal)
  })
  application = new CodingApplicationController(host)
  const surface = createCodingApplicationSurface(application)
  return {
    application: surface,
    async openProject(request) {
      const repository = await host.openRepository({
        repositoryPath: request.repositoryPath
      })
      return application!.registerProject(repository)
    },
    readDiagnostics: async () => await host.readDiagnostics(),
    close: async () => await application!.close()
  }
}
