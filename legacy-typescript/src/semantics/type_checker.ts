import {
  ProgramNode,
  BlockNode,
  DeclarationNode,
  VarDeclNode,
  ConstDeclNode,
  TypeDeclNode,
  ProcDeclNode,
  FuncDeclNode,
  ClassDeclNode,
  ConstructorDeclNode,
  StatementNode,
  AssignStmtNode,
  IfStmtNode,
  CaseStmtNode,
  ForStmtNode,
  WhileStmtNode,
  RepeatStmtNode,
  CallStmtNode,
  ReturnStmtNode,
  InputStmtNode,
  OutputStmtNode,
  FileStmtNode,
  SuperCallStmtNode,
  ExprNode,
  LiteralNode,
  NameExprNode,
  CallExprNode,
  IndexExprNode,
  FieldExprNode,
  NewExprNode,
  EOFExprNode,
  NullExprNode,
  LValueNode,
  DerefExprNode,
  TypeNode,
  BasicTypeNode,
  ArrayTypeNode,
  RecordTypeNode,
  EnumTypeNode,
  SetTypeNode,
  PointerTypeNode,
  FileTypeNode,
  NamedTypeNode
} from "../frontend/ast.js";
import { errorAt } from "../diagnostics/errors.js";
import {
  Type,
  INTEGER,
  REAL,
  BOOLEAN,
  CHAR,
  STRING,
  DATE,
  ArrayType,
  RecordType,
  EnumType,
  SetType,
  PointerType,
  ClassType,
  TextFileType,
  RandomFileType,
  isNumeric,
  isComparable,
  isAssignable,
  typeEquals
} from "./types.js";
import { Scope, Symbol, ClassInfo } from "./symbols.js";
import { evalConst, ConstEnv } from "./const_eval.js";
import { parseDateLiteral } from "../util/dates.js";

export type SemanticResult = {
  typeMap: WeakMap<ExprNode, Type>;
  constValues: Map<string, unknown>;
  classInfos: Map<string, ClassInfo>;
  globalScope: Scope;
};

export class TypeChecker {
  private readonly typeMap = new WeakMap<ExprNode, Type>();
  private readonly constValues = new Map<string, unknown>();
  private readonly classInfos = new Map<string, ClassInfo>();
  private readonly globalScope = new Scope();
  private currentScope = this.globalScope;
  private currentClass: ClassInfo | undefined;
  private currentFunction: FuncDeclNode | ProcDeclNode | undefined;
  private constEnv: ConstEnv = new Map();
  private readonly loopVars = new Set<string>();
  private readonly builtinNames = new Set([
    "LENGTH",
    "RIGHT",
    "MID",
    "LCASE",
    "UCASE",
    "INT",
    "REAL",
    "STRING",
    "CHAR",
    "BOOLEAN",
    "DATE",
    "RAND",
    "ORD",
    "ENUMVALUE",
    "SIZE"
  ]);

  check(program: ProgramNode): SemanticResult {
    this.installBuiltins();
    this.predeclare(program.block.declarations);
    this.visitBlock(program.block);
    return { typeMap: this.typeMap, constValues: this.constValues, classInfos: this.classInfos, globalScope: this.globalScope };
  }

  private installBuiltins(): void {
    this.defineType("INTEGER", INTEGER);
    this.defineType("REAL", REAL);
    this.defineType("BOOLEAN", BOOLEAN);
    this.defineType("CHAR", CHAR);
    this.defineType("STRING", STRING);
    this.defineType("DATE", DATE);

    const builtins: Array<{ name: string; returnType?: Type }> = [
      { name: "LENGTH", returnType: INTEGER },
      { name: "RIGHT", returnType: STRING },
      { name: "MID", returnType: STRING },
      { name: "LCASE", returnType: STRING },
      { name: "UCASE", returnType: STRING },
      { name: "INT", returnType: INTEGER },
      { name: "REAL", returnType: REAL },
      { name: "STRING", returnType: STRING },
      { name: "CHAR", returnType: CHAR },
      { name: "BOOLEAN", returnType: BOOLEAN },
      { name: "DATE", returnType: DATE },
      { name: "RAND", returnType: REAL },
      { name: "ORD", returnType: INTEGER },
      { name: "ENUMVALUE", returnType: undefined },
      { name: "SIZE", returnType: INTEGER }
    ];

    for (const fn of builtins) {
      this.currentScope.define({ kind: "Func", name: fn.name, type: fn.returnType });
    }
  }

  private defineType(name: string, type: Type): void {
    this.currentScope.define({ kind: "Type", name, type });
  }

