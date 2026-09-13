const REGEX_START = /[([{=,:;!&|?+\-*%~^<>]/;

export function stripComments(source) {
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
        let scan = index + 1;
        let inClass = false;
        while (scan < source.length) {
          const current = source[scan];
          if (current === "\\") { scan += 2; continue; }
          if (current === "[") { inClass = true; scan += 1; continue; }
          if (current === "]") { inClass = false; scan += 1; continue; }
          if (current === "/" && !inClass) { scan += 1; break; }
          if (current === "\n") break;
          scan += 1;
        }
        out += source.slice(index, scan);
        previous = "/";
        index = scan;
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
    if (char === "\\") { out += char + (next ?? ""); index += 2; continue; }
    if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
      state = "code";
    }
    out += char;
    if (!/\s/.test(char)) previous = char;
    index += 1;
  }
  return out;
}

export function maskTemplates(source) {
  return source.replace(/`(?:\\.|[^`\\])*`/g, " ");
}

export function maskLiterals(source) {
  const stripped = stripComments(source);
  let out = "";
  let index = 0;
  let quote = null;
  while (index < stripped.length) {
    const char = stripped[index];
    if (quote === null) {
      if (char === "'" || char === '"' || char === "`") { quote = char; out += char; index += 1; continue; }
      out += char; index += 1; continue;
    }
    if (char === "\\") { out += "  "; index += 2; continue; }
    if (char === quote) { quote = null; out += char; index += 1; continue; }
    out += char === "\n" ? "\n" : " ";
    index += 1;
  }
  return out;
}
