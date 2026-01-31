import { errorAt } from "../diagnostics/errors.js";

export const INT_MIN = -2147483648;
export const INT_MAX = 2147483647;

export function checkInt(value: number, line: number): number {
  if (!Number.isInteger(value)) {
    throw errorAt("RangeError", line, "Integer overflow.");
  }
  if (value < INT_MIN || value > INT_MAX) {
    throw errorAt("RangeError", line, "Integer overflow.");
  }
  return value;
}

export function checkReal(value: number, line: number): number {
  if (!Number.isFinite(value)) {
    throw errorAt("RuntimeError", line, "Invalid real value.");
  }
  if (Math.abs(value) !== 0 && (Math.abs(value) < Number.MIN_VALUE || Math.abs(value) > Number.MAX_VALUE)) {
    throw errorAt("RangeError", line, "Real overflow/underflow.");
  }
  return value;
}

export function divEuclid(a: number, b: number, line: number): { q: number; r: number } {
  if (b === 0) {
    throw errorAt("RuntimeError", line, "Division by zero.");
  }
  const q = Math.trunc(a / b);
  let r = a % b;
  if (r < 0) {
    r += Math.abs(b);
  }
  const adjQ = (a - r) / b;
  return { q: checkInt(adjQ, line), r: checkInt(r, line) };
}
