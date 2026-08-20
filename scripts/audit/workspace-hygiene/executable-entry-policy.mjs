import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import ts from "typescript"
import { repositoryRelativePath } from "../repository-path.mjs"
import { forbiddenGeneratedDirs, skippedDirs } from "./policy-constants.mjs"

const sourceExtensionPattern = /\.(?:cjs|js|mjs|ts|tsx)$/
const argvEntryPattern = /\bprocess\.argv\s*\[\s*1\s*\]/
const equalityOperators = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken
])

export async function findExecutableEntryFailures(rootDir) {
  const sourceFiles = []
  for (const sourceRoot of ["apps", "packages", "scripts"]) {
    sourceFiles.push(
      ...(await findSourceFiles(join(rootDir, sourceRoot)))
    )
  }

  const failures = []
  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, "utf8")
    if (!containsManualMainModuleComparison(sourceFile, source)) {
      continue
    }
    failures.push({
      code: "forbidden-manual-main-module-detection",
      path: repositoryRelativePath(rootDir, sourceFile),
      bytes: (await stat(sourceFile)).size,
      message: "Node 26 ESM entries must use import.meta.main instead of comparing an argv entry path with file URLs"
    })
  }
  return failures
}

function containsManualMainModuleComparison(path, source) {
  if (!source.includes("import.meta.url") || !argvEntryPattern.test(source)) {
    return false
  }
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true
  )
  let found = false
  visit(sourceFile)
  return found

  function visit(node) {
    if (found) return
    if (ts.isBinaryExpression(node) && equalityOperators.has(node.operatorToken.kind)) {
      const markers = { importMetaUrl: false, processArgvEntry: false }
      inspect(node.left, markers)
      inspect(node.right, markers)
      if (markers.importMetaUrl && markers.processArgvEntry) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
}

function inspect(node, markers) {
  if (isImportMetaUrl(node)) markers.importMetaUrl = true
  if (isProcessArgvEntry(node)) markers.processArgvEntry = true
  if (markers.importMetaUrl && markers.processArgvEntry) return
  ts.forEachChild(node, (child) => inspect(child, markers))
}

function isImportMetaUrl(node) {
  return ts.isPropertyAccessExpression(node) &&
    node.name.text === "url" &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === "meta"
}

function isProcessArgvEntry(node) {
  return ts.isElementAccessExpression(node) &&
    ts.isNumericLiteral(node.argumentExpression) &&
    node.argumentExpression.text === "1" &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "argv" &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "process"
}

async function findSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const paths = []
  for (const entry of entries) {
    if (skippedDirs.has(entry.name)) {
      continue
    }
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (forbiddenGeneratedDirs.has(entry.name)) {
        continue
      }
      paths.push(...(await findSourceFiles(fullPath)))
      continue
    }
    if (entry.isFile() && sourceExtensionPattern.test(entry.name)) {
      paths.push(fullPath)
    }
  }
  return paths
}
