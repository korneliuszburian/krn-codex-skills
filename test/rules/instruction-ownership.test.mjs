import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OWNER = "config/AGENTS.md";
const CAPSULE_PATH = ".krn/runs/delivery-loop/<outcome-id>/state.md";
const SOLE_WRITER = "$delivery-loop";
const READER_COMMANDS = ["state check", "state resume"];
const REFERENCE = "skills/engineering/setup-repository-workflow/references/repository-contract.md";
const POINTER_SURFACES = [
  "CONTEXT.md",
  "README.md",
  "skills/engineering/setup-repository-workflow/SKILL.md",
  REFERENCE,
];

function readSurface(relative) {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function ownerFindings(ownerText) {
  const findings = [];
  const pathCount = ownerText.split(CAPSULE_PATH).length - 1;
  if (pathCount !== 1) findings.push(`${OWNER}: capsule path must be stated exactly once (found ${pathCount})`);
  if (!ownerText.includes(SOLE_WRITER)) findings.push(`${OWNER}: capsule sole writer ${SOLE_WRITER} is not named`);
  for (const command of READER_COMMANDS) {
    if (!ownerText.includes(command)) findings.push(`${OWNER}: reader command "${command}" is not named`);
  }
  return findings;
}

function restatementFindings(surfaces) {
  return surfaces
    .filter((surface) => surface.text.includes(CAPSULE_PATH))
    .map((surface) => `${surface.name}: restates the capsule path instead of pointing at ${OWNER}`);
}

function pointerFindings(surfaces) {
  return surfaces
    .filter((surface) => /capsule/i.test(surface.text) && !surface.text.includes(OWNER))
    .map((surface) => `${surface.name}: discusses the capsule without pointing at ${OWNER}`);
}

function conflictFindings(surfaces) {
  const findings = [];
  for (const surface of surfaces) {
    if (!surface.text.includes(CAPSULE_PATH)) continue;
    if (!surface.text.includes(SOLE_WRITER)) {
      findings.push(`${surface.name}: restates the capsule path with a different or missing sole writer`);
    }
    for (const command of READER_COMMANDS) {
      if (!surface.text.includes(command)) {
        findings.push(`${surface.name}: restates the capsule path with a different or missing command pair`);
      }
    }
  }
  return findings;
}

function surfaceOwnershipSection(ownerText) {
  const header = "## Surface ownership";
  const start = ownerText.indexOf(header);
  if (start === -1) return "";
  const rest = ownerText.slice(start + header.length);
  const end = rest.indexOf("\n## ");
  return end === -1 ? rest : rest.slice(0, end);
}

function configSurfaceKeys(ownerText) {
  const keys = [];
  for (const line of surfaceOwnershipSection(ownerText).split("\n")) {
    if (!/^-\s+/.test(line)) continue;
    for (const segment of line.replace(/^-\s+/, "").split(";")) {
      const colon = segment.indexOf(":");
      if (colon === -1) continue;
      keys.push(segment.slice(0, colon).trim());
    }
  }
  return keys;
}

function tableSurfaceKeys(referenceText) {
  const keys = [];
  for (const line of referenceText.split("\n")) {
    if (!/^\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 3) continue;
    if (/^:?-+:?$/.test(cells[0])) continue;
    if (/^surface$/i.test(cells[0])) continue;
    keys.push(cells[0]);
  }
  return keys;
}

function surfaceTokens(value) {
  return value
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && token !== "or");
}

function sameSurface(left, right) {
  const a = surfaceTokens(left);
  const b = surfaceTokens(right);
  if (a.length === 0 || b.length === 0) return false;
  if (a.join(" ") === b.join(" ")) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length === 1 && long.includes(short[0]);
}

function duplicationFindings(ownerText, referenceText) {
  const ownerKeys = configSurfaceKeys(ownerText);
  const findings = [];
  for (const tableKey of tableSurfaceKeys(referenceText)) {
    for (const ownerKey of ownerKeys) {
      if (sameSurface(tableKey, ownerKey)) {
        findings.push(`${REFERENCE}: surface row "${tableKey}" duplicates ${OWNER} row "${ownerKey}"`);
      }
    }
  }
  return findings;
}

function pointerSurfaces() {
  return POINTER_SURFACES.map((name) => ({ name, text: readSurface(name) }));
}

test("config/AGENTS.md is the single owner of the capsule contract", () => {
  assert.deepEqual(ownerFindings(readSurface(OWNER)), []);
});

test("no pointer surface restates the capsule path", () => {
  assert.deepEqual(restatementFindings(pointerSurfaces()), []);
});

test("a pointer surface that discusses the capsule points at the owner", () => {
  assert.deepEqual(pointerFindings(pointerSurfaces()), []);
});

test("a restated capsule path with a different owner or command pair is rejected", () => {
  const surfaces = [
    { name: "bad-owner.md", text: `capsule at ${CAPSULE_PATH}, sole writer $other-skill, state check, state resume` },
    { name: "bad-command.md", text: `capsule at ${CAPSULE_PATH}, sole writer ${SOLE_WRITER}, state status, state compile` },
    { name: "good-owner.md", text: `capsule at ${CAPSULE_PATH}, sole writer ${SOLE_WRITER}, state check, state resume` },
    { name: "pointer.md", text: `the capsule contract lives in ${OWNER}` },
  ];
  const findings = conflictFindings(surfaces);
  assert.ok(findings.some((finding) => finding.includes("bad-owner.md")), JSON.stringify(findings));
  assert.ok(findings.some((finding) => finding.includes("bad-command.md")), JSON.stringify(findings));
  assert.ok(!findings.some((finding) => finding.includes("good-owner.md")), JSON.stringify(findings));
  assert.ok(!findings.some((finding) => finding.includes("pointer.md")), JSON.stringify(findings));
  assert.deepEqual(restatementFindings([{ name: "pointer.md", text: `the capsule contract lives in ${OWNER}` }]), []);
});

test("the repository contract table does not duplicate config/AGENTS.md rows", () => {
  assert.deepEqual(duplicationFindings(readSurface(OWNER), readSurface(REFERENCE)), []);
});

test("the onboarding owner scopes workflows through the repository contract", () => {
  const skill = readSurface("skills/engineering/setup-repository-workflow/SKILL.md");
  assert.match(
    skill,
    /repository contract[^.]*is the one owner of which workflows/,
    "the onboarding skill must scope workflow ownership through the repository contract",
  );
  assert.match(
    skill,
    /source material selected by origin/,
    "the upstream set must be named as source material, not KRN-owned procedure",
  );
});
