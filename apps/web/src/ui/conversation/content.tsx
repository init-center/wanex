import { Check, CircleAlert, Copy, LoaderCircle } from "lucide-react";
import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { renderSafeConversationMarkdown } from "./markdown.js";
import type { ConversationHistoryRow } from "../../application/model.js";
import { useClipboardWriter, type ClipboardWriteState } from "../shared/clipboard.js";
import { classes } from "../classes.js";

interface CodeBlockTarget {
  readonly code: HTMLElement;
  readonly index: number;
  readonly pre: HTMLElement;
}

export function projectMessageClipboardText(
  row: ConversationHistoryRow,
): string | undefined {
  if (
    (row.role !== "user" && row.role !== "assistant") ||
    (row.status !== "completed" && row.status !== "succeeded")
  ) return undefined;
  const textParts = row.parts.flatMap((part) =>
    part.type === "text" ? [part.text] : []
  );
  if (textParts.length === 0) return undefined;
  const text = textParts.join("\n\n");
  return text.length === 0 ? undefined : text;
}

export function ConversationRichText({ source }: {
  readonly source: string;
}): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const html = useMemo(() => renderSafeConversationMarkdown(source), [source]);
  const [codeBlocks, setCodeBlocks] = useState<readonly CodeBlockTarget[]>([]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      setCodeBlocks([]);
      return;
    }
    const next = Array.from(root.querySelectorAll<HTMLElement>("pre > code"))
      .flatMap((code, index) => {
        const pre = code.parentElement;
        if (pre?.tagName !== "PRE") return [];
        pre.classList.add("code-block");
        return [{ code, index, pre }];
      });
    setCodeBlocks(next);
    return () => {
      for (const target of next) {
        target.pre.classList.remove("code-block");
      }
    };
  }, [html]);

  return (
    <>
      <ConversationMarkup html={html} rootRef={rootRef} />
      {codeBlocks.map((target) => createPortal(
        <ContentCopyButton
          key={target.index}
          kind="code"
          label="Copy code"
          getText={() => target.code.textContent ?? ""}
          qaValue={String(target.index)}
        />,
        target.pre,
        `code-copy:${target.index}`,
      ))}
    </>
  );
}

const ConversationMarkup = memo(function ConversationMarkup({ html, rootRef }: {
  readonly html: string;
  readonly rootRef: RefObject<HTMLDivElement | null>;
}): ReactNode {
  return (
    <div
      ref={rootRef}
      data-ui-rich-text
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

export function MessageCopyAction({ rowId, text }: {
  readonly rowId: string;
  readonly text: string;
}): ReactNode {
  return (
    <ContentCopyButton
      kind="message"
      label="Copy message"
      getText={() => text}
      qaValue={rowId}
    />
  );
}

function ContentCopyButton({ kind, label, getText, qaValue }: {
  readonly kind: "code" | "message";
  readonly label: string;
  readonly getText: () => string;
  readonly qaValue: string;
}): ReactNode {
  const clipboard = useClipboardWriter();
  const presentation = copyPresentation(label, clipboard.state);
  return (
    <button
      type="button"
      className={classes(`copy-action is-${kind}`)}
      data-ui-copy-state={clipboard.state}
      {...(kind === "code"
        ? { "data-ui-copy-code": qaValue }
        : { "data-ui-copy-message": qaValue })}
      disabled={clipboard.state === "pending"}
      aria-label={presentation.accessibleLabel}
      title={presentation.title}
      onClick={() => void clipboard.write(getText())}
    >
      <CopyStateIcon state={clipboard.state} />
      <span className={classes("sr-only")} role="status" aria-live="polite" aria-atomic="true">
        {presentation.announcement}
      </span>
    </button>
  );
}

function CopyStateIcon({ state }: { readonly state: ClipboardWriteState }): ReactNode {
  switch (state) {
    case "idle":
      return <Copy size={14} aria-hidden="true" />;
    case "pending":
      return <LoaderCircle size={14} className={classes("is-running")} aria-hidden="true" />;
    case "succeeded":
      return <Check size={14} aria-hidden="true" />;
    case "failed":
      return <CircleAlert size={14} aria-hidden="true" />;
  }
}

function copyPresentation(
  label: string,
  state: ClipboardWriteState,
): {
  readonly accessibleLabel: string;
  readonly announcement: string;
  readonly title: string;
} {
  switch (state) {
    case "idle":
      return { accessibleLabel: label, announcement: "", title: label };
    case "pending":
      return {
        accessibleLabel: "Copying",
        announcement: "Copying",
        title: "Copying",
      };
    case "succeeded":
      return {
        accessibleLabel: "Copied",
        announcement: "Copied",
        title: "Copied",
      };
    case "failed":
      return {
        accessibleLabel: "Copy failed. Try again",
        announcement: "Copy failed. Try again",
        title: "Copy failed. Try again",
      };
  }
}
