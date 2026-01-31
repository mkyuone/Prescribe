using Prescribe.Core.Diagnostics;
using Prescribe.Core.Frontend;
using Prescribe.Core.Util;

namespace Prescribe.Core.Semantics;

public enum ConstKind
{
    Integer,
    Real,
    Boolean,
    Char,
    String,
    Date,
    Enum
}

public abstract record ConstValue(ConstKind Kind);

public sealed record IntegerConst(int Value) : ConstValue(ConstKind.Integer);

public sealed record RealConst(double Value) : ConstValue(ConstKind.Real);

public sealed record BooleanConst(bool Value) : ConstValue(ConstKind.Boolean);

public sealed record CharConst(string Value) : ConstValue(ConstKind.Char);

public sealed record StringConst(string Value) : ConstValue(ConstKind.String);

public sealed record DateConst(DateValue Value) : ConstValue(ConstKind.Date);

public sealed record EnumConst(string Name, int Ordinal) : ConstValue(ConstKind.Enum);

public sealed class ConstEnv : Dictionary<string, ConstValue>
{
    public ConstEnv() : base(StringComparer.Ordinal) { }
}

public static class ConstEval
{
    public static ConstValue EvalConst(ExprNode expr, ConstEnv env)
    {
        return expr switch
        {
            LiteralNode lit => LiteralToConst(lit),
            NameExprNode name => env.TryGetValue(name.Name, out var v) ? v : throw Errors.At(ErrorType.NameError, name.Loc.Line, $"Unknown constant {name.Name}."),
            UnaryExprNode unary => EvalUnary(unary, env),
            BinaryExprNode binary => EvalBinary(binary, env),
            _ => throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid constant expression.")
        };
    }

    private static ConstValue LiteralToConst(LiteralNode lit)
    {
        return lit.LiteralType switch
        {
            LiteralType.Integer => new IntegerConst((int)lit.Value),
            LiteralType.Real => new RealConst((double)lit.Value),
            LiteralType.Boolean => new BooleanConst((bool)lit.Value),
            LiteralType.Char => new CharConst((string)lit.Value),
            LiteralType.String => new StringConst((string)lit.Value),
            LiteralType.Date => new DateConst(DateUtil.ParseDateLiteral((string)lit.Value, lit.Loc.Line)),
            _ => throw Errors.At(ErrorType.TypeError, lit.Loc.Line, "Invalid literal type.")
        };
    }

    private static ConstValue EvalUnary(UnaryExprNode expr, ConstEnv env)
    {
        var value = EvalConst(expr.Expr, env);
        return expr.Op switch
        {
            "+" => value,
            "-" => value switch
            {
                IntegerConst i => new IntegerConst(MathUtil.CheckInt(-i.Value, expr.Loc.Line)),
                RealConst r => new RealConst(MathUtil.CheckReal(-r.Value, expr.Loc.Line)),
                _ => throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid constant unary operator.")
            },
            "NOT" => value is BooleanConst b ? new BooleanConst(!b.Value) : throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid constant unary operator."),
            _ => throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid constant unary operator.")
        };
    }

