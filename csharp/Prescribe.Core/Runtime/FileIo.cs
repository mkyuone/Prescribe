using System.Buffers.Binary;
using Prescribe.Core.Diagnostics;
using Prescribe.Core.Semantics;
using Prescribe.Core.Util;

namespace Prescribe.Core.Runtime;

public interface IFileSystem
{
    bool Exists(string path);
    string ReadAllText(string path);
    void WriteAllText(string path, string content);
    void AppendAllText(string path, string content);
    byte[] ReadAllBytes(string path);
    void WriteAllBytes(string path, byte[] bytes);
}

public sealed class FileIo
{
    private readonly IFileSystem _fs;

    public FileIo(IFileSystem fs)
    {
        _fs = fs;
    }

    public TextFileHandle OpenTextFile(string path, string mode, int line)
    {
        var upper = mode.ToUpperInvariant();
        if (upper is not ("READ" or "WRITE" or "APPEND"))
        {
            throw Errors.At(ErrorType.FileError, line, "Invalid file mode.");
        }
        if (upper == "READ")
        {
            var content = _fs.Exists(path) ? _fs.ReadAllText(path) : "";
            var lines = content.Length == 0 ? new List<string>() : content.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None).ToList();
            return new TextFileHandle { Mode = TextFileMode.Read, Path = path, Lines = lines, Index = 0, Buffer = new List<string>(), Open = true };
        }
        return new TextFileHandle { Mode = upper == "WRITE" ? TextFileMode.Write : TextFileMode.Append, Path = path, Lines = new List<string>(), Index = 0, Buffer = new List<string>(), Open = true };
    }

    public void CloseTextFile(TextFileHandle handle)
    {
        if (!handle.Open) return;
        handle.Open = false;
        var text = string.Join("\n", handle.Buffer);
        if (handle.Mode == TextFileMode.Write)
        {
            _fs.WriteAllText(handle.Path, text);
        }
        else if (handle.Mode == TextFileMode.Append)
        {
            _fs.AppendAllText(handle.Path, text);
        }
    }

    public string ReadTextLine(TextFileHandle handle, int line)
    {
        if (!handle.Open || handle.Mode != TextFileMode.Read)
        {
            throw Errors.At(ErrorType.FileError, line, "File not open for READ.");
        }
        if (handle.Index >= handle.Lines.Count)
        {
            throw Errors.At(ErrorType.FileError, line, "End of file.");
        }
        return handle.Lines[handle.Index++].Trim();
    }

    public void WriteTextLine(TextFileHandle handle, string text, int line)
    {
        if (!handle.Open || (handle.Mode != TextFileMode.Write && handle.Mode != TextFileMode.Append))
        {
            throw Errors.At(ErrorType.FileError, line, "File not open for WRITE/APPEND.");
        }
        handle.Buffer.Add(text);
    }

    public bool EofText(TextFileHandle handle)
    {
        if (!handle.Open || handle.Mode != TextFileMode.Read) return true;
        return handle.Index >= handle.Lines.Count;
    }

    public RandomFileHandle OpenRandomFile(string path)
    {
        var buffer = _fs.Exists(path) ? _fs.ReadAllBytes(path) : Array.Empty<byte>();
        return new RandomFileHandle { Path = path, Position = 1, Buffer = buffer, Open = true };
    }

    public void CloseRandomFile(RandomFileHandle handle)
    {
        if (!handle.Open) return;
        handle.Open = false;
        _fs.WriteAllBytes(handle.Path, handle.Buffer);
    }

    public void SeekRandom(RandomFileHandle handle, int pos, int line)
    {
        if (!handle.Open) throw Errors.At(ErrorType.FileError, line, "File not open.");
        if (pos < 1) throw Errors.At(ErrorType.RangeError, line, "SEEK address out of range.");
        handle.Position = pos;
    }

    public RuntimeValue GetRecord(RandomFileHandle handle, TypeSymbol type, int line)
    {
        if (!handle.Open) throw Errors.At(ErrorType.FileError, line, "File not open.");
        var size = SizeOfType(type, line);
        var offset = (handle.Position - 1) * size;
        if (offset + size > handle.Buffer.Length)
        {
            throw Errors.At(ErrorType.FileError, line, "Record out of range.");
        }
        var slice = handle.Buffer.AsSpan(offset, size).ToArray();
        return DecodeValue(type, slice, line);
    }

    public void PutRecord(RandomFileHandle handle, TypeSymbol type, RuntimeValue value, int line)
    {
        if (!handle.Open) throw Errors.At(ErrorType.FileError, line, "File not open.");
        var size = SizeOfType(type, line);
        var offset = (handle.Position - 1) * size;
        var needed = offset + size;
        if (handle.Buffer.Length < needed)
        {
            var newBuf = new byte[needed];
            Buffer.BlockCopy(handle.Buffer, 0, newBuf, 0, handle.Buffer.Length);
            handle.Buffer = newBuf;
        }
        var encoded = EncodeValue(type, value, line);
        Buffer.BlockCopy(encoded, 0, handle.Buffer, offset, size);
    }

    public static int SizeOfType(TypeSymbol type, int line)
    {
        switch (type.Kind)
        {
            case TypeKind.Integer:
                return 4;
            case TypeKind.Real:
                return 8;
            case TypeKind.Boolean:
                return 1;
            case TypeKind.Char:
                return 4;
            case TypeKind.Date:
                return 4;
            case TypeKind.Enum:
                return 4;
            case TypeKind.Array:
            {
                var arrayType = (ArrayType)type;
                var count = arrayType.Bounds.Aggregate(1, (acc, b) => acc * (b.High - b.Low + 1));
                return count * SizeOfType(arrayType.ElementType, line);
            }
            case TypeKind.Record:
            {
                var recordType = (RecordType)type;
                var total = 0;
                foreach (var field in recordType.Fields.Values)
                {
                    total += SizeOfType(field, line);
                }
                return total;
            }
            default:
                throw Errors.At(ErrorType.TypeError, line, "Type not supported in RANDOMFILE.");
        }
    }

    private static byte[] EncodeValue(TypeSymbol type, RuntimeValue value, int line)
    {
        var size = SizeOfType(type, line);
        var buf = new byte[size];
        EncodeInto(buf, 0, type, value, line);
        return buf;
    }

    private static RuntimeValue DecodeValue(TypeSymbol type, byte[] buf, int line)
    {
        var res = DecodeFrom(buf, 0, type, line);
        return res.value;
    }

    private static int EncodeInto(byte[] buffer, int offset, TypeSymbol type, RuntimeValue value, int line)
    {
        switch (type.Kind)
        {
            case TypeKind.Integer:
                BinaryPrimitives.WriteInt32LittleEndian(buffer.AsSpan(offset, 4), (int)value.Data!);
                return offset + 4;
            case TypeKind.Real:
            {
                var bits = BitConverter.DoubleToInt64Bits((double)value.Data!);
                BinaryPrimitives.WriteInt64LittleEndian(buffer.AsSpan(offset, 8), bits);
                return offset + 8;
            }
            case TypeKind.Boolean:
                buffer[offset] = (bool)value.Data! ? (byte)1 : (byte)0;
                return offset + 1;
            case TypeKind.Char:
            {
                var ch = (string)value.Data!;
                var code = ch.Length == 0 ? 0 : char.ConvertToUtf32(ch, 0);
                BinaryPrimitives.WriteUInt32LittleEndian(buffer.AsSpan(offset, 4), (uint)code);
                return offset + 4;
            }
            case TypeKind.Date:
            {
                var d = (DateValue)value.Data!;
                BinaryPrimitives.WriteInt32LittleEndian(buffer.AsSpan(offset, 4), DateUtil.ToDayNumber(d));
                return offset + 4;
            }
            case TypeKind.Enum:
                BinaryPrimitives.WriteInt32LittleEndian(buffer.AsSpan(offset, 4), (int)value.Data!);
                return offset + 4;
            case TypeKind.Array:
            {
                var arrayType = (ArrayType)type;
                var dims = arrayType.Bounds.Select(b => b.High - b.Low + 1).ToArray();
                object data = value.Data!;
                int Write(object current, int depth, int off)
                {
                    if (depth == dims.Length - 1)
                    {
                        var arr = (object[])current;
                        for (var i = 0; i < dims[depth]; i += 1)
                        {
                            off = EncodeInto(buffer, off, arrayType.ElementType, (RuntimeValue)arr[i], line);
                        }
                        return off;
                    }
                    var outer = (object[])current;
                    for (var i = 0; i < dims[depth]; i += 1)
                    {
                        off = Write(outer[i], depth + 1, off);
                    }
                    return off;
                }
                return Write(data, 0, offset);
            }
            case TypeKind.Record:
            {
                var recordType = (RecordType)type;
                var fields = (Dictionary<string, RuntimeValue>)value.Data!;
                foreach (var (name, fieldType) in recordType.Fields)
                {
                    var fieldValue = fields[name];
                    offset = EncodeInto(buffer, offset, fieldType, fieldValue, line);
                }
                return offset;
            }
            default:
                throw Errors.At(ErrorType.TypeError, line, "Type not supported in RANDOMFILE.");
        }
    }

    private static (RuntimeValue value, int offset) DecodeFrom(byte[] buffer, int offset, TypeSymbol type, int line)
    {
        switch (type.Kind)
        {
            case TypeKind.Integer:
            {
                var value = BinaryPrimitives.ReadInt32LittleEndian(buffer.AsSpan(offset, 4));
                return (RuntimeValues.Make(type, value), offset + 4);
            }
            case TypeKind.Real:
            {
                var bits = BinaryPrimitives.ReadInt64LittleEndian(buffer.AsSpan(offset, 8));
                var value = BitConverter.Int64BitsToDouble(bits);
                return (RuntimeValues.Make(type, value), offset + 8);
            }
            case TypeKind.Boolean:
            {
                var value = buffer[offset] == 1;
                return (RuntimeValues.Make(type, value), offset + 1);
            }
            case TypeKind.Char:
            {
                var code = BinaryPrimitives.ReadUInt32LittleEndian(buffer.AsSpan(offset, 4));
                var value = char.ConvertFromUtf32((int)code);
                return (RuntimeValues.Make(type, value), offset + 4);
            }
            case TypeKind.Date:
            {
                var num = BinaryPrimitives.ReadInt32LittleEndian(buffer.AsSpan(offset, 4));
                var value = DateUtil.FromDayNumber(num);
                return (RuntimeValues.Make(type, value), offset + 4);
            }
            case TypeKind.Enum:
            {
                var ordinal = BinaryPrimitives.ReadInt32LittleEndian(buffer.AsSpan(offset, 4));
                return (RuntimeValues.Make(type, ordinal), offset + 4);
            }
            case TypeKind.Array:
            {
                var arrayType = (ArrayType)type;
                var dims = arrayType.Bounds.Select(b => b.High - b.Low + 1).ToArray();
                (object data, int off) Read(int depth, int off)
                {
                    if (depth == dims.Length - 1)
                    {
                        var arr = new object[dims[depth]];
                        for (var i = 0; i < dims[depth]; i += 1)
                        {
                            var res = DecodeFrom(buffer, off, arrayType.ElementType, line);
                            arr[i] = res.value;
                            off = res.offset;
                        }
                        return (arr, off);
                    }
                    var outer = new object[dims[depth]];
                    for (var i = 0; i < dims[depth]; i += 1)
                    {
                        var res = Read(depth + 1, off);
                        outer[i] = res.data;
                        off = res.off;
                    }
                    return (outer, off);
                }
                var res2 = Read(0, offset);
                return (RuntimeValues.Make(type, res2.data), res2.off);
            }
            case TypeKind.Record:
            {
                var recordType = (RecordType)type;
                var fields = new Dictionary<string, RuntimeValue>(StringComparer.Ordinal);
                foreach (var (name, fieldType) in recordType.Fields)
                {
                    var res = DecodeFrom(buffer, offset, fieldType, line);
                    fields[name] = res.value;
                    offset = res.offset;
                }
                return (RuntimeValues.Make(type, fields), offset);
            }
            default:
                throw Errors.At(ErrorType.TypeError, line, "Type not supported in RANDOMFILE.");
        }
    }
}