  private predeclare(decls: DeclarationNode[]): void {
    for (const decl of decls) {
      if (decl.kind === "TypeDecl") {
        const type = this.resolveType(decl.typeSpec, decl.loc.line, true, decl.name);
        this.currentScope.define({ kind: "Type", name: decl.name, type, decl });
      }
      if (decl.kind === "ClassDecl") {
        const classType: ClassType = { kind: "Class", name: decl.name };
        this.currentScope.define({ kind: "Class", name: decl.name, type: classType, decl });
        this.classInfos.set(decl.name, {
          name: decl.name,
          baseName: decl.baseName,
          fields: new Map(),
          methods: new Map(),
          decl
        });
      }
    }

    for (const decl of decls) {
      if (decl.kind === "ProcDecl") {
        this.currentScope.define({ kind: "Proc", name: decl.name, decl });
      }
      if (decl.kind === "FuncDecl") {
        const returnType = this.resolveType(decl.returnType, decl.loc.line);
        this.currentScope.define({ kind: "Func", name: decl.name, type: returnType, decl });
      }
    }

    for (const decl of decls) {
      if (decl.kind === "ClassDecl") {
        this.predeclareClassMembers(decl);
      }
    }
  }

  private predeclareClassMembers(decl: ClassDeclNode): void {
    const classInfo = this.classInfos.get(decl.name);
    if (!classInfo) return;
    for (const member of decl.members) {
      if (member.kind === "VarDecl") {
        const type = this.resolveType(member.typeSpec, member.loc.line);
        classInfo.fields.set(member.name, {
          kind: "Field",
          name: member.name,
          type,
          decl: member,
          access: member.access ?? "PUBLIC",
          ownerClass: decl.name
        });
        continue;
      }
      if (member.kind === "ProcDecl") {
        classInfo.methods.set(member.name, {
          kind: "Method",
          name: member.name,
          decl: member,
          access: member.access ?? "PUBLIC",
          ownerClass: decl.name
        });
        continue;
      }
      if (member.kind === "FuncDecl") {
        const returnType = this.resolveType(member.returnType, member.loc.line);
        classInfo.methods.set(member.name, {
          kind: "Method",
          name: member.name,
          type: returnType,
          decl: member,
          access: member.access ?? "PUBLIC",
          ownerClass: decl.name
        });
        continue;
      }
      if (member.kind === "ConstructorDecl") {
        classInfo.ctor = {
          kind: "Constructor",
          name: member.name,
          decl: member,
          access: member.access ?? "PUBLIC",
          ownerClass: decl.name
        };
      }
    }
  }

  private visitBlock(block: BlockNode): void {
    const previous = this.currentScope;
    this.currentScope = new Scope(previous);
    for (const decl of block.declarations) {
      this.visitDeclaration(decl);
    }
    for (const stmt of block.statements) {
      this.visitStatement(stmt);
    }
    this.currentScope = previous;
  }

  private visitDeclaration(decl: DeclarationNode): void {
    switch (decl.kind) {
      case "VarDecl":
        this.visitVarDecl(decl);
        break;
      case "ConstDecl":
        this.visitConstDecl(decl);
        break;
      case "TypeDecl":
        this.visitTypeDecl(decl);
        break;
      case "ProcDecl":
        this.visitProcDecl(decl);
        break;
      case "FuncDecl":
        this.visitFuncDecl(decl);
        break;
      case "ClassDecl":
        this.visitClassDecl(decl);
        break;
    }
  }

  private visitTypeDecl(decl: TypeDeclNode): void {
    const sym = this.currentScope.lookup(decl.name);
    if (decl.typeSpec.kind === "EnumType" && sym?.type?.kind === "Enum") {
      const enumType = sym.type as EnumType;
      for (let i = 0; i < enumType.members.length; i += 1) {
        const memberName = enumType.members[i];
        this.currentScope.define({ kind: "EnumMember", name: memberName, type: enumType });
        this.constEnv.set(memberName, { kind: "Enum", name: enumType.name, ordinal: i });
      }
    }
  }

  private visitVarDecl(decl: VarDeclNode): void {
    const type = this.resolveType(decl.typeSpec, decl.loc.line);
    this.currentScope.define({ kind: "Var", name: decl.name, type, decl });
  }

  private visitConstDecl(decl: ConstDeclNode): void {
    const type = this.checkExpr(decl.expr);
    const value = evalConst(decl.expr, this.constEnv);
    this.currentScope.define({ kind: "Const", name: decl.name, type, decl });
    this.constValues.set(decl.name, value);
    this.constEnv.set(decl.name, value);
  }

  private visitProcDecl(decl: ProcDeclNode): void {
    const previous = this.currentFunction;
    this.currentFunction = decl;
    const prevScope = this.currentScope;
    this.currentScope = new Scope(prevScope);
    for (const param of decl.params) {
      const type = this.resolveType(param.typeSpec, param.loc.line);
      this.currentScope.define({ kind: "Param", name: param.name, type, decl: param });
    }
    this.visitBlock(decl.block);
    this.currentScope = prevScope;
    this.currentFunction = previous;
  }

