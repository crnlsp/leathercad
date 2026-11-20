/**
 * Breaks `text` at its spaces into lines no wider than `width` by `measure`,
 * filling each line before starting the next. A word wider than the width
 * keeps a line of its own rather than being cut. Units are the caller's: the
 * screen backends measure CSS pixels.
 */
export function wrapLines(
  text: string,
  width: number,
  measure: (line: string) => number,
): string[] {
  const [first = '', ...rest] = text.split(' ');
  const lines: string[] = [];
  let line = first;
  for (const word of rest) {
    const longer = `${line} ${word}`;
    if (measure(longer) <= width) {
      line = longer;
    } else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}
