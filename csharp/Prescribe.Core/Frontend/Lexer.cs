using Prescribe.Core.Diagnostics;

namespace Prescribe.Core.Frontend;

public sealed class Lexer
{
    private readonly string _text;
    private int _index;
    private int _line = 1;
    private int _column = 1;

    public Lexer(string text)
    {
        _text = text;
    }

    public Token NextToken()
    {
        SkipWhitespaceAndComments();
        if (IsAtEnd())
        {
            return new Token(TokenKind.EOF, string.Empty, _line, _column);
        }

        var startLine = _line;
        var startCol = _column;
        var ch = Peek();

        if (ch == '\u2190')
        {
            Advance();
            return new Token(TokenKind.Operator, "<-", startLine, startCol);
        }

        if (IsLetter(ch))
        {
            var lexeme = ReadWhile(c => IsLetter(c) || IsDigit(c) || c == '_');
            var upper = lexeme.ToUpperInvariant();
            if (upper == "TRUE" || upper == "FALSE")
            {
                return new Token(TokenKind.Boolean, lexeme, startLine, startCol, upper == "TRUE");
            }
            if (TokenTables.Keywords.Contains(upper))
            {
                return new Token(TokenKind.Keyword, upper, startLine, startCol);
            }
            return new Token(TokenKind.Identifier, lexeme, startLine, startCol);
        }

        if (IsDigit(ch))
        {
            var (lexeme, isReal) = ReadNumber();
            if (isReal)
            {
                return new Token(TokenKind.Real, lexeme, startLine, startCol, double.Parse(lexeme, System.Globalization.CultureInfo.InvariantCulture));
            }
            return new Token(TokenKind.Integer, lexeme, startLine, startCol, int.Parse(lexeme, System.Globalization.CultureInfo.InvariantCulture));
        }

        if (ch == '"')
        {
            var value = ReadString();
            return new Token(TokenKind.String, value, startLine, startCol, value);
        }

        if (ch == '\'')
        {
            var value = ReadChar();
            return new Token(TokenKind.Char, value, startLine, startCol, value);
        }

        var two = PeekN(2);
        if (TokenTables.Operators.Contains(two))
        {
            Advance();
            Advance();
            return new Token(TokenKind.Operator, two, startLine, startCol);
        }

        var one = Peek().ToString();
        if (TokenTables.Operators.Contains(one))
        {
            Advance();
            return new Token(TokenKind.Operator, one, startLine, startCol);
        }

        if (TokenTables.Delimiters.Contains(ch))
        {
            Advance();
            return new Token(TokenKind.Delimiter, ch.ToString(), startLine, startCol);
        }

        throw Errors.At(ErrorType.SyntaxError, startLine, $"Unexpected character '{ch}'.");
    }

    private void SkipWhitespaceAndComments()
    {
        while (!IsAtEnd())
        {
            var ch = Peek();
            if (ch == ' ' || ch == '\t' || ch == '\r' || ch == '\n')
            {
                Advance();
                continue;
            }
            if (ch == '/' && PeekN(2) == "//")
            {
                while (!IsAtEnd() && Peek() != '\n')
                {
                    Advance();
                }
                continue;
            }
            break;
        }
    }

    private (string lexeme, bool isReal) ReadNumber()
    {
        var lexeme = ReadWhile(IsDigit);
        var isReal = false;

        if (Peek() == '.' && IsDigit(PeekN(2).Length > 1 ? PeekN(2)[1] : '\0'))
        {
            isReal = true;
            lexeme += Advance();
            lexeme += ReadWhile(IsDigit);
        }

        if (Peek() == 'E' || Peek() == 'e')
        {
            isReal = true;
            lexeme += Advance();
            if (Peek() == '+' || Peek() == '-')
            {
                lexeme += Advance();
            }
            if (!IsDigit(Peek()))
            {
                throw Errors.At(ErrorType.SyntaxError, _line, "Invalid exponent format.");
            }
            lexeme += ReadWhile(IsDigit);
        }

        return (lexeme, isReal);
    }

    private string ReadString()
    {
        Advance();
        var value = "";
        while (!IsAtEnd())
        {
            var ch = Advance();
            if (ch == '"')
            {
                return value;
            }
            if (ch == '\\')
            {
                value += ReadEscape();
            }
            else
            {
                EnsureAscii(ch);
                value += ch;
            }
        }
        throw Errors.At(ErrorType.SyntaxError, _line, "Unterminated string literal.");
    }

    private string ReadChar()
    {
        Advance();
        if (IsAtEnd())
        {
            throw Errors.At(ErrorType.SyntaxError, _line, "Unterminated char literal.");
        }
        string value;
        var ch = Advance();
        if (ch == '\\')
        {
            value = ReadEscape();
        }
        else
        {
            EnsureAscii(ch);
            value = ch.ToString();
        }
        if (IsAtEnd() || Advance() != '\'')
        {
            throw Errors.At(ErrorType.SyntaxError, _line, "Unterminated char literal.");
        }
        if (value.Length != 1)
        {
            throw Errors.At(ErrorType.SyntaxError, _line, "Char literal must be exactly one character.");
        }
        return value;
    }

    private string ReadEscape()
    {
        if (IsAtEnd())
        {
            throw Errors.At(ErrorType.SyntaxError, _line, "Invalid escape sequence.");
        }
        var ch = Advance();
        switch (ch)
        {
            case 'n':
                return "\n";
            case 'r':
                return "\r";
            case 't':
                return "\t";
            case '\\':
                return "\\";
            case '"':
                return "\"";
            case '\'':
                return "\'";
            case 'x':
            {
                var h1 = Advance();
                var h2 = Advance();
                if (!IsHex(h1) || !IsHex(h2))
                {
                    throw Errors.At(ErrorType.SyntaxError, _line, "Invalid hex escape.");
                }
                var hex = new string(new[] { h1, h2 });
                return ((char)Convert.ToInt32(hex, 16)).ToString();
            }
            default:
                throw Errors.At(ErrorType.SyntaxError, _line, "Invalid escape sequence.");
        }
    }

    private void EnsureAscii(char ch)
    {
        if (ch > 0x7f)
        {
            throw Errors.At(ErrorType.SyntaxError, _line, "Non-ASCII character in source.");
        }
    }

    private string ReadWhile(Func<char, bool> pred)
    {
        var outText = "";
        while (!IsAtEnd() && pred(Peek()))
        {
            outText += Advance();
        }
        return outText;
    }

    private static bool IsLetter(char ch) => ch is >= 'A' and <= 'Z' or >= 'a' and <= 'z';

    private static bool IsDigit(char ch) => ch is >= '0' and <= '9';

    private static bool IsHex(char ch) => ch is >= '0' and <= '9' or >= 'A' and <= 'F' or >= 'a' and <= 'f';

    private char Peek() => _index < _text.Length ? _text[_index] : '\0';

    private string PeekN(int n)
    {
        if (_index >= _text.Length) return string.Empty;
        var len = Math.Min(n, _text.Length - _index);
        return _text.Substring(_index, len);
    }

    private char Advance()
    {
        var ch = _index < _text.Length ? _text[_index] : '\0';
        _index += 1;
        if (ch == '\n')
        {
            _line += 1;
            _column = 1;
        }
        else
        {
            _column += 1;
        }
        return ch;
    }

    private bool IsAtEnd() => _index >= _text.Length;
}
