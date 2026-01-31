import { Lexer } from "./lexer.js";
import { Token } from "./token.js";
import { errorAt } from "../diagnostics/errors.js";
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
  ParamNode,
  StatementNode,
  AssignStmtNode,
  IfStmtNode,
  CaseStmtNode,
  CaseBranchNode,
  CaseLabelNode,
  ForStmtNode,
  WhileStmtNode,
  RepeatStmtNode,
  CallStmtNode,
  ReturnStmtNode,
  InputStmtNode,
  OutputStmtNode,
  FileStmtNode,
  OpenFileStmtNode,
  CloseFileStmtNode,
  ReadFileStmtNode,
  WriteFileStmtNode,
  SeekStmtNode,
  GetRecordStmtNode,
  PutRecordStmtNode,
  SuperCallStmtNode,
  ProcRefNode,
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
  NamedTypeNode,
  ArrayBoundNode
} from "./ast.js";

export class Parser {
  private readonly lexer: Lexer;
  private current: Token;
  private next: Token;

  constructor(lexer: Lexer) {
    this.lexer = lexer;
    this.current = this.lexer.nextToken();
    this.next = this.lexer.nextToken();
  }

  parseProgram(): ProgramNode {
    const loc = this.loc();
    this.expectKeyword("PROGRAM");
    const name = this.expectIdentifier();
    const block = this.parseBlock();
    this.expectKeyword("ENDPROGRAM");
    return { kind: "Program", name, block, loc };
  }

  private parseBlock(): BlockNode {
    const loc = this.loc();
    const declarations: DeclarationNode[] = [];
    while (this.isDeclarationStart()) {
      declarations.push(this.parseDeclaration());
    }
    const statements: StatementNode[] = [];
    while (!this.isBlockEnd()) {
      statements.push(this.parseStatement());
    }
    return { kind: "Block", declarations, statements, loc };
  }

  private isBlockEnd(): boolean {
    return this.isKeyword("ENDPROGRAM") || this.isKeyword("ENDIF") || this.isKeyword("ENDCASE") ||
      this.isKeyword("NEXT") || this.isKeyword("ENDWHILE") || this.isKeyword("UNTIL") ||
      this.isKeyword("ELSE") || this.isKeyword("ENDPROCEDURE") || this.isKeyword("ENDFUNCTION") ||
      this.isKeyword("ENDCLASS") || this.isKeyword("ENDCONSTRUCTOR") || this.isAtEnd();
  }

  private isDeclarationStart(): boolean {
    return this.isKeyword("DECLARE") || this.isKeyword("CONSTANT") || this.isKeyword("TYPE") ||
      this.isKeyword("PROCEDURE") || this.isKeyword("FUNCTION") || this.isKeyword("CLASS");
  }

  private parseDeclaration(): DeclarationNode {
    if (this.isKeyword("DECLARE")) return this.parseVarDecl();
    if (this.isKeyword("CONSTANT")) return this.parseConstDecl();
    if (this.isKeyword("TYPE")) return this.parseTypeDecl();
    if (this.isKeyword("PROCEDURE")) return this.parseProcDecl();
    if (this.isKeyword("FUNCTION")) return this.parseFuncDecl();
    if (this.isKeyword("CLASS")) return this.parseClassDecl();
    throw errorAt("SyntaxError", this.current.line, "Expected declaration.");
  }

  private parseVarDecl(): VarDeclNode {
    const loc = this.loc();
    this.expectKeyword("DECLARE");
    const name = this.expectIdentifier();
    this.expectDelimiter(":");
    const typeSpec = this.parseType();
    return { kind: "VarDecl", name, typeSpec, loc };
  }

  private parseConstDecl(): ConstDeclNode {
    const loc = this.loc();
    this.expectKeyword("CONSTANT");
    const name = this.expectIdentifier();
    this.expectOperator("=");
    const expr = this.parseExpression();
    return { kind: "ConstDecl", name, expr, loc };
  }

  private parseTypeDecl(): TypeDeclNode {
    const loc = this.loc();
    this.expectKeyword("TYPE");
    const name = this.expectIdentifier();
    this.expectOperator("=");
    const typeSpec = this.parseTypeSpec();
    return { kind: "TypeDecl", name, typeSpec, loc };
  }

