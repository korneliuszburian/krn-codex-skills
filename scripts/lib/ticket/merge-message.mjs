// One owner for the publication message bodies. A lane-integration merge keeps
// the worker commits, so its body needs only the ticket and the contract; a
// squash drops them, so its body must carry every harness-read trailer the
// worker commit carried. The executable observer builds these messages into a
// real git history and re-reads them.
const REQUIRED = ["Ticket:", "Change-contract:"];
// Only the harness-read trailer vocabulary counts; a subject such as
// `merge: integrate x` is not a trailer.
const TRAILER_KEYS = new Set(["Ticket:", "Change-contract:", "Recall:", "At-risk:", "Applicability-change:"]);

export function trailersFromCommitBody(body) {
  const trailers = [];
  for (const line of String(body ?? "").split("\n")) {
    const match = /^([A-Za-z][A-Za-z-]*):\s*(\S.*)$/.exec(line);
    if (!match) continue;
    const key = `${match[1]}:`;
    if (!TRAILER_KEYS.has(key)) continue;
    trailers.push({ key, value: match[2].trim() });
  }
  return trailers;
}

export function integrationMergeMessage({ branch, ticket, contract }) {
  if (!branch || !ticket || !contract) {
    throw new Error("integrationMergeMessage requires branch, ticket, and contract");
  }
  return `merge: integrate ${branch}\n\nTicket: ${ticket}\nChange-contract: ${contract}`;
}

export function squashMessage({ subject, workerBody }) {
  if (!subject) throw new Error("squashMessage requires a subject");
  const trailers = trailersFromCommitBody(workerBody);
  const missing = REQUIRED.filter((key) => !trailers.some((trailer) => trailer.key === key));
  if (missing.length > 0) throw new Error(`the worker commit is missing ${missing.join(", ")}`);
  const lines = trailers.map((trailer) => `${trailer.key} ${trailer.value}`);
  return `${subject}\n\n${lines.join("\n")}`;
}

// A squash body that drops a trailer the worker commit carried would lose a
// harness-read obligation, so the drop is named rather than tolerated.
export function squashTrailerErrors(workerBody, squashBody) {
  const worker = trailersFromCommitBody(workerBody).map((trailer) => trailer.key);
  const squash = new Set(trailersFromCommitBody(squashBody).map((trailer) => trailer.key));
  const dropped = [...new Set(worker)].filter((key) => !squash.has(key));
  return dropped.map((key) => `the squash body dropped ${key}`);
}
