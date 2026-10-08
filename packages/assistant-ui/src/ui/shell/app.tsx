import {
  RotateCcw,
  ArrowUp,
  Square,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type DragEvent,
  type ClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { conversationModelEndpoints } from "../../application/conversation/endpoints.js";
import type {
  Action,
  Snapshot,
} from "../../application/model.js";
import type {
  AppProps,
  Client,
} from "../../client/contracts.js";
import { SettingsPanel } from "../settings/panel.js";
import { WorkflowsPanel } from "../workflows/panel.js";
import { CommandPalette } from "../commands/palette.js";
import { useFocusBoundary } from "../shared/focus-boundary.js";
import {
  AvailabilityNotice,
  InitialLoading,
  InitialUnavailable,
} from "../shared/availability.js";
import {
  AttachmentTray,
  ComposerModelPicker,
  ComposerModeSwitch,
  ComposerAddMenu,
} from "../composer/controls.js";
import { FolderTray } from "../composer/folders.js";
import {
  actionType as composerActionType,
  placeholder as composerPlaceholder,
  type ComposerMode,
} from "../composer/model.js";
import { ContextPanel } from "../context/panel.js";
import {
  ConversationTimeline,
  EmptyGreeting,
  QuickStarts,
} from "../conversation/timeline.js";
import { Sidebar } from "../navigation/sidebar.js";
import { Topbar } from "../navigation/topbar.js";
import { TeamComposer } from "../team/composer.js";
import { TeamTimeline } from "../team/timeline.js";
import type {
  DispatchAction,
  DispatchActionResult,
} from "../shared/action.js";
import { classes } from "../classes.js";
import { PortalContainerProvider } from "../primitives/portal.js";
import { useSnapshotSync } from "./use-snapshot-sync.js";
import { useAttachmentUpload } from "../composer/use-attachment-upload.js";

export function App(props: AppProps): ReactNode {
  const [view, setView] = useState({ client: props.client, generation: 0 });
  // A Client is one borrowed Host connection. Never reuse its transcript or
  // pending view state for a replacement connection, even before its first read.
  if (view.client !== props.client) {
    setView({ client: props.client, generation: view.generation + 1 });
  }
  return <AppView key={view.generation} {...props} />;
}

function AppView({
  client,
  initialSnapshot,
  openSettingsRequest,
  onModalStateChange,
  onThemeChange,
  headerActions,
  navigationFooter,
  composerContext,
}: AppProps): ReactNode {
  const lifetime = useMemo(() => ({ active: false }), []);
  useLayoutEffect(() => {
    lifetime.active = true;
    return () => { lifetime.active = false; };
  }, [lifetime]);
  const {
    snapshot,
    snapshotError,
    snapshotRetrying,
    streamAvailable,
    beginRequest: beginSnapshotRequest,
    adoptSnapshot,
    adoptArrivedSnapshot,
    retrySnapshot,
    reportRefreshFailure,
  } = useSnapshotSync(client, initialSnapshot);
  const [draft, setDraft] = useState("");
  const draftRevision = useRef(0);
  const [chosenComposerMode, setComposerMode] = useState<ComposerMode>("submit");
  const inFlightActions = useRef(new Map<string, Action["type"]>());
  const [pendingActionTypes, setPendingActionTypes] = useState<
    ReadonlySet<Action["type"]>
  >(() => new Set());
  const [error, setError] = useState<string | undefined>();
  const [shellElement, setShellElement] = useState<HTMLElement | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const providerSetupPrompted = useRef(false);
  const handledSettingsRequest = useRef<number | undefined>(undefined);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const sessionDrawerRef = useRef<HTMLElement | null>(null);
  const sessionReturnFocusRef = useRef<HTMLElement | null>(null);
  const settingsOverlayRef = useRef<HTMLElement | null>(null);
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null);
  const commandReturnFocusRef = useRef<HTMLElement | null>(null);

  const { uploading, isUploading, uploadFiles } = useAttachmentUpload({
    client,
    ...(snapshot?.conversation.sessionId === undefined
      ? {}
      : { sessionId: snapshot.conversation.sessionId }),
    canUpload: snapshot?.view.conversationAttachmentCanUpload === true &&
      snapshot.view.selection?.kind !== "team",
    unavailableMessage: snapshot?.view.selection?.kind === "team"
      ? "Attachment upload is unavailable in group conversations"
      : snapshot?.view.conversationAttachmentMessage ??
        "Attachment upload is unavailable in this conversation",
    beginRequest: beginSnapshotRequest,
    onSnapshot: adoptSnapshot,
    onError: setError,
  });

  const theme = snapshot?.view.theme;
  useEffect(() => {
    if (theme !== undefined) onThemeChange?.(theme);
  }, [onThemeChange, theme]);

  useEffect(() => {
    if (
      snapshot?.view.providerRunGate.attentionRequired === true &&
      client.listProviders !== undefined &&
      !providerSetupPrompted.current
    ) {
      providerSetupPrompted.current = true;
      setShowSessions(false);
      setShowSettings(true);
    }
  }, [client, snapshot]);

  useEffect(() => {
    if (
      openSettingsRequest === undefined ||
      handledSettingsRequest.current === openSettingsRequest
    ) {
      return;
    }
    handledSettingsRequest.current = openSettingsRequest;
    setShowSessions(false);
    setShowSettings(true);
  }, [openSettingsRequest]);

  useEffect(() => {
    if (!showSessions && !showSettings) return;
    function closeTopLayer(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (showSettings) {
        if (settingsOverlayRef.current?.parentElement?.querySelector("[data-ui-settings-subdialog]")) return;
        setShowSettings(false);
        return;
      }
      setShowSessions(false);
    }
    document.addEventListener("keydown", closeTopLayer);
    return () => document.removeEventListener("keydown", closeTopLayer);
  }, [showSessions, showSettings]);

  useEffect(() => {
    onModalStateChange?.(
      showSettings
        ? { active: true, kind: "settings" }
        : { active: false },
    );
  }, [onModalStateChange, showSettings]);

  const sessionFocusBoundary = useFocusBoundary({
    active: showSessions,
    containerRef: sessionDrawerRef,
    returnFocusRef: sessionReturnFocusRef,
    initialFocusSelector: "[data-ui-initial-focus]",
  });
  const settingsFocusBoundary = useFocusBoundary({
    active: showSettings,
    containerRef: settingsOverlayRef,
    returnFocusRef: settingsReturnFocusRef,
    initialFocusSelector: "[data-ui-initial-focus]",
  });

  const endpoints = useMemo(
    () => snapshot === undefined ? [] : conversationModelEndpoints(snapshot, false),
    [snapshot],
  );

  if (snapshot === undefined) {
    return snapshotError === undefined
      ? <InitialLoading />
      : (
          <InitialUnavailable
            message={snapshotError}
            retrying={snapshotRetrying}
            retry={retrySnapshot}
          />
        );
  }

  const state = snapshot.view;
  const conversation = snapshot.conversation;
  const teamSelected = state.selection?.kind === "team";
  const conversationIsEmpty =
    conversation.historyRows.length === 0 &&
    conversation.transientAssistantText === undefined;
  const selectedViewIsEmpty = teamSelected
    ? (snapshot.team.page?.messages.length ?? 0) === 0
    : conversationIsEmpty;
  const canGuide =
    conversation.canSteer && conversation.operation?.state === "running";
  const canQueue = conversation.canQueueFollowUp;
  // While a response is running, plain Enter cannot start a new Turn. Default to
  // the choice that always has a clear meaning so Enter never silently does nothing.
  const responseRunning = conversation.operation?.state === "running";
  const composerMode: ComposerMode = responseRunning && chosenComposerMode === "submit"
    ? (canQueue ? "queue" : canGuide ? "steer" : "submit")
    : chosenComposerMode;
  const actionEnabled = composerMode === "submit"
    ? state.conversationCanSubmit
    : composerMode === "queue"
      ? state.conversationCanQueueFollowUp && canQueue
      : state.conversationCanSteer && canGuide;
  const draftEnabled = composerMode === "submit"
    ? conversation.canSubmit || state.providerRunGate.attentionRequired
    : actionEnabled;

  async function dispatch(
    action: Action,
    clearDraftRevision?: number,
  ): Promise<boolean> {
    return (await dispatchResult(action, clearDraftRevision))?.ok === true;
  }

  const dispatchResult: DispatchActionResult = async (
    action,
    clearDraftRevision,
  ) => {
    if (!lifetime.active) return undefined;
    const actionKey = inFlightActionKey(action);
    if (inFlightActions.current.has(actionKey)) return undefined;
    inFlightActions.current.set(actionKey, action.type);
    setPendingActionTypes(new Set(inFlightActions.current.values()));
    setError(undefined);
    const requestGeneration = beginSnapshotRequest();
    try {
      let result;
      try {
        result = await client.dispatchAction(action, {
          requestId: createRequestId(),
        });
      } catch (reason) {
        if (!lifetime.active) return undefined;
        const message = errorMessage(reason);
        setError(message);
        return { ok: false, action: action.type, message, snapshot };
      }
      if (!lifetime.active) return undefined;
      adoptSnapshot(result.snapshot, requestGeneration);
      if (result.snapshotRefresh !== undefined) {
        reportRefreshFailure(`Action result received, but data could not refresh: ${result.snapshotRefresh.message}`, requestGeneration);
      }
      if (!result.ok) {
        setError(result.message);
        return result;
      }
      if (
        clearDraftRevision !== undefined &&
        draftRevision.current === clearDraftRevision
      ) {
        setDraft("");
      }
      return result;
    } finally {
      inFlightActions.current.delete(actionKey);
      if (lifetime.active) setPendingActionTypes(new Set(inFlightActions.current.values()));
    }
  };

  function pasteAttachments(event: ClipboardEvent<HTMLElement>): void {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  }

  function dropAttachments(event: DragEvent<HTMLElement>): void {
    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadFiles(files);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  function submitFromKeyboard(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (
      event.key === "/" &&
      draft.length === 0 &&
      composerMode === "submit" &&
      state.commandPalette.state === "ready" &&
      state.commandPalette.rows.length > 0
    ) {
      event.preventDefault();
      openCommandPalette(event.currentTarget);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submitDraft();
  }

  function submitDraft(): void {
    const text = draft.trim();
    const submittedDraftRevision = draftRevision.current;
    const actionType = composerActionType(composerMode);
    if (
      !actionEnabled ||
      text.length === 0 ||
      pendingActionTypes.has(actionType) ||
      isUploading()
    ) return;
    const session = conversation.sessionId === undefined
      ? {}
      : { sessionId: conversation.sessionId };
    if (composerMode === "queue" && conversation.operationId !== undefined) {
      void dispatch({
        type: "queue-guided-follow-up",
        input: {
          operationId: conversation.operationId,
          ...session,
          text,
        },
      }, submittedDraftRevision);
      return;
    }
    if (composerMode === "steer" && conversation.operationId !== undefined) {
      void dispatch({
        type: "steer-current-response",
        input: {
          operationId: conversation.operationId,
          ...session,
          text,
        },
      }, submittedDraftRevision);
      return;
    }
    void dispatch({
      type: "submit-conversation",
      input: { ...session, text },
    }, submittedDraftRevision);
  }

  function selectQuickStart(prompt: string): void {
    draftRevision.current += 1;
    setDraft(prompt);
    setTimeout(() => composerRef.current?.focus(), 0);
  }

  const composerBusy = pendingActionTypes.has(composerActionType(composerMode));
  const guidanceBusy =
    pendingActionTypes.has("queue-guided-follow-up") ||
    pendingActionTypes.has("steer-current-response");
  const workflowBusy = [...pendingActionTypes].some(isWorkflowActionType);

  function openSessionNavigation(): void {
    sessionReturnFocusRef.current = activeElement();
    setShowContext(false);
    setShowWorkflows(false);
    setShowCommands(false);
    setShowSessions(true);
  }

  function closeSessionNavigation(): void {
    setShowSessions(false);
  }

  function openSettingsPanel(returnTarget?: HTMLElement | null): void {
    settingsReturnFocusRef.current = returnTarget ?? activeElement();
    setShowSessions(false);
    setShowContext(false);
    setShowWorkflows(false);
    setShowCommands(false);
    setShowSettings(true);
  }

  function closeSettingsPanel(): void {
    if (shellElement?.querySelector("[data-ui-settings-subdialog]")) return;
    setShowSettings(false);
  }

  function openCommandPalette(returnTarget?: HTMLElement | null): void {
    commandReturnFocusRef.current = returnTarget ?? activeElement();
    setShowCommands(true);
  }

  const sessionInput = conversation.sessionId === undefined
    ? {}
    : { sessionId: conversation.sessionId };
  const composerDock = (
    <div
      className={classes("composer-dock")}
      data-ui-composer-dock
      onPaste={pasteAttachments}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={dropAttachments}
    >
      {conversation.canRegenerate && !conversationIsEmpty ? (
        <div className={classes("turn-actions")} aria-label="Conversation actions">
          <button
            type="button"
            className={classes("secondary-action")}
            data-ui-action="regenerate-conversation"
            disabled={pendingActionTypes.has("regenerate-conversation") || uploading}
            onClick={() => void dispatch({
              type: "regenerate-conversation",
              ...(conversation.sessionId === undefined
                ? {}
                : { input: { sessionId: conversation.sessionId } }),
            })}
          >
            <RotateCcw size={14} /> Regenerate
          </button>
        </div>
      ) : null}
      <div className={classes("composer-surface")}>
        <CommandPalette
          snapshot={snapshot}
          open={showCommands}
          busy={pendingActionTypes.has("preview-command") || pendingActionTypes.has("execute-command")}
          dispatch={dispatch}
          returnFocusRef={commandReturnFocusRef}
          onClose={() => setShowCommands(false)}
        />
        <AttachmentTray
          snapshot={snapshot}
          client={client}
          busy={pendingActionTypes.has("remove-conversation-attachment") || uploading}
          dispatch={dispatch}
        />
        <FolderTray
          snapshot={snapshot}
          busy={pendingActionTypes.has("revoke-workspace-folder")}
          dispatch={dispatch}
        />
        {conversation.operation?.state === "running" ? (
          <ComposerModeSwitch
            mode={composerMode}
            canQueue={canQueue}
            canGuide={canGuide}
            busy={guidanceBusy || uploading}
            setMode={setComposerMode}
          />
        ) : null}
        <form
          className={classes("composer")}
          data-ui-composer
          data-ui-composer-mode={composerMode}
          onSubmit={submit}
        >
          <textarea
            ref={composerRef}
            name="text"
            value={draft}
            onChange={(event) => {
              draftRevision.current += 1;
              setDraft(event.target.value);
            }}
            onKeyDown={submitFromKeyboard}
            placeholder={composerPlaceholder(composerMode)}
            aria-label="Message"
            disabled={!draftEnabled || composerBusy || uploading}
          />
          <div className={classes("composer-toolbar")}>
            <ComposerAddMenu
              snapshot={snapshot}
              busy={uploading}
              folderBusy={
                pendingActionTypes.has("grant-workspace-folder") ||
                pendingActionTypes.has("regrant-workspace-folder")
              }
              uploadFiles={uploadFiles}
              dispatch={dispatch}
              openCommands={(returnTarget) => openCommandPalette(returnTarget)}
              openWorkflows={() => {
                setShowSessions(false);
                setShowContext(false);
                setShowSettings(false);
                setShowCommands(false);
                setShowWorkflows(true);
              }}
            />
            <div className={classes("composer-submit")}>
              <ComposerModelPicker
                snapshot={snapshot}
                endpoints={endpoints}
                busy={pendingActionTypes.has("set-active-model-endpoint") || uploading}
                dispatch={dispatch}
                openSettings={() => openSettingsPanel()}
              />
              {conversation.canCancel ? (
                <button
                  type="button"
                  className={classes("stop-button")}
                  data-ui-action="cancel-conversation"
                  aria-label="Stop"
                  title="Stop response"
                  disabled={pendingActionTypes.has("cancel-conversation")}
                  onClick={() => void dispatch({
                    type: "cancel-conversation",
                    input: { ...sessionInput, reason: "user requested cancellation" },
                  })}
                >
                  <Square size={13} fill="currentColor" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="submit"
                className={classes("send-button")}
                disabled={!actionEnabled || composerBusy || uploading || draft.trim().length === 0}
                aria-label={composerMode === "steer" ? "Guide current response" : "Send message"}
                title={composerMode === "steer" ? "Guide current response" : "Send message"}
              >
                {composerBusy ? <span className={classes("spinner")} /> : <ArrowUp size={18} />}
              </button>
            </div>
          </div>
        </form>
      </div>
      {composerContext === undefined ? null : (
        <div className={classes("composer-context")} data-ui-composer-context>{composerContext}</div>
      )}
    </div>
  );

  return (
    <PortalContainerProvider value={shellElement}>
    <main
      ref={setShellElement}
      className={classes("shell")}
      data-renderer="assistant"
      data-ui-assistant-shell
      data-theme={state.theme}
      data-density={state.density}
      data-ui-selection-kind={teamSelected ? "team" : "session"}
      {...(teamSelected ? {} : { "data-ui-conversation-state": conversation.state })}
      {...(teamSelected || conversation.operationId === undefined
        ? {}
        : { "data-ui-operation-id": conversation.operationId })}
    >
      <div
        className={classes(`layout ${showSessions ? "is-sidebar-open" : ""} ${sidebarCollapsed ? "is-sidebar-collapsed" : ""}`)}
        data-ui-layout
        data-ui-sidebar-open={showSessions ? "true" : "false"}
        data-ui-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
        inert={showSettings ? true : undefined}
      >
        {showSessions ? (
          <button
            type="button"
            className={classes("sidebar-backdrop")}
            aria-label="Close conversations"
            onClick={closeSessionNavigation}
          />
        ) : null}
        <Sidebar
          footer={navigationFooter}
          snapshot={snapshot}
          dispatch={dispatch}
          pendingActionTypes={pendingActionTypes}
          drawerOpen={showSessions}
          navigationRef={sessionDrawerRef}
          onKeyDown={sessionFocusBoundary.handleKeyDown}
          onNavigate={() => {
            closeSessionNavigation();
            setShowWorkflows(false);
            setShowCommands(false);
          }}
          onGroupCreated={(mode) => {
            if (mode === "coordinated") setShowContext(true);
          }}
          openSettings={() => openSettingsPanel(
            showSessions ? sessionReturnFocusRef.current : undefined,
          )}
        />
        <section
          className={classes(`main ${selectedViewIsEmpty ? "is-empty" : ""}`)}
          data-ui-conversation-main={!teamSelected ? true : undefined}
          data-ui-team-main={teamSelected ? true : undefined}
          data-ui-empty={selectedViewIsEmpty ? "true" : "false"}
          aria-label={teamSelected ? "Group conversation" : "Conversation"}
          inert={showSessions ? true : undefined}
        >
          <Topbar
            snapshot={snapshot}
            streamAvailable={streamAvailable}
            streamReconnecting={snapshotRetrying}
            sessionsOpen={showSessions}
            sidebarCollapsed={sidebarCollapsed}
            inactive={showSessions || showSettings}
            openSessions={openSessionNavigation}
            toggleSidebar={() => setSidebarCollapsed((current) => !current)}
            reconnectStream={retrySnapshot}
            toggleContext={() => {
              setShowWorkflows(false);
              setShowContext((current) => !current);
            }}
            actions={headerActions}
          />
          {snapshotError === undefined ? null : (
            <AvailabilityNotice
              message={snapshotError}
              retrying={snapshotRetrying}
              retry={retrySnapshot}
            />
          )}
          {error === undefined ? null : (
            <div className={classes("error")} role="alert" data-ui-error>
              <span>{error}</span>
              <button type="button" onClick={() => setError(undefined)} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {teamSelected ? (
            <>
              <TeamTimeline snapshot={snapshot} dispatch={dispatch} client={client} />
              <TeamComposer snapshot={snapshot} dispatch={dispatch} />
            </>
          ) : (
            <>
              <ConversationTimeline
                snapshot={snapshot}
                dispatch={dispatch}
                client={client}
                onSnapshot={adoptArrivedSnapshot}
                onError={setError}
              />
              {conversationIsEmpty ? (
                <div className={classes("empty-stage")} data-ui-empty-stage>
                  <EmptyGreeting />
                  {composerDock}
                  <QuickStarts
                    snapshot={snapshot}
                    dispatch={dispatch}
                    onSelectPrompt={selectQuickStart}
                    onOpenSettings={() => openSettingsPanel()}
                  />
                </div>
              ) : composerDock}
            </>
          )}
        </section>
        {showWorkflows ? (
          <WorkflowsPanel
            snapshot={snapshot}
            busy={workflowBusy || uploading}
            dispatch={dispatch}
            onClose={() => setShowWorkflows(false)}
          />
        ) : showContext ? (
          <ContextPanel
            snapshot={snapshot}
            dispatch={dispatch}
            pendingActionTypes={pendingActionTypes}
            onClose={() => setShowContext(false)}
          />
        ) : null}
      </div>
      {showSettings ? (
        <div
          ref={settingsOverlayRef as RefObject<HTMLDivElement>}
          className={classes("overlay")}
          data-ui-settings-overlay
          onKeyDown={settingsFocusBoundary.handleKeyDown}
        >
          <button
            type="button"
            className={classes("overlay-backdrop")}
            data-ui-settings-dismiss
            aria-label="Close settings"
            tabIndex={-1}
            onClick={closeSettingsPanel}
          />
          <SettingsPanel
            client={client}
            snapshot={snapshot}
            dispatch={dispatch}
            dispatchResult={dispatchResult}
            refreshError={snapshotError}
            refreshing={snapshotRetrying}
            retryRefresh={retrySnapshot}
            onboarding={snapshot.view.providerRunGate.attentionRequired}
            onSnapshot={adoptArrivedSnapshot}
            onError={setError}
            onClose={closeSettingsPanel}
          />
        </div>
      ) : null}
    </main>
    </PortalContainerProvider>
  );
}

function isWorkflowActionType(type: Action["type"]): boolean {
  return type === "start-side-query" ||
    type === "cancel-side-query" ||
    type === "dismiss-side-query" ||
    type === "start-plan-generation" ||
    type === "cancel-plan-generation" ||
    type === "dismiss-plan-generation" ||
    type === "revise-plan-proposal" ||
    type === "decide-plan-proposal" ||
    type === "execute-plan-proposal" ||
    type === "start-goal" ||
    type === "pause-goal" ||
    type === "resume-goal" ||
    type === "cancel-goal";
}

function inFlightActionKey(action: Action): string {
  return action.type === "resolve-conversation-approval"
    ? `${action.type}:${action.input.approvalId}`
    : action.type;
}

function createRequestId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (randomUuid === undefined) {
    throw new Error("The browser client requires crypto.randomUUID");
  }
  return randomUuid.call(globalThis.crypto);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "Request failed";
}

function activeElement(): HTMLElement | null {
  return document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
}
