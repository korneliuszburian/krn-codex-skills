function unescapeTapName(name) {
  return name.replace(/\\([#\\])/g, "$1");
}

export function tapName(line) {
  const ok = /^\s*ok \d+ - (.+?)\s*$/.exec(line);
  if (ok) return { pass: true, name: unescapeTapName(ok[1].trim()) };
  const notOk = /^\s*not ok \d+ - (.+?)\s*$/.exec(line);
  if (notOk) return { pass: false, name: unescapeTapName(notOk[1].trim()) };
  return null;
}

export function tapSummary(output) {
  const text = output ?? "";
  const tests = Number((/^# tests (\d+)\s*$/m.exec(text)?.[1] ?? "0"));
  const fail = Number((/^#\s*fail[^0-9]*(\d+)\s*$/m.exec(text)?.[1] ?? "0"));
  const passing = [];
  const failing = [];
  for (const line of text.split("\n")) {
    const t = tapName(line);
    if (!t) continue;
    if (t.pass) passing.push(t.name);
    else if (!/\.(mjs|js|cjs|ts)$/.test(t.name)) failing.push(t.name);
  }
  const setup = /ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module|Could not find|MODULE_NOT_FOUND/.test(text);
  return { tests, fail, passing, failing, setup };
}
