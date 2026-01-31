using Prescribe.Core.Diagnostics;

namespace Prescribe.Core.Frontend;

public sealed class Parser
{
    private readonly Lexer _lexer;
    private Token _current;
    private Token _next;

    public Parser(Lexer lexer)
    {
        _lexer = lexer;
        _current = _lexer.NextToken();
        _next = _lexer.NextToken();
    }

    public ProgramNode ParseProgram()
    {
        var loc = Loc();
        ExpectKeyword("PROGRAM");
        var name = ExpectIdentifier();
        var block = ParseBlock();
        ExpectKeyword("ENDPROGRAM");
        return new ProgramNode(name, block, loc);
    }

    private BlockNode ParseBlock()
    {
        var loc = Loc();
        var declarations = new List<DeclarationNode>();
        while (IsDeclarationStart())
        {
            declarations.Add(ParseDeclaration());
        }
        var statements = new List<StatementNode>();
        while (!IsBlockEnd())
        {
            statements.Add(ParseStatement());
        }
        return new BlockNode(declarations, statements, loc);
    }

    private bool IsBlockEnd()
    {
        return IsKeyword("ENDPROGRAM") || IsKeyword("ENDIF") || IsKeyword("ENDCASE") ||
               IsKeyword("NEXT") || IsKeyword("ENDWHILE") || IsKeyword("UNTIL") ||
               IsKeyword("ELSE") || IsKeyword("ENDPROCEDURE") || IsKeyword("ENDFUNCTION") ||
               IsKeyword("ENDCLASS") || IsKeyword("ENDCONSTRUCTOR") || IsAtEnd();
    }

    private bool IsDeclarationStart()
    {
        return IsKeyword("DECLARE") || IsKeyword("CONSTANT") || IsKeyword("TYPE") ||
               IsKeyword("PROCEDURE") || IsKeyword("FUNCTION") || IsKeyword("CLASS");
    }

    private DeclarationNode ParseDeclaration()
    {
        if (IsKeyword("DECLARE")) return ParseVarDecl();
        if (IsKeyword("CONSTANT")) return ParseConstDecl();
        if (IsKeyword("TYPE")) return ParseTypeDecl();
        if (IsKeyword("PROCEDURE")) return ParseProcDecl();
        if (IsKeyword("FUNCTION")) return ParseFuncDecl();
        if (IsKeyword("CLASS")) return ParseClassDecl();
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected declaration.");
    }

    private VarDeclNode ParseVarDecl()
    {
        var loc = Loc();
        ExpectKeyword("DECLARE");
        var name = ExpectIdentifier();
        ExpectDelimiter(":");
        var typeSpec = ParseType();
        return new VarDeclNode(name, typeSpec, loc);
    }

    private ConstDeclNode ParseConstDecl()
    {
        var loc = Loc();
        ExpectKeyword("CONSTANT");
        var name = ExpectIdentifier();
        ExpectOperator("=");
        var expr = ParseExpression();
        return new ConstDeclNode(name, expr, loc);
    }

    private TypeDeclNode ParseTypeDecl()
    {
        var loc = Loc();
        ExpectKeyword("TYPE");
        var name = ExpectIdentifier();
        ExpectOperator("=");
        var typeSpec = ParseTypeSpec();
        return new TypeDeclNode(name, typeSpec, loc);
    }

    private ProcDeclNode ParseProcDecl()
    {
        var loc = Loc();
        ExpectKeyword("PROCEDURE");
        var name = ExpectIdentifier();
        ExpectDelimiter("(");
        var parameters = ParseParams();
        ExpectDelimiter(")");
        var block = ParseBlock();
        ExpectKeyword("ENDPROCEDURE");
        return new ProcDeclNode(name, parameters, block, loc);
    }

