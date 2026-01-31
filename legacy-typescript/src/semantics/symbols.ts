import { Type } from "./types.js";
import { BlockNode, ClassDeclNode, ProcDeclNode, FuncDeclNode, VarDeclNode, ConstDeclNode, TypeDeclNode, ConstructorDeclNode, ParamNode } from "../frontend/ast.js";

export type SymbolKind =
  | "Var"
  | "Const"
  | "Type"
  | "Proc"
  | "Func"
  | "Class"
  | "Field"
  | "Method"
  | "Constructor"
  | "Param"
  | "EnumMember";

export type Symbol = {
  kind: SymbolKind;
  name: string;
  type?: Type;
  decl?: VarDeclNode | ConstDeclNode | TypeDeclNode | ProcDeclNode | FuncDeclNode | ClassDeclNode | ConstructorDeclNode | ParamNode;
  access?: "PUBLIC" | "PRIVATE";
  ownerClass?: string;
};

export class Scope {
  private readonly symbols = new Map<string, Symbol>();
  constructor(public readonly parent?: Scope) {}

  define(sym: Symbol): void {
    this.symbols.set(sym.name, sym);
  }

  lookup(name: string): Symbol | undefined {
    if (this.symbols.has(name)) return this.symbols.get(name);
    return this.parent?.lookup(name);
  }

  lookupLocal(name: string): Symbol | undefined {
    return this.symbols.get(name);
  }
}

export type ClassInfo = {
  name: string;
  baseName?: string;
  fields: Map<string, Symbol>;
  methods: Map<string, Symbol>;
  ctor?: Symbol;
  decl: ClassDeclNode;
};

export type ProcInfo = {
  name: string;
  decl: ProcDeclNode | FuncDeclNode;
  type?: Type;
};

export type BlockInfo = {
  scope: Scope;
  block: BlockNode;
};
