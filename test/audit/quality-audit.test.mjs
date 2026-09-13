import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditRepository } from "../../scripts/lib/audit/quality-audit.mjs";

const withRepo = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-audit-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, content);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("the repository itself passes the quality audit", () => {
  assert.deepEqual(auditRepository(process.cwd()).errors, []);
});

test("the audit wrapper exits clean on the repository", () => {
  const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "quality-audit.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quality audit clean/);
});

test("the audit catches a cross-file call that is never imported", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": "export function helper() {\n  return 1;\n}\n",
      "scripts/lib/b.mjs": "helper();\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(
        errors.some((message) => message.includes("b.mjs: calls helper() but never imports it")),
        JSON.stringify(errors),
      );
    },
  );
});

test("the audit flags smells, unused lib files, and duplicate bodies", () => {
  const duplicateBody = [
    "export function dup(a, b, c) {",
    "  const first = a + b + c;",
    "  const second = first * c - a;",
    "  const third = second + first - b;",
    "  const fourth = third * a + second;",
    "  return fourth - third + second - first + c;",
    "}",
  ].join("\n");
  withRepo(
    {
      "scripts/lib/noisy.mjs": "export function noisy() {\n  console.log(\"x\");\n  return 1;\n}\n",
      "scripts/lib/todo.mjs": "// TODO: finish\nexport const done = 1;\n",
      "scripts/lib/lonely.mjs": "export function lonely() {\n  return 1;\n}\n",
      "scripts/lib/one.mjs": duplicateBody,
      "scripts/lib/two.mjs": duplicateBody,
    },
    (root) => {
      const { errors, info } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("noisy.mjs: smell console.log")), JSON.stringify(errors));
      assert.ok(errors.some((message) => message.includes("todo.mjs: smell TODO")), JSON.stringify(errors));
      assert.ok(errors.some((message) => message.includes("lonely.mjs: lib file is never imported")), JSON.stringify(errors));
      assert.ok(info.some((message) => message.includes("duplicate function body")), JSON.stringify(info));
    },
  );
});

test("the audit catches a dead re-export", () => {
  withRepo(
    {
      "scripts/lib/origin.mjs": "export const a = 1;\nexport const b = 2;\n",
      "scripts/lib/barrel.mjs": 'export { a } from "./origin.mjs";\n',
      "scripts/lib/consumer.mjs": 'import { b } from "./origin.mjs";\nexport const c = b;\n',
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("barrel.mjs: dead re-export a")), JSON.stringify(errors));
    },
  );
});

test("the audit catches a dead export and an unreferenced function", () => {
  withRepo(
    {
      "scripts/lib/orphans.mjs": "export function orphan() {\n  return 1;\n}\n\nfunction zombie() {\n  return 2;\n}\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("dead export orphan")), JSON.stringify(errors));
      assert.ok(errors.some((message) => message.includes("unreferenced function zombie")), JSON.stringify(errors));
    },
  );
});

test("a string or comment mention does not suppress the unreferenced-function check", () => {
  withRepo(
    {
      "scripts/lib/orphans.mjs": "export const note = \"zombie is only mentioned here\";\n// zombie is also mentioned here\nfunction zombie() {\n  return 2;\n}\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("unreferenced function zombie")), JSON.stringify(errors));
    },
  );
});

test("the audit flags a credential and an environment dump in a skill", () => {
  withRepo(
    {
      "skills/x/SKILL.md": "key: AKIAIOSFODNN7EXAMPLE\n",
      "skills/x/scripts/run.mjs": "console.log(process.env);\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("possible credential (AWS access key id)")), JSON.stringify(errors));
      assert.ok(errors.some((message) => message.includes("dumps environment variables")), JSON.stringify(errors));
    },
  );
});

test("the audit scans the generated export and only script env dumps", () => {
  withRepo(
    {
      ".agents/skills/upstream/SKILL.md": "key -----BEGIN RSA PRIVATE KEY-----\n",
      ".agents/skills/upstream/scripts/run.mjs": "console.log(process.env);\n",
      "skills/doc/SKILL.md": "Run `printenv` or `env | sort` to inspect.\n",
      "skills/key/SKILL.md": "OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((e) => e.includes("possible credential (private key block)")), JSON.stringify(errors));
      assert.ok(errors.some((e) => e.includes("possible credential (vendor API key)")), JSON.stringify(errors));
      assert.ok(errors.some((e) => e.includes("dumps environment variables")), JSON.stringify(errors));
      assert.ok(!errors.some((e) => e.startsWith("skills/doc/SKILL.md:")), JSON.stringify(errors));
    },
  );
});

test("a comment mention does not count as a consumer of an export", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": "export function orphan() { return 1; }\nexport function used() { return 2; }\n",
      "scripts/lib/b.mjs": "import { used } from \"./a.mjs\";\n// orphan was removed here\nexport const v = used();\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("dead export orphan")), JSON.stringify(errors));
      assert.ok(!errors.some((message) => message.includes("dead export used")), JSON.stringify(errors));
    },
  );
});

test("dynamic imports and re-export chains count as consumers", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": "export function orphan() { return 1; }\n",
      "scripts/lib/b.mjs": "export const v = (await import(\"./a.mjs\")).orphan();\n",
      "scripts/lib/barrel.mjs": "export { orphan } from \"./a.mjs\";\n",
      "scripts/lib/chain.mjs": "export { orphan } from \"./barrel.mjs\";\n",
      "scripts/lib/final.mjs": "import { orphan } from \"./chain.mjs\";\nexport const w = orphan;\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(!errors.some((e) => e.includes("dead export orphan")), JSON.stringify(errors));
      assert.ok(!errors.some((e) => e.includes("dead re-export orphan")), JSON.stringify(errors));
    },
  );
});

test("a const token inside a string does not mask a missing import", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": 'const note = "const leaky";\nexport function run() {\n  return leaky();\n}\nexport const n = note;\n',
      "scripts/lib/b.mjs": "export function leaky() {\n  return 1;\n}\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("calls leaky() but never imports it")), JSON.stringify(errors));
    },
  );
});

test("an import phrase inside a string does not inject a phantom local", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": "export function leaky() {\n  return 1;\n}\n",
      "scripts/lib/b.mjs": 'const note = \'import leaky from "./a.mjs"\';\nexport function run() {\n  return leaky();\n}\nexport const n = note;\n',
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("calls leaky() but never imports it")), JSON.stringify(errors));
    },
  );
});

test("an import phrase inside a multi-line template does not inject a phantom local", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": "export function phantom() {\n  return 1;\n}\n",
      "scripts/lib/b.mjs": 'const t = `\nimport phantom from "./nowhere.mjs"\n`;\nexport function run() {\n  return phantom();\n}\nexport const x = t;\n',
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("calls phantom() but never imports it")), JSON.stringify(errors));
    },
  );
});

test("a backtick inside a string does not desync template masking", () => {
  withRepo(
    {
      "scripts/lib/real.mjs": "export function used() {\n  return 1;\n}\n",
      "scripts/lib/fence.mjs": 'const fence = "```";\nimport { used } from "./lib/real.mjs";\nused();\nconst doc = `# hi`;\nexport const f = fence;\n',
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(!errors.some((m) => m.includes("calls used() but never imports it")), JSON.stringify(errors));
      assert.ok(!errors.some((m) => m.includes("dead export used")), JSON.stringify(errors));
    },
  );
});
