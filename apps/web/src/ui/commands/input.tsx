import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CommandInputControl,
  CommandInputObjectControl,
} from "../../application/model.js";
import { classes } from "../classes.js";

export type CommandInputDraft = unknown;

export function createCommandInputDraft(
  control: CommandInputControl,
): CommandInputDraft {
  const explicitDefault = control.defaultHint === undefined
    ? undefined
    : parseDefault(control.defaultHint);
  if (explicitDefault !== undefined) return explicitDefault;
  switch (control.kind) {
    case "object":
      return Object.fromEntries(control.properties.flatMap((property) =>
        property.required || property.defaultHint !== undefined
          ? [[controlName(property), createCommandInputDraft(property)]]
          : []
      ));
    case "array":
      return Array.from(
        { length: control.minItems },
        () => createCommandInputDraft(control.item),
      );
    case "string":
      return control.options?.[0] ?? "";
    case "number":
    case "integer":
      return control.options?.[0] ?? "";
    case "boolean":
      return control.options?.[0] ?? false;
  }
}

export function CommandInputFields({
  control,
  value,
  onChange,
}: {
  readonly control: CommandInputObjectControl;
  readonly value: CommandInputDraft;
  readonly onChange: (value: CommandInputDraft) => void;
}): ReactNode {
  const object = inputObject(value);
  return (
    <div className={classes("command-fields")} data-ui-command-fields>
      {control.properties.map((property) => {
        const name = controlName(property);
        const present = Object.hasOwn(object, name);
        return (
          <CommandField
            key={property.path}
            control={property}
            value={object[name]}
            present={present}
            onPresenceChange={(included) => {
              const next = { ...object };
              if (included) next[name] = createCommandInputDraft(property);
              else delete next[name];
              onChange(next);
            }}
            onChange={(nextValue) => onChange({ ...object, [name]: nextValue })}
          />
        );
      })}
    </div>
  );
}

function CommandField({
  control,
  value,
  present,
  onPresenceChange,
  onChange,
}: {
  readonly control: CommandInputControl;
  readonly value: unknown;
  readonly present: boolean;
  readonly onPresenceChange: (present: boolean) => void;
  readonly onChange: (value: unknown) => void;
}): ReactNode {
  return (
    <div className={classes("command-field")} data-ui-command-field={control.path}>
      {control.required ? null : (
        <label className={classes("command-field-presence")}>
          <input
            type="checkbox"
            checked={present}
            onChange={(event) => onPresenceChange(event.target.checked)}
          />
          <span>Include {control.label}</span>
        </label>
      )}
      {!present ? null : (
        <CommandControl control={control} value={value} onChange={onChange} />
      )}
    </div>
  );
}

function CommandControl({
  control,
  value,
  onChange,
}: {
  readonly control: CommandInputControl;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
}): ReactNode {
  if (control.kind === "object") {
    return (
      <fieldset className={classes("command-object")}>
        <legend>{control.label}</legend>
        {control.description === undefined ? null : <p>{control.description}</p>}
        <CommandInputFields control={control} value={value} onChange={onChange} />
      </fieldset>
    );
  }
  if (control.kind === "array") {
    const items = Array.isArray(value) ? value : [];
    return (
      <fieldset className={classes("command-array")}>
        <legend>{control.label}</legend>
        {control.description === undefined ? null : <p>{control.description}</p>}
        <ol>
          {items.map((item, index) => (
            <li key={`${control.path}:${index}`}>
              <CommandControl
                control={control.item}
                value={item}
                onChange={(nextItem) => onChange(items.map((current, currentIndex) =>
                  currentIndex === index ? nextItem : current
                ))}
              />
              <button
                type="button"
                className={classes("command-array-action")}
                aria-label={`Remove ${control.label} item ${index + 1}`}
                title="Remove item"
                disabled={items.length <= control.minItems}
                onClick={() => onChange(items.filter((_, currentIndex) => currentIndex !== index))}
              >
                <Minus size={14} />
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={classes("command-array-add")}
          disabled={items.length >= control.maxItems}
          onClick={() => onChange([...items, createCommandInputDraft(control.item)])}
        >
          <Plus size={14} /> Add item
        </button>
      </fieldset>
    );
  }
  if (control.kind === "boolean") {
    if (control.options !== undefined) {
      return (
        <ScalarLabel control={control}>
          <select
            value={String(value)}
            required={control.required}
            onChange={(event) => onChange(event.target.value === "true")}
          >
            {control.options.map((option) => (
              <option value={String(option)} key={String(option)}>
                {option ? "True" : "False"}
              </option>
            ))}
          </select>
        </ScalarLabel>
      );
    }
    return (
      <label className={classes("command-boolean")}>
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{control.label}</span>
        {control.description === undefined ? null : <small>{control.description}</small>}
      </label>
    );
  }
  if (control.kind === "string" && control.options !== undefined) {
    return (
      <ScalarLabel control={control}>
        <select
          value={typeof value === "string" ? value : ""}
          required={control.required}
          onChange={(event) => onChange(event.target.value)}
        >
          {control.options.map((option) => (
            <option value={option} key={option}>{option}</option>
          ))}
        </select>
      </ScalarLabel>
    );
  }
  if ((control.kind === "number" || control.kind === "integer") && control.options !== undefined) {
    return (
      <ScalarLabel control={control}>
        <select
          value={String(value)}
          required={control.required}
          onChange={(event) => onChange(Number(event.target.value))}
        >
          {control.options.map((option) => (
            <option value={String(option)} key={String(option)}>{option}</option>
          ))}
        </select>
      </ScalarLabel>
    );
  }
  if (control.kind === "string") {
    return (
      <ScalarLabel control={control}>
        <input
          value={typeof value === "string" ? value : ""}
          required={control.required}
          minLength={control.minLength}
          maxLength={control.maxLength}
          onChange={(event) => onChange(event.target.value)}
        />
      </ScalarLabel>
    );
  }
  return (
    <ScalarLabel control={control}>
      <input
        type="number"
        value={typeof value === "number" ? value : ""}
        required={control.required}
        step={control.kind === "integer" ? 1 : "any"}
        min={control.minimum ?? control.exclusiveMinimum}
        max={control.maximum ?? control.exclusiveMaximum}
        onChange={(event) => onChange(
          event.target.value === "" ? "" : Number(event.target.value)
        )}
      />
    </ScalarLabel>
  );
}

function ScalarLabel({
  control,
  children,
}: {
  readonly control: Exclude<CommandInputControl, { readonly kind: "object" | "array" }>;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <label className={classes("command-scalar")}>
      <span>{control.label}</span>
      {children}
      {control.description === undefined ? null : <small>{control.description}</small>}
    </label>
  );
}

function inputObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function controlName(control: CommandInputControl): string {
  const segment = control.path.split("/").at(-1) ?? "";
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function parseDefault(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
