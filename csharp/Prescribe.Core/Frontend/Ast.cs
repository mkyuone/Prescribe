namespace Prescribe.Core.Frontend;

public readonly record struct SourceLoc(int Line, int Column);

public abstract record AstNode(SourceLoc Loc);

public sealed record ProgramNode(string Name, BlockNode Block, SourceLoc Loc) : AstNode(Loc);

public sealed record BlockNode(IReadOnlyList<DeclarationNode> Declarations, IReadOnlyList<StatementNode> Statements, SourceLoc Loc) : AstNode(Loc);

public abstract record DeclarationNode(SourceLoc Loc) : AstNode(Loc);

public enum AccessModifier
{
    Public,
    Private
}

public interface IClassMember { }

public sealed record VarDeclNode(string Name, TypeNode TypeSpec, SourceLoc Loc, AccessModifier? Access = null) : DeclarationNode(Loc), IClassMember;

public sealed record ConstDeclNode(string Name, ExprNode Expr, SourceLoc Loc) : DeclarationNode(Loc);

public sealed record TypeDeclNode(string Name, TypeNode TypeSpec, SourceLoc Loc) : DeclarationNode(Loc);

public enum ParamMode
{
    ByVal,
    ByRef
}

public sealed record ParamNode(string Name, ParamMode Mode, TypeNode TypeSpec, SourceLoc Loc) : AstNode(Loc);

public sealed record ProcDeclNode(string Name, IReadOnlyList<ParamNode> Params, BlockNode Block, SourceLoc Loc, AccessModifier? Access = null) : DeclarationNode(Loc), IClassMember;

public sealed record FuncDeclNode(string Name, IReadOnlyList<ParamNode> Params, TypeNode ReturnType, BlockNode Block, SourceLoc Loc, AccessModifier? Access = null) : DeclarationNode(Loc), IClassMember;

public sealed record ConstructorDeclNode(string Name, IReadOnlyList<ParamNode> Params, BlockNode Block, SourceLoc Loc, AccessModifier? Access = null) : DeclarationNode(Loc), IClassMember;

public sealed record ClassDeclNode(string Name, string? BaseName, IReadOnlyList<IClassMember> Members, SourceLoc Loc) : DeclarationNode(Loc);

public abstract record StatementNode(SourceLoc Loc) : AstNode(Loc);

public sealed record AssignStmtNode(LValueNode Target, ExprNode Expr, SourceLoc Loc) : StatementNode(Loc);

public sealed record IfStmtNode(ExprNode Condition, BlockNode ThenBlock, BlockNode? ElseBlock, SourceLoc Loc) : StatementNode(Loc);

public sealed record CaseBranchNode(IReadOnlyList<CaseLabelNode> Labels, BlockNode Block, SourceLoc Loc) : AstNode(Loc);

public abstract record CaseLabelNode(SourceLoc Loc) : AstNode(Loc);

public sealed record CaseValueNode(LiteralNode Value, SourceLoc Loc) : CaseLabelNode(Loc);

public sealed record CaseRangeNode(LiteralNode Start, LiteralNode End, SourceLoc Loc) : CaseLabelNode(Loc);

public sealed record CaseStmtNode(ExprNode Expr, IReadOnlyList<CaseBranchNode> Branches, BlockNode? OtherwiseBlock, SourceLoc Loc) : StatementNode(Loc);

public sealed record ForStmtNode(string Name, ExprNode Start, ExprNode End, ExprNode? Step, BlockNode Block, SourceLoc Loc) : StatementNode(Loc);

public sealed record WhileStmtNode(ExprNode Condition, BlockNode Block, SourceLoc Loc) : StatementNode(Loc);

public sealed record RepeatStmtNode(BlockNode Block, ExprNode Condition, SourceLoc Loc) : StatementNode(Loc);

public sealed record CallStmtNode(ProcRefNode Callee, IReadOnlyList<ExprNode> Args, SourceLoc Loc) : StatementNode(Loc);

public sealed record ReturnStmtNode(ExprNode? Expr, SourceLoc Loc) : StatementNode(Loc);

public sealed record InputStmtNode(IReadOnlyList<LValueNode> Targets, SourceLoc Loc) : StatementNode(Loc);

