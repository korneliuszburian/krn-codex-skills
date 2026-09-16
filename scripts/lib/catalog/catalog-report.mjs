import path from "node:path";
import process from "node:process";

const OPTIONAL_CAPABILITY_PATTERNS = Object.freeze({
  asana: /(?:^|[_@.:-])asana(?:[_@.:-]|$)/i,
  canva: /(?:^|[_@.:-])canva(?:[_@.:-]|$)/i,
  figma: /(?:^|[_@.:-])figma(?:[_@.:-]|$)/i,
  github: /(?:^|[_@.:-])github(?:[_@.:-]|$)/i,
  gmail: /(?:^|[_@.:-])gmail(?:[_@.:-]|$)/i,
  "google-calendar": /(?:google[_-]?calendar|calendar__)/i,
  "hugging-face": /(?:hugging[_-]?face|huggingface)/i,
  gsap: /(?:^|[_@.:-])gsap(?:[_@.:-]|$)/i,
  "agent-browser": /(?:agent[_-]?browser)/i,
  context7: /(?:^|[_@.:-])context7(?:[_@.:-]|$)/i,
  "openai-templates": /(?:openai[_-]?templates)/i,
});
const EVIDENCE_CONFIDENCE = Object.freeze({
  confirmed: { label: "high", rank: 3 },
  confirmed_input: { label: "medium", rank: 2 },
  syntactic_only: { label: "lower", rank: 1 },
});

function writeLine(line = "") {
  process.stdout.write(`${line}\n`);
}

