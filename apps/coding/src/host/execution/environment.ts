import { randomUUID } from "node:crypto"
import type { CoreStore } from "@wanex/storage"

export const CODING_EXECUTION_ENVIRONMENT_CONFIG_KEY =
  "coding.execution.environment"

export async function resolveCodingExecutionEnvironmentId(
  storage: CoreStore
): Promise<string> {
  const existing = await storage.getConfigEntry(
    CODING_EXECUTION_ENVIRONMENT_CONFIG_KEY
  )
  if (existing !== null) return readEnvironmentId(existing.value)

  const candidate = `native_coding_${randomUUID().replaceAll("-", "")}`
  const value = { revision: 1, id: candidate }
  const result = await storage.compareAndApplyConfigMutations({
    conditions: [{
      key: CODING_EXECUTION_ENVIRONMENT_CONFIG_KEY,
      expectedRevision: null
    }],
    puts: [{ key: CODING_EXECUTION_ENVIRONMENT_CONFIG_KEY, value }],
    deletes: []
  })
  if (result.kind === "applied") return candidate
  const current = result.conflicts.find(
    (conflict) => conflict.key === CODING_EXECUTION_ENVIRONMENT_CONFIG_KEY
  )?.current
  if (current === null || current === undefined) {
    throw new Error("coding execution environment identity creation conflicted without a value")
  }
  return readEnvironmentId(current.value)
}

function readEnvironmentId(value: unknown): string {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  ) {
    throw new Error("coding execution environment identity is invalid")
  }
  const record = value as Record<string, unknown>
  if (
    record.revision !== 1 ||
    typeof record.id !== "string" ||
    !/^[A-Za-z0-9_.:-]{1,256}$/u.test(record.id)
  ) {
    throw new Error("coding execution environment identity is invalid")
  }
  return record.id
}
