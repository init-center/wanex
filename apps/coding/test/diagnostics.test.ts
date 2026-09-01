import { describe, expect, it } from "vitest";
import { diagnosticFailure } from "../src/host/diagnostics/failure.js";

describe("Coding Host failure diagnostics", () => {
  it("classifies Windows filesystem failures without retaining path evidence", () => {
    const failure = diagnosticFailure({
      type: "worker.error",
      name: "Error",
      message:
        "EPERM: operation not permitted, rename 'D:\\private\\source' -> 'D:\\private\\target'",
      nested: {
        code: "EPERM",
        detail: "worktree transaction failed for private-coding-prompt",
      },
    });

    expect(failure).toEqual({
      category: "permission_denied",
      signals: ["eperm", "rename", "worktree", "transaction"],
      type: "worker.error",
      name: "Error",
      code: "EPERM",
    });
    const retained = JSON.stringify(failure);
    expect(retained).not.toContain("D:\\private");
    expect(retained).not.toContain("private-coding-prompt");
  });

  it("bounds unknown failures to safe identifiers", () => {
    const failure = diagnosticFailure({
      type: "unsafe type with spaces",
      name: "SafeFailure",
      code: "safe_code",
      message: "opaque private diagnostic",
    });

    expect(failure).toEqual({
      category: "unknown",
      signals: [],
      name: "SafeFailure",
      code: "safe_code",
    });
    expect(JSON.stringify(failure)).not.toContain("opaque private diagnostic");
  });
});
