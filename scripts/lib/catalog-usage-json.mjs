export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}


export function parseObject(value) {
  if (isObject(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function balancedJsonObject(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return { end: index + 1, source: source.slice(start, index + 1) };
    }
  }
  return null;
}

export function parseFlatExecLiteral(source) {
  let index = 0;
  let cmd;
  let workdir;
  const seen = new Set();
  const allowedKeys = new Map([
    ["cmd", "string"],
    ["justification", "string"],
    ["login", "boolean"],
    ["max_output_tokens", "number"],
    ["prefix_rule", "string_array"],
    ["sandbox_permissions", "string"],
    ["shell", "string"],
    ["tty", "boolean"],
    ["workdir", "nullable_string"],
    ["yield_time_ms", "number"],
  ]);
  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? "")) index += 1;
  };
  const readJsonString = () => {
    if (source[index] !== '"') return null;
    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const character = source[index];
      index += 1;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') {
        try {
          const value = JSON.parse(source.slice(start, index));
          return typeof value === "string" ? value : null;
        } catch {
          return null;
        }
      }
    }
    return null;
  };
  const readStringArray = () => {
    if (source[index] !== "[") return null;
    index += 1;
    skipWhitespace();
    const values = [];
    if (source[index] === "]") {
      index += 1;
      return values;
    }
    while (index < source.length) {
      const value = readJsonString();
      if (value === null) return null;
      values.push(value);
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return values;
      }
      if (source[index] !== ",") return null;
      index += 1;
      skipWhitespace();
      if (source[index] === "]") return null;
    }
    return null;
  };
  const readValue = (kind) => {
    if (kind === "string" || kind === "nullable_string") {
      if (kind === "nullable_string" && source.startsWith("null", index)) {
        index += 4;
        return { ok: true, value: null };
      }
      const value = readJsonString();
      return value === null ? { ok: false } : { ok: true, value };
    }
    if (kind === "boolean") {
      if (source.startsWith("true", index)) {
        index += 4;
        return { ok: true, value: true };
      }
      if (source.startsWith("false", index)) {
        index += 5;
        return { ok: true, value: false };
      }
      return { ok: false };
    }
    if (kind === "number") {
      const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match === null) return { ok: false };
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return { ok: false };
      index += match[0].length;
      return { ok: true, value };
    }
    const value = readStringArray();
    return value === null ? { ok: false } : { ok: true, value };
  };

  skipWhitespace();
  if (source[index] !== "{") return null;
  index += 1;
  skipWhitespace();
  if (source[index] === "}") return null;

  while (index < source.length) {
    let key;
    if (source[index] === '"') {
      key = readJsonString();
    } else {
      const match = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (match === null) return null;
      key = match[0];
      index += match[0].length;
    }
    const kind = allowedKeys.get(key);
    if (kind === undefined || seen.has(key)) return null;
    seen.add(key);

    skipWhitespace();
    if (source[index] !== ":") return null;
    index += 1;
    skipWhitespace();

    const parsed = readValue(kind);
    if (!parsed.ok) return null;
    if (key === "cmd") cmd = parsed.value;
    else if (key === "workdir") workdir = parsed.value;

    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
      skipWhitespace();
      return index === source.length && typeof cmd === "string" ? { cmd, workdir } : null;
    }
    if (source[index] !== ",") return null;
    index += 1;
    skipWhitespace();
    if (source[index] === "}") return null;
  }
  return null;
}

export function literalToolCalls(source) {
  const calls = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === quote) break;
      }
      continue;
    }
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const closing = source.indexOf("*/", index + 2);
      index = closing === -1 ? source.length : closing + 2;
      continue;
    }
    if (!source.startsWith("tools.", index) || /[A-Za-z0-9_$.]/.test(source[index - 1] ?? "")) {
      index += 1;
      continue;
    }

    const nameStart = index + "tools.".length;
    const match = source.slice(nameStart).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (match === null || match[0].length > 160) {
      index = nameStart;
      continue;
    }
    let opening = nameStart + match[0].length;
    while (/\s/.test(source[opening] ?? "")) opening += 1;
    if (source[opening] === "(") {
      calls.push({ name: match[0], opening });
    }
    index = opening + 1;
  }
  return calls;
}

export function nestedExecCommands(source) {
  const commands = [];
  for (const call of literalToolCalls(source)) {
    if (call.name !== "exec_command") continue;
    let index = call.opening + 1;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "{") continue;
    const literal = balancedJsonObject(source, index);
    if (literal === null) continue;
    let closing = literal.end;
    while (/\s/.test(source[closing] ?? "")) closing += 1;
    if (source[closing] === ")") {
      const parsed = parseFlatExecLiteral(literal.source);
      if (typeof parsed?.cmd === "string") {
        commands.push({ cmd: parsed.cmd, workdir: parsed.workdir });
      }
    }
  }
  return commands;
}

export function freeformSource(item) {
  if (typeof item.input === "string") return item.input;
  if (typeof item.arguments !== "string") return null;
  const parsed = parseObject(item.arguments);
  if (parsed !== null) {
    for (const key of ["input", "source", "code"]) {
      if (typeof parsed[key] === "string") return parsed[key];
    }
    return null;
  }
  return item.arguments;
}
