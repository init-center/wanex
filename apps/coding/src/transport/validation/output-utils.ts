export {
  boundedString,
  exactObject,
  isRecord,
  literal,
  nonNegativeInteger,
  positiveInteger,
  timestamp,
} from "./common.js";
import { boundedString } from "./common.js";

export function id(value: unknown): value is string {
  return boundedString(value, 512);
}