    private static ConstValue EvalBinary(BinaryExprNode expr, ConstEnv env)
    {
        var left = EvalConst(expr.Left, env);
        var right = EvalConst(expr.Right, env);
        var op = expr.Op;

        if (op is "+" or "-" or "*")
        {
            if (left is IntegerConst li && right is IntegerConst ri)
            {
                var result = op == "+" ? li.Value + ri.Value : op == "-" ? li.Value - ri.Value : li.Value * ri.Value;
                return new IntegerConst(MathUtil.CheckInt(result, expr.Loc.Line));
            }
            if (left is RealConst lr && right is RealConst rr)
            {
                var result = op == "+" ? lr.Value + rr.Value : op == "-" ? lr.Value - rr.Value : lr.Value * rr.Value;
                return new RealConst(MathUtil.CheckReal(result, expr.Loc.Line));
            }
        }
        if (op == "/")
        {
            if (left is IntegerConst li && right is IntegerConst ri)
            {
                if (ri.Value == 0) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Division by zero.");
                return new RealConst(MathUtil.CheckReal((double)li.Value / ri.Value, expr.Loc.Line));
            }
            if (left is RealConst lr && right is RealConst rr)
            {
                if (rr.Value == 0) throw Errors.At(ErrorType.RuntimeError, expr.Loc.Line, "Division by zero.");
                return new RealConst(MathUtil.CheckReal(lr.Value / rr.Value, expr.Loc.Line));
            }
        }
        if (op is "DIV" or "MOD")
        {
            if (left is IntegerConst li && right is IntegerConst ri)
            {
                var (q, r) = MathUtil.DivEuclid(li.Value, ri.Value, expr.Loc.Line);
                return op == "DIV" ? new IntegerConst(q) : new IntegerConst(r);
            }
        }
        if (op == "&")
        {
            if (left is StringConst ls && right is StringConst rs)
            {
                return new StringConst(ls.Value + rs.Value);
            }
            if (left is CharConst lc && right is CharConst rc)
            {
                return new StringConst(lc.Value + rc.Value);
            }
            if (left is StringConst ls2 && right is CharConst rc2)
            {
                return new StringConst(ls2.Value + rc2.Value);
            }
            if (left is CharConst lc2 && right is StringConst rs2)
            {
                return new StringConst(lc2.Value + rs2.Value);
            }
        }
        if (op is "AND" or "OR")
        {
            if (left is BooleanConst lb && right is BooleanConst rb)
            {
                return new BooleanConst(op == "AND" ? lb.Value && rb.Value : lb.Value || rb.Value);
            }
        }
        if (op is "=" or "<>" or "<" or "<=" or ">" or ">=")
        {
            var cmp = CompareConst(left, right, expr.Loc.Line);
            var result = op switch
            {
                "=" => cmp == 0,
                "<>" => cmp != 0,
                "<" => cmp < 0,
                "<=" => cmp <= 0,
                ">" => cmp > 0,
                ">=" => cmp >= 0,
                _ => false
            };
            return new BooleanConst(result);
        }

        throw Errors.At(ErrorType.TypeError, expr.Loc.Line, "Invalid constant binary operator.");
    }

    private static int CompareConst(ConstValue a, ConstValue b, int line)
    {
        if (a.Kind != b.Kind)
        {
            throw Errors.At(ErrorType.TypeError, line, "Incompatible constant comparison.");
        }
        return a switch
        {
            IntegerConst ai when b is IntegerConst bi => ai.Value - bi.Value,
            RealConst ar when b is RealConst br => (int)Math.Sign(ar.Value - br.Value),
            BooleanConst ab when b is BooleanConst bb => (ab.Value ? 1 : 0) - (bb.Value ? 1 : 0),
            CharConst ac when b is CharConst bc => string.CompareOrdinal(ac.Value, bc.Value),
            StringConst asc when b is StringConst bsc => string.CompareOrdinal(asc.Value, bsc.Value),
            DateConst ad when b is DateConst bd => DateUtil.CompareDate(ad.Value, bd.Value),
            _ => throw Errors.At(ErrorType.TypeError, line, "Invalid comparison.")
        };
    }

    public static object ConstToRuntime(ConstValue value)
    {
        return value switch
        {
            DateConst d => d.Value,
            EnumConst e => e.Ordinal,
            IntegerConst i => i.Value,
            RealConst r => r.Value,
            BooleanConst b => b.Value,
            CharConst c => c.Value,
            StringConst s => s.Value,
            _ => 0
        };
    }

    public static TypeSymbol? ConstType(ConstValue value, TypeSymbol? enumType)
    {
        if (value is EnumConst) return enumType;
        return null;
    }

    public static DateValue DateAddDays(DateValue date, int days)
    {
        return DateUtil.FromDayNumber(DateUtil.ToDayNumber(date) + days);
    }
}
