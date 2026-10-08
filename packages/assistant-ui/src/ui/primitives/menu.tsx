import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { usePortalContainer } from "./portal.js";
import styles from "./styles.module.css";

export const Menu = Dropdown.Root;
export const MenuTrigger = Dropdown.Trigger;

export function MenuContent({
  label,
  side = "top",
  align = "start",
  children,
  ...rest
}: {
  readonly label: string;
  readonly side?: "top" | "bottom" | "left" | "right";
  readonly align?: "start" | "center" | "end";
  readonly children: ReactNode;
} & Omit<ComponentProps<typeof Dropdown.Content>, "children" | "side" | "align">): ReactNode {
  return (
    <Dropdown.Portal container={usePortalContainer()}>
      <Dropdown.Content
        className={styles.menu}
        aria-label={label}
        side={side}
        align={align}
        sideOffset={8}
        collisionPadding={12}
        {...rest}
      >
        {children}
      </Dropdown.Content>
    </Dropdown.Portal>
  );
}

export function MenuItem({
  icon,
  title,
  description,
  tone = "default",
  disabled,
  onSelect,
  ...rest
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly tone?: "default" | "danger";
  readonly disabled?: boolean;
  readonly onSelect: () => void;
} & Omit<ComponentProps<typeof Dropdown.Item>, "children" | "onSelect" | "disabled">): ReactNode {
  return (
    <Dropdown.Item
      className={styles.menuItem}
      data-tone={tone}
      {...(disabled === undefined ? {} : { disabled })}
      onSelect={onSelect}
      {...rest}
    >
      {icon === undefined ? null : <span className={styles.menuIcon} aria-hidden="true">{icon}</span>}
      <span className={styles.menuText}>
        <span className={styles.menuTitle}>{title}</span>
        {description === undefined ? null : <span className={styles.menuDescription}>{description}</span>}
      </span>
    </Dropdown.Item>
  );
}

export function MenuLabel({ children }: { readonly children: ReactNode }): ReactNode {
  return <Dropdown.Label className={styles.menuLabel}>{children}</Dropdown.Label>;
}

export function MenuSeparator(): ReactNode {
  return <Dropdown.Separator className={styles.menuSeparator} />;
}

export function MenuRadioGroup({
  value,
  onValueChange,
  children,
}: {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly children: ReactNode;
}): ReactNode {
  return <Dropdown.RadioGroup value={value} onValueChange={onValueChange}>{children}</Dropdown.RadioGroup>;
}

export function MenuRadioItem({
  value,
  title,
  description,
  ...rest
}: {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
} & Omit<ComponentProps<typeof Dropdown.RadioItem>, "children" | "value" | "className">): ReactNode {
  return (
    <Dropdown.RadioItem className={styles.menuItem} value={value} {...rest}>
      <span className={styles.menuIcon} aria-hidden="true">
        <Dropdown.ItemIndicator><Check size={15} /></Dropdown.ItemIndicator>
      </span>
      <span className={styles.menuText}>
        <span className={styles.menuTitle}>{title}</span>
        {description === undefined ? null : <span className={styles.menuDescription}>{description}</span>}
      </span>
    </Dropdown.RadioItem>
  );
}
