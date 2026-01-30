## 10. Arrays

### Syntax
```lucid
DECLARE A : ARRAY[1:10] OF INTEGER
DECLARE M : ARRAY[1:3, 1:4] OF REAL
```

### Rules
- Bounds are inclusive and fixed at declaration.
- Index expressions are evaluated left‑to‑right.
- Out‑of‑range access raises `RangeError`.
- Arrays are fixed‑size; no resizing.
- Array assignment copies all elements; POINTER and CLASS elements copy references.
- Index expressions must be INTEGER.

---

