export const PRODUCT_DESKTOP_COLD_SAMPLE_COUNT = 1
export const PRODUCT_DESKTOP_WARM_SAMPLE_COUNT = 4
export const PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT =
  PRODUCT_DESKTOP_COLD_SAMPLE_COUNT + PRODUCT_DESKTOP_WARM_SAMPLE_COUNT

const metricNames = [
  "processToAppReady",
  "artifactVerification",
  "hostStartup",
  "rendererLoad",
  "rendererInteractive",
  "conversationSettlement",
  "rendererPostSettlement",
  "shutdown",
  "interactiveTotal",
  "proofTotal",
  "wallTime"
]

export function summarizeProductDesktopSamples(samples) {
  if (
    !Array.isArray(samples) ||
    samples.length !== PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT
  ) {
    throw new Error(
      `Product Desktop proof requires exactly ${PRODUCT_DESKTOP_PROOF_SAMPLE_COUNT} samples`
    )
  }
  samples.forEach((sample, index) => {
    const expectedTemperature = index === 0 ? "cold" : "warm"
    if (sample?.index !== index) {
      throw new Error(`Product Desktop proof sample ${index} has an invalid index`)
    }
    if (sample?.temperature !== expectedTemperature) {
      throw new Error(
        `Product Desktop proof sample ${index} must be ${expectedTemperature}`
      )
    }
  })

  const cold = samples[0]
  const warm = samples.slice(PRODUCT_DESKTOP_COLD_SAMPLE_COUNT)
  return {
    cold: {
      sampleCount: PRODUCT_DESKTOP_COLD_SAMPLE_COUNT,
      timingsMs: Object.fromEntries(metricNames.map((name) => [
        name,
        readMetric(cold, name)
      ]))
    },
    warm: {
      sampleCount: PRODUCT_DESKTOP_WARM_SAMPLE_COUNT,
      metrics: Object.fromEntries(metricNames.map((name) => {
        const values = warm.map((sample) => readMetric(sample, name))
          .sort((left, right) => left - right)
        return [name, {
          medianMs: median(values),
          maximumMs: values.at(-1),
          samplesMs: values
        }]
      }))
    }
  }
}

function readMetric(sample, name) {
  const value = name === "wallTime"
    ? sample?.wallTimeMs
    : sample?.runtime?.timingsMs?.[name]
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `Product Desktop proof ${name} timing must be a non-negative number`
    )
  }
  return value
}

function median(values) {
  const midpoint = values.length / 2
  return values.length % 2 === 0
    ? (values[midpoint - 1] + values[midpoint]) / 2
    : values[Math.floor(midpoint)]
}
