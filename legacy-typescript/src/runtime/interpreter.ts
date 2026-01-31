import { ProgramNode, BlockNode, DeclarationNode, VarDeclNode, ConstDeclNode, ProcDeclNode, FuncDeclNode, ClassDeclNode, StatementNode, AssignStmtNode, IfStmtNode, CaseStmtNode, ForStmtNode, WhileStmtNode, RepeatStmtNode, CallStmtNode, ReturnStmtNode, InputStmtNode, OutputStmtNode, FileStmtNode, SuperCallStmtNode, ExprNode, CallExprNode, FieldExprNode, IndexExprNode, NameExprNode, NewExprNode, DerefExprNode, LValueNode, TypeNode, LiteralNode } from "../frontend/ast.js";
import { errorAt, PrescribeError } from "../diagnostics/errors.js";
import { SemanticResult } from "../semantics/type_checker.js";
import { Type, INTEGER, REAL, BOOLEAN, CHAR, STRING, DATE, ArrayType, RecordType, EnumType, SetType, PointerType, ClassType, RandomFileType, typeEquals } from "../semantics/types.js";
import { Store, CellLike, Cell } from "./store.js";
import { RuntimeValue, makeValue, TextFileHandle, RandomFileHandle } from "./values.js";
import { defaultValue } from "./defaults.js";
import { StdLib, toOutputString } from "./stdlib.js";
import { checkInt, checkReal, divEuclid } from "../util/math.js";
import { parseDateLiteral, DateValue, compareDate } from "../util/dates.js";
import { openTextFile, closeTextFile, readTextLine, writeTextLine, eofText, openRandomFile, closeRandomFile, seekRandom, getRecord, putRecord, sizeOfType } from "./file_io.js";

export class Interpreter {
  private readonly program: ProgramNode;
  private readonly sema: SemanticResult;
  private readonly store = new Store();
  private readonly stdlib = new StdLib();
  private readonly inputTokens: string[];
  private inputIndex = 0;
  private readonly output: string[] = [];
  private readonly proxyCache = new Map<string, ProxyCell>();
  private readonly objectIds = new WeakMap<object, number>();
  private nextObjectId = 1;

  private readonly procScopes: RuntimeScope[] = [];
  private currentScope: RuntimeScope;
  private currentClass?: string;
  private currentThis?: { className: string; fields: Map<string, CellLike> };
  private readonly loopReadOnly = new Set<string>();

  constructor(program: ProgramNode, sema: SemanticResult, input: string) {
    this.program = program;
    this.sema = sema;
    this.inputTokens = input.trim().length === 0 ? [] : input.trim().split(/\s+/);
    this.currentScope = new RuntimeScope(undefined);
    this.installBuiltinTypes();
  }

  run(): string {
    this.executeBlock(this.program.block, this.currentScope);
    return this.output.join("");
  }

  private installBuiltinTypes(): void {
    this.currentScope.defineType("INTEGER", INTEGER);
    this.currentScope.defineType("REAL", REAL);
    this.currentScope.defineType("BOOLEAN", BOOLEAN);
    this.currentScope.defineType("CHAR", CHAR);
    this.currentScope.defineType("STRING", STRING);
    this.currentScope.defineType("DATE", DATE);
  }

  private executeBlock(block: BlockNode, scope: RuntimeScope): void {
    const prev = this.currentScope;
    this.currentScope = scope;
    for (const decl of block.declarations) {
      this.executeDeclaration(decl, scope);
    }
    for (const stmt of block.statements) {
      this.executeStatement(stmt);
    }
    this.currentScope = prev;
  }

  private executeDeclaration(decl: DeclarationNode, scope: RuntimeScope): void {
    switch (decl.kind) {
      case "VarDecl": {
        const type = this.resolveType(decl.typeSpec);
        const cell = new Cell(type, defaultValue(type));
        scope.defineVar(decl.name, cell);
        break;
      }
      case "ConstDecl": {
        const value = this.evalExpr(decl.expr);
        scope.defineConst(decl.name, value);
        break;
      }
      case "TypeDecl":
        if (decl.typeSpec.kind === "EnumType") {
          const enumType = { kind: "Enum", name: decl.name, members: decl.typeSpec.members } as EnumType;
          scope.defineType(decl.name, enumType);
          decl.typeSpec.members.forEach((member, idx) => {
            scope.defineConst(member, makeValue(enumType, idx));
          });
        } else {
          scope.defineType(decl.name, this.resolveType(decl.typeSpec));
        }
        break;
      case "ProcDecl":
        scope.defineProc(decl.name, decl);
        break;
      case "FuncDecl":
        scope.defineFunc(decl.name, decl);
        break;
      case "ClassDecl":
        scope.defineClass(decl.name, decl);
        scope.defineType(decl.name, { kind: "Class", name: decl.name } as ClassType);
        break;
    }
  }

  private executeStatement(stmt: StatementNode): void {
    switch (stmt.kind) {
      case "AssignStmt":
        this.execAssign(stmt);
        return;
      case "IfStmt":
        this.execIf(stmt);
        return;
      case "CaseStmt":
        this.execCase(stmt);
        return;
      case "ForStmt":
        this.execFor(stmt);
        return;
      case "WhileStmt":
        this.execWhile(stmt);
        return;
      case "RepeatStmt":
        this.execRepeat(stmt);
        return;
      case "CallStmt":
        this.execCallStmt(stmt);
        return;
      case "ReturnStmt":
        throw new ReturnSignal(stmt.expr ? this.evalExpr(stmt.expr) : undefined);
      case "InputStmt":
        this.execInput(stmt);
        return;
      case "OutputStmt":
        this.execOutput(stmt);
        return;
      case "OpenFileStmt":
      case "CloseFileStmt":
      case "ReadFileStmt":
      case "WriteFileStmt":
      case "SeekStmt":
      case "GetRecordStmt":
      case "PutRecordStmt":
        this.execFileStmt(stmt);
        return;
      case "SuperCallStmt":
        this.execSuperCall(stmt);
        return;
    }
  }

