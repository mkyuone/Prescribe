using System.Runtime.CompilerServices;
using Prescribe.Core.Diagnostics;
using Prescribe.Core.Frontend;
using Prescribe.Core.Semantics;
using Prescribe.Core.Util;

namespace Prescribe.Core.Runtime;

public sealed class Interpreter
{
    private readonly ProgramNode _program;
    private readonly SemanticResult _sema;
    private readonly Store _store = new();
    private readonly StdLib _stdlib = new();
    private readonly FileIo _fileIo;
    private readonly string[] _inputTokens;
    private int _inputIndex;
    private readonly List<string> _output = new();
    private readonly Dictionary<string, ProxyCell> _proxyCache = new(StringComparer.Ordinal);
    private readonly ConditionalWeakTable<object, ObjectIdHolder> _objectIds = new();
    private int _nextObjectId = 1;

    private readonly Stack<RuntimeScope> _procScopes = new();
    private RuntimeScope _currentScope;
    private (string ClassName, Dictionary<string, ICellLike> Fields)? _currentThis;
    private readonly HashSet<string> _loopReadOnly = new(StringComparer.Ordinal);

    public Interpreter(ProgramNode program, SemanticResult sema, string input, IFileSystem fileSystem)
    {
        _program = program;
        _sema = sema;
        _fileIo = new FileIo(fileSystem);
        _inputTokens = string.IsNullOrWhiteSpace(input) ? Array.Empty<string>() : input.Trim().Split((char[])null!, StringSplitOptions.RemoveEmptyEntries);
        _currentScope = new RuntimeScope(null);
        InstallBuiltinTypes();
    }

    public string Run()
    {
        ExecuteBlock(_program.Block, _currentScope);
        return string.Concat(_output);
    }

    private void InstallBuiltinTypes()
    {
        _currentScope.DefineType("INTEGER", Types.Integer);
        _currentScope.DefineType("REAL", Types.Real);
        _currentScope.DefineType("BOOLEAN", Types.Boolean);
        _currentScope.DefineType("CHAR", Types.Char);
        _currentScope.DefineType("STRING", Types.String);
        _currentScope.DefineType("DATE", Types.Date);
    }

    private void ExecuteBlock(BlockNode block, RuntimeScope scope)
    {
        var prev = _currentScope;
        _currentScope = scope;
        foreach (var decl in block.Declarations)
        {
            ExecuteDeclaration(decl, scope);
        }
        foreach (var stmt in block.Statements)
        {
            ExecuteStatement(stmt);
        }
        _currentScope = prev;
    }

    private void ExecuteDeclaration(DeclarationNode decl, RuntimeScope scope)
    {
        switch (decl)
        {
            case VarDeclNode varDecl:
            {
                var type = ResolveType(varDecl.TypeSpec);
                var cell = new Cell(type, Defaults.DefaultValue(type));
                scope.DefineVar(varDecl.Name, cell);
                break;
            }
            case ConstDeclNode constDecl:
            {
                var value = EvalExpr(constDecl.Expr);
                scope.DefineConst(constDecl.Name, value);
                break;
            }
            case TypeDeclNode typeDecl:
                if (typeDecl.TypeSpec is EnumTypeNode enumType)
                {
                    var enumSym = new EnumType(typeDecl.Name, enumType.Members.ToList());
                    scope.DefineType(typeDecl.Name, enumSym);
                    for (var i = 0; i < enumType.Members.Count; i += 1)
                    {
                        scope.DefineConst(enumType.Members[i], RuntimeValues.Make(enumSym, i));
                    }
                }
                else
                {
                    scope.DefineType(typeDecl.Name, ResolveType(typeDecl.TypeSpec));
                }
                break;
            case ProcDeclNode proc:
                scope.DefineProc(proc.Name, proc);
                break;
            case FuncDeclNode func:
                scope.DefineFunc(func.Name, func);
                break;
            case ClassDeclNode cls:
                scope.DefineClass(cls.Name, cls);
                scope.DefineType(cls.Name, new ClassType(cls.Name));
                break;
        }
    }

    private void ExecuteStatement(StatementNode stmt)
    {
        switch (stmt)
        {
            case AssignStmtNode assign:
                ExecAssign(assign);
                return;
            case IfStmtNode ifStmt:
                ExecIf(ifStmt);
                return;
            case CaseStmtNode caseStmt:
                ExecCase(caseStmt);
                return;
            case ForStmtNode forStmt:
                ExecFor(forStmt);
                return;
            case WhileStmtNode whileStmt:
                ExecWhile(whileStmt);
                return;
            case RepeatStmtNode repeatStmt:
                ExecRepeat(repeatStmt);
                return;
            case CallStmtNode callStmt:
                ExecCallStmt(callStmt);
                return;
            case ReturnStmtNode ret:
                throw new ReturnSignal(ret.Expr != null ? EvalExpr(ret.Expr) : null);
            case InputStmtNode input:
                ExecInput(input);
                return;
            case OutputStmtNode output:
                ExecOutput(output);
                return;
            case FileStmtNode fileStmt:
                ExecFileStmt(fileStmt);
                return;
            case SuperCallStmtNode superCall:
                ExecSuperCall(superCall);
                return;
        }
    }

