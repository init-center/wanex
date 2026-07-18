export interface DoctorReport {
  readonly storePath: string
  readonly schemaVersion: number
  readonly checks: readonly DoctorCheck[]
}

export interface DoctorCheck {
  readonly name: string
  readonly state: "ok" | "warn" | "error"
  readonly message: string
}
