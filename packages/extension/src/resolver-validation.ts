import { isAppExtensionContributionDomain } from "./resolver-domain.js"
import { parseAppCommandInputSchema } from "./command-input-schema-parser.js"
import type {
  AppExtensionContribution,
  AppExtensionDiagnostic,
  AppExtensionResolutionOptions
} from "./types.js"

export interface ValidatedContribution {
  readonly contribution: AppExtensionContribution
  readonly diagnostics: AppExtensionDiagnostic[]
}

export function validateContribution(
  contribution: AppExtensionContribution,
  options: AppExtensionResolutionOptions
): ValidatedContribution {
  const diagnostics: AppExtensionDiagnostic[] = []
  let normalized = contribution
  if (contribution.id.trim().length === 0) {
    diagnostics.push({
      code: "extension.invalid_id",
      severity: "error",
      message: "contribution id must not be empty",
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (!isAppExtensionContributionDomain(contribution.domain)) {
    diagnostics.push({
      code: "extension.invalid_domain",
      severity: "error",
      message: `unsupported contribution domain ${String(contribution.domain)}`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (contribution.provenance.trust === "blocked") {
    diagnostics.push({
      code: "extension.blocked_source",
      severity: "error",
      message: `blocked contribution source ${contribution.provenance.source.id}`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (
    contribution.privileged === true &&
    options.allowUntrustedPrivileged !== true &&
    contribution.provenance.trust !== "trusted" &&
    contribution.provenance.trust !== "user_enabled"
  ) {
    diagnostics.push({
      code: "extension.privileged_untrusted",
      severity: "error",
      message: `privileged contribution ${contribution.id} requires trusted or user-enabled provenance`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (
    contribution.domain === "command" &&
    contribution.value.paletteVisibility !== "visible" &&
    contribution.value.paletteVisibility !== "hidden"
  ) {
    diagnostics.push({
      code: "extension.command_palette_visibility_invalid",
      severity: "error",
      message: "command paletteVisibility must be visible or hidden",
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (
    contribution.domain === "command" &&
    contribution.value.inputSchema !== undefined
  ) {
    const parsed = parseAppCommandInputSchema(contribution.value.inputSchema)
    if (!parsed.ok) {
      diagnostics.push({
        code: diagnosticCode(parsed.error.code),
        severity: "error",
        message: parsed.error.message,
        contributionId: contribution.id,
        domain: contribution.domain,
        sourceId: contribution.provenance.source.id,
        metadata: {
          schemaPath: parsed.error.path,
          schemaError: parsed.error.code
        }
      })
    } else {
      normalized = {
        ...contribution,
        value: {
          ...contribution.value,
          inputSchema: parsed.value
        }
      }
    }
  }
  return { contribution: normalized, diagnostics }
}

function diagnosticCode(
  code: "invalid" | "unsupported" | "limit_exceeded"
): AppExtensionDiagnostic["code"] {
  switch (code) {
    case "invalid":
      return "extension.command_input_schema_invalid"
    case "unsupported":
      return "extension.command_input_schema_unsupported"
    case "limit_exceeded":
      return "extension.command_input_schema_limit_exceeded"
  }
}
