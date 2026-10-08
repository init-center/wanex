import { Check, LoaderCircle, X } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import type {
  DesktopServerProfile,
  SaveDesktopServerProfileInput,
} from "../../server/profile.js";

export function ServerProfileForm({
  profile,
  pending,
  onCancel,
  onSave,
}: {
  readonly profile: DesktopServerProfile | undefined;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onSave: (input: SaveDesktopServerProfileInput) => void;
}): ReactNode {
  const [profileId, setProfileId] = useState(profile?.profileId ?? "");
  const [name, setName] = useState(profile?.name ?? "");
  const [serverUrl, setServerUrl] = useState(profile?.serverUrl ?? "https://");
  const [credential, setCredential] = useState("");

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSave({
      profileId,
      name,
      serverUrl,
      ...(credential.length === 0 ? {} : { credential }),
    });
    setCredential("");
  }

  return (
    <form
      className="server-profile-form"
      data-ui-server-profile-form
      onSubmit={submit}
    >
      <label>
        <span>Profile ID</span>
        <input
          data-ui-server-profile-field="profile-id"
          value={profileId}
          onChange={(event) => setProfileId(event.target.value)}
          disabled={pending || profile !== undefined}
          required
          autoFocus={profile === undefined}
        />
      </label>
      <label>
        <span>Name</span>
        <input
          data-ui-server-profile-field="name"
          autoFocus={profile !== undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          required
        />
      </label>
      <label>
        <span>Server URL</span>
        <input
          data-ui-server-profile-field="server-url"
          value={serverUrl}
          onChange={(event) => setServerUrl(event.target.value)}
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
          data-ui-server-profile-field="credential"
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
          {pending
            ? <LoaderCircle className="spin" size={14} />
            : <Check size={14} />}
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={pending}>
          <X size={14} /> Cancel
        </button>
      </div>
    </form>
  );
}
