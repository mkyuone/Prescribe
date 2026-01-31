# Architecture

Prescribe is organized as a modular C# solution with a core library and host applications.

## Solution layout

```
Prescribe.sln
csharp/
  Prescribe.Core/   # language pipeline + runtime
  Prescribe.Cli/    # command-line host
  Prescribe.Web/    # standalone Blazor WebAssembly host
```

## Core pipeline

1. Source loading (`Source/Prsd.cs`)
2. Front-end: lexing/parsing (`Frontend/`)
3. Semantics: const eval + type checking (`Semantics/`)
4. Runtime: interpreter + stdlib + store (`Runtime/`)
5. Diagnostics: typed errors with source line numbers (`Diagnostics/`)

## Hosting

- CLI reads `.prsd` files, runs the pipeline, and prints output.
- WebAssembly host is currently minimal and will integrate a browser-safe file system.

## Blazor readiness

File I/O is abstracted via `Runtime/IFileSystem` so browser hosts can provide in-memory or virtual files.
