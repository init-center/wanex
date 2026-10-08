import * as Selection from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { usePortalContainer } from "./portal.js";
import styles from "./select.module.css";

interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export function Select({
  label,
  options,
  placeholder = "Select an option",
  ...props
}: Pick<ComponentProps<typeof Selection.Root>,
  "name" | "value" | "defaultValue" | "onValueChange" | "disabled" | "required"
> & {
  readonly label: string;
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
}): ReactNode {
  const shellContainer = usePortalContainer();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  // Keep nested choices inside their dialog's focus and outside-click boundary.
  const container = trigger?.closest<HTMLElement>('[role="dialog"]') ?? shellContainer;
  return (
    <Selection.Root {...props}>
      <Selection.Trigger
        ref={setTrigger}
        className={styles.trigger}
        aria-label={label}
        data-ui-select={props.name}
      >
        <span className={styles.value}><Selection.Value placeholder={placeholder} /></span>
        <Selection.Icon className={styles.icon}><ChevronDown size={14} /></Selection.Icon>
      </Selection.Trigger>
      <Selection.Portal container={container}>
        <Selection.Content
          className={styles.content}
          position="popper"
          sideOffset={5}
          collisionPadding={12}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          <Selection.ScrollUpButton className={styles.scroll}><ChevronUp size={14} /></Selection.ScrollUpButton>
          <Selection.Viewport className={styles.viewport}>
            {options.map((option) => (
              <Selection.Item
                key={option.value}
                value={option.value}
                className={styles.item}
                textValue={option.label}
                data-ui-select-option={option.value}
                {...(option.disabled === undefined ? {} : { disabled: option.disabled })}
              >
                <Selection.ItemText>{option.label}</Selection.ItemText>
                <Selection.ItemIndicator className={styles.indicator}><Check size={14} /></Selection.ItemIndicator>
              </Selection.Item>
            ))}
          </Selection.Viewport>
          <Selection.ScrollDownButton className={styles.scroll}><ChevronDown size={14} /></Selection.ScrollDownButton>
        </Selection.Content>
      </Selection.Portal>
    </Selection.Root>
  );
}
