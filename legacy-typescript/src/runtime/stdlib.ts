import { errorAt } from "../diagnostics/errors.js";
import { Type } from "../semantics/types.js";
import { RuntimeValue } from "./values.js";
import { formatReal } from "../util/strings.js";
import { parseDateLiteral, dateToString } from "../util/dates.js";
import { makeValue } from "./values.js";

export class StdLib {
  private seed = 1;

  rand(): RuntimeValue {
    this.seed = (1103515245 * this.seed + 12345) % 2147483648;
    return makeValue({ kind: "Real" }, this.seed / 2147483648);
  }

  length(arg: RuntimeValue, line: number): RuntimeValue {
    if (arg.type.kind !== "String") throw errorAt("TypeError", line, "LENGTH requires STRING.");
    return makeValue({ kind: "Integer" }, (arg.data as string).length);
  }

  right(s: RuntimeValue, n: RuntimeValue, line: number): RuntimeValue {
    if (s.type.kind !== "String" || n.type.kind !== "Integer") throw errorAt("TypeError", line, "RIGHT requires STRING, INTEGER.");
    const str = s.data as string;
    const count = n.data as number;
    if (count < 0 || count > str.length) throw errorAt("RangeError", line, "RIGHT out of range.");
    return makeValue({ kind: "String" }, str.slice(str.length - count));
  }

  mid(s: RuntimeValue, start: RuntimeValue, n: RuntimeValue, line: number): RuntimeValue {
    if (s.type.kind !== "String" || start.type.kind !== "Integer" || n.type.kind !== "Integer") {
      throw errorAt("TypeError", line, "MID requires STRING, INTEGER, INTEGER.");
    }
    const str = s.data as string;
    const pos = start.data as number;
    const count = n.data as number;
    if (count < 0 || pos < 1 || pos > str.length + 1 || pos + count - 1 > str.length) {
      throw errorAt("RangeError", line, "MID out of range.");
    }
    return makeValue({ kind: "String" }, str.substr(pos - 1, count));
  }

  lcase(s: RuntimeValue, line: number): RuntimeValue {
    if (s.type.kind !== "String") throw errorAt("TypeError", line, "LCASE requires STRING.");
    return makeValue({ kind: "String" }, (s.data as string).replace(/[A-Z]/g, (c) => c.toLowerCase()));
  }

  ucase(s: RuntimeValue, line: number): RuntimeValue {
    if (s.type.kind !== "String") throw errorAt("TypeError", line, "UCASE requires STRING.");
    return makeValue({ kind: "String" }, (s.data as string).replace(/[a-z]/g, (c) => c.toUpperCase()));
  }

  int(x: RuntimeValue, line: number): RuntimeValue {
    if (x.type.kind !== "Real") throw errorAt("TypeError", line, "INT requires REAL.");
    return makeValue({ kind: "Integer" }, Math.trunc(x.data as number));
  }

  real(x: RuntimeValue, line: number): RuntimeValue {
    if (x.type.kind !== "Integer") throw errorAt("TypeError", line, "REAL requires INTEGER.");
    return makeValue({ kind: "Real" }, Number(x.data));
  }

  string(x: RuntimeValue, line: number): RuntimeValue {
    return makeValue({ kind: "String" }, toOutputString(x, line));
  }

  char(x: RuntimeValue, line: number): RuntimeValue {
    if (x.type.kind !== "Integer") throw errorAt("TypeError", line, "CHAR requires INTEGER.");
    const num = x.data as number;
    if (num < 0 || num > 127) throw errorAt("RangeError", line, "CHAR out of range.");
    return makeValue({ kind: "Char" }, String.fromCharCode(num));
  }

  boolean(x: RuntimeValue, line: number): RuntimeValue {
    if (x.type.kind !== "String") throw errorAt("TypeError", line, "BOOLEAN requires STRING.");
    const text = (x.data as string).toUpperCase();
    if (text === "TRUE") return makeValue({ kind: "Boolean" }, true);
    if (text === "FALSE") return makeValue({ kind: "Boolean" }, false);
    throw errorAt("TypeError", line, "Invalid BOOLEAN token.");
  }

  date(x: RuntimeValue, line: number): RuntimeValue {
    if (x.type.kind !== "String") throw errorAt("TypeError", line, "DATE requires STRING.");
    const value = parseDateLiteral(x.data as string, line);
    return makeValue({ kind: "Date" }, value);
  }

  ord(x: RuntimeValue, line: number): RuntimeValue {
    if (x.type.kind !== "Enum") throw errorAt("TypeError", line, "ORD requires ENUM.");
    return makeValue({ kind: "Integer" }, x.data as number);
  }

  enumValue(enumType: Type, ordinal: RuntimeValue, line: number): RuntimeValue {
    if (ordinal.type.kind !== "Integer") throw errorAt("TypeError", line, "ENUMVALUE ordinal must be INTEGER.");
    const value = ordinal.data as number;
    if (enumType.kind !== "Enum") throw errorAt("TypeError", line, "ENUMVALUE requires enum type.");
    if (value < 0 || value >= enumType.members.length) throw errorAt("RangeError", line, "ENUMVALUE out of range.");
    return makeValue(enumType, value);
  }

  size(setValue: RuntimeValue, line: number): RuntimeValue {
    if (setValue.type.kind !== "Set") throw errorAt("TypeError", line, "SIZE requires SET.");
    return makeValue({ kind: "Integer" }, (setValue.data as Set<number>).size);
  }
}

export function toOutputString(value: RuntimeValue, line: number): string {
  switch (value.type.kind) {
    case "Integer":
      return String(value.data as number);
    case "Real":
      return formatReal(value.data as number, line);
    case "Boolean":
      return (value.data as boolean) ? "TRUE" : "FALSE";
    case "Char":
      return value.data as string;
    case "String":
      return value.data as string;
    case "Date":
      return dateToString(value.data as any);
    default:
      throw errorAt("TypeError", line, "Value not outputtable.");
  }
}
