const REGEX_START = /[([{=,:;!&|?+\-*%~^<>]/;

function scan(source, maskLiterals) {
  let out = "";
  let index = 0;
  let state = "code";
  let previous = "";
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") { state = "line"; out += "  "; index += 2; continue; }
      if (char === "/" && next === "*") { state = "block"; out += "  "; index += 2; continue; }
      if (char === "/" && (previous === "" || REGEX_START.test(previous))) {
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
        out += maskLiterals ? " ".repeat(cursor - index) : source.slice(index, cursor);
        previous = "/";
        index = cursor;
        continue;
      }
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      out += char;
      if (!/\s/.test(char)) previous = char;
      index += 1;
      continue;
    }
    if (state === "line") {
      if (char === "\n") { state = "code"; out += char; previous = ""; } else out += " ";
      index += 1; continue;
    }
    if (state === "block") {
      if (char === "*" && next === "/") { state = "code"; out += "  "; index += 2; }
      else { out += char === "\n" ? "\n" : " "; index += 1; }
      continue;
    }
    if (char === "\\") { out += maskLiterals ? "  " : char + (next ?? ""); index += 2; continue; }
    if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
      state = "code";
      out += char;
      previous = char;
      index += 1;
      continue;
    }
    out += maskLiterals ? (char === "\n" ? "\n" : " ") : char;
    if (!maskLiterals && !/\s/.test(char)) previous = char;
    index += 1;
  }
  return out;
}

export function stripComments(source) {
  return scan(source, false);
}

export function maskLiterals(source) {
  return scan(source, true);
}

export function maskTemplates(source) {
  return source.replace(/`(?:\\.|[^`\\])*`/g, " ");
}
