export type ErrorType =
  | "SyntaxError"
  | "NameError"
  | "TypeError"
  | "RangeError"
  | "RuntimeError"
  | "FileError"
  | "AccessError";

export class PrescribeError extends Error {
  readonly errorType: ErrorType;
  readonly line: number;

  constructor(errorType: ErrorType, line: number, message: string) {
    super(message);
    this.errorType = errorType;
    this.line = line;
  }
}

export function errorAt(errorType: ErrorType, line: number, message: string): PrescribeError {
  return new PrescribeError(errorType, line, message);
}
