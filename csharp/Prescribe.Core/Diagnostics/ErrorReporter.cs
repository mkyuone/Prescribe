namespace Prescribe.Core.Diagnostics;

public static class ErrorReporter
{
    public static string Format(PrescribeError err)
    {
        return $"{err.ErrorType} at line {err.Line}: {err.Message}";
    }
}
