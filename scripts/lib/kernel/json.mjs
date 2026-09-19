import fs from "node:fs";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