  private execAssign(stmt: AssignStmtNode): void {
    if (stmt.target.kind === "NameExpr" && this.loopReadOnly.has(stmt.target.name)) {
      throw errorAt("AccessError", stmt.loc.line, "Cannot assign to loop variable.");
    }
    const ref = this.getLValue(stmt.target);
    const value = this.evalExpr(stmt.expr);
    if (value.type.kind === "Null" && (ref.type.kind === "Pointer" || ref.type.kind === "Class")) {
      ref.set(makeValue(ref.type, null));
      return;
    }
    if (!typeEquals(ref.type, value.type)) {
      throw errorAt("TypeError", stmt.loc.line, "Assignment type mismatch.");
    }
    ref.set(this.cloneValue(value));
  }

  private execIf(stmt: IfStmtNode): void {
    const cond = this.evalExpr(stmt.condition);
    if (cond.type.kind !== "Boolean") throw errorAt("TypeError", stmt.loc.line, "IF condition must be BOOLEAN.");
    if (cond.data as boolean) {
      this.executeBlock(stmt.thenBlock, new RuntimeScope(this.currentScope));
    } else if (stmt.elseBlock) {
      this.executeBlock(stmt.elseBlock, new RuntimeScope(this.currentScope));
    }
  }

  private execCase(stmt: CaseStmtNode): void {
    const expr = this.evalExpr(stmt.expr);
    for (const branch of stmt.branches) {
      for (const label of branch.labels) {
        if (label.kind === "CaseValue") {
          const litVal = this.literalValue(label.value);
          if (this.compareValues(expr, litVal) === 0) {
            this.executeBlock(branch.block, new RuntimeScope(this.currentScope));
            return;
          }
        } else {
          const start = this.literalValue(label.start);
          const end = this.literalValue(label.end);
          const cmpStart = this.compareValues(expr, start);
          const cmpEnd = this.compareValues(expr, end);
          if (cmpStart >= 0 && cmpEnd <= 0) {
            this.executeBlock(branch.block, new RuntimeScope(this.currentScope));
            return;
          }
        }
      }
    }
    if (stmt.otherwiseBlock) {
      this.executeBlock(stmt.otherwiseBlock, new RuntimeScope(this.currentScope));
    }
  }

  private execFor(stmt: ForStmtNode): void {
    const loopCell = this.currentScope.lookupVar(stmt.name);
    if (!loopCell) throw errorAt("NameError", stmt.loc.line, "Unknown loop variable.");
    const start = this.evalExpr(stmt.start);
    const end = this.evalExpr(stmt.end);
    const step = stmt.step ? this.evalExpr(stmt.step) : makeValue(INTEGER, 1);
    if (start.type.kind !== "Integer" || end.type.kind !== "Integer" || step.type.kind !== "Integer") {
      throw errorAt("TypeError", stmt.loc.line, "FOR requires INTEGER values.");
    }
    const s = start.data as number;
    const e = end.data as number;
    const st = step.data as number;
    if (st === 0) throw errorAt("RuntimeError", stmt.loc.line, "FOR step cannot be 0.");

    this.loopReadOnly.add(stmt.name);
    const condition = (i: number) => (st > 0 ? i <= e : i >= e);
    for (let i = s; condition(i); i += st) {
      loopCell.set(makeValue(INTEGER, checkInt(i, stmt.loc.line)));
      this.executeBlock(stmt.block, new RuntimeScope(this.currentScope));
    }
    this.loopReadOnly.delete(stmt.name);
  }

  private execWhile(stmt: WhileStmtNode): void {
    while (true) {
      const cond = this.evalExpr(stmt.condition);
      if (cond.type.kind !== "Boolean") throw errorAt("TypeError", stmt.loc.line, "WHILE condition must be BOOLEAN.");
      if (!(cond.data as boolean)) break;
      this.executeBlock(stmt.block, new RuntimeScope(this.currentScope));
    }
  }

  private execRepeat(stmt: RepeatStmtNode): void {
    while (true) {
      this.executeBlock(stmt.block, new RuntimeScope(this.currentScope));
      const cond = this.evalExpr(stmt.condition);
      if (cond.type.kind !== "Boolean") throw errorAt("TypeError", stmt.loc.line, "UNTIL condition must be BOOLEAN.");
      if (cond.data as boolean) break;
    }
  }

  private execCallStmt(stmt: CallStmtNode): void {
    const [name, method] = [stmt.callee.parts[0], stmt.callee.parts[1]];
    if (stmt.callee.parts.length === 1) {
      const proc = this.currentScope.lookupProc(name);
      if (!proc) throw errorAt("TypeError", stmt.loc.line, "CALL requires procedure.");
      this.callProcedure(proc, stmt.args, undefined);
      return;
    }
    const objCell = this.currentScope.lookupVar(name);
    if (!objCell) throw errorAt("NameError", stmt.loc.line, "Unknown object.");
    const obj = objCell.get();
    if (obj.type.kind !== "Class" || obj.data === null) throw errorAt("RuntimeError", stmt.loc.line, "Null object.");
    const objRef = this.store.getClassObject(obj.data as number);
    if (!objRef) throw errorAt("RuntimeError", stmt.loc.line, "Invalid object reference.");
    const methodDecl = this.resolveMethod(objRef.className, method);
    if (!methodDecl || methodDecl.kind !== "ProcDecl") throw errorAt("TypeError", stmt.loc.line, "CALL requires procedure.");
    this.callProcedure(methodDecl, stmt.args, objRef);
  }

  private execInput(stmt: InputStmtNode): void {
    for (const target of stmt.targets) {
      const cell = this.getLValue(target);
      const token = this.nextInputToken(stmt.loc.line);
      const value = this.parseInputToken(token, cell.type, stmt.loc.line);
      cell.set(value);
    }
  }

  private execOutput(stmt: OutputStmtNode): void {
    let text = "";
    for (const expr of stmt.values) {
      const value = this.evalExpr(expr);
      text += toOutputString(value, expr.loc.line);
    }
    this.output.push(text + "\n");
  }

