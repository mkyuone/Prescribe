## 3. Lexical Rules

### Case sensitivity
- **Keywords** are case‑insensitive (`IF`, `if`, `If` are equivalent).
- **Identifiers** are case‑sensitive (`Total` and `total` are distinct).
- An identifier cannot match a keyword in any casing.

### Whitespace
- Whitespace separates tokens and is otherwise ignored.
- Newlines do not affect semantics, except to end comments.

### Source encoding
- Source files are ASCII.
- The only non-ASCII character permitted in source code is the assignment arrow `←`.
- Non-ASCII characters may appear in runtime strings only via escape sequences.

### Comments
- Single‑line comments start with `//` and run to the end of the line.

### Identifiers
- Start with a letter `[A-Za-z]`.
- Followed by letters, digits, or `_`.
- Maximum length: 64 characters.

### Literal formats

**INTEGER**
- Decimal digits with optional leading `-`.
- Example: `0`, `-42`, `1001`.

**REAL**
- Decimal with a fractional part or exponent.
- Formats: `123.45`, `0.5`, `6.02E23`, `-1.0e-3`.

**BOOLEAN**
- `TRUE` or `FALSE` (case‑insensitive).

**CHAR**
- Single character in single quotes, with escapes.
- Example: `'A'`, `'\n'`, `'\x41'`.

**STRING**
- Double quotes with escape sequences.
- Example: `"hello"`, `"line\n"`.
- Supported escapes: `\n`, `\r`, `\t`, `\\`, `\"`, `\'`, `\xNN` (hex byte).

**DATE**
- Date literal: `DATE "YYYY-MM-DD"`.
- Example: `DATE "2026-01-30"`.
- The literal must represent a valid Gregorian calendar date; otherwise `SyntaxError`.

---

