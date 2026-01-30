## 7. Expressions (VERY DETAILED)

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

### Precedence (highest to lowest)
1. Parentheses `(...)`
2. Unary `+`, unary `-`, `NOT`
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

---

