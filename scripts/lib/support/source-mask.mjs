const REGEX_START = /[([{=,:;!&|?+\-*%~^<>]/;
const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "yield", "await", "do", "else"]);
const CONTROL_KEYWORDS = new Set(["if", "while", "for", "with", "switch", "catch"]);
const WORD = /[A-Za-z0-9_$]/;

const previousSignificant = (text, index) => {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(text[cursor])) cursor -= 1;
  return cursor;
};

const wordBefore = (view, index) => {
  let cursor = index;
  while (cursor >= 0 && WORD.test(view[cursor])) cursor -= 1;
  return view.slice(cursor + 1, index + 1).join("");
};

// A `/` starts a regex literal only in value position. The decision reads the
// masked view so a string such as `fn("if(")` cannot fake a control head, and
// it scans back over the matching `(` or postfix pair instead of only the
// previous character.
function regexStart(view, index) {
  const last = previousSignificant(view, index);
  if (last < 0) return true;
  const char = view[last];
  if (char === "+" || char === "-") {
    const prior = previousSignificant(view, last);
    if (prior >= 0 && view[prior] === char) {
      if (prior !== last - 1) return true;
      const before = previousSignificant(view, prior);
      if (before >= 0 && (WORD.test(view[before]) || view[before] === ")" || view[before] === "]")) return false;
    }
    return true;
  }
  if (WORD.test(char)) {
    const back = previousSignificant(view, last - wordBefore(view, last).length);
    if (back >= 0 && view[back] === ".") return false;
    return REGEX_KEYWORDS.has(wordBefore(view, last));
  }
  if (char === ")") {
    let depth = 0;
    let cursor = last;
    for (; cursor >= 0; cursor -= 1) {
      if (view[cursor] === ")") depth += 1;
      else if (view[cursor] === "(") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (cursor < 0) return false;
    const head = previousSignificant(view, cursor);
    if (head < 0) return false;
    return CONTROL_KEYWORDS.has(wordBefore(view, head));
  }
  return REGEX_START.test(char);
}

function scan(source, { literals = false } = {}) {
  const out = [];
  const view = [];
  const emit = (actual, masked = actual) => {
    for (let offset = 0; offset < actual.length; offset += 1) {
      out.push(actual[offset]);
      view.push(masked[offset] ?? " ");
    }
  };
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
        emit(char);
        index += 1;
        continue;
      }
      if (frames.length > 0 && char === "{") braceDepth += 1;
      else if (frames.length > 0 && char === "}") braceDepth -= 1;
      if (char === "/" && next === "/") {
        emit(" ", " ");
        emit(" ", " ");
        state = "line";
        index += 2;
        continue;
      }
      if (char === "/" && next === "*") {
        emit(" ", " ");
        emit(" ", " ");
        state = "block";
        index += 2;
        continue;
      }
      if (char === "/" && regexStart(view, index)) {
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
        const literal = source.slice(index, cursor);
        const masked = " ".repeat(Math.max(0, literal.length - 1)) + "0";
        emit(literals ? " ".repeat(literal.length) : literal, masked);
        index = cursor;
        continue;
      }
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      emit(char);
      index += 1;
      continue;
    }
    if (state === "line") {
      if (char === "\n") { state = "code"; emit(char, char); } else emit(" ", " ");
      index += 1; continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { state = "code"; emit(" ", " "); emit(" ", " "); index += 2; }
      else { emit(char === "\n" ? "\n" : " ", char === "\n" ? "\n" : " "); index += 1; }
      continue;
    }
    if (state === "template" && char === "$" && next === "{") {
      frames.push({ state: "template", braceDepth });
      braceDepth = 0;
      state = "code";
      emit("${");
      index += 2;
      continue;
    }
    if (char === "\\") {
      emit((literals ? "  " : char + (next ?? "")), "  ");
      index += 2;
      continue;
    }
    if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
      state = "code";
      emit(char);
      index += 1;
      continue;
    }
    emit(literals ? (char === "\n" ? "\n" : " ") : char, char === "\n" ? "\n" : " ");
    index += 1;
  }
  return { out: out.join(""), view: view.join("") };
}

export function stripComments(source) {
  return scan(source, {}).out;
}

export function maskLiterals(source) {
  return scan(source, { literals: true }).out;
}
