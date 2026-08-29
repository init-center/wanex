import { stdin, stdout, stderr, env, exit, cwd, argv } from "node:process"
import { setTimeout as delay } from "node:timers/promises"

const protocol = "wanex.plugin.host.v1"
const chunks = []

stdin.setEncoding("utf8")
stdin.on("data", (chunk) => chunks.push(chunk))
stdin.on("end", async () => {
  const mode = argv[2] ?? "success"
  if (mode === "exit") {
    stderr.write("planned child exit\n")
    exit(7)
  }
  if (mode === "invalid-json") {
    stdout.write("not-json\n")
    return
  }
  if (mode === "sleep") {
    await delay(2_000)
  }
  if (mode === "large-output") {
    stdout.write("x".repeat(4_096))
  }

  const line = chunks.join("").trim().split(/\r?\n/u)[0]
  const message = JSON.parse(line)
  if (message.protocol !== protocol || message.type !== "execute") {
    stdout.write(
      `${JSON.stringify({
        protocol,
        type: "error",
        error: { message: "unexpected request" }
      })}\n`
    )
    return
  }

  stdout.write(
    `${JSON.stringify({
      protocol,
      type: "result",
      result: {
        subprocess: true,
        jobId: message.request.jobId,
        pluginId: message.request.pluginId,
        actionId: message.request.actionId,
        capability: message.request.capability,
        cwd: cwd(),
        ambientCredential: env.WANEX_PLUGIN_AMBIENT_CREDENTIAL ?? null,
        payload: message.request.payload
      }
    })}\n`
  )
})
