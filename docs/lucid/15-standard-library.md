## 15. Standard Library

All library functions are total (must either return a value or raise an error).

| Function | Description | Errors |
|----------|-------------|--------|
| LENGTH(s) | Length of STRING `s`. | TypeError if not STRING. |
| RIGHT(s, n) | Rightmost `n` chars of `s`. | RangeError if `n < 0` or `n > LENGTH(s)`. |
| MID(s, start, n) | Substring from position `start` (1‑based), length `n`. | RangeError if invalid bounds. |
| LCASE(s) | Lowercase string. | TypeError if not STRING. |
| UCASE(s) | Uppercase string. | TypeError if not STRING. |
| INT(x) | Convert REAL to INTEGER by truncation toward 0. | TypeError if not REAL. |
| REAL(x) | Convert INTEGER to REAL. | TypeError if not INTEGER. |
| STRING(x) | Convert value to STRING using OUTPUT conversion rules. | TypeError for ARRAY/RECORD/SET/POINTER/CLASS. |
| CHAR(x) | Convert INTEGER 0..127 to CHAR. | RangeError if out of range. |
| BOOLEAN(x) | Convert STRING "TRUE"/"FALSE" to BOOLEAN. | TypeError if invalid token. |
| DATE(s) | Convert STRING "YYYY-MM-DD" to DATE. | TypeError if invalid format; RangeError if invalid date. |
| RAND() | Returns REAL in range `[0.0, 1.0)` using a deterministic PRNG. | None. |

Deterministic PRNG definition:
- State is a 32-bit INTEGER `seed`.
- Initial `seed` is `1` at program start.
- On each call: `seed = (1103515245 * seed + 12345) MOD 2^31`.
- Result is `REAL(seed) / REAL(2^31)`.

String case rules:
- `LCASE` and `UCASE` affect only ASCII letters `A-Z` and `a-z`.
- All other characters are unchanged.

String indexing rules:
- Positions are 1-based for `RIGHT` and `MID`.
- If `n = 0`, `RIGHT` and `MID` return the empty string.

---

