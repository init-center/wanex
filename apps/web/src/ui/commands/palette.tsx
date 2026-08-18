import { ArrowLeft, Check, Command, Search, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  CommandPaletteItem,
  Snapshot,
} from "../../application/model.js";
import { validateCommandInputDraft } from "../../application/commands/input/validation.js";
import { classes } from "../classes.js";
import type { DispatchAction } from "../shared/action.js";
import { useFocusBoundary } from "../shared/focus-boundary.js";
import {
  CommandInputFields,
  createCommandInputDraft,
  type CommandInputDraft,
} from "./input.js";

type CommandStage = "catalog" | "input" | "previewing" | "review" | "executing" | "result";

export function CommandPalette({
  snapshot,
  open,
  busy,
  dispatch,
  returnFocusRef,
  onClose,
}: {
  readonly snapshot: Snapshot;
  readonly open: boolean;
  readonly busy: boolean;
  readonly dispatch: DispatchAction;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}): ReactNode {
  const panelRef = useRef<HTMLElement | null>(null);
  const [stage, setStage] = useState<CommandStage>("catalog");
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [input, setInput] = useState<CommandInputDraft>();
  const [submittedInput, setSubmittedInput] = useState<unknown>();
  const [previewBaseline, setPreviewBaseline] = useState<number>();
  const [executionBaseline, setExecutionBaseline] = useState<number>();
  const focusBoundary = useFocusBoundary({
    active: open,
    containerRef: panelRef,
    returnFocusRef,
    initialFocusSelector: "[data-ui-command-search]",
  });
  const commands = snapshot.view.commandPalette.rows;
  const filtered = useMemo(() => filterCommands(commands, search), [commands, search]);
  const selected = commands.find((command) => command.id === selectedId);
  const preview = snapshot.view.commandPreview;
  const execution = snapshot.view.commandExecution;
  const currentPreview = preview.commandId === selectedId &&
      preview.updatedAt !== previewBaseline
    ? preview
    : undefined;
  const currentExecution = execution.commandId === selectedId &&
      execution.updatedAt !== executionBaseline
    ? execution
    : undefined;

  useEffect(() => {
    if (open) return;
    setStage("catalog");
    setSearch("");
    setActiveIndex(0);
    setSelectedId(undefined);
    setInput(undefined);
    setSubmittedInput(undefined);
    setPreviewBaseline(undefined);
    setExecutionBaseline(undefined);
  }, [open]);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent): void {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", closeFromOutside);
    return () => document.removeEventListener("pointerdown", closeFromOutside);
  }, [onClose, open]);

  if (!open) return null;

  function closeFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    focusBoundary.handleKeyDown(event);
  }

  function selectCommand(command: CommandPaletteItem): void {
    setSelectedId(command.id);
    setPreviewBaseline(snapshot.view.commandPreview.updatedAt);
    setExecutionBaseline(snapshot.view.commandExecution.updatedAt);
    if (command.input.mode === "generated") {
      setInput(createCommandInputDraft(command.input.root));
      setStage("input");
      return;
    }
    if (command.input.mode === "unsupported") {
      setStage("input");
      return;
    }
    void previewCommand(command, undefined);
  }

  async function previewCommand(command: CommandPaletteItem, commandInput: unknown): Promise<void> {
    setSubmittedInput(commandInput);
    setPreviewBaseline(snapshot.view.commandPreview.updatedAt);
    setStage("previewing");
    const accepted = await dispatch({
      type: "preview-command",
      input: {
        commandId: command.id,
        ...(commandInput === undefined ? {} : { input: commandInput }),
      },
    });
    setStage(accepted ? "review" : command.input.mode === "generated" ? "input" : "catalog");
  }

  async function executeCommand(): Promise<void> {
    if (selected === undefined || currentPreview?.state !== "runnable") return;
    setExecutionBaseline(snapshot.view.commandExecution.updatedAt);
    setStage("executing");
    const accepted = await dispatch({
      type: "execute-command",
      input: {
        commandId: selected.id,
        ...(submittedInput === undefined ? {} : { input: submittedInput }),
      },
    });
    setStage(accepted ? "result" : "review");
  }

  function backToCatalog(): void {
    setStage("catalog");
    setSelectedId(undefined);
    setInput(undefined);
    setSubmittedInput(undefined);
  }

  return (
    <section
      ref={panelRef}
      className={classes("command-palette")}
      role="dialog"
      aria-modal="false"
      aria-label="Commands"
      data-ui-command-palette
      onKeyDown={closeFromKeyboard}
    >
      <header className={classes("command-header")}>
        {stage === "catalog" ? <Command size={16} /> : (
          <button type="button" aria-label="Back to commands" title="Back" onClick={backToCatalog}>
            <ArrowLeft size={15} />
          </button>
        )}
        <strong>{stage === "catalog" ? "Commands" : selected?.title ?? "Command"}</strong>
        <button type="button" aria-label="Close commands" title="Close" onClick={onClose}>
          <X size={15} />
        </button>
      </header>
      {stage === "catalog" ? (
        <CommandCatalog
          commands={filtered}
          search={search}
          activeIndex={activeIndex}
          setSearch={setSearch}
          setActiveIndex={setActiveIndex}
          selectCommand={selectCommand}
        />
      ) : selected === undefined ? null : stage === "input" ? (
        <CommandInput
          command={selected}
          value={input}
          busy={busy}
          onChange={setInput}
          onSubmit={(value) => void previewCommand(selected, value)}
        />
      ) : stage === "previewing" ? (
        <CommandPending label="Reviewing command" />
      ) : stage === "review" ? (
        <CommandReview
          command={selected}
          preview={currentPreview}
          busy={busy}
          execute={() => void executeCommand()}
          retry={() => void previewCommand(selected, submittedInput)}
        />
      ) : stage === "executing" ? (
        <CommandPending label="Running command" />
      ) : (
        <CommandResult
          command={selected}
          execution={currentExecution}
          busy={busy}
          retry={() => void executeCommand()}
          close={onClose}
        />
      )}
    </section>
  );
}

