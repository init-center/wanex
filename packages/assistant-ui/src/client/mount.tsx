import { createRoot, type Root } from "react-dom/client";
import { App } from "../ui/shell/app.js";
import type { AppProps } from "./contracts.js";

export interface MountClientOptions extends AppProps {
  readonly root: HTMLElement;
}

export interface MountedClient {
  readonly root: Root;
  unmount(): void;
}

export function mountClient(
  options: MountClientOptions,
): MountedClient {
  const root = createRoot(options.root);
  root.render(
    <App
      client={options.client}
      {...(options.initialSnapshot === undefined
        ? {}
        : { initialSnapshot: options.initialSnapshot })}
    />,
  );
  return { root, unmount: () => root.unmount() };
}
