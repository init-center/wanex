// @vitest-environment happy-dom

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Select } from "../src/ui/primitives/select.js";
import { PortalContainerProvider } from "../src/ui/primitives/portal.js";
import { CommandInputFields } from "../src/ui/commands/input.js";
import { chooseOption } from "./support/select.js";

const roots: Root[] = [];
const options = [{ value: "first", label: "First choice" }, { value: "second", label: "Second choice" }];

beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));

afterEach(async () => {
  await act(async () => { while (roots.length > 0) roots.pop()?.unmount(); });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Select", () => {
  it("selects the visible option and submits its original form value", async () => {
    await render(<form><Select name="choice" label="Choice" defaultValue="first" options={options} /></form>);
    await chooseOption(trigger(), "second");
    expect(trigger().textContent).toContain("Second choice");
    expect(new FormData(document.querySelector("form")!).get("choice")).toBe("second");
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("honours a controlled value and calls its owner only once", async () => {
    const changed = vi.fn();
    function Host(): ReactNode {
      const [value, setValue] = useState("first");
      return <Select label="Choice" value={value} options={options} onValueChange={(next) => { changed(next); setValue(next); }} />;
    }
    await render(<Host />);
    await chooseOption(trigger(), "second");
    expect(changed).toHaveBeenCalledExactlyOnceWith("second");
    expect(trigger().textContent).toContain("Second choice");
  });

  it("disables both the visible control and its native form bridge", async () => {
    await render(<form><Select name="choice" label="Choice" disabled defaultValue="first" options={options} /></form>);
    expect(trigger().disabled).toBe(true);
    await act(async () => trigger().click());
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelector<HTMLSelectElement>('select[name="choice"]')?.disabled).toBe(true);
  });

  it("retains a required native form bridge without a second visible control", async () => {
    await render(<form><Select name="choice" label="Choice" required options={options} /></form>);
    expect(trigger().getAttribute("aria-required")).toBe("true");
    expect(document.querySelector<HTMLSelectElement>('select[name="choice"]')?.required).toBe(true);
    expect(trigger().textContent).toContain("Select an option");
  });

  it("mounts within its dialog and Escape does not close the parent", async () => {
    const parentKey = vi.fn();
    await render(<div role="dialog" aria-label="Preferences" onKeyDown={parentKey}>
      <Select label="Choice" defaultValue="first" options={options} />
    </div>);
    await act(async () => trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const list = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(list.closest('[role="dialog"]')).not.toBeNull();
    parentKey.mockClear();
    await act(async () => list.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(parentKey).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("uses the shell portal when no dialog owns it", async () => {
    const shell = document.createElement("main");
    shell.dataset.theme = "dark";
    document.body.append(shell);
    await render(<PortalContainerProvider value={shell}><Select label="Choice" options={options} /></PortalContainerProvider>);
    await act(async () => trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(shell.querySelector('[role="listbox"]')).not.toBeNull();
  });
});

describe("Command enum choices", () => {
  it("preserves empty strings, numeric values and booleans through visible selection", async () => {
    const changed = vi.fn();
    const control = {
      kind: "object" as const, path: "", label: "Input", required: true,
      minProperties: 3, maxProperties: 3,
      properties: [
        { kind: "string" as const, path: "/text", label: "Text", required: true, options: ["", "named"] },
        { kind: "number" as const, path: "/amount", label: "Amount", required: true, options: [0, 1.5] },
        { kind: "boolean" as const, path: "/enabled", label: "Enabled", required: true, options: [true, false] },
      ],
    };
    function Host(): ReactNode {
      const [value, setValue] = useState<unknown>({ text: "named", amount: 0, enabled: true });
      return <CommandInputFields control={control} value={value} onChange={(next) => { changed(next); setValue(next); }} />;
    }
    await render(<Host />);
    await chooseOption(trigger("Text"), "0");
    await chooseOption(trigger("Amount"), "1.5");
    await chooseOption(trigger("Enabled"), "false");
    expect(changed).toHaveBeenLastCalledWith({ text: "", amount: 1.5, enabled: false });
    expect(trigger("Text").textContent).toContain("Empty value");
  });
});

function trigger(label = "Choice"): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(`button[role="combobox"][aria-label="${label}"]`);
  if (button === null) throw new Error(`Missing choice trigger: ${label}`);
  return button;
}

async function render(node: ReactNode): Promise<void> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(node));
}
