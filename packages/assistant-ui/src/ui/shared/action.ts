import type {
  Action,
  ActionResult,
} from "../../application/model.js";

export type DispatchAction = (
  action: Action,
  clearDraftRevision?: number,
) => Promise<boolean>;

export type DispatchActionResult = (
  action: Action,
  clearDraftRevision?: number,
) => Promise<ActionResult | undefined>;
