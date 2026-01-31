using Prescribe.Core.Diagnostics;

namespace Prescribe.Core.Util;

public static class MathUtil
{
    public const int IntMin = -2147483648;
    public const int IntMax = 2147483647;

    public static int CheckInt(double value, int line)
    {
        if (value % 1 != 0)
        {
            throw Errors.At(ErrorType.RangeError, line, "Integer overflow.");
        }
        if (value < IntMin || value > IntMax)
        {
            throw Errors.At(ErrorType.RangeError, line, "Integer overflow.");
        }
        return (int)value;
    }

    public static double CheckReal(double value, int line)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            throw Errors.At(ErrorType.RuntimeError, line, "Invalid real value.");
        }
        var abs = Math.Abs(value);
        if (abs != 0 && (abs < double.Epsilon || abs > double.MaxValue))
        {
            throw Errors.At(ErrorType.RangeError, line, "Real overflow/underflow.");
        }
        return value;
    }

    public static (int q, int r) DivEuclid(int a, int b, int line)
    {
        if (b == 0)
        {
            throw Errors.At(ErrorType.RuntimeError, line, "Division by zero.");
        }
        var q = (int)Math.Truncate((double)a / b);
        var r = a % b;
        if (r < 0)
        {
            r += Math.Abs(b);
        }
        var adjQ = (a - r) / b;
        return (CheckInt(adjQ, line), CheckInt(r, line));
    }
}
