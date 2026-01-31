using Prescribe.Core.Semantics;
using Prescribe.Core.Util;

namespace Prescribe.Core.Runtime;

public static class Defaults
{
    public static RuntimeValue DefaultValue(TypeSymbol type)
    {
        switch (type.Kind)
        {
            case TypeKind.Integer:
                return RuntimeValues.Make(type, 0);
            case TypeKind.Real:
                return RuntimeValues.Make(type, 0.0);
            case TypeKind.Boolean:
                return RuntimeValues.Make(type, false);
            case TypeKind.Char:
                return RuntimeValues.Make(type, "\0");
            case TypeKind.String:
                return RuntimeValues.Make(type, "");
            case TypeKind.Date:
                return RuntimeValues.Make(type, new DateValue(1, 1, 1));
            case TypeKind.Array:
            {
                var arrayType = (ArrayType)type;
                var dims = arrayType.Bounds.Select(b => b.High - b.Low + 1).ToArray();
                object Create(int depth)
                {
                    var size = dims[depth];
                    var arr = new object[size];
                    if (depth == dims.Length - 1)
                    {
                        for (var i = 0; i < size; i += 1)
                        {
                            arr[i] = DefaultValue(arrayType.ElementType);
                        }
                    }
                    else
                    {
                        for (var i = 0; i < size; i += 1)
                        {
                            arr[i] = Create(depth + 1);
                        }
                    }
                    return arr;
                }
                return RuntimeValues.Make(type, Create(0));
            }
            case TypeKind.Record:
            {
                var recordType = (RecordType)type;
                var fields = new Dictionary<string, RuntimeValue>(StringComparer.Ordinal);
                foreach (var (name, fieldType) in recordType.Fields)
                {
                    fields[name] = DefaultValue(fieldType);
                }
                return RuntimeValues.Make(type, fields);
            }
            case TypeKind.Enum:
                return RuntimeValues.Make(type, 0);
            case TypeKind.Set:
                return RuntimeValues.Make(type, new HashSet<int>());
            case TypeKind.Pointer:
            case TypeKind.Class:
            case TypeKind.TextFile:
            case TypeKind.RandomFile:
                return RuntimeValues.Make(type, null);
            default:
                throw new InvalidOperationException("Unknown type default.");
        }
    }
}