    private FuncDeclNode ParseFuncDecl()
    {
        var loc = Loc();
        ExpectKeyword("FUNCTION");
        var name = ExpectIdentifier();
        ExpectDelimiter("(");
        var parameters = ParseParams();
        ExpectDelimiter(")");
        ExpectKeyword("RETURNS");
        var returnType = ParseType();
        var block = ParseBlock();
        ExpectKeyword("ENDFUNCTION");
        return new FuncDeclNode(name, parameters, returnType, block, loc);
    }

    private ClassDeclNode ParseClassDecl()
    {
        var loc = Loc();
        ExpectKeyword("CLASS");
        var name = ExpectIdentifier();
        string? baseName = null;
        if (MatchKeyword("EXTENDS"))
        {
            baseName = ExpectIdentifier();
        }
        var members = new List<IClassMember>();
        var currentAccess = AccessModifier.Public;
        while (!IsKeyword("ENDCLASS"))
        {
            if (IsKeyword("PUBLIC") || IsKeyword("PRIVATE"))
            {
                currentAccess = _current.Lexeme == "PRIVATE" ? AccessModifier.Private : AccessModifier.Public;
                Advance();
                continue;
            }
            if (IsKeyword("DECLARE"))
            {
                var member = ParseVarDecl();
                members.Add(member with { Access = currentAccess });
                continue;
            }
            if (IsKeyword("PROCEDURE"))
            {
                var member = ParseProcDecl();
                members.Add(member with { Access = currentAccess });
                continue;
            }
            if (IsKeyword("FUNCTION"))
            {
                var member = ParseFuncDecl();
                members.Add(member with { Access = currentAccess });
                continue;
            }
            if (IsKeyword("CONSTRUCTOR"))
            {
                var member = ParseConstructorDecl();
                members.Add(member with { Access = currentAccess });
                continue;
            }
            throw Errors.At(ErrorType.SyntaxError, _current.Line, "Unexpected token in class body.");
        }
        ExpectKeyword("ENDCLASS");
        return new ClassDeclNode(name, baseName, members, loc);
    }

    private ConstructorDeclNode ParseConstructorDecl()
    {
        var loc = Loc();
        ExpectKeyword("CONSTRUCTOR");
        var name = ExpectIdentifier();
        ExpectDelimiter("(");
        var parameters = ParseParams();
        ExpectDelimiter(")");
        var block = ParseBlock();
        ExpectKeyword("ENDCONSTRUCTOR");
        return new ConstructorDeclNode(name, parameters, block, loc);
    }

    private List<ParamNode> ParseParams()
    {
        var parameters = new List<ParamNode>();
        if (IsDelimiter(")")) return parameters;
        while (true)
        {
            var loc = Loc();
            var mode = ParamMode.ByVal;
            if (MatchKeyword("BYREF")) mode = ParamMode.ByRef;
            else if (MatchKeyword("BYVAL")) mode = ParamMode.ByVal;
            var name = ExpectIdentifier();
            ExpectDelimiter(":");
            var typeSpec = ParseType();
            parameters.Add(new ParamNode(name, mode, typeSpec, loc));
            if (!MatchDelimiter(",")) break;
        }
        return parameters;
    }

    private StatementNode ParseStatement()
    {
        if (IsKeyword("IF")) return ParseIfStmt();
        if (IsKeyword("CASE")) return ParseCaseStmt();
        if (IsKeyword("FOR")) return ParseForStmt();
        if (IsKeyword("WHILE")) return ParseWhileStmt();
        if (IsKeyword("REPEAT")) return ParseRepeatStmt();
        if (IsKeyword("CALL")) return ParseCallStmt();
        if (IsKeyword("RETURN")) return ParseReturnStmt();
        if (IsKeyword("INPUT")) return ParseInputStmt();
        if (IsKeyword("OUTPUT")) return ParseOutputStmt();
        if (IsKeyword("OPENFILE") || IsKeyword("CLOSEFILE") || IsKeyword("READFILE") ||
            IsKeyword("WRITEFILE") || IsKeyword("SEEK") || IsKeyword("GETRECORD") ||
            IsKeyword("PUTRECORD")) return ParseFileStmt();
        if (IsKeyword("SUPER")) return ParseSuperCallStmt();

        var loc = Loc();
        var target = ParseLValue();
        if (!MatchOperator("<-"))
        {
            throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected '<-' in assignment.");
        }
        var expr = ParseExpression();
        return new AssignStmtNode(target, expr, loc);
    }

