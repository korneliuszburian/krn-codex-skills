const REGEX_START = /[([{=,:;!&|?+\-*%~^<>]/;
const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "in", "of", "instanceof", "void", "delete", "do", "else", "yield", "await"]);
const CONTROL_KEYWORDS = new Set(["if", "while", "for", "with", "switch", "catch"]);
const WORD = /[A-Za-z0-9_$]/;

const previousSignificant = (source, index) => {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  return cursor;
};

const wordBefore = (source, index) => {
  let cursor = index;
  while (cursor >= 0 && WORD.test(source[cursor])) cursor -= 1;
  return source.slice(cursor + 1, index + 1);
};

// A `/` starts a regex literal only in value position. Deciding from the single
// previous character is wrong for `if (x) /re/` (regex after a control head) and
// for `n++ / 2` (division after a postfix operator), so scan back over the
// matching `(` or the postfix pair.
function regexStart(source, index) {
  const last = previousSignificant(source, index);
  if (last < 0) return true;
  const char = source[last];
  if (char === "+" || char === "-") {
    const prior = previousSignificant(source, last);
    if (prior >= 0 && source[prior] === char) {
      const before = previousSignificant(source, prior);
      if (before >= 0 && (WORD.test(source[before]) || source[before] === ")" || source[before] === "]")) return false;
    }
    return true;
  }
  if (WORD.test(char)) return REGEX_KEYWORDS.has(wordBefore(source, last));
  if (char === ")") {
    let depth = 0;
    let cursor = last;
    for (; cursor >= 0; cursor -= 1) {
      if (source[cursor] === ")") depth += 1;
      else if (source[cursor] === "(") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (cursor < 0) return false;
    const head = previousSignificant(source, cursor);
    if (head < 0) return true;
    return CONTROL_KEYWORDS.has(wordBefore(source, head));
  }
  return REGEX_START.test(char);
}

function scan(source, { literals = false } = {}) {
  let out = "";
  let index = 0;
  let state = "code";
  const frames = [];
  let braceDepth = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (char === "}" && frames.length > 0 && braceDepth === 0) {
        const frame = frames.pop();
        state = frame.state;
        braceDepth = frame.braceDepth;
        out += char;
        index += 1;
        continue;
      }
      if (frames.length > 0 && char === "{") braceDepth += 1;
      else if (frames.length > 0 && char === "}") braceDepth -= 1;
      if (char === "/" && next === "/") { state = "line"; out += "  "; index += 2; continue; }
      if (char === "/" && next === "*") { state = "block"; out += "  "; index += 2; continue; }
      if (char === "/" && regexStart(source, index)) {
        let cursor = index + 1;
        let inClass = false;
        while (cursor < source.length) {
          const current = source[cursor];
          if (current === "\\") { cursor += 2; continue; }
          if (current === "[") { inClass = true; cursor += 1; continue; }
          if (current === "]") { inClass = false; cursor += 1; continue; }
          if (current === "/" && !inClass) { cursor += 1; break; }
          if (current === "\n") break;
          cursor += 1;
        }
        out += literals ? " ".repeat(cursor - index) : source.slice(index, cursor);
        index = cursor;
        continue;
      }
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      out += char;
      index += 1;
      continue;
    }
    if (state === "line") {
      if (char === "\n") { state = "code"; out += char; } else out += " ";
      index += 1; continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { state = "code"; out += "  "; index += 2; }
      else { out += char === "\n" ? "\n" : " "; index += 1; }
      continue;
    }
    if (state === "template" && char === "$" && next === "{") {
      frames.push({ state: "template", braceDepth });
      braceDepth = 0;
      state = "code";
      out += "${";
      index += 2;
      continue;
    }
    const blank = literals;
    if (char === "\\") { out += blank ? "  " : char + (next ?? ""); index += 2; continue; }
    if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
      state = "code";
      out += char;
      index += 1;
      continue;
    }
    out += blank ? (char === "\n" ? "\n" : " ") : char;
    index += 1;
  }
  return out;
}

export function stripComments(source) {
  return scan(source, {});
}

export function maskLiterals(source) {
  return scan(source, { literals: true });
}
