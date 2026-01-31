import fs from "node:fs";
import path from "node:path";
import { Lexer } from "../frontend/lexer.js";
import { Parser } from "../frontend/parser.js";
import { TypeChecker } from "../semantics/type_checker.js";
import { Interpreter } from "../runtime/interpreter.js";
import { formatError } from "../diagnostics/reporter.js";
import { PrescribeError } from "../diagnostics/errors.js";
import { extractPrescribeBlocks } from "../source/prsd.js";

function main(): void {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: prescribe <file.prsd>");
    process.exit(1);
  }
  const filePath = args[0];
  if (path.extname(filePath).toLowerCase() !== ".prsd") {
    console.error("Only .prsd files are supported.");
    process.exit(1);
  }
  const text = fs.readFileSync(filePath, "utf8");
  const blocks = extractPrescribeBlocks(text).map((b) => b.code);

  try {
    for (const code of blocks) {
      const lexer = new Lexer(code);
      const parser = new Parser(lexer);
      const program = parser.parseProgram();
      const checker = new TypeChecker();
      const sema = checker.check(program);
      const input = fs.readFileSync(0, "utf8");
      const interpreter = new Interpreter(program, sema, input);
      const output = interpreter.run();
      process.stdout.write(output);
    }
  } catch (err) {
    if (err instanceof PrescribeError) {
      console.error(formatError(err));
      process.exit(1);
    }
    throw err;
  }
}

main();
