// Lexical approximation, not a full parser. Known gaps (documented bounds):
// a regex literal in a declaration body can still mis-scope a span, a
// destructuring identifier inside a default expression is still reported,
// class/object methods and getters/setters are not extracted, and an
// export alias (`local as exported`) maps to the exported name's span.
const DECL = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const DESTRUCT_START = /^\s*export\s+(?:const|let|var)\s+([\[{])/;

function destructuredNames(text) {
  const names = [];
  let depth = 0;
  let current = "";
  const flush = () => {
    const part = current.trim();
    current = "";
    if (!part) return;
    const withoutDefault = part.split("=")[0].trim();
    const renamed = /:\s*([A-Za-z_$][\w$]*)$/.exec(withoutDefault);
    const match = renamed ?? /^(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(withoutDefault);
    if (match) names.push(match[1]);
  };
  for (const char of text) {
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    if (char === "," && depth === 0) {
      flush();
      continue;
    }
    current += char;
  }
  flush();
  return names;
}

function additionalDeclarators(text) {
  const names = [];
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "{" || char === "[") depth += 1;
    else if (char === ")" || char === "}" || char === "]") depth -= 1;
    else if (char === ";" && depth === 0) break;
    else if (char === "," && depth === 0) {
      const match = /^\s*([A-Za-z_$][\w$]*)/.exec(text.slice(index + 1));
      if (match) names.push(match[1]);
    }
  }
  return names;
}

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
  const scanSpan = (startLine) => {
    let depth = 0;
    let parens = 0;
    let opened = false;
    let endLine = startLine;
    let terminated = false;
    for (let offset = lineStart[startLine]; offset < source.length; offset += 1) {
      if (!mask[offset]) continue;
      const char = source[offset];
      if (char === "(") {
        parens += 1;
        continue;
      }
      if (char === ")") {
        if (parens > 0) parens -= 1;
        continue;
      }
      if (parens > 0) continue;
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
    return (terminated ? endLine : lines.length - 1) + 1;
  };
  const symbols = [];
  for (let line = 0; line < lines.length; line += 1) {
    const start = DESTRUCT_START.exec(lines[line]);
    if (start) {
      const openChar = start[1];
      const closeChar = openChar === "{" ? "}" : "]";
      const openOffset = lineStart[line] + start[0].length - 1;
      let depth = 0;
      let endOffset = openOffset;
      for (let offset = openOffset; offset < source.length; offset += 1) {
        if (!mask[offset]) continue;
        const char = source[offset];
        if (char === openChar) depth += 1;
        else if (char === closeChar) {
          depth -= 1;
          if (depth === 0) {
            endOffset = offset;
            break;
          }
        }
      }
      const endLine = lineOf(endOffset);
      const inner = source
        .slice(openOffset + 1, endOffset)
        .split("")
        .map((char, offset) => (mask[openOffset + 1 + offset] ? char : " "))
        .join("");
      for (const name of destructuredNames(inner)) {
        symbols.push({ name, kind: "const", start: line + 1, end: endLine + 1 });
      }
      line = endLine;
      continue;
    }
    const match = DECL.exec(lines[line]);
    if (!match) continue;
    const end = scanSpan(line);
    symbols.push({ name: match[2], kind: match[1], start: line + 1, end });
    const rest = source
      .slice(lineStart[line] + match[0].length, lineStart[end - 1] + lines[end - 1].length)
      .split("")
      .map((char, offset) => (mask[lineStart[line] + match[0].length + offset] ? char : " "))
      .join("");
    for (const name of additionalDeclarators(rest)) {
      symbols.push({ name, kind: match[1], start: line + 1, end });
    }
  }
  for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
    if (!mask[match.index]) continue;
    const exportLine = lineOf(match.index);
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(name) || symbols.some((symbol) => symbol.name === name)) continue;
      const escaped = name.replace(/\$/g, "\\$");
      const localLine = lines.findIndex((text, index) => new RegExp(`(?:function\\*?|const|let|var)\\s+${escaped}\\b`).test(text) && mask[lineStart[index]]);
      if (localLine >= 0) symbols.push({ name, kind: "local", start: localLine + 1, end: scanSpan(localLine) });
      else symbols.push({ name, kind: "export", start: exportLine + 1, end: exportLine + 1 });
    }
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

export function touchedSymbolFiles({ root, git, sha }) {
  let diff = git(root, ["-c", "core.quotePath=false", "diff", "--unified=0", "--no-color", "--no-renames", `${sha}^`, sha, "--"]);
  if (!diff.ok) diff = git(root, ["-c", "core.quotePath=false", "show", "--format=", "--unified=0", "--no-color", "--no-renames", sha, "--"]);
  if (!diff.ok) return new Map();
  const files = new Map();
  const add = (name, file) => {
    if (!files.has(name)) files.set(name, new Set());
    if (file) files.get(name).add(file);
  };
  let before = null;
  let after = null;
  let hunks = [];
  const flush = () => {
    if (before === null && after === null) return;
    const hunk = hunks.join("\n");
    const added = changedLineNumbers(hunk);
    const removed = removedLineNumbers(hunk);
    const post = after && git(root, ["show", `${sha}:${after}`]);
    if (post?.ok) for (const name of namesIn(extractSymbols(post.out), added)) add(name, after);
    const pre = before && git(root, ["show", `${sha}^:${before}`]);
    if (pre?.ok) for (const name of namesIn(extractSymbols(pre.out), removed)) add(name, before);
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
  return files;
}
