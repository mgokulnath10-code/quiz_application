// Starter question bank: Programming topics with
// easy / medium / hard questions per language.
// Seeded once on server startup when the
// questions collection is empty.

const q = (question, options, answer, difficulty, topic) => ({
  question,
  options,
  answer,
  difficulty,
  category: "programming",
  topic,
});

const questionBank = [
  /* ===== Python ===== */
  q(
    "Which built-in function prints text in Python?",
    ["echo()", "print()", "printf()", "console.log()"],
    "print()",
    "easy",
    "python"
  ),
  q(
    "How do you create a variable holding the number 5 in Python?",
    ["int x = 5;", "x = 5", "var x = 5", "let x = 5"],
    "x = 5",
    "easy",
    "python"
  ),
  q(
    "Which symbol starts a comment in Python?",
    ["//", "/*", "#", "--"],
    "#",
    "easy",
    "python"
  ),
  q(
    "What data structure uses square brackets and keeps order in Python?",
    ["Dictionary", "Set", "List", "Tuple"],
    "List",
    "medium",
    "python"
  ),
  q(
    "Which keyword defines a function in Python?",
    ["func", "function", "def", "define"],
    "def",
    "medium",
    "python"
  ),
  q(
    "What does len({'a':1,'b':2}) return?",
    ["1", "2", "4", "Error"],
    "2",
    "medium",
    "python"
  ),
  q(
    "What is a decorator in Python?",
    [
      "A compiled helper class",
      "A function that wraps another function",
      "A database model",
      "A loop construct"
    ],
    "A function that wraps another function",
    "hard",
    "python"
  ),
  q(
    "What does a generator function use instead of return?",
    ["yield", "give", "produce", "push"],
    "yield",
    "hard",
    "python"
  ),
  q(
    "Which statement about Python OOP is TRUE?",
    [
      "Classes cannot inherit",
      "__init__ is the constructor",
      "Private attributes are impossible",
      "Methods cannot take self"
    ],
    "__init__ is the constructor",
    "hard",
    "python"
  ),

  /* ===== Java ===== */
  q(
    "Which method is the entry point of a Java program?",
    ["start()", "main()", "init()", "run()"],
    "main()",
    "easy",
    "java"
  ),
  q(
    "How do you print text in Java?",
    [
      "echo \"Hi\";",
      "System.out.println(\"Hi\");",
      "print(\"Hi\");",
      "console.log(\"Hi\");"
    ],
    "System.out.println(\"Hi\");",
    "easy",
    "java"
  ),
  q(
    "Which keyword creates a class in Java?",
    ["struct", "class", "def", "type"],
    "class",
    "easy",
    "java"
  ),
  q(
    "Which collection stores unique elements in Java?",
    ["ArrayList", "LinkedList", "HashSet", "Queue"],
    "HashSet",
    "medium",
    "java"
  ),
  q(
    "What is the default value of an unassigned int field in Java?",
    ["null", "0", "undefined", "NaN"],
    "0",
    "medium",
    "java"
  ),
  q(
    "Which interface sorts objects naturally in Java?",
    ["Comparable", "Iterator", "Cloneable", "Runnable"],
    "Comparable",
    "medium",
    "java"
  ),
  q(
    "What does the 'final' keyword mean on a Java class?",
    [
      "It cannot be serialized",
      "It cannot be inherited",
      "It is garbage collected",
      "It runs in a thread"
    ],
    "It cannot be inherited",
    "hard",
    "java"
  ),
  q(
    "What is JVM in Java?",
    [
      "Java Variable Machine",
      "Java Virtual Machine",
      "Java Validation Module",
      "Joint Vector Model"
    ],
    "Java Virtual Machine",
    "hard",
    "java"
  ),
  q(
    "Which is NOT an OOP principle in Java?",
    ["Encapsulation", "Inheritance", "Compilation", "Polymorphism"],
    "Compilation",
    "hard",
    "java"
  ),

  /* ===== C ===== */
  q(
    "Which function prints text in C?",
    ["print()", "printf()", "echo()", "cout"],
    "printf()",
    "easy",
    "c"
  ),
  q(
    "Which header is needed for printf in C?",
    ["<stdio.h>", "<stdlib.h>", "<string.h>", "<math.h>"],
    "<stdio.h>",
    "easy",
    "c"
  ),
  q(
    "What is the size of a char in C (typical)?",
    ["1 byte", "2 bytes", "4 bytes", "8 bytes"],
    "1 byte",
    "easy",
    "c"
  ),
  q(
    "Which operator gives the memory address of a variable in C?",
    ["*", "&", "#", "@"],
    "&",
    "medium",
    "c"
  ),
  q(
    "What does malloc() return in C?",
    [
      "A file pointer",
      "A void pointer to allocated memory",
      "The allocated size",
      "NULL always"
    ],
    "A void pointer to allocated memory",
    "medium",
    "c"
  ),
  q(
    "Which keyword exits a loop early in C?",
    ["exit", "stop", "break", "return"],
    "break",
    "medium",
    "c"
  ),
  q(
    "What is a dangling pointer in C?",
    [
      "A pointer to the stack",
      "A pointer to freed memory",
      "An uninitialized pointer type",
      "A const pointer"
    ],
    "A pointer to freed memory",
    "hard",
    "c"
  ),
  q(
    "What does sizeof return in C?",
    [
      "Bytes of a type or variable",
      "Bits of a pointer",
      "Length of an array always",
      "Address size"
    ],
    "Bytes of a type or variable",
    "hard",
    "c"
  ),
  q(
    "Which is correct about struct vs union in C?",
    [
      "Union members share memory, struct members do not",
      "Struct members share memory",
      "They are identical",
      "Union cannot hold multiple types"
    ],
    "Union members share memory, struct members do not",
    "hard",
    "c"
  ),

  /* ===== C++ ===== */
  q(
    "Which object prints text in C++?",
    ["printf", "cout", "print", "System.out"],
    "cout",
    "easy",
    "cpp"
  ),
  q(
    "Which header enables cout in C++?",
    ["<iostream>", "<stdio.h>", "<conio.h>", "<string>"],
    "<iostream>",
    "easy",
    "cpp"
  ),
  q(
    "Which keyword defines a class in C++?",
    ["class", "struct only", "type", "interface"],
    "class",
    "easy",
    "cpp"
  ),
  q(
    "What is a reference in C++?",
    [
      "A copy of an object",
      "An alias for an existing variable",
      "A pointer array",
      "A memory leak"
    ],
    "An alias for an existing variable",
    "medium",
    "cpp"
  ),
  q(
    "Which feature is unique to C++ over C?",
    ["Loops", "Classes", "printf", "Pointers"],
    "Classes",
    "medium",
    "cpp"
  ),
  q(
    "What does 'new' do in C++?",
    [
      "Declares a variable",
      "Allocates memory on the heap",
      "Imports a library",
      "Creates a header"
    ],
    "Allocates memory on the heap",
    "medium",
    "cpp"
  ),
  q(
    "What is a virtual function in C++?",
    [
      "A static function",
      "A function overridden at runtime (late binding)",
      "An inline function",
      "A template function"
    ],
    "A function overridden at runtime (late binding)",
    "hard",
    "cpp"
  ),
  q(
    "What is RAII in C++?",
    [
      "Resource Acquisition Is Initialization",
      "Random Access Index Interface",
      "Runtime Allocation In Inheritance",
      "Recursive Array Iteration Idiom"
    ],
    "Resource Acquisition Is Initialization",
    "hard",
    "cpp"
  ),
  q(
    "Which smart pointer shares ownership in C++?",
    ["unique_ptr", "shared_ptr", "weak_ptr only", "auto_ptr"],
    "shared_ptr",
    "hard",
    "cpp"
  ),

  /* ===== JavaScript ===== */
  q(
    "Which keyword declares a block-scoped variable in JavaScript?",
    ["var", "let", "set", "dim"],
    "let",
    "easy",
    "javascript"
  ),
  q(
    "Which symbol means strict equality in JavaScript?",
    ["=", "==", "===", "eq"],
    "===",
    "easy",
    "javascript"
  ),
  q(
    "How do you log to the browser console in JavaScript?",
    ["print()", "console.log()", "echo()", "log()"],
    "console.log()",
    "easy",
    "javascript"
  ),
  q(
    "What does Array.prototype.map return?",
    [
      "The same array modified",
      "A new array of transformed values",
      "undefined",
      "A single value"
    ],
    "A new array of transformed values",
    "medium",
    "javascript"
  ),
  q(
    "What is a Promise in JavaScript?",
    [
      "A synchronous callback",
      "An object representing a future value",
      "A DOM element",
      "A loop type"
    ],
    "An object representing a future value",
    "medium",
    "javascript"
  ),
  q(
    "What does 'this' refer to in an arrow function?",
    [
      "The calling object",
      "The enclosing lexical scope's this",
      "The window always",
      "undefined always"
    ],
    "The enclosing lexical scope's this",
    "medium",
    "javascript"
  ),
  q(
    "What is a JavaScript closure?",
    [
      "A function plus its lexical environment",
      "A finished loop",
      "A private class",
      "An async wrapper"
    ],
    "A function plus its lexical environment",
    "hard",
    "javascript"
  ),
  q(
    "What does the event loop enable in JavaScript?",
    [
      "Multithreaded execution",
      "Non-blocking async behavior on a single thread",
      "DOM rendering",
      "Garbage collection"
    ],
    "Non-blocking async behavior on a single thread",
    "hard",
    "javascript"
  ),
  q(
    "What does async/await sugar over in JavaScript?",
    ["Callbacks", "Promises", "Generators only", "Events"],
    "Promises",
    "hard",
    "javascript"
  ),
];

module.exports = questionBank;
