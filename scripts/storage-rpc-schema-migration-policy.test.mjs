import { describe, expect, it } from "vitest"
import { findStorageRpcSchemaMigrationViolations } from "./audit/storage-rpc-ownership/schema-migration-policy.mjs"

const command = {
  type: "object",
  additionalProperties: false,
  required: ["command", "payload"],
  properties: {
    command: { type: "string", enum: ["doctor"] },
    payload: { $ref: "#/$defs/Payload" }
  }
}
const schema = {
  $defs: {
    RuntimeStorageRpcCommand: {
      oneOf: [{ $ref: "#/$defs/DoctorCommand" }]
    },
    DoctorCommand: command,
    Payload: {
      type: "object",
      additionalProperties: false,
      properties: {}
    },
    UnmigratedStorageRpcDomainCommand: {
      properties: {
        command: { not: { enum: ["rpc-describe", "doctor"] } }
      }
    }
  }
}
const ownership = {
  domains: {
    runtime: {
      schemaCommandUnion: "RuntimeStorageRpcCommand",
      commands: ["doctor"],
      typescriptFiles: ["store-runtime.ts"]
    }
  }
}

describe("storage RPC schema migration policy", () => {
  it("accepts strict schema ownership with no handwritten duplicate", () => {
    expect(findStorageRpcSchemaMigrationViolations({
      schema,
      ownership,
      handwrittenRustCommands: [],
      typescriptSourcesByFile: {
        "store-runtime.ts": "RuntimeStorageRpcCommand"
      }
    })).toEqual([])
  })

  it("rejects open nested objects, Rust duplicates, exclusion drift, and weak TS facets", () => {
    const broken = structuredClone(schema)
    delete broken.$defs.Payload.additionalProperties
    broken.$defs.UnmigratedStorageRpcDomainCommand.properties.command.not.enum = [
      "rpc-describe"
    ]
    const failures = findStorageRpcSchemaMigrationViolations({
      schema: broken,
      ownership,
      handwrittenRustCommands: ["doctor"],
      typescriptSourcesByFile: { "store-runtime.ts": "" }
    })
    expect(failures.map((item) => item.code)).toEqual(expect.arrayContaining([
      "migrated-command-retained-in-handwritten-rust",
      "open-migrated-schema-object",
      "missing-strict-typescript-command-union",
      "unmigrated-command-exclusion-mismatch"
    ]))
  })
})
