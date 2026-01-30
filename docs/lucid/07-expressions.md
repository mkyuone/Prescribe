## 7. Expressions

### Operators

**Arithmetic**
- `+`, `-`, `*`, `/` on INTEGER or REAL.
- `/` always produces REAL.
- Unary `+`, `-` supported for numeric types.
- Both operands must have the same numeric type; use explicit conversion functions to mix INTEGER and REAL.

**DIV and MOD (Euclidean)**
- `a DIV b` returns integer quotient, `a MOD b` returns remainder.
- `b = 0` raises `RuntimeError`.
- Euclidean rules: remainder `r` satisfies `0 <= r < |b|` and `a = b*q + r`.
- Operands must be INTEGER.

**Comparisons**
- `=`, `<>`, `<`, `<=`, `>`, `>=` for compatible types.
- INTEGER and REAL compare within their own type only (no implicit widening).
- CHAR and STRING compare lexicographically by Unicode code point.
- DATE compares by chronological order.
- ENUM compares by ordinal.
- BOOLEAN supports only `=` and `<>`.
- ARRAY, RECORD, SET, POINTER, CLASS, TEXTFILE, and RANDOMFILE are not comparable.

**Boolean**
- `AND`, `OR`, `NOT`.
- Short‑circuit evaluation is **not** used; all operands are evaluated left‑to‑right.

**String concatenation**
- `&` concatenates STRING and/or CHAR.

**Set operators**
- `IN` tests membership: `<enumValue> IN <set>` returns BOOLEAN.
- `UNION`, `INTERSECT`, `DIFF` operate on sets of the same enum base type.
- The result type is the same set type as the operands.

**Pointer operators**
- `@` (address-of) returns a pointer to an lvalue.
- `^` (dereference) returns the value pointed to by a pointer.

### Operator type compatibility matrix

| Operator(s) | Operand types | Result type | Errors |
|-------------|--------------|-------------|--------|
| `+ - *` | INTEGER, INTEGER | INTEGER | RangeError on overflow |
| `+ - *` | REAL, REAL | REAL | RangeError on overflow/underflow |
| `/` | INTEGER, INTEGER | REAL | RuntimeError on divide by zero |
| `/` | REAL, REAL | REAL | RuntimeError on divide by zero; RangeError on overflow/underflow |
| `DIV MOD` | INTEGER, INTEGER | INTEGER | RuntimeError on divide by zero |
| `AND OR NOT` | BOOLEAN | BOOLEAN | TypeError if non-BOOLEAN |
| `&` | STRING/CHAR | STRING | TypeError if non-STRING/CHAR |
| Comparisons | INTEGER/REAL/CHAR/STRING/DATE/ENUM | BOOLEAN | TypeError if incompatible types |
| `IN` | ENUM, SET OF ENUM | BOOLEAN | TypeError if base types differ |
| `UNION INTERSECT DIFF` | SET OF ENUM, SET OF ENUM | SET OF ENUM | TypeError if base types differ |
| `@` | lvalue | POINTER TO type | TypeError if not lvalue |
| `^` | POINTER TO type | type | RuntimeError on NULL |

### Numeric overflow and underflow
- INTEGER operations that exceed range raise `RangeError`.
- REAL operations that overflow or underflow raise `RangeError`.
- Intermediate results are checked at each operator application.

### Precedence (highest to lowest)
1. Parentheses `(...)`
2. Unary `+`, unary `-`, `NOT`, `@`, `^`
3. `*`, `/`, `DIV`, `MOD`
4. `+`, `-`
5. `&`
6. `UNION`, `INTERSECT`, `DIFF`
7. Comparisons `= <> < <= > >=` and `IN`
8. `AND`
9. `OR`

### Evaluation order
- Left‑to‑right within the same precedence level.
- All operands are evaluated before any operator is applied.
- Operator operands must be type‑compatible; no implicit conversions are performed.

### Evaluation and side effects
- Function arguments are evaluated left-to-right before the call.
- Array index expressions are evaluated left-to-right before access.
- Field access evaluates the base expression before selecting the field.

Example (evaluation order):
```lucid
X <- F(A(), B()) + C(D(), E())
```
Order: `A()`, `B()`, `F(...)`, `D()`, `E()`, `C(...)`, then `+`.

---

