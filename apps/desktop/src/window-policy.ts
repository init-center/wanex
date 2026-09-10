export interface WanexDesktopNavigationPolicy {
  bindOwnedOrigin(url: string): void;
  allows(url: string): boolean;
}

export function createWanexDesktopNavigationPolicy(): WanexDesktopNavigationPolicy {
  let ownedOrigin: string | undefined;
  return {
    bindOwnedOrigin(url) {
      if (ownedOrigin !== undefined) {
        throw new Error("Desktop navigation origin is already bound");
      }
      const parsed = parseOwnedOrigin(url);
      if (parsed === undefined) {
        throw new Error("Desktop navigation origin must be a credential-free HTTP origin");
      }
      ownedOrigin = parsed;
    },
    allows(url) {
      if (ownedOrigin === undefined) return false;
      const candidate = parseOwnedOrigin(url);
      return candidate !== undefined && candidate === ownedOrigin;
    },
  };
}

function parseOwnedOrigin(value: string): string | undefined {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
}

export interface WanexDesktopWindowChromePolicy {
  readonly documentChrome: "standard" | "integrated-macos";
  readonly title: string;
  readonly titleBarStyle?: "hiddenInset";
}

export function resolveWanexDesktopWindowChrome(
  platform: NodeJS.Platform,
): WanexDesktopWindowChromePolicy {
  return platform === "darwin"
    ? {
        documentChrome: "integrated-macos",
        title: "",
        titleBarStyle: "hiddenInset",
      }
    : {
        documentChrome: "standard",
        title: "Wanex",
      };
}
