export type PrsdBlock = {
  index: number;
  code: string;
};

export function extractPrescribeBlocks(text: string): PrsdBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: PrsdBlock[] = [];
  let inBlock = false;
  let buffer: string[] = [];
  let blockIndex = 0;

  for (const line of lines) {
    if (!inBlock) {
      if (line.trim() === ":::prescribe") {
        inBlock = true;
        buffer = [];
      }
      continue;
    }

    if (line.trim() === ":::") {
      blocks.push({ index: blockIndex++, code: buffer.join("\n") });
      inBlock = false;
      buffer = [];
      continue;
    }

    buffer.push(line);
  }

  if (inBlock) {
    blocks.push({ index: blockIndex++, code: buffer.join("\n") });
  }

  return blocks;
}
