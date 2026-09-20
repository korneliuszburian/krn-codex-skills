import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

test("the card follows the project block conventions", () => {
  const html = readFileSync("index.html", "utf8");
  assert.doesNotMatch(html, /style="/, "no inline styles are allowed");
  assert.match(html, /class="[^"]*\bcard\b/, "the card block class must be present");
  const css = readdirSync(".")
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  assert.match(css, /\.card\b/, "the card block must own a .card rule");
  assert.match(css, /var\(--/, "the block must use a custom-property knob");
});
