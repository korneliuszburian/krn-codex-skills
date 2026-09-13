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
