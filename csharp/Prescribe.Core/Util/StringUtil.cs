using Prescribe.Core.Diagnostics;

namespace Prescribe.Core.Util;

public static class StringUtil
{
    public static string FormatReal(double value, int line)
    {
        if (double.IsNaN(value) || double.IsInfinity(value))
        {
            throw Errors.At(ErrorType.RuntimeError, line, "Invalid real value.");
        }
        var rounded = RoundHalfAwayFromZero(value, 6);
        var text = rounded.ToString("F6", System.Globalization.CultureInfo.InvariantCulture);
        text = text.TrimEnd('0');
        if (text.EndsWith("."))
        {
            text = text[..^1];
        }
        if (text.Length == 0)
        {
            text = "0";
        }
        return text;
    }

    private static double RoundHalfAwayFromZero(double value, int digits)
    {
        var factor = Math.Pow(10, digits);
        var scaled = value * factor;
        var rounded = scaled > 0 ? Math.Floor(scaled + 0.5) : Math.Ceiling(scaled - 0.5);
        return rounded / factor;
    }

    public static string EnsureCharLength(string value, int line)
    {
        if (value.Length != 1)
        {
            throw Errors.At(ErrorType.TypeError, line, "CHAR value must be length 1.");
        }
        return value;
    }
}
