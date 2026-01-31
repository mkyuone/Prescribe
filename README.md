# Prescribe
Executable pseudocode for learning algorithms.
> [!NOTE]
> Work in progress.  
> Built with help from ChatGPT Codex.


Source files must use the `.prsd` format (see `docs/prescribe/03-lexical-rules.md`).

The C# implementation in `csharp/` is the current reference interpreter.

Architecture overview: `docs/architecture.md`.

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

### WebAssembly (Blazor, standalone)
```bash
dotnet build csharp/Prescribe.Web
dotnet run --project csharp/Prescribe.Web
```

The WebAssembly host is intentionally minimal (no UI yet).

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
