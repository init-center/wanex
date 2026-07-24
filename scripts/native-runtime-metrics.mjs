export const NATIVE_RELEASE_SAMPLE_COUNT = 5

const metricNames = [
  "coldImport",
  "artifactVerification",
  "create",
  "createDispose",
  "turn",
  "dispose",
  "total",
  "wallTime"
]

export function summarizeNativeRuntimeSamples(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error("native Runtime proof summary requires samples")
  }
  samples.forEach((sample, index) => {
    if (sample?.index !== index) {
      throw new Error(`native Runtime proof sample ${index} has an invalid index`)
    }
    if (sample?.temperature !== "cold") {
      throw new Error(`native Runtime proof sample ${index} must be cold`)
    }
  })

  return Object.fromEntries(metricNames.map((metric) => {
    const values = samples.map((sample) => readMetric(sample, metric))
      .sort((left, right) => left - right)
    return [metric, {
      medianMs: median(values),
      maximumMs: values.at(-1),
      samplesMs: values
    }]
  }))
}

function readMetric(sample, metric) {
  let value
  if (metric === "wallTime") {
    value = sample?.wallTimeMs
  } else if (metric === "createDispose") {
    value = sample?.timingsMs?.create + sample?.timingsMs?.dispose
  } else {
    value = sample?.timingsMs?.[metric]
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      `native Runtime proof ${metric} timing must be a non-negative number`
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