public sealed record OutputStmtNode(IReadOnlyList<ExprNode> Values, SourceLoc Loc) : StatementNode(Loc);

public abstract record FileStmtNode(SourceLoc Loc) : StatementNode(Loc);

public sealed record OpenFileStmtNode(string FileName, string Path, string Mode, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record CloseFileStmtNode(string FileName, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record ReadFileStmtNode(string FileName, LValueNode Target, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record WriteFileStmtNode(string FileName, ExprNode Expr, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record SeekStmtNode(string FileName, ExprNode Address, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record GetRecordStmtNode(string FileName, LValueNode Target, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record PutRecordStmtNode(string FileName, ExprNode Expr, SourceLoc Loc) : FileStmtNode(Loc);

public sealed record SuperCallStmtNode(string? MethodName, IReadOnlyList<ExprNode> Args, SourceLoc Loc) : StatementNode(Loc);

public sealed record ProcRefNode(IReadOnlyList<string> Parts, SourceLoc Loc) : AstNode(Loc);

public abstract record ExprNode(SourceLoc Loc) : AstNode(Loc);

public sealed record BinaryExprNode(string Op, ExprNode Left, ExprNode Right, SourceLoc Loc) : ExprNode(Loc);

public sealed record UnaryExprNode(string Op, ExprNode Expr, SourceLoc Loc) : ExprNode(Loc);

public sealed record LiteralNode(object Value, LiteralType LiteralType, SourceLoc Loc) : ExprNode(Loc);

public enum LiteralType
{
    Integer,
    Real,
    Boolean,
    Char,
    String,
    Date
}

public sealed record NameExprNode(string Name, SourceLoc Loc) : LValueNode(Loc);

public sealed record CallExprNode(ExprNode Callee, IReadOnlyList<ExprNode> Args, SourceLoc Loc) : ExprNode(Loc);

public sealed record IndexExprNode(ExprNode Base, IReadOnlyList<ExprNode> Indices, SourceLoc Loc) : LValueNode(Loc);

public sealed record FieldExprNode(ExprNode Base, string Field, SourceLoc Loc) : LValueNode(Loc);

public sealed record NewExprNode(string? TypeName, TypeNode? TypeSpec, IReadOnlyList<ExprNode> Args, SourceLoc Loc) : ExprNode(Loc);

public sealed record EOFExprNode(string FileName, SourceLoc Loc) : ExprNode(Loc);

public sealed record NullExprNode(SourceLoc Loc) : ExprNode(Loc);

public abstract record LValueNode(SourceLoc Loc) : ExprNode(Loc);

public sealed record DerefExprNode(ExprNode Expr, SourceLoc Loc) : LValueNode(Loc);

public abstract record TypeNode(SourceLoc Loc) : AstNode(Loc);

public sealed record BasicTypeNode(BasicTypeName Name, SourceLoc Loc) : TypeNode(Loc);

public enum BasicTypeName
{
    INTEGER,
    REAL,
    BOOLEAN,
    CHAR,
    STRING,
    DATE
}

public sealed record ArrayTypeNode(IReadOnlyList<ArrayBoundNode> Bounds, TypeNode ElementType, SourceLoc Loc) : TypeNode(Loc);

public sealed record ArrayBoundNode(int Low, int High, SourceLoc Loc) : AstNode(Loc);

public sealed record RecordTypeNode(IReadOnlyList<VarDeclNode> Fields, SourceLoc Loc) : TypeNode(Loc);

public sealed record EnumTypeNode(IReadOnlyList<string> Members, SourceLoc Loc) : TypeNode(Loc);

public sealed record SetTypeNode(string BaseName, SourceLoc Loc) : TypeNode(Loc);

public sealed record PointerTypeNode(TypeNode Target, SourceLoc Loc) : TypeNode(Loc);

public abstract record FileTypeNode(SourceLoc Loc) : TypeNode(Loc);

public sealed record TextFileTypeNode(SourceLoc Loc) : FileTypeNode(Loc);

public sealed record RandomFileTypeNode(string RecordName, SourceLoc Loc) : FileTypeNode(Loc);

public sealed record NamedTypeNode(string Name, SourceLoc Loc) : TypeNode(Loc);
