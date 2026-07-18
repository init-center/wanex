const forbiddenPathPatterns = [
  {
    code: "packlist_test_file",
    test: (path) => path.startsWith("test/"),
    message: "package packlist must not include test files"
  },
  {
    code: "packlist_fixture_file",
    test: (path) => path.includes("/fixtures/") || path.startsWith("fixtures/"),
    message: "package packlist must not include fixtures"
  },
  {
    code: "packlist_runtime_store",
    test: (path) =>
      path.endsWith(".db") ||
      path.endsWith(".sqlite") ||
      path.endsWith(".sqlite3"),
    message: "package packlist must not include runtime stores"
  },
  {
    code: "packlist_runtime_log",
    test: (path) => path.endsWith(".log") || path.endsWith(".jsonl"),
    message: "package packlist must not include runtime logs or debug streams"
  },
  {
    code: "packlist_support_bundle",
    test: (path) =>
      path.includes("support-bundle") &&
      !path.startsWith("src/") &&
      !path.startsWith("README"),
    message: "package packlist must not include generated support bundles"
  }
]

export function findPacklistFilePolicyFailures(request) {
  const failures = []
  for (const file of request.packlist) {
    for (const pattern of forbiddenPathPatterns) {
      if (!pattern.test(file.path)) {
        continue
      }
      failures.push({
        code: pattern.code,
        package: request.manifest.name,
        path: file.path,
        bytes: file.bytes,
        message: pattern.message
      })
    }
  }
  return failures
}
