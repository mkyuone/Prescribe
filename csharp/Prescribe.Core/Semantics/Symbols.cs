using Prescribe.Core.Frontend;

namespace Prescribe.Core.Semantics;

public enum SymbolKind
{
    Var,
    Const,
    Type,
    Proc,
    Func,
    Class,
    Field,
    Method,
    Constructor,
    Param,
    EnumMember
}

public sealed record Symbol(SymbolKind Kind, string Name, TypeSymbol? Type = null, AstNode? Decl = null, AccessModifier? Access = null, string? OwnerClass = null);

public sealed class Scope
{
    private readonly Dictionary<string, Symbol> _symbols = new(StringComparer.Ordinal);

    public Scope(Scope? parent = null)
    {
        Parent = parent;
    }

    public Scope? Parent { get; }

    public void Define(Symbol sym)
    {
        _symbols[sym.Name] = sym;
    }

    public Symbol? Lookup(string name)
    {
        if (_symbols.TryGetValue(name, out var sym)) return sym;
        return Parent?.Lookup(name);
    }

    public Symbol? LookupLocal(string name) => _symbols.TryGetValue(name, out var sym) ? sym : null;
}

public sealed record ClassInfo(
    string Name,
    string? BaseName,
    Dictionary<string, Symbol> Fields,
    Dictionary<string, Symbol> Methods,
    Symbol? Constructor,
    ClassDeclNode Decl);

public sealed record ProcInfo(string Name, AstNode Decl, TypeSymbol? Type = null);

public sealed record BlockInfo(Scope Scope, BlockNode Block);
