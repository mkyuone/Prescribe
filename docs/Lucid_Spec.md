# Lucid: Executable Pseudocode for Learning Algorithms

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

## 3. Lexical Rules

### Case sensitivity
- **Keywords** are case‑insensitive (`IF`, `if`, `If` are equivalent).
- **Identifiers** are case‑sensitive (`Total` and `total` are distinct).
- An identifier cannot match a keyword in any casing.

### Whitespace
- Whitespace separates tokens and is otherwise ignored.
- Newlines do not affect semantics, except to end comments.

### Source encoding
- Source files are ASCII.
- The only non-ASCII character permitted in source code is the assignment arrow `←`.
- Non-ASCII characters may appear in runtime strings only via escape sequences.

### Comments
- Single‑line comments start with `//` and run to the end of the line.

### Identifiers
- Start with a letter `[A-Za-z]`.
- Followed by letters, digits, or `_`.
- Maximum length: 64 characters.

### Literal formats

**INTEGER**
- Decimal digits with optional leading `-`.
- Example: `0`, `-42`, `1001`.

**REAL**
- Decimal with a fractional part or exponent.
- Formats: `123.45`, `0.5`, `6.02E23`, `-1.0e-3`.

**BOOLEAN**
- `TRUE` or `FALSE` (case‑insensitive).

**CHAR**
- Single character in single quotes, with escapes.
- Example: `'A'`, `'\n'`, `'\x41'`.
- After escape processing, the literal must be exactly one character or `SyntaxError`.

**STRING**
- Double quotes with escape sequences.
- Example: `"hello"`, `"line\n"`.
- Supported escapes: `\n`, `\r`, `\t`, `\\`, `\"`, `\'`, `\xNN` (hex byte).

**Escape sequence rules**
- Escapes are interpreted in both CHAR and STRING literals.
- Invalid escape sequences raise `SyntaxError`.
- `\xNN` must use exactly two hexadecimal digits.

**DATE**
- Date literal: `DATE "YYYY-MM-DD"`.
- Example: `DATE "2026-01-30"`.
- The literal must represent a valid Gregorian calendar date; otherwise `SyntaxError`.

---

## 4. Type System (STATIC)

Lucid is statically typed. Every variable has a declared type. There are **no implicit type conversions**.

| Type | Definition and runtime behavior |
|------|---------------------------------|
| INTEGER | Signed 32‑bit: `-2,147,483,648` to `2,147,483,647`. Overflow raises `RangeError`. |
| REAL | IEEE‑754 binary64 required. Overflow/underflow raises `RangeError`. NaN is not permitted; operations producing NaN raise `RuntimeError`. |
| BOOLEAN | Values `TRUE` and `FALSE`. |
| CHAR | A single Unicode scalar value; literals are ASCII by default. |
| STRING | Sequence of CHAR. Source is ASCII; escapes may produce any Unicode scalar value. |
| DATE | Calendar date in proleptic Gregorian calendar. Literal format `YYYY-MM-DD`. Comparisons are chronological. |
| ARRAY | Fixed‑size, bounds‑checked, declared with explicit inclusive ranges. |
| RECORD | Named collection of fields with fixed types. Stored by value. |
| ENUM | Named enumeration with ordinal values starting at 0 in declaration order. |
| SET | Unordered collection of unique enum values. |
| POINTER | Typed reference to a single allocated value or `NULL`. |
| CLASS | Reference type with fields and methods; supports single inheritance. |
| TEXTFILE | Handle to a text file stream. Only valid for file operations. |
| RANDOMFILE | Handle to a random-access file of fixed-size records. |

Additional type rules:
- STRING stores a sequence of Unicode scalar values; all string operations are defined by code point order.
- DATE values must be within `0001-01-01` to `9999-12-31`, inclusive.
- ARRAY indices are INTEGER and bounds are inclusive.
- CLASS and POINTER values may be `NULL`.
- A year is a leap year if it is divisible by 4, except years divisible by 100 are not leap years unless also divisible by 400.

---

## 5. Variables and Constants

### Variable declarations
Syntax:
```lucid
DECLARE <Identifier> : <Type>
```

Example:
```lucid
DECLARE Counter : INTEGER
DECLARE Name : STRING
```

### Constants
Syntax:
```lucid
CONSTANT <Identifier> = <Expression>
```
- The expression must be a compile‑time constant.
  - Allowed: literals, other constants, and operators over those values.

Example:
```lucid
CONSTANT MaxSize = 100
```

