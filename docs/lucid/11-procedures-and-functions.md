## 11. Procedures and Functions

### Procedure vs Function
- **PROCEDURE** does not return a value.
- **FUNCTION** returns a value of a declared type.

### Procedure syntax
```lucid
PROCEDURE Name(<params>)
    <declarations>
    <statements>
ENDPROCEDURE
```

### Function syntax
```lucid
FUNCTION Name(<params>) RETURNS <Type>
    <declarations>
    <statements>
    RETURN <expression>
ENDFUNCTION
```

### CALL statement
```lucid
CALL Name(<arguments>)
```
- `CALL` is only valid for procedures. Using `CALL` on a function raises `TypeError`.
- All argument expressions are evaluated left‑to‑right before the call.

### Parameter modes
- `BYVAL` (copy in) and `BYREF` (reference).
- Default is `BYVAL`.
- Example:
```lucid
PROCEDURE Swap(BYREF X : INTEGER, BYREF Y : INTEGER)
```
- `BYREF` arguments must be lvalues; otherwise `TypeError`.

### Scope of parameters
- Parameters are local to the procedure/function body.

### Stack frame model
- Each call creates a new frame with its own locals and parameters.
- `BYREF` parameters are aliases to the caller’s variables.

### RETURN behavior
- `RETURN <expression>` exits a function with a value.
- `RETURN` in a procedure exits early.
- Reaching `ENDFUNCTION` without a `RETURN <expression>` raises `RuntimeError`.

---

