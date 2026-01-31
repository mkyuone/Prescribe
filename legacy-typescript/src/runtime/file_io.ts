import fs from "node:fs";
import { errorAt } from "../diagnostics/errors.js";
import { Type } from "../semantics/types.js";
import { DateValue, parseDateLiteral, dateToString, toDayNumber, fromDayNumber } from "../util/dates.js";
import { RuntimeValue, TextFileHandle, RandomFileHandle } from "./values.js";

export function openTextFile(path: string, mode: string, line: number): TextFileHandle {
  const upper = mode.toUpperCase();
  if (upper !== "READ" && upper !== "WRITE" && upper !== "APPEND") {
    throw errorAt("FileError", line, "Invalid file mode.");
  }
  if (upper === "READ") {
    const content = fs.existsSync(path) ? fs.readFileSync(path, "utf8") : "";
    const lines = content.length === 0 ? [] : content.split(/\r?\n/);
    return { kind: "TextFile", mode: "READ", path, lines, index: 0, buffer: [], open: true };
  }
  return { kind: "TextFile", mode: upper as "WRITE" | "APPEND", path, lines: [], index: 0, buffer: [], open: true };
}

export function closeTextFile(handle: TextFileHandle): void {
  if (!handle.open) return;
  handle.open = false;
  if (handle.mode === "WRITE") {
    fs.writeFileSync(handle.path, handle.buffer.join("\n"), "utf8");
  }
  if (handle.mode === "APPEND") {
    fs.appendFileSync(handle.path, handle.buffer.join("\n"), "utf8");
  }
}

export function readTextLine(handle: TextFileHandle, line: number): string {
  if (!handle.open || handle.mode !== "READ") {
    throw errorAt("FileError", line, "File not open for READ.");
  }
  if (handle.index >= handle.lines.length) {
    throw errorAt("FileError", line, "End of file.");
  }
  return handle.lines[handle.index++].trim();
}

export function writeTextLine(handle: TextFileHandle, text: string, line: number): void {
  if (!handle.open || (handle.mode !== "WRITE" && handle.mode !== "APPEND")) {
    throw errorAt("FileError", line, "File not open for WRITE/APPEND.");
  }
  handle.buffer.push(text);
}

export function eofText(handle: TextFileHandle): boolean {
  if (!handle.open || handle.mode !== "READ") return true;
  return handle.index >= handle.lines.length;
}

export function openRandomFile(path: string): RandomFileHandle {
  const buffer = fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0);
  return { kind: "RandomFile", path, position: 1, buffer, open: true };
}

export function closeRandomFile(handle: RandomFileHandle): void {
  if (!handle.open) return;
  handle.open = false;
  fs.writeFileSync(handle.path, handle.buffer);
}

export function seekRandom(handle: RandomFileHandle, pos: number, line: number): void {
  if (!handle.open) throw errorAt("FileError", line, "File not open.");
  if (pos < 1) throw errorAt("RangeError", line, "SEEK address out of range.");
  handle.position = pos;
}

export function getRecord(handle: RandomFileHandle, type: Type, line: number): RuntimeValue {
  if (!handle.open) throw errorAt("FileError", line, "File not open.");
  const size = sizeOfType(type, line);
  const offset = (handle.position - 1) * size;
  if (offset + size > handle.buffer.length) {
    throw errorAt("FileError", line, "Record out of range.");
  }
  const slice = handle.buffer.subarray(offset, offset + size);
  return decodeValue(type, slice, line);
}

export function putRecord(handle: RandomFileHandle, type: Type, value: RuntimeValue, line: number): void {
  if (!handle.open) throw errorAt("FileError", line, "File not open.");
  const size = sizeOfType(type, line);
  const offset = (handle.position - 1) * size;
  const needed = offset + size;
  if (handle.buffer.length < needed) {
    const newBuf = Buffer.alloc(needed);
    handle.buffer.copy(newBuf);
    handle.buffer = newBuf;
  }
  const encoded = encodeValue(type, value, line);
  encoded.copy(handle.buffer, offset);
}

export function sizeOfType(type: Type, line: number): number {
  switch (type.kind) {
    case "Integer":
      return 4;
    case "Real":
      return 8;
    case "Boolean":
      return 1;
    case "Char":
      return 4;
    case "Date":
      return 4;
    case "Enum":
      return 4;
    case "Array": {
      const count = type.bounds.reduce((acc, b) => acc * (b.high - b.low + 1), 1);
      return count * sizeOfType(type.elementType, line);
    }
    case "Record": {
      let total = 0;
      for (const field of type.fields.values()) {
        total += sizeOfType(field, line);
      }
      return total;
    }
    default:
      throw errorAt("TypeError", line, "Type not supported in RANDOMFILE.");
  }
}

