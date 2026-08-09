export interface Pos {
  line: number;
  ch: number;
}

export class MockEditor {
  text: string;
  cursor: Pos = { line: 0, ch: 0 };
  selections: Array<{ anchor: Pos; head: Pos }> = [];

  constructor(text: string) {
    this.text = text;
  }

  getValue(): string {
    return this.text;
  }

  getLine(line: number): string {
    return this.text.split("\n")[line] ?? "";
  }

  lineCount(): number {
    return this.text.split("\n").length;
  }

  getCursor(): Pos {
    return this.cursor;
  }

  getSelection(): string {
    const selection = this.listSelections()[0];
    return this.getRange(selection.anchor, selection.head);
  }

  listSelections(): Array<{ anchor: Pos; head: Pos }> {
    return this.selections.length ? this.selections : [{ anchor: this.cursor, head: this.cursor }];
  }

  getRange(from: Pos, to: Pos): string {
    const start = Math.min(this.posToOffset(from), this.posToOffset(to));
    const end = Math.max(this.posToOffset(from), this.posToOffset(to));
    return this.text.slice(start, end);
  }

  posToOffset(pos: Pos): number {
    const lines = this.text.split("\n");
    let offset = 0;
    for (let i = 0; i < pos.line; i++) {
      offset += lines[i].length + 1;
    }
    return offset + pos.ch;
  }

  offsetToPos(offset: number): Pos {
    const lines = this.text.split("\n");
    let remaining = offset;
    for (let i = 0; i < lines.length; i++) {
      if (remaining <= lines[i].length) {
        return { line: i, ch: remaining };
      }
      remaining -= lines[i].length + 1;
    }
    const last = lines.length - 1;
    return { line: last, ch: lines[last].length };
  }

  replaceRange(text: string, from: Pos, to?: Pos): void {
    const start = this.posToOffset(from);
    const end = to ? this.posToOffset(to) : start;
    this.text = this.text.slice(0, start) + text + this.text.slice(end);
  }

  setSelection(anchor: Pos, head: Pos): void {
    this.selections = [{ anchor, head }];
  }

  setCursor(pos: Pos): void {
    this.cursor = pos;
  }
}

export function createMockApp(): { workspace: { getActiveFile: () => { basename: string } } } {
  return {
    workspace: {
      getActiveFile: () => ({ basename: "测试笔记" }),
    },
  };
}