  private parseProcDecl(): ProcDeclNode {
    const loc = this.loc();
    this.expectKeyword("PROCEDURE");
    const name = this.expectIdentifier();
    this.expectDelimiter("(");
    const params = this.parseParams();
    this.expectDelimiter(")");
    const block = this.parseBlock();
    this.expectKeyword("ENDPROCEDURE");
    return { kind: "ProcDecl", name, params, block, loc };
  }

  private parseFuncDecl(): FuncDeclNode {
    const loc = this.loc();
    this.expectKeyword("FUNCTION");
    const name = this.expectIdentifier();
    this.expectDelimiter("(");
    const params = this.parseParams();
    this.expectDelimiter(")");
    this.expectKeyword("RETURNS");
    const returnType = this.parseType();
    const block = this.parseBlock();
    this.expectKeyword("ENDFUNCTION");
    return { kind: "FuncDecl", name, params, returnType, block, loc };
  }

  private parseClassDecl(): ClassDeclNode {
    const loc = this.loc();
    this.expectKeyword("CLASS");
    const name = this.expectIdentifier();
    let baseName: string | undefined;
    if (this.matchKeyword("EXTENDS")) {
      baseName = this.expectIdentifier();
    }
    const members: ClassDeclNode["members"] = [];
    let currentAccess: "PUBLIC" | "PRIVATE" = "PUBLIC";
    while (!this.isKeyword("ENDCLASS")) {
      if (this.isKeyword("PUBLIC") || this.isKeyword("PRIVATE")) {
        currentAccess = this.current.lexeme as "PUBLIC" | "PRIVATE";
        this.advance();
        continue;
      }
      if (this.isKeyword("DECLARE")) {
        const member = this.parseVarDecl();
        member.access = currentAccess;
        members.push(member);
        continue;
      }
      if (this.isKeyword("PROCEDURE")) {
        const member = this.parseProcDecl();
        member.access = currentAccess;
        members.push(member);
        continue;
      }
      if (this.isKeyword("FUNCTION")) {
        const member = this.parseFuncDecl();
        member.access = currentAccess;
        members.push(member);
        continue;
      }
      if (this.isKeyword("CONSTRUCTOR")) {
        const member = this.parseConstructorDecl();
        member.access = currentAccess;
        members.push(member);
        continue;
      }
      throw errorAt("SyntaxError", this.current.line, "Unexpected token in class body.");
    }
    this.expectKeyword("ENDCLASS");
    return { kind: "ClassDecl", name, baseName, members, loc };
  }

  private parseConstructorDecl(): ConstructorDeclNode {
    const loc = this.loc();
    this.expectKeyword("CONSTRUCTOR");
    const name = this.expectIdentifier();
    this.expectDelimiter("(");
    const params = this.parseParams();
    this.expectDelimiter(")");
    const block = this.parseBlock();
    this.expectKeyword("ENDCONSTRUCTOR");
    return { kind: "ConstructorDecl", name, params, block, loc };
  }

  private parseParams(): ParamNode[] {
    const params: ParamNode[] = [];
    if (this.isDelimiter(")")) return params;
    while (true) {
      const loc = this.loc();
      let mode: ParamNode["mode"] = "BYVAL";
      if (this.matchKeyword("BYREF")) mode = "BYREF";
      else if (this.matchKeyword("BYVAL")) mode = "BYVAL";
      const name = this.expectIdentifier();
      this.expectDelimiter(":");
      const typeSpec = this.parseType();
      params.push({ name, mode, typeSpec, loc });
      if (!this.matchDelimiter(",")) break;
    }
    return params;
  }

