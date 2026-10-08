// @vitest-environment happy-dom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../src/ui/primitives/confirm-dialog.js";

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    while (roots.length > 0) roots.pop()?.unmount();
  });
  document.body.replaceChildren();
});

describe("ConfirmDialog", () => {
  it("starts on Cancel, cancels on Escape and confirms exactly once", async () => {
    const confirmed = vi.fn();
    const cancelled = vi.fn();
    await render(
      <ConfirmDialog
        open
        title="Remove server?"
        description="Its tools stop being available."
        confirmLabel="Remove server"
        qa="test-remove"
        onConfirm={confirmed}
        onCancel={cancelled}
      />,
    );

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("Remove server?");
    expect(document.activeElement?.textContent).toBe("Cancel");

    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(cancelled).toHaveBeenCalledTimes(1);
    expect(confirmed).not.toHaveBeenCalled();

    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-ui-confirm-action="test-remove"]')?.click();
    });
    expect(confirmed).toHaveBeenCalledTimes(1);
    expect(cancelled).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while the confirmed work is running", async () => {
    const cancelled = vi.fn();
    await render(
      <ConfirmDialog
        open
        title="Remove?"
        description="Working."
        confirmLabel="Remove"
        busy
        onConfirm={() => undefined}
        onCancel={cancelled}
      />,
    );
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')];
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    await act(async () => {
      document.querySelector('[role="alertdialog"]')?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
    });
    expect(cancelled).not.toHaveBeenCalled();
  });

  it("closes from the owner state after cancel", async () => {
    function Host(): ReactNode {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          title="Remove?"
          description="Sure?"
          confirmLabel="Remove"
          onConfirm={() => undefined}
          onCancel={() => setOpen(false)}
        />
      );
    }
    await render(<Host />);
    await act(async () => {
      [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')][0]?.click();
    });
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});

async function render(node: ReactNode): Promise<void> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
}