  private visitFuncDecl(decl: FuncDeclNode): void {
    const previous = this.currentFunction;
    this.currentFunction = decl;
    const prevScope = this.currentScope;
    this.currentScope = new Scope(prevScope);
    for (const param of decl.params) {
      const type = this.resolveType(param.typeSpec, param.loc.line);
      this.currentScope.define({ kind: "Param", name: param.name, type, decl: param });
    }
    this.visitBlock(decl.block);
    this.currentScope = prevScope;
    this.currentFunction = previous;
  }

  private visitClassDecl(decl: ClassDeclNode): void {
    const classInfo = this.classInfos.get(decl.name);
    if (!classInfo) return;
    const previousClass = this.currentClass;
    this.currentClass = classInfo;
    for (const member of decl.members) {
      if (member.kind === "ProcDecl") {
        this.visitMethod(member, classInfo);
      } else if (member.kind === "FuncDecl") {
        this.visitMethod(member, classInfo);
      } else if (member.kind === "ConstructorDecl") {
        this.visitConstructor(member, classInfo);
      }
    }
    this.currentClass = previousClass;
  }

  private visitMethod(member: ProcDeclNode | FuncDeclNode, classInfo: ClassInfo): void {
    const prevScope = this.currentScope;
    this.currentScope = new Scope(prevScope);
    for (const param of member.params) {
      const type = this.resolveType(param.typeSpec, param.loc.line);
      this.currentScope.define({ kind: "Param", name: param.name, type, decl: param });
    }
    this.visitBlock(member.block);
    this.currentScope = prevScope;
  }

  private visitConstructor(member: ConstructorDeclNode, classInfo: ClassInfo): void {
    const prevScope = this.currentScope;
    this.currentScope = new Scope(prevScope);
    for (const param of member.params) {
      const type = this.resolveType(param.typeSpec, param.loc.line);
      this.currentScope.define({ kind: "Param", name: param.name, type, decl: param });
    }
    this.visitBlock(member.block);
    this.currentScope = prevScope;
  }

  private visitStatement(stmt: StatementNode): void {
    switch (stmt.kind) {
      case "AssignStmt":
        this.visitAssign(stmt);
        break;
      case "IfStmt":
        this.visitIf(stmt);
        break;
      case "CaseStmt":
        this.visitCase(stmt);
        break;
      case "ForStmt":
        this.visitFor(stmt);
        break;
      case "WhileStmt":
        this.visitWhile(stmt);
        break;
      case "RepeatStmt":
        this.visitRepeat(stmt);
        break;
      case "CallStmt":
        this.visitCallStmt(stmt);
        break;
      case "ReturnStmt":
        this.visitReturn(stmt);
        break;
      case "InputStmt":
        this.visitInput(stmt);
        break;
      case "OutputStmt":
        this.visitOutput(stmt);
        break;
      case "OpenFileStmt":
      case "CloseFileStmt":
      case "ReadFileStmt":
      case "WriteFileStmt":
      case "SeekStmt":
      case "GetRecordStmt":
      case "PutRecordStmt":
        this.visitFileStmt(stmt);
        break;
      case "SuperCallStmt":
        this.visitSuperCall(stmt);
        break;
    }
  }

  private visitAssign(stmt: AssignStmtNode): void {
    if (stmt.target.kind === "NameExpr" && this.loopVars.has(stmt.target.name)) {
      throw errorAt("AccessError", stmt.loc.line, "Cannot assign to loop variable.");
    }
    const targetType = this.checkLValue(stmt.target);
    const exprType = this.checkExpr(stmt.expr);
    if (!isAssignable(targetType, exprType)) {
      throw errorAt("TypeError", stmt.loc.line, "Assignment type mismatch.");
    }
  }

  private visitIf(stmt: IfStmtNode): void {
    const condType = this.checkExpr(stmt.condition);
    if (condType.kind !== "Boolean") throw errorAt("TypeError", stmt.loc.line, "IF condition must be BOOLEAN.");
    this.visitBlock(stmt.thenBlock);
    if (stmt.elseBlock) this.visitBlock(stmt.elseBlock);
  }

  private visitCase(stmt: CaseStmtNode): void {
    const exprType = this.checkExpr(stmt.expr);
    if (!(["Integer", "Char", "Enum", "Date"].includes(exprType.kind))) {
      throw errorAt("TypeError", stmt.loc.line, "CASE expression must be INTEGER, CHAR, ENUM, or DATE.");
    }
    const seen = new Set<string>();
    for (const branch of stmt.branches) {
      for (const label of branch.labels) {
        if (label.kind === "CaseValue") {
          const litType = this.literalType(label.value);
          if (!typeEquals(exprType, litType)) {
            throw errorAt("TypeError", label.loc.line, "CASE label type mismatch.");
          }
          const key = this.caseLabelKey(label.value);
          if (seen.has(key)) throw errorAt("SyntaxError", label.loc.line, "Duplicate CASE label.");
          seen.add(key);
        } else {
          const startType = this.literalType(label.start);
          const endType = this.literalType(label.end);
          if (!typeEquals(exprType, startType) || !typeEquals(exprType, endType)) {
            throw errorAt("TypeError", label.loc.line, "CASE range type mismatch.");
          }
        }
      }
      this.visitBlock(branch.block);
    }
    if (stmt.otherwiseBlock) this.visitBlock(stmt.otherwiseBlock);
  }

