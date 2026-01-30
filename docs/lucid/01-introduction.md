## 1. Introduction

**Tagline:** *Lucid is Cambridge-style pseudocode that actually runs.*

Lucid is a small, deterministic, statically typed programming language designed for teaching algorithms. Its syntax and layout follow the Cambridge A Level pseudocode conventions, but every rule is specified precisely so programs can be executed by an interpreter or compiler.

**Who it is for**
- **Students** learning algorithms who need a readable, exam‑style language.
- **Teachers** who want executable pseudocode that matches classroom notation.
- **Interpreter implementers** who need a complete, unambiguous specification.

**How Lucid differs from Python**
- Static typing with explicit declarations; no dynamic type changes.
- No implicit type conversions.
- Deterministic input parsing and output formatting rules.
- Explicit program entry point (`PROGRAM ... ENDPROGRAM`).

**How Lucid differs from informal pseudocode**
- Every construct has defined syntax and semantics.
- Precise type system and runtime errors.
- Formal grammar suitable for a parser.

**Design philosophy**
- Clarity over cleverness  
- Structured over implicit  
- Deterministic behavior  
- Beginner-readable  
- Exam-style familiarity  
- No hidden magic  
- No implicit type conversions  
- Teaching-focused error messages  

**Complete example program**
```lucid
PROGRAM AverageScores
    DECLARE Count : INTEGER
    DECLARE Sum : INTEGER
    DECLARE Score : INTEGER
    DECLARE Avg : REAL

    Sum <- 0
    INPUT Count

    FOR i <- 1 TO Count
        INPUT Score
        Sum <- Sum + Score
    NEXT i

    Avg <- REAL(Sum) / REAL(Count)
    OUTPUT "Average = " & STRING(Avg)
ENDPROGRAM
```

---

