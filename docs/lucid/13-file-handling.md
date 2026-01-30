## 13. File Handling

### Text files

**Open/close**
```lucid
DECLARE F : TEXTFILE
OPENFILE(F, "path.txt", "READ")
OPENFILE(F, "path.txt", "WRITE")
OPENFILE(F, "path.txt", "APPEND")
CLOSEFILE(F)
```

**Read/write**
```lucid
READFILE(F, X)
WRITEFILE(F, X)
EOF(F)
```

Runtime behavior:
- File variables must be declared as `TEXTFILE` or `RANDOMFILE OF <RecordType>`.
- Text files are line‑oriented.
- `READFILE` reads the next line and parses into `X` using the same rules as `INPUT` (leading/trailing whitespace trimmed).
- `WRITEFILE` writes the string representation of `X` followed by newline.
- `EOF(F)` returns TRUE if the file is at end‑of‑file.
- File errors raise `FileError`.
- Mode strings for `OPENFILE` are `"READ"`, `"WRITE"`, `"APPEND"`, and `"RANDOM"` (case‑insensitive).
- `"WRITE"` truncates existing files or creates a new file; `"APPEND"` creates a new file if missing and positions at the end.
- `READFILE` is valid only for files opened in `"READ"`; `WRITEFILE` only for `"WRITE"`/`"APPEND"`.

### Random files

**Open**
```lucid
DECLARE RF : RANDOMFILE OF StudentRecord
OPENFILE(RF, "data.dat", "RANDOM")
```

**Access**
```lucid
SEEK(F, address)
GETRECORD(F, R)
PUTRECORD(F, R)
```

Runtime behavior:
- Random files store fixed‑size records of a single RECORD type.
- `address` is a 1‑based record index.
- `SEEK` positions the file at the record address.
- `GETRECORD` reads the record into `R`.
- `PUTRECORD` writes `R` at the current position.
- Records cannot contain STRING or SET fields; otherwise `TypeError`.
- Random file operations are valid only when the file is opened in `"RANDOM"` mode.

---

