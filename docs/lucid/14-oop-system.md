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

