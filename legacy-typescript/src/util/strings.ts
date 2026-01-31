import { errorAt } from "../diagnostics/errors.js";

export function formatReal(value: number, line: number): string {
  if (!Number.isFinite(value)) {
    throw errorAt("RuntimeError", line, "Invalid real value.");
  }
  const rounded = roundHalfAwayFromZero(value, 6);
  let text = rounded.toFixed(6);
  text = text.replace(/\.0+$/, "");
  text = text.replace(/(\.[0-9]*?)0+$/, "$1");
  if (text.endsWith(".")) {
    text = text.slice(0, -1);
  }
  return text;
}

function roundHalfAwayFromZero(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const rounded = scaled > 0 ? Math.floor(scaled + 0.5) : Math.ceil(scaled - 0.5);
  return rounded / factor;
}

export function ensureCharLength(value: string, line: number): string {
  if (value.length !== 1) {
    throw errorAt("TypeError", line, "CHAR value must be length 1.");
  }
  return value;
}