  private execFileStmt(stmt: FileStmtNode): void {
    switch (stmt.kind) {
      case "OpenFileStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell) throw errorAt("NameError", stmt.loc.line, "Unknown file variable.");
        if (cell.type.kind === "TextFile") {
          const handle = openTextFile(stmt.path, stmt.mode, stmt.loc.line);
          cell.set(makeValue(cell.type, handle));
          return;
        }
        if (cell.type.kind === "RandomFile") {
          if (stmt.mode.toUpperCase() !== "RANDOM") throw errorAt("FileError", stmt.loc.line, "Invalid random file mode.");
          const handle = openRandomFile(stmt.path);
          cell.set(makeValue(cell.type, handle));
          return;
        }
        throw errorAt("TypeError", stmt.loc.line, "OPENFILE requires file type.");
      }
      case "CloseFileStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell) throw errorAt("NameError", stmt.loc.line, "Unknown file variable.");
        if (cell.type.kind === "TextFile") {
          const handle = cell.get().data as TextFileHandle | null;
          if (handle) closeTextFile(handle);
          return;
        }
        if (cell.type.kind === "RandomFile") {
          const handle = cell.get().data as RandomFileHandle | null;
          if (handle) closeRandomFile(handle);
          return;
        }
        throw errorAt("TypeError", stmt.loc.line, "CLOSEFILE requires file type.");
      }
      case "ReadFileStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell || cell.type.kind !== "TextFile") throw errorAt("TypeError", stmt.loc.line, "READFILE requires TEXTFILE.");
        const handle = cell.get().data as TextFileHandle | null;
        if (!handle) throw errorAt("FileError", stmt.loc.line, "File not open.");
        const lineText = readTextLine(handle, stmt.loc.line);
        const target = this.getLValue(stmt.target);
        const value = this.parseInputToken(lineText, target.type, stmt.loc.line);
        target.set(value);
        return;
      }
      case "WriteFileStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell || cell.type.kind !== "TextFile") throw errorAt("TypeError", stmt.loc.line, "WRITEFILE requires TEXTFILE.");
        const handle = cell.get().data as TextFileHandle | null;
        if (!handle) throw errorAt("FileError", stmt.loc.line, "File not open.");
        const value = this.evalExpr(stmt.expr);
        const text = toOutputString(value, stmt.loc.line);
        writeTextLine(handle, text, stmt.loc.line);
        return;
      }
      case "SeekStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell || cell.type.kind !== "RandomFile") throw errorAt("TypeError", stmt.loc.line, "SEEK requires RANDOMFILE.");
        const handle = cell.get().data as RandomFileHandle | null;
        if (!handle) throw errorAt("FileError", stmt.loc.line, "File not open.");
        const addr = this.evalExpr(stmt.address);
        if (addr.type.kind !== "Integer") throw errorAt("TypeError", stmt.loc.line, "SEEK address must be INTEGER.");
        seekRandom(handle, addr.data as number, stmt.loc.line);
        return;
      }
      case "GetRecordStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell || cell.type.kind !== "RandomFile") throw errorAt("TypeError", stmt.loc.line, "GETRECORD requires RANDOMFILE.");
        const handle = cell.get().data as RandomFileHandle | null;
        if (!handle) throw errorAt("FileError", stmt.loc.line, "File not open.");
        const target = this.getLValue(stmt.target);
        const value = getRecord(handle, (cell.type as RandomFileType).record, stmt.loc.line);
        target.set(value);
        return;
      }
      case "PutRecordStmt": {
        const cell = this.currentScope.lookupVar(stmt.fileName);
        if (!cell || cell.type.kind !== "RandomFile") throw errorAt("TypeError", stmt.loc.line, "PUTRECORD requires RANDOMFILE.");
        const handle = cell.get().data as RandomFileHandle | null;
        if (!handle) throw errorAt("FileError", stmt.loc.line, "File not open.");
        const value = this.evalExpr(stmt.expr);
        putRecord(handle, (cell.type as RandomFileType).record, value, stmt.loc.line);
        return;
      }
    }
  }

  private execSuperCall(stmt: SuperCallStmtNode): void {
    if (!this.currentThis) throw errorAt("TypeError", stmt.loc.line, "SUPER outside class.");
    const baseName = this.sema.classInfos.get(this.currentThis.className)?.baseName;
    if (!baseName) throw errorAt("TypeError", stmt.loc.line, "No base class.");
    if (!stmt.methodName) {
      const ctor = this.resolveConstructor(baseName);
      if (!ctor) return;
      this.callConstructor(ctor, stmt.args, this.currentThis);
      return;
    }
    const methodDecl = this.resolveMethod(baseName, stmt.methodName);
    if (!methodDecl) throw errorAt("NameError", stmt.loc.line, "Unknown super method.");
    if (methodDecl.kind !== "ProcDecl") throw errorAt("TypeError", stmt.loc.line, "SUPER call requires procedure.");
    this.callProcedure(methodDecl, stmt.args, this.currentThis);
  }

  private evalExpr(expr: ExprNode): RuntimeValue {
    switch (expr.kind) {
      case "Literal":
        return this.literalValue(expr);
      case "NameExpr":
        return this.resolveName(expr);
      case "BinaryExpr":
        return this.evalBinary(expr);
      case "UnaryExpr":
        return this.evalUnary(expr);
      case "CallExpr":
        return this.evalCall(expr);
      case "IndexExpr":
        return this.evalIndex(expr);
      case "FieldExpr":
        return this.evalField(expr);
      case "NewExpr":
        return this.evalNew(expr);
      case "EOFExpr":
        return this.evalEOF(expr);
      case "NullExpr":
        return makeValue({ kind: "Null" }, null);
      case "DerefExpr":
        return this.evalDeref(expr);
      default:
        throw errorAt("RuntimeError", (expr as any).loc?.line ?? 0, "Unknown expression.");
    }
  }

  private evalBinary(expr: any): RuntimeValue {
    const left = this.evalExpr(expr.left);
    const right = this.evalExpr(expr.right);
    const op = expr.op;

    if (op === "+" || op === "-" || op === "*") {
      if (left.type.kind === "Integer" && right.type.kind === "Integer") {
        const l = left.data as number;
        const r = right.data as number;
        const res = op === "+" ? l + r : op === "-" ? l - r : l * r;
        return makeValue(INTEGER, checkInt(res, expr.loc.line));
      }
      if (left.type.kind === "Real" && right.type.kind === "Real") {
        const l = left.data as number;
        const r = right.data as number;
        const res = op === "+" ? l + r : op === "-" ? l - r : l * r;
        return makeValue(REAL, checkReal(res, expr.loc.line));
      }
      throw errorAt("TypeError", expr.loc.line, "Arithmetic requires matching numeric types.");
    }

    if (op === "/") {
      if (left.type.kind === "Integer" && right.type.kind === "Integer") {
        if (right.data === 0) throw errorAt("RuntimeError", expr.loc.line, "Division by zero.");
        return makeValue(REAL, checkReal((left.data as number) / (right.data as number), expr.loc.line));
      }
      if (left.type.kind === "Real" && right.type.kind === "Real") {
        if (right.data === 0) throw errorAt("RuntimeError", expr.loc.line, "Division by zero.");
        return makeValue(REAL, checkReal((left.data as number) / (right.data as number), expr.loc.line));
      }
      throw errorAt("TypeError", expr.loc.line, "Division requires numeric types.");
    }

    if (op === "DIV" || op === "MOD") {
      if (left.type.kind === "Integer" && right.type.kind === "Integer") {
        const { q, r } = divEuclid(left.data as number, right.data as number, expr.loc.line);
        return makeValue(INTEGER, op === "DIV" ? q : r);
      }
      throw errorAt("TypeError", expr.loc.line, "DIV/MOD require INTEGER.");
    }

    if (op === "&") {
      if ((left.type.kind === "String" || left.type.kind === "Char") && (right.type.kind === "String" || right.type.kind === "Char")) {
        return makeValue(STRING, `${left.data as string}${right.data as string}`);
      }
      throw errorAt("TypeError", expr.loc.line, "Concatenation requires STRING/CHAR.");
    }

    if (op === "AND" || op === "OR") {
      if (left.type.kind !== "Boolean" || right.type.kind !== "Boolean") throw errorAt("TypeError", expr.loc.line, "Boolean op requires BOOLEAN.");
      const result = op === "AND" ? (left.data as boolean) && (right.data as boolean) : (left.data as boolean) || (right.data as boolean);
      return makeValue(BOOLEAN, result);
    }

    if (op === "IN") {
      if (left.type.kind !== "Enum" || right.type.kind !== "Set") throw errorAt("TypeError", expr.loc.line, "IN requires ENUM and SET.");
      const set = right.data as Set<number>;
      return makeValue(BOOLEAN, set.has(left.data as number));
    }

    if (op === "UNION" || op === "INTERSECT" || op === "DIFF") {
      if (left.type.kind !== "Set" || right.type.kind !== "Set") throw errorAt("TypeError", expr.loc.line, "Set op requires SET.");
      const lset = left.data as Set<number>;
      const rset = right.data as Set<number>;
      const result = new Set<number>();
      if (op === "UNION") {
        for (const v of lset) result.add(v);
        for (const v of rset) result.add(v);
      } else if (op === "INTERSECT") {
        for (const v of lset) if (rset.has(v)) result.add(v);
      } else {
        for (const v of lset) if (!rset.has(v)) result.add(v);
      }
      return makeValue(left.type, result);
    }

    if (["=", "<>", "<", "<=", ">", ">="].includes(op)) {
      const cmp = this.compareValues(left, right);
      let res = false;
      switch (op) {
        case "=":
          res = cmp === 0;
          break;
        case "<>":
          res = cmp !== 0;
          break;
        case "<":
          res = cmp < 0;
          break;
        case "<=":
          res = cmp <= 0;
          break;
        case ">":
          res = cmp > 0;
          break;
        case ">=":
          res = cmp >= 0;
          break;
      }
      return makeValue(BOOLEAN, res);
    }

    throw errorAt("RuntimeError", expr.loc.line, "Unsupported operator.");
  }

  private evalUnary(expr: any): RuntimeValue {
    const value = this.evalExpr(expr.expr);
    if (expr.op === "+") return value;
    if (expr.op === "-") {
      if (value.type.kind === "Integer") return makeValue(INTEGER, checkInt(-(value.data as number), expr.loc.line));
      if (value.type.kind === "Real") return makeValue(REAL, checkReal(-(value.data as number), expr.loc.line));
      throw errorAt("TypeError", expr.loc.line, "Unary - requires numeric type.");
    }
    if (expr.op === "NOT") {
      if (value.type.kind !== "Boolean") throw errorAt("TypeError", expr.loc.line, "NOT requires BOOLEAN.");
      return makeValue(BOOLEAN, !(value.data as boolean));
    }
    if (expr.op === "@") {
      const ref = this.getLValue(expr.expr as LValueNode);
      const addr = this.store.addrOf(ref);
      return makeValue({ kind: "Pointer", target: ref.type } as PointerType, addr);
    }
    throw errorAt("RuntimeError", expr.loc.line, "Unsupported unary operator.");
  }

  private evalCall(expr: CallExprNode): RuntimeValue {
    if (expr.callee.kind === "NameExpr") {
      const name = (expr.callee as NameExprNode).name.toUpperCase();
      if (this.isBuiltin(name)) {
        return this.callBuiltin(name, expr);
      }
      const func = this.currentScope.lookupFunc((expr.callee as NameExprNode).name);
      if (!func) throw errorAt("TypeError", expr.loc.line, "Call requires function.");
      return this.callFunction(func, expr.args, undefined);
    }
    if (expr.callee.kind === "FieldExpr") {
      const field = expr.callee as FieldExprNode;
      const base = this.evalExpr(field.base);
      if (base.type.kind !== "Class" || base.data === null) throw errorAt("RuntimeError", expr.loc.line, "Null object.");
      const objRef = this.store.getClassObject(base.data as number);
      if (!objRef) throw errorAt("RuntimeError", expr.loc.line, "Invalid object reference.");
      const method = this.resolveMethod(objRef.className, field.field);
      if (!method) throw errorAt("NameError", expr.loc.line, "Unknown method.");
      if (method.kind !== "FuncDecl") throw errorAt("TypeError", expr.loc.line, "Call requires function.");
      return this.callFunction(method, expr.args, objRef);
    }
    throw errorAt("TypeError", expr.loc.line, "Invalid call target.");
  }

  private evalIndex(expr: IndexExprNode): RuntimeValue {
    const ref = this.getLValue(expr);
    return ref.get();
  }

  private evalField(expr: FieldExprNode): RuntimeValue {
    const ref = this.getLValue(expr);
    return ref.get();
  }

  private evalNew(expr: NewExprNode): RuntimeValue {
    if (expr.typeName) {
      const className = expr.typeName;
      const classDecl = this.currentScope.lookupClass(className);
      if (!classDecl) throw errorAt("TypeError", expr.loc.line, "NEW requires class.");
      const objId = this.createClassObject(className);
      const objRef = this.store.getClassObject(objId);
      if (!objRef) throw errorAt("RuntimeError", expr.loc.line, "Failed to allocate object.");
      const ctor = this.resolveConstructor(className);
      if (ctor) {
        this.callConstructor(ctor, expr.args, objRef);
      }
      return makeValue({ kind: "Class", name: className } as ClassType, objId);
    }
    if (!expr.typeSpec) throw errorAt("TypeError", expr.loc.line, "Invalid NEW.");
    const targetType = this.resolveType(expr.typeSpec);
    const addr = this.store.allocPointerCell(targetType);
    return makeValue({ kind: "Pointer", target: targetType } as PointerType, addr);
  }

  private evalEOF(expr: any): RuntimeValue {
    const cell = this.currentScope.lookupVar(expr.fileName);
    if (!cell) throw errorAt("NameError", expr.loc.line, "Unknown file.");
    if (cell.type.kind === "TextFile") {
      const handle = cell.get().data as TextFileHandle | null;
      if (!handle) return makeValue(BOOLEAN, true);
      return makeValue(BOOLEAN, eofText(handle));
    }
    if (cell.type.kind === "RandomFile") {
      const handle = cell.get().data as RandomFileHandle | null;
      if (!handle) return makeValue(BOOLEAN, true);
      const size = sizeOfType((cell.type as RandomFileType).record, expr.loc.line);
      const maxRecords = Math.floor(handle.buffer.length / size);
      return makeValue(BOOLEAN, handle.position > maxRecords);
    }
    throw errorAt("TypeError", expr.loc.line, "EOF requires file.");
  }

  private evalDeref(expr: DerefExprNode): RuntimeValue {
    const pointer = this.evalExpr(expr.expr);
    if (pointer.type.kind !== "Pointer") throw errorAt("TypeError", expr.loc.line, "^ requires POINTER.");
    if (pointer.data === null) throw errorAt("RuntimeError", expr.loc.line, "Null dereference.");
    const cell = this.store.deref(pointer.data as number);
    if (!cell) throw errorAt("RuntimeError", expr.loc.line, "Invalid pointer.");
    return cell.get();
  }

  private resolveName(expr: NameExprNode): RuntimeValue {
    const cell = this.currentScope.lookupVar(expr.name);
    if (cell) return cell.get();
    const konst = this.currentScope.lookupConst(expr.name);
    if (konst) return konst;
    if (this.currentThis) {
      const field = this.currentThis.fields.get(expr.name);
      if (field) return field.get();
    }
    throw errorAt("NameError", expr.loc.line, "Unknown identifier.");
  }

  private getLValue(expr: LValueNode): CellLike {
    if (expr.kind === "NameExpr") {
      const cell = this.currentScope.lookupVar(expr.name);
      if (cell) return cell;
      if (this.currentThis) {
        const field = this.currentThis.fields.get(expr.name);
        if (field) return field;
      }
      throw errorAt("NameError", expr.loc.line, "Unknown identifier.");
    }
    if (expr.kind === "IndexExpr") {
      const base = this.evalExpr(expr.base);
      if (base.type.kind !== "Array") throw errorAt("TypeError", expr.loc.line, "Indexing requires ARRAY.");
      const indices = expr.indices.map((e) => this.evalExpr(e));
      for (const idx of indices) {
        if (idx.type.kind !== "Integer") throw errorAt("TypeError", expr.loc.line, "Index must be INTEGER.");
      }
      const arr = base.data as any[];
      const bounds = (base.type as ArrayType).bounds;
      let ref: any = arr;
      const baseId = this.objectId(arr);
      for (let i = 0; i < indices.length; i += 1) {
        const idx = indices[i].data as number;
        const bound = bounds[i];
        if (idx < bound.low || idx > bound.high) throw errorAt("RangeError", expr.loc.line, "Array index out of bounds.");
        const offset = idx - bound.low;
        if (i === indices.length - 1) {
          const key = `arr:${baseId}:${indices.map((v) => v.data).join(",")}`;
          const existing = this.proxyCache.get(key);
          if (existing) return existing;
          const cell = new ProxyCell((base.type as ArrayType).elementType, () => ref[offset], (v) => { ref[offset] = v; });
          this.proxyCache.set(key, cell);
          return cell;
        }
        ref = ref[offset];
      }
      throw errorAt("RuntimeError", expr.loc.line, "Invalid array access.");
    }
    if (expr.kind === "FieldExpr") {
      const base = this.evalExpr(expr.base);
      if (base.type.kind === "Record") {
        const fields = base.data as Map<string, RuntimeValue>;
        const fieldType = (base.type as RecordType).fields.get(expr.field);
        if (!fieldType || !fields.has(expr.field)) throw errorAt("NameError", expr.loc.line, "Unknown field.");
        const baseId = this.objectId(fields);
        const key = `rec:${baseId}:${expr.field}`;
        const existing = this.proxyCache.get(key);
        if (existing) return existing;
        const cell = new ProxyCell(fieldType, () => fields.get(expr.field) as RuntimeValue, (v) => { fields.set(expr.field, v); });
        this.proxyCache.set(key, cell);
        return cell;
      }
      if (base.type.kind === "Class") {
        if (base.data === null) throw errorAt("RuntimeError", expr.loc.line, "Null object.");
        const obj = this.store.getClassObject(base.data as number);
        if (!obj) throw errorAt("RuntimeError", expr.loc.line, "Invalid object reference.");
        const field = obj.fields.get(expr.field);
        if (!field) throw errorAt("NameError", expr.loc.line, "Unknown field.");
        return field;
      }
      throw errorAt("TypeError", expr.loc.line, "Field access requires RECORD or CLASS.");
    }
    if (expr.kind === "DerefExpr") {
      const pointer = this.evalExpr(expr.expr);
      if (pointer.type.kind !== "Pointer") throw errorAt("TypeError", expr.loc.line, "^ requires POINTER.");
      if (pointer.data === null) throw errorAt("RuntimeError", expr.loc.line, "Null dereference.");
      const cell = this.store.deref(pointer.data as number);
      if (!cell) throw errorAt("RuntimeError", expr.loc.line, "Invalid pointer.");
      return cell;
    }
    throw errorAt("RuntimeError", (expr as any).loc?.line ?? 0, "Invalid lvalue.");
  }

  private objectId(obj: object): number {
    const existing = this.objectIds.get(obj);
    if (existing) return existing;
    const id = this.nextObjectId++;
    this.objectIds.set(obj, id);
    return id;
  }

  private literalValue(lit: LiteralNode): RuntimeValue {
    switch (lit.literalType) {
      case "Integer":
        return makeValue(INTEGER, lit.value as number);
      case "Real":
        return makeValue(REAL, lit.value as number);
      case "Boolean":
        return makeValue(BOOLEAN, lit.value as boolean);
      case "Char":
        return makeValue(CHAR, lit.value as string);
      case "String":
        return makeValue(STRING, lit.value as string);
      case "Date":
        return makeValue(DATE, parseDateLiteral(lit.value as string, lit.loc.line));
    }
    throw errorAt("TypeError", lit.loc.line, "Unknown literal.");
  }

  private compareValues(a: RuntimeValue, b: RuntimeValue): number {
    if (!typeEquals(a.type, b.type)) throw errorAt("TypeError", 0, "Comparison types must match.");
    switch (a.type.kind) {
      case "Integer":
        return (a.data as number) - (b.data as number);
      case "Real":
        return (a.data as number) - (b.data as number);
      case "Boolean":
        return Number(a.data) - Number(b.data);
      case "Char":
      case "String":
        return (a.data as string) < (b.data as string) ? -1 : (a.data as string) > (b.data as string) ? 1 : 0;
      case "Date":
        return compareDate(a.data as DateValue, b.data as DateValue);
      case "Enum":
        return (a.data as number) - (b.data as number);
      default:
        throw errorAt("TypeError", 0, "Type not comparable.");
    }
  }

  private callFunction(decl: FuncDeclNode, args: ExprNode[], thisObj?: { className: string; fields: Map<string, CellLike> }): RuntimeValue {
    const frame = this.store.pushFrame();
    const scope = new RuntimeScope(this.currentScope);
    this.bindParams(decl.params, args, scope, frame, thisObj);
    const prevThis = this.currentThis;
    this.currentThis = thisObj;
    try {
      this.executeBlock(decl.block, scope);
      throw errorAt("RuntimeError", decl.loc.line, "Missing RETURN in function.");
    } catch (err) {
      if (err instanceof ReturnSignal) {
        if (!err.value) throw errorAt("RuntimeError", decl.loc.line, "Missing RETURN value.");
        return err.value;
      }
      throw err;
    } finally {
      this.currentThis = prevThis;
      this.store.popFrame();
    }
  }

  private callProcedure(decl: ProcDeclNode, args: ExprNode[], thisObj?: { className: string; fields: Map<string, CellLike> }): void {
    const frame = this.store.pushFrame();
    const scope = new RuntimeScope(this.currentScope);
    this.bindParams(decl.params, args, scope, frame, thisObj);
    const prevThis = this.currentThis;
    this.currentThis = thisObj;
    try {
      this.executeBlock(decl.block, scope);
    } catch (err) {
      if (err instanceof ReturnSignal) {
        return;
      }
      throw err;
    } finally {
      this.currentThis = prevThis;
      this.store.popFrame();
    }
  }

  private callConstructor(decl: any, args: ExprNode[], thisObj: { className: string; fields: Map<string, CellLike> }): void {
    const frame = this.store.pushFrame();
    const scope = new RuntimeScope(this.currentScope);
    this.bindParams(decl.params ?? [], args, scope, frame, thisObj);
    const prevThis = this.currentThis;
    this.currentThis = thisObj;
    try {
      this.executeBlock(decl.block, scope);
    } catch (err) {
      if (err instanceof ReturnSignal) return;
      throw err;
    } finally {
      this.currentThis = prevThis;
      this.store.popFrame();
    }
  }

  private bindParams(params: any[], args: ExprNode[], scope: RuntimeScope, frame: any, thisObj?: { className: string; fields: Map<string, CellLike> }): void {
    for (let i = 0; i < params.length; i += 1) {
      const param = params[i];
      const argExpr = args[i];
      const type = this.resolveType(param.typeSpec);
      if (param.mode === "BYREF") {
        const cell = this.getLValue(argExpr as LValueNode);
        scope.defineVar(param.name, cell);
      } else {
        const value = this.evalExpr(argExpr);
        if (!typeEquals(type, value.type)) throw errorAt("TypeError", param.loc.line, "Argument type mismatch.");
        scope.defineVar(param.name, new Cell(type, this.cloneValue(value)));
      }
    }
  }

  private cloneValue(value: RuntimeValue): RuntimeValue {
    switch (value.type.kind) {
      case "Array": {
        const cloneArray = (arr: any): any => {
          if (!Array.isArray(arr)) return arr;
          return arr.map((item) => {
            if (item && typeof item === "object" && "type" in item) {
              return this.cloneValue(item as RuntimeValue);
            }
            return cloneArray(item);
          });
        };
        return makeValue(value.type, cloneArray(value.data));
      }
      case "Record": {
        const fields = new Map<string, RuntimeValue>();
        const original = value.data as Map<string, RuntimeValue>;
        for (const [name, fieldValue] of original.entries()) {
          fields.set(name, this.cloneValue(fieldValue));
        }
        return makeValue(value.type, fields);
      }
      case "Set":
        return makeValue(value.type, new Set<number>(value.data as Set<number>));
      default:
        return value;
    }
  }

  private resolveMethod(className: string, methodName: string): ProcDeclNode | FuncDeclNode | undefined {
    const classInfo = this.sema.classInfos.get(className);
    if (!classInfo) return undefined;
    const classDecl = classInfo.decl;
    for (const member of classDecl.members) {
      if ((member.kind === "ProcDecl" || member.kind === "FuncDecl") && member.name === methodName) {
        return member;
      }
    }
    if (classInfo.baseName) return this.resolveMethod(classInfo.baseName, methodName);
    return undefined;
  }

  private resolveConstructor(className: string): any {
    const classInfo = this.sema.classInfos.get(className);
    if (!classInfo) return undefined;
    const classDecl = classInfo.decl;
    const ctor = classDecl.members.find((m) => m.kind === "ConstructorDecl");
    if (ctor) return ctor;
    if (classInfo.baseName) return this.resolveConstructor(classInfo.baseName);
    return undefined;
  }

  private createClassObject(className: string): number {
    const fields = new Map<string, CellLike>();
    const classInfo = this.sema.classInfos.get(className);
    if (!classInfo) throw errorAt("RuntimeError", 0, "Unknown class.");
    const initFields = (name: string) => {
      const info = this.sema.classInfos.get(name);
      if (!info) return;
      if (info.baseName) initFields(info.baseName);
      for (const member of info.decl.members) {
        if (member.kind === "VarDecl") {
          const type = this.resolveType(member.typeSpec);
          fields.set(member.name, new Cell(type, defaultValue(type)));
        }
      }
    };
    initFields(className);
    return this.store.allocClassObject(className, fields as Map<string, Cell>);
  }

  private resolveType(node: TypeNode): Type {
    switch (node.kind) {
      case "BasicType":
        return this.basicType(node);
      case "ArrayType":
        return { kind: "Array", bounds: node.bounds.map((b) => ({ low: b.low, high: b.high })), elementType: this.resolveType(node.elementType) } as ArrayType;
      case "RecordType": {
        const fields = new Map<string, Type>();
        for (const field of node.fields) {
          fields.set(field.name, this.resolveType(field.typeSpec));
        }
        return { kind: "Record", fields } as RecordType;
      }
      case "EnumType":
        return { kind: "Enum", name: "<anon>", members: node.members } as EnumType;
      case "SetType": {
        const base = this.currentScope.lookupType(node.baseName);
        if (!base || base.kind !== "Enum") throw errorAt("TypeError", node.loc.line, "SET OF requires enum type.");
        return { kind: "Set", base } as SetType;
      }
      case "PointerType":
        return { kind: "Pointer", target: this.resolveType(node.target) } as PointerType;
      case "TextFileType":
        return { kind: "TextFile" };
      case "RandomFileType": {
        const record = this.currentScope.lookupType(node.recordName);
        if (!record || record.kind !== "Record") throw errorAt("TypeError", node.loc.line, "RANDOMFILE requires RECORD type.");
        return { kind: "RandomFile", record } as RandomFileType;
      }
      case "NamedType": {
        const t = this.currentScope.lookupType(node.name) || this.sema.globalScope.lookup(node.name)?.type;
        if (!t) throw errorAt("NameError", node.loc.line, "Unknown type.");
        return t;
      }
    }
    throw errorAt("TypeError", (node as any).loc?.line ?? 0, "Unknown type.");
  }

  private basicType(node: any): Type {
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
    throw errorAt("TypeError", node.loc?.line ?? 0, "Unknown basic type.");
  }

  private isBuiltin(name: string): boolean {
    return ["LENGTH", "RIGHT", "MID", "LCASE", "UCASE", "INT", "REAL", "STRING", "CHAR", "BOOLEAN", "DATE", "RAND", "ORD", "ENUMVALUE", "SIZE"].includes(name);
  }

  private callBuiltin(name: string, expr: CallExprNode): RuntimeValue {
    switch (name) {
      case "RAND":
        if (expr.args.length !== 0) throw errorAt("TypeError", expr.loc.line, "RAND takes no arguments.");
        return this.stdlib.rand();
      case "LENGTH":
        this.requireArgCount(expr, 1);
        return this.stdlib.length(this.evalExpr(expr.args[0]), expr.loc.line);
      case "RIGHT":
        this.requireArgCount(expr, 2);
        return this.stdlib.right(this.evalExpr(expr.args[0]), this.evalExpr(expr.args[1]), expr.loc.line);
      case "MID":
        this.requireArgCount(expr, 3);
        return this.stdlib.mid(this.evalExpr(expr.args[0]), this.evalExpr(expr.args[1]), this.evalExpr(expr.args[2]), expr.loc.line);
      case "LCASE":
        this.requireArgCount(expr, 1);
        return this.stdlib.lcase(this.evalExpr(expr.args[0]), expr.loc.line);
      case "UCASE":
        this.requireArgCount(expr, 1);
        return this.stdlib.ucase(this.evalExpr(expr.args[0]), expr.loc.line);
      case "INT":
        this.requireArgCount(expr, 1);
        return this.stdlib.int(this.evalExpr(expr.args[0]), expr.loc.line);
      case "REAL":
        this.requireArgCount(expr, 1);
        return this.stdlib.real(this.evalExpr(expr.args[0]), expr.loc.line);
      case "STRING":
        this.requireArgCount(expr, 1);
        return this.stdlib.string(this.evalExpr(expr.args[0]), expr.loc.line);
      case "CHAR":
        this.requireArgCount(expr, 1);
        return this.stdlib.char(this.evalExpr(expr.args[0]), expr.loc.line);
      case "BOOLEAN":
        this.requireArgCount(expr, 1);
        return this.stdlib.boolean(this.evalExpr(expr.args[0]), expr.loc.line);
      case "DATE":
        this.requireArgCount(expr, 1);
        return this.stdlib.date(this.evalExpr(expr.args[0]), expr.loc.line);
      case "ORD":
        this.requireArgCount(expr, 1);
        return this.stdlib.ord(this.evalExpr(expr.args[0]), expr.loc.line);
      case "ENUMVALUE": {
        this.requireArgCount(expr, 2);
        const typeNameExpr = expr.args[0];
        if (typeNameExpr.kind !== "NameExpr") throw errorAt("TypeError", expr.loc.line, "ENUMVALUE requires enum type name.");
        const enumType = this.currentScope.lookupType((typeNameExpr as NameExprNode).name);
        if (!enumType) throw errorAt("TypeError", expr.loc.line, "ENUMVALUE requires enum type name.");
        return this.stdlib.enumValue(enumType, this.evalExpr(expr.args[1]), expr.loc.line);
      }
      case "SIZE":
        this.requireArgCount(expr, 1);
        return this.stdlib.size(this.evalExpr(expr.args[0]), expr.loc.line);
    }
    throw errorAt("RuntimeError", expr.loc.line, "Unknown builtin.");
  }

  private requireArgCount(expr: CallExprNode, count: number): void {
    if (expr.args.length !== count) throw errorAt("TypeError", expr.loc.line, "Argument count mismatch.");
  }

  private nextInputToken(line: number): string {
    if (this.inputIndex >= this.inputTokens.length) throw errorAt("RuntimeError", line, "No input available.");
    return this.inputTokens[this.inputIndex++];
  }

  private parseInputToken(token: string, type: Type, line: number): RuntimeValue {
    switch (type.kind) {
      case "Integer": {
        if (!/^[+-]?[0-9]+$/.test(token)) throw errorAt("TypeError", line, "Invalid INTEGER token.");
        return makeValue(INTEGER, checkInt(Number(token), line));
      }
      case "Real": {
        if (!/^[+-]?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(token)) throw errorAt("TypeError", line, "Invalid REAL token.");
        return makeValue(REAL, checkReal(Number(token), line));
      }
      case "Boolean": {
        const t = token.toUpperCase();
        if (t !== "TRUE" && t !== "FALSE") throw errorAt("TypeError", line, "Invalid BOOLEAN token.");
        return makeValue(BOOLEAN, t === "TRUE");
      }
      case "Char": {
        if (token.length !== 1) throw errorAt("TypeError", line, "Invalid CHAR token.");
        return makeValue(CHAR, token);
      }
      case "String":
        return makeValue(STRING, token);
      case "Date":
        return makeValue(DATE, parseDateLiteral(token, line));
      case "Enum": {
        const enumType = type as EnumType;
        const idx = enumType.members.indexOf(token);
        if (idx === -1) throw errorAt("TypeError", line, "Invalid ENUM token.");
        return makeValue(enumType, idx);
      }
      default:
        throw errorAt("TypeError", line, "INPUT type not supported.");
    }
  }
}

