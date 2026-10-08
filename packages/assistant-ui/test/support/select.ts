import { act } from "react";

export async function chooseOption(trigger: HTMLButtonElement, value: string): Promise<void> {
  await act(async () => {
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  const item = [...document.querySelectorAll<HTMLElement>('[role="option"][data-ui-select-option]')]
    .find((candidate) => candidate.getAttribute("data-ui-select-option") === value);
  if (item === undefined) throw new Error(`Missing visible option: ${value}`);
  await act(async () => {
    item.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}