    private IfStmtNode ParseIfStmt()
    {
        var loc = Loc();
        ExpectKeyword("IF");
        var condition = ParseExpression();
        ExpectKeyword("THEN");
        var thenBlock = ParseBlock();
        BlockNode? elseBlock = null;
        if (MatchKeyword("ELSE"))
        {
            elseBlock = ParseBlock();
        }
        ExpectKeyword("ENDIF");
        return new IfStmtNode(condition, thenBlock, elseBlock, loc);
    }

    private CaseStmtNode ParseCaseStmt()
    {
        var loc = Loc();
        ExpectKeyword("CASE");
        ExpectKeyword("OF");
        var expr = ParseExpression();
        var branches = new List<CaseBranchNode>();
        BlockNode? otherwiseBlock = null;
        while (!IsKeyword("ENDCASE"))
        {
            if (MatchKeyword("OTHERWISE"))
            {
                ExpectDelimiter(":");
                otherwiseBlock = ParseBlock();
                break;
            }
            var labels = ParseCaseLabels();
            ExpectDelimiter(":");
            var block = ParseBlock();
            branches.Add(new CaseBranchNode(labels, block, labels.Count > 0 ? labels[0].Loc : loc));
        }
        ExpectKeyword("ENDCASE");
        return new CaseStmtNode(expr, branches, otherwiseBlock, loc);
    }

    private List<CaseLabelNode> ParseCaseLabels()
    {
        var labels = new List<CaseLabelNode>();
        labels.Add(ParseCaseLabel());
        while (MatchDelimiter(","))
        {
            labels.Add(ParseCaseLabel());
        }
        return labels;
    }

    private CaseLabelNode ParseCaseLabel()
    {
        var loc = Loc();
        var start = ParseLiteral();
        if (MatchKeyword("TO"))
        {
            var end = ParseLiteral();
            return new CaseRangeNode(start, end, loc);
        }
        return new CaseValueNode(start, loc);
    }

    private ForStmtNode ParseForStmt()
    {
        var loc = Loc();
        ExpectKeyword("FOR");
        var name = ExpectIdentifier();
        ExpectOperator("<-");
        var start = ParseExpression();
        ExpectKeyword("TO");
        var end = ParseExpression();
        ExprNode? step = null;
        if (MatchKeyword("STEP"))
        {
            step = ParseExpression();
        }
        var block = ParseBlock();
        ExpectKeyword("NEXT");
        ExpectIdentifier();
        return new ForStmtNode(name, start, end, step, block, loc);
    }

    private WhileStmtNode ParseWhileStmt()
    {
        var loc = Loc();
        ExpectKeyword("WHILE");
        var condition = ParseExpression();
        ExpectKeyword("DO");
        var block = ParseBlock();
        ExpectKeyword("ENDWHILE");
        return new WhileStmtNode(condition, block, loc);
    }

    private RepeatStmtNode ParseRepeatStmt()
    {
        var loc = Loc();
        ExpectKeyword("REPEAT");
        var block = ParseBlock();
        ExpectKeyword("UNTIL");
        var condition = ParseExpression();
        return new RepeatStmtNode(block, condition, loc);
    }

    private CallStmtNode ParseCallStmt()
    {
        var loc = Loc();
        ExpectKeyword("CALL");
        var callee = ParseProcRef();
        ExpectDelimiter("(");
        var args = ParseArgList();
        ExpectDelimiter(")");
        return new CallStmtNode(callee, args, loc);
    }