  private visitFor(stmt: ForStmtNode): void {
    const varSym = this.currentScope.lookup(stmt.name);
    if (!varSym || varSym.kind !== "Var" || varSym.type?.kind !== "Integer") {
      throw errorAt("TypeError", stmt.loc.line, "FOR variable must be INTEGER.");
    }
    const startType = this.checkExpr(stmt.start);
    const endType = this.checkExpr(stmt.end);
    if (startType.kind !== "Integer" || endType.kind !== "Integer") {
      throw errorAt("TypeError", stmt.loc.line, "FOR bounds must be INTEGER.");
    }
    if (stmt.step) {
      const stepType = this.checkExpr(stmt.step);
      if (stepType.kind !== "Integer") throw errorAt("TypeError", stmt.loc.line, "FOR step must be INTEGER.");
    }
    this.loopVars.add(stmt.name);
    this.visitBlock(stmt.block);
    this.loopVars.delete(stmt.name);
  }

  private visitWhile(stmt: WhileStmtNode): void {
    const condType = this.checkExpr(stmt.condition);
    if (condType.kind !== "Boolean") throw errorAt("TypeError", stmt.loc.line, "WHILE condition must be BOOLEAN.");
    this.visitBlock(stmt.block);
  }

  private visitRepeat(stmt: RepeatStmtNode): void {
    this.visitBlock(stmt.block);
    const condType = this.checkExpr(stmt.condition);
    if (condType.kind !== "Boolean") throw errorAt("TypeError", stmt.loc.line, "UNTIL condition must be BOOLEAN.");
  }

  private visitCallStmt(stmt: CallStmtNode): void {
    const callee = this.resolveProcRef(stmt);
    if (!callee || callee.kind !== "Proc" && callee.kind !== "Method") {
      throw errorAt("TypeError", stmt.loc.line, "CALL requires a procedure.");
    }
    this.checkArgs(stmt.args, callee);
  }

  private visitReturn(stmt: ReturnStmtNode): void {
    if (!this.currentFunction) return;
    if (this.currentFunction.kind === "ProcDecl") {
      if (stmt.expr) throw errorAt("TypeError", stmt.loc.line, "RETURN with value in procedure.");
      return;
    }
    if (!stmt.expr) throw errorAt("TypeError", stmt.loc.line, "RETURN requires a value in function.");
    const expected = this.resolveType(this.currentFunction.returnType, stmt.loc.line);
    const actual = this.checkExpr(stmt.expr);
    if (!isAssignable(expected, actual)) {
      throw errorAt("TypeError", stmt.loc.line, "RETURN type mismatch.");
    }
  }

  private visitInput(stmt: InputStmtNode): void {
    for (const target of stmt.targets) {
      this.checkLValue(target);
    }
  }

  private visitOutput(stmt: OutputStmtNode): void {
    for (const expr of stmt.values) {
      this.checkExpr(expr);
    }
  }

  private visitFileStmt(stmt: FileStmtNode): void {
    if (stmt.kind === "OpenFileStmt") {
      const sym = this.currentScope.lookup(stmt.fileName);
      if (!sym || !sym.type || (sym.type.kind !== "TextFile" && sym.type.kind !== "RandomFile")) {
        throw errorAt("TypeError", stmt.loc.line, "OPENFILE requires a file variable.");
      }
      return;
    }
    if (stmt.kind === "CloseFileStmt") {
      const sym = this.currentScope.lookup(stmt.fileName);
      if (!sym || !sym.type || (sym.type.kind !== "TextFile" && sym.type.kind !== "RandomFile")) {
        throw errorAt("TypeError", stmt.loc.line, "CLOSEFILE requires a file variable.");
      }
      return;
    }
    if (stmt.kind === "ReadFileStmt") {
      this.checkLValue(stmt.target);
      return;
    }
    if (stmt.kind === "WriteFileStmt") {
      this.checkExpr(stmt.expr);
      return;
    }
    if (stmt.kind === "SeekStmt") {
      const addrType = this.checkExpr(stmt.address);
      if (addrType.kind !== "Integer") throw errorAt("TypeError", stmt.loc.line, "SEEK address must be INTEGER.");
      return;
    }
    if (stmt.kind === "GetRecordStmt") {
      this.checkLValue(stmt.target);
      return;
    }
    if (stmt.kind === "PutRecordStmt") {
      this.checkExpr(stmt.expr);
      return;
    }
  }

