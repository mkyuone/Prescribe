export type SourceSpan = {
  line: number;
  column: number;
};

export class SourceFile {
  readonly text: string;
  readonly name: string;

  constructor(name: string, text: string) {
    this.name = name;
    this.text = text;
  }
}
