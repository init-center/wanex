import { isTuiContributionDomain } from "./resolver-domain.js"
import type {
  TuiContribution,
  TuiContributionDiagnostic,
  TuiContributionResolutionOptions
} from "./types.js"

export function validateContribution(
  contribution: TuiContribution,
  options: TuiContributionResolutionOptions
): TuiContributionDiagnostic[] {
  const diagnostics: TuiContributionDiagnostic[] = []
  if (contribution.id.trim().length === 0) {
    diagnostics.push({
      code: "tui.invalid_id",
      severity: "error",
      message: "TUI contribution id must not be empty",
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (!isTuiContributionDomain(contribution.domain)) {
    diagnostics.push({
      code: "tui.invalid_domain",
      severity: "error",
      message: `unsupported TUI contribution domain ${String(contribution.domain)}`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  if (contribution.provenance.trust === "blocked") {
    diagnostics.push({
      code: "tui.blocked_source",
      severity: "error",
      message: `blocked TUI contribution source ${contribution.provenance.source.id}`,
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
      code: "tui.privileged_untrusted",
      severity: "error",
      message: `privileged TUI contribution ${contribution.id} requires trusted or user-enabled provenance`,
      contributionId: contribution.id,
      domain: contribution.domain,
      sourceId: contribution.provenance.source.id
    })
  }
  return diagnostics
}