  private visitSuperCall(stmt: SuperCallStmtNode): void {
    if (!this.currentClass) {
      throw errorAt("TypeError", stmt.loc.line, "SUPER can only be used in a class.");
    }
  }

  private checkExpr(expr: ExprNode): Type {
    const cached = this.typeMap.get(expr);
    if (cached) return cached;

    let result: Type;
    switch (expr.kind) {
      case "Literal":
        result = this.literalType(expr);
        break;
      case "NameExpr":
        result = this.nameType(expr);
        break;
      case "BinaryExpr":
        result = this.checkBinary(expr);
        break;
      case "UnaryExpr":
        result = this.checkUnary(expr);
        break;
      case "CallExpr":
        result = this.checkCallExpr(expr);
        break;
      case "IndexExpr":
        result = this.checkIndex(expr);
        break;
      case "FieldExpr":
        result = this.checkField(expr);
        break;
      case "NewExpr":
        result = this.checkNew(expr);
        break;
      case "EOFExpr":
        result = BOOLEAN;
        break;
      case "NullExpr":
        result = { kind: "Null" };
        break;
      case "DerefExpr":
        result = this.checkDeref(expr);
        break;
      default:
        throw errorAt("TypeError", (expr as any).loc?.line ?? 0, "Unknown expression.");
    }

    this.typeMap.set(expr, result);
    return result;
  }

  private checkBinary(expr: any): Type {
    const left = this.checkExpr(expr.left);
    const right = this.checkExpr(expr.right);
    const op = expr.op;

    if (["+", "-", "*"].includes(op)) {
      if (left.kind === "Integer" && right.kind === "Integer") return INTEGER;
      if (left.kind === "Real" && right.kind === "Real") return REAL;
      throw errorAt("TypeError", expr.loc.line, "Arithmetic requires matching numeric types.");
    }
    if (op === "/") {
      if (left.kind === "Integer" && right.kind === "Integer") return REAL;
      if (left.kind === "Real" && right.kind === "Real") return REAL;
      throw errorAt("TypeError", expr.loc.line, "Division requires numeric types.");
    }
    if (op === "DIV" || op === "MOD") {
      if (left.kind === "Integer" && right.kind === "Integer") return INTEGER;
      throw errorAt("TypeError", expr.loc.line, "DIV/MOD require INTEGER.");
    }
    if (op === "&") {
      if ((left.kind === "String" || left.kind === "Char") && (right.kind === "String" || right.kind === "Char")) return STRING;
      throw errorAt("TypeError", expr.loc.line, "Concatenation requires STRING/CHAR.");
    }
    if (["=", "<>", "<", "<=", ">", ">="].includes(op)) {
      if (!typeEquals(left, right)) throw errorAt("TypeError", expr.loc.line, "Comparison types must match.");
      if (left.kind === "Boolean") {
        if (op !== "=" && op !== "<>") throw errorAt("TypeError", expr.loc.line, "BOOLEAN supports only = and <>.");
        return BOOLEAN;
      }
      if (!isComparable(left)) throw errorAt("TypeError", expr.loc.line, "Type not comparable.");
      return BOOLEAN;
    }
    if (op === "IN") {
      if (left.kind === "Enum" && right.kind === "Set" && right.base.name === left.name) return BOOLEAN;
      throw errorAt("TypeError", expr.loc.line, "IN requires ENUM and SET OF ENUM.");
    }
    if (["UNION", "INTERSECT", "DIFF"].includes(op)) {
      if (left.kind === "Set" && right.kind === "Set" && left.base.name === right.base.name) return left;
      throw errorAt("TypeError", expr.loc.line, "Set operators require matching SET types.");
    }
    if (op === "AND" || op === "OR") {
      if (left.kind === "Boolean" && right.kind === "Boolean") return BOOLEAN;
      throw errorAt("TypeError", expr.loc.line, "Boolean operator requires BOOLEAN.");
    }
    throw errorAt("TypeError", expr.loc.line, "Unsupported binary operator.");
  }

  private checkUnary(expr: any): Type {
    const operand = this.checkExpr(expr.expr);
    if (expr.op === "+" || expr.op === "-") {
      if (operand.kind === "Integer") return INTEGER;
      if (operand.kind === "Real") return REAL;
      throw errorAt("TypeError", expr.loc.line, "Unary +/- requires numeric type.");
    }
    if (expr.op === "NOT") {
      if (operand.kind === "Boolean") return BOOLEAN;
      throw errorAt("TypeError", expr.loc.line, "NOT requires BOOLEAN.");
    }
    if (expr.op === "@") {
      if (!this.isLValueExpr(expr.expr)) throw errorAt("TypeError", expr.loc.line, "@ requires lvalue.");
      return { kind: "Pointer", target: operand } as PointerType;
    }
    throw errorAt("TypeError", expr.loc.line, "Invalid unary operator.");
  }