function countBy(records, field) {
  return Object.fromEntries(
    [...records.reduce((counts, record) => {
      const key = record[field] || "unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function publicPlan(plan) {
  return {
    changed: plan.changed,
    originalHash: plan.originalHash,
    nextHash: plan.nextHash,
    actions: plan.actions,
  };
}

export function externalStateBoundary() {
  return {
    loaded_in_current_session: "unknown",
    account_connected_and_authorized: "report-only",
  };
}

export function configurationStateContract() {
  return {
    profile: "declared",
    inventory: "discovered_candidate",
    local_configuration: "configured_enabled",
    ...externalStateBoundary(),
  };
}

function usageRows(aggregates) {
  return [...aggregates].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
  );
}

export function usageStateContract(result) {
  const rows = usageRows(result.aggregates);
  const droppedCandidates =
    result.malformed_lines +
    (result.coverage.oversized_candidate_lines || 0) +
    (result.coverage.records_without_usable_date || 0) +
    (result.coverage.skipped_unreadable_files || 0) +
    (result.coverage.skipped_unreadable_directories || 0) +
    // A file named for a day before the window is skipped, but a resumed session
    // appends in-window records to it, so its records are unaccounted for.
    (result.coverage.skipped_files_before_window || 0);

  return {
    evidence_window: {
      since_day: result.coverage.since_day,
      through_day: result.coverage.through_day,
    },
    evidence_incomplete: droppedCandidates > 0,
    dropped_evidence: {
      malformed_lines: result.malformed_lines,
      oversized_candidate_lines: result.coverage.oversized_candidate_lines || 0,
      records_without_usable_date: result.coverage.records_without_usable_date || 0,
      skipped_unreadable_files: result.coverage.skipped_unreadable_files || 0,
      skipped_unreadable_directories: result.coverage.skipped_unreadable_directories || 0,
      skipped_files_before_window: result.coverage.skipped_files_before_window || 0,
    },
    ...externalStateBoundary(),
    optional_capabilities: Object.entries(OPTIONAL_CAPABILITY_PATTERNS).map(
      ([capability, pattern]) => {
        const matching = rows.filter((row) => pattern.test(row.id));
        const events = matching.reduce(
          (total, row) =>
            total + row.confirmed_calls + row.observed_calls + row.observed_reads,
          0,
        );
        const lastSeen = matching
          .map((row) => row.last_seen_day)
          .filter(Boolean)
          .sort()
          .at(-1);
        const confidence = matching.reduce((best, row) => {
          const candidate = EVIDENCE_CONFIDENCE[row.confidence];
          if (candidate === undefined || candidate.rank <= (best?.rank || 0)) {
            return best;
          }
          return candidate;
        }, undefined);

        return {
          capability,
          evidence_state: events > 0 ? "observed_used" : "no_evidence",
          evidence_confidence: confidence?.label || null,
          events,
          last_seen_day: lastSeen || null,
        };
      },
    ),
  };
}

export function printInventory(inventory) {
  writeLine("Capability state: discovered_candidate");
  writeLine("Discovery does not prove session loading, account authorization, or use.");
  writeLine("");
  writeLine(`Discovered skill candidates: ${inventory.skills.length}`);
  writeLine(`Cached plugin candidates: ${inventory.plugins.length}`);
  writeLine(`Quarantine evidence: ${inventory.hardQuarantine.length}`);
  writeLine("");
  writeLine("Skill families:");
  for (const [family, count] of Object.entries(countBy(inventory.skills, "family"))) {
    writeLine(`  ${family.padEnd(24)} ${count}`);
  }
  writeLine("");
  writeLine("Cached plugin candidates (not installation proof):");
  for (const plugin of inventory.plugins) {
    writeLine(`  ${plugin.id}${plugin.currentVersion ? ` (${plugin.currentVersion})` : ""}`);
  }
  if (inventory.hardQuarantine.length > 0) {
    writeLine("");
    writeLine("Hard quarantine is active. Quarantined paths were not inspected.");
  }
}

export function printUsage(result, inventory) {
  const state = usageStateContract(result);
  const rows = usageRows(result.aggregates);
  writeLine(
    `Evidence window: ${state.evidence_window.since_day} through ` +
      state.evidence_window.through_day,
  );
  writeLine(`Evidence incomplete: ${state.evidence_incomplete}`);
  writeLine(`loaded_in_current_session: ${state.loaded_in_current_session}`);
  writeLine(
    `account_connected_and_authorized: ${state.account_connected_and_authorized}`,
  );
  writeLine("");
  writeLine("Optional capability observed-use evidence:");
  writeLine("CAPABILITY          STATE            EVENTS LAST       CONFIDENCE");
  for (const capability of state.optional_capabilities) {
    writeLine(
      `${capability.capability.padEnd(19)} ` +
        `${capability.evidence_state.padEnd(16)} ` +
        `${String(capability.events).padStart(6)} ` +
        `${(capability.last_seen_day || "-").padEnd(10)} ` +
        `${capability.evidence_confidence || "-"}`,
    );
  }

  const skillRows = rows.filter((row) => row.kind === "skill");
  if (skillRows.length > 0) {
    writeLine("");
    writeLine("Observed skill-body reads:");
    for (const row of skillRows) {
      writeLine(
        `  ${row.id.padEnd(48)} ${String(row.observed_reads).padStart(4)}  ` +
          `${row.last_seen_day || "-"}  ${row.confidence}`,
      );
    }
  }
  const observedSkills = new Set(
    rows.filter((row) => row.kind === "skill").map((row) => row.id),
  );
  const noReadEvidence = inventory.skills.filter(
    (skill) => !observedSkills.has(skill.id),
  ).length;
  writeLine("");
  writeLine(
    `Coverage: ${result.scanned_files} files, ${result.scanned_bytes} bytes, ` +
      `${noReadEvidence} discovered skills without observed reads.`,
  );
  const oversizedCandidates = result.coverage.oversized_candidate_lines || 0;
  const undatedCandidates = result.coverage.records_without_usable_date || 0;
  writeLine(
    `Dropped candidate records: ${result.malformed_lines} malformed, ` +
      `${oversizedCandidates} above ${result.coverage.max_record_bytes} bytes, ` +
      `${undatedCandidates} without a usable date.`,
  );
  if (result.malformed_lines + oversizedCandidates + undatedCandidates > 0) {
    writeLine("Evidence is incomplete for the dropped candidate records.");
  }
  writeLine(
    "Absence of evidence never disables a capability automatically; implicit skill invocation is not fully observable.",
  );
}

export function printProfile(name, profile) {
  writeLine("Capability state: declared");
  writeLine(`${name}: ${profile.description}`);
  for (const [surface, policy] of Object.entries(profile)) {
    if (surface === "description") continue;
    writeLine("");
    writeLine(`${surface}:`);
    for (const [key, values] of Object.entries(policy)) {
      writeLine(`  ${key}: ${Array.isArray(values) ? values.join(", ") || "-" : values}`);
    }
  }
  writeLine("");
  writeLine("loaded_in_current_session: unknown");
  writeLine("account_connected_and_authorized: report-only");
}

function displayTarget(action) {
  if (action.resource !== "skill") return action.target;
  return path.basename(path.dirname(action.target));
}

function cachedPluginFamily(skillPath) {
  const match = skillPath.replaceAll("\\", "/").match(
    /\/plugins\/cache\/[^/]+\/([^/]+)\/[^/]+\/skills\//,
  );
  return match?.[1] || "unknown-plugin";
}

export function printPlan(name, resolved, plan) {
  writeLine("Capability states: declared + discovered_candidate + configured_enabled");
  writeLine("loaded_in_current_session: unknown");
  writeLine("account_connected_and_authorized: report-only");
  writeLine("");
  writeLine(`${name}: ${plan.changed ? `${plan.actions.length} config change(s)` : "already converged"}`);
  const pluginSkillDisables = plan.actions.filter(
    (action) =>
      action.resource === "skill" &&
      action.enabled === false &&
      ["desired-state", "disabled-parent-plugin"].includes(action.reason) &&
      cachedPluginFamily(action.target) !== "unknown-plugin",
  );
  const pluginSkillDisableSet = new Set(pluginSkillDisables);
  for (const action of plan.actions.filter(
    (candidate) => !pluginSkillDisableSet.has(candidate),
  )) {
    const state = typeof action.enabled === "boolean" ? ` -> ${action.enabled ? "on" : "off"}` : "";
    writeLine(
      `  ${action.operation.toUpperCase().padEnd(6)} ` +
        `${action.resource.padEnd(11)} ${displayTarget(action)}${state}`,
    );
  }
  if (pluginSkillDisables.length > 0) {
    const grouped = countBy(
      pluginSkillDisables.map((action) => ({ family: cachedPluginFamily(action.target) })),
      "family",
    );
    writeLine(
      `  APPLY  ${String(pluginSkillDisables.length).padStart(2)} plugin-cache skill disables: ` +
        Object.entries(grouped)
          .map(([family, count]) => `${family} (${count})`)
          .join(", "),
    );
    writeLine("         use --json for every exact version-pinned path");
  }
  if (resolved.unresolved.plugins.length || resolved.unresolved.skills.length) {
    writeLine("");
    writeLine(
      `Not currently discovered: ${[
        ...resolved.unresolved.plugins,
        ...resolved.unresolved.skills,
      ].join(", ")}`,
    );
  }
  if (resolved.apps.enable.length || resolved.apps.disable.length) {
    writeLine("");
    writeLine(
      `Apps/connectors are ${resolved.apps.mode}: enable [${resolved.apps.enable.join(", ")}], ` +
        `disable [${resolved.apps.disable.join(", ")}].`,
    );
  }
}
