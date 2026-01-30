## 4. Type System (STATIC)

Lucid is statically typed. Every variable has a declared type. There are **no implicit type conversions**.

| Type | Definition and runtime behavior |
|------|---------------------------------|
| INTEGER | Signed 32‑bit: `-2,147,483,648` to `2,147,483,647`. Overflow raises `RangeError`. |
| REAL | IEEE‑754 binary64 required. Overflow/underflow raises `RangeError`. NaN is not permitted; operations producing NaN raise `RuntimeError`. |
| BOOLEAN | Values `TRUE` and `FALSE`. |
| CHAR | A single Unicode scalar value; literals are ASCII by default. |
| STRING | Sequence of CHAR. Source is ASCII; escapes may produce any Unicode scalar value. |
| DATE | Calendar date in proleptic Gregorian calendar. Literal format `YYYY-MM-DD`. Comparisons are chronological. |
| ARRAY | Fixed‑size, bounds‑checked, declared with explicit inclusive ranges. |
| RECORD | Named collection of fields with fixed types. Stored by value. |
| ENUM | Named enumeration with ordinal values starting at 0 in declaration order. |
| SET | Unordered collection of unique enum values. |
| POINTER | Typed reference to a single allocated value or `NULL`. |
| CLASS | Reference type with fields and methods; supports single inheritance. |
| TEXTFILE | Handle to a text file stream. Only valid for file operations. |
| RANDOMFILE | Handle to a random-access file of fixed-size records. |

Additional type rules:
- STRING stores a sequence of Unicode scalar values; all string operations are defined by code point order.
- DATE values must be within `0001-01-01` to `9999-12-31`, inclusive.
- ARRAY indices are INTEGER and bounds are inclusive.
- CLASS and POINTER values may be `NULL`.
- A year is a leap year if it is divisible by 4, except years divisible by 100 are not leap years unless also divisible by 400.

---

