## 19. Implementation Notes

**Lexer**
- Tokenize keywords, identifiers, literals, operators, and delimiters.
- Keywords are case‑insensitive; identifiers preserve case.

**Parser**
- Use a recursive‑descent or LALR parser based on the EBNF.
- Produce an AST with explicit nodes for each statement and expression kind.

**AST**
- Nodes should include source line numbers for error reporting.
- Type annotations should be attached after semantic analysis.

**Interpreter model**
- Evaluate expressions left‑to‑right.
- Maintain a call stack of frames and a heap for references.
- Enforce type checking before execution.

**Testing strategy**
- Unit tests for lexer and parser (token boundaries, precedence).
- Type‑checker tests (valid/invalid assignments and calls).
- Runtime tests for each error category.

---

