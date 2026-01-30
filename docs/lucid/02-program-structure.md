## 2. Program Structure

A Lucid program has exactly one entry point and must follow this structure:

```lucid
PROGRAM <Identifier>
    <declarations>
    <statements>
ENDPROGRAM
```

**Execution entry rules**
- Execution begins at the first executable statement in the program body.
- Declarations must appear before executable statements.
- The program ends when `ENDPROGRAM` is reached or a runtime error occurs.
- Indentation is not syntactically significant but is strongly recommended.

**Terminology**
- A **block** is a sequence of zero or more declarations followed by zero or more statements.
- A **statement** is any executable construct defined in the grammar.
- A **body** is the block associated with a control structure, procedure, function, or class member.

---

