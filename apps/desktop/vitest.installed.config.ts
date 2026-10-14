import { defineConfig } from "vitest/config"
import workspaceTests from "./vitest.config.js"

export default defineConfig({
  test: {
    ...workspaceTests.test,
    include: ["acceptance/**/*.test.{ts,mjs}"]
  }
})
