# Prescribe
Executable pseudocode for learning algorithms.
> [!NOTE]
> Work in progress.  
> Built with help from ChatGPT Codex.


Source files must use the `.prsd` format (see `docs/prescribe/03-lexical-rules.md`).

The C# implementation in `csharp/` is the current reference interpreter.

## Operations

### Prerequisites
- .NET 8 SDK

### Build
```bash
dotnet build Prescribe.sln
```

### Run (CLI)
```bash
dotnet run --project csharp/Prescribe.Cli -- <file.prsd>
```

Input is read from stdin as whitespace-delimited tokens. Output is written to stdout.

### Example
```bash
cat <<'EOF' > /tmp/hello.prsd
PRSD 1.0
## Hello
:::prescribe
PROGRAM Hello
    OUTPUT "Hello, " & "PRSD!"
ENDPROGRAM
:::
EOF

dotnet run --project csharp/Prescribe.Cli -- /tmp/hello.prsd
```

### Notes
- Only `.prsd` files are supported by the CLI.
- Code blocks must be fenced with `:::prescribe` / `:::` inside the `.prsd` file.
