// One owner for the repository's CLI argument grammar: boolean flags, single
// value flags with duplicate refusal, accumulating comma-list flags, and
// positionals. A caller supplies its flag maps, defaults, and failure function
// so each entrypoint keeps its own vocabulary and exit behavior.
export function parseCliArgs(argv, {
  booleans = {},
  values = {},
  lists = {},
  defaults = {},
  fail,
} = {}) {
  const positional = [];
  const options = { ...defaults };
  const seen = new Set();
  const reject = (message) => {
    if (typeof fail === "function") return fail(message);
    throw new Error(message);
  };
  const take = (index, flag) => {
    const value = argv[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) reject(`${flag} requires a value`);
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (Object.hasOwn(booleans, arg)) {
      options[booleans[arg]] = true;
      continue;
    }
    if (Object.hasOwn(values, arg)) {
      const key = values[arg];
      if (seen.has(key)) reject(`duplicate option: ${arg}`);
      seen.add(key);
      options[key] = take(index, arg);
      index += 1;
      continue;
    }
    if (Object.hasOwn(lists, arg)) {
      const key = lists[arg];
      options[key] = [
        ...(options[key] ?? []),
        ...take(index, arg).split(",").map((entry) => entry.trim()).filter(Boolean),
      ];
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) reject(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  return { options, positional };
}
