using Prescribe.Core.Diagnostics;
using Prescribe.Core.Frontend;
using Prescribe.Core.Util;

namespace Prescribe.Core.Semantics;

public sealed record SemanticResult(
    Dictionary<ExprNode, TypeSymbol> TypeMap,
    Dictionary<string, object?> ConstValues,
    Dictionary<string, ClassInfo> ClassInfos,
    Scope GlobalScope);

public sealed class TypeChecker
{
    private readonly Dictionary<ExprNode, TypeSymbol> _typeMap = new(ReferenceEqualityComparer<ExprNode>.Instance);
    private readonly Dictionary<string, object?> _constValues = new(StringComparer.Ordinal);
    private readonly Dictionary<string, ClassInfo> _classInfos = new(StringComparer.Ordinal);
    private readonly Scope _globalScope = new();
    private Scope _currentScope;
    private ClassInfo? _currentClass;
    private DeclarationNode? _currentFunction;
    private readonly ConstEnv _constEnv = new();
    private readonly HashSet<string> _loopVars = new(StringComparer.Ordinal);
    private readonly HashSet<string> _builtinNames = new(StringComparer.Ordinal)
    {
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
    };

    public TypeChecker()
    {
        _currentScope = _globalScope;
    }

    public SemanticResult Check(ProgramNode program)
    {
        InstallBuiltins();
        Predeclare(program.Block.Declarations);
        VisitBlock(program.Block);
        return new SemanticResult(_typeMap, _constValues, _classInfos, _globalScope);
    }

    private void InstallBuiltins()
    {
        DefineType("INTEGER", Types.Integer);
        DefineType("REAL", Types.Real);
        DefineType("BOOLEAN", Types.Boolean);
        DefineType("CHAR", Types.Char);
        DefineType("STRING", Types.String);
        DefineType("DATE", Types.Date);

        var builtins = new List<(string name, TypeSymbol? returnType)>
        {
            ("LENGTH", Types.Integer),
            ("RIGHT", Types.String),
            ("MID", Types.String),
            ("LCASE", Types.String),
            ("UCASE", Types.String),
            ("INT", Types.Integer),
            ("REAL", Types.Real),
            ("STRING", Types.String),
            ("CHAR", Types.Char),
            ("BOOLEAN", Types.Boolean),
            ("DATE", Types.Date),
            ("RAND", Types.Real),
            ("ORD", Types.Integer),
            ("ENUMVALUE", null),
            ("SIZE", Types.Integer)
        };

        foreach (var (name, type) in builtins)
        {
            _currentScope.Define(new Symbol(SymbolKind.Func, name, type));
        }
    }

    private void DefineType(string name, TypeSymbol type)
    {
        _currentScope.Define(new Symbol(SymbolKind.Type, name, type));
    }

    private void Predeclare(IReadOnlyList<DeclarationNode> decls)
    {
        foreach (var decl in decls)
        {
            if (decl is TypeDeclNode typeDecl)
            {
                var type = ResolveType(typeDecl.TypeSpec, typeDecl.Loc.Line, true, typeDecl.Name);
                _currentScope.Define(new Symbol(SymbolKind.Type, typeDecl.Name, type, typeDecl));
            }
            if (decl is ClassDeclNode classDecl)
            {
                var classType = new ClassType(classDecl.Name);
                _currentScope.Define(new Symbol(SymbolKind.Class, classDecl.Name, classType, classDecl));
                _classInfos[classDecl.Name] = new ClassInfo(
                    classDecl.Name,
                    classDecl.BaseName,
                    new Dictionary<string, Symbol>(StringComparer.Ordinal),
                    new Dictionary<string, Symbol>(StringComparer.Ordinal),
                    null,
                    classDecl
                );
            }
        }

        foreach (var decl in decls)
        {
            if (decl is ProcDeclNode proc)
            {
                _currentScope.Define(new Symbol(SymbolKind.Proc, proc.Name, null, proc));
            }
            if (decl is FuncDeclNode func)
            {
                var returnType = ResolveType(func.ReturnType, func.Loc.Line);
                _currentScope.Define(new Symbol(SymbolKind.Func, func.Name, returnType, func));
            }
        }

        foreach (var decl in decls)
        {
            if (decl is ClassDeclNode classDecl)
            {
                PredeclareClassMembers(classDecl);
            }
        }
    }

