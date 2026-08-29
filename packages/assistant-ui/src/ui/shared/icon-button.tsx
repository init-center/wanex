import type { ReactNode } from "react";
import { classes } from "../classes.js";

export function IconButton({
  label,
  qa,
  onClick,
  disabled = false,
  children,
}: {
  readonly label: string;
  readonly qa?: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      className={classes("icon-button")}
      onClick={onClick}
      disabled={disabled}
      {...(qa === undefined ? {} : { "data-ui-action": qa })}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
