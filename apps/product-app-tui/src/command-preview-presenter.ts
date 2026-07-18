import type {
  ProductAppCommandInvocationPreview
} from "@wanex/product-app/surface-client"

export function renderProductAppTuiCommandPreview(
  preview: ProductAppCommandInvocationPreview
): string {
  const lines = [
    "Wanex Product App Command Preview",
    `status:${preview.kind}`,
    `command:${preview.commandId}`
  ]
  if (preview.kind === "runnable") {
    lines.push(`handler:${preview.handlerRef}`)
    lines.push("input:accepted")
    return lines.join("\n")
  }

  lines.push(`reason:${preview.reason}`)
  if (preview.handlerRef !== undefined) {
    lines.push(`handler:${preview.handlerRef}`)
  }
  lines.push(`message:${preview.message}`)
  if (preview.reason === "provider_not_ready") {
    lines.push(`provider:${preview.providerReadiness.status}`)
    lines.push(`canRun:${preview.providerReadiness.canRun ? "yes" : "no"}`)
  }
  return lines.join("\n")
}
