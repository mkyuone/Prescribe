export type TokenKind =
  | "Identifier"
  | "Integer"
  | "Real"
  | "String"
  | "Char"
  | "Date"
  | "Boolean"
  | "Keyword"
  | "Operator"
  | "Delimiter"
  | "EOF";

export type Token = {
  kind: TokenKind;
  lexeme: string;
  value?: unknown;
  line: number;
  column: number;
};

export const KEYWORDS = new Set([
  "PROGRAM",
  "ENDPROGRAM",
  "DECLARE",
  "CONSTANT",
  "TYPE",
  "ARRAY",
  "OF",
  "RECORD",
  "ENDRECORD",
  "SET",
  "POINTER",
  "TO",
  "CLASS",
  "EXTENDS",
  "PUBLIC",
  "PRIVATE",
  "CONSTRUCTOR",
  "ENDCONSTRUCTOR",
  "ENDCLASS",
  "PROCEDURE",
  "ENDPROCEDURE",
  "FUNCTION",
  "RETURNS",
  "ENDFUNCTION",
  "BYVAL",
  "BYREF",
  "IF",
  "THEN",
  "ELSE",
  "ENDIF",
  "CASE",
  "ENDCASE",
  "OTHERWISE",
  "FOR",
  "TO",
  "STEP",
  "NEXT",
  "WHILE",
  "DO",
  "ENDWHILE",
  "REPEAT",
  "UNTIL",
  "CALL",
  "RETURN",
  "INPUT",
  "OUTPUT",
  "OPENFILE",
  "CLOSEFILE",
  "READFILE",
  "WRITEFILE",
  "SEEK",
  "GETRECORD",
  "PUTRECORD",
  "NEW",
  "NULL",
  "EOF",
  "AND",
  "OR",
  "NOT",
  "DIV",
  "MOD",
  "IN",
  "UNION",
  "INTERSECT",
  "DIFF",
  "TRUE",
  "FALSE",
  "INTEGER",
  "REAL",
  "BOOLEAN",
  "CHAR",
  "STRING",
  "DATE",
  "TEXTFILE",
  "RANDOMFILE",
  "SUPER"
]);

export const OPERATORS = new Set([
  "<-",
  "=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "+",
  "-",
  "*",
  "/",
  "&",
  "^",
  "@"
]);

export const DELIMITERS = new Set(["(", ")", "[", "]", ",", ".", ":"]);
