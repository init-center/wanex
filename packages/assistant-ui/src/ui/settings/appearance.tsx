import { Palette } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";

type Theme = "system" | "light" | "dark";
type Density = "comfortable" | "compact";

export function AppearanceSection({
  snapshot,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function update(preferences: { readonly theme?: Theme; readonly density?: Density }): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const accepted = await dispatch({ type: "update-preferences", input: { preferences } });
    if (!accepted) setError("Appearance could not be updated");
    setBusy(false);
  }

  return (
    <section className={classes("settings-section appearance-section")} data-ui-appearance-settings>
      <div className={classes("settings-heading")}>
        <div><Palette size={15} /><strong>Appearance</strong></div>
      </div>
      <div className={classes("settings-group")}>
        <PreferenceControl
          label="Theme"
          description="Follow the system or keep one look."
          value={snapshot.view.theme}
          busy={busy}
          options={[
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
          select={(value) => update({ theme: value as Theme })}
        />
        <PreferenceControl
          label="Density"
          description="Compact fits more of the conversation on screen."
          value={snapshot.view.density}
          busy={busy}
          options={[
            { value: "comfortable", label: "Comfortable" },
            { value: "compact", label: "Compact" },
          ]}
          select={(value) => update({ density: value as Density })}
        />
      </div>
      {error === undefined ? null : <p className={classes("settings-error")} role="alert">{error}</p>}
    </section>
  );
}

function PreferenceControl({
  label,
  description,
  value,
  busy,
  options,
  select,
}: {
  readonly label: string;
  readonly description: string;
  readonly value: string;
  readonly busy: boolean;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly select: (value: string) => Promise<void>;
}): ReactNode {
  return (
    <div className={classes("settings-row")}>
      <span className={classes("settings-row-copy")}>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <div className={classes("segmented-control")} role="group" aria-label={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              data-ui-preference={label.toLowerCase()}
              data-ui-preference-value={option.value}
              disabled={busy || selected}
              onClick={() => void select(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
