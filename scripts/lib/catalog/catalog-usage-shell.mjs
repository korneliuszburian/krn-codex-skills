import path from "node:path";

const READ_COMMANDS = new Set([
  "awk",
  "bat",
  "batcat",
  "cat",
  "grep",
  "head",
  "less",
  "more",
  "rg",
  "sed",
  "tail",
]);

function stripHeredocBodies(text) {
  const lines = text.split("\n");
  const out = [];
  let delimiter = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) delimiter = null;
      out.push("");
      continue;
    }
    const match = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (match) delimiter = match[2];
    out.push(line);
  }
  return out.join("\n");
}

function shellCommands(rawSource) {
  const source = stripHeredocBodies(rawSource);
  const commands = [];
  let tokens = [];
  let token = "";
  let tokenStarted = false;
  let quote = null;
  let escaped = false;

  const finishToken = () => {
    if (tokenStarted) {
      tokens.push(token);
      token = "";
      tokenStarted = false;
    }
  };
  const finishCommand = () => {
    finishToken();
    if (tokens.length > 0) {
      commands.push(tokens);
      tokens = [];
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      token += character;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if (character === "\\") escaped = true;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      tokenStarted = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
    } else if (/\s/.test(character)) {
      finishToken();
      if (character === "\n") finishCommand();
    } else if (character === ";" || character === "|" || character === "&") {
      finishCommand();
      if (source[index + 1] === character) index += 1;
    } else if (character === "#" && !tokenStarted) {
      while (index + 1 < source.length && source[index + 1] !== "\n") index += 1;
    } else {
      token += character;
      tokenStarted = true;
    }
  }

  if (quote !== null || escaped) {
    return [];
  }
  finishCommand();
  return commands;
}

function executableIndex(tokens) {
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  if (path.basename(tokens[index] ?? "") === "rtk") {
    index += 1;
    if (tokens[index] === "proxy") index += 1;
  }
  if (path.basename(tokens[index] ?? "") === "command") index += 1;
  return index;
}

export function normalizeCommandPath(candidate, workdir) {
  if (path.isAbsolute(candidate)) return path.normalize(candidate);
  if (typeof workdir === "string" && path.isAbsolute(workdir)) return path.resolve(workdir, candidate);
  return null;
}

export function observedSkillsInShell(command, workdir, allowedSkills, confidence, depth = 0) {
  const observed = new Map();
  if (depth > 2) return observed;

  for (const tokens of shellCommands(command)) {
    const commandIndex = executableIndex(tokens);
    const executable = path.basename(tokens[commandIndex] ?? "");

    if (executable === "bash" || executable === "sh" || executable === "zsh") {
      const optionIndex = tokens.findIndex((token, index) => index > commandIndex && /^-[A-Za-z]*c[A-Za-z]*$/.test(token));
      if (optionIndex !== -1 && typeof tokens[optionIndex + 1] === "string") {
        const nested = observedSkillsInShell(tokens[optionIndex + 1], workdir, allowedSkills, confidence, depth + 1);
        for (const [id, nestedConfidence] of nested) observed.set(id, nestedConfidence);
      }
      continue;
    }

    if (!READ_COMMANDS.has(executable)) continue;
    for (const candidate of tokens.slice(commandIndex + 1)) {
      const normalized = normalizeCommandPath(candidate, workdir);
      const id = normalized === null ? undefined : allowedSkills.get(normalized);
      if (id !== undefined) observed.set(id, confidence);
    }
  }
  return observed;
}
