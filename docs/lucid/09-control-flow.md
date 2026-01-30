## 9. Control Flow

### IF / ELSE / ENDIF
```lucid
IF <condition> THEN
    <statements>
ELSE
    <statements>
ENDIF
```
- `<condition>` must be BOOLEAN.
- `ELSE` is optional.

### CASE / ENDCASE
```lucid
CASE OF <expression>
    <value-list> : <statements>
    <value-range> : <statements>
    OTHERWISE : <statements>
ENDCASE
```
- Expression is evaluated once.
- `<value-list>` is comma‑separated literals of the same type.
- `<value-range>` is `low TO high`, inclusive.
- `OTHERWISE` is optional and must be last.
- First matching branch executes; no fall‑through.
- The expression type must be INTEGER, CHAR, ENUM, or DATE.
- A value may not appear in more than one branch; otherwise `SyntaxError`.

### FOR / NEXT
```lucid
FOR <identifier> <- <start> TO <end> [STEP <step>]
    <statements>
NEXT <identifier>
```
- `start`, `end`, `step` evaluated once at loop entry.
- `step` default is `1`.
- `step = 0` raises `RuntimeError`.
- Loop executes zero times if `start` is already past `end` in the step direction.
- Loop variable is read‑only in the loop body; assigning to it raises `AccessError`.
- The loop variable, `start`, `end`, and `step` must be INTEGER.

### WHILE
```lucid
WHILE <condition> DO
    <statements>
ENDWHILE
```
- Condition tested before each iteration.
- `<condition>` must be BOOLEAN.

### REPEAT UNTIL
```lucid
REPEAT
    <statements>
UNTIL <condition>
```
- Condition tested after the block; the body executes at least once.
- `<condition>` must be BOOLEAN.

---

