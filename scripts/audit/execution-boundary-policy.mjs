import ts from "typescript"

const CHILD_PROCESS_MODULES = new Set(["child_process", "node:child_process"])
const FILESYSTEM_MODULES = new Set([
  "fs",
  "fs/promises",
  "node:fs",
  "node:fs/promises"
])

const childProcessOwners = new Set([
  "apps/assistant-host/src/cli/open.ts",
  "packages/eval-harness/src/distribution-audit.ts",
  "packages/eval-harness/src/workspace/task-conflict-scenario.ts",
  "packages/runtime/src/execution/native-managed-process.ts",
  "packages/runtime/src/execution/native-process.ts",
  "packages/runtime/src/execution/native-supervisor.ts",
  "packages/runtime/src/execution/process-tree.ts",
  "packages/storage/src/transport-local-command.ts",
  "packages/storage/src/transport-local-persistent.ts",
  "packages/storage/src/transport-process-tree.ts",
  "packages/storage/src/transport-types.ts"
])

const nativeEnvironmentCompositionOwners = new Set([
  "apps/assistant-host/src/application/assistant.ts",
  "apps/coding/src/host/start.ts",
  "apps/desktop/src/execution.ts",
  "packages/eval-harness/src/assistant/declarative-input-scenario.ts",
  "packages/eval-harness/src/assistant/plugin-action-scenario.ts",
  "packages/eval-harness/src/workspace/controlled-tools-scenario.ts",
  "packages/eval-harness/src/workspace/execution.ts",
  "packages/eval-harness/src/workspace/task-conflict-scenario.ts"
])

const ambientEnvironmentOwners = new Set([
  "apps/assistant-host/src/cli/main.ts",
  "apps/assistant-host/src/dev/main.ts",
  "apps/cli/src/index.ts",
  "apps/desktop/src/main.ts",
  "apps/tui/src/cli/main.ts",
  "packages/app/src/main.ts",
  "packages/eval-harness/src/cli.ts",
  "packages/runtime/src/bootstrap/artifacts.ts",
  "packages/runtime/src/execution/native-environment.ts",
  "packages/runtime/src/execution/native-supervisor.ts",
  "packages/runtime/src/execution/process-tree.ts",
  "packages/runtime/src/secrets/providers.ts"
])

export function findExecutionBoundaryViolations(sources) {
  const violations = []
  for (const source of sources) {
    const path = normalizePath(source.path)
    const facts = inspectSource(path, source.text)
    if (
      facts.modules.some((module) => CHILD_PROCESS_MODULES.has(module)) &&
      !childProcessOwners.has(path)
    ) {
      violations.push(violation(
        "unowned-child-process",
        path,
        "direct child-process ownership belongs only to Runtime Native, Storage local transport, or an explicitly reviewed Host control-plane entry"
      ))
    }
    if (
      isTaskExecutionSource(path) &&
      facts.modules.some((module) => FILESYSTEM_MODULES.has(module))
    ) {
      violations.push(violation(
        "direct-task-filesystem",
        path,
        "task and Plugin action execution must use an admitted ExecutionScope filesystem port"
      ))
    }
    if (
      facts.constructsNativeEnvironment &&
      !nativeEnvironmentCompositionOwners.has(path)
    ) {
      violations.push(violation(
        "unowned-native-environment-construction",
        path,
        "NativeExecutionEnvironment construction belongs only to an explicitly reviewed trusted composition root"
      ))
    }
    if (facts.readsAmbientEnvironment && !ambientEnvironmentOwners.has(path)) {
      violations.push(violation(
        "unowned-ambient-environment",
        path,
        "ambient environment access belongs only to executable/bootstrap roots, Native launch review, or EnvSecretProvider"
      ))
    }
  }
  return violations.sort(
    (left, right) => left.path.localeCompare(right.path) ||
      left.code.localeCompare(right.code)
  )
}

function inspectSource(path, text) {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path)
  )
  const modules = []
  const nativeEnvironmentNames = new Set(["NativeExecutionEnvironment"])
  let constructsNativeEnvironment = false
  let readsAmbientEnvironment = false

  const visit = (node) => {
    const module = moduleSpecifier(node)
    if (module !== undefined) modules.push(module)

    if (
      ts.isImportDeclaration(node) &&
      stringLiteralText(node.moduleSpecifier) === "@wanex/runtime/execution" &&
      node.importClause?.namedBindings !== undefined &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const element of node.importClause.namedBindings.elements) {
        if ((element.propertyName?.text ?? element.name.text) === "NativeExecutionEnvironment") {
          nativeEnvironmentNames.add(element.name.text)
        }
      }
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      nativeEnvironmentNames.has(node.expression.text)
    ) {
      constructsNativeEnvironment = true
    }
    if (isProcessEnvAccess(node) || importsProcessEnv(node) || destructuresProcessEnv(node)) {
      readsAmbientEnvironment = true
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return {
    modules,
    constructsNativeEnvironment,
    readsAmbientEnvironment
  }
}

function moduleSpecifier(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return stringLiteralText(node.moduleSpecifier)
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference)
  ) {
    return stringLiteralText(node.moduleReference.expression)
  }
  if (ts.isCallExpression(node) && node.arguments.length === 1) {
    if (
      node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")
    ) {
      return stringLiteralText(node.arguments[0])
    }
  }
  return undefined
}

function stringLiteralText(node) {
  return node !== undefined && ts.isStringLiteralLike(node)
    ? node.text
    : undefined
}

function isProcessEnvAccess(node) {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    node.name.text === "env"
  ) || (
    ts.isElementAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process" &&
    stringLiteralText(node.argumentExpression) === "env"
  )
}

function importsProcessEnv(node) {
  if (
    !ts.isImportDeclaration(node) ||
    !["node:process", "process"].includes(stringLiteralText(node.moduleSpecifier)) ||
    node.importClause?.namedBindings === undefined ||
    !ts.isNamedImports(node.importClause.namedBindings)
  ) {
    return false
  }
  return node.importClause.namedBindings.elements.some(
    (element) => (element.propertyName?.text ?? element.name.text) === "env"
  )
}

function destructuresProcessEnv(node) {
  return ts.isVariableDeclaration(node) &&
    ts.isObjectBindingPattern(node.name) &&
    ts.isIdentifier(node.initializer) &&
    node.initializer.text === "process" &&
    node.name.elements.some(
      (element) => (element.propertyName?.getText() ?? element.name.getText()) === "env"
    )
}

function isTaskExecutionSource(path) {
  return /^(?:packages\/workspace\/src\/(?:tasks|tools|transaction)\/|packages\/plugin\/src\/(?:action-|subprocess)|apps\/coding\/src\/host\/execution\/|apps\/assistant-plugin-host\/src\/)/u.test(path)
}

function scriptKind(path) {
  if (/\.tsx$/u.test(path)) return ts.ScriptKind.TSX
  if (/\.(?:js|mjs|cjs)$/u.test(path)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function normalizePath(path) {
  return path.replaceAll("\\", "/")
}

function violation(code, path, message) {
  return { code, path, message }
}
