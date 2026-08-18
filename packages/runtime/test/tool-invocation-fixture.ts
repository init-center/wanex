import type { ToolResourceOutputPort } from "../src/tools/index.js"

export const unavailableToolResources: ToolResourceOutputPort = Object.freeze({
  async publish() {
    throw new Error("resource publication is unavailable in this direct Tool test")
  },
  async reference() {
    throw new Error("resource lookup is unavailable in this direct Tool test")
  }
})