    private void PredeclareClassMembers(ClassDeclNode decl)
    {
        if (!_classInfos.TryGetValue(decl.Name, out var classInfo)) return;
        foreach (var member in decl.Members)
        {
            switch (member)
            {
                case VarDeclNode varDecl:
                {
                    var type = ResolveType(varDecl.TypeSpec, varDecl.Loc.Line);
                    classInfo.Fields[varDecl.Name] = new Symbol(SymbolKind.Field, varDecl.Name, type, varDecl, varDecl.Access ?? AccessModifier.Public, decl.Name);
                    break;
                }
                case ProcDeclNode procDecl:
                    classInfo.Methods[procDecl.Name] = new Symbol(SymbolKind.Method, procDecl.Name, null, procDecl, procDecl.Access ?? AccessModifier.Public, decl.Name);
                    break;
                case FuncDeclNode funcDecl:
                {
                    var returnType = ResolveType(funcDecl.ReturnType, funcDecl.Loc.Line);
                    classInfo.Methods[funcDecl.Name] = new Symbol(SymbolKind.Method, funcDecl.Name, returnType, funcDecl, funcDecl.Access ?? AccessModifier.Public, decl.Name);
                    break;
                }
                case ConstructorDeclNode ctorDecl:
                    classInfo = classInfo with { Constructor = new Symbol(SymbolKind.Constructor, ctorDecl.Name, null, ctorDecl, ctorDecl.Access ?? AccessModifier.Public, decl.Name) };
                    _classInfos[decl.Name] = classInfo;
                    break;
            }
        }
    }

    private void VisitBlock(BlockNode block)
    {
        var previous = _currentScope;
        _currentScope = new Scope(previous);
        foreach (var decl in block.Declarations)
        {
            VisitDeclaration(decl);
        }
        foreach (var stmt in block.Statements)
        {
            VisitStatement(stmt);
        }
        _currentScope = previous;
    }

    private void VisitDeclaration(DeclarationNode decl)
    {
        switch (decl)
        {
            case VarDeclNode varDecl:
                VisitVarDecl(varDecl);
                break;
            case ConstDeclNode constDecl:
                VisitConstDecl(constDecl);
                break;
            case TypeDeclNode typeDecl:
                VisitTypeDecl(typeDecl);
                break;
            case ProcDeclNode procDecl:
                VisitProcDecl(procDecl);
                break;
            case FuncDeclNode funcDecl:
                VisitFuncDecl(funcDecl);
                break;
            case ClassDeclNode classDecl:
                VisitClassDecl(classDecl);
                break;
        }
    }

    private void VisitTypeDecl(TypeDeclNode decl)
    {
        var sym = _currentScope.Lookup(decl.Name);
        if (decl.TypeSpec is EnumTypeNode && sym?.Type is EnumType enumType)
        {
            for (var i = 0; i < enumType.Members.Count; i += 1)
            {
                var memberName = enumType.Members[i];
                _currentScope.Define(new Symbol(SymbolKind.EnumMember, memberName, enumType));
                _constEnv[memberName] = new EnumConst(enumType.Name, i);
            }
        }
    }

    private void VisitVarDecl(VarDeclNode decl)
    {
        var type = ResolveType(decl.TypeSpec, decl.Loc.Line);
        _currentScope.Define(new Symbol(SymbolKind.Var, decl.Name, type, decl));
    }

    private void VisitConstDecl(ConstDeclNode decl)
    {
        var type = CheckExpr(decl.Expr);
        var value = ConstEval.EvalConst(decl.Expr, _constEnv);
        _currentScope.Define(new Symbol(SymbolKind.Const, decl.Name, type, decl));
        _constValues[decl.Name] = ConstEval.ConstToRuntime(value);
        _constEnv[decl.Name] = value;
    }

    private void VisitProcDecl(ProcDeclNode decl)
    {
        var previous = _currentFunction;
        _currentFunction = decl;
        var prevScope = _currentScope;
        _currentScope = new Scope(prevScope);
        foreach (var param in decl.Params)
        {
            var type = ResolveType(param.TypeSpec, param.Loc.Line);
            _currentScope.Define(new Symbol(SymbolKind.Param, param.Name, type, param));
        }
        VisitBlock(decl.Block);
        _currentScope = prevScope;
        _currentFunction = previous;
    }

    private void VisitFuncDecl(FuncDeclNode decl)
    {
        var previous = _currentFunction;
        _currentFunction = decl;
        var prevScope = _currentScope;
        _currentScope = new Scope(prevScope);
        foreach (var param in decl.Params)
        {
            var type = ResolveType(param.TypeSpec, param.Loc.Line);
            _currentScope.Define(new Symbol(SymbolKind.Param, param.Name, type, param));
        }
        VisitBlock(decl.Block);
        _currentScope = prevScope;
        _currentFunction = previous;
    }

