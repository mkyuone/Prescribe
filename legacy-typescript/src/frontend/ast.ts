export type SourceLoc = { line: number; column: number };

export type ProgramNode = {
  kind: "Program";
  name: string;
  block: BlockNode;
  loc: SourceLoc;
};

export type BlockNode = {
  kind: "Block";
  declarations: DeclarationNode[];
  statements: StatementNode[];
  loc: SourceLoc;
};

export type DeclarationNode =
  | VarDeclNode
  | ConstDeclNode
  | TypeDeclNode
  | ProcDeclNode
  | FuncDeclNode
  | ClassDeclNode;

export type VarDeclNode = {
  kind: "VarDecl";
  name: string;
  typeSpec: TypeNode;
  loc: SourceLoc;
  access?: "PUBLIC" | "PRIVATE";
};

export type ConstDeclNode = {
  kind: "ConstDecl";
  name: string;
  expr: ExprNode;
  loc: SourceLoc;
};

export type TypeDeclNode = {
  kind: "TypeDecl";
  name: string;
  typeSpec: TypeNode;
  loc: SourceLoc;
};

export type ParamNode = {
  name: string;
  mode: "BYVAL" | "BYREF";
  typeSpec: TypeNode;
  loc: SourceLoc;
};

export type ProcDeclNode = {
  kind: "ProcDecl";
  name: string;
  params: ParamNode[];
  block: BlockNode;
  loc: SourceLoc;
  access?: "PUBLIC" | "PRIVATE";
};

export type FuncDeclNode = {
  kind: "FuncDecl";
  name: string;
  params: ParamNode[];
  returnType: TypeNode;
  block: BlockNode;
  loc: SourceLoc;
  access?: "PUBLIC" | "PRIVATE";
};

export type ConstructorDeclNode = {
  kind: "ConstructorDecl";
  name: string;
  params: ParamNode[];
  block: BlockNode;
  loc: SourceLoc;
  access?: "PUBLIC" | "PRIVATE";
};

export type ClassDeclNode = {
  kind: "ClassDecl";
  name: string;
  baseName?: string;
  members: ClassMemberNode[];
  loc: SourceLoc;
};

export type ClassMemberNode = VarDeclNode | ProcDeclNode | FuncDeclNode | ConstructorDeclNode;

export type StatementNode =
  | AssignStmtNode
  | IfStmtNode
  | CaseStmtNode
  | ForStmtNode
  | WhileStmtNode
  | RepeatStmtNode
  | CallStmtNode
  | ReturnStmtNode
  | InputStmtNode
  | OutputStmtNode
  | FileStmtNode
  | SuperCallStmtNode;

export type AssignStmtNode = {
  kind: "AssignStmt";
  target: LValueNode;
  expr: ExprNode;
  loc: SourceLoc;
};

export type IfStmtNode = {
  kind: "IfStmt";
  condition: ExprNode;
  thenBlock: BlockNode;
  elseBlock?: BlockNode;
  loc: SourceLoc;
};

export type CaseBranchNode = {
  labels: CaseLabelNode[];
  block: BlockNode;
  loc: SourceLoc;
};

export type CaseLabelNode =
  | { kind: "CaseValue"; value: LiteralNode; loc: SourceLoc }
  | { kind: "CaseRange"; start: LiteralNode; end: LiteralNode; loc: SourceLoc };

export type CaseStmtNode = {
  kind: "CaseStmt";
  expr: ExprNode;
  branches: CaseBranchNode[];
  otherwiseBlock?: BlockNode;
  loc: SourceLoc;
};

export type ForStmtNode = {
  kind: "ForStmt";
  name: string;
  start: ExprNode;
  end: ExprNode;
  step?: ExprNode;
  block: BlockNode;
  loc: SourceLoc;
};

export type WhileStmtNode = {
  kind: "WhileStmt";
  condition: ExprNode;
  block: BlockNode;
  loc: SourceLoc;
};

export type RepeatStmtNode = {
  kind: "RepeatStmt";
  block: BlockNode;
  condition: ExprNode;
  loc: SourceLoc;
};

export type CallStmtNode = {
  kind: "CallStmt";
  callee: ProcRefNode;
  args: ExprNode[];
  loc: SourceLoc;
};

export type ReturnStmtNode = {
  kind: "ReturnStmt";
  expr?: ExprNode;
  loc: SourceLoc;
};

export type InputStmtNode = {
  kind: "InputStmt";
  targets: LValueNode[];
  loc: SourceLoc;
};

export type OutputStmtNode = {
  kind: "OutputStmt";
  values: ExprNode[];
  loc: SourceLoc;
};

export type FileStmtNode =
  | OpenFileStmtNode
  | CloseFileStmtNode
  | ReadFileStmtNode
  | WriteFileStmtNode
  | SeekStmtNode
  | GetRecordStmtNode
  | PutRecordStmtNode;