class ReturnSignal {
  constructor(public readonly value?: RuntimeValue) {}
}

class RuntimeScope {
  private readonly vars = new Map<string, CellLike>();
  private readonly consts = new Map<string, RuntimeValue>();
  private readonly types = new Map<string, Type>();
  private readonly procs = new Map<string, ProcDeclNode>();
  private readonly funcs = new Map<string, FuncDeclNode>();
  private readonly classes = new Map<string, ClassDeclNode>();

  constructor(public readonly parent?: RuntimeScope) {}

  defineVar(name: string, cell: CellLike): void {
    this.vars.set(name, cell);
  }

  defineConst(name: string, value: RuntimeValue): void {
    this.consts.set(name, value);
  }

  defineType(name: string, type: Type): void {
    this.types.set(name, type);
  }

  defineProc(name: string, decl: ProcDeclNode): void {
    this.procs.set(name, decl);
  }

  defineFunc(name: string, decl: FuncDeclNode): void {
    this.funcs.set(name, decl);
  }

  defineClass(name: string, decl: ClassDeclNode): void {
    this.classes.set(name, decl);
  }

  lookupVar(name: string): CellLike | undefined {
    return this.vars.get(name) ?? this.parent?.lookupVar(name);
  }

  lookupConst(name: string): RuntimeValue | undefined {
    return this.consts.get(name) ?? this.parent?.lookupConst(name);
  }

  lookupType(name: string): Type | undefined {
    return this.types.get(name) ?? this.parent?.lookupType(name);
  }

  lookupProc(name: string): ProcDeclNode | undefined {
    return this.procs.get(name) ?? this.parent?.lookupProc(name);
  }

  lookupFunc(name: string): FuncDeclNode | undefined {
    return this.funcs.get(name) ?? this.parent?.lookupFunc(name);
  }

  lookupClass(name: string): ClassDeclNode | undefined {
    return this.classes.get(name) ?? this.parent?.lookupClass(name);
  }
}

class ProxyCell implements CellLike {
  constructor(public readonly type: Type, private readonly getter: () => RuntimeValue, private readonly setter: (v: RuntimeValue) => void) {}
  get(): RuntimeValue {
    return this.getter();
  }
  set(value: RuntimeValue): void {
    this.setter(value);
  }
}
