import { escapeHtml } from "./escape-html.js"
import type { ProductAppWebCommandCatalogViewModel } from "./types.js"

export function renderProductAppWebCommandCatalog(
  catalog: ProductAppWebCommandCatalogViewModel
): string {
  const rows =
    catalog.rows.length === 0
      ? `<li data-command-catalog-empty-state>${escapeHtml(catalog.message)}</li>`
      : catalog.rows.map(renderCommandRow).join("")
  const diagnostics =
    catalog.diagnostics.length === 0
      ? ""
      : `<ul data-command-catalog-diagnostics>${catalog.diagnostics
          .map(
            (diagnostic) =>
              `<li data-severity="${escapeHtml(diagnostic.severity)}">${escapeHtml(diagnostic.message)}</li>`
          )
          .join("")}</ul>`

  return [
    `<section data-panel="command-catalog" data-command-catalog-state="${escapeHtml(catalog.state)}">`,
    `<h2>Product commands</h2>`,
    `<p data-command-catalog-message>${escapeHtml(catalog.message)}</p>`,
    `<ol data-command-catalog-list>${rows}</ol>`,
    diagnostics,
    `</section>`
  ].join("")
}

function renderCommandRow(
  command: ProductAppWebCommandCatalogViewModel["rows"][number]
): string {
  return [
    `<li data-command-id="${escapeHtml(command.id)}" data-command-source-kind="${escapeHtml(command.sourceKind)}" data-command-trust="${escapeHtml(command.trust)}">`,
    `<strong>${escapeHtml(command.title)}</strong>`,
    `<span>${escapeHtml(command.id)}</span>`,
    `<small>${escapeHtml(command.category ?? "uncategorized")}</small>`,
    `<small>${escapeHtml(`${command.sourceKind}:${command.sourceId}`)}</small>`,
    `<code>${escapeHtml(command.handlerRef)}</code>`,
    `</li>`
  ].join("")
}
