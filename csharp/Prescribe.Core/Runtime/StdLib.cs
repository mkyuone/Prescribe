using Prescribe.Core.Diagnostics;
using Prescribe.Core.Semantics;
using Prescribe.Core.Util;

namespace Prescribe.Core.Runtime;

public sealed class StdLib
{
    private long _seed = 1;

    public RuntimeValue Rand()
    {
        _seed = (1103515245 * _seed + 12345) % 2147483648;
        return RuntimeValues.Make(Types.Real, _seed / 2147483648.0);
    }

    public RuntimeValue Length(RuntimeValue arg, int line)
    {
        if (arg.Type.Kind != TypeKind.String) throw Errors.At(ErrorType.TypeError, line, "LENGTH requires STRING.");
        return RuntimeValues.Make(Types.Integer, ((string)arg.Data!).Length);
    }

    public RuntimeValue Right(RuntimeValue s, RuntimeValue n, int line)
    {
        if (s.Type.Kind != TypeKind.String || n.Type.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, line, "RIGHT requires STRING, INTEGER.");
        var str = (string)s.Data!;
        var count = (int)n.Data!;
        if (count < 0 || count > str.Length) throw Errors.At(ErrorType.RangeError, line, "RIGHT out of range.");
        return RuntimeValues.Make(Types.String, str.Substring(str.Length - count));
    }

    public RuntimeValue Mid(RuntimeValue s, RuntimeValue start, RuntimeValue n, int line)
    {
        if (s.Type.Kind != TypeKind.String || start.Type.Kind != TypeKind.Integer || n.Type.Kind != TypeKind.Integer)
        {
            throw Errors.At(ErrorType.TypeError, line, "MID requires STRING, INTEGER, INTEGER.");
        }
        var str = (string)s.Data!;
        var pos = (int)start.Data!;
        var count = (int)n.Data!;
        if (count < 0 || pos < 1 || pos > str.Length + 1 || pos + count - 1 > str.Length)
        {
            throw Errors.At(ErrorType.RangeError, line, "MID out of range.");
        }
        return RuntimeValues.Make(Types.String, str.Substring(pos - 1, count));
    }

    public RuntimeValue LCase(RuntimeValue s, int line)
    {
        if (s.Type.Kind != TypeKind.String) throw Errors.At(ErrorType.TypeError, line, "LCASE requires STRING.");
        return RuntimeValues.Make(Types.String, ToLowerAscii((string)s.Data!));
    }

    public RuntimeValue UCase(RuntimeValue s, int line)
    {
        if (s.Type.Kind != TypeKind.String) throw Errors.At(ErrorType.TypeError, line, "UCASE requires STRING.");
        return RuntimeValues.Make(Types.String, ToUpperAscii((string)s.Data!));
    }

    public RuntimeValue Int(RuntimeValue x, int line)
    {
        if (x.Type.Kind != TypeKind.Real) throw Errors.At(ErrorType.TypeError, line, "INT requires REAL.");
        return RuntimeValues.Make(Types.Integer, (int)Math.Truncate((double)x.Data!));
    }

    public RuntimeValue Real(RuntimeValue x, int line)
    {
        if (x.Type.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, line, "REAL requires INTEGER.");
        return RuntimeValues.Make(Types.Real, Convert.ToDouble(x.Data));
    }

    public RuntimeValue String(RuntimeValue x, int line)
    {
        return RuntimeValues.Make(Types.String, ToOutputString(x, line));
    }

    public RuntimeValue Char(RuntimeValue x, int line)
    {
        if (x.Type.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, line, "CHAR requires INTEGER.");
        var num = (int)x.Data!;
        if (num < 0 || num > 127) throw Errors.At(ErrorType.RangeError, line, "CHAR out of range.");
        return RuntimeValues.Make(Types.Char, ((char)num).ToString());
    }

    public RuntimeValue Boolean(RuntimeValue x, int line)
    {
        if (x.Type.Kind != TypeKind.String) throw Errors.At(ErrorType.TypeError, line, "BOOLEAN requires STRING.");
        var text = ((string)x.Data!).ToUpperInvariant();
        if (text == "TRUE") return RuntimeValues.Make(Types.Boolean, true);
        if (text == "FALSE") return RuntimeValues.Make(Types.Boolean, false);
        throw Errors.At(ErrorType.TypeError, line, "Invalid BOOLEAN token.");
    }

    public RuntimeValue Date(RuntimeValue x, int line)
    {
        if (x.Type.Kind != TypeKind.String) throw Errors.At(ErrorType.TypeError, line, "DATE requires STRING.");
        var value = DateUtil.ParseDateLiteral((string)x.Data!, line);
        return RuntimeValues.Make(Types.Date, value);
    }

    public RuntimeValue Ord(RuntimeValue x, int line)
    {
        if (x.Type.Kind != TypeKind.Enum) throw Errors.At(ErrorType.TypeError, line, "ORD requires ENUM.");
        return RuntimeValues.Make(Types.Integer, (int)x.Data!);
    }

    public RuntimeValue EnumValue(TypeSymbol enumType, RuntimeValue ordinal, int line)
    {
        if (ordinal.Type.Kind != TypeKind.Integer) throw Errors.At(ErrorType.TypeError, line, "ENUMVALUE ordinal must be INTEGER.");
        var value = (int)ordinal.Data!;
        if (enumType is not EnumType enumTypeSym) throw Errors.At(ErrorType.TypeError, line, "ENUMVALUE requires enum type.");
        if (value < 0 || value >= enumTypeSym.Members.Count) throw Errors.At(ErrorType.RangeError, line, "ENUMVALUE out of range.");
        return RuntimeValues.Make(enumType, value);
    }

    public RuntimeValue Size(RuntimeValue setValue, int line)
    {
        if (setValue.Type.Kind != TypeKind.Set) throw Errors.At(ErrorType.TypeError, line, "SIZE requires SET.");
        return RuntimeValues.Make(Types.Integer, ((HashSet<int>)setValue.Data!).Count);
    }

    private static string ToLowerAscii(string value)
    {
        var chars = value.ToCharArray();
        for (var i = 0; i < chars.Length; i += 1)
        {
            if (chars[i] is >= 'A' and <= 'Z')
            {
                chars[i] = (char)(chars[i] + 32);
            }
        }
        return new string(chars);
    }

    private static string ToUpperAscii(string value)
    {
        var chars = value.ToCharArray();
        for (var i = 0; i < chars.Length; i += 1)
        {
            if (chars[i] is >= 'a' and <= 'z')
            {
                chars[i] = (char)(chars[i] - 32);
            }
        }
        return new string(chars);
    }

    public static string ToOutputString(RuntimeValue value, int line)
    {
        return value.Type.Kind switch
        {
            TypeKind.Integer => Convert.ToString(value.Data, System.Globalization.CultureInfo.InvariantCulture) ?? "0",
            TypeKind.Real => StringUtil.FormatReal(Convert.ToDouble(value.Data), line),
            TypeKind.Boolean => ((bool)value.Data!) ? "TRUE" : "FALSE",
            TypeKind.Char => (string)value.Data!,
            TypeKind.String => (string)value.Data!,
            TypeKind.Date => DateUtil.DateToString((DateValue)value.Data!),
            _ => throw Errors.At(ErrorType.TypeError, line, "Value not outputtable.")
        };
    }
}