### Scope rules
- Variables and constants are scoped to the block in which they are declared.
- Blocks are introduced by `PROGRAM`, `IF`, `CASE`, `FOR`, `WHILE`, `REPEAT`, `PROCEDURE`, `FUNCTION`, and `CLASS` bodies.

### Lifetime
- Local variables exist from entry to exit of their block.
- Global variables exist for the duration of program execution.

### Default values
- INTEGER: `0`
- REAL: `0.0`
- BOOLEAN: `FALSE`
- CHAR: `'\x00'`
- STRING: `""`
- DATE: `DATE "0001-01-01"`
- ARRAY: all elements default‑initialized
- RECORD: all fields default‑initialized
- ENUM: first declared value
- SET: empty set
- POINTER/CLASS: `NULL`

### Mutability rules
- Variables are mutable.
- Constants are immutable after declaration.

---

## 6. Assignment

Assignment uses `<-` (ASCII) or `←` (Unicode). Both are equivalent.

Syntax:
```lucid
<lvalue> <- <expression>
```

Valid lvalues:
- Variable
- Array element
- Record field
- Dereferenced pointer

Type matching rules:
- The expression type must exactly match the lvalue type.
- No implicit conversions.

---

## 7. Expressions

### Operators

**Arithmetic**
- `+`, `-`, `*`, `/` on INTEGER or REAL.
- `/` always produces REAL.
- Unary `+`, `-` supported for numeric types.
- Both operands must have the same numeric type; use explicit conversion functions to mix INTEGER and REAL.

**DIV and MOD (Euclidean)**
- `a DIV b` returns integer quotient, `a MOD b` returns remainder.
- `b = 0` raises `RuntimeError`.
- Euclidean rules: remainder `r` satisfies `0 <= r < |b|` and `a = b*q + r`.
- Operands must be INTEGER.

**Comparisons**
- `=`, `<>`, `<`, `<=`, `>`, `>=` for compatible types.
- INTEGER and REAL compare within their own type only (no implicit widening).
- CHAR and STRING compare lexicographically by Unicode code point.
- DATE compares by chronological order.
- ENUM compares by ordinal.
- BOOLEAN supports only `=` and `<>`.
- ARRAY, RECORD, SET, POINTER, CLASS, TEXTFILE, and RANDOMFILE are not comparable.

**Boolean**
- `AND`, `OR`, `NOT`.
- Short‑circuit evaluation is **not** used; all operands are evaluated left‑to‑right.

**String concatenation**
- `&` concatenates STRING and/or CHAR.

**Set operators**
- `IN` tests membership: `<enumValue> IN <set>` returns BOOLEAN.
- `UNION`, `INTERSECT`, `DIFF` operate on sets of the same enum base type.
- The result type is the same set type as the operands.

**Pointer operators**
- `@` (address-of) returns a pointer to an lvalue.
- `^` (dereference) returns the value pointed to by a pointer.

### Operator type compatibility matrix

| Operator(s) | Operand types | Result type | Errors |
|-------------|--------------|-------------|--------|
| `+ - *` | INTEGER, INTEGER | INTEGER | RangeError on overflow |
| `+ - *` | REAL, REAL | REAL | RangeError on overflow/underflow |
| `/` | INTEGER, INTEGER | REAL | RuntimeError on divide by zero |
| `/` | REAL, REAL | REAL | RuntimeError on divide by zero; RangeError on overflow/underflow |
| `DIV MOD` | INTEGER, INTEGER | INTEGER | RuntimeError on divide by zero |
| `AND OR NOT` | BOOLEAN | BOOLEAN | TypeError if non-BOOLEAN |
| `&` | STRING/CHAR | STRING | TypeError if non-STRING/CHAR |
| Comparisons | INTEGER/REAL/CHAR/STRING/DATE/ENUM | BOOLEAN | TypeError if incompatible types |
| `IN` | ENUM, SET OF ENUM | BOOLEAN | TypeError if base types differ |
| `UNION INTERSECT DIFF` | SET OF ENUM, SET OF ENUM | SET OF ENUM | TypeError if base types differ |
| `@` | lvalue | POINTER TO type | TypeError if not lvalue |
| `^` | POINTER TO type | type | RuntimeError on NULL |

### Numeric overflow and underflow
- INTEGER operations that exceed range raise `RangeError`.
- REAL operations that overflow or underflow raise `RangeError`.
- Intermediate results are checked at each operator application.

