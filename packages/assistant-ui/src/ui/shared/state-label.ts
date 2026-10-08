/** Maps canonical workflow states to short, user-facing labels. */
export function humanState(value: string): string {
  switch (value) {
    case "idle":
    case "missing": return "Not started";
    case "open": return "Ready for review";
    case "running": return "Working";
    case "active": return "In progress";
    case "succeeded":
    case "completed": return "Done";
    case "cancel_requested": return "Stopping";
    case "recovery_required": return "Needs review";
  }
  const words = value.replaceAll("_", " ").replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
