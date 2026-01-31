import { Type } from "../semantics/types.js";
import { RuntimeValue } from "./values.js";
import { defaultValue } from "./defaults.js";

let nextAddress = 1;

export interface CellLike {
  type: Type;
  get(): RuntimeValue;
  set(value: RuntimeValue): void;
  getRef?(): CellLike | undefined;
}

export class Cell implements CellLike {
  private ref?: Cell;
  readonly type: Type;
  private value: RuntimeValue;

  constructor(type: Type, value: RuntimeValue, ref?: Cell) {
    this.type = type;
    this.value = value;
    this.ref = ref;
  }

  get(): RuntimeValue {
    if (this.ref) return this.ref.get();
    return this.value;
  }

  set(value: RuntimeValue): void {
    if (this.ref) {
      this.ref.set(value);
      return;
    }
    this.value = value;
  }

  getRef(): Cell | undefined {
    return this.ref;
  }
}

export class Frame {
  private readonly slots = new Map<string, CellLike>();

  define(name: string, cell: CellLike): void {
    this.slots.set(name, cell);
  }

  lookup(name: string): CellLike | undefined {
    return this.slots.get(name);
  }
}

export class Store {
  readonly frames: Frame[] = [];
  readonly heap = new Map<number, CellLike>();
  readonly classHeap = new Map<number, { className: string; fields: Map<string, Cell> }>();
  readonly addresses = new Map<CellLike, number>();

  pushFrame(): Frame {
    const frame = new Frame();
    this.frames.push(frame);
    return frame;
  }

  popFrame(): void {
    this.frames.pop();
  }

  currentFrame(): Frame {
    if (this.frames.length === 0) {
      return this.pushFrame();
    }
    return this.frames[this.frames.length - 1];
  }

  allocPointerCell(type: Type): number {
    const cell = new Cell(type, defaultValue(type));
    const addr = nextAddress++;
    this.heap.set(addr, cell);
    return addr;
  }

  addrOf(cell: CellLike): number {
    const existing = this.addresses.get(cell);
    if (existing) return existing;
    const addr = nextAddress++;
    this.addresses.set(cell, addr);
    this.heap.set(addr, cell);
    return addr;
  }

  deref(addr: number): CellLike | undefined {
    return this.heap.get(addr);
  }

  allocClassObject(className: string, fields: Map<string, Cell>): number {
    const id = nextAddress++;
    this.classHeap.set(id, { className, fields });
    return id;
  }

  getClassObject(id: number): { className: string; fields: Map<string, Cell> } | undefined {
    return this.classHeap.get(id);
  }
}