    private void VisitClassDecl(ClassDeclNode decl)
    {
        if (!_classInfos.TryGetValue(decl.Name, out var classInfo)) return;
        var previousClass = _currentClass;
        _currentClass = classInfo;
        foreach (var member in decl.Members)
        {
            switch (member)
            {
                case ProcDeclNode proc:
                    VisitMethod(proc);
                    break;
                case FuncDeclNode func:
                    VisitMethod(func);
                    break;
                case ConstructorDeclNode ctor:
                    VisitConstructor(ctor);
                    break;
            }
        }
        _currentClass = previousClass;
    }

    private void VisitMethod(DeclarationNode member)
    {
        switch (member)
        {
            case ProcDeclNode proc:
            {
                var prevScope = _currentScope;
                _currentScope = new Scope(prevScope);
                foreach (var param in proc.Params)
                {
                    var type = ResolveType(param.TypeSpec, param.Loc.Line);
                    _currentScope.Define(new Symbol(SymbolKind.Param, param.Name, type, param));
                }
                VisitBlock(proc.Block);
                _currentScope = prevScope;
                break;
            }
            case FuncDeclNode func:
            {
                var prevScope = _currentScope;
                _currentScope = new Scope(prevScope);
                foreach (var param in func.Params)
                {
                    var type = ResolveType(param.TypeSpec, param.Loc.Line);
                    _currentScope.Define(new Symbol(SymbolKind.Param, param.Name, type, param));
                }
                VisitBlock(func.Block);
                _currentScope = prevScope;
                break;
            }
        }
    }

    private void VisitConstructor(ConstructorDeclNode member)
    {
        var prevScope = _currentScope;
        _currentScope = new Scope(prevScope);
        foreach (var param in member.Params)
        {
            var type = ResolveType(param.TypeSpec, param.Loc.Line);
            _currentScope.Define(new Symbol(SymbolKind.Param, param.Name, type, param));
        }
        VisitBlock(member.Block);
        _currentScope = prevScope;
    }

    private void VisitStatement(StatementNode stmt)
    {
        switch (stmt)
        {
            case AssignStmtNode assign:
                VisitAssign(assign);
                break;
            case IfStmtNode ifStmt:
                VisitIf(ifStmt);
                break;
            case CaseStmtNode caseStmt:
                VisitCase(caseStmt);
                break;
            case ForStmtNode forStmt:
                VisitFor(forStmt);
                break;
            case WhileStmtNode whileStmt:
                VisitWhile(whileStmt);
                break;
            case RepeatStmtNode repeatStmt:
                VisitRepeat(repeatStmt);
                break;
            case CallStmtNode callStmt:
                VisitCallStmt(callStmt);
                break;
            case ReturnStmtNode returnStmt:
                VisitReturn(returnStmt);
                break;
            case InputStmtNode inputStmt:
                VisitInput(inputStmt);
                break;
            case OutputStmtNode outputStmt:
                VisitOutput(outputStmt);
                break;
            case FileStmtNode fileStmt:
                VisitFileStmt(fileStmt);
                break;
            case SuperCallStmtNode superCall:
                VisitSuperCall(superCall);
                break;
        }
    }

