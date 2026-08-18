import navigationStyles from "./navigation/styles.module.css";
import shellStyles from "./shell/styles.module.css";
import conversationStyles from "./conversation/styles.module.css";
import resourceStyles from "./resources/styles.module.css";
import composerStyles from "./composer/styles.module.css";
import commandStyles from "./commands/styles.module.css";
import interactionStyles from "./conversation/interactions.module.css";
import approvalStyles from "./conversation/approval.module.css";
import recoveryStyles from "./conversation/recovery.module.css";
import contextStyles from "./context/styles.module.css";
import settingsStyles from "./settings/styles.module.css";
import workflowStyles from "./workflows/styles.module.css";
import sharedStyles from "./shared/styles.module.css";
import teamStyles from "./team/styles.module.css";
import responsiveStyles from "./shell/responsive.module.css";

const styleMaps: readonly Readonly<Record<string, string>>[] = [
  navigationStyles,
  shellStyles,
  conversationStyles,
  resourceStyles,
  composerStyles,
  commandStyles,
  interactionStyles,
  approvalStyles,
  recoveryStyles,
  contextStyles,
  settingsStyles,
  workflowStyles,
  sharedStyles,
  teamStyles,
  responsiveStyles,
];

export function classes(value: string): string {
  return value
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .flatMap((token) => {
      const resolved = styleMaps.flatMap((styles) => styles[token] ?? []);
      return resolved.length === 0 ? token : resolved;
    })
    .join(" ");
}