### Precedence (highest to lowest)
1. Parentheses `(...)`
2. Unary `+`, unary `-`, `NOT`, `@`, `^`
3. `*`, `/`, `DIV`, `MOD`
4. `+`, `-`
5. `&`
6. `UNION`, `INTERSECT`, `DIFF`
7. Comparisons `= <> < <= > >=` and `IN`
8. `AND`
9. `OR`

### Evaluation order
- Left‑to‑right within the same precedence level.
- All operands are evaluated before any operator is applied.
- Operator operands must be type‑compatible; no implicit conversions are performed.

### Evaluation and side effects
- Function arguments are evaluated left-to-right before the call.
- Array index expressions are evaluated left-to-right before access.
- Field access evaluates the base expression before selecting the field.

Example (evaluation order):
```lucid
X <- F(A(), B()) + C(D(), E())
```
Order: `A()`, `B()`, `F(...)`, `D()`, `E()`, `C(...)`, then `+`.

---

## 8. Input & Output

### INPUT
Syntax:
```lucid
INPUT <variable1>, <variable2>, ...
```

Runtime behavior:
- Input is read from standard input as a stream of **whitespace‑delimited tokens**.
- Each variable is assigned from the next token, parsed according to its type.
- Parsing rules:
  - INTEGER: decimal integer.
  - REAL: decimal or exponent form.
  - BOOLEAN: `TRUE` or `FALSE` (case‑insensitive).
  - CHAR: token length must be 1; otherwise `TypeError`.
  - STRING: token as‑is (whitespace ends the token).
  - DATE: token `YYYY-MM-DD`, must be a valid Gregorian date or `RangeError`.
- If a token cannot be parsed for the target type, raise `TypeError`.
- If no token is available, raise `RuntimeError`.
- Integer and real parsing must reject tokens with trailing non-numeric characters.

### OUTPUT
Syntax:
```lucid
OUTPUT <expression1>, <expression2>, ...
```

Runtime behavior:
- Each expression is converted to string and concatenated with **no separators**.
- A newline is appended after the concatenated result.

Conversion rules:
- INTEGER: decimal representation.
- REAL: fixed‑point with up to 6 digits after the decimal point, rounded half away from zero; trailing zeros are removed, and the decimal point is removed if no fractional digits remain.
- BOOLEAN: `TRUE` or `FALSE`.
- CHAR: the character itself.
- STRING: the contents.
- DATE: `YYYY-MM-DD`.
- ARRAY/RECORD/SET/POINTER/CLASS: not directly outputtable; `TypeError`.
- OUTPUT of a REAL that is NaN or infinity raises `RuntimeError`.

---

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

## 10. Arrays

### Syntax
```lucid
DECLARE A : ARRAY[1:10] OF INTEGER
DECLARE M : ARRAY[1:3, 1:4] OF REAL
```

### Rules
- Bounds are inclusive and fixed at declaration.
- Index expressions are evaluated left‑to‑right.
- Out‑of‑range access raises `RangeError`.
- Arrays are fixed‑size; no resizing.
- Array assignment copies all elements; POINTER and CLASS elements copy references.
- Index expressions must be INTEGER.

---

## 11. Procedures and Functions

### Procedure vs Function
- **PROCEDURE** does not return a value.
- **FUNCTION** returns a value of a declared type.

### Procedure syntax
```lucid
PROCEDURE Name(<params>)
    <declarations>
    <statements>
ENDPROCEDURE
```

### Function syntax
```lucid
FUNCTION Name(<params>) RETURNS <Type>
    <declarations>
    <statements>
    RETURN <expression>
ENDFUNCTION
```

### CALL statement
```lucid
CALL Name(<arguments>)
```
- `CALL` is only valid for procedures. Using `CALL` on a function raises `TypeError`.
- All argument expressions are evaluated left‑to‑right before the call.
- For methods, use a dotted name: `CALL Obj.Method(...)`.

### Parameter modes
- `BYVAL` (copy in) and `BYREF` (reference).
- Default is `BYVAL`.
- Example:
```lucid
PROCEDURE Swap(BYREF X : INTEGER, BYREF Y : INTEGER)
```
- `BYREF` arguments must be lvalues; otherwise `TypeError`.

### Scope of parameters
- Parameters are local to the procedure/function body.

### Stack frame model
- Each call creates a new frame with its own locals and parameters.
- `BYREF` parameters are aliases to the caller’s variables.