    private void VisitAssign(AssignStmtNode stmt)
    {
        if (stmt.Target is NameExprNode name && _loopVars.Contains(name.Name))
        {
            throw Errors.At(ErrorType.AccessError, stmt.Loc.Line, "Cannot assign to loop variable.");
        }
        var targetType = CheckLValue(stmt.Target);
        var exprType = CheckExpr(stmt.Expr);
        if (!Types.IsAssignable(targetType, exprType))
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "Assignment type mismatch.");
        }
    }

    private void VisitIf(IfStmtNode stmt)
    {
        var condType = CheckExpr(stmt.Condition);
        if (condType.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "IF condition must be BOOLEAN.");
        VisitBlock(stmt.ThenBlock);
        if (stmt.ElseBlock != null) VisitBlock(stmt.ElseBlock);
    }

    private void VisitCase(CaseStmtNode stmt)
    {
        var exprType = CheckExpr(stmt.Expr);
        if (exprType.Kind is not (TypeKind.Integer or TypeKind.Char or TypeKind.Enum or TypeKind.Date))
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "CASE expression must be INTEGER, CHAR, ENUM, or DATE.");
        }
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var branch in stmt.Branches)
        {
            foreach (var label in branch.Labels)
            {
                if (label is CaseValueNode cv)
                {
                    var litType = LiteralTypeOf(cv.Value);
                    if (!Types.TypeEquals(exprType, litType))
                    {
                        throw Errors.At(ErrorType.TypeError, cv.Loc.Line, "CASE label type mismatch.");
                    }
                    var key = CaseLabelKey(cv.Value);
                    if (!seen.Add(key)) throw Errors.At(ErrorType.SyntaxError, cv.Loc.Line, "Duplicate CASE label.");
                }
                else if (label is CaseRangeNode cr)
                {
                    var startType = LiteralTypeOf(cr.Start);
                    var endType = LiteralTypeOf(cr.End);
                    if (!Types.TypeEquals(exprType, startType) || !Types.TypeEquals(exprType, endType))
                    {
                        throw Errors.At(ErrorType.TypeError, cr.Loc.Line, "CASE range type mismatch.");
                    }
                }
            }
            VisitBlock(branch.Block);
        }
        if (stmt.OtherwiseBlock != null) VisitBlock(stmt.OtherwiseBlock);
    }

    private void VisitFor(ForStmtNode stmt)
    {
        var varSym = _currentScope.Lookup(stmt.Name);
        if (varSym == null || varSym.Kind != SymbolKind.Var || varSym.Type?.Kind != TypeKind.Integer)
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "FOR variable must be INTEGER.");
        }
        var startType = CheckExpr(stmt.Start);
        var endType = CheckExpr(stmt.End);
        if (startType.Kind != TypeKind.Integer || endType.Kind != TypeKind.Integer)
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "FOR bounds must be INTEGER.");
        }
        if (stmt.Step != null)
        {
            var stepType = CheckExpr(stmt.Step);
            if (stepType.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "FOR step must be INTEGER.");
        }
        _loopVars.Add(stmt.Name);
        VisitBlock(stmt.Block);
        _loopVars.Remove(stmt.Name);
    }

    private void VisitWhile(WhileStmtNode stmt)
    {
        var condType = CheckExpr(stmt.Condition);
        if (condType.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "WHILE condition must be BOOLEAN.");
        VisitBlock(stmt.Block);
    }

    private void VisitRepeat(RepeatStmtNode stmt)
    {
        VisitBlock(stmt.Block);
        var condType = CheckExpr(stmt.Condition);
        if (condType.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "UNTIL condition must be BOOLEAN.");
    }

    private void VisitCallStmt(CallStmtNode stmt)
    {
        var callee = ResolveProcRef(stmt);
        if (callee == null || (callee.Kind != SymbolKind.Proc && callee.Kind != SymbolKind.Method))
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "CALL requires a procedure.");
        }
        CheckArgs(stmt.Args, callee);
    }

    private void VisitReturn(ReturnStmtNode stmt)
    {
        if (_currentFunction == null) return;
        if (_currentFunction is ProcDeclNode)
        {
            if (stmt.Expr != null) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "RETURN with value in procedure.");
            return;
        }
        if (_currentFunction is FuncDeclNode func)
        {
            if (stmt.Expr == null) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "RETURN requires a value in function.");
            var expected = ResolveType(func.ReturnType, stmt.Loc.Line);
            var actual = CheckExpr(stmt.Expr);
            if (!Types.IsAssignable(expected, actual))
            {
                throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "RETURN type mismatch.");
            }
        }
    }

    private void VisitInput(InputStmtNode stmt)
    {
        foreach (var target in stmt.Targets)
        {
            CheckLValue(target);
        }
    }

    private void VisitOutput(OutputStmtNode stmt)
    {
        foreach (var expr in stmt.Values)
        {
            CheckExpr(expr);
        }
    }

    private void VisitFileStmt(FileStmtNode stmt)
    {
        switch (stmt)
        {
            case OpenFileStmtNode open:
            {
                var sym = _currentScope.Lookup(open.FileName);
                if (sym?.Type == null || (sym.Type.Kind != TypeKind.TextFile && sym.Type.Kind != TypeKind.RandomFile))
                {
                    throw Errors.At(ErrorType.TypeError, open.Loc.Line, "OPENFILE requires a file variable.");
                }
                return;
            }
            case CloseFileStmtNode close:
            {
                var sym = _currentScope.Lookup(close.FileName);
                if (sym?.Type == null || (sym.Type.Kind != TypeKind.TextFile && sym.Type.Kind != TypeKind.RandomFile))
                {
                    throw Errors.At(ErrorType.TypeError, close.Loc.Line, "CLOSEFILE requires a file variable.");
                }
                return;
            }
            case ReadFileStmtNode read:
                CheckLValue(read.Target);
                return;
            case WriteFileStmtNode write:
                CheckExpr(write.Expr);
                return;
            case SeekStmtNode seek:
            {
                var addrType = CheckExpr(seek.Address);
                if (addrType.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, seek.Loc.Line, "SEEK address must be INTEGER.");
                return;
            }
            case GetRecordStmtNode get:
                CheckLValue(get.Target);
                return;
            case PutRecordStmtNode put:
                CheckExpr(put.Expr);
                return;
        }
    }

    private void VisitSuperCall(SuperCallStmtNode stmt)
    {
        if (_currentClass == null)
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "SUPER can only be used in a class.");
        }
    }

    private TypeSymbol CheckExpr(ExprNode expr)
    {
        if (_typeMap.TryGetValue(expr, out var cached)) return cached;
        TypeSymbol result;
        switch (expr)
        {
            case LiteralNode lit:
                result = LiteralTypeOf(lit);
                break;
            case NameExprNode name:
                result = NameType(name);
                break;
            case BinaryExprNode binary:
                result = CheckBinary(binary);
                break;
            case UnaryExprNode unary:
                result = CheckUnary(unary);
                break;
            case CallExprNode call:
                result = CheckCallExpr(call);
                break;
            case IndexExprNode index:
                result = CheckIndex(index);
                break;
            case FieldExprNode field:
                result = CheckField(field);
                break;
            case NewExprNode n:
                result = CheckNew(n);
                break;
            case EOFExprNode:
                result = Types.Boolean;
                break;
            case NullExprNode:
                result = Types.Null;
                break;
            case DerefExprNode deref:
                result = CheckDeref(deref);
                break;
            default:
                throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Unknown expression.");
        }
        _typeMap[expr] = result;
        return result;
    }

    private TypeSymbol CheckBinary(BinaryExprNode expr)
    {
        var left = CheckExpr(expr.Left);
        var right = CheckExpr(expr.Right);
        var op = expr.Op;

        if (op is "+" or "-" or "*")
        {
            if (left.Kind == TypeKind.Integer && right.Kind == TypeKind.Integer) return Types.Integer;
            if (left.Kind == TypeKind.Real && right.Kind == TypeKind.Real) return Types.Real;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Arithmetic requires matching numeric types.");
        }
        if (op == "/")
        {
            if (left.Kind == TypeKind.Integer && right.Kind == TypeKind.Integer) return Types.Real;
            if (left.Kind == TypeKind.Real && right.Kind == TypeKind.Real) return Types.Real;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Division requires numeric types.");
        }
        if (op is "DIV" or "MOD")
        {
            if (left.Kind == TypeKind.Integer && right.Kind == TypeKind.Integer) return Types.Integer;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "DIV/MOD require INTEGER.");
        }
        if (op == "&")
        {
            if ((left.Kind == TypeKind.String || left.Kind == TypeKind.Char) && (right.Kind == TypeKind.String || right.Kind == TypeKind.Char)) return Types.String;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Concatenation requires STRING/CHAR.");
        }
        if (op is "=" or "<>" or "<" or "<=" or ">" or ">=")
        {
            if (!Types.TypeEquals(left, right)) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Comparison types must match.");
            if (left.Kind == TypeKind.Boolean)
            {
                if (op != "=" && op != "<>") throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "BOOLEAN supports only = and <>.");
                return Types.Boolean;
            }
            if (!Types.IsComparable(left)) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Type not comparable.");
            return Types.Boolean;
        }
        if (op == "IN")
        {
            if (left is EnumType enumType && right is SetType setType && setType.Base.Name == enumType.Name) return Types.Boolean;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "IN requires ENUM and SET OF ENUM.");
        }
        if (op is "UNION" or "INTERSECT" or "DIFF")
        {
            if (left is SetType setA && right is SetType setB && setA.Base.Name == setB.Base.Name) return left;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Set operators require matching SET types.");
        }
        if (op is "AND" or "OR")
        {
            if (left.Kind == TypeKind.Boolean && right.Kind == TypeKind.Boolean) return Types.Boolean;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Boolean operator requires BOOLEAN.");
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Unsupported binary operator.");
    }

    private TypeSymbol CheckUnary(UnaryExprNode expr)
    {
        var operand = CheckExpr(expr.Expr);
        if (expr.Op is "+" or "-")
        {
            if (operand.Kind == TypeKind.Integer) return Types.Integer;
            if (operand.Kind == TypeKind.Real) return Types.Real;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Unary +/- requires numeric type.");
        }
        if (expr.Op == "NOT")
        {
            if (operand.Kind == TypeKind.Boolean) return Types.Boolean;
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "NOT requires BOOLEAN.");
        }
        if (expr.Op == "@")
        {
            if (!IsLValueExpr(expr.Expr)) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "@ requires lvalue.");
            return new PointerType(operand);
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid unary operator.");
    }

    private TypeSymbol CheckDeref(DerefExprNode expr)
    {
        var inner = CheckExpr(expr.Expr);
        if (inner is not PointerType ptr) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "^ requires POINTER.");
        return ptr.Target;
    }

    private TypeSymbol CheckCallExpr(CallExprNode expr)
    {
        if (expr.Callee is NameExprNode nameExpr)
        {
            var sym = _currentScope.Lookup(nameExpr.Name);
            var upper = nameExpr.Name.ToUpperInvariant();
            if (_builtinNames.Contains(upper))
            {
                return CheckBuiltinCall(upper, expr);
            }
            if (sym == null) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown function.");
            if (sym.Kind != SymbolKind.Func && sym.Kind != SymbolKind.Method) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Call requires function.");
            CheckArgs(expr.Args, sym);
            return sym.Type ?? Types.Integer;
        }
        if (expr.Callee is FieldExprNode field)
        {
            var baseType = CheckExpr(field.Base);
            if (baseType is not ClassType classType) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Method call requires CLASS.");
            if (!_classInfos.TryGetValue(classType.Name, out var classInfo)) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown class.");
            if (!classInfo.Methods.TryGetValue(field.Field, out var method)) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown method.");
            if (method.Access == AccessModifier.Private && method.OwnerClass != _currentClass?.Name)
            {
                throw Errors.At(ErrorType.AccessError, expr.Loc.Line, "Private member access.");
            }
            CheckArgs(expr.Args, method);
            return method.Type ?? Types.Integer;
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid call target.");
    }

    private TypeSymbol CheckBuiltinCall(string name, CallExprNode expr)
    {
        switch (name)
        {
            case "RAND":
                if (expr.Args.Count != 0) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "RAND takes no arguments.");
                return Types.Real;
            case "LENGTH":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.String);
                return Types.Integer;
            case "RIGHT":
                RequireArgs(expr, 2);
                RequireType(expr.Args[0], Types.String);
                RequireType(expr.Args[1], Types.Integer);
                return Types.String;
            case "MID":
                RequireArgs(expr, 3);
                RequireType(expr.Args[0], Types.String);
                RequireType(expr.Args[1], Types.Integer);
                RequireType(expr.Args[2], Types.Integer);
                return Types.String;
            case "LCASE":
            case "UCASE":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.String);
                return Types.String;
            case "INT":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.Real);
                return Types.Integer;
            case "REAL":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.Integer);
                return Types.Real;
            case "CHAR":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.Integer);
                return Types.Char;
            case "BOOLEAN":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.String);
                return Types.Boolean;
            case "DATE":
                RequireArgs(expr, 1);
                RequireType(expr.Args[0], Types.String);
                return Types.Date;
            case "STRING":
                RequireArgs(expr, 1);
                {
                    var t = CheckExpr(expr.Args[0]);
                    if (t.Kind is TypeKind.Array or TypeKind.Record or TypeKind.Set or TypeKind.Pointer or TypeKind.Class)
                    {
                        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "STRING cannot convert this type.");
                    }
                }
                return Types.String;
            case "ORD":
                RequireArgs(expr, 1);
                if (CheckExpr(expr.Args[0]) is not EnumType) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "ORD requires ENUM.");
                return Types.Integer;
            case "ENUMVALUE":
            {
                RequireArgs(expr, 2);
                if (expr.Args[0] is not NameExprNode typeName)
                {
                    throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "ENUMVALUE requires enum type name.");
                }
                var enumSym = _currentScope.Lookup(typeName.Name);
                if (enumSym == null || enumSym.Kind != SymbolKind.Type || enumSym.Type is not EnumType enumType)
                {
                    throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "ENUMVALUE requires enum type name.");
                }
                RequireType(expr.Args[1], Types.Integer);
                return enumType;
            }
            case "SIZE":
                RequireArgs(expr, 1);
                if (CheckExpr(expr.Args[0]) is not SetType) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "SIZE requires SET.");
                return Types.Integer;
            default:
                throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Unknown builtin.");
        }
    }

    private void RequireArgs(CallExprNode expr, int count)
    {
        if (expr.Args.Count != count)
        {
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Argument count mismatch.");
        }
    }

    private void RequireType(ExprNode expr, TypeSymbol type)
    {
        var t = CheckExpr(expr);
        if (!Types.TypeEquals(t, type))
        {
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Argument type mismatch.");
        }
    }

    private void CheckArgs(IReadOnlyList<ExprNode> args, Symbol sym)
    {
        var decl = sym.Decl;
        IReadOnlyList<ParamNode> parameters = decl switch
        {
            ProcDeclNode p => p.Params,
            FuncDeclNode f => f.Params,
            ConstructorDeclNode c => c.Params,
            _ => Array.Empty<ParamNode>()
        };
        if (args.Count != parameters.Count)
        {
            throw Errors.At(ErrorType.TypeError, sym.Decl?.Loc.Line ?? 1, "Argument count mismatch.");
        }
        for (var i = 0; i < args.Count; i += 1)
        {
            var argType = CheckExpr(args[i]);
            var paramType = ResolveType(parameters[i].TypeSpec, parameters[i].Loc.Line);
            if (!Types.IsAssignable(paramType, argType))
            {
                throw Errors.At(ErrorType.TypeError, args[i].Loc.Line, "Argument type mismatch.");
            }
            if (parameters[i].Mode == ParamMode.ByRef && !IsLValueExpr(args[i]))
            {
                throw Errors.At(ErrorType.TypeError, args[i].Loc.Line, "BYREF requires lvalue.");
            }
        }
    }

    private TypeSymbol CheckIndex(IndexExprNode expr)
    {
        var baseType = CheckExpr(expr.Base);
        if (baseType is not ArrayType arrayType) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Indexing requires ARRAY.");
        foreach (var idx in expr.Indices)
        {
            var t = CheckExpr(idx);
            if (t.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Array index must be INTEGER.");
        }
        return arrayType.ElementType;
    }

    private TypeSymbol CheckField(FieldExprNode expr)
    {
        var baseType = CheckExpr(expr.Base);
        if (baseType is RecordType record)
        {
            if (!record.Fields.TryGetValue(expr.Field, out var fieldType)) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown record field.");
            return fieldType;
        }
        if (baseType is ClassType classType)
        {
            if (!_classInfos.TryGetValue(classType.Name, out var classInfo)) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown class field.");
            if (!classInfo.Fields.TryGetValue(expr.Field, out var field) || field.Type == null) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown class field.");
            if (field.Access == AccessModifier.Private && field.OwnerClass != _currentClass?.Name)
            {
                throw Errors.At(ErrorType.AccessError, expr.Loc.Line, "Private member access.");
            }
            return field.Type;
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Field access requires RECORD or CLASS.");
    }

    private TypeSymbol CheckNew(NewExprNode expr)
    {
        if (expr.TypeName != null)
        {
            var classSym = _currentScope.Lookup(expr.TypeName);
            if (classSym == null || classSym.Kind != SymbolKind.Class || classSym.Type is not ClassType) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "NEW requires class.");
            if (!_classInfos.TryGetValue(expr.TypeName, out var classInfo)) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "NEW requires class.");
            if (classInfo.Constructor?.Decl is ConstructorDeclNode ctor)
            {
                CheckArgs(expr.Args, classInfo.Constructor);
            }
            else if (expr.Args.Count > 0)
            {
                throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "No constructor defined for class.");
            }
            return classSym.Type;
        }
        if (expr.TypeSpec != null)
        {
            var type = ResolveType(expr.TypeSpec, expr.Loc.Line);
            return new PointerType(type);
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid NEW.");
    }

    private TypeSymbol CheckLValue(LValueNode expr)
    {
        if (expr is NameExprNode name)
        {
            var sym = _currentScope.Lookup(name.Name);
            if (sym != null)
            {
                if (sym.Kind == SymbolKind.Const) throw Errors.At(ErrorType.AccessError, expr.Loc.Line, "Cannot assign to constant.");
                if (sym.Type == null) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid lvalue.");
                return sym.Type;
            }
            if (_currentClass != null && _currentClass.Fields.TryGetValue(name.Name, out var field) && field.Type != null)
            {
                if (field.Access == AccessModifier.Private && field.OwnerClass != _currentClass.Name)
                {
                    throw Errors.At(ErrorType.AccessError, expr.Loc.Line, "Private member access.");
                }
                return field.Type;
            }
            throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown identifier.");
        }
        if (expr is IndexExprNode index)
        {
            return CheckIndex(index);
        }
        if (expr is FieldExprNode fieldExpr)
        {
            return CheckField(fieldExpr);
        }
        if (expr is DerefExprNode deref)
        {
            return CheckDeref(deref);
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid lvalue.");
    }

    private TypeSymbol NameType(NameExprNode expr)
    {
        var sym = _currentScope.Lookup(expr.Name);
        if (sym?.Type != null) return sym.Type;
        if (_currentClass != null && _currentClass.Fields.TryGetValue(expr.Name, out var field) && field.Type != null) return field.Type;
        throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown identifier.");
    }

    private Symbol? ResolveProcRef(CallStmtNode stmt)
    {
        var parts = stmt.Callee.Parts;
        if (parts.Count == 1)
        {
            return _currentScope.Lookup(parts[0]);
        }
        var baseSym = _currentScope.Lookup(parts[0]);
        if (baseSym?.Type is not ClassType classType)
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "Method call requires object.");
        }
        if (!_classInfos.TryGetValue(classType.Name, out var classInfo)) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "Method call requires object.");
        if (!classInfo.Methods.TryGetValue(parts[1], out var method)) return null;
        if (method.Access == AccessModifier.Private && method.OwnerClass != _currentClass?.Name)
        {
            throw Errors.At(ErrorType.AccessError, stmt.Loc.Line, "Private member access.");
        }
        return method;
    }

    private TypeSymbol LiteralTypeOf(LiteralNode lit)
    {
        return lit.LiteralType switch
        {
            LiteralType.Integer => Types.Integer,
            LiteralType.Real => Types.Real,
            LiteralType.Boolean => Types.Boolean,
            LiteralType.Char => Types.Char,
            LiteralType.String => Types.String,
            LiteralType.Date => ValidateDate(lit),
            _ => Types.Integer
        };
    }

    private TypeSymbol ValidateDate(LiteralNode lit)
    {
        DateUtil.ParseDateLiteral((string)lit.Value, lit.Loc.Line);
        return Types.Date;
    }

    private TypeSymbol ResolveType(TypeNode typeNode, int line, bool allowNamed = false, string? nameOverride = null)
    {
        switch (typeNode)
        {
            case BasicTypeNode basic:
                return ResolveBasic(basic);
            case ArrayTypeNode array:
                return new ArrayType(array.Bounds.Select(b => new ArrayBounds(b.Low, b.High)).ToList(), ResolveType(array.ElementType, line));
            case RecordTypeNode record:
            {
                var fields = new Dictionary<string, TypeSymbol>(StringComparer.Ordinal);
                foreach (var field in record.Fields)
                {
                    fields[field.Name] = ResolveType(field.TypeSpec, field.Loc.Line);
                }
                return new RecordType(fields);
            }
            case EnumTypeNode enumNode:
                return new EnumType(nameOverride ?? "<anon>", enumNode.Members.ToList());
            case SetTypeNode setNode:
            {
                var baseSym = _currentScope.Lookup(setNode.BaseName);
                if (baseSym?.Type is not EnumType enumType)
                {
                    throw Errors.At(ErrorType.TypeError, line, "SET OF requires enum type.");
                }
                return new SetType(enumType);
            }
            case PointerTypeNode pointer:
                return new PointerType(ResolveType(pointer.Target, line));
            case TextFileTypeNode:
                return new TextFileType();
            case RandomFileTypeNode randomFile:
            {
                var recordSym = _currentScope.Lookup(randomFile.RecordName);
                if (recordSym?.Type is not RecordType recordType)
                {
                    throw Errors.At(ErrorType.TypeError, line, "RANDOMFILE requires RECORD type.");
                }
                EnsureRandomRecordCompatible(recordType, line);
                return new RandomFileType(recordType);
            }
            case NamedTypeNode named:
            {
                var sym = _currentScope.Lookup(named.Name);
                if (sym?.Type == null || (sym.Kind != SymbolKind.Type && sym.Kind != SymbolKind.Class))
                {
                    throw Errors.At(ErrorType.NameError, line, $"Unknown type {named.Name}.");
                }
                return sym.Type;
            }
            default:
                throw Errors.At(ErrorType.TypeError, line, "Unknown type.");
        }
    }

    private TypeSymbol ResolveBasic(BasicTypeNode node)
    {
        return node.Name switch
        {
            BasicTypeName.INTEGER => Types.Integer,
            BasicTypeName.REAL => Types.Real,
            BasicTypeName.BOOLEAN => Types.Boolean,
            BasicTypeName.CHAR => Types.Char,
            BasicTypeName.STRING => Types.String,
            BasicTypeName.DATE => Types.Date,
            _ => Types.Integer
        };
    }

    private void EnsureRandomRecordCompatible(RecordType record, int line)
    {
        void CheckType(TypeSymbol t)
        {
            if (t.Kind is TypeKind.String or TypeKind.Set or TypeKind.Pointer or TypeKind.Class)
            {
                throw Errors.At(ErrorType.TypeError, line, "RANDOMFILE record cannot contain STRING/SET/POINTER/CLASS.");
            }
            if (t is ArrayType arr)
            {
                CheckType(arr.ElementType);
                return;
            }
            if (t is RecordType rec)
            {
                foreach (var field in rec.Fields.Values) CheckType(field);
            }
        }

        foreach (var field in record.Fields.Values) CheckType(field);
    }

    private static string CaseLabelKey(LiteralNode lit) => $"{lit.LiteralType}:{lit.Value}";

    private static bool IsLValueExpr(ExprNode expr)
    {
        return expr is NameExprNode or IndexExprNode or FieldExprNode or DerefExprNode;
    }
}