export type OpenFileStmtNode = {
  kind: "OpenFileStmt";
  fileName: string;
  path: string;
  mode: string;
  loc: SourceLoc;
};

export type CloseFileStmtNode = {
  kind: "CloseFileStmt";
  fileName: string;
  loc: SourceLoc;
};

export type ReadFileStmtNode = {
  kind: "ReadFileStmt";
  fileName: string;
  target: LValueNode;
  loc: SourceLoc;
};

export type WriteFileStmtNode = {
  kind: "WriteFileStmt";
  fileName: string;
  expr: ExprNode;
  loc: SourceLoc;
};

export type SeekStmtNode = {
  kind: "SeekStmt";
  fileName: string;
  address: ExprNode;
  loc: SourceLoc;
};

export type GetRecordStmtNode = {
  kind: "GetRecordStmt";
  fileName: string;
  target: LValueNode;
  loc: SourceLoc;
};

export type PutRecordStmtNode = {
  kind: "PutRecordStmt";
  fileName: string;
  expr: ExprNode;
  loc: SourceLoc;
};

export type SuperCallStmtNode = {
  kind: "SuperCallStmt";
  methodName?: string;
  args: ExprNode[];
  loc: SourceLoc;
};

export type ProcRefNode = {
  kind: "ProcRef";
  parts: string[];
  loc: SourceLoc;
};

export type ExprNode =
  | BinaryExprNode
  | UnaryExprNode
  | LiteralNode
  | NameExprNode
  | CallExprNode
  | IndexExprNode
  | FieldExprNode
  | NewExprNode
  | EOFExprNode
  | NullExprNode
  | DerefExprNode;

export type BinaryExprNode = {
  kind: "BinaryExpr";
  op: string;
  left: ExprNode;
  right: ExprNode;
  loc: SourceLoc;
};

export type UnaryExprNode = {
  kind: "UnaryExpr";
  op: string;
  expr: ExprNode;
  loc: SourceLoc;
};

export type LiteralNode = {
  kind: "Literal";
  value: unknown;
  literalType: "Integer" | "Real" | "Boolean" | "Char" | "String" | "Date";
  loc: SourceLoc;
};

export type NameExprNode = {
  kind: "NameExpr";
  name: string;
  loc: SourceLoc;
};

export type CallExprNode = {
  kind: "CallExpr";
  callee: ExprNode;
  args: ExprNode[];
  loc: SourceLoc;
};

export type IndexExprNode = {
  kind: "IndexExpr";
  base: ExprNode;
  indices: ExprNode[];
  loc: SourceLoc;
};

export type FieldExprNode = {
  kind: "FieldExpr";
  base: ExprNode;
  field: string;
  loc: SourceLoc;
};

export type NewExprNode = {
  kind: "NewExpr";
  typeName?: string;
  typeSpec?: TypeNode;
  args: ExprNode[];
  loc: SourceLoc;
};

export type EOFExprNode = {
  kind: "EOFExpr";
  fileName: string;
  loc: SourceLoc;
};

export type NullExprNode = {
  kind: "NullExpr";
  loc: SourceLoc;
};

export type LValueNode =
  | NameExprNode
  | IndexExprNode
  | FieldExprNode
  | DerefExprNode;

export type DerefExprNode = {
  kind: "DerefExpr";
  expr: ExprNode;
  loc: SourceLoc;
};

export type TypeNode =
  | BasicTypeNode
  | ArrayTypeNode
  | RecordTypeNode
  | EnumTypeNode
  | SetTypeNode
  | PointerTypeNode
  | FileTypeNode
  | NamedTypeNode;

export type BasicTypeNode = {
  kind: "BasicType";
  name: "INTEGER" | "REAL" | "BOOLEAN" | "CHAR" | "STRING" | "DATE";
  loc: SourceLoc;
};

export type ArrayTypeNode = {
  kind: "ArrayType";
  bounds: ArrayBoundNode[];
  elementType: TypeNode;
  loc: SourceLoc;
};

export type ArrayBoundNode = {
  low: number;
  high: number;
  loc: SourceLoc;
};

export type RecordTypeNode = {
  kind: "RecordType";
  fields: VarDeclNode[];
  loc: SourceLoc;
};

export type EnumTypeNode = {
  kind: "EnumType";
  members: string[];
  loc: SourceLoc;
};

export type SetTypeNode = {
  kind: "SetType";
  baseName: string;
  loc: SourceLoc;
};

export type PointerTypeNode = {
  kind: "PointerType";
  target: TypeNode;
  loc: SourceLoc;
};

export type FileTypeNode =
  | { kind: "TextFileType"; loc: SourceLoc }
  | { kind: "RandomFileType"; recordName: string; loc: SourceLoc };

export type NamedTypeNode = {
  kind: "NamedType";
  name: string;
  loc: SourceLoc;
};
