import {
  AlertCircle,
  Laptop,
  LoaderCircle,
  Server,
  Settings2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
} from "react";
import {
  App as AssistantApp,
  ComposerContextChip,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "@wanex/assistant-ui/client";
import type { Client as AssistantClient } from "@wanex/assistant-ui/client";
import type { Snapshot } from "@wanex/assistant-ui";
import type { ServerProfileClient } from "./server/client.js";
import { ConnectionsDialog } from "./server/connections.js";
import type { DesktopServerProfile } from "../server/profile.js";
import type {
  DesktopAssistantLocation,
  DesktopAssistantRendererBridge,
} from "../assistant/bridge.js";
import { createDesktopRemoteAssistantClient } from "./assistant/client.js";
import { markDesktopRendererRootCommit } from "../proof/startup.js";

export function ProductRenderer({
  createLocalAssistantClient,
  assistantLocationClient,
  serverProfileClient,
}: {
  readonly createLocalAssistantClient: () => AssistantClient;
  readonly assistantLocationClient: DesktopAssistantRendererBridge | undefined;
  readonly serverProfileClient: ServerProfileClient | undefined;
}): ReactNode {
  useLayoutEffect(markDesktopRendererRootCommit, []);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const locationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [theme, setTheme] = useState<Snapshot["view"]["theme"]>("system");
  const [profiles, setProfiles] = useState<readonly DesktopServerProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(
    serverProfileClient !== undefined,
  );
  const [profilesError, setProfilesError] = useState<string>();
  useEffect(() => {
    let current = true;
    if (serverProfileClient === undefined) {
      setProfiles([]);
      setProfilesLoading(false);
      return () => { current = false; };
    }
    setProfilesLoading(true);
    setProfilesError(undefined);
    void serverProfileClient.listProfiles().then(
      (value) => {
        if (!current) return;
        setProfiles(value);
        setProfilesLoading(false);
      },
      (reason) => {
        if (!current) return;
        setProfilesError(errorMessage(reason));
        setProfilesLoading(false);
      },
    );
    return () => { current = false; };
  }, [serverProfileClient]);
  const openConnections = useCallback(() => {
    if (serverProfileClient !== undefined) setConnectionsOpen(true);
  }, [serverProfileClient]);
  return (
    <div className="desktop-renderer" data-ui-product-renderer data-ui-surface="assistant" data-theme={theme}>
      <div className="workspace-viewport" inert={connectionsOpen ? true : undefined}>
        <AssistantWorkspace
          createLocalClient={createLocalAssistantClient}
          locationClient={assistantLocationClient}
          profiles={profiles}
          profilesLoading={profilesLoading}
          locationTriggerRef={locationTriggerRef}
          onThemeChange={setTheme}
          onManageServers={serverProfileClient === undefined ? undefined : openConnections}
        />
      </div>
      {!connectionsOpen || serverProfileClient === undefined ? null : (
        <ConnectionsDialog
          returnFocusRef={locationTriggerRef}
          client={serverProfileClient}
          profiles={profiles}
          loading={profilesLoading}
          loadError={profilesError}
          onProfilesChanged={(value) => {
            setProfiles(value);
            setProfilesError(undefined);
          }}
          onClose={() => setConnectionsOpen(false)}
        />
      )}
    </div>
  );
}

interface AssistantWorkspaceState {
  readonly generation: number;
  readonly location: DesktopAssistantLocation;
  readonly client: AssistantClient;
  readonly initialSnapshot?: Snapshot;
}

export function AssistantWorkspace({
  createLocalClient,
  locationClient,
  profiles,
  profilesLoading,
  onManageServers,
  onThemeChange,
  locationTriggerRef,
}: {
  readonly createLocalClient: () => AssistantClient;
  readonly locationClient: DesktopAssistantRendererBridge | undefined;
  readonly profiles: readonly DesktopServerProfile[];
  readonly profilesLoading: boolean;
  readonly onManageServers: (() => void) | undefined;
  readonly onThemeChange?: (theme: Snapshot["view"]["theme"]) => void;
  readonly locationTriggerRef?: RefObject<HTMLButtonElement | null>;
}): ReactNode {
  const [workspace, setWorkspace] = useState<AssistantWorkspaceState>();
  const [pendingLocation, setPendingLocation] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let current = true;
    void bootstrap();
    return () => { current = false; };

    async function bootstrap(): Promise<void> {
      try {
        const state = locationClient === undefined
          ? { generation: 0, location: { kind: "local" as const } }
          : await locationClient.readState();
        const next = !("snapshot" in state)
          ? {
              generation: state.generation,
              location: state.location,
              client: createLocalClient(),
            }
          : {
              generation: state.generation,
              location: state.location,
              client: createDesktopRemoteAssistantClient(locationClient!, state),
              initialSnapshot: state.snapshot,
            };
        if (current) setWorkspace(next);
      } catch (reason) {
        if (current) setError(errorMessage(reason));
      }
    }
  }, [createLocalClient, locationClient]);

  const selectableProfiles = useMemo(() => {
    const location = workspace?.location;
    if (location?.kind !== "server") return profiles;
    if (profiles.some(({ profileId }) => profileId === location.profileId)) {
      return profiles;
    }
    return [{
      profileId: location.profileId,
      name: location.name,
    }, ...profiles];
  }, [profiles, workspace]);

  async function selectLocation(value: string): Promise<void> {
    const current = workspace;
    if (current === undefined || locationClient === undefined) return;
    const currentValue = locationValue(current.location);
    if (value === currentValue) return;
    setPendingLocation(value);
    setError(undefined);
    try {
      if (value === "local") {
        const activation = await locationClient.activateLocal({
          expectedGeneration: current.generation,
        });
        setWorkspace({
          generation: activation.generation,
          location: activation.location,
          client: createLocalClient(),
        });
        return;
      }
      const profileId = value.startsWith("server:")
        ? value.slice("server:".length)
        : "";
      const activation = await locationClient.activateServer({
        expectedGeneration: current.generation,
        profileId,
      });
      setWorkspace({
        generation: activation.generation,
        location: activation.location,
        client: createDesktopRemoteAssistantClient(locationClient, activation),
        initialSnapshot: activation.snapshot,
      });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setPendingLocation(undefined);
    }
  }

  if (workspace === undefined) {
    return (
      <main className="assistant-location-loading" data-ui-assistant-location-loading aria-busy={error === undefined}>
        {error === undefined
          ? <><LoaderCircle className="spin" size={18} aria-hidden="true" /><span role="status">Opening chat</span></>
          : <><AlertCircle size={18} aria-hidden="true" /><span role="alert">{error}</span></>}
      </main>
    );
  }

  return (
    <section className="assistant-workspace" data-ui-assistant-location={workspace.location.kind}>
      {error === undefined ? null : (
        <div className="assistant-location-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" aria-label="Dismiss location error" onClick={() => setError(undefined)}>
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
      <AssistantApp
        key={`${workspace.location.kind}:${workspace.generation}`}
        client={workspace.client}
        {...(onThemeChange === undefined ? {} : { onThemeChange })}
        {...(workspace.initialSnapshot === undefined
          ? {}
          : { initialSnapshot: workspace.initialSnapshot })}
        composerContext={(
          <AssistantLocationControl
            {...(locationTriggerRef === undefined ? {} : { triggerRef: locationTriggerRef })}
            location={workspace.location}
            profiles={selectableProfiles}
            pending={pendingLocation !== undefined}
            disabled={locationClient === undefined || profilesLoading}
            onManageServers={onManageServers}
            onSelect={(value) => { void selectLocation(value); }}
          />
        )}
      />
    </section>
  );
}

export function AssistantLocationControl({
  triggerRef,
  location,
  profiles,
  pending,
  disabled,
  onSelect,
  onManageServers,
}: {
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
  readonly location: DesktopAssistantLocation;
  readonly profiles: readonly Pick<DesktopServerProfile, "profileId" | "name">[];
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onSelect: (value: string) => void;
  readonly onManageServers?: (() => void) | undefined;
}): ReactNode {
  const label = location.kind === "local" ? "This Mac" : location.name;
  return (
    <Menu>
      <MenuTrigger asChild>
        <ComposerContextChip
          ref={triggerRef}
          aria-label="Chat execution location"
          data-ui-assistant-location-control
          data-ui-location-value={locationValue(location)}
          data-ui-location-options={["local", ...profiles.map((profile) => `server:${profile.profileId}`)].join(" ")}
          disabled={pending || disabled}
          busy={pending}
          label={label}
          icon={pending
            ? <LoaderCircle className="spin" size={14} aria-hidden="true" />
            : location.kind === "local"
              ? <Laptop size={14} aria-hidden="true" />
              : <Server size={14} aria-hidden="true" />}
        />
      </MenuTrigger>
      <MenuContent label="Where this conversation runs" side="top" align="start">
        <MenuLabel>Runs on</MenuLabel>
        <MenuRadioGroup value={locationValue(location)} onValueChange={onSelect}>
          <MenuRadioItem value="local" title="This Mac" description="Files and tools stay on this computer" data-ui-location="local" />
          {profiles.map((profile) => (
            <MenuRadioItem
              key={profile.profileId}
              value={`server:${profile.profileId}`}
              title={profile.name}
              description="Remote server"
              data-ui-location={`server:${profile.profileId}`}
            />
          ))}
        </MenuRadioGroup>
        {onManageServers === undefined ? null : (
          <>
            <MenuSeparator />
            <MenuItem
              icon={<Settings2 size={16} />}
              title="Manage servers…"
              data-ui-action="manage-server-connections"
              onSelect={onManageServers}
            />
          </>
        )}
      </MenuContent>
    </Menu>
  );
}

function locationValue(location: DesktopAssistantLocation): string {
  return location.kind === "local" ? "local" : `server:${location.profileId}`;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Chat location is unavailable";
}
