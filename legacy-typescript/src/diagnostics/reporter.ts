import { PrescribeError } from "./errors.js";

export function formatError(err: PrescribeError): string {
  return `${err.errorType} at line ${err.line}: ${err.message}`;
}
