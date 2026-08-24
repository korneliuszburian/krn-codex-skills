import fs from "node:fs";

const usage = "usage: score-review.mjs <review-input> [--prose]";

const [inputArg, modeArg] = process.argv.slice(2);
if (!inputArg) throw new Error(usage);

const prose = modeArg === "--prose";

const CLASSES = [
  {
    id: "externalTrust",
    weight: 3,
    evidence: (text) =>
      /trustwebhookpayload|normalizewebhook/.test(text) &&
      /untrusted|external|malformed|shallow|trust boundary/.test(text),
  },
  {
    id: "truthiness",
    weight: 2,
    evidence: (text) =>
      /boolean\(|retryafterms|minamountcents|retrywindowms|truthiness|truthy|zero[- ]value/.test(text),
  },
  {
    id: "typePredicate",
    weight: 2,
    evidence: (text) =>
      /hasinvoiceshape|hasretrywindow|type predicate|kind\.startswith|narrowing/.test(text),
  },
  {
    id: "dedupeCollision",
    weight: 1.5,
    evidence: (text) =>
      /dedupekey|dedupe|collision/.test(text) &&
      /collid|same key|two different|collapse|duplicate/.test(text),
  },
  {
    id: "testGaps",
    weight: 1,
    evidence: (text) =>
      /tests?|coverage|run-tests/.test(text) &&
      /not cover|do not cover|missing|gap|adversarial|boundary case/.test(text),
  },
];

function findingText(findings) {
  return findings
    .flatMap((finding) => [
      finding.title ?? "",
      finding.summary ?? "",
      finding.evidence ?? "",
      finding.impact ?? "",
      finding.recommendation ?? "",
    ])
    .join("\n")
    .toLowerCase();
}

function scoreReview(findings) {
  const text = findingText(findings);
  const matched = CLASSES.filter((cls) => cls.evidence(text));
  let score = matched.reduce((sum, cls) => sum + cls.weight, 0);

  const evidenceBacked =
    findings.length > 0 &&
    findings.every(
      (finding) =>
        finding.severity &&
        (finding.file || finding.path) &&
        (finding.evidence || finding.line),
    );
  if (evidenceBacked) score += 0.5;

  let deductions = 0;
  const matchedIds = new Set(matched.map((cls) => cls.id));
  if (findings.length > 0 && !matchedIds.has("externalTrust")) {
    deductions += 3;
  }
  if (/rewrite (the )?(entire|whole)|full rewrite|refactor everything/.test(text)) {
    deductions += 2;
  }
  if (findings.length > 0 && matchedIds.size === 0 && /style|formatting|naming|indent/.test(text)) {
    deductions += 2;
  }

  score = Math.max(0, Math.min(10, score - deductions));
  return {
    score: Math.round(score * 10) / 10,
    matchedClasses: matched.map((cls) => cls.id),
    deductions,
    findingsCount: findings.length,
  };
}

const raw = fs.readFileSync(inputArg, "utf8");

let findings;
if (prose) {
  findings = [{ title: raw, summary: raw, evidence: raw }];
} else {
  let review;
  try {
    review = JSON.parse(raw);
  } catch {
    review = null;
  }
  if (!review) {
    console.log(JSON.stringify({ score: 0, matchedClasses: [], deductions: 3, findingsCount: 0, reason: "non-JSON" }, null, 2));
    process.exit(0);
  }
  findings = Array.isArray(review.findings) ? review.findings : [];
}

const result = scoreReview(findings);
result.input = inputArg;
console.log(JSON.stringify(result, null, 2));