    private void ExecAssign(AssignStmtNode stmt)
    {
        if (stmt.Target is NameExprNode name && _loopReadOnly.Contains(name.Name))
        {
            throw Errors.At(ErrorType.AccessError, stmt.Loc.Line, "Cannot assign to loop variable.");
        }
        var reference = GetLValue(stmt.Target);
        var value = EvalExpr(stmt.Expr);
        if (value.Type.Kind == TypeKind.Null && (reference.Type.Kind == TypeKind.Pointer || reference.Type.Kind == TypeKind.Class))
        {
            reference.Set(RuntimeValues.Make(reference.Type, null));
            return;
        }
        if (!Types.TypeEquals(reference.Type, value.Type))
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "Assignment type mismatch.");
        }
        reference.Set(CloneValue(value));
    }

    private void ExecIf(IfStmtNode stmt)
    {
        var cond = EvalExpr(stmt.Condition);
        if (cond.Type.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "IF condition must be BOOLEAN.");
        if ((bool)cond.Data!)
        {
            ExecuteBlock(stmt.ThenBlock, new RuntimeScope(_currentScope));
        }
        else if (stmt.ElseBlock != null)
        {
            ExecuteBlock(stmt.ElseBlock, new RuntimeScope(_currentScope));
        }
    }

    private void ExecCase(CaseStmtNode stmt)
    {
        var expr = EvalExpr(stmt.Expr);
        foreach (var branch in stmt.Branches)
        {
            foreach (var label in branch.Labels)
            {
                if (label is CaseValueNode cv)
                {
                    var litVal = LiteralValue(cv.Value);
                    if (CompareValues(expr, litVal) == 0)
                    {
                        ExecuteBlock(branch.Block, new RuntimeScope(_currentScope));
                        return;
                    }
                }
                else if (label is CaseRangeNode cr)
                {
                    var start = LiteralValue(cr.Start);
                    var end = LiteralValue(cr.End);
                    var cmpStart = CompareValues(expr, start);
                    var cmpEnd = CompareValues(expr, end);
                    if (cmpStart >= 0 && cmpEnd <= 0)
                    {
                        ExecuteBlock(branch.Block, new RuntimeScope(_currentScope));
                        return;
                    }
                }
            }
        }
        if (stmt.OtherwiseBlock != null)
        {
            ExecuteBlock(stmt.OtherwiseBlock, new RuntimeScope(_currentScope));
        }
    }

    private void ExecFor(ForStmtNode stmt)
    {
        var loopCell = _currentScope.LookupVar(stmt.Name);
        if (loopCell == null) throw Errors.At(ErrorType.NameError, stmt.Loc.Line, "Unknown loop variable.");
        var start = EvalExpr(stmt.Start);
        var end = EvalExpr(stmt.End);
        var step = stmt.Step != null ? EvalExpr(stmt.Step) : RuntimeValues.Make(Types.Integer, 1);
        if (start.Type.Kind != TypeKind.Integer || end.Type.Kind != TypeKind.Integer || step.Type.Kind != TypeKind.Integer)
        {
            throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "FOR requires INTEGER values.");
        }
        var s = (int)start.Data!;
        var e = (int)end.Data!;
        var st = (int)step.Data!;
        if (st == 0) throw Errors.At(ErrorType.RuntimeError, stmt.Loc.Line, "FOR step cannot be 0.");

        _loopReadOnly.Add(stmt.Name);
        bool Condition(int i) => st > 0 ? i <= e : i >= e;
        for (var i = s; Condition(i); i += st)
        {
            loopCell.Set(RuntimeValues.Make(Types.Integer, MathUtil.CheckInt(i, stmt.Loc.Line)));
            ExecuteBlock(stmt.Block, new RuntimeScope(_currentScope));
        }
        _loopReadOnly.Remove(stmt.Name);
    }

    private void ExecWhile(WhileStmtNode stmt)
    {
        while (true)
        {
            var cond = EvalExpr(stmt.Condition);
            if (cond.Type.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "WHILE condition must be BOOLEAN.");
            if (!(bool)cond.Data!) break;
            ExecuteBlock(stmt.Block, new RuntimeScope(_currentScope));
        }
    }

    private void ExecRepeat(RepeatStmtNode stmt)
    {
        while (true)
        {
            ExecuteBlock(stmt.Block, new RuntimeScope(_currentScope));
            var cond = EvalExpr(stmt.Condition);
            if (cond.Type.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "UNTIL condition must be BOOLEAN.");
            if ((bool)cond.Data!) break;
        }
    }

    private void ExecCallStmt(CallStmtNode stmt)
    {
        var name = stmt.Callee.Parts[0];
        var method = stmt.Callee.Parts.Count > 1 ? stmt.Callee.Parts[1] : null;
        if (stmt.Callee.Parts.Count == 1)
        {
            var proc = _currentScope.LookupProc(name);
            if (proc == null) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "CALL requires procedure.");
            CallProcedure(proc, stmt.Args, null);
            return;
        }
        var objCell = _currentScope.LookupVar(name);
        if (objCell == null) throw Errors.At(ErrorType.NameError, stmt.Loc.Line, "Unknown object.");
        var obj = objCell.Get();
        if (obj.Type.Kind != TypeKind.Class || obj.Data == null) throw Errors.At(ErrorType.RuntimeError, stmt.Loc.Line, "Null object.");
        var objRef = _store.GetClassObject((int)obj.Data!);
        if (objRef == null) throw Errors.At(ErrorType.RuntimeError, stmt.Loc.Line, "Invalid object reference.");
        var methodDecl = ResolveMethod(objRef.Value.ClassName, method!);
        if (methodDecl == null || methodDecl is not ProcDeclNode) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "CALL requires procedure.");
        CallProcedure((ProcDeclNode)methodDecl, stmt.Args, (objRef.Value.ClassName, objRef.Value.Fields.ToDictionary(k => k.Key, v => (ICellLike)v.Value)));
    }

    private void ExecInput(InputStmtNode stmt)
    {
        foreach (var target in stmt.Targets)
        {
            var cell = GetLValue(target);
            var token = NextInputToken(stmt.Loc.Line);
            var value = ParseInputToken(token, cell.Type, stmt.Loc.Line);
            cell.Set(value);
        }
    }

    private void ExecOutput(OutputStmtNode stmt)
    {
        var text = "";
        foreach (var expr in stmt.Values)
        {
            var value = EvalExpr(expr);
            text += StdLib.ToOutputString(value, expr.Loc.Line);
        }
        _output.Add(text + "\n");
    }

    private void ExecFileStmt(FileStmtNode stmt)
    {
        switch (stmt)
        {
            case OpenFileStmtNode open:
            {
                var cell = _currentScope.LookupVar(open.FileName);
                if (cell == null) throw Errors.At(ErrorType.NameError, open.Loc.Line, "Unknown file variable.");
                if (cell.Type.Kind == TypeKind.TextFile)
                {
                    var handle = _fileIo.OpenTextFile(open.Path, open.Mode, open.Loc.Line);
                    cell.Set(RuntimeValues.Make(cell.Type, handle));
                    return;
                }
                if (cell.Type.Kind == TypeKind.RandomFile)
                {
                    if (!open.Mode.Equals("RANDOM", StringComparison.OrdinalIgnoreCase)) throw Errors.At(ErrorType.FileError, open.Loc.Line, "Invalid random file mode.");
                    var handle = _fileIo.OpenRandomFile(open.Path);
                    cell.Set(RuntimeValues.Make(cell.Type, handle));
                    return;
                }
                throw Errors.At(ErrorType.TypeError, open.Loc.Line, "OPENFILE requires file type.");
            }
            case CloseFileStmtNode close:
            {
                var cell = _currentScope.LookupVar(close.FileName);
                if (cell == null) throw Errors.At(ErrorType.NameError, close.Loc.Line, "Unknown file variable.");
                if (cell.Type.Kind == TypeKind.TextFile)
                {
                    var handle = cell.Get().Data as TextFileHandle;
                    if (handle != null) _fileIo.CloseTextFile(handle);
                    return;
                }
                if (cell.Type.Kind == TypeKind.RandomFile)
                {
                    var handle = cell.Get().Data as RandomFileHandle;
                    if (handle != null) _fileIo.CloseRandomFile(handle);
                    return;
                }
                throw Errors.At(ErrorType.TypeError, close.Loc.Line, "CLOSEFILE requires file type.");
            }
            case ReadFileStmtNode read:
            {
                var cell = _currentScope.LookupVar(read.FileName);
                if (cell == null || cell.Type.Kind != TypeKind.TextFile) throw Errors.At(ErrorType.TypeError, read.Loc.Line, "READFILE requires TEXTFILE.");
                var handle = cell.Get().Data as TextFileHandle;
                if (handle == null) throw Errors.At(ErrorType.FileError, read.Loc.Line, "File not open.");
                var lineText = _fileIo.ReadTextLine(handle, read.Loc.Line);
                var target = GetLValue(read.Target);
                var value = ParseInputToken(lineText, target.Type, read.Loc.Line);
                target.Set(value);
                return;
            }
            case WriteFileStmtNode write:
            {
                var cell = _currentScope.LookupVar(write.FileName);
                if (cell == null || cell.Type.Kind != TypeKind.TextFile) throw Errors.At(ErrorType.TypeError, write.Loc.Line, "WRITEFILE requires TEXTFILE.");
                var handle = cell.Get().Data as TextFileHandle;
                if (handle == null) throw Errors.At(ErrorType.FileError, write.Loc.Line, "File not open.");
                var value = EvalExpr(write.Expr);
                var text = StdLib.ToOutputString(value, write.Loc.Line);
                _fileIo.WriteTextLine(handle, text, write.Loc.Line);
                return;
            }
            case SeekStmtNode seek:
            {
                var cell = _currentScope.LookupVar(seek.FileName);
                if (cell == null || cell.Type.Kind != TypeKind.RandomFile) throw Errors.At(ErrorType.TypeError, seek.Loc.Line, "SEEK requires RANDOMFILE.");
                var handle = cell.Get().Data as RandomFileHandle;
                if (handle == null) throw Errors.At(ErrorType.FileError, seek.Loc.Line, "File not open.");
                var addr = EvalExpr(seek.Address);
                if (addr.Type.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, seek.Loc.Line, "SEEK address must be INTEGER.");
                _fileIo.SeekRandom(handle, (int)addr.Data!, seek.Loc.Line);
                return;
            }
            case GetRecordStmtNode get:
            {
                var cell = _currentScope.LookupVar(get.FileName);
                if (cell == null || cell.Type.Kind != TypeKind.RandomFile) throw Errors.At(ErrorType.TypeError, get.Loc.Line, "GETRECORD requires RANDOMFILE.");
                var handle = cell.Get().Data as RandomFileHandle;
                if (handle == null) throw Errors.At(ErrorType.FileError, get.Loc.Line, "File not open.");
                var target = GetLValue(get.Target);
                var value = _fileIo.GetRecord(handle, ((RandomFileType)cell.Type).Record, get.Loc.Line);
                target.Set(value);
                return;
            }
            case PutRecordStmtNode put:
            {
                var cell = _currentScope.LookupVar(put.FileName);
                if (cell == null || cell.Type.Kind != TypeKind.RandomFile) throw Errors.At(ErrorType.TypeError, put.Loc.Line, "PUTRECORD requires RANDOMFILE.");
                var handle = cell.Get().Data as RandomFileHandle;
                if (handle == null) throw Errors.At(ErrorType.FileError, put.Loc.Line, "File not open.");
                var value = EvalExpr(put.Expr);
                _fileIo.PutRecord(handle, ((RandomFileType)cell.Type).Record, value, put.Loc.Line);
                return;
            }
        }
    }

    private void ExecSuperCall(SuperCallStmtNode stmt)
    {
        if (_currentThis == null) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "SUPER outside class.");
        if (!_sema.ClassInfos.TryGetValue(_currentThis.Value.ClassName, out var info)) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "No base class.");
        var baseName = info.BaseName;
        if (baseName == null) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "No base class.");
        if (stmt.MethodName == null)
        {
            var ctor = ResolveConstructor(baseName);
            if (ctor == null) return;
            CallConstructor(ctor, stmt.Args, _currentThis.Value);
            return;
        }
        var methodDecl = ResolveMethod(baseName, stmt.MethodName);
        if (methodDecl == null) throw Errors.At(ErrorType.NameError, stmt.Loc.Line, "Unknown super method.");
        if (methodDecl is not ProcDeclNode) throw Errors.At(ErrorType.TypeError, stmt.Loc.Line, "SUPER call requires procedure.");
        CallProcedure((ProcDeclNode)methodDecl, stmt.Args, _currentThis.Value);
    }

    private RuntimeValue EvalExpr(ExprNode expr)
    {
        return expr switch
        {
            LiteralNode lit => LiteralValue(lit),
            NameExprNode name => ResolveName(name),
            BinaryExprNode binary => EvalBinary(binary),
            UnaryExprNode unary => EvalUnary(unary),
            CallExprNode call => EvalCall(call),
            IndexExprNode index => EvalIndex(index),
            FieldExprNode field => EvalField(field),
            NewExprNode n => EvalNew(n),
            EOFExprNode eof => EvalEOF(eof),
            NullExprNode => RuntimeValues.Make(Types.Null, null),
            DerefExprNode deref => EvalDeref(deref),
            _ => throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Unknown expression.")
        };
    }

    private RuntimeValue EvalBinary(BinaryExprNode expr)
    {
        var left = EvalExpr(expr.Left);
        var right = EvalExpr(expr.Right);
        var op = expr.Op;

        if (op is "+" or "-" or "*")
        {
            if (left.Type.Kind == TypeKind.Integer && right.Type.Kind == TypeKind.Integer)
            {
                var l = (int)left.Data!;
                var r = (int)right.Data!;
                var res = op == "+" ? l + r : op == "-" ? l - r : l * r;
                return RuntimeValues.Make(Types.Integer, MathUtil.CheckInt(res, expr.Loc.Line));
            }
            if (left.Type.Kind == TypeKind.Real && right.Type.Kind == TypeKind.Real)
            {
                var l = (double)left.Data!;
                var r = (double)right.Data!;
                var res = op == "+" ? l + r : op == "-" ? l - r : l * r;
                return RuntimeValues.Make(Types.Real, MathUtil.CheckReal(res, expr.Loc.Line));
            }
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Arithmetic requires matching numeric types.");
        }

        if (op == "/")
        {
            if (left.Type.Kind == TypeKind.Integer && right.Type.Kind == TypeKind.Integer)
            {
                if ((int)right.Data! == 0) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Division by zero.");
                return RuntimeValues.Make(Types.Real, MathUtil.CheckReal((double)(int)left.Data! / (int)right.Data!, expr.Loc.Line));
            }
            if (left.Type.Kind == TypeKind.Real && right.Type.Kind == TypeKind.Real)
            {
                if ((double)right.Data! == 0) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Division by zero.");
                return RuntimeValues.Make(Types.Real, MathUtil.CheckReal((double)left.Data! / (double)right.Data!, expr.Loc.Line));
            }
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Division requires numeric types.");
        }

        if (op is "DIV" or "MOD")
        {
            if (left.Type.Kind == TypeKind.Integer && right.Type.Kind == TypeKind.Integer)
            {
                var (q, r) = MathUtil.DivEuclid((int)left.Data!, (int)right.Data!, expr.Loc.Line);
                return RuntimeValues.Make(Types.Integer, op == "DIV" ? q : r);
            }
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "DIV/MOD require INTEGER.");
        }

        if (op == "&")
        {
            if ((left.Type.Kind == TypeKind.String || left.Type.Kind == TypeKind.Char) && (right.Type.Kind == TypeKind.String || right.Type.Kind == TypeKind.Char))
            {
                return RuntimeValues.Make(Types.String, ((string)left.Data!) + ((string)right.Data!));
            }
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Concatenation requires STRING/CHAR.");
        }

        if (op is "AND" or "OR")
        {
            if (left.Type.Kind != TypeKind.Boolean || right.Type.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Boolean op requires BOOLEAN.");
            var result = op == "AND" ? (bool)left.Data! && (bool)right.Data! : (bool)left.Data! || (bool)right.Data!;
            return RuntimeValues.Make(Types.Boolean, result);
        }

        if (op == "IN")
        {
            if (left.Type.Kind != TypeKind.Enum || right.Type.Kind != TypeKind.Set) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "IN requires ENUM and SET.");
            var set = (HashSet<int>)right.Data!;
            return RuntimeValues.Make(Types.Boolean, set.Contains((int)left.Data!));
        }

        if (op is "UNION" or "INTERSECT" or "DIFF")
        {
            if (left.Type.Kind != TypeKind.Set || right.Type.Kind != TypeKind.Set) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Set op requires SET.");
            var lset = (HashSet<int>)left.Data!;
            var rset = (HashSet<int>)right.Data!;
            var result = new HashSet<int>();
            if (op == "UNION")
            {
                foreach (var v in lset) result.Add(v);
                foreach (var v in rset) result.Add(v);
            }
            else if (op == "INTERSECT")
            {
                foreach (var v in lset) if (rset.Contains(v)) result.Add(v);
            }
            else
            {
                foreach (var v in lset) if (!rset.Contains(v)) result.Add(v);
            }
            return RuntimeValues.Make(left.Type, result);
        }

        if (op is "=" or "<>" or "<" or "<=" or ">" or ">=")
        {
            var cmp = CompareValues(left, right);
            var res = op switch
            {
                "=" => cmp == 0,
                "<>" => cmp != 0,
                "<" => cmp < 0,
                "<=" => cmp <= 0,
                ">" => cmp > 0,
                ">=" => cmp >= 0,
                _ => false
            };
            return RuntimeValues.Make(Types.Boolean, res);
        }

        throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Unsupported operator.");
    }

    private RuntimeValue EvalUnary(UnaryExprNode expr)
    {
        var value = EvalExpr(expr.Expr);
        if (expr.Op == "+") return value;
        if (expr.Op == "-")
        {
            if (value.Type.Kind == TypeKind.Integer) return RuntimeValues.Make(Types.Integer, MathUtil.CheckInt(-(int)value.Data!, expr.Loc.Line));
            if (value.Type.Kind == TypeKind.Real) return RuntimeValues.Make(Types.Real, MathUtil.CheckReal(-(double)value.Data!, expr.Loc.Line));
            throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Unary - requires numeric type.");
        }
        if (expr.Op == "NOT")
        {
            if (value.Type.Kind != TypeKind.Boolean) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "NOT requires BOOLEAN.");
            return RuntimeValues.Make(Types.Boolean, !(bool)value.Data!);
        }
        if (expr.Op == "@")
        {
            var reference = GetLValue((LValueNode)expr.Expr);
            var addr = _store.AddrOf(reference);
            return RuntimeValues.Make(new PointerType(reference.Type), addr);
        }
        throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Unsupported unary operator.");
    }

    private RuntimeValue EvalCall(CallExprNode expr)
    {
        if (expr.Callee is NameExprNode nameExpr)
        {
            var name = nameExpr.Name.ToUpperInvariant();
            if (IsBuiltin(name))
            {
                return CallBuiltin(name, expr);
            }
            var func = _currentScope.LookupFunc(nameExpr.Name);
            if (func == null) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Call requires function.");
            return CallFunction(func, expr.Args, null);
        }
        if (expr.Callee is FieldExprNode field)
        {
            var baseValue = EvalExpr(field.Base);
            if (baseValue.Type.Kind != TypeKind.Class || baseValue.Data == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Null object.");
            var objRef = _store.GetClassObject((int)baseValue.Data!);
            if (objRef == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Invalid object reference.");
            var method = ResolveMethod(objRef.Value.ClassName, field.Field);
            if (method == null) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown method.");
            if (method is not FuncDeclNode) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Call requires function.");
            return CallFunction((FuncDeclNode)method, expr.Args, (objRef.Value.ClassName, objRef.Value.Fields.ToDictionary(k => k.Key, v => (ICellLike)v.Value)));
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid call target.");
    }

    private RuntimeValue EvalIndex(IndexExprNode expr)
    {
        var reference = GetLValue(expr);
        return reference.Get();
    }

    private RuntimeValue EvalField(FieldExprNode expr)
    {
        var reference = GetLValue(expr);
        return reference.Get();
    }

    private RuntimeValue EvalNew(NewExprNode expr)
    {
        if (expr.TypeName != null)
        {
            var className = expr.TypeName;
            var classDecl = _currentScope.LookupClass(className);
            if (classDecl == null) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "NEW requires class.");
            var objId = CreateClassObject(className);
            var objRef = _store.GetClassObject(objId);
            if (objRef == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Failed to allocate object.");
            var ctor = ResolveConstructor(className);
            if (ctor != null)
            {
                CallConstructor(ctor, expr.Args, (objRef.Value.ClassName, objRef.Value.Fields.ToDictionary(k => k.Key, v => (ICellLike)v.Value)));
            }
            return RuntimeValues.Make(new ClassType(className), objId);
        }
        if (expr.TypeSpec == null) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid NEW.");
        var targetType = ResolveType(expr.TypeSpec);
        var addr = _store.AllocPointerCell(targetType);
        return RuntimeValues.Make(new PointerType(targetType), addr);
    }

    private RuntimeValue EvalEOF(EOFExprNode expr)
    {
        var cell = _currentScope.LookupVar(expr.FileName);
        if (cell == null) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown file.");
        if (cell.Type.Kind == TypeKind.TextFile)
        {
            var handle = cell.Get().Data as TextFileHandle;
            if (handle == null) return RuntimeValues.Make(Types.Boolean, true);
            return RuntimeValues.Make(Types.Boolean, _fileIo.EofText(handle));
        }
        if (cell.Type.Kind == TypeKind.RandomFile)
        {
            var handle = cell.Get().Data as RandomFileHandle;
            if (handle == null) return RuntimeValues.Make(Types.Boolean, true);
            var size = FileIo.SizeOfType(((RandomFileType)cell.Type).Record, expr.Loc.Line);
            var maxRecords = handle.Buffer.Length / size;
            return RuntimeValues.Make(Types.Boolean, handle.Position > maxRecords);
        }
        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "EOF requires file.");
    }

    private RuntimeValue EvalDeref(DerefExprNode expr)
    {
        var pointer = EvalExpr(expr.Expr);
        if (pointer.Type.Kind != TypeKind.Pointer) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "^ requires POINTER.");
        if (pointer.Data == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Null dereference.");
        var cell = _store.Deref((int)pointer.Data!);
        if (cell == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Invalid pointer.");
        return cell.Get();
    }

    private RuntimeValue ResolveName(NameExprNode expr)
    {
        var cell = _currentScope.LookupVar(expr.Name);
        if (cell != null) return cell.Get();
        var konst = _currentScope.LookupConst(expr.Name);
        if (konst != null) return konst;
        if (_currentThis != null && _currentThis.Value.Fields.TryGetValue(expr.Name, out var field))
        {
            return field.Get();
        }
        throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown identifier.");
    }

    private ICellLike GetLValue(LValueNode expr)
    {
        switch (expr)
        {
            case NameExprNode name:
            {
                var cell = _currentScope.LookupVar(name.Name);
                if (cell != null) return cell;
                if (_currentThis != null && _currentThis.Value.Fields.TryGetValue(name.Name, out var field))
                {
                    return field;
                }
                throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown identifier.");
            }
            case IndexExprNode index:
            {
                var baseValue = EvalExpr(index.Base);
                if (baseValue.Type.Kind != TypeKind.Array) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Indexing requires ARRAY.");
                var indices = index.Indices.Select(EvalExpr).ToList();
                foreach (var idx in indices)
                {
                    if (idx.Type.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Index must be INTEGER.");
                }
                var arr = (object[])baseValue.Data!;
                var bounds = ((ArrayType)baseValue.Type).Bounds;
                object current = arr;
                var baseId = ObjectId(arr);
                for (var i = 0; i < indices.Count; i += 1)
                {
                    var idx = (int)indices[i].Data!;
                    var bound = bounds[i];
                    if (idx < bound.Low || idx > bound.High) throw Errors.At(ErrorType.RangeError, expr.Loc.Line, "Array index out of bounds.");
                    var offset = idx - bound.Low;
                    var currentArr = (object[])current;
                    if (i == indices.Count - 1)
                    {
                        var key = $"arr:{baseId}:{string.Join(",", indices.Select(v => v.Data))}";
                        if (_proxyCache.TryGetValue(key, out var existing)) return existing;
                        var elementType = ((ArrayType)baseValue.Type).ElementType;
                        var cell = new ProxyCell(elementType, () => (RuntimeValue)currentArr[offset], v => currentArr[offset] = v);
                        _proxyCache[key] = cell;
                        return cell;
                    }
                    current = currentArr[offset];
                }
                throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Invalid array access.");
            }
            case FieldExprNode fieldExpr:
            {
                var baseValue = EvalExpr(fieldExpr.Base);
                if (baseValue.Type.Kind == TypeKind.Record)
                {
                    var fields = (Dictionary<string, RuntimeValue>)baseValue.Data!;
                    var fieldType = ((RecordType)baseValue.Type).Fields.TryGetValue(fieldExpr.Field, out var t) ? t : null;
                    if (fieldType == null || !fields.ContainsKey(fieldExpr.Field)) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown field.");
                    var baseId = ObjectId(fields);
                    var key = $"rec:{baseId}:{fieldExpr.Field}";
                    if (_proxyCache.TryGetValue(key, out var existing)) return existing;
                    var cell = new ProxyCell(fieldType, () => fields[fieldExpr.Field], v => fields[fieldExpr.Field] = v);
                    _proxyCache[key] = cell;
                    return cell;
                }
                if (baseValue.Type.Kind == TypeKind.Class)
                {
                    if (baseValue.Data == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Null object.");
                    var obj = _store.GetClassObject((int)baseValue.Data!);
                    if (obj == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Invalid object reference.");
                    if (!obj.Value.Fields.TryGetValue(fieldExpr.Field, out var field)) throw Errors.At(ErrorType.NameError, expr.Loc.Line, "Unknown field.");
                    return field;
                }
                throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Field access requires RECORD or CLASS.");
            }
            case DerefExprNode deref:
            {
                var pointer = EvalExpr(deref.Expr);
                if (pointer.Type.Kind != TypeKind.Pointer) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "^ requires POINTER.");
                if (pointer.Data == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Null dereference.");
                var cell = _store.Deref((int)pointer.Data!);
                if (cell == null) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Invalid pointer.");
                return cell;
            }
            default:
                throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Invalid lvalue.");
        }
    }

    private int ObjectId(object obj)
    {
        if (_objectIds.TryGetValue(obj, out var holder)) return holder.Value;
        holder = new ObjectIdHolder(_nextObjectId++);
        _objectIds.Add(obj, holder);
        return holder.Value;
    }

    private RuntimeValue LiteralValue(LiteralNode lit)
    {
        return lit.LiteralType switch
        {
            LiteralType.Integer => RuntimeValues.Make(Types.Integer, (int)lit.Value),
            LiteralType.Real => RuntimeValues.Make(Types.Real, (double)lit.Value),
            LiteralType.Boolean => RuntimeValues.Make(Types.Boolean, (bool)lit.Value),
            LiteralType.Char => RuntimeValues.Make(Types.Char, (string)lit.Value),
            LiteralType.String => RuntimeValues.Make(Types.String, (string)lit.Value),
            LiteralType.Date => RuntimeValues.Make(Types.Date, DateUtil.ParseDateLiteral((string)lit.Value, lit.Loc.Line)),
            _ => throw Errors.At(ErrorType.TypeError, lit.Loc.Line, "Unknown literal.")
        };
    }

    private int CompareValues(RuntimeValue a, RuntimeValue b)
    {
        if (!Types.TypeEquals(a.Type, b.Type)) throw Errors.At(ErrorType.TypeError, 0, "Comparison types must match.");
        return a.Type.Kind switch
        {
            TypeKind.Integer => (int)a.Data! - (int)b.Data!,
            TypeKind.Real => (int)Math.Sign((double)a.Data! - (double)b.Data!),
            TypeKind.Boolean => ((bool)a.Data! ? 1 : 0) - ((bool)b.Data! ? 1 : 0),
            TypeKind.Char or TypeKind.String => string.CompareOrdinal((string)a.Data!, (string)b.Data!),
            TypeKind.Date => DateUtil.CompareDate((DateValue)a.Data!, (DateValue)b.Data!),
            TypeKind.Enum => (int)a.Data! - (int)b.Data!,
            _ => throw Errors.At(ErrorType.TypeError, 0, "Type not comparable.")
        };
    }

    private RuntimeValue CallFunction(FuncDeclNode decl, IReadOnlyList<ExprNode> args, (string ClassName, Dictionary<string, ICellLike> Fields)? thisObj)
    {
        _store.PushFrame();
        var scope = new RuntimeScope(_currentScope);
        BindParams(decl.Params, args, scope, thisObj);
        var prevThis = _currentThis;
        _currentThis = thisObj;
        try
        {
            ExecuteBlock(decl.Block, scope);
            throw Errors.At(ErrorType.RuntimeError, decl.Loc.Line, "Missing RETURN in function.");
        }
        catch (ReturnSignal r)
        {
            if (r.Value == null) throw Errors.At(ErrorType.RuntimeError, decl.Loc.Line, "Missing RETURN value.");
            return r.Value;
        }
        finally
        {
            _currentThis = prevThis;
            _store.PopFrame();
        }
    }

    private void CallProcedure(ProcDeclNode decl, IReadOnlyList<ExprNode> args, (string ClassName, Dictionary<string, ICellLike> Fields)? thisObj)
    {
        _store.PushFrame();
        var scope = new RuntimeScope(_currentScope);
        BindParams(decl.Params, args, scope, thisObj);
        var prevThis = _currentThis;
        _currentThis = thisObj;
        try
        {
            ExecuteBlock(decl.Block, scope);
        }
        catch (ReturnSignal)
        {
            return;
        }
        finally
        {
            _currentThis = prevThis;
            _store.PopFrame();
        }
    }

    private void CallConstructor(ConstructorDeclNode decl, IReadOnlyList<ExprNode> args, (string ClassName, Dictionary<string, ICellLike> Fields) thisObj)
    {
        _store.PushFrame();
        var scope = new RuntimeScope(_currentScope);
        BindParams(decl.Params, args, scope, thisObj);
        var prevThis = _currentThis;
        _currentThis = thisObj;
        try
        {
            ExecuteBlock(decl.Block, scope);
        }
        catch (ReturnSignal)
        {
            return;
        }
        finally
        {
            _currentThis = prevThis;
            _store.PopFrame();
        }
    }

    private void BindParams(IReadOnlyList<ParamNode> parameters, IReadOnlyList<ExprNode> args, RuntimeScope scope, (string ClassName, Dictionary<string, ICellLike> Fields)? thisObj)
    {
        for (var i = 0; i < parameters.Count; i += 1)
        {
            var param = parameters[i];
            var argExpr = args[i];
            var type = ResolveType(param.TypeSpec);
            if (param.Mode == ParamMode.ByRef)
            {
                var cell = GetLValue((LValueNode)argExpr);
                scope.DefineVar(param.Name, cell);
            }
            else
            {
                var value = EvalExpr(argExpr);
                if (!Types.TypeEquals(type, value.Type)) throw Errors.At(ErrorType.TypeError, param.Loc.Line, "Argument type mismatch.");
                scope.DefineVar(param.Name, new Cell(type, CloneValue(value)));
            }
        }
    }

    private RuntimeValue CloneValue(RuntimeValue value)
    {
        switch (value.Type.Kind)
        {
            case TypeKind.Array:
            {
                object CloneArray(object arr)
                {
                    if (arr is not object[] array) return arr;
                    var copy = new object[array.Length];
                    for (var i = 0; i < array.Length; i += 1)
                    {
                        if (array[i] is RuntimeValue rv)
                        {
                            copy[i] = CloneValue(rv);
                        }
                        else
                        {
                            copy[i] = CloneArray(array[i]!);
                        }
                    }
                    return copy;
                }
                return RuntimeValues.Make(value.Type, CloneArray(value.Data!));
            }
            case TypeKind.Record:
            {
                var fields = new Dictionary<string, RuntimeValue>(StringComparer.Ordinal);
                var original = (Dictionary<string, RuntimeValue>)value.Data!;
                foreach (var (name, fieldValue) in original)
                {
                    fields[name] = CloneValue(fieldValue);
                }
                return RuntimeValues.Make(value.Type, fields);
            }
            case TypeKind.Set:
                return RuntimeValues.Make(value.Type, new HashSet<int>((HashSet<int>)value.Data!));
            default:
                return value;
        }
    }

    private DeclarationNode? ResolveMethod(string className, string methodName)
    {
        if (!_sema.ClassInfos.TryGetValue(className, out var classInfo)) return null;
        foreach (var member in classInfo.Decl.Members)
        {
            if (member is ProcDeclNode proc && proc.Name == methodName) return proc;
            if (member is FuncDeclNode func && func.Name == methodName) return func;
        }
        if (classInfo.BaseName != null) return ResolveMethod(classInfo.BaseName, methodName);
        return null;
    }

    private ConstructorDeclNode? ResolveConstructor(string className)
    {
        if (!_sema.ClassInfos.TryGetValue(className, out var classInfo)) return null;
        var ctor = classInfo.Decl.Members.OfType<ConstructorDeclNode>().FirstOrDefault();
        if (ctor != null) return ctor;
        if (classInfo.BaseName != null) return ResolveConstructor(classInfo.BaseName);
        return null;
    }

    private int CreateClassObject(string className)
    {
        var fields = new Dictionary<string, Cell>(StringComparer.Ordinal);
        if (!_sema.ClassInfos.TryGetValue(className, out var classInfo)) throw Errors.At(ErrorType.RuntimeError, 0, "Unknown class.");
        void InitFields(string name)
        {
            if (!_sema.ClassInfos.TryGetValue(name, out var info)) return;
            if (info.BaseName != null) InitFields(info.BaseName);
            foreach (var member in info.Decl.Members)
            {
                if (member is VarDeclNode varDecl)
                {
                    var type = ResolveType(varDecl.TypeSpec);
                    fields[varDecl.Name] = new Cell(type, Defaults.DefaultValue(type));
                }
            }
        }
        InitFields(className);
        return _store.AllocClassObject(className, fields);
    }

    private TypeSymbol ResolveType(TypeNode node)
    {
        switch (node)
        {
            case BasicTypeNode basic:
                return basic.Name switch
                {
                    BasicTypeName.INTEGER => Types.Integer,
                    BasicTypeName.REAL => Types.Real,
                    BasicTypeName.BOOLEAN => Types.Boolean,
                    BasicTypeName.CHAR => Types.Char,
                    BasicTypeName.STRING => Types.String,
                    BasicTypeName.DATE => Types.Date,
                    _ => Types.Integer
                };
            case ArrayTypeNode array:
                return new ArrayType(array.Bounds.Select(b => new ArrayBounds(b.Low, b.High)).ToList(), ResolveType(array.ElementType));
            case RecordTypeNode record:
            {
                var fields = new Dictionary<string, TypeSymbol>(StringComparer.Ordinal);
                foreach (var field in record.Fields)
                {
                    fields[field.Name] = ResolveType(field.TypeSpec);
                }
                return new RecordType(fields);
            }
            case EnumTypeNode enumNode:
                return new EnumType("<anon>", enumNode.Members.ToList());
            case SetTypeNode setNode:
            {
                var baseType = _currentScope.LookupType(setNode.BaseName) ?? _sema.GlobalScope.Lookup(setNode.BaseName)?.Type;
                if (baseType is not EnumType enumType) throw Errors.At(ErrorType.TypeError, node.Loc.Line, "SET OF requires enum type.");
                return new SetType(enumType);
            }
            case PointerTypeNode pointer:
                return new PointerType(ResolveType(pointer.Target));
            case TextFileTypeNode:
                return new TextFileType();
            case RandomFileTypeNode randomFile:
            {
                var recordType = _currentScope.LookupType(randomFile.RecordName) ?? _sema.GlobalScope.Lookup(randomFile.RecordName)?.Type;
                if (recordType is not RecordType record) throw Errors.At(ErrorType.TypeError, node.Loc.Line, "RANDOMFILE requires RECORD type.");
                return new RandomFileType(record);
            }
            case NamedTypeNode named:
            {
                var t = _currentScope.LookupType(named.Name) ?? _sema.GlobalScope.Lookup(named.Name)?.Type;
                if (t == null) throw Errors.At(ErrorType.NameError, node.Loc.Line, "Unknown type.");
                return t;
            }
            default:
                throw Errors.At(ErrorType.TypeError, node.Loc.Line, "Unknown type.");
        }
    }

    private bool IsBuiltin(string name)
    {
        return new HashSet<string>(StringComparer.Ordinal)
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
        }.Contains(name);
    }

    private RuntimeValue CallBuiltin(string name, CallExprNode expr)
    {
        return name switch
        {
            "RAND" => expr.Args.Count != 0 ? throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "RAND takes no arguments.") : _stdlib.Rand(),
            "LENGTH" => RequireArgCount(expr, 1, () => _stdlib.Length(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "RIGHT" => RequireArgCount(expr, 2, () => _stdlib.Right(EvalExpr(expr.Args[0]), EvalExpr(expr.Args[1]), expr.Loc.Line)),
            "MID" => RequireArgCount(expr, 3, () => _stdlib.Mid(EvalExpr(expr.Args[0]), EvalExpr(expr.Args[1]), EvalExpr(expr.Args[2]), expr.Loc.Line)),
            "LCASE" => RequireArgCount(expr, 1, () => _stdlib.LCase(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "UCASE" => RequireArgCount(expr, 1, () => _stdlib.UCase(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "INT" => RequireArgCount(expr, 1, () => _stdlib.Int(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "REAL" => RequireArgCount(expr, 1, () => _stdlib.Real(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "STRING" => RequireArgCount(expr, 1, () => _stdlib.String(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "CHAR" => RequireArgCount(expr, 1, () => _stdlib.Char(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "BOOLEAN" => RequireArgCount(expr, 1, () => _stdlib.Boolean(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "DATE" => RequireArgCount(expr, 1, () => _stdlib.Date(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "ORD" => RequireArgCount(expr, 1, () => _stdlib.Ord(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            "ENUMVALUE" => RequireArgCount(expr, 2, () =>
            {
                var typeNameExpr = expr.Args[0];
                if (typeNameExpr is not NameExprNode nameExpr) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "ENUMVALUE requires enum type name.");
                var enumType = _currentScope.LookupType(nameExpr.Name);
                if (enumType == null) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "ENUMVALUE requires enum type name.");
                return _stdlib.EnumValue(enumType, EvalExpr(expr.Args[1]), expr.Loc.Line);
            }),
            "SIZE" => RequireArgCount(expr, 1, () => _stdlib.Size(EvalExpr(expr.Args[0]), expr.Loc.Line)),
            _ => throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Unknown builtin.")
        };
    }

    private RuntimeValue RequireArgCount(CallExprNode expr, int count, Func<RuntimeValue> func)
    {
        if (expr.Args.Count != count) throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Argument count mismatch.");
        return func();
    }

    private string NextInputToken(int line)
    {
        if (_inputIndex >= _inputTokens.Length) throw Errors.At(ErrorType.RuntimeError, line, "No input available.");
        return _inputTokens[_inputIndex++];
    }

    private RuntimeValue ParseInputToken(string token, TypeSymbol type, int line)
    {
        switch (type.Kind)
        {
            case TypeKind.Integer:
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[+-]?[0-9]+$")) throw Errors.At(ErrorType.TypeError, line, "Invalid INTEGER token.");
                return RuntimeValues.Make(Types.Integer, MathUtil.CheckInt(double.Parse(token, System.Globalization.CultureInfo.InvariantCulture), line));
            }
            case TypeKind.Real:
            {
                if (!System.Text.RegularExpressions.Regex.IsMatch(token, "^[+-]?[0-9]+(\\.[0-9]+)?([eE][+-]?[0-9]+)?$")) throw Errors.At(ErrorType.TypeError, line, "Invalid REAL token.");
                return RuntimeValues.Make(Types.Real, MathUtil.CheckReal(double.Parse(token, System.Globalization.CultureInfo.InvariantCulture), line));
            }
            case TypeKind.Boolean:
            {
                var t = token.ToUpperInvariant();
                if (t != "TRUE" && t != "FALSE") throw Errors.At(ErrorType.TypeError, line, "Invalid BOOLEAN token.");
                return RuntimeValues.Make(Types.Boolean, t == "TRUE");
            }
            case TypeKind.Char:
            {
                if (token.Length != 1) throw Errors.At(ErrorType.TypeError, line, "Invalid CHAR token.");
                return RuntimeValues.Make(Types.Char, token);
            }
            case TypeKind.String:
                return RuntimeValues.Make(Types.String, token);
            case TypeKind.Date:
                return RuntimeValues.Make(Types.Date, DateUtil.ParseDateLiteral(token, line));
            case TypeKind.Enum:
            {
                var enumType = (EnumType)type;
                var idx = -1;
                for (var i = 0; i < enumType.Members.Count; i += 1)
                {
                    if (enumType.Members[i] == token)
                    {
                        idx = i;
                        break;
                    }
                }
                if (idx == -1) throw Errors.At(ErrorType.TypeError, line, "Invalid ENUM token.");
                return RuntimeValues.Make(enumType, idx);
            }
            default:
                throw Errors.At(ErrorType.TypeError, line, "INPUT type not supported.");
        }
    }

    private sealed class ReturnSignal : Exception
    {
        public ReturnSignal(RuntimeValue? value)
        {
            Value = value;
        }

        public RuntimeValue? Value { get; }
    }

    private sealed class RuntimeScope
    {
        private readonly Dictionary<string, ICellLike> _vars = new(StringComparer.Ordinal);
        private readonly Dictionary<string, RuntimeValue> _consts = new(StringComparer.Ordinal);
        private readonly Dictionary<string, TypeSymbol> _types = new(StringComparer.Ordinal);
        private readonly Dictionary<string, ProcDeclNode> _procs = new(StringComparer.Ordinal);
        private readonly Dictionary<string, FuncDeclNode> _funcs = new(StringComparer.Ordinal);
        private readonly Dictionary<string, ClassDeclNode> _classes = new(StringComparer.Ordinal);

        public RuntimeScope(RuntimeScope? parent)
        {
            Parent = parent;
        }

        public RuntimeScope? Parent { get; }

        public void DefineVar(string name, ICellLike cell) => _vars[name] = cell;

        public void DefineConst(string name, RuntimeValue value) => _consts[name] = value;

        public void DefineType(string name, TypeSymbol type) => _types[name] = type;

        public void DefineProc(string name, ProcDeclNode decl) => _procs[name] = decl;

        public void DefineFunc(string name, FuncDeclNode decl) => _funcs[name] = decl;

        public void DefineClass(string name, ClassDeclNode decl) => _classes[name] = decl;

        public ICellLike? LookupVar(string name) => _vars.TryGetValue(name, out var cell) ? cell : Parent?.LookupVar(name);

        public RuntimeValue? LookupConst(string name) => _consts.TryGetValue(name, out var value) ? value : Parent?.LookupConst(name);

        public TypeSymbol? LookupType(string name) => _types.TryGetValue(name, out var type) ? type : Parent?.LookupType(name);

        public ProcDeclNode? LookupProc(string name) => _procs.TryGetValue(name, out var decl) ? decl : Parent?.LookupProc(name);

        public FuncDeclNode? LookupFunc(string name) => _funcs.TryGetValue(name, out var decl) ? decl : Parent?.LookupFunc(name);

        public ClassDeclNode? LookupClass(string name) => _classes.TryGetValue(name, out var decl) ? decl : Parent?.LookupClass(name);
    }

    private sealed class ProxyCell : ICellLike
    {
        private readonly Func<RuntimeValue> _getter;
        private readonly Action<RuntimeValue> _setter;

        public ProxyCell(TypeSymbol type, Func<RuntimeValue> getter, Action<RuntimeValue> setter)
        {
            Type = type;
            _getter = getter;
            _setter = setter;
        }

        public TypeSymbol Type { get; }

        public RuntimeValue Get() => _getter();

        public void Set(RuntimeValue value) => _setter(value);

        public ICellLike? GetRef() => null;
    }

    private sealed class ObjectIdHolder
    {
        public ObjectIdHolder(int value) => Value = value;
        public int Value { get; }
    }
}