### RETURN behavior
- `RETURN <expression>` exits a function with a value.
- `RETURN` in a procedure exits early.
- Reaching `ENDFUNCTION` without a `RETURN <expression>` raises `RuntimeError`.

---

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

File error cases:
- Opening a file with an invalid mode string raises `FileError`.
- Reading/writing on a file not opened in a compatible mode raises `FileError`.
- Using `READFILE`, `WRITEFILE`, or `EOF` on a closed file raises `FileError`.

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
- `SEEK` with `address < 1` raises `RangeError`.

---

## 14. OOP System

### Class syntax
```lucid
CLASS Person
    PRIVATE
        Name : STRING
    PUBLIC
        CONSTRUCTOR Person(NewName : STRING)
            Name <- NewName
        ENDCONSTRUCTOR

        PROCEDURE SetName(NewName : STRING)
            Name <- NewName
        ENDPROCEDURE

        FUNCTION GetName() RETURNS STRING
            RETURN Name
        ENDFUNCTION
ENDCLASS
```

### Instantiation
```lucid
DECLARE P : Person
P <- NEW Person("Ada")
```

### Rules
- Classes are reference types; assignment copies references.
- Method calls use dot notation: `P.SetName("Grace")`.
- Fields and methods have `PUBLIC` or `PRIVATE` access.
- Single inheritance with `CLASS Child EXTENDS Parent`.
- `SUPER(...)` calls the parent constructor from a child constructor.
- `SUPER.Method(...)` invokes the parent method.
- If a class defines no constructor, a default zero-parameter constructor is provided.
- Method dispatch is dynamic based on the runtime class of the object.
- `PRIVATE` members are accessible only within the declaring class.
- `NEW ClassName(...)` allocates an object, default-initializes fields, then runs the constructor body.

---

## 15. Standard Library

All library functions are total (must either return a value or raise an error).

| Function | Description | Errors |
|----------|-------------|--------|
| LENGTH(s) | Length of STRING `s`. | TypeError if not STRING. |
| RIGHT(s, n) | Rightmost `n` chars of `s`. | RangeError if `n < 0` or `n > LENGTH(s)`. |
| MID(s, start, n) | Substring from position `start` (1‑based), length `n`. | RangeError if invalid bounds. |
| LCASE(s) | Lowercase string. | TypeError if not STRING. |
| UCASE(s) | Uppercase string. | TypeError if not STRING. |
| INT(x) | Convert REAL to INTEGER by truncation toward 0. | TypeError if not REAL. |
| REAL(x) | Convert INTEGER to REAL. | TypeError if not INTEGER. |
| STRING(x) | Convert value to STRING using OUTPUT conversion rules. | TypeError for ARRAY/RECORD/SET/POINTER/CLASS. |
| CHAR(x) | Convert INTEGER 0..127 to CHAR. | RangeError if out of range. |
| BOOLEAN(x) | Convert STRING "TRUE"/"FALSE" to BOOLEAN. | TypeError if invalid token. |
| DATE(s) | Convert STRING "YYYY-MM-DD" to DATE. | TypeError if invalid format; RangeError if invalid date. |
| RAND() | Returns REAL in range `[0.0, 1.0)` using a deterministic PRNG. | None. |

Deterministic PRNG definition:
- State is a 32-bit INTEGER `seed`.
- Initial `seed` is `1` at program start.
- On each call: `seed = (1103515245 * seed + 12345) MOD 2^31`.
- Result is `REAL(seed) / REAL(2^31)`.

String case rules:
- `LCASE` and `UCASE` affect only ASCII letters `A-Z` and `a-z`.
- All other characters are unchanged.

String indexing rules:
- Positions are 1-based for `RIGHT` and `MID`.
- If `n = 0`, `RIGHT` and `MID` return the empty string.

---

## 16. Runtime Model

- Execution is single‑threaded and deterministic.
- Each call creates a stack frame containing locals and parameters.
- Variables are stored by value except for POINTER and CLASS references.
- `BYREF` parameters share storage with the caller’s variable.
- Arrays and records are stored inline within their variable storage.
- Pointers and class references refer to heap‑allocated storage.
- Heap memory is reclaimed automatically at program end; there is no manual deallocation.

---

## 17. Errors (CRITICAL)

Errors stop execution immediately and report a line number.

**Categories**
- `SyntaxError`: invalid token or grammar.
- `NameError`: undeclared identifier.
- `TypeError`: type mismatch or invalid operation.
- `RangeError`: bounds or overflow violation.
- `RuntimeError`: invalid runtime action (e.g., divide by zero, null dereference).
- `FileError`: file open/read/write problems.
- `AccessError`: access violation (e.g., assigning to loop variable, private member access).

