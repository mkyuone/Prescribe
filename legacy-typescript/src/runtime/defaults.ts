import { Type } from "../semantics/types.js";
import { makeValue, RuntimeValue } from "./values.js";
import { DateValue } from "../util/dates.js";

export function defaultValue(type: Type): RuntimeValue {
  switch (type.kind) {
    case "Integer":
      return makeValue(type, 0);
    case "Real":
      return makeValue(type, 0.0);
    case "Boolean":
      return makeValue(type, false);
    case "Char":
      return makeValue(type, "\u0000");
    case "String":
      return makeValue(type, "");
    case "Date":
      return makeValue(type, { year: 1, month: 1, day: 1 } as DateValue);
    case "Array": {
      const dims = type.bounds.map((b) => b.high - b.low + 1);
      const create = (depth: number): any => {
        const size = dims[depth];
        const arr = new Array(size);
        if (depth === dims.length - 1) {
          for (let i = 0; i < size; i += 1) {
            arr[i] = defaultValue(type.elementType);
          }
        } else {
          for (let i = 0; i < size; i += 1) {
            arr[i] = create(depth + 1);
          }
        }
        return arr;
      };
      return makeValue(type, create(0));
    }
    case "Record": {
      const fields = new Map<string, RuntimeValue>();
      for (const [name, fieldType] of type.fields.entries()) {
        fields.set(name, defaultValue(fieldType));
      }
      return makeValue(type, fields);
    }
    case "Enum":
      return makeValue(type, 0);
    case "Set":
      return makeValue(type, new Set<number>());
    case "Pointer":
      return makeValue(type, null);
    case "Class":
      return makeValue(type, null);
    case "TextFile":
      return makeValue(type, null);
    case "RandomFile":
      return makeValue(type, null);
  }
  throw new Error("Unknown type default.");
}
