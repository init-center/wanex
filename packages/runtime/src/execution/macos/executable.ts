import { constants } from "node:fs"
import { access, realpath, stat } from "node:fs/promises"
import { join, resolve } from "node:path"
import { pathDirectoriesFromEnvironment } from "./profile.js"

export async function resolveMacosSeatbeltProgram(request: {
  readonly program: string
  readonly cwd: string
  readonly pathValue: string | undefined
}): Promise<string> {
  const candidates = request.program.includes("/")
    ? [resolve(request.cwd, request.program)]
    : pathDirectoriesFromEnvironment(request.pathValue, request.cwd).map((directory) =>
        join(directory, request.program)
      )

  for (const candidate of candidates) {
    try {
      const canonical = await realpath(candidate)
      const status = await stat(canonical)
      if (!status.isFile()) continue
      await access(canonical, constants.X_OK)
      return canonical
    } catch {
      // Preserve native spawn semantics when this candidate is unavailable.
    }
  }
  return request.program
}
