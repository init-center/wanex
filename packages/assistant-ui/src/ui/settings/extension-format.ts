import type { PluginInstalledVersionSummary } from "@wanex/assistant/plugin-management";

export function runtimeLabel(install: PluginInstalledVersionSummary): string {
  if (install.runtimeState === "attention_required") return "Needs attention";
  if (install.state === "removed") return "Removed";
  return install.runtimeState === "loaded" ? "Loaded" : "Inactive";
}

export function signatureLabel(
  status: PluginInstalledVersionSummary["signatureStatus"],
): string {
  if (status === "verified") return "Verified signature";
  if (status === "invalid") return "Invalid signature";
  return "Signature unknown";
}

export function capabilitySummary(capabilities: readonly string[]): string {
  if (capabilities.length === 0) return "No capabilities declared";
  const visible = capabilities.slice(0, 3).map(capabilityLabel);
  return `${visible.join(" · ")}${capabilities.length > visible.length ? ` +${capabilities.length - visible.length}` : ""}`;
}

export function capabilityLabel(capability: string): string {
  const labels: Readonly<Record<string, string>> = {
    "resource.read": "Read resources",
    "resource.write": "Create resources",
    "workspace.change.propose": "Propose workspace changes",
    "delegation.graph.read": "Read delegated work",
    "delegation.graph.write": "Manage delegated work",
    "team.conversation.read": "Read group conversations",
    "team.conversation.write": "Join group conversations",
    "channel.connect": "Connect channels",
    "channel.receive": "Receive channel messages",
    "channel.deliver": "Send channel messages",
    "config.read": "Read configuration",
    "config.write": "Change configuration",
    "network.fetch": "Access the network",
  };
  return labels[capability] ?? capability;
}

export function shortDigest(value: string): string {
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function formatBytes(value: number): string {
  if (value < 1_024) return `${value} B`;
  if (value < 1_048_576) return `${(value / 1_024).toFixed(1)} KB`;
  return `${(value / 1_048_576).toFixed(1)} MB`;
}

export function formatExpiry(value: number): string {
  const remaining = Math.max(0, value - Date.now());
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  return `in ${minutes} min`;
}
