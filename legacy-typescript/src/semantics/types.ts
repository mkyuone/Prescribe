export type TypeKind =
  | "Integer"
  | "Real"
  | "Boolean"
  | "Char"
  | "String"
  | "Date"
  | "Null"
  | "Array"
  | "Record"
  | "Enum"
  | "Set"
  | "Pointer"
  | "Class"
  | "TextFile"
  | "RandomFile";

export type Type =
  | BasicType
  | NullType
  | ArrayType
  | RecordType
  | EnumType
  | SetType
  | PointerType
  | ClassType
  | TextFileType
  | RandomFileType;

export type BasicType = { kind: "Integer" | "Real" | "Boolean" | "Char" | "String" | "Date" };
export type NullType = { kind: "Null" };
export type ArrayType = { kind: "Array"; bounds: ArrayBounds[]; elementType: Type };
export type ArrayBounds = { low: number; high: number };
export type RecordType = { kind: "Record"; fields: Map<string, Type> };
export type EnumType = { kind: "Enum"; name: string; members: string[] };
export type SetType = { kind: "Set"; base: EnumType };
export type PointerType = { kind: "Pointer"; target: Type };
export type ClassType = { kind: "Class"; name: string };
export type TextFileType = { kind: "TextFile" };
export type RandomFileType = { kind: "RandomFile"; record: RecordType };

export const INTEGER: BasicType = { kind: "Integer" };
export const REAL: BasicType = { kind: "Real" };
export const BOOLEAN: BasicType = { kind: "Boolean" };
export const CHAR: BasicType = { kind: "Char" };
export const STRING: BasicType = { kind: "String" };
export const DATE: BasicType = { kind: "Date" };

export function isNumeric(t: Type): boolean {
  return t.kind === "Integer" || t.kind === "Real";
}

export function isComparable(t: Type): boolean {
  return t.kind === "Integer" || t.kind === "Real" || t.kind === "Char" || t.kind === "String" || t.kind === "Date" ||
    t.kind === "Enum";
}

export function isSetType(t: Type): t is SetType {
  return t.kind === "Set";
}

export function isAssignable(to: Type, from: Type): boolean {
  if (from.kind === "Null" && (to.kind === "Pointer" || to.kind === "Class")) return true;
  return typeEquals(to, from);
}

export function typeEquals(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "Null":
      return b.kind === "Null";
    case "Array": {
      const bArr = b as ArrayType;
      if (a.bounds.length !== bArr.bounds.length) return false;
      for (let i = 0; i < a.bounds.length; i += 1) {
        if (a.bounds[i].low !== bArr.bounds[i].low || a.bounds[i].high !== bArr.bounds[i].high) return false;
      }
      return typeEquals(a.elementType, bArr.elementType);
    }
    case "Record": {
      const bRec = b as RecordType;
      if (a.fields.size !== bRec.fields.size) return false;
      for (const [name, t] of a.fields.entries()) {
        const other = bRec.fields.get(name);
        if (!other || !typeEquals(t, other)) return false;
      }
      return true;
    }
    case "Enum":
      return a.name === (b as EnumType).name;
    case "Set":
      return a.base.name === (b as SetType).base.name;
    case "Pointer":
      return typeEquals(a.target, (b as PointerType).target);
    case "Class":
      return a.name === (b as ClassType).name;
    case "RandomFile":
      return typeEquals(a.record, (b as RandomFileType).record);
    default:
      return true;
  }
}
