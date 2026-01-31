namespace Prescribe.Core.Semantics;

public enum TypeKind
{
    Integer,
    Real,
    Boolean,
    Char,
    String,
    Date,
    Null,
    Array,
    Record,
    Enum,
    Set,
    Pointer,
    Class,
    TextFile,
    RandomFile
}

public abstract record TypeSymbol(TypeKind Kind);

public sealed record BasicType(TypeKind Kind) : TypeSymbol(Kind);

public sealed record NullType() : TypeSymbol(TypeKind.Null);

public readonly record struct ArrayBounds(int Low, int High);

public sealed record ArrayType(IReadOnlyList<ArrayBounds> Bounds, TypeSymbol ElementType) : TypeSymbol(TypeKind.Array);

public sealed record RecordType(IReadOnlyDictionary<string, TypeSymbol> Fields) : TypeSymbol(TypeKind.Record);

public sealed record EnumType(string Name, IReadOnlyList<string> Members) : TypeSymbol(TypeKind.Enum);

public sealed record SetType(EnumType Base) : TypeSymbol(TypeKind.Set);

public sealed record PointerType(TypeSymbol Target) : TypeSymbol(TypeKind.Pointer);

public sealed record ClassType(string Name) : TypeSymbol(TypeKind.Class);

public sealed record TextFileType() : TypeSymbol(TypeKind.TextFile);

public sealed record RandomFileType(RecordType Record) : TypeSymbol(TypeKind.RandomFile);

public static class Types
{
    public static readonly BasicType Integer = new(TypeKind.Integer);
    public static readonly BasicType Real = new(TypeKind.Real);
    public static readonly BasicType Boolean = new(TypeKind.Boolean);
    public static readonly BasicType Char = new(TypeKind.Char);
    public static readonly BasicType String = new(TypeKind.String);
    public static readonly BasicType Date = new(TypeKind.Date);
    public static readonly NullType Null = new();

    public static bool IsNumeric(TypeSymbol t) => t.Kind is TypeKind.Integer or TypeKind.Real;

    public static bool IsComparable(TypeSymbol t)
    {
        return t.Kind is TypeKind.Integer or TypeKind.Real or TypeKind.Char or TypeKind.String or TypeKind.Date or TypeKind.Enum;
    }

    public static bool IsSet(TypeSymbol t) => t.Kind == TypeKind.Set;

    public static bool IsAssignable(TypeSymbol to, TypeSymbol from)
    {
        if (from.Kind == TypeKind.Null && (to.Kind == TypeKind.Pointer || to.Kind == TypeKind.Class)) return true;
        return TypeEquals(to, from);
    }

    public static bool TypeEquals(TypeSymbol a, TypeSymbol b)
    {
        if (a.Kind != b.Kind) return false;
        switch (a)
        {
            case NullType:
                return b is NullType;
            case ArrayType arrA when b is ArrayType arrB:
                if (arrA.Bounds.Count != arrB.Bounds.Count) return false;
                for (var i = 0; i < arrA.Bounds.Count; i += 1)
                {
                    if (arrA.Bounds[i].Low != arrB.Bounds[i].Low || arrA.Bounds[i].High != arrB.Bounds[i].High) return false;
                }
                return TypeEquals(arrA.ElementType, arrB.ElementType);
            case RecordType recA when b is RecordType recB:
                if (recA.Fields.Count != recB.Fields.Count) return false;
                foreach (var (name, t) in recA.Fields)
                {
                    if (!recB.Fields.TryGetValue(name, out var other) || !TypeEquals(t, other)) return false;
                }
                return true;
            case EnumType enumA when b is EnumType enumB:
                return enumA.Name == enumB.Name;
            case SetType setA when b is SetType setB:
                return setA.Base.Name == setB.Base.Name;
            case PointerType ptrA when b is PointerType ptrB:
                return TypeEquals(ptrA.Target, ptrB.Target);
            case ClassType classA when b is ClassType classB:
                return classA.Name == classB.Name;
            case RandomFileType randA when b is RandomFileType randB:
                return TypeEquals(randA.Record, randB.Record);
            default:
                return true;
        }
    }
}
