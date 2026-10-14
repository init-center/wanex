import { useState, type ReactNode } from "react";
import type { Snapshot } from "../../application/model.js";
import { classes } from "../classes.js";
import { Select } from "../primitives/select.js";
import type { DispatchAction } from "../shared/action.js";

const OFF = "off";

/**
 * Lets a model that cannot see images still work with them: another model
 * describes each image first. Images go to that model's provider, so this is
 * off until the person picks one. Hidden while there is nothing to choose.
 */
export function ImageUnderstandingSetting({
  snapshot,
  dispatch,
}: {
  readonly snapshot: Snapshot;
  readonly dispatch: DispatchAction;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const profile = snapshot.view.settings.profile;
  const conversation = profile.endpoints.filter((endpoint) =>
    endpoint.model.operations.includes("conversation")
  );
  const readers = conversation.filter((endpoint) =>
    endpoint.model.inputModalities.includes("image")
  );
  const chosen = profile.imageUnderstandingEndpointId;
  const needed = conversation.some((endpoint) =>
    !endpoint.model.inputModalities.includes("image")
  );
  if (chosen === undefined && (readers.length === 0 || !needed)) return null;

  async function choose(value: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const accepted = await dispatch({
      type: "set-image-understanding-endpoint",
      input: { endpointId: value === OFF ? null : value },
    });
    if (!accepted) setError("The image setting could not be updated");
    setBusy(false);
  }

  return (
    <section className={classes("settings-section")} data-ui-image-understanding-settings>
      <div className={classes("settings-group")}>
        <div className={classes("settings-row")}>
          <span className={classes("settings-row-copy")}>
            <strong>Images for text-only models</strong>
            <small>
              When the model you chat with cannot see images, this model describes them first.
              Images are sent to its provider.
            </small>
          </span>
          <Select
            name="imageUnderstandingEndpointId"
            label="Images for text-only models"
            value={chosen ?? OFF}
            disabled={busy}
            onValueChange={(value) => void choose(value)}
            options={[
              { value: OFF, label: "Off" },
              ...readers.map((endpoint) => ({ value: endpoint.id, label: endpoint.model.id })),
            ]}
          />
        </div>
      </div>
      {error === undefined ? null : <p className={classes("settings-error")} role="alert">{error}</p>}
    </section>
  );
}