**Error message format**
```
<ErrorType> at line <lineNumber>: <message>
```

---

## 18. Formal Grammar (EBNF)

```
program         = "PROGRAM", identifier, block, "ENDPROGRAM" ;

block           = { declaration }, { statement } ;

declaration     = var_decl | const_decl | type_decl | proc_decl | func_decl | class_decl ;

var_decl        = "DECLARE", identifier, ":", type ;
const_decl      = "CONSTANT", identifier, "=", const_expr ;

type_decl       = "TYPE", identifier, "=", type_spec ;

type_spec       = basic_type
                | array_type
                | record_type
                | enum_type
                | set_type
                | pointer_type
                | file_type ;

basic_type      = "INTEGER" | "REAL" | "BOOLEAN" | "CHAR" | "STRING" | "DATE" ;

array_type      = "ARRAY", "[", bounds, { ",", bounds }, "]", "OF", type ;

bounds          = integer_lit, ":", integer_lit ;

record_type     = "RECORD", { field_decl }, "ENDRECORD" ;
field_decl      = identifier, ":", type ;

enum_type       = "(", identifier, { ",", identifier }, ")" ;

set_type        = "SET", "OF", identifier ;

pointer_type    = "POINTER", "TO", type ;
file_type       = "TEXTFILE" | ("RANDOMFILE", "OF", identifier) ;

class_decl      = "CLASS", identifier, [ "EXTENDS", identifier ], class_body, "ENDCLASS" ;

class_body      = { access_section } ;
access_section  = ("PUBLIC" | "PRIVATE"), { class_member } ;
class_member    = var_decl | proc_decl | func_decl | constructor_decl ;

constructor_decl = "CONSTRUCTOR", identifier, "(", [ params ], ")", block, "ENDCONSTRUCTOR" ;

proc_decl       = "PROCEDURE", identifier, "(", [ params ], ")", block, "ENDPROCEDURE" ;
func_decl       = "FUNCTION", identifier, "(", [ params ], ")", "RETURNS", type, block, "ENDFUNCTION" ;

params          = param, { ",", param } ;
param           = [ "BYVAL" | "BYREF" ], identifier, ":", type ;

type            = basic_type | identifier | array_type | record_type | enum_type | set_type | pointer_type | file_type ;

statement       = assign_stmt | if_stmt | case_stmt | for_stmt | while_stmt | repeat_stmt
                | call_stmt | return_stmt | input_stmt | output_stmt | file_stmt ;

assign_stmt     = lvalue, assign_op, expr ;
assign_op       = "<-" | "←" ;

lvalue          = identifier, { ("[", expr, { ",", expr }, "]") | (".", identifier) }
                | "^", primary ;

if_stmt         = "IF", expr, "THEN", block, [ "ELSE", block ], "ENDIF" ;

case_stmt       = "CASE", "OF", expr,
                  { case_branch }, [ "OTHERWISE", ":", block ], "ENDCASE" ;

case_branch     = case_label, ":", block ;
case_label      = literal, { ",", literal } | literal, "TO", literal ;

for_stmt        = "FOR", identifier, "<-", expr, "TO", expr, [ "STEP", expr ], block, "NEXT", identifier ;

while_stmt      = "WHILE", expr, "DO", block, "ENDWHILE" ;

repeat_stmt     = "REPEAT", block, "UNTIL", expr ;

call_stmt       = "CALL", proc_ref, "(", [ arg_list ], ")" ;
proc_ref        = identifier, { ".", identifier } ;

return_stmt     = "RETURN", [ expr ] ;

input_stmt      = "INPUT", lvalue, { ",", lvalue } ;

output_stmt     = "OUTPUT", expr, { ",", expr } ;

file_stmt       = open_stmt | close_stmt | readfile_stmt | writefile_stmt | seek_stmt | getrecord_stmt | putrecord_stmt ;

open_stmt       = "OPENFILE", "(", identifier, ",", string_lit, ",", string_lit, ")" ;
close_stmt      = "CLOSEFILE", "(", identifier, ")" ;
readfile_stmt   = "READFILE", "(", identifier, ",", lvalue, ")" ;
writefile_stmt  = "WRITEFILE", "(", identifier, ",", expr, ")" ;
seek_stmt       = "SEEK", "(", identifier, ",", expr, ")" ;
getrecord_stmt  = "GETRECORD", "(", identifier, ",", lvalue, ")" ;
putrecord_stmt  = "PUTRECORD", "(", identifier, ",", expr, ")" ;

expr            = or_expr ;

or_expr         = and_expr, { "OR", and_expr } ;
and_expr        = rel_expr, { "AND", rel_expr } ;
rel_expr        = set_expr, [ rel_op, set_expr ] ;
rel_op          = "=" | "<>" | "<" | "<=" | ">" | ">=" | "IN" ;
set_expr        = concat_expr, { ("UNION" | "INTERSECT" | "DIFF"), concat_expr } ;
concat_expr     = add_expr, { "&", add_expr } ;
add_expr        = mul_expr, { ("+" | "-"), mul_expr } ;
mul_expr        = unary_expr, { ("*" | "/" | "DIV" | "MOD"), unary_expr } ;
unary_expr      = [ "+" | "-" | "NOT" | "@" | "^" ], primary ;

primary         = atom, { postfix } ;
atom            = literal
                | identifier
                | "NEW", new_type
                | "EOF", "(", identifier, ")"
                | "(", expr, ")" ;
postfix         = "(", [ arg_list ], ")"
                | "[", expr, { ",", expr }, "]"
                | ".", identifier ;

arg_list        = expr, { ",", expr } ;

new_type        = identifier, "(", [ arg_list ], ")" | type ;

literal         = integer_lit | real_lit | boolean_lit | char_lit | string_lit | date_lit ;

const_expr      = literal | identifier ;

integer_lit     = [ "-" ], digit, { digit } ;
real_lit        = [ "-" ], digit, { digit }, ( ".", digit, { digit }, [ exp ] | exp ) ;
exp             = ("E" | "e"), [ "+" | "-" ], digit, { digit } ;
boolean_lit     = "TRUE" | "FALSE" ;
char_lit        = "'", char, "'" ;
string_lit      = "\"", { char }, "\"" ;
date_lit        = "DATE", string_lit ;

digit           = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
identifier      = letter, { letter | digit | "_" } ;
letter          = "A" | ... | "Z" | "a" | ... | "z" ;
```