  private checkDeref(expr: DerefExprNode): Type {
    const inner = this.checkExpr(expr.expr);
    if (inner.kind !== "Pointer") throw errorAt("TypeError", expr.loc.line, "^ requires POINTER.");
    return inner.target;
  }

  private checkCallExpr(expr: CallExprNode): Type {
    if (expr.callee.kind === "NameExpr") {
      const sym = this.currentScope.lookup((expr.callee as NameExprNode).name);
      const name = (expr.callee as NameExprNode).name.toUpperCase();
      if (this.builtinNames.has(name)) {
        return this.checkBuiltinCall(name, expr);
      }
      if (!sym) throw errorAt("NameError", expr.loc.line, "Unknown function.");
      if (sym.kind !== "Func" && sym.kind !== "Method") throw errorAt("TypeError", expr.loc.line, "Call requires function.");
      this.checkArgs(expr.args, sym);
      return sym.type ?? INTEGER;
    }
    if (expr.callee.kind === "FieldExpr") {
      const field = expr.callee as FieldExprNode;
      const baseType = this.checkExpr(field.base);
      if (baseType.kind !== "Class") throw errorAt("TypeError", expr.loc.line, "Method call requires CLASS.");
      const classInfo = this.classInfos.get(baseType.name);
      const method = classInfo?.methods.get(field.field);
      if (!method) throw errorAt("NameError", expr.loc.line, "Unknown method.");
      if (method.access === "PRIVATE" && method.ownerClass !== this.currentClass?.name) {
        throw errorAt("AccessError", expr.loc.line, "Private member access.");
      }
      this.checkArgs(expr.args, method);
      return method.type ?? INTEGER;
    }
    throw errorAt("TypeError", expr.loc.line, "Invalid call target.");
  }