    private SuperCallStmtNode ParseSuperCallStmt()
    {
        var loc = Loc();
        ExpectKeyword("SUPER");
        string? methodName = null;
        if (MatchDelimiter("."))
        {
            methodName = ExpectIdentifier();
        }
        ExpectDelimiter("(");
        var args = ParseArgList();
        ExpectDelimiter(")");
        return new SuperCallStmtNode(methodName, args, loc);
    }

    private ReturnStmtNode ParseReturnStmt()
    {
        var loc = Loc();
        ExpectKeyword("RETURN");
        if (IsBlockEnd())
        {
            return new ReturnStmtNode(null, loc);
        }
        var expr = ParseExpression();
        return new ReturnStmtNode(expr, loc);
    }

    private InputStmtNode ParseInputStmt()
    {
        var loc = Loc();
        ExpectKeyword("INPUT");
        var targets = new List<LValueNode> { ParseLValue() };
        while (MatchDelimiter(","))
        {
            targets.Add(ParseLValue());
        }
        return new InputStmtNode(targets, loc);
    }

    private OutputStmtNode ParseOutputStmt()
    {
        var loc = Loc();
        ExpectKeyword("OUTPUT");
        var values = new List<ExprNode> { ParseExpression() };
        while (MatchDelimiter(","))
        {
            values.Add(ParseExpression());
        }
        return new OutputStmtNode(values, loc);
    }

    private FileStmtNode ParseFileStmt()
    {
        if (IsKeyword("OPENFILE")) return ParseOpenFileStmt();
        if (IsKeyword("CLOSEFILE")) return ParseCloseFileStmt();
        if (IsKeyword("READFILE")) return ParseReadFileStmt();
        if (IsKeyword("WRITEFILE")) return ParseWriteFileStmt();
        if (IsKeyword("SEEK")) return ParseSeekStmt();
        if (IsKeyword("GETRECORD")) return ParseGetRecordStmt();
        if (IsKeyword("PUTRECORD")) return ParsePutRecordStmt();
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected file statement.");
    }

    private OpenFileStmtNode ParseOpenFileStmt()
    {
        var loc = Loc();
        ExpectKeyword("OPENFILE");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(",");
        var path = ExpectStringLiteral();
        ExpectDelimiter(",");
        var mode = ExpectStringLiteral();
        ExpectDelimiter(")");
        return new OpenFileStmtNode(fileName, path, mode, loc);
    }

    private CloseFileStmtNode ParseCloseFileStmt()
    {
        var loc = Loc();
        ExpectKeyword("CLOSEFILE");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(")");
        return new CloseFileStmtNode(fileName, loc);
    }

    private ReadFileStmtNode ParseReadFileStmt()
    {
        var loc = Loc();
        ExpectKeyword("READFILE");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(",");
        var target = ParseLValue();
        ExpectDelimiter(")");
        return new ReadFileStmtNode(fileName, target, loc);
    }

    private WriteFileStmtNode ParseWriteFileStmt()
    {
        var loc = Loc();
        ExpectKeyword("WRITEFILE");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(",");
        var expr = ParseExpression();
        ExpectDelimiter(")");
        return new WriteFileStmtNode(fileName, expr, loc);
    }

    private SeekStmtNode ParseSeekStmt()
    {
        var loc = Loc();
        ExpectKeyword("SEEK");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(",");
        var address = ParseExpression();
        ExpectDelimiter(")");
        return new SeekStmtNode(fileName, address, loc);
    }

    private GetRecordStmtNode ParseGetRecordStmt()
    {
        var loc = Loc();
        ExpectKeyword("GETRECORD");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(",");
        var target = ParseLValue();
        ExpectDelimiter(")");
        return new GetRecordStmtNode(fileName, target, loc);
    }

