export function isWanexDesktopOwnedNavigation(
  candidate: string,
  ownedOrigin: string
): boolean {
  try {
    const url = new URL(candidate)
    const origin = new URL(ownedOrigin)
    return (
      url.origin === origin.origin &&
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.username.length === 0 &&
      url.password.length === 0
    )
  } catch {
    return false
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
