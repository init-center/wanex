import { Check, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  RemoteConnectionProfile,
  SaveRemoteConnectionProfileInput,
} from "../../remote/profile.js";

export type RemoteProfileFormValue = SaveRemoteConnectionProfileInput;

export function RemoteProfileForm({
  profile,
  pending,
  onCancel,
  onSave,
}: {
  readonly profile: RemoteConnectionProfile | undefined;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSave: (input: RemoteProfileFormValue) => void;
}): ReactNode {
  const [profileId, setProfileId] = useState(profile?.profileId ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [endpoint, setEndpoint] = useState(profile?.endpoint ?? "https://");
  const [credential, setCredential] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSave({
      profileId,
      name,
      endpoint,
      ...(credential.length === 0 ? {} : { credential }),
    });
    setCredential("");
  }

  return (
    <form
      className="remote-profile-form"
      data-ui-remote-profile-form
      onSubmit={submit}
    >
      <label>
        <span>Profile ID</span>
        <input
          data-ui-remote-profile-field="profile-id"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
          disabled={pending || profile !== undefined}
          required
        />
      </label>
      <label>
        <span>Name</span>
        <input
          data-ui-remote-profile-field="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          required
        />
      </label>
      <label>
        <span>HTTPS endpoint</span>
        <input
          data-ui-remote-profile-field="endpoint"
          value={endpoint}
          onChange={(event) => setEndpoint(event.target.value)}
          disabled={pending}
          type="url"
          required
        />
      </label>
      <label>
        <span>
          {profile?.credentialConfigured
            ? "New credential (optional)"
            : "Bearer credential"}
        </span>
        <input
          data-ui-remote-profile-field="credential"
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
          disabled={pending}
          type="password"
          autoComplete="off"
          required={!profile?.credentialConfigured}
        />
      </label>
      <div className="review-actions">
        <button type="submit" disabled={pending}>
          {pending ? (
            <LoaderCircle className="spin" size={14} />
          ) : (
            <Check size={14} />
          )}
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={pending}>
          <X size={14} />
          Cancel
        </button>
      </div>
    </form>
  );
}
