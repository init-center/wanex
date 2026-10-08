import { Code2, FileText, FolderOpen, History, ListChecks } from "lucide-react";
import type { ComponentType } from "react";
import type { Snapshot } from "../../application/model.js";

type SuggestionIcon = ComponentType<{ readonly size?: number; readonly "aria-hidden"?: boolean | "true" | "false" }>;

export type EmptyStateSuggestion =
  | { readonly key: string; readonly label: string; readonly icon: SuggestionIcon; readonly kind: "prompt"; readonly prompt: string }
  | { readonly key: string; readonly label: string; readonly icon: SuggestionIcon; readonly kind: "regrant"; readonly recentRef: string }
  | { readonly key: string; readonly label: string; readonly icon: SuggestionIcon; readonly kind: "grant" };

const EXPLAIN = "Explain this codebase and point out the most important files to understand first.";
const PLAN = "Help me turn this idea into a concrete implementation plan with scope, steps, and verification.";
const SUMMARIZE = "Summarize the attached document. List the key points, decisions, and open questions.";

/** At most three suggestions, chosen from the folders and abilities that exist right now. */
export function emptyStateSuggestions(snapshot: Snapshot): readonly EmptyStateSuggestion[] {
  const folders = snapshot.view.workspaceFolders;
  const starters: EmptyStateSuggestion[] = [];
  if (!folders.available) {
    starters.push({ key: "explain", label: "Explain a codebase", icon: Code2, kind: "prompt", prompt: EXPLAIN });
  } else if (folders.folders.length > 0) {
    starters.push({ key: "explain", label: `Explain ${folders.folders[0]!.name}`, icon: Code2, kind: "prompt", prompt: EXPLAIN });
  } else if (folders.recent.length > 0) {
    const recent = folders.recent[0]!;
    starters.push({ key: "continue", label: `Continue with ${recent.name}`, icon: History, kind: "regrant", recentRef: recent.recentRef });
  } else if (folders.canPick) {
    starters.push({ key: "open", label: "Work in a folder", icon: FolderOpen, kind: "grant" });
  }
  starters.push({ key: "plan", label: "Draft a plan", icon: ListChecks, kind: "prompt", prompt: PLAN });
  if (snapshot.view.conversationAttachmentCanUpload) {
    starters.push({ key: "summarize", label: "Summarize a document", icon: FileText, kind: "prompt", prompt: SUMMARIZE });
  }
  return starters.slice(0, 3);
}
