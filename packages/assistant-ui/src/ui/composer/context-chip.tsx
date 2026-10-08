import { ChevronDown } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { classes } from "../classes.js";

/** A quiet pill that opens a menu describing where or with what the next message runs. */
export const ComposerContextChip = forwardRef<
  HTMLButtonElement,
  Omit<ComponentPropsWithoutRef<"button">, "children"> & {
    readonly icon: ReactNode;
    readonly label: string;
    readonly busy?: boolean;
  }
>(function ComposerContextChip({ icon, label, busy = false, ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={classes("context-chip")} aria-busy={busy} {...rest}>
      {icon}
      <span>{label}</span>
      <ChevronDown size={13} aria-hidden="true" />
    </button>
  );
});