    private PutRecordStmtNode ParsePutRecordStmt()
    {
        var loc = Loc();
        ExpectKeyword("PUTRECORD");
        ExpectDelimiter("(");
        var fileName = ExpectIdentifier();
        ExpectDelimiter(",");
        var expr = ParseExpression();
        ExpectDelimiter(")");
        return new PutRecordStmtNode(fileName, expr, loc);
    }

    private ProcRefNode ParseProcRef()
    {
        var loc = Loc();
        var parts = new List<string> { ExpectIdentifier() };
        while (MatchDelimiter("."))
        {
            parts.Add(ExpectIdentifier());
        }
        return new ProcRefNode(parts, loc);
    }

    private ExprNode ParseExpression() => ParseOr();

    private ExprNode ParseOr()
    {
        var expr = ParseAnd();
        while (MatchKeyword("OR"))
        {
            var right = ParseAnd();
            expr = new BinaryExprNode("OR", expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseAnd()
    {
        var expr = ParseRel();
        while (MatchKeyword("AND"))
        {
            var right = ParseRel();
            expr = new BinaryExprNode("AND", expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseRel()
    {
        var expr = ParseSet();
        if (IsOperator("=") || IsOperator("<>") || IsOperator("<") || IsOperator("<=") ||
            IsOperator(">") || IsOperator(">=") || IsKeyword("IN"))
        {
            var opToken = _current;
            Advance();
            var right = ParseSet();
            expr = new BinaryExprNode(opToken.Lexeme, expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseSet()
    {
        var expr = ParseConcat();
        while (IsKeyword("UNION") || IsKeyword("INTERSECT") || IsKeyword("DIFF"))
        {
            var op = _current.Lexeme;
            Advance();
            var right = ParseConcat();
            expr = new BinaryExprNode(op, expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseConcat()
    {
        var expr = ParseAdd();
        while (MatchOperator("&"))
        {
            var right = ParseAdd();
            expr = new BinaryExprNode("&", expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseAdd()
    {
        var expr = ParseMul();
        while (IsOperator("+") || IsOperator("-"))
        {
            var op = _current.Lexeme;
            Advance();
            var right = ParseMul();
            expr = new BinaryExprNode(op, expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseMul()
    {
        var expr = ParseUnary();
        while (IsOperator("*") || IsOperator("/") || IsKeyword("DIV") || IsKeyword("MOD"))
        {
            var op = _current.Lexeme;
            Advance();
            var right = ParseUnary();
            expr = new BinaryExprNode(op, expr, right, expr.Loc);
        }
        return expr;
    }

    private ExprNode ParseUnary()
    {
        if (IsOperator("+") || IsOperator("-") || IsOperator("@") || IsOperator("^") || IsKeyword("NOT"))
        {
            var loc = Loc();
            var op = _current.Lexeme;
            Advance();
            var expr = ParseUnary();
            if (op == "^")
            {
                return new DerefExprNode(expr, loc);
            }
            return new UnaryExprNode(op, expr, loc);
        }
        return ParsePrimary();
    }

    private ExprNode ParsePrimary()
    {
        var loc = Loc();
        if (IsKeyword("DATE"))
        {
            if (_next.Kind == TokenKind.String)
            {
                return ParseLiteral();
            }
            Advance();
            ExprNode expr = new NameExprNode("DATE", loc);
            while (true)
            {
                if (MatchDelimiter("("))
                {
                    var args = ParseArgList();
                    ExpectDelimiter(")");
                    expr = new CallExprNode(expr, args, expr.Loc);
                    continue;
                }
                if (MatchDelimiter("["))
                {
                    var indices = new List<ExprNode> { ParseExpression() };
                    while (MatchDelimiter(","))
                    {
                        indices.Add(ParseExpression());
                    }
                    ExpectDelimiter("]");
                    expr = new IndexExprNode(expr, indices, expr.Loc);
                    continue;
                }
                if (MatchDelimiter("."))
                {
                    var field = ExpectIdentifier();
                    expr = new FieldExprNode(expr, field, expr.Loc);
                    continue;
                }
                break;
            }
            return expr;
        }
        if (IsBuiltinKeyword())
        {
            var name = _current.Lexeme;
            Advance();
            ExprNode expr = new NameExprNode(name, loc);
            while (true)
            {
                if (MatchDelimiter("("))
                {
                    var args = ParseArgList();
                    ExpectDelimiter(")");
                    expr = new CallExprNode(expr, args, expr.Loc);
                    continue;
                }
                if (MatchDelimiter("["))
                {
                    var indices = new List<ExprNode> { ParseExpression() };
                    while (MatchDelimiter(","))
                    {
                        indices.Add(ParseExpression());
                    }
                    ExpectDelimiter("]");
                    expr = new IndexExprNode(expr, indices, expr.Loc);
                    continue;
                }
                if (MatchDelimiter("."))
                {
                    var field = ExpectIdentifier();
                    expr = new FieldExprNode(expr, field, expr.Loc);
                    continue;
                }
                break;
            }
            return expr;
        }
        if (IsKeyword("EOF"))
        {
            Advance();
            ExpectDelimiter("(");
            var fileName = ExpectIdentifier();
            ExpectDelimiter(")");
            return new EOFExprNode(fileName, loc);
        }
        if (IsKeyword("NEW"))
        {
            Advance();
            if (IsIdentifier())
            {
                var name = ExpectIdentifier();
                if (IsDelimiter("("))
                {
                    ExpectDelimiter("(");
                    var args = ParseArgList();
                    ExpectDelimiter(")");
                    return new NewExprNode(name, null, args, loc);
                }
                return new NewExprNode(null, new NamedTypeNode(name, loc), Array.Empty<ExprNode>(), loc);
            }
            var typeSpec = ParseTypeSpec();
            return new NewExprNode(null, typeSpec, Array.Empty<ExprNode>(), loc);
        }
        if (IsKeyword("NULL"))
        {
            Advance();
            return new NullExprNode(loc);
        }
        if (IsLiteralStart())
        {
            return ParseLiteral();
        }
        if (IsIdentifier())
        {
            ExprNode expr = new NameExprNode(ExpectIdentifier(), loc);
            while (true)
            {
                if (MatchDelimiter("("))
                {
                    var args = ParseArgList();
                    ExpectDelimiter(")");
                    expr = new CallExprNode(expr, args, expr.Loc);
                    continue;
                }
                if (MatchDelimiter("["))
                {
                    var indices = new List<ExprNode> { ParseExpression() };
                    while (MatchDelimiter(","))
                    {
                        indices.Add(ParseExpression());
                    }
                    ExpectDelimiter("]");
                    expr = new IndexExprNode(expr, indices, expr.Loc);
                    continue;
                }
                if (MatchDelimiter("."))
                {
                    var field = ExpectIdentifier();
                    expr = new FieldExprNode(expr, field, expr.Loc);
                    continue;
                }
                break;
            }
            return expr;
        }
        if (MatchDelimiter("("))
        {
            var innerExpr = ParseExpression();
            ExpectDelimiter(")");
            return innerExpr;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected expression.");
    }

    private bool IsBuiltinKeyword()
    {
        return _current.Kind == TokenKind.Keyword && new[] { "INT", "REAL", "STRING", "CHAR", "BOOLEAN" }.Contains(_current.Lexeme, StringComparer.Ordinal);
    }

    private LiteralNode ParseLiteral()
    {
        var loc = Loc();
        if (IsKeyword("DATE"))
        {
            Advance();
            var value = ExpectStringLiteral();
            return new LiteralNode(value, LiteralType.Date, loc);
        }
        if (_current.Kind == TokenKind.Integer)
        {
            var value = (int)(_current.Value ?? 0);
            Advance();
            return new LiteralNode(value, LiteralType.Integer, loc);
        }
        if (_current.Kind == TokenKind.Real)
        {
            var value = (double)(_current.Value ?? 0.0);
            Advance();
            return new LiteralNode(value, LiteralType.Real, loc);
        }
        if (_current.Kind == TokenKind.Boolean)
        {
            var value = (bool)(_current.Value ?? false);
            Advance();
            return new LiteralNode(value, LiteralType.Boolean, loc);
        }
        if (_current.Kind == TokenKind.Char)
        {
            var value = (string)(_current.Value ?? string.Empty);
            Advance();
            return new LiteralNode(value, LiteralType.Char, loc);
        }
        if (_current.Kind == TokenKind.String)
        {
            var value = (string)(_current.Value ?? string.Empty);
            Advance();
            return new LiteralNode(value, LiteralType.String, loc);
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected literal.");
    }

    private List<ExprNode> ParseArgList()
    {
        var args = new List<ExprNode>();
        if (IsDelimiter(")")) return args;
        args.Add(ParseExpression());
        while (MatchDelimiter(","))
        {
            args.Add(ParseExpression());
        }
        return args;
    }

    private LValueNode ParseLValue()
    {
        var loc = Loc();
        if (IsOperator("^"))
        {
            var derefExpr = ParseUnary();
            if (derefExpr is not DerefExprNode deref)
            {
                throw Errors.At(ErrorType.SyntaxError, _current.Line, "Invalid dereference.");
            }
            return deref;
        }
        if (!IsIdentifier())
        {
            throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected identifier for lvalue.");
        }
        ExprNode expr = new NameExprNode(ExpectIdentifier(), loc);
        while (true)
        {
            if (MatchDelimiter("["))
            {
                var indices = new List<ExprNode> { ParseExpression() };
                while (MatchDelimiter(","))
                {
                    indices.Add(ParseExpression());
                }
                ExpectDelimiter("]");
                expr = new IndexExprNode(expr, indices, expr.Loc);
                continue;
            }
            if (MatchDelimiter("."))
            {
                var field = ExpectIdentifier();
                expr = new FieldExprNode(expr, field, expr.Loc);
                continue;
            }
            break;
        }
        return (LValueNode)expr;
    }

    private TypeNode ParseType() => ParseTypeSpec();

    private TypeNode ParseTypeSpec()
    {
        var loc = Loc();
        if (IsKeyword("INTEGER") || IsKeyword("REAL") || IsKeyword("BOOLEAN") ||
            IsKeyword("CHAR") || IsKeyword("STRING") || IsKeyword("DATE"))
        {
            var name = _current.Lexeme switch
            {
                "INTEGER" => BasicTypeName.INTEGER,
                "REAL" => BasicTypeName.REAL,
                "BOOLEAN" => BasicTypeName.BOOLEAN,
                "CHAR" => BasicTypeName.CHAR,
                "STRING" => BasicTypeName.STRING,
                _ => BasicTypeName.DATE
            };
            Advance();
            return new BasicTypeNode(name, loc);
        }
        if (MatchKeyword("ARRAY"))
        {
            ExpectDelimiter("[");
            var bounds = new List<ArrayBoundNode> { ParseBounds() };
            while (MatchDelimiter(","))
            {
                bounds.Add(ParseBounds());
            }
            ExpectDelimiter("]");
            ExpectKeyword("OF");
            var elementType = ParseTypeSpec();
            return new ArrayTypeNode(bounds, elementType, loc);
        }
        if (MatchKeyword("RECORD"))
        {
            var fields = new List<VarDeclNode>();
            while (!IsKeyword("ENDRECORD"))
            {
                var fieldLoc = Loc();
                var name = ExpectIdentifier();
                ExpectDelimiter(":");
                var typeSpec = ParseTypeSpec();
                fields.Add(new VarDeclNode(name, typeSpec, fieldLoc));
            }
            ExpectKeyword("ENDRECORD");
            return new RecordTypeNode(fields, loc);
        }
        if (MatchDelimiter("("))
        {
            var members = new List<string> { ExpectIdentifier() };
            while (MatchDelimiter(","))
            {
                members.Add(ExpectIdentifier());
            }
            ExpectDelimiter(")");
            return new EnumTypeNode(members, loc);
        }
        if (MatchKeyword("SET"))
        {
            ExpectKeyword("OF");
            var baseName = ExpectIdentifier();
            return new SetTypeNode(baseName, loc);
        }
        if (MatchKeyword("POINTER"))
        {
            ExpectKeyword("TO");
            var target = ParseTypeSpec();
            return new PointerTypeNode(target, loc);
        }
        if (MatchKeyword("TEXTFILE"))
        {
            return new TextFileTypeNode(loc);
        }
        if (MatchKeyword("RANDOMFILE"))
        {
            ExpectKeyword("OF");
            var recordName = ExpectIdentifier();
            return new RandomFileTypeNode(recordName, loc);
        }
        if (IsIdentifier())
        {
            var name = ExpectIdentifier();
            return new NamedTypeNode(name, loc);
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected type.");
    }

    private ArrayBoundNode ParseBounds()
    {
        var loc = Loc();
        var low = ExpectIntegerLiteral();
        ExpectDelimiter(":");
        var high = ExpectIntegerLiteral();
        return new ArrayBoundNode(low, high, loc);
    }

    private string ExpectIdentifier()
    {
        if (_current.Kind == TokenKind.Identifier)
        {
            var name = _current.Lexeme;
            Advance();
            return name;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected identifier.");
    }

    private string ExpectStringLiteral()
    {
        if (_current.Kind == TokenKind.String)
        {
            var value = (string)(_current.Value ?? string.Empty);
            Advance();
            return value;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected string literal.");
    }

    private int ExpectIntegerLiteral()
    {
        if (_current.Kind == TokenKind.Integer)
        {
            var value = (int)(_current.Value ?? 0);
            Advance();
            return value;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, "Expected integer literal.");
    }

    private void ExpectKeyword(string name)
    {
        if (IsKeyword(name))
        {
            Advance();
            return;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, $"Expected keyword {name}.");
    }

    private bool MatchKeyword(string name)
    {
        if (IsKeyword(name))
        {
            Advance();
            return true;
        }
        return false;
    }

    private bool IsKeyword(string name) => _current.Kind == TokenKind.Keyword && _current.Lexeme == name;

    private void ExpectOperator(string op)
    {
        if (IsOperator(op))
        {
            Advance();
            return;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, $"Expected operator {op}.");
    }

    private bool MatchOperator(string op)
    {
        if (IsOperator(op))
        {
            Advance();
            return true;
        }
        return false;
    }

    private bool IsOperator(string op) => _current.Kind == TokenKind.Operator && _current.Lexeme == op;

    private void ExpectDelimiter(string delim)
    {
        if (IsDelimiter(delim))
        {
            Advance();
            return;
        }
        throw Errors.At(ErrorType.SyntaxError, _current.Line, $"Expected '{delim}'.");
    }

    private bool MatchDelimiter(string delim)
    {
        if (IsDelimiter(delim))
        {
            Advance();
            return true;
        }
        return false;
    }

    private bool IsDelimiter(string delim) => _current.Kind == TokenKind.Delimiter && _current.Lexeme == delim;

    private bool IsIdentifier() => _current.Kind == TokenKind.Identifier;

    private bool IsLiteralStart()
    {
        return _current.Kind == TokenKind.Integer || _current.Kind == TokenKind.Real || _current.Kind == TokenKind.Boolean ||
               _current.Kind == TokenKind.Char || _current.Kind == TokenKind.String || IsKeyword("DATE");
    }

    private void Advance()
    {
        _current = _next;
        _next = _lexer.NextToken();
    }

    private bool IsAtEnd() => _current.Kind == TokenKind.EOF;

    private SourceLoc Loc() => new(_current.Line, _current.Column);

}
