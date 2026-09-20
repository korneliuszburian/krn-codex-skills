export function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileGlob(glob) {
  let out = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*") {
      if (glob[index + 1] === "*") {
        index += 1;
        if (glob[index + 1] === "/") {
          index += 1;
          out += "(?:.*/)?";
        } else {
          out += ".*";
        }
      } else {
        out += "[^/]*";
      }
    } else if (char === "?") {
      out += "[^/]";
    } else if (char === "[") {
      const close = glob.indexOf("]", index + 1);
      if (close === -1) {
        out += "\\[";
      } else {
        let body = glob.slice(index + 1, close);
        if (body.startsWith("!")) body = `^${body.slice(1)}`;
        out += `[${body}]`;
        index = close;
      }
    } else if ("\\.+()|^${}".includes(char)) {
      out += `\\${char}`;
    } else {
      out += char;
    }
  }
  return new RegExp(`${out}$`);
}

const NEVER_MATCHES = /(?!x)x/;

export function globToRegex(glob) {
  try {
    return compileGlob(glob);
  } catch {
    return NEVER_MATCHES;
  }
}

export function splitTableRow(line) {
  const cells = [];
  const inner = line.startsWith("|") ? line.slice(1) : line;
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}
