const DECL = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;

export function extractSymbols(source) {
  const lines = source.split("\n");
  const symbols = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = DECL.exec(lines[index]);
    if (!match) continue;
    let depth = 0;
    let opened = false;
    let end = index;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      for (const char of lines[cursor]) {
        if (char === "{") {
          depth += 1;
          opened = true;
        } else if (char === "}") {
          depth -= 1;
        }
      }
      if (opened && depth <= 0) {
        end = cursor;
        break;
      }
      if (!opened && lines[cursor].includes(";")) {
        end = cursor;
        break;
      }
    }
    symbols.push({ name: match[2], kind: match[1], start: index + 1, end: end + 1 });
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

export function touchedSymbols({ root, git, sha }) {
  const diff = git(root, ["diff", "--unified=0", "--no-color", `${sha}^`, sha, "--"]);
  if (!diff.ok) return [];
  const names = new Set();
  let current = null;
  let hunks = [];
  const flush = () => {
    if (!current) return;
    const changed = changedLineNumbers(hunks.join("\n"));
    const content = git(root, ["show", `${sha}:${current}`]);
    if (content.ok) {
      for (const symbol of extractSymbols(content.out)) {
        for (let line = symbol.start; line <= symbol.end; line += 1) {
          if (changed.has(line)) {
            names.add(symbol.name);
            break;
          }
        }
      }
    }
    current = null;
    hunks = [];
  };
  for (const line of diff.out.split("\n")) {
    if (line.startsWith("+++ b/")) {
      flush();
      current = line.slice("+++ b/".length);
    } else if (line.startsWith("@@")) {
      hunks.push(line);
    }
  }
  flush();
  return [...names];
}
