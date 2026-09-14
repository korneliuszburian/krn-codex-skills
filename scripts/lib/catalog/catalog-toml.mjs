import { ConfigReconcileError } from "./catalog-errors.mjs";

export function splitLines(source) {
  const lines = [];
  const matcher = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  let match;
  let offset = 0;

  while ((match = matcher.exec(source)) !== null) {
    const raw = match[0];
    if (raw === "") break;
    const eolMatch = raw.match(/(\r\n|\n|\r)$/);
    const eol = eolMatch?.[1] ?? "";
    const content = eol === "" ? raw : raw.slice(0, -eol.length);
    lines.push({ raw, content, eol, start: offset, end: offset + raw.length });
    offset += raw.length;
  }

  return lines;
}

const SIMPLE_ESCAPES = { b: "\b", t: "\t", n: "\n", f: "\f", r: "\r", "\"": "\"", "\\": "\\" };

export function parseTomlString(token, target) {
  if (token.startsWith("'")) {
    if (token.length < 2 || !token.endsWith("'")) {
      throw new ConfigReconcileError(`Invalid TOML string for ${target}`, { target });
    }
    return token.slice(1, -1);
  }
  if (token.length < 2 || !token.startsWith("\"") || !token.endsWith("\"")) {
    throw new ConfigReconcileError(`Invalid TOML string for ${target}`, { target });
  }
  const body = token.slice(1, -1);
  let out = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char !== "\\") { out += char; continue; }
    const escape = body[index + 1];
    if (Object.hasOwn(SIMPLE_ESCAPES, escape)) { out += SIMPLE_ESCAPES[escape]; index += 1; continue; }
    const width = escape === "u" ? 4 : escape === "U" ? 8 : 0;
    const hex = body.slice(index + 2, index + 2 + width);
    if (width === 0 || hex.length !== width || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new ConfigReconcileError(`Invalid TOML string for ${target}`, { target });
    }
    const code = Number.parseInt(hex, 16);
    if (code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
      throw new ConfigReconcileError(`Invalid TOML string for ${target}`, { target });
    }
    out += String.fromCodePoint(code);
    index += 1 + width;
  }
  return out;
}

export function splitHeader(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("[")) return undefined;

  const array = trimmed.startsWith("[[");
  const openingLength = array ? 2 : 1;
  const closing = array ? "]]" : "]";
  let quote;
  let escaped = false;

  for (let index = openingLength; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quote === "\"") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (trimmed.startsWith(closing, index)) {
      const tail = trimmed.slice(index + closing.length).trimStart();
      return {
        array,
        inner: trimmed.slice(openingLength, index),
        validTail: tail === "" || tail.startsWith("#"),
      };
    }
  }

  return {
    array,
    inner: trimmed.slice(openingLength),
    validTail: false,
  };
}

