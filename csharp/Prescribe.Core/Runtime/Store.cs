using Prescribe.Core.Semantics;

namespace Prescribe.Core.Runtime;

public interface ICellLike
{
    TypeSymbol Type { get; }
    RuntimeValue Get();
    void Set(RuntimeValue value);
    ICellLike? GetRef();
}

public sealed class Cell : ICellLike
{
    private Cell? _ref;
    private RuntimeValue _value;

    public Cell(TypeSymbol type, RuntimeValue value, Cell? reference = null)
    {
        Type = type;
        _value = value;
        _ref = reference;
    }

    public TypeSymbol Type { get; }

    public RuntimeValue Get()
    {
        return _ref?.Get() ?? _value;
    }

    public void Set(RuntimeValue value)
    {
        if (_ref != null)
        {
            _ref.Set(value);
            return;
        }
        _value = value;
    }

    public ICellLike? GetRef() => _ref;
}

public sealed class Frame
{
    private readonly Dictionary<string, ICellLike> _slots = new(StringComparer.Ordinal);

    public void Define(string name, ICellLike cell) => _slots[name] = cell;

    public ICellLike? Lookup(string name) => _slots.TryGetValue(name, out var cell) ? cell : null;
}

public sealed class Store
{
    private int _nextAddress = 1;
    public List<Frame> Frames { get; } = new();
    public Dictionary<int, ICellLike> Heap { get; } = new();
    public Dictionary<int, (string ClassName, Dictionary<string, Cell> Fields)> ClassHeap { get; } = new();
    public Dictionary<ICellLike, int> Addresses { get; } = new();

    public Frame PushFrame()
    {
        var frame = new Frame();
        Frames.Add(frame);
        return frame;
    }

    public void PopFrame()
    {
        if (Frames.Count > 0) Frames.RemoveAt(Frames.Count - 1);
    }

    public Frame CurrentFrame()
    {
        if (Frames.Count == 0)
        {
            return PushFrame();
        }
        return Frames[^1];
    }

    public int AllocPointerCell(TypeSymbol type)
    {
        var cell = new Cell(type, Defaults.DefaultValue(type));
        var addr = _nextAddress++;
        Heap[addr] = cell;
        return addr;
    }

    public int AddrOf(ICellLike cell)
    {
        if (Addresses.TryGetValue(cell, out var existing)) return existing;
        var addr = _nextAddress++;
        Addresses[cell] = addr;
        Heap[addr] = cell;
        return addr;
    }

    public ICellLike? Deref(int addr) => Heap.TryGetValue(addr, out var cell) ? cell : null;

    public int AllocClassObject(string className, Dictionary<string, Cell> fields)
    {
        var id = _nextAddress++;
        ClassHeap[id] = (className, fields);
        return id;
    }

    public (string ClassName, Dictionary<string, Cell> Fields)? GetClassObject(int id)
    {
        return ClassHeap.TryGetValue(id, out var obj) ? obj : null;
    }
}
