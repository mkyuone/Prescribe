## 12. User‑Defined Types

### Enumerated types
```lucid
TYPE Season = (Spring, Summer, Autumn, Winter)
```
- Ordinals start at 0 in declaration order.
- `ORD(value)` returns the ordinal integer.
- `ENUMVALUE(TypeName, ordinal)` returns the enum value or raises `RangeError`.

### Records
```lucid
TYPE StudentRecord = RECORD
    LastName : STRING
    FirstName : STRING
    DateOfBirth : DATE
    YearGroup : INTEGER
    FormGroup : CHAR
ENDRECORD
```
- Field access: `Student.LastName`.
- Records are copied by value on assignment; POINTER and CLASS fields copy references.

### Sets
```lucid
TYPE Day = (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
TYPE DaySet = SET OF Day
```
- Sets contain unique enum values.
- Membership: `<enumValue> IN <set>` returns BOOLEAN.
- Operations: `UNION`, `INTERSECT`, `DIFF`.
- `SIZE(set)` returns INTEGER.
- All set operations require operands of the same base enum type.

### Pointers
```lucid
TYPE TIntPointer = POINTER TO INTEGER
DECLARE P : TIntPointer
P <- NULL
P <- NEW INTEGER
^P <- 42
```
- `@x` gives the address of variable `x`.
- `^p` dereferences pointer `p`.
- `NULL` represents no address.
- `NEW <Type>` allocates a default-initialized value on the heap and returns a pointer to it.
- `@` requires an lvalue operand; otherwise `TypeError`.
- Dereferencing `NULL` raises `RuntimeError`.

---

