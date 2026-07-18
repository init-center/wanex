import { parseProductAppWebActionInput } from "./action-input.js"
import { renderProductAppWebHtml } from "./render-html.js"
import { createProductAppWebSurface } from "./surface.js"
import type {
  CreateProductAppWebControllerOptions,
  ProductAppWebController,
  ProductAppWebControllerSubmitOptions,
  ProductAppWebControllerSubmitResult,
  ProductAppWebDocument,
  ProductAppWebPollEventsOptions,
  ProductAppWebSnapshot,
  ProductAppWebSurface
} from "./types.js"

export async function createProductAppWebController(
  options: CreateProductAppWebControllerOptions
): Promise<ProductAppWebController> {
  const surface = await createProductAppWebSurface(options)
  const renderHtml = options.renderHtml ?? renderProductAppWebHtml
  const defaultPollAfterAction = options.pollAfterAction

  const renderDocument = () => createDocument(surface.snapshot(), renderHtml)

  return {
    snapshot() {
      return surface.snapshot()
    },
    document() {
      return renderDocument()
    },
    async refresh(homeOptions) {
      await surface.refresh(homeOptions)
      return renderDocument()
    },
    async pollEvents(pollOptions) {
      await surface.pollEvents(pollOptions)
      return renderDocument()
    },
    async submitActionInput(input, submitOptions) {
      return await submitProductAppWebControllerActionInput({
        surface,
        input,
        pollAfterAction: readPollAfterAction(
          submitOptions,
          defaultPollAfterAction
        ),
        renderDocument
      })
    }
  }
}

function createDocument(
  snapshot: ProductAppWebSnapshot,
  renderHtml: (snapshot: ProductAppWebSnapshot) => string
): ProductAppWebDocument {
  return {
    kind: "product-app-web.document",
    snapshot,
    html: renderHtml(snapshot)
  }
}

async function submitProductAppWebControllerActionInput(request: {
  readonly surface: ProductAppWebSurface
  readonly input: unknown
  readonly pollAfterAction: ProductAppWebPollEventsOptions | false | undefined
  readonly renderDocument: () => ProductAppWebDocument
}): Promise<ProductAppWebControllerSubmitResult> {
  const parse = parseProductAppWebActionInput(request.input, {
    commandCatalog: request.surface.snapshot().view.commandCatalog
  })
  if (!parse.ok) {
    return {
      ok: false,
      parse,
      document: request.renderDocument()
    }
  }

  const actionResult = await request.surface.dispatchAction(parse.action)
  if (request.pollAfterAction !== false) {
    await request.surface.pollEvents(request.pollAfterAction)
  }

  if (actionResult.ok) {
    return {
      ok: true,
      parse,
      actionResult,
      document: request.renderDocument()
    }
  }

  return {
    ok: false,
    parse,
    actionResult,
    document: request.renderDocument()
  }
}

function readPollAfterAction(
  submitOptions: ProductAppWebControllerSubmitOptions | undefined,
  defaultPollAfterAction: ProductAppWebPollEventsOptions | false | undefined
): ProductAppWebPollEventsOptions | false | undefined {
  return submitOptions?.pollAfterAction ?? defaultPollAfterAction
}
