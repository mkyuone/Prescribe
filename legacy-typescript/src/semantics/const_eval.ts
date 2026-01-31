import { ExprNode, LiteralNode, BinaryExprNode, UnaryExprNode } from "../frontend/ast.js";
import { errorAt } from "../diagnostics/errors.js";
import { Type } from "./types.js";
import { checkInt, checkReal, divEuclid } from "../util/math.js";
import { DateValue, parseDateLiteral, compareDate, toDayNumber, fromDayNumber } from "../util/dates.js";

export type ConstValue =
  | { kind: "Integer"; value: number }
  | { kind: "Real"; value: number }
  | { kind: "Boolean"; value: boolean }
  | { kind: "Char"; value: string }
  | { kind: "String"; value: string }
  | { kind: "Date"; value: DateValue }
  | { kind: "Enum"; name: string; ordinal: number };

export type ConstEnv = Map<string, ConstValue>;

export function evalConst(expr: ExprNode, env: ConstEnv): ConstValue {
  switch (expr.kind) {
    case "Literal":
      return literalToConst(expr);
    case "NameExpr": {
      const value = env.get(expr.name);
      if (!value) throw errorAt("NameError", expr.loc.line, `Unknown constant ${expr.name}.`);
      return value;
    }
    case "UnaryExpr":
      return evalUnary(expr, env);
    case "BinaryExpr":
      return evalBinary(expr, env);
    default:
      throw errorAt("TypeError", expr.loc.line, "Invalid constant expression.");
  }
}

function literalToConst(lit: LiteralNode): ConstValue {
  switch (lit.literalType) {
    case "Integer":
      return { kind: "Integer", value: lit.value as number };
    case "Real":
      return { kind: "Real", value: lit.value as number };
    case "Boolean":
      return { kind: "Boolean", value: lit.value as boolean };
    case "Char":
      return { kind: "Char", value: lit.value as string };
    case "String":
      return { kind: "String", value: lit.value as string };
    case "Date":
      return { kind: "Date", value: parseDateLiteral(lit.value as string, lit.loc.line) };
    default:
      throw errorAt("TypeError", lit.loc.line, "Invalid literal type.");
  }
}

function evalUnary(expr: UnaryExprNode, env: ConstEnv): ConstValue {
  const value = evalConst(expr.expr, env);
  switch (expr.op) {
    case "+":
      return value;
    case "-":
      if (value.kind === "Integer") return { kind: "Integer", value: checkInt(-value.value, expr.loc.line) };
      if (value.kind === "Real") return { kind: "Real", value: checkReal(-value.value, expr.loc.line) };
      break;
    case "NOT":
      if (value.kind === "Boolean") return { kind: "Boolean", value: !value.value };
      break;
  }
  throw errorAt("TypeError", expr.loc.line, "Invalid constant unary operator.");
}

function evalBinary(expr: BinaryExprNode, env: ConstEnv): ConstValue {
  const left = evalConst(expr.left, env);
  const right = evalConst(expr.right, env);
  const op = expr.op;
  if (op === "+" || op === "-" || op === "*") {
    if (left.kind === "Integer" && right.kind === "Integer") {
      const l = left.value;
      const r = right.value;
      const result = op === "+" ? l + r : op === "-" ? l - r : l * r;
      return { kind: "Integer", value: checkInt(result, expr.loc.line) };
    }
    if (left.kind === "Real" && right.kind === "Real") {
      const l = left.value;
      const r = right.value;
      const result = op === "+" ? l + r : op === "-" ? l - r : l * r;
      return { kind: "Real", value: checkReal(result, expr.loc.line) };
    }
  }
  if (op === "/") {
    if (left.kind === "Integer" && right.kind === "Integer") {
      if (right.value === 0) throw errorAt("RuntimeError", expr.loc.line, "Division by zero.");
      return { kind: "Real", value: checkReal(left.value / right.value, expr.loc.line) };
    }
    if (left.kind === "Real" && right.kind === "Real") {
      if (right.value === 0) throw errorAt("RuntimeError", expr.loc.line, "Division by zero.");
      return { kind: "Real", value: checkReal(left.value / right.value, expr.loc.line) };
    }
  }
  if (op === "DIV" || op === "MOD") {
    if (left.kind === "Integer" && right.kind === "Integer") {
      const { q, r } = divEuclid(left.value, right.value, expr.loc.line);
      return { kind: "Integer", value: op === "DIV" ? q : r };
    }
  }
  if (op === "&") {
    if ((left.kind === "String" || left.kind === "Char") && (right.kind === "String" || right.kind === "Char")) {
      const l = left.kind === "Char" ? left.value : left.value;
      const r = right.kind === "Char" ? right.value : right.value;
      return { kind: "String", value: `${l}${r}` };
    }
  }
  if (op === "AND" || op === "OR") {
    if (left.kind === "Boolean" && right.kind === "Boolean") {
      return { kind: "Boolean", value: op === "AND" ? left.value && right.value : left.value || right.value };
    }
  }
  if (op === "=" || op === "<>" || op === "<" || op === "<=" || op === ">" || op === ">=") {
    const cmp = compareConst(left, right, expr.loc.line);
    let result = false;
    switch (op) {
      case "=":
        result = cmp === 0;
        break;
      case "<>":
        result = cmp !== 0;
        break;
      case "<":
        result = cmp < 0;
        break;
      case "<=":
        result = cmp <= 0;
        break;
      case ">":
        result = cmp > 0;
        break;
      case ">=":
        result = cmp >= 0;
        break;
    }
    return { kind: "Boolean", value: result };
  }
  throw errorAt("TypeError", expr.loc.line, "Invalid constant binary operator.");
}

function compareConst(a: ConstValue, b: ConstValue, line: number): number {
  if (a.kind !== b.kind) {
    throw errorAt("TypeError", line, "Incompatible constant comparison.");
  }
  switch (a.kind) {
    case "Integer":
      return a.value - (b as ConstValue & { kind: "Integer" }).value;
    case "Real":
      return a.value - (b as ConstValue & { kind: "Real" }).value;
    case "Boolean":
      return Number(a.value) - Number((b as ConstValue & { kind: "Boolean" }).value);
    case "Char":
    case "String":
      return a.value < (b as ConstValue & { kind: typeof a.kind }).value ? -1 : a.value > (b as ConstValue & { kind: typeof a.kind }).value ? 1 : 0;
    case "Date":
      return compareDate(a.value, (b as ConstValue & { kind: "Date" }).value);
    default:
      throw errorAt("TypeError", line, "Invalid comparison.");
  }
}

export function constToRuntime(value: ConstValue): unknown {
  switch (value.kind) {
    case "Date":
      return value.value;
    case "Enum":
      return value.ordinal;
    default:
      return value.value;
  }
}

export function constType(value: ConstValue, enumType?: Type): Type | undefined {
  if (value.kind === "Enum") return enumType;
  return undefined;
}

export function dateAddDays(date: DateValue, days: number): DateValue {
  return fromDayNumber(toDayNumber(date) + days);
}
