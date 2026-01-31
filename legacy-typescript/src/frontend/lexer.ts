import { Token, KEYWORDS, OPERATORS, DELIMITERS } from "./token.js";
import { errorAt } from "../diagnostics/errors.js";

export class Lexer {
  private readonly text: string;
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(text: string) {
    this.text = text;
  }

  nextToken(): Token {
    this.skipWhitespaceAndComments();
    if (this.isAtEnd()) {
      return { kind: "EOF", lexeme: "", line: this.line, column: this.column };
    }

    const startLine = this.line;
    const startCol = this.column;
    const ch = this.peek();

    // Unicode assignment arrow
    if (ch === "\u2190") {
      this.advance();
      return { kind: "Operator", lexeme: "<-", line: startLine, column: startCol };
    }

    // Identifier or keyword
    if (this.isLetter(ch)) {
      const lexeme = this.readWhile((c) => this.isLetter(c) || this.isDigit(c) || c === "_");
      const upper = lexeme.toUpperCase();
      if (upper === "TRUE" || upper === "FALSE") {
        return { kind: "Boolean", lexeme, value: upper === "TRUE", line: startLine, column: startCol };
      }
      if (KEYWORDS.has(upper)) {
        return { kind: "Keyword", lexeme: upper, line: startLine, column: startCol };
      }
      return { kind: "Identifier", lexeme, line: startLine, column: startCol };
    }

    // Number
    if (this.isDigit(ch)) {
      const { lexeme, isReal } = this.readNumber();
      if (isReal) {
        return { kind: "Real", lexeme, value: Number(lexeme), line: startLine, column: startCol };
      }
      return { kind: "Integer", lexeme, value: Number(lexeme), line: startLine, column: startCol };
    }

    // String
    if (ch === '"') {
      const value = this.readString();
      return { kind: "String", lexeme: value, value, line: startLine, column: startCol };
    }

    // Char
    if (ch === "'") {
      const value = this.readChar();
      return { kind: "Char", lexeme: value, value, line: startLine, column: startCol };
    }

    // Operators and delimiters
    const two = this.peekN(2);
    if (OPERATORS.has(two)) {
      this.advance();
      this.advance();
      return { kind: "Operator", lexeme: two, line: startLine, column: startCol };
    }

    if (OPERATORS.has(ch)) {
      this.advance();
      return { kind: "Operator", lexeme: ch, line: startLine, column: startCol };
    }

    if (DELIMITERS.has(ch)) {
      this.advance();
      return { kind: "Delimiter", lexeme: ch, line: startLine, column: startCol };
    }

    throw errorAt("SyntaxError", startLine, `Unexpected character '${ch}'.`);
  }

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();
      if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
        this.advance();
        continue;
      }
      if (ch === "/" && this.peekN(2) === "//") {
        while (!this.isAtEnd() && this.peek() !== "\n") {
          this.advance();
        }
        continue;
      }
      break;
    }
  }

  private readNumber(): { lexeme: string; isReal: boolean } {
    let lexeme = this.readWhile((c) => this.isDigit(c));
    let isReal = false;

    if (this.peek() === "." && this.isDigit(this.peekN(2)[1] ?? "")) {
      isReal = true;
      lexeme += this.advance();
      lexeme += this.readWhile((c) => this.isDigit(c));
    }

    if (this.peek() === "E" || this.peek() === "e") {
      isReal = true;
      lexeme += this.advance();
      if (this.peek() === "+" || this.peek() === "-") {
        lexeme += this.advance();
      }
      if (!this.isDigit(this.peek())) {
        throw errorAt("SyntaxError", this.line, "Invalid exponent format.");
      }
      lexeme += this.readWhile((c) => this.isDigit(c));
    }

    return { lexeme, isReal };
  }

  private readString(): string {
    this.advance();
    let value = "";
    while (!this.isAtEnd()) {
      const ch = this.advance();
      if (ch === '"') {
        return value;
      }
      if (ch === "\\") {
        value += this.readEscape();
      } else {
        this.ensureAscii(ch);
        value += ch;
      }
    }
    throw errorAt("SyntaxError", this.line, "Unterminated string literal.");
  }

  private readChar(): string {
    this.advance();
    if (this.isAtEnd()) {
      throw errorAt("SyntaxError", this.line, "Unterminated char literal.");
    }
    let value = "";
    const ch = this.advance();
    if (ch === "\\") {
      value = this.readEscape();
    } else {
      this.ensureAscii(ch);
      value = ch;
    }
    if (this.isAtEnd() || this.advance() !== "'") {
      throw errorAt("SyntaxError", this.line, "Unterminated char literal.");
    }
    if (value.length !== 1) {
      throw errorAt("SyntaxError", this.line, "Char literal must be exactly one character.");
    }
    return value;
  }

  private readEscape(): string {
    if (this.isAtEnd()) {
      throw errorAt("SyntaxError", this.line, "Invalid escape sequence.");
    }
    const ch = this.advance();
    switch (ch) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "'":
        return "'";
      case "x": {
        const h1 = this.advance();
        const h2 = this.advance();
        if (!this.isHex(h1) || !this.isHex(h2)) {
          throw errorAt("SyntaxError", this.line, "Invalid hex escape.");
        }
        return String.fromCharCode(parseInt(`${h1}${h2}`, 16));
      }
      default:
        throw errorAt("SyntaxError", this.line, "Invalid escape sequence.");
    }
  }

  private ensureAscii(ch: string): void {
    if (ch.charCodeAt(0) > 0x7f) {
      throw errorAt("SyntaxError", this.line, "Non-ASCII character in source.");
    }
  }

  private readWhile(pred: (c: string) => boolean): string {
    let out = "";
    while (!this.isAtEnd() && pred(this.peek())) {
      out += this.advance();
    }
    return out;
  }

  private isLetter(ch: string): boolean {
    return /[A-Za-z]/.test(ch);
  }

  private isDigit(ch: string): boolean {
    return /[0-9]/.test(ch);
  }

  private isHex(ch: string): boolean {
    return /[0-9A-Fa-f]/.test(ch);
  }

  private peek(): string {
    return this.text[this.index] ?? "";
  }

  private peekN(n: number): string {
    return this.text.slice(this.index, this.index + n);
  }

  private advance(): string {
    const ch = this.text[this.index++] ?? "";
    if (ch === "\n") {
      this.line += 1;
      this.column = 1;
    } else {
      this.column += 1;
    }
    return ch;
  }

  private isAtEnd(): boolean {
    return this.index >= this.text.length;
  }
}
