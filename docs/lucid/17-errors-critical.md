## 17. Errors (CRITICAL)

Errors stop execution immediately and report a line number.

**Categories**
- `SyntaxError`: invalid token or grammar.
- `NameError`: undeclared identifier.
- `TypeError`: type mismatch or invalid operation.
- `RangeError`: bounds or overflow violation.
- `RuntimeError`: invalid runtime action (e.g., divide by zero, null dereference).
- `FileError`: file open/read/write problems.
- `AccessError`: access violation (e.g., assigning to loop variable, private member access).

**Error message format**
```
<ErrorType> at line <lineNumber>: <message>
```

---

