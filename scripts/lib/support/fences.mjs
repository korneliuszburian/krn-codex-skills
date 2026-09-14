const FENCE = /^( {0,3})(`{3,}|~{3,})([^\r\n]*)\r?$/;

const scan = (content) => {
  const lines = [];
  let fence = null;
  for (const [index, line] of content.split("\n").entries()) {
    const match = FENCE.exec(line);
    const number = index + 1;
    if (fence) {
      lines.push({ line, number, fenced: true });
      const closing = match !== null && match[2][0] === fence.char && match[2].length >= fence.length && match[3].trim() === "";
      if (closing) fence = null;
      continue;
    }
    if (match && !(match[2][0] === "`" && match[3].includes("`"))) {
      fence = { char: match[2][0], length: match[2].length };
      lines.push({ line, number, fenced: true });
      continue;
    }
    lines.push({ line, number, fenced: false });
  }
  return { lines, open: fence !== null };
};

export const fenceLines = (content) => scan(content).lines;

export const unfencedLines = (content) => scan(content).lines.filter((entry) => !entry.fenced);

export const unbalancedFence = (content) => scan(content).open;
