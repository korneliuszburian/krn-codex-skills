#!/usr/bin/env node
// Agent adapter for `krn harness compare` over the opencode transport. The lane
// runner sends one JSON payload on stdin; this adapter materializes the lane's
// enabled KRN surfaces into a disposable home, runs `opencode run` in the task
// workspace, and prints the token count the harness records.
//
// Components (a lane's `enabled` map):
//   skills: the exported skill set plus the AGENTS.md catalog.
//   memory: the edit-time recall instruction (the agent must call `krn memory recall`).
//   brief + hooks: the installed KRN plugin, which owns the session brief and the guard.
//   The global contract AGENTS.md loads only when at least one surface is on.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { runProcess } from "../lib/kernel/proc.mjs";

// The installed surfaces live under the real home; a test supplies a fixture
// home so the lane's materialization is observed without a host installation.
const REAL_HOME = process.env.KRN_HARNESS_AGENT_HOME ?? homedir();
const OPENCODE = process.env.KRN_HARNESS_OPENCODE ?? path.join(REAL_HOME, ".opencode", "bin", "opencode");
const MODEL = process.env.KRN_HARNESS_MODEL ?? "opencode-go/deepseek-v4.1-flash";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function refuse(rule, detail) {
  process.stderr.write(`opencode-agent refused: ${rule}${detail ? ` (${detail})` : ""}\n`);
  process.exit(2);
}

function link(target, linkPath) {
  if (!existsSync(target)) return;
  mkdirSync(path.dirname(linkPath), { recursive: true });
  try {
    symlinkSync(target, linkPath);
  } catch {
    /* an existing link is fine */
  }
}

function prepareHome(enabled) {
  const home = mkdtempSync(path.join(tmpdir(), "krn-lane-home-"));
  const configDir = path.join(home, ".config", "opencode");
  mkdirSync(configDir, { recursive: true });
  const realConfig = path.join(REAL_HOME, ".config", "opencode", "opencode.json");
  if (existsSync(realConfig)) cpSync(realConfig, path.join(configDir, "opencode.json"));
  link(path.join(REAL_HOME, ".local", "share", "opencode", "auth.json"), path.join(home, ".local", "share", "opencode", "auth.json"));
  const anySurface = enabled.skills || enabled.memory || enabled.brief || enabled.hooks;
  if (enabled.skills) {
    link(path.join(REAL_HOME, ".agents", "skills"), path.join(home, ".agents", "skills"));
  }
  if (enabled.brief || enabled.hooks) {
    link(path.join(REAL_HOME, ".config", "opencode", "plugins"), path.join(configDir, "plugins"));
  }
  const instructions = [];
  if (anySurface) {
    const contract = path.join(REAL_HOME, ".config", "opencode", "AGENTS.md");
    if (existsSync(contract)) instructions.push(readFileSync(contract, "utf8"));
  }
  if (enabled.memory) {
    instructions.push(
      "Before editing, run `krn memory recall --root <repository> --changed <path>` for every path you are about to change and apply the lesson it returns.",
    );
  }
  if (instructions.length > 0) {
    writeFileSync(path.join(configDir, "AGENTS.md"), `${instructions.join("\n\n")}\n`);
  }
  return home;
}

function tokenTotal(stdout) {
  let total = 0;
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type === "step_finish" && event.part?.tokens) total += Number(event.part.tokens.total) || 0;
  }
  return total;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || "{}");
  } catch (error) {
    refuse("bad-payload", error.message);
  }
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) refuse("missing-prompt", String(payload?.lane ?? "lane"));
  const workspace = typeof payload?.workspace === "string" && payload.workspace ? payload.workspace : process.cwd();
  if (!existsSync(workspace)) refuse("workspace-missing", workspace);
  if (!existsSync(OPENCODE)) refuse("opencode-missing", OPENCODE);

  const enabled = payload.enabled ?? {};
  const home = prepareHome(enabled);
  try {
    const result = runProcess(OPENCODE, ["run", "--model", MODEL, "--format", "json", "--auto", "--dir", workspace, prompt], {
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        XDG_DATA_HOME: path.join(home, ".local", "share"),
        XDG_CACHE_HOME: path.join(home, ".cache"),
        XDG_STATE_HOME: path.join(home, ".state"),
      },
      timeout: 900_000,
    });
    if (result.errorCode) refuse("opencode-spawn-failed", result.errorMessage);
    process.stdout.write(`${JSON.stringify({ tokens: tokenTotal(result.out) })}\n`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

main();