export function parseDottedHeaderKey(inner) {
  const segments = [];
  let index = 0;

  const skipWhitespace = () => {
    while (index < inner.length && /\s/.test(inner[index])) index += 1;
  };

  skipWhitespace();
  while (index < inner.length) {
    let token;
    const start = index;
    const quote = inner[index];

    if (quote === "\"" || quote === "'") {
      index += 1;
      let escaped = false;
      while (index < inner.length) {
        const character = inner[index];
        if (quote === "\"" && escaped) {
          escaped = false;
        } else if (quote === "\"" && character === "\\") {
          escaped = true;
        } else if (character === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      if (index - 1 <= start || inner[index - 1] !== quote) return undefined;
      token = inner.slice(start, index);
    } else {
      const match = inner.slice(index).match(/^[A-Za-z0-9_-]+/);
      if (!match) return undefined;
      token = match[0];
      index += token.length;
    }

    const segment =
      token.startsWith("\"") || token.startsWith("'")
        ? parseTomlString(token, "table header")
        : token;
    segments.push(segment);
    skipWhitespace();
    if (index === inner.length) return segments;
    if (inner[index] !== ".") return undefined;
    index += 1;
    skipWhitespace();
    if (index === inner.length) return undefined;
  }

  return undefined;
}

function looksLikeManagedOwner(inner) {
  const trimmed = inner.trimStart();
  const withoutOpeningQuote = /^["']/.test(trimmed)
    ? trimmed.slice(1)
    : trimmed;
  return ["plugins", "mcp_servers", "skills"].some(
    (owner) =>
      withoutOpeningQuote.startsWith(owner) &&
      (withoutOpeningQuote.length === owner.length ||
        !/[A-Za-z0-9_-]/.test(withoutOpeningQuote[owner.length])),
  );
}

function ambiguousManagedHeader() {
  throw new ConfigReconcileError("Ambiguous managed TOML table header", {
    code: "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  });
}

export function parseHeader(content) {
  const header = splitHeader(content);
  if (!header) return undefined;
  const managedShape = looksLikeManagedOwner(header.inner);
  if (!header.validTail) {
    if (managedShape) ambiguousManagedHeader();
    return { kind: "other" };
  }

  const segments = parseDottedHeaderKey(header.inner);
  if (!segments) {
    if (managedShape) ambiguousManagedHeader();
    return { kind: "other" };
  }

  const [owner, id] = segments;
  if (owner === "plugins") {
    if (header.array) ambiguousManagedHeader();
    if (segments.length === 2) {
      if (id === "") ambiguousManagedHeader();
      return { kind: "plugin", id };
    }
    return { kind: "other" };
  }
  if (owner === "mcp_servers") {
    if (header.array) ambiguousManagedHeader();
    if (segments.length === 2) {
      if (id === "") ambiguousManagedHeader();
      return { kind: "mcp", id };
    }
    return { kind: "other" };
  }
  if (owner === "skills") {
    if (header.array) {
      if (segments.length === 2 && id === "config") return { kind: "skill" };
      ambiguousManagedHeader();
    }
    return { kind: "other" };
  }

  return { kind: "other" };
}

// Single pass over a line: resolve multi-line string state and bracket balance
// together, counting brackets only outside strings/comments. Handles an opening
// line whose string body contains brackets, and close-then-reopen on one line.
function scanLine(content, mode) {
  let depth = 0;
  let state = mode;
  let index = 0;
  while (index < content.length) {
    if (state === "'''") {
      if (content[index] === "'") {
        let run = 0;
        while (content[index + run] === "'") run += 1;
        index += run;
        if (run >= 3) state = null;
      } else index += 1;
      continue;
    }
    if (state === "\"\"\"") {
      if (content[index] === "\\") { index += 2; continue; }
      if (content[index] === "\"") {
        let run = 0;
        while (content[index + run] === "\"") run += 1;
        index += run;
        if (run >= 3) state = null;
      } else index += 1;
      continue;
    }
    const character = content[index];
    if (character === "#") break;
    if (character === "\"") {
      if (content.startsWith("\"\"\"", index)) { state = "\"\"\""; index += 3; continue; }
      index += 1;
      while (index < content.length) {
        if (content[index] === "\\") index += 2;
        else if (content[index] === "\"") { index += 1; break; }
        else index += 1;
      }
      continue;
    }
    if (character === "'") {
      if (content.startsWith("'''", index)) { state = "'''"; index += 3; continue; }
      index += 1;
      while (index < content.length && content[index] !== "'") index += 1;
      if (index < content.length) index += 1;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]") depth -= 1;
    index += 1;
  }
  return { delta: depth, next: state };
}

export function parseDocument(source) {
  const lines = splitLines(source);
  const headers = [];
  const insideMultiline = [];
  const insideArray = [];
  let insideTable = false;
  let multiline = null;
  let arrayDepth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const content = lines[index].content;
    const wasInside = multiline !== null;
    insideMultiline[index] = wasInside;
    insideArray[index] = arrayDepth > 0;
    if (!wasInside && arrayDepth === 0) {
      const header = parseHeader(content);
      if (header) {
        insideTable = true;
        headers.push({ ...header, lineIndex: index });
      } else if (!insideTable && looksLikeManagedRootAssignment(content)) {
        throw new ConfigReconcileError(
          "Managed TOML owners must use supported table syntax",
          { code: "CONFIG_AMBIGUOUS_MANAGED_ASSIGNMENT" },
        );
      }
    }
    const scanned = scanLine(content, multiline);
    if (scanned.delta !== 0) arrayDepth = Math.max(0, arrayDepth + scanned.delta);
    multiline = scanned.next;
  }

  if (multiline !== null) {
    throw new ConfigReconcileError("Unterminated TOML multi-line string", {
      code: "CONFIG_UNTERMINATED_STRING",
    });
  }
  if (arrayDepth > 0) {
    throw new ConfigReconcileError("Unterminated TOML array", {
      code: "CONFIG_UNTERMINATED_ARRAY",
    });
  }

  const blocks = headers.map((header, index) => {
    const endLineIndex = headers[index + 1]?.lineIndex ?? lines.length;
    return {
      ...header,
      startLineIndex: header.lineIndex,
      endLineIndex,
      start: lines[header.lineIndex].start,
      end:
        endLineIndex < lines.length
          ? lines[endLineIndex].start
          : source.length,
    };
  });

  const eol = lines.find((line) => line.eol !== "")?.eol ?? "\n";
  return { source, lines, blocks, eol, insideMultiline, insideArray };
}

// Escape-aware search for a multi-line string's closer on a line.

// Bracket balance outside strings and comments; a table header line balances to
// zero, so only multi-line array bodies move the depth.

function looksLikeManagedRootAssignment(content) {
  const trimmed = content.trimStart();
  if (trimmed === "" || trimmed.startsWith("#")) return false;

  let quote;
  let escaped = false;
  let assignmentIndex = -1;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quote === "\"") {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (quote === "'") {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") return false;
    if (character === "=") {
      assignmentIndex = index;
      break;
    }
  }
  if (assignmentIndex === -1) return false;

  const keySource = trimmed.slice(0, assignmentIndex).trimEnd();
  const segments = parseDottedHeaderKey(keySource);
  // A parsed key decides ownership by its first segment; a fully-quoted single
  // key (`"plugins.x" = 1`) is a literal root key, not the managed table. Keep
  // fail-closed only for malformed keys that do not parse.
  if (segments) return ["plugins", "mcp_servers", "skills"].includes(segments[0]);
  return looksLikeManagedOwner(keySource);
}

export function parseAssignment(content) {
  if (content.trimStart().startsWith("#")) return undefined;
  const match = content.match(
    /^(\s*)((?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+)(?:\s*\.\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_-]+))*)(\s*=\s*)(.*)$/,
  );
  if (!match) return undefined;
  const keyToken = match[2];
  const segments = parseDottedHeaderKey(keyToken);
  if (!segments) return undefined;
  return {
    key: segments.join("."),
    prefix: `${match[1]}${keyToken}${match[3]}`,
    value: match[4],
  };
}

function parseAssignmentKey(content) {
  return parseAssignment(content)?.key;
}

export function directAssignments(document, block) {
  const assignments = new Map();

  for (
    let index = block.startLineIndex + 1;
    index < block.endLineIndex;
    index += 1
  ) {
    if (document.insideMultiline?.[index] || document.insideArray?.[index]) continue;
    const key = parseAssignmentKey(document.lines[index].content);
    if (key === undefined) continue;
    const entries = assignments.get(key) ?? [];
    entries.push(index);
    assignments.set(key, entries);
  }

  return assignments;
}
