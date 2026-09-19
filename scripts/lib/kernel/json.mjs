import fs from "node:fs";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function readJsonSafe(file) {
  try {
    return readJson(file);
  } catch {
    return undefined;
  }
}

export function readJsonStrict(file) {
  const text = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
}
