using Prescribe.Core.Semantics;
using Prescribe.Core.Util;

namespace Prescribe.Core.Runtime;

public sealed record RuntimeValue(TypeSymbol Type, object? Data);

public sealed record ClassObject(string ClassName, Dictionary<string, RuntimeValue> Fields);

public enum TextFileMode
{
    Read,
    Write,
    Append
}

public sealed class TextFileHandle
{
    public required TextFileMode Mode { get; init; }
    public required string Path { get; init; }
    public List<string> Lines { get; init; } = new();
    public int Index { get; set; }
    public List<string> Buffer { get; init; } = new();
    public bool Open { get; set; } = true;
}

public sealed class RandomFileHandle
{
    public required string Path { get; init; }
    public int Position { get; set; } = 1;
    public byte[] Buffer { get; set; } = Array.Empty<byte>();
    public bool Open { get; set; } = true;
}

public static class RuntimeValues
{
    public static RuntimeValue Make(TypeSymbol type, object? data) => new(type, data);

    public static DateValue AsDate(RuntimeValue value) => (DateValue)value.Data!;
}
