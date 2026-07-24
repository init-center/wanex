export const ELECTRON_COLD_SAMPLE_COUNT = 1
export const ELECTRON_WARM_SAMPLE_COUNT = 4
export const ELECTRON_PROOF_SAMPLE_COUNT =
  ELECTRON_COLD_SAMPLE_COUNT + ELECTRON_WARM_SAMPLE_COUNT

const metricNames = [
  "processToAppReady",
  "artifactVerification",
  "hostStartup",
  "rendererLoad",
  "rendererRoundTrip",
  "shutdown",
  "total",
  "wallTime"
]

export function summarizeElectronSamples(samples) {
  if (!Array.isArray(samples) || samples.length !== ELECTRON_PROOF_SAMPLE_COUNT) {
    throw new Error(
      `Electron proof requires exactly ${ELECTRON_PROOF_SAMPLE_COUNT} samples`
    )
  }
  samples.forEach((sample, index) => {
    const expectedTemperature = index === 0 ? "cold" : "warm"
    if (sample?.index !== index) {
      throw new Error(`Electron proof sample ${index} has an invalid index`)
    }
    if (sample?.temperature !== expectedTemperature) {
      throw new Error(
        `Electron proof sample ${index} must be ${expectedTemperature}`
      )
    }
  })

  const cold = samples[0]
  const warm = samples.slice(ELECTRON_COLD_SAMPLE_COUNT)
  return {
    cold: {
      sampleCount: ELECTRON_COLD_SAMPLE_COUNT,
      timingsMs: Object.fromEntries(metricNames.map((name) => [
        name,
        readMetric(cold, name)
      ]))
    },
    warm: {
      sampleCount: ELECTRON_WARM_SAMPLE_COUNT,
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
    throw new Error(`Electron proof ${name} timing must be a non-negative number`)
  }
  return value
}

function median(values) {
  const midpoint = values.length / 2
  return values.length % 2 === 0
    ? (values[midpoint - 1] + values[midpoint]) / 2
    : values[Math.floor(midpoint)]
}