  private parseStatement(): StatementNode {
    if (this.isKeyword("IF")) return this.parseIfStmt();
    if (this.isKeyword("CASE")) return this.parseCaseStmt();
    if (this.isKeyword("FOR")) return this.parseForStmt();
    if (this.isKeyword("WHILE")) return this.parseWhileStmt();
    if (this.isKeyword("REPEAT")) return this.parseRepeatStmt();
    if (this.isKeyword("CALL")) return this.parseCallStmt();
    if (this.isKeyword("RETURN")) return this.parseReturnStmt();
    if (this.isKeyword("INPUT")) return this.parseInputStmt();
    if (this.isKeyword("OUTPUT")) return this.parseOutputStmt();
    if (this.isKeyword("OPENFILE") || this.isKeyword("CLOSEFILE") || this.isKeyword("READFILE") ||
      this.isKeyword("WRITEFILE") || this.isKeyword("SEEK") || this.isKeyword("GETRECORD") ||
      this.isKeyword("PUTRECORD")) return this.parseFileStmt();
    if (this.isKeyword("SUPER")) return this.parseSuperCallStmt();

    // Assignment
    const loc = this.loc();
    const target = this.parseLValue();
    if (!this.matchOperator("<-")) {
      throw errorAt("SyntaxError", this.current.line, "Expected '<-' in assignment.");
    }
    const expr = this.parseExpression();
    const stmt: AssignStmtNode = { kind: "AssignStmt", target, expr, loc };
    return stmt;
  }

  private parseIfStmt(): IfStmtNode {
    const loc = this.loc();
    this.expectKeyword("IF");
    const condition = this.parseExpression();
    this.expectKeyword("THEN");
    const thenBlock = this.parseBlock();
    let elseBlock: BlockNode | undefined;
    if (this.matchKeyword("ELSE")) {
      elseBlock = this.parseBlock();
    }
    this.expectKeyword("ENDIF");
    return { kind: "IfStmt", condition, thenBlock, elseBlock, loc };
  }

  private parseCaseStmt(): CaseStmtNode {
    const loc = this.loc();
    this.expectKeyword("CASE");
    this.expectKeyword("OF");
    const expr = this.parseExpression();
    const branches: CaseBranchNode[] = [];
    let otherwiseBlock: BlockNode | undefined;
    while (!this.isKeyword("ENDCASE")) {
      if (this.matchKeyword("OTHERWISE")) {
        this.expectDelimiter(":");
        otherwiseBlock = this.parseBlock();
        break;
      }
      const labels = this.parseCaseLabels();
      this.expectDelimiter(":");
      const block = this.parseBlock();
      branches.push({ labels, block, loc: labels[0]?.loc ?? loc });
    }
    this.expectKeyword("ENDCASE");
    return { kind: "CaseStmt", expr, branches, otherwiseBlock, loc };
  }

  private parseCaseLabels(): CaseLabelNode[] {
    const labels: CaseLabelNode[] = [];
    const first = this.parseCaseLabel();
    labels.push(first);
    while (this.matchDelimiter(",")) {
      labels.push(this.parseCaseLabel());
    }
    return labels;
  }

  private parseCaseLabel(): CaseLabelNode {
    const loc = this.loc();
    const start = this.parseLiteral();
    if (this.matchKeyword("TO")) {
      const end = this.parseLiteral();
      return { kind: "CaseRange", start, end, loc };
    }
    return { kind: "CaseValue", value: start, loc };
  }

  private parseForStmt(): ForStmtNode {
    const loc = this.loc();
    this.expectKeyword("FOR");
    const name = this.expectIdentifier();
    this.expectOperator("<-");
    const start = this.parseExpression();
    this.expectKeyword("TO");
    const end = this.parseExpression();
    let step: ExprNode | undefined;
    if (this.matchKeyword("STEP")) {
      step = this.parseExpression();
    }
    const block = this.parseBlock();
    this.expectKeyword("NEXT");
    this.expectIdentifier();
    return { kind: "ForStmt", name, start, end, step, block, loc };
  }

  private parseWhileStmt(): WhileStmtNode {
    const loc = this.loc();
    this.expectKeyword("WHILE");
    const condition = this.parseExpression();
    this.expectKeyword("DO");
    const block = this.parseBlock();
    this.expectKeyword("ENDWHILE");
    return { kind: "WhileStmt", condition, block, loc };
  }

  private parseRepeatStmt(): RepeatStmtNode {
    const loc = this.loc();
    this.expectKeyword("REPEAT");
    const block = this.parseBlock();
    this.expectKeyword("UNTIL");
    const condition = this.parseExpression();
    return { kind: "RepeatStmt", block, condition, loc };
  }