---

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

## Appendix A. Conformance Tests

These are minimal, must-pass programs for a compliant implementation.

**Expressions**
```lucid
PROGRAM ExprTest
    DECLARE A : INTEGER
    A <- 7 DIV 3
    OUTPUT A
ENDPROGRAM
```

**Control flow**
```lucid
PROGRAM LoopTest
    DECLARE I : INTEGER
    FOR I <- 1 TO 3
        OUTPUT I
    NEXT I
ENDPROGRAM
```

**Procedures and functions**
```lucid
PROGRAM CallTest
    OUTPUT Inc(5)
ENDPROGRAM

FUNCTION Inc(X : INTEGER) RETURNS INTEGER
    RETURN X + 1
ENDFUNCTION
```

**Files**
```lucid
PROGRAM FileTest
    DECLARE F : TEXTFILE
    OPENFILE(F, "t.txt", "WRITE")
    WRITEFILE(F, "OK")
    CLOSEFILE(F)
ENDPROGRAM
```

**OOP**
```lucid
PROGRAM OopTest
    DECLARE P : Person
    P <- NEW Person("Ada")
    OUTPUT P.GetName()
ENDPROGRAM

CLASS Person
    PRIVATE
        Name : STRING
    PUBLIC
        CONSTRUCTOR Person(NewName : STRING)
            Name <- NewName
        ENDCONSTRUCTOR

        FUNCTION GetName() RETURNS STRING
            RETURN Name
        ENDFUNCTION
ENDCLASS
```

---

## Appendix B. Glossary and Symbol Index

**Glossary**
- **Block**: Declarations followed by statements, evaluated sequentially.
- **Declaration**: A statement that introduces a name (variable, constant, type, procedure, function, class).
- **Expression**: A construct that yields a value.
- **Lvalue**: A storage location that can appear on the left side of assignment.
- **Statement**: An executable construct in a block.

**Symbol index**

| Symbol | Meaning |
|--------|---------|
| `<-`, `←` | Assignment |
| `+ - * /` | Arithmetic |
| `DIV MOD` | Integer division and remainder |
| `= <> < <= > >=` | Comparisons |
| `AND OR NOT` | Boolean operators |
| `&` | String concatenation |
| `IN` | Set membership |
| `UNION INTERSECT DIFF` | Set operations |
| `@` | Address-of |
| `^` | Dereference |
