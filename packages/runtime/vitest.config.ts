import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Runtime integration files start native System Service processes. A
    // single file lane avoids process and SQLite lock contention on Windows.
    fileParallelism: false,
    testTimeout: 30_000
  }
})