  private parseCallStmt(): CallStmtNode {
    const loc = this.loc();
    this.expectKeyword("CALL");
    const callee = this.parseProcRef();
    this.expectDelimiter("(");
    const args = this.parseArgList();
    this.expectDelimiter(")");
    return { kind: "CallStmt", callee, args, loc };
  }

  private parseSuperCallStmt(): SuperCallStmtNode {
    const loc = this.loc();
    this.expectKeyword("SUPER");
    let methodName: string | undefined;
    if (this.matchDelimiter(".")) {
      methodName = this.expectIdentifier();
    }
    this.expectDelimiter("(");
    const args = this.parseArgList();
    this.expectDelimiter(")");
    return { kind: "SuperCallStmt", methodName, args, loc };
  }

  private parseReturnStmt(): ReturnStmtNode {
    const loc = this.loc();
    this.expectKeyword("RETURN");
    if (this.isBlockEnd()) {
      return { kind: "ReturnStmt", loc };
    }
    const expr = this.parseExpression();
    return { kind: "ReturnStmt", expr, loc };
  }

  private parseInputStmt(): InputStmtNode {
    const loc = this.loc();
    this.expectKeyword("INPUT");
    const targets: LValueNode[] = [];
    targets.push(this.parseLValue());
    while (this.matchDelimiter(",")) {
      targets.push(this.parseLValue());
    }
    return { kind: "InputStmt", targets, loc };
  }

  private parseOutputStmt(): OutputStmtNode {
    const loc = this.loc();
    this.expectKeyword("OUTPUT");
    const values: ExprNode[] = [];
    values.push(this.parseExpression());
    while (this.matchDelimiter(",")) {
      values.push(this.parseExpression());
    }
    return { kind: "OutputStmt", values, loc };
  }

  private parseFileStmt(): FileStmtNode {
    if (this.isKeyword("OPENFILE")) return this.parseOpenFileStmt();
    if (this.isKeyword("CLOSEFILE")) return this.parseCloseFileStmt();
    if (this.isKeyword("READFILE")) return this.parseReadFileStmt();
    if (this.isKeyword("WRITEFILE")) return this.parseWriteFileStmt();
    if (this.isKeyword("SEEK")) return this.parseSeekStmt();
    if (this.isKeyword("GETRECORD")) return this.parseGetRecordStmt();
    if (this.isKeyword("PUTRECORD")) return this.parsePutRecordStmt();
    throw errorAt("SyntaxError", this.current.line, "Expected file statement.");
  }

  private parseOpenFileStmt(): OpenFileStmtNode {
    const loc = this.loc();
    this.expectKeyword("OPENFILE");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(",");
    const pathLit = this.expectStringLiteral();
    this.expectDelimiter(",");
    const modeLit = this.expectStringLiteral();
    this.expectDelimiter(")");
    return { kind: "OpenFileStmt", fileName, path: pathLit, mode: modeLit, loc };
  }

  private parseCloseFileStmt(): CloseFileStmtNode {
    const loc = this.loc();
    this.expectKeyword("CLOSEFILE");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(")");
    return { kind: "CloseFileStmt", fileName, loc };
  }

  private parseReadFileStmt(): ReadFileStmtNode {
    const loc = this.loc();
    this.expectKeyword("READFILE");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(",");
    const target = this.parseLValue();
    this.expectDelimiter(")");
    return { kind: "ReadFileStmt", fileName, target, loc };
  }

  private parseWriteFileStmt(): WriteFileStmtNode {
    const loc = this.loc();
    this.expectKeyword("WRITEFILE");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(",");
    const expr = this.parseExpression();
    this.expectDelimiter(")");
    return { kind: "WriteFileStmt", fileName, expr, loc };
  }

  private parseSeekStmt(): SeekStmtNode {
    const loc = this.loc();
    this.expectKeyword("SEEK");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(",");
    const address = this.parseExpression();
    this.expectDelimiter(")");
    return { kind: "SeekStmt", fileName, address, loc };
  }

