## 5. Variables and Constants

### Variable declarations
Syntax:
```lucid
DECLARE <Identifier> : <Type>
```

Example:
```lucid
DECLARE Counter : INTEGER
DECLARE Name : STRING
```

### Constants
Syntax:
```lucid
CONSTANT <Identifier> = <Expression>
```
- The expression must be a compile‑time constant.
  - Allowed: literals, other constants, and operators over those values.

Example:
```lucid
CONSTANT MaxSize = 100
```

### Scope rules
- Variables and constants are scoped to the block in which they are declared.
- Blocks are introduced by `PROGRAM`, `IF`, `CASE`, `FOR`, `WHILE`, `REPEAT`, `PROCEDURE`, `FUNCTION`, and `CLASS` bodies.

### Lifetime
- Local variables exist from entry to exit of their block.
- Global variables exist for the duration of program execution.

### Default values
- INTEGER: `0`
- REAL: `0.0`
- BOOLEAN: `FALSE`
- CHAR: `'\x00'`
- STRING: `""`
- DATE: `DATE "0001-01-01"`
- ARRAY: all elements default‑initialized
- RECORD: all fields default‑initialized
- ENUM: first declared value
- SET: empty set
- POINTER/CLASS: `NULL`

### Mutability rules
- Variables are mutable.
- Constants are immutable after declaration.

---

