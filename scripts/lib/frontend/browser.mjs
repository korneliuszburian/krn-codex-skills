import { execFile, spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { sha256Hex } from "../kernel/digest.mjs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MEASUREMENTS = `(() => {
  const out = { viewport: { width: window.innerWidth, height: window.innerHeight } };
  const root = document.documentElement;
  out.overflowX = Math.max(0, root.scrollWidth - window.innerWidth);
  const describe = (element) => {
    const tag = element.tagName.toLowerCase();
    const classes = [...element.classList].slice(0, 2).join(".");
    return classes ? tag + "." + classes : tag;
  };
  const floors = [];
  const small = [];
  const grids = {};
  const contrast = [];
  const luminance = (rgb) => {
    const [r, g, b] = rgb.map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const parse = (value) => {
    const match = value && value.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3] : 1 };
  };
  const background = (element) => {
    for (let node = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color && color.alpha > 0.5) return color.rgb;
    }
    return [255, 255, 255];
  };
  for (const element of document.querySelectorAll("body *")) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const floor = style.minHeight !== "auto" ? style.minHeight : style.minBlockSize;
    if (floor && !/^(0|0px|auto)$/.test(floor) && rect.height > 0) floors.push(describe(element) + ":" + floor);
    const interactive = element.matches("a[href], button, input, select, summary, textarea, [role=button]");
    if (interactive && rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24)) {
      small.push(describe(element) + ":" + Math.round(rect.width) + "x" + Math.round(rect.height));
    }
    if (style.display === "grid" && rect.width > 0) {
      const tracks = style.gridTemplateColumns.split(" ").filter((track) => track && track !== "none");
      if (tracks.length > 1) grids[describe(element)] = tracks.length;
    }
    if (element.textContent && element.textContent.trim().length > 0 && [...element.children].length === 0) {
      const foreground = parse(style.color);
      if (foreground && foreground.alpha > 0.5) {
        const lighter = Math.max(luminance(foreground.rgb), luminance(background(element)));
        const darker = Math.min(luminance(foreground.rgb), luminance(background(element)));
        const ratio = (lighter + 0.05) / (darker + 0.05);
        const size = parseFloat(style.fontSize);
        const large = size >= 24 || (size >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
        const minimum = large ? 3 : 4.5;
        if (ratio < minimum) contrast.push(describe(element) + ":" + ratio.toFixed(2));
      }
    }
  }
  const spills = [];
  for (const element of document.querySelectorAll("body *")) {
    const style = getComputedStyle(element);
    if (style.overflow !== "visible") continue;
    const overflowX = element.scrollWidth - element.clientWidth;
    const overflowY = element.scrollHeight - element.clientHeight;
    if (overflowX > 6 || overflowY > 6) {
      spills.push(describe(element) + ":+" + Math.max(0, overflowX) + "x" + Math.max(0, overflowY));
    }
  }
  out.spills = spills.slice(0, 20);
  out.heightFloors = floors;
  out.smallTargets = small;
  out.gridTracks = grids;
  out.contrastOffenders = contrast;
  return out;
})()`;

export function measurementEval(extra) {
  if (!extra || !extra.trim()) return MEASUREMENTS;
  return `(() => { const out = ${MEASUREMENTS}; ${extra}\nreturn out; })()`;
}

const artifactsFile = (outputDirectory) => path.join(outputDirectory, "manifest.json");
const signatureFile = (outputDirectory) => path.join(outputDirectory, "signature.json");

async function readConfig(configFile) {
  const configPath = path.resolve(configFile);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const root = path.resolve(path.dirname(configPath), config.workspaceRoot ?? ".");
  const outputDirectory = path.resolve(root, config.outputDir ?? ".artifacts");
  if (typeof config.url !== "string" || config.url.length === 0) throw new Error("browser evidence config requires a non-empty url");
  if (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.includes(new URL(config.url).origin)) {
    throw new Error(`browser evidence target origin is not allowed: ${new URL(config.url).origin}`);
  }
  const viewport = config.viewport;
  if (!Number.isInteger(viewport?.width) || viewport.width < 1 || !Number.isInteger(viewport?.height) || viewport.height < 1) {
    throw new Error("browser evidence config requires a positive integer viewport");
  }
  if (!Array.isArray(config.evidence?.required) || config.evidence.required.length === 0) throw new Error("browser evidence config requires evidence.required");
  const actions = config.actions ?? (config.action === undefined ? [] : [config.action]);
  if (!Array.isArray(actions) || actions.some((action) => action?.kind !== "click" || typeof action.text !== "string")) {
    throw new Error("browser evidence actions must be click actions with text");
  }
  return { config, root, outputDirectory, actions };
}

const runTool = async (root, session, args) => {
  const result = await execFileAsync("playwright-cli", ["-s", session, ...args], { cwd: root, env: process.env, maxBuffer: 8 * 1024 * 1024 });
  return result.stdout;
};

const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function inventory(directory, prefix = "") {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`build output may not contain symlink: ${relative}`);
    if (entry.isDirectory()) entries.push(...await inventory(path.join(directory, entry.name), relative));
    else if (entry.isFile()) {
      const data = await readFile(path.join(directory, entry.name));
      entries.push({ path: relative.split(path.sep).join("/"), bytes: data.byteLength, sha256: sha256Hex(data) });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export async function captureEvidence({ configFile, run = runTool }) {
  const { config, root, outputDirectory, actions } = await readConfig(configFile);
  const session = `${config.sessionPrefix ?? "krn-frontend"}-${process.pid}`;
  if (typeof config.runtimeEval !== "string" && typeof config.runtimeExtra !== "string") {
    throw new Error("browser evidence config requires runtimeEval or runtimeExtra");
  }
  const runtimeEval = typeof config.runtimeEval === "string" ? config.runtimeEval : measurementEval(config.runtimeExtra);
  await mkdir(outputDirectory, { recursive: true });
  const saved = async (name, args) => {
    const stdout = await run(root, session, args);
    await writeFile(path.join(outputDirectory, name), stdout, "utf8");
    return stdout;
  };
  const artifact = (name) => path.join(outputDirectory, name);
  let buildManifest;
  if (config.build !== undefined) {
    if (typeof config.build.command !== "string" || !Array.isArray(config.build.args) || typeof config.build.outputRoot !== "string") {
      throw new Error("browser evidence build config requires command, args and outputRoot");
    }
    const result = await execFileAsync(config.build.command, config.build.args, { cwd: path.resolve(root, config.build.cwd ?? "."), env: process.env, maxBuffer: 8 * 1024 * 1024 });
    await writeFile(path.join(outputDirectory, "build-output.txt"), `${result.stdout}${result.stderr}`, "utf8");
    const outputRoot = path.resolve(root, config.build.outputRoot);
    const relativeOutputRoot = path.relative(root, outputRoot);
    if (relativeOutputRoot.startsWith("..") || path.isAbsolute(relativeOutputRoot)) throw new Error("build outputRoot must stay inside workspaceRoot");
    buildManifest = { command: [config.build.command, ...config.build.args], outputRoot: relativeOutputRoot.split(path.sep).join("/"), files: await inventory(outputRoot) };
  }
  let runtimeProcess;
  if (config.runtime !== undefined) {
    if (typeof config.runtime.command !== "string" || !Array.isArray(config.runtime.args) || typeof config.runtime.readyUrl !== "string") {
      throw new Error("browser evidence runtime config requires command, args and readyUrl");
    }
    runtimeProcess = spawn(config.runtime.command, config.runtime.args, { cwd: path.resolve(root, config.runtime.cwd ?? "."), env: process.env, stdio: "ignore" });
    const timeoutMs = Number.isInteger(config.runtime.timeoutMs) && config.runtime.timeoutMs > 0 ? config.runtime.timeoutMs : 10000;
    const deadline = Date.now() + timeoutMs;
    let ready = false;
    while (Date.now() < deadline) {
      try {
        if ((await fetch(config.runtime.readyUrl)).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) {
      runtimeProcess.kill("SIGTERM");
      throw new Error(`runtime did not become ready: ${config.runtime.readyUrl}`);
    }
  }
  let opened = false;
  const interactions = [];
  try {
    await saved("open.txt", ["open", config.url]);
    opened = true;
    await saved("viewport.txt", ["resize", String(config.viewport.width), String(config.viewport.height)]);
    await saved("before-output.txt", ["snapshot", `--filename=${artifact("before.yml")}`]);
    await saved("before-output-screenshot.txt", ["screenshot", `--filename=${artifact("before.png")}`]);
    for (const [index, action] of actions.entries()) {
      const role = action.role ?? "button";
      const label = String(index + 1).padStart(2, "0");
      const findOutput = await saved(`find-${label}.txt`, ["find", action.text]);
      const ref = findOutput.match(new RegExp(`${escaped(role)} "${escaped(action.text)}"[^\\n]*\\[ref=(e\\d+)\\]`))?.[1];
      if (ref === undefined) throw new Error(`browser action target not found: ${role} ${action.text}`);
      await saved(`interaction-${label}.txt`, ["click", ref]);
      interactions.push({ action: action.kind, role, text: action.text, ref });
    }
    await saved("runtime.json", ["--raw", "eval", runtimeEval]);
    await saved("after-output.txt", ["snapshot", `--filename=${artifact("after.yml")}`]);
    await saved("after-output-screenshot.txt", ["screenshot", `--filename=${artifact("after.png")}`]);
    await saved("console.json", ["--json", "console"]);
    await saved("requests.json", ["--json", "requests"]);
  } finally {
    if (opened) await saved("close.txt", ["close"]);
    if (runtimeProcess !== undefined) {
      runtimeProcess.kill("SIGTERM");
      await Promise.race([once(runtimeProcess, "close"), new Promise((resolve) => setTimeout(resolve, 1000))]);
    }
    const cleanup = await execFileAsync("playwright-cli", ["list", "--json"], { cwd: root, env: process.env });
    await writeFile(path.join(outputDirectory, "cleanup.json"), cleanup.stdout, "utf8");
  }
  const names = ["open.txt", "viewport.txt", "before-output.txt", "before-output-screenshot.txt", "before.yml", "before.png",
    ...interactions.flatMap((_, index) => [`find-${String(index + 1).padStart(2, "0")}.txt`, `interaction-${String(index + 1).padStart(2, "0")}.txt`]),
    "after-output.txt", "after-output-screenshot.txt", "after.yml", "after.png", "runtime.json", "console.json", "requests.json", "close.txt", "cleanup.json",
    ...(buildManifest === undefined ? [] : ["build-output.txt"])];
  const artifacts = [];
  for (const name of names) {
    const data = await readFile(path.join(outputDirectory, name));
    artifacts.push({ path: name, bytes: data.byteLength, sha256: sha256Hex(data) });
  }
  const runtimeValue = JSON.parse(await readFile(path.join(outputDirectory, "runtime.json"), "utf8"));
  const measurements = typeof runtimeValue === "string" ? JSON.parse(runtimeValue) : runtimeValue;
  const manifest = {
    schema: "krn.frontend.browser-evidence.v1",
    provider: "playwright-cli",
    session,
    target: config.url,
    targetOrigin: new URL(config.url).origin,
    viewport: config.viewport,
    evidence: { required: config.evidence.required },
    measurements,
    ...(buildManifest === undefined ? {} : { build: buildManifest }),
    ...(config.runtime === undefined ? {} : { runtime: { command: [config.runtime.command, ...config.runtime.args], readyUrl: config.runtime.readyUrl } }),
    interactions,
    artifacts,
  };
  await writeFile(artifactsFile(outputDirectory), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function approveEvidence({ configFile, by, note }) {
  const { root, outputDirectory, config } = await readConfig(configFile);
  if (typeof by !== "string" || by.trim() === "") throw new Error("approval requires --by <name>");
  if (typeof note !== "string" || note.trim() === "") throw new Error("approval requires --note <why>");
  const failures = await gateFailures({ config, root, outputDirectory, requireSignature: false });
  if (failures.length > 0) throw new Error(`refusing to approve: ${failures.join("; ")}`);
  const manifest = await readFile(artifactsFile(outputDirectory));
  const signature = {
    schema: "krn.frontend.browser-signature.v1",
    manifest: sha256Hex(manifest),
    by: by.trim(),
    at: new Date().toISOString(),
    note: note.trim(),
  };
  await writeFile(signatureFile(outputDirectory), `${JSON.stringify(signature, null, 2)}\n`, "utf8");
  return signature;
}

async function gateFailures({ config, root, outputDirectory, requireSignature = true }) {
  const failures = [];
  let manifest;
  try {
    manifest = JSON.parse(await readFile(artifactsFile(outputDirectory), "utf8"));
  } catch {
    return ["manifest.json: missing or unreadable"];
  }
  if (manifest.targetOrigin !== new URL(config.url).origin || !config.allowedOrigins?.includes(manifest.targetOrigin)) failures.push("target: origin is not allowed");
  if (manifest.viewport?.width !== config.viewport?.width || manifest.viewport?.height !== config.viewport?.height) failures.push("viewport: manifest does not match config");
  if (JSON.stringify(manifest.evidence?.required) !== JSON.stringify(config.evidence?.required)) failures.push("evidence: manifest policy does not match config");
  const actions = (config.actions ?? (config.action === undefined ? [] : [config.action])).map(({ kind, role = "button", text }) => ({ action: kind, role, text }));
  if (JSON.stringify(manifest.interactions?.map(({ action, role, text }) => ({ action, role, text })) ?? []) !== JSON.stringify(actions)) {
    failures.push("interaction: manifest does not match config");
  }
  for (const artifact of manifest.artifacts ?? []) {
    try {
      const data = await readFile(path.join(outputDirectory, artifact.path));
      if (data.byteLength !== artifact.bytes || sha256Hex(data) !== artifact.sha256) failures.push(`${artifact.path}: digest or byte count mismatch`);
    } catch {
      failures.push(`${artifact.path}: missing`);
    }
  }
  for (const file of manifest.build?.files ?? []) {
    try {
      const data = await readFile(path.join(root, manifest.build.outputRoot, file.path));
      if (data.byteLength !== file.bytes || sha256Hex(data) !== file.sha256) failures.push(`build/${file.path}: digest or byte count mismatch`);
    } catch {
      failures.push(`build/${file.path}: missing`);
    }
  }
  for (const [key, expected] of Object.entries(config.expectations ?? { overflowX: 0 })) {
    const actual = manifest.measurements?.[key];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      failures.push(`measurement ${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
  try {
    const cleanup = JSON.parse(await readFile(path.join(outputDirectory, "cleanup.json"), "utf8"));
    if (!Array.isArray(cleanup.browsers) || cleanup.browsers.some((browser) => browser.name === manifest.session)) failures.push("cleanup: session is still open");
  } catch {
    failures.push("cleanup.json: missing or unreadable");
  }
  if (requireSignature) {
    try {
      const signature = JSON.parse(await readFile(signatureFile(outputDirectory), "utf8"));
      const current = sha256Hex(await readFile(artifactsFile(outputDirectory)));
      if (signature.manifest !== current) failures.push("signature: manifest changed after approval");
      if (signature.schema !== "krn.frontend.browser-signature.v1") failures.push("signature: unknown schema");
      if (typeof signature.by !== "string" || signature.by.trim() === "") failures.push("signature: missing approver");
      if (typeof signature.note !== "string" || signature.note.trim() === "") failures.push("signature: missing reason");
    } catch {
      failures.push("signature: a human approval is required (run `frontend verify --approve --by <name> --note <why>`)");
    }
  }
  return failures;
}

export async function gateEvidence({ configFile }) {
  const { config, root, outputDirectory } = await readConfig(configFile);
  const failures = await gateFailures({ config, root, outputDirectory });
  return { schema: "krn.frontend.browser-gate.v1", status: failures.length === 0 ? "pass" : "fail", failures };
}