  private parseGetRecordStmt(): GetRecordStmtNode {
    const loc = this.loc();
    this.expectKeyword("GETRECORD");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(",");
    const target = this.parseLValue();
    this.expectDelimiter(")");
    return { kind: "GetRecordStmt", fileName, target, loc };
  }

  private parsePutRecordStmt(): PutRecordStmtNode {
    const loc = this.loc();
    this.expectKeyword("PUTRECORD");
    this.expectDelimiter("(");
    const fileName = this.expectIdentifier();
    this.expectDelimiter(",");
    const expr = this.parseExpression();
    this.expectDelimiter(")");
    return { kind: "PutRecordStmt", fileName, expr, loc };
  }

  private parseProcRef(): ProcRefNode {
    const loc = this.loc();
    const parts: string[] = [];
    parts.push(this.expectIdentifier());
    while (this.matchDelimiter(".")) {
      parts.push(this.expectIdentifier());
    }
    return { kind: "ProcRef", parts, loc };
  }

  private parseExpression(): ExprNode {
    return this.parseOr();
  }

  private parseOr(): ExprNode {
    let expr = this.parseAnd();
    while (this.matchKeyword("OR")) {
      const op = "OR";
      const right = this.parseAnd();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseAnd(): ExprNode {
    let expr = this.parseRel();
    while (this.matchKeyword("AND")) {
      const op = "AND";
      const right = this.parseRel();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseRel(): ExprNode {
    let expr = this.parseSet();
    const opToken = this.current;
    if (this.isOperator("=") || this.isOperator("<>") || this.isOperator("<") || this.isOperator("<=") ||
      this.isOperator(">") || this.isOperator(">=") || this.isKeyword("IN")) {
      this.advance();
      const op = opToken.lexeme;
      const right = this.parseSet();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseSet(): ExprNode {
    let expr = this.parseConcat();
    while (this.isKeyword("UNION") || this.isKeyword("INTERSECT") || this.isKeyword("DIFF")) {
      const op = this.current.lexeme;
      this.advance();
      const right = this.parseConcat();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseConcat(): ExprNode {
    let expr = this.parseAdd();
    while (this.matchOperator("&")) {
      const op = "&";
      const right = this.parseAdd();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseAdd(): ExprNode {
    let expr = this.parseMul();
    while (this.isOperator("+") || this.isOperator("-")) {
      const op = this.current.lexeme;
      this.advance();
      const right = this.parseMul();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseMul(): ExprNode {
    let expr = this.parseUnary();
    while (this.isOperator("*") || this.isOperator("/") || this.isKeyword("DIV") || this.isKeyword("MOD")) {
      const op = this.current.lexeme;
      this.advance();
      const right = this.parseUnary();
      expr = { kind: "BinaryExpr", op, left: expr, right, loc: expr.loc };
    }
    return expr;
  }

  private parseUnary(): ExprNode {
    if (this.isOperator("+") || this.isOperator("-") || this.isOperator("@") || this.isOperator("^") || this.isKeyword("NOT")) {
      const loc = this.loc();
      const op = this.current.lexeme;
      this.advance();
      const expr = this.parseUnary();
      if (op === "^") {
        return { kind: "DerefExpr", expr, loc } as DerefExprNode;
      }
      return { kind: "UnaryExpr", op, expr, loc };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode {
    const loc = this.loc();
    if (this.isKeyword("DATE")) {
      if (this.next.kind === "String") {
        return this.parseLiteral();
      }
      this.advance();
      let expr: ExprNode = { kind: "NameExpr", name: "DATE", loc } as NameExprNode;
      while (true) {
        if (this.matchDelimiter("(")) {
          const args = this.parseArgList();
          this.expectDelimiter(")");
          expr = { kind: "CallExpr", callee: expr, args, loc: expr.loc } as CallExprNode;
          continue;
        }
        if (this.matchDelimiter("[")) {
          const indices: ExprNode[] = [];
          indices.push(this.parseExpression());
          while (this.matchDelimiter(",")) {
            indices.push(this.parseExpression());
          }
          this.expectDelimiter("]");
          expr = { kind: "IndexExpr", base: expr, indices, loc: expr.loc } as IndexExprNode;
          continue;
        }
        if (this.matchDelimiter(".")) {
          const field = this.expectIdentifier();
          expr = { kind: "FieldExpr", base: expr, field, loc: expr.loc } as FieldExprNode;
          continue;
        }
        break;
      }
      return expr;
    }
    if (this.isBuiltinKeyword()) {
      const name = this.current.lexeme;
      this.advance();
      let expr: ExprNode = { kind: "NameExpr", name, loc } as NameExprNode;
      while (true) {
        if (this.matchDelimiter("(")) {
          const args = this.parseArgList();
          this.expectDelimiter(")");
          expr = { kind: "CallExpr", callee: expr, args, loc: expr.loc } as CallExprNode;
          continue;
        }
        if (this.matchDelimiter("[")) {
          const indices: ExprNode[] = [];
          indices.push(this.parseExpression());
          while (this.matchDelimiter(",")) {
            indices.push(this.parseExpression());
          }
          this.expectDelimiter("]");
          expr = { kind: "IndexExpr", base: expr, indices, loc: expr.loc } as IndexExprNode;
          continue;
        }
        if (this.matchDelimiter(".")) {
          const field = this.expectIdentifier();
          expr = { kind: "FieldExpr", base: expr, field, loc: expr.loc } as FieldExprNode;
          continue;
        }
        break;
      }
      return expr;
    }
    if (this.isKeyword("EOF")) {
      this.advance();
      this.expectDelimiter("(");
      const fileName = this.expectIdentifier();
      this.expectDelimiter(")");
      return { kind: "EOFExpr", fileName, loc } as EOFExprNode;
    }
    if (this.isKeyword("NEW")) {
      this.advance();
      if (this.isIdentifier()) {
        const name = this.expectIdentifier();
        if (this.isDelimiter("(")) {
          this.expectDelimiter("(");
          const args = this.parseArgList();
          this.expectDelimiter(")");
          return { kind: "NewExpr", typeName: name, args, loc } as NewExprNode;
        }
        return { kind: "NewExpr", typeSpec: { kind: "NamedType", name, loc }, args: [], loc } as NewExprNode;
      }
      const typeSpec = this.parseTypeSpec();
      return { kind: "NewExpr", typeSpec, args: [], loc } as NewExprNode;
    }
    if (this.isKeyword("NULL")) {
      this.advance();
      return { kind: "NullExpr", loc } as NullExprNode;
    }
    if (this.isLiteralStart()) {
      return this.parseLiteral();
    }
    if (this.isIdentifier()) {
      let expr: ExprNode = { kind: "NameExpr", name: this.expectIdentifier(), loc } as NameExprNode;
      while (true) {
        if (this.matchDelimiter("(")) {
          const args = this.parseArgList();
          this.expectDelimiter(")");
          expr = { kind: "CallExpr", callee: expr, args, loc: expr.loc } as CallExprNode;
          continue;
        }
        if (this.matchDelimiter("[")) {
          const indices: ExprNode[] = [];
          indices.push(this.parseExpression());
          while (this.matchDelimiter(",")) {
            indices.push(this.parseExpression());
          }
          this.expectDelimiter("]");
          expr = { kind: "IndexExpr", base: expr, indices, loc: expr.loc } as IndexExprNode;
          continue;
        }
        if (this.matchDelimiter(".")) {
          const field = this.expectIdentifier();
          expr = { kind: "FieldExpr", base: expr, field, loc: expr.loc } as FieldExprNode;
          continue;
        }
        break;
      }
      return expr;
    }
    if (this.matchDelimiter("(")) {
      const expr = this.parseExpression();
      this.expectDelimiter(")");
      return expr;
    }
    throw errorAt("SyntaxError", this.current.line, "Expected expression.");
  }

  private isBuiltinKeyword(): boolean {
    return this.current.kind === "Keyword" && ["INT", "REAL", "STRING", "CHAR", "BOOLEAN"].includes(this.current.lexeme);
  }

  private parseLiteral(): LiteralNode {
    const loc = this.loc();
    if (this.isKeyword("DATE")) {
      this.advance();
      const value = this.expectStringLiteral();
      return { kind: "Literal", value, literalType: "Date", loc };
    }
    if (this.current.kind === "Integer") {
      const value = this.current.value as number;
      this.advance();
      return { kind: "Literal", value, literalType: "Integer", loc };
    }
    if (this.current.kind === "Real") {
      const value = this.current.value as number;
      this.advance();
      return { kind: "Literal", value, literalType: "Real", loc };
    }
    if (this.current.kind === "Boolean") {
      const value = this.current.value as boolean;
      this.advance();
      return { kind: "Literal", value, literalType: "Boolean", loc };
    }
    if (this.current.kind === "Char") {
      const value = this.current.value as string;
      this.advance();
      return { kind: "Literal", value, literalType: "Char", loc };
    }
    if (this.current.kind === "String") {
      const value = this.current.value as string;
      this.advance();
      return { kind: "Literal", value, literalType: "String", loc };
    }
    throw errorAt("SyntaxError", this.current.line, "Expected literal.");
  }

  private parseArgList(): ExprNode[] {
    const args: ExprNode[] = [];
    if (this.isDelimiter(")")) return args;
    args.push(this.parseExpression());
    while (this.matchDelimiter(",")) {
      args.push(this.parseExpression());
    }
    return args;
  }

  private parseLValue(): LValueNode {
    const loc = this.loc();
    if (this.isOperator("^")) {
      const expr = this.parseUnary();
      if (expr.kind !== "DerefExpr") {
        throw errorAt("SyntaxError", this.current.line, "Invalid dereference.");
      }
      return expr as DerefExprNode;
    }
    if (!this.isIdentifier()) {
      throw errorAt("SyntaxError", this.current.line, "Expected identifier for lvalue.");
    }
    let expr: ExprNode = { kind: "NameExpr", name: this.expectIdentifier(), loc } as NameExprNode;
    while (true) {
      if (this.matchDelimiter("[")) {
        const indices: ExprNode[] = [];
        indices.push(this.parseExpression());
        while (this.matchDelimiter(",")) {
          indices.push(this.parseExpression());
        }
        this.expectDelimiter("]");
        expr = { kind: "IndexExpr", base: expr, indices, loc: expr.loc } as IndexExprNode;
        continue;
      }
      if (this.matchDelimiter(".")) {
        const field = this.expectIdentifier();
        expr = { kind: "FieldExpr", base: expr, field, loc: expr.loc } as FieldExprNode;
        continue;
      }
      break;
    }
    return expr as LValueNode;
  }

  private parseType(): TypeNode {
    return this.parseTypeSpec();
  }

  private parseTypeSpec(): TypeNode {
    const loc = this.loc();
    if (this.isKeyword("INTEGER") || this.isKeyword("REAL") || this.isKeyword("BOOLEAN") ||
      this.isKeyword("CHAR") || this.isKeyword("STRING") || this.isKeyword("DATE")) {
      const name = this.current.lexeme as BasicTypeNode["name"];
      this.advance();
      return { kind: "BasicType", name, loc } as BasicTypeNode;
    }
    if (this.matchKeyword("ARRAY")) {
      this.expectDelimiter("[");
      const bounds: ArrayBoundNode[] = [];
      bounds.push(this.parseBounds());
      while (this.matchDelimiter(",")) {
        bounds.push(this.parseBounds());
      }
      this.expectDelimiter("]");
      this.expectKeyword("OF");
      const elementType = this.parseTypeSpec();
      return { kind: "ArrayType", bounds, elementType, loc } as ArrayTypeNode;
    }
    if (this.matchKeyword("RECORD")) {
      const fields: VarDeclNode[] = [];
      while (!this.isKeyword("ENDRECORD")) {
        const fieldLoc = this.loc();
        const name = this.expectIdentifier();
        this.expectDelimiter(":");
        const typeSpec = this.parseTypeSpec();
        fields.push({ kind: "VarDecl", name, typeSpec, loc: fieldLoc });
      }
      this.expectKeyword("ENDRECORD");
      return { kind: "RecordType", fields, loc } as RecordTypeNode;
    }
    if (this.matchDelimiter("(")) {
      const members: string[] = [];
      members.push(this.expectIdentifier());
      while (this.matchDelimiter(",")) {
        members.push(this.expectIdentifier());
      }
      this.expectDelimiter(")");
      return { kind: "EnumType", members, loc } as EnumTypeNode;
    }
    if (this.matchKeyword("SET")) {
      this.expectKeyword("OF");
      const baseName = this.expectIdentifier();
      return { kind: "SetType", baseName, loc } as SetTypeNode;
    }
    if (this.matchKeyword("POINTER")) {
      this.expectKeyword("TO");
      const target = this.parseTypeSpec();
      return { kind: "PointerType", target, loc } as PointerTypeNode;
    }
    if (this.matchKeyword("TEXTFILE")) {
      return { kind: "TextFileType", loc } as FileTypeNode;
    }
    if (this.matchKeyword("RANDOMFILE")) {
      this.expectKeyword("OF");
      const recordName = this.expectIdentifier();
      return { kind: "RandomFileType", recordName, loc } as FileTypeNode;
    }
    if (this.isIdentifier()) {
      const name = this.expectIdentifier();
      return { kind: "NamedType", name, loc } as NamedTypeNode;
    }
    throw errorAt("SyntaxError", this.current.line, "Expected type.");
  }

  private parseBounds(): ArrayBoundNode {
    const loc = this.loc();
    const low = this.expectIntegerLiteral();
    this.expectDelimiter(":");
    const high = this.expectIntegerLiteral();
    return { low, high, loc };
  }

  private expectIdentifier(): string {
    if (this.current.kind === "Identifier") {
      const name = this.current.lexeme;
      this.advance();
      return name;
    }
    throw errorAt("SyntaxError", this.current.line, "Expected identifier.");
  }

  private expectStringLiteral(): string {
    if (this.current.kind === "String") {
      const value = this.current.value as string;
      this.advance();
      return value;
    }
    throw errorAt("SyntaxError", this.current.line, "Expected string literal.");
  }

  private expectIntegerLiteral(): number {
    if (this.current.kind === "Integer") {
      const value = this.current.value as number;
      this.advance();
      return value;
    }
    throw errorAt("SyntaxError", this.current.line, "Expected integer literal.");
  }

  private expectKeyword(name: string): void {
    if (this.isKeyword(name)) {
      this.advance();
      return;
    }
    throw errorAt("SyntaxError", this.current.line, `Expected keyword ${name}.`);
  }

  private matchKeyword(name: string): boolean {
    if (this.isKeyword(name)) {
      this.advance();
      return true;
    }
    return false;
  }

  private isKeyword(name: string): boolean {
    return this.current.kind === "Keyword" && this.current.lexeme === name;
  }

  private expectOperator(op: string): void {
    if (this.isOperator(op)) {
      this.advance();
      return;
    }
    throw errorAt("SyntaxError", this.current.line, `Expected operator ${op}.`);
  }

  private matchOperator(op: string): boolean {
    if (this.isOperator(op)) {
      this.advance();
      return true;
    }
    return false;
  }

  private isOperator(op: string): boolean {
    return this.current.kind === "Operator" && this.current.lexeme === op;
  }

  private expectDelimiter(delim: string): void {
    if (this.isDelimiter(delim)) {
      this.advance();
      return;
    }
    throw errorAt("SyntaxError", this.current.line, `Expected '${delim}'.`);
  }

  private matchDelimiter(delim: string): boolean {
    if (this.isDelimiter(delim)) {
      this.advance();
      return true;
    }
    return false;
  }

  private isDelimiter(delim: string): boolean {
    return this.current.kind === "Delimiter" && this.current.lexeme === delim;
  }

  private isIdentifier(): boolean {
    return this.current.kind === "Identifier";
  }

  private isLiteralStart(): boolean {
    return this.current.kind === "Integer" || this.current.kind === "Real" || this.current.kind === "Boolean" ||
      this.current.kind === "Char" || this.current.kind === "String" || this.isKeyword("DATE");
  }

  private advance(): void {
    this.current = this.next;
    this.next = this.lexer.nextToken();
  }

  private isAtEnd(): boolean {
    return this.current.kind === "EOF";
  }

  private loc() {
    return { line: this.current.line, column: this.current.column };
  }
}
