## 16. Runtime Model

- Execution is single‑threaded and deterministic.
- Each call creates a stack frame containing locals and parameters.
- Variables are stored by value except for POINTER and CLASS references.
- `BYREF` parameters share storage with the caller’s variable.
- Arrays and records are stored inline within their variable storage.
- Pointers and class references refer to heap‑allocated storage.
- Heap memory is reclaimed automatically at program end; there is no manual deallocation.

---

