export function stripComments(source) {
  let out = "";
  let index = 0;
  let state = "code";
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (state === "code") {
      if (char === "/" && next === "/") { state = "line"; out += "  "; index += 2; continue; }
      if (char === "/" && next === "*") { state = "block"; out += "  "; index += 2; continue; }
      if (char === "'") state = "single";
      else if (char === '"') state = "double";
      else if (char === "`") state = "template";
      out += char; index += 1; continue;
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
    if (char === "\\") { out += char + (next ?? ""); index += 2; continue; }
    if ((state === "single" && char === "'") || (state === "double" && char === '"') || (state === "template" && char === "`")) {
      state = "code";
    }
    out += char; index += 1;
  }
  return out;
}

export function maskTemplates(source) {
  return source.replace(/`(?:\\.|[^`\\])*`/g, " ");
}
