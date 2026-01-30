## 8. Input & Output

### INPUT
Syntax:
```lucid
INPUT <variable1>, <variable2>, ...
```

Runtime behavior:
- Input is read from standard input as a stream of **whitespace‑delimited tokens**.
- Each variable is assigned from the next token, parsed according to its type.
- Parsing rules:
  - INTEGER: decimal integer.
  - REAL: decimal or exponent form.
  - BOOLEAN: `TRUE` or `FALSE` (case‑insensitive).
  - CHAR: token length must be 1; otherwise `TypeError`.
  - STRING: token as‑is (whitespace ends the token).
  - DATE: token `YYYY-MM-DD`, must be a valid Gregorian date or `RangeError`.
- If a token cannot be parsed for the target type, raise `TypeError`.
- If no token is available, raise `RuntimeError`.
- Integer and real parsing must reject tokens with trailing non-numeric characters.

### OUTPUT
Syntax:
```lucid
OUTPUT <expression1>, <expression2>, ...
```

Runtime behavior:
- Each expression is converted to string and concatenated with **no separators**.
- A newline is appended after the concatenated result.

Conversion rules:
- INTEGER: decimal representation.
- REAL: fixed‑point with up to 6 digits after the decimal point, rounded half away from zero; trailing zeros are removed, and the decimal point is removed if no fractional digits remain.
- BOOLEAN: `TRUE` or `FALSE`.
- CHAR: the character itself.
- STRING: the contents.
- DATE: `YYYY-MM-DD`.
- ARRAY/RECORD/SET/POINTER/CLASS: not directly outputtable; `TypeError`.
- OUTPUT of a REAL that is NaN or infinity raises `RuntimeError`.

---