  private checkBuiltinCall(name: string, expr: CallExprNode): Type {
    switch (name) {
      case "RAND":
        if (expr.args.length !== 0) throw errorAt("TypeError", expr.loc.line, "RAND takes no arguments.");
        return REAL;
      case "LENGTH":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], STRING);
        return INTEGER;
      case "RIGHT":
        this.requireArgs(expr, 2);
        this.requireType(expr.args[0], STRING);
        this.requireType(expr.args[1], INTEGER);
        return STRING;
      case "MID":
        this.requireArgs(expr, 3);
        this.requireType(expr.args[0], STRING);
        this.requireType(expr.args[1], INTEGER);
        this.requireType(expr.args[2], INTEGER);
        return STRING;
      case "LCASE":
      case "UCASE":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], STRING);
        return STRING;
      case "INT":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], REAL);
        return INTEGER;
      case "REAL":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], INTEGER);
        return REAL;
      case "CHAR":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], INTEGER);
        return CHAR;
      case "BOOLEAN":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], STRING);
        return BOOLEAN;
      case "DATE":
        this.requireArgs(expr, 1);
        this.requireType(expr.args[0], STRING);
        return DATE;
      case "STRING":
        this.requireArgs(expr, 1);
        {
          const t = this.checkExpr(expr.args[0]);
          if (["Array", "Record", "Set", "Pointer", "Class"].includes(t.kind)) {
            throw errorAt("TypeError", expr.loc.line, "STRING cannot convert this type.");
          }
        }
        return STRING;
      case "ORD": {
        this.requireArgs(expr, 1);
        const t = this.checkExpr(expr.args[0]);
        if (t.kind !== "Enum") throw errorAt("TypeError", expr.loc.line, "ORD requires ENUM.");
        return INTEGER;
      }
      case "ENUMVALUE": {
        this.requireArgs(expr, 2);
        if (expr.args[0].kind !== "NameExpr") {
          throw errorAt("TypeError", expr.loc.line, "ENUMVALUE requires enum type name.");
        }
        const enumSym = this.currentScope.lookup((expr.args[0] as NameExprNode).name);
        if (!enumSym || enumSym.kind !== "Type" || enumSym.type?.kind !== "Enum") {
          throw errorAt("TypeError", expr.loc.line, "ENUMVALUE requires enum type name.");
        }
        this.requireType(expr.args[1], INTEGER);
        return enumSym.type;
      }
      case "SIZE": {
        this.requireArgs(expr, 1);
        const t = this.checkExpr(expr.args[0]);
        if (t.kind !== "Set") throw errorAt("TypeError", expr.loc.line, "SIZE requires SET.");
        return INTEGER;
      }
      default:
        throw errorAt("TypeError", expr.loc.line, "Unknown builtin.");
    }
  }

  private requireArgs(expr: CallExprNode, count: number): void {
    if (expr.args.length !== count) {
      throw errorAt("TypeError", expr.loc.line, "Argument count mismatch.");
    }
  }

  private requireType(expr: ExprNode, type: Type): void {
    const t = this.checkExpr(expr);
    if (!typeEquals(t, type)) {
      throw errorAt("TypeError", expr.loc.line, "Argument type mismatch.");
    }
  }

  private checkArgs(args: ExprNode[], sym: Symbol): void {
    const decl = sym.decl as ProcDeclNode | FuncDeclNode | ConstructorDeclNode | undefined;
    const params = decl?.params ?? [];
    if (args.length !== params.length) {
      throw errorAt("TypeError", sym.decl?.loc.line ?? 1, "Argument count mismatch.");
    }
    for (let i = 0; i < args.length; i += 1) {
      const argType = this.checkExpr(args[i]);
      const paramType = this.resolveType(params[i].typeSpec, params[i].loc.line);
      if (!isAssignable(paramType, argType)) {
        throw errorAt("TypeError", args[i].loc.line, "Argument type mismatch.");
      }
      if (params[i].mode === "BYREF" && !this.isLValueExpr(args[i])) {
        throw errorAt("TypeError", args[i].loc.line, "BYREF requires lvalue.");
      }
    }
  }

  private checkIndex(expr: IndexExprNode): Type {
    const baseType = this.checkExpr(expr.base);
    if (baseType.kind !== "Array") throw errorAt("TypeError", expr.loc.line, "Indexing requires ARRAY.");
    for (const idx of expr.indices) {
      const t = this.checkExpr(idx);
      if (t.kind !== "Integer") throw errorAt("TypeError", expr.loc.line, "Array index must be INTEGER.");
    }
    return baseType.elementType;
  }

  private checkField(expr: FieldExprNode): Type {
    const baseType = this.checkExpr(expr.base);
    if (baseType.kind === "Record") {
      const fieldType = baseType.fields.get(expr.field);
      if (!fieldType) throw errorAt("NameError", expr.loc.line, "Unknown record field.");
      return fieldType;
    }
    if (baseType.kind === "Class") {
      const classInfo = this.classInfos.get(baseType.name);
      const field = classInfo?.fields.get(expr.field);
      if (!field?.type) throw errorAt("NameError", expr.loc.line, "Unknown class field.");
      if (field.access === "PRIVATE" && field.ownerClass !== this.currentClass?.name) {
        throw errorAt("AccessError", expr.loc.line, "Private member access.");
      }
      return field.type;
    }
    throw errorAt("TypeError", expr.loc.line, "Field access requires RECORD or CLASS.");
  }

  private checkNew(expr: NewExprNode): Type {
    if (expr.typeName) {
      const classSym = this.currentScope.lookup(expr.typeName);
      if (!classSym || classSym.kind !== "Class") throw errorAt("TypeError", expr.loc.line, "NEW requires class.");
      const classInfo = this.classInfos.get(expr.typeName);
      const ctor = classInfo?.ctor?.decl as ConstructorDeclNode | undefined;
      if (ctor && classInfo?.ctor) {
        this.checkArgs(expr.args, classInfo.ctor as any);
      } else if (expr.args.length > 0) {
        throw errorAt("TypeError", expr.loc.line, "No constructor defined for class.");
      }
      return classSym.type as ClassType;
    }
    if (expr.typeSpec) {
      const type = this.resolveType(expr.typeSpec, expr.loc.line);
      return { kind: "Pointer", target: type } as PointerType;
    }
    throw errorAt("TypeError", expr.loc.line, "Invalid NEW.");
  }

  private checkLValue(expr: LValueNode): Type {
    if (expr.kind === "NameExpr") {
      const sym = this.currentScope.lookup(expr.name);
      if (sym) {
        if (sym.kind === "Const") throw errorAt("AccessError", expr.loc.line, "Cannot assign to constant.");
        if (!sym.type) throw errorAt("TypeError", expr.loc.line, "Invalid lvalue.");
        return sym.type;
      }
      if (this.currentClass) {
        const field = this.currentClass.fields.get(expr.name);
        if (field?.type) {
          if (field.access === "PRIVATE" && field.ownerClass !== this.currentClass?.name) {
            throw errorAt("AccessError", expr.loc.line, "Private member access.");
          }
          return field.type;
        }
      }
      throw errorAt("NameError", expr.loc.line, "Unknown identifier.");
    }
    if (expr.kind === "IndexExpr") {
      return this.checkIndex(expr);
    }
    if (expr.kind === "FieldExpr") {
      return this.checkField(expr);
    }
    if (expr.kind === "DerefExpr") {
      return this.checkDeref(expr);
    }
    throw errorAt("TypeError", (expr as any).loc?.line ?? 0, "Invalid lvalue.");
  }

  private nameType(expr: NameExprNode): Type {
    const sym = this.currentScope.lookup(expr.name);
    if (sym?.type) return sym.type;
    if (this.currentClass) {
      const field = this.currentClass.fields.get(expr.name);
      if (field?.type) return field.type;
    }
    throw errorAt("NameError", expr.loc.line, "Unknown identifier.");
  }

  private resolveProcRef(stmt: CallStmtNode): Symbol | undefined {
    const parts = stmt.callee.parts;
    if (parts.length === 1) {
      return this.currentScope.lookup(parts[0]);
    }
    const baseSym = this.currentScope.lookup(parts[0]);
    if (!baseSym || baseSym.type?.kind !== "Class") {
      throw errorAt("TypeError", stmt.loc.line, "Method call requires object.");
    }
    const classInfo = this.classInfos.get(baseSym.type.name);
    const method = classInfo?.methods.get(parts[1]);
    if (method?.access === "PRIVATE" && method.ownerClass !== this.currentClass?.name) {
      throw errorAt("AccessError", stmt.loc.line, "Private member access.");
    }
    return method;
  }

  private literalType(lit: LiteralNode): Type {
    switch (lit.literalType) {
      case "Integer":
        return INTEGER;
      case "Real":
        return REAL;
      case "Boolean":
        return BOOLEAN;
      case "Char":
        return CHAR;
      case "String":
        return STRING;
      case "Date":
        parseDateLiteral(lit.value as string, lit.loc.line);
        return DATE;
      default:
        return INTEGER;
    }
  }

  private resolveType(typeNode: TypeNode, line: number, allowNamed = false, nameOverride?: string): Type {
    switch (typeNode.kind) {
      case "BasicType":
        return this.resolveBasic(typeNode);
      case "ArrayType":
        return {
          kind: "Array",
          bounds: typeNode.bounds.map((b) => ({ low: b.low, high: b.high })),
          elementType: this.resolveType(typeNode.elementType, line)
        } as ArrayType;
      case "RecordType": {
        const fields = new Map<string, Type>();
        for (const field of typeNode.fields) {
          fields.set(field.name, this.resolveType(field.typeSpec, field.loc.line));
        }
        return { kind: "Record", fields } as RecordType;
      }
      case "EnumType": {
        return { kind: "Enum", name: nameOverride ?? "<anon>", members: typeNode.members } as EnumType;
      }
      case "SetType": {
        const baseSym = this.currentScope.lookup(typeNode.baseName);
        if (!baseSym || baseSym.type?.kind !== "Enum") {
          throw errorAt("TypeError", line, "SET OF requires enum type.");
        }
        return { kind: "Set", base: baseSym.type } as SetType;
      }
      case "PointerType":
        return { kind: "Pointer", target: this.resolveType(typeNode.target, line) } as PointerType;
      case "TextFileType":
        return { kind: "TextFile" } as TextFileType;
      case "RandomFileType": {
        const recordSym = this.currentScope.lookup(typeNode.recordName);
        if (!recordSym || recordSym.type?.kind !== "Record") {
          throw errorAt("TypeError", line, "RANDOMFILE requires RECORD type.");
        }
        this.ensureRandomRecordCompatible(recordSym.type, line);
        return { kind: "RandomFile", record: recordSym.type } as RandomFileType;
      }
      case "NamedType": {
        const sym = this.currentScope.lookup(typeNode.name);
        if (!sym || !sym.type || (sym.kind !== "Type" && sym.kind !== "Class")) {
          throw errorAt("NameError", line, `Unknown type ${typeNode.name}.`);
        }
        return sym.type;
      }
    }
  }

  private resolveBasic(node: BasicTypeNode): Type {
    switch (node.name) {
      case "INTEGER":
        return INTEGER;
      case "REAL":
        return REAL;
      case "BOOLEAN":
        return BOOLEAN;
      case "CHAR":
        return CHAR;
      case "STRING":
        return STRING;
      case "DATE":
        return DATE;
    }
  }

  private ensureRandomRecordCompatible(record: RecordType, line: number): void {
    const checkType = (t: Type): void => {
      if (t.kind === "String" || t.kind === "Set" || t.kind === "Pointer" || t.kind === "Class") {
        throw errorAt("TypeError", line, "RANDOMFILE record cannot contain STRING/SET/POINTER/CLASS.");
      }
      if (t.kind === "Array") return checkType(t.elementType);
      if (t.kind === "Record") {
        for (const field of t.fields.values()) checkType(field);
        return;
      }
    };
    for (const field of record.fields.values()) checkType(field);
  }

  private caseLabelKey(lit: LiteralNode): string {
    return `${lit.literalType}:${String(lit.value)}`;
  }

  private isLValueExpr(expr: ExprNode): boolean {
    return expr.kind === "NameExpr" || expr.kind === "IndexExpr" || expr.kind === "FieldExpr" || expr.kind === "DerefExpr";
  }
}