function encodeValue(type: Type, value: RuntimeValue, line: number): Buffer {
  const size = sizeOfType(type, line);
  const buf = Buffer.alloc(size);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  encodeInto(view, 0, type, value, line);
  return buf;
}

function decodeValue(type: Type, buf: Buffer, line: number): RuntimeValue {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const { value } = decodeFrom(view, 0, type, line);
  return value;
}

function encodeInto(view: DataView, offset: number, type: Type, value: RuntimeValue, line: number): number {
  switch (type.kind) {
    case "Integer":
      view.setInt32(offset, value.data as number, true);
      return offset + 4;
    case "Real":
      view.setFloat64(offset, value.data as number, true);
      return offset + 8;
    case "Boolean":
      view.setUint8(offset, (value.data as boolean) ? 1 : 0);
      return offset + 1;
    case "Char":
      view.setUint32(offset, (value.data as string).codePointAt(0) ?? 0, true);
      return offset + 4;
    case "Date": {
      const d = value.data as DateValue;
      view.setInt32(offset, toDayNumber(d), true);
      return offset + 4;
    }
    case "Enum":
      view.setInt32(offset, value.data as number, true);
      return offset + 4;
    case "Array": {
      const arr = value.data as RuntimeValue[] | RuntimeValue[][];
      const count = type.bounds.length;
      const dims = type.bounds.map((b) => b.high - b.low + 1);
      const write = (data: any, depth: number, off: number): number => {
        if (depth === count - 1) {
          for (let i = 0; i < dims[depth]; i += 1) {
            off = encodeInto(view, off, type.elementType, data[i], line);
          }
          return off;
        }
        for (let i = 0; i < dims[depth]; i += 1) {
          off = write(data[i], depth + 1, off);
        }
        return off;
      };
      return write(arr, 0, offset);
    }
    case "Record": {
      const fields = value.data as Map<string, RuntimeValue>;
      for (const [name, fieldType] of type.fields.entries()) {
        const fieldValue = fields.get(name) as RuntimeValue;
        offset = encodeInto(view, offset, fieldType, fieldValue, line);
      }
      return offset;
    }
    default:
      throw errorAt("TypeError", line, "Type not supported in RANDOMFILE.");
  }
}

function decodeFrom(view: DataView, offset: number, type: Type, line: number): { value: RuntimeValue; offset: number } {
  switch (type.kind) {
    case "Integer": {
      const value = view.getInt32(offset, true);
      return { value: { type, data: value }, offset: offset + 4 };
    }
    case "Real": {
      const value = view.getFloat64(offset, true);
      return { value: { type, data: value }, offset: offset + 8 };
    }
    case "Boolean": {
      const value = view.getUint8(offset) === 1;
      return { value: { type, data: value }, offset: offset + 1 };
    }
    case "Char": {
      const code = view.getUint32(offset, true);
      const value = String.fromCodePoint(code);
      return { value: { type, data: value }, offset: offset + 4 };
    }
    case "Date": {
      const num = view.getInt32(offset, true);
      const value = fromDayNumber(num);
      return { value: { type, data: value }, offset: offset + 4 };
    }
    case "Enum": {
      const ordinal = view.getInt32(offset, true);
      return { value: { type, data: ordinal }, offset: offset + 4 };
    }
    case "Array": {
      const dims = type.bounds.map((b) => b.high - b.low + 1);
      const read = (depth: number, off: number): { data: any; offset: number } => {
        if (depth === dims.length - 1) {
          const arr: RuntimeValue[] = [];
          for (let i = 0; i < dims[depth]; i += 1) {
            const res = decodeFrom(view, off, type.elementType, line);
            arr.push(res.value);
            off = res.offset;
          }
          return { data: arr, offset: off };
        }
        const arr: any[] = [];
        for (let i = 0; i < dims[depth]; i += 1) {
          const res = read(depth + 1, off);
          arr.push(res.data);
          off = res.offset;
        }
        return { data: arr, offset: off };
      };
      const res = read(0, offset);
      return { value: { type, data: res.data }, offset: res.offset };
    }
    case "Record": {
      const fields = new Map<string, RuntimeValue>();
      for (const [name, fieldType] of type.fields.entries()) {
        const res = decodeFrom(view, offset, fieldType, line);
        fields.set(name, res.value);
        offset = res.offset;
      }
      return { value: { type, data: fields }, offset };
    }
    default:
      throw errorAt("TypeError", line, "Type not supported in RANDOMFILE.");
  }
}
