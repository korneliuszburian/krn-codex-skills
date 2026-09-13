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

export function parseTomlString(token, target) {
  if (token.startsWith("'")) return token.slice(1, -1);
  try {
    return JSON.parse(token);
  } catch (error) {
    throw new ConfigReconcileError(`Invalid TOML string for ${target}`, {
      cause: error,
      target,
    });
  }
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
      if (inner[index - 1] !== quote) return undefined;
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
    if (!header.array && segments.length === 2) {
      if (id === "") ambiguousManagedHeader();
      return { kind: "plugin", id };
    }
    ambiguousManagedHeader();
  }
  if (owner === "mcp_servers") {
    if (!header.array && segments.length === 2) {
      if (id === "") ambiguousManagedHeader();
      return { kind: "mcp", id };
    }
    if (!header.array && segments.length > 2) return { kind: "other" };
    ambiguousManagedHeader();
  }
  if (owner === "skills") {
    if (header.array && segments.length === 2 && id === "config") {
      return { kind: "skill" };
    }
    ambiguousManagedHeader();
  }

  return { kind: "other" };
}

function advanceMultilineState(content, mode) {
  let index = 0;
  let current = mode;
  while (index < content.length) {
    if (current === "'''") {
      const close = content.indexOf("'''", index);
      if (close === -1) return current;
      index = close + 3;
      current = null;
      continue;
    }
    if (current === "\"\"\"") {
      if (content[index] === "\\") index += 2;
      else if (content.startsWith("\"\"\"", index)) { index += 3; current = null; }
      else index += 1;
      continue;
    }
    const character = content[index];
    if (character === "#") return null;
    if (character === "\"") {
      if (content.startsWith("\"\"\"", index)) { current = "\"\"\""; index += 3; continue; }
      index += 1;
      while (index < content.length) {
        if (content[index] === "\\") index += 2;
        else if (content[index] === "\"") { index += 1; break; }
        else index += 1;
      }
      continue;
    }
    if (character === "'") {
      if (content.startsWith("'''", index)) { current = "'''"; index += 3; continue; }
      index += 1;
      while (index < content.length && content[index] !== "'") index += 1;
      if (index < content.length) index += 1;
      continue;
    }
    index += 1;
  }
  return current;
}

export function parseDocument(source) {
  const lines = splitLines(source);
  const headers = [];
  let insideTable = false;
  let multiline = null;

  for (let index = 0; index < lines.length; index += 1) {
    const content = lines[index].content;
    if (multiline === null) {
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
    multiline = advanceMultilineState(content, multiline);
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
  return { source, lines, blocks, eol };
}

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
  if (segments && ["plugins", "mcp_servers", "skills"].includes(segments[0])) {
    return true;
  }
  return looksLikeManagedOwner(keySource);
}

export function parseAssignment(content) {
  if (content.trimStart().startsWith("#")) return undefined;
  const match = content.match(
    /^(\s*)((?:"(?:[^"\\]|\\.)*")|(?:'[^']*')|(?:[^\s=]+))(\s*=\s*)(.*)$/,
  );
  if (!match) return undefined;
  const keyToken = match[2];
  const key = keyToken.startsWith("\"") || keyToken.startsWith("'")
    ? parseTomlString(keyToken, "assignment key")
    : keyToken;
  return {
    key,
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
    const key = parseAssignmentKey(document.lines[index].content);
    if (key === undefined) continue;
    const entries = assignments.get(key) ?? [];
    entries.push(index);
    assignments.set(key, entries);
  }

  return assignments;
}
