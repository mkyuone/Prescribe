import { Type } from "../semantics/types.js";
import { DateValue } from "../util/dates.js";

export type RuntimeValue = {
  type: Type;
  data: unknown;
};

export type ClassObject = {
  className: string;
  fields: Map<string, RuntimeValue>;
};

export type TextFileHandle = {
  kind: "TextFile";
  mode: "READ" | "WRITE" | "APPEND";
  path: string;
  lines: string[];
  index: number;
  buffer: string[];
  open: boolean;
};

export type RandomFileHandle = {
  kind: "RandomFile";
  path: string;
  position: number;
  buffer: Buffer;
  open: boolean;
};

export function makeValue(type: Type, data: unknown): RuntimeValue {
  return { type, data };
}

export function asDate(value: RuntimeValue): DateValue {
  return value.data as DateValue;
}
