const DECL = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

function codeMask(source) {
  const mask = new Array(source.length).fill(true);
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") mask[index++] = false;
    } else if (char === "/" && next === "*") {
      mask[index++] = false;
      mask[index++] = false;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) mask[index++] = false;
      if (index < source.length) {
        mask[index++] = false;
        mask[index++] = false;
      }
    } else if (char === '"' || char === "'" || char === "`") {
      mask[index++] = false;
      while (index < source.length) {
        mask[index] = false;
        if (source[index] === "\\") {
          index += 1;
          if (index < source.length) mask[index] = false;
          index += 1;
          continue;
        }
        if (source[index] === char) {
          index += 1;
          break;
        }
        index += 1;
      }
    } else {
      index += 1;
    }
  }
  return mask;
}

export function extractSymbols(source) {
  const mask = codeMask(source);
  const lineStart = [0];
  for (let index = 0; index < source.length; index += 1) if (source[index] === "\n") lineStart.push(index + 1);
  const lines = source.split("\n");
  const lineOf = (offset) => {
    let low = 0;
    let high = lineStart.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStart[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  };
  const symbols = [];
  for (let line = 0; line < lines.length; line += 1) {
    const match = DECL.exec(lines[line]);
    if (!match) continue;
    let depth = 0;
    let opened = false;
    let endLine = line;
    let terminated = false;
    for (let offset = lineStart[line]; offset < source.length; offset += 1) {
      if (!mask[offset]) continue;
      const char = source[offset];
      if (char === "{") {
        depth += 1;
        opened = true;
      } else if (char === "}") {
        depth -= 1;
        if (opened && depth <= 0) {
          endLine = lineOf(offset);
          terminated = true;
          break;
        }
      } else if (!opened && char === ";") {
        endLine = lineOf(offset);
        terminated = true;
        break;
      }
    }
    symbols.push({ name: match[2], kind: match[1], start: line + 1, end: (terminated ? endLine : lines.length - 1) + 1 });
  }
  return symbols;
}

export function changedLineNumbers(diffText) {
  const lines = new Set();
  for (const match of diffText.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) lines.add(line);
  }
  return lines;
}

export function removedLineNumbers(diffText) {
  const lines = new Set();
  for (const match of diffText.matchAll(/^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) lines.add(line);
  }
  return lines;
}

function unquote(value) {
  if (!(value.startsWith('"') && value.endsWith('"'))) return value;
  return value
    .slice(1, -1)
    .replace(/\\(?:([0-7]{1,3})|x([0-9a-fA-F]{2})|(.))/g, (_match, octal, hex, char) =>
      octal ? String.fromCharCode(parseInt(octal, 8)) : hex ? String.fromCharCode(parseInt(hex, 16)) : { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\" }[char] ?? char);
}

function headerPath(line, prefix) {
  const value = line.slice(prefix.length).replace(/\t.*$/, "").trim();
  if (value === "/dev/null") return null;
  return unquote(value).replace(/^[ab]\//, "");
}

function namesIn(symbols, lineNumbers) {
  const names = [];
  for (const symbol of symbols) {
    for (let line = symbol.start; line <= symbol.end; line += 1) {
      if (lineNumbers.has(line)) {
        names.push(symbol.name);
        break;
      }
    }
  }
  return names;
}

export function touchedSymbols({ root, git, sha }) {
  let diff = git(root, ["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color", "--no-renames", `${sha}^`, sha, "--"]);
  if (!diff.ok) diff = git(root, ["-c", "core.quotePath=false", "show", "--format=", "--unified=0", "--no-color", "--no-renames", sha, "--"]);
  if (!diff.ok) return [];
  const names = new Set();
  let before = null;
  let after = null;
  let hunks = [];
  const flush = () => {
    if (before === null && after === null) return;
    const hunk = hunks.join("\n");
    const added = changedLineNumbers(hunk);
    const removed = removedLineNumbers(hunk);
    const post = after && git(root, ["show", `${sha}:${after}`]);
    if (post?.ok) for (const name of namesIn(extractSymbols(post.out), added)) names.add(name);
    const pre = before && git(root, ["show", `${sha}^:${before}`]);
    if (pre?.ok) for (const name of namesIn(extractSymbols(pre.out), removed)) names.add(name);
    before = null;
    after = null;
    hunks = [];
  };
  for (const line of diff.out.split("\n")) {
    if (line.startsWith("--- ")) {
      flush();
      before = headerPath(line, "--- ");
    } else if (line.startsWith("+++ ")) {
      after = headerPath(line, "+++ ");
    } else if (line.startsWith("@@")) {
      hunks.push(line);
    }
  }
  flush();
  return [...names];
}
