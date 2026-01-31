namespace Prescribe.Core.Diagnostics;

public enum ErrorType
{
    SyntaxError,
    NameError,
    TypeError,
    RangeError,
    RuntimeError,
    FileError,
    AccessError
}

public sealed class PrescribeError : Exception
{
    public PrescribeError(ErrorType errorType, int line, string message) : base(message)
    {
        ErrorType = errorType;
        Line = line;
    }

    public ErrorType ErrorType { get; }
    public int Line { get; }
}

public static class Errors
{
    public static PrescribeError At(ErrorType errorType, int line, string message)
    {
        return new PrescribeError(errorType, line, message);
    }
}