function CommandCatalog({
  commands,
  search,
  activeIndex,
  setSearch,
  setActiveIndex,
  selectCommand,
}: {
  readonly commands: readonly CommandPaletteItem[];
  readonly search: string;
  readonly activeIndex: number;
  readonly setSearch: (value: string) => void;
  readonly setActiveIndex: (value: number) => void;
  readonly selectCommand: (command: CommandPaletteItem) => void;
}): ReactNode {
  function navigate(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const offset = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((activeIndex + offset + commands.length) % Math.max(1, commands.length));
      return;
    }
    if (event.key === "Enter" && commands[activeIndex] !== undefined) {
      event.preventDefault();
      selectCommand(commands[activeIndex] as CommandPaletteItem);
    }
  }
  return (
    <div className={classes("command-catalog")}>
      <label className={classes("command-search")}>
        <Search size={14} />
        <span className={classes("sr-only")}>Search commands</span>
        <input
          data-ui-command-search
          value={search}
          placeholder="Search commands"
          autoComplete="off"
          onChange={(event) => {
            setSearch(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={navigate}
        />
      </label>
      {commands.length === 0 ? (
        <p className={classes("command-empty")}>No matching commands</p>
      ) : (
        <ul role="listbox" aria-label="Available commands">
          {commands.map((command, index) => (
            <li key={command.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={classes(index === activeIndex ? "is-active" : "")}
                data-ui-command={command.id}
                onPointerMove={() => setActiveIndex(index)}
                onClick={() => selectCommand(command)}
              >
                <span><strong>{command.title}</strong><small>/{command.name}</small></span>
                {command.category === undefined ? null : <em>{command.category}</em>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommandInput({
  command,
  value,
  busy,
  onChange,
  onSubmit,
}: {
  readonly command: CommandPaletteItem;
  readonly value: CommandInputDraft;
  readonly busy: boolean;
  readonly onChange: (value: CommandInputDraft) => void;
  readonly onSubmit: (value: unknown) => void;
}): ReactNode {
  const [issues, setIssues] = useState<readonly { readonly path: string; readonly message: string }[]>([]);
  if (command.input.mode === "unsupported") {
    return <p className={classes("command-unavailable")} role="status">{command.input.message}</p>;
  }
  if (command.input.mode !== "generated") return null;
  const root = command.input.root;
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const nextIssues = validateCommandInputDraft(root, value);
    setIssues(nextIssues);
    if (nextIssues.length > 0) return;
    onSubmit(value);
  }
  return (
    <form className={classes("command-input")} data-ui-command-input onSubmit={submit}>
      <CommandInputFields
        control={root}
        value={value}
        onChange={(next) => {
          setIssues([]);
          onChange(next);
        }}
      />
      {issues.length === 0 ? null : (
        <ul className={classes("command-input-errors")} role="alert" data-ui-command-input-errors>
          {issues.map((issue) => (
            <li key={`${issue.path}:${issue.message}`}>{issue.message}</li>
          ))}
        </ul>
      )}
      <footer><button type="submit" disabled={busy}>Review</button></footer>
    </form>
  );
}

function CommandReview({
  command,
  preview,
  busy,
  execute,
  retry,
}: {
  readonly command: CommandPaletteItem;
  readonly preview: Snapshot["view"]["commandPreview"] | undefined;
  readonly busy: boolean;
  readonly execute: () => void;
  readonly retry: () => void;
}): ReactNode {
  if (preview === undefined) return <CommandPending label="Reviewing command" />;
  const runnable = preview.state === "runnable";
  return (
    <div className={classes("command-review")} data-ui-command-preview={preview.state}>
      <div className={classes(runnable ? "command-verdict is-ready" : "command-verdict is-rejected")}>
        {runnable ? <Check size={16} /> : <X size={16} />}
        <span><strong>{command.title}</strong><small>{preview.message}</small></span>
      </div>
      {preview.inputValidation === undefined ? null : (
        <ul>{preview.inputValidation.issues.map((issue, index) => (
          <li key={`${issue.path}:${index}`}>{issue.path} {issue.message}</li>
        ))}</ul>
      )}
      <footer>
        <button type="button" disabled={busy} onClick={runnable ? execute : retry}>
          {runnable ? "Execute" : "Review again"}
        </button>
      </footer>
    </div>
  );
}

function CommandResult({
  command,
  execution,
  busy,
  retry,
  close,
}: {
  readonly command: CommandPaletteItem;
  readonly execution: Snapshot["view"]["commandExecution"] | undefined;
  readonly busy: boolean;
  readonly retry: () => void;
  readonly close: () => void;
}): ReactNode {
  if (execution === undefined) return <CommandPending label="Running command" />;
  const completed = execution.state === "completed";
  return (
    <div className={classes("command-review")} data-ui-command-execution={execution.state}>
      <div className={classes(completed ? "command-verdict is-ready" : "command-verdict is-rejected")}>
        {completed ? <Check size={16} /> : <X size={16} />}
        <span><strong>{command.title}</strong><small>{execution.message}</small></span>
      </div>
      <footer>
        <button type="button" disabled={busy} onClick={completed ? close : retry}>
          {completed ? "Done" : "Try again"}
        </button>
      </footer>
    </div>
  );
}

function CommandPending({ label }: { readonly label: string }): ReactNode {
  return <p className={classes("command-pending")} role="status"><span className={classes("spinner")} />{label}</p>;
}

function filterCommands(
  commands: readonly CommandPaletteItem[],
  search: string,
): readonly CommandPaletteItem[] {
  const query = search.trim().toLocaleLowerCase();
  if (query.length === 0) return commands;
  return commands.filter((command) => [
    command.title,
    command.name,
    command.category ?? "",
  ].some((value) => value.toLocaleLowerCase().includes(query)));
}
