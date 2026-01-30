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

call_stmt       = "CALL", identifier, "(", [ arg_list ], ")" ;

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

