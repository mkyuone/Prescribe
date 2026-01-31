namespace Prescribe.Core.Frontend;

public enum TokenKind
{
    Identifier,
    Integer,
    Real,
    String,
    Char,
    Boolean,
    Keyword,
    Operator,
    Delimiter,
    EOF
}

public sealed record Token(TokenKind Kind, string Lexeme, int Line, int Column, object? Value = null);

public static class TokenTables
{
    public static readonly HashSet<string> Keywords = new(StringComparer.Ordinal)
    {
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
    };

    public static readonly HashSet<string> Operators = new(StringComparer.Ordinal)
    {
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
    };

    public static readonly HashSet<char> Delimiters = new()
    {
        '(', ')', '[', ']', ',', '.', ':'
    };
}
