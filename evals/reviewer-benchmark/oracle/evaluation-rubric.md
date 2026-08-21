# Hidden Evaluation Rubric

Do not provide this file to reviewers before the first review pass.

## Source Basis

- Effective TypeScript, "The Hidden Side of Type Predicates":
  https://effectivetypescript.com/2024/02/27/type-guards/
- TypeScript Handbook, Narrowing:
  https://www.typescriptlang.org/docs/handbook/2/narrowing.html
- TypeScript TSConfig, `noUncheckedIndexedAccess`:
  https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html

## Expected High-Value Findings

### 1. External payloads are trusted after shallow shape checks

Expected reviewer signal:

- `normalizeWebhook` accepts untrusted `unknown` payloads after checking only
  property presence for event-specific fields.
- `trustWebhookPayload` converts `Record<string, unknown>` into domain events
  without validating numeric/string/enumerated/date fields.
- This can route malformed payloads into production formatting, for example
  `amountCents: "12900"`, `currency: "AUD"`, `failureCode: "not_real"`, or
  `receivedAt: "not-a-date"`.

Evidence:

- `subject/src/processor.ts`
- `trustWebhookPayload`
- `normalizeWebhook`

Severity: high.

### 2. Truthiness is used where non-nullish/domain checks are required

Expected reviewer signal:

- `hasBaseWebhookFields` uses `Boolean(value["customerId"])`, which silently
  rejects empty-string IDs as if they were missing and does not explain whether
  that is a domain rule.
- `hasRetryWindow` uses `Boolean(event.retryAfterMs)`, so `0` is treated like
  absence. If `0` means "retry immediately", routing is wrong.
- `selectDeliveries` uses `rule.minAmountCents` and `rule.retryWindowMs` as
  truthy checks, so zero-valued thresholds are ignored.

Evidence:

- `subject/src/processor.ts`
- `hasBaseWebhookFields`
- `hasRetryWindow`
- `selectDeliveries`

Severity: medium or high depending on reviewer framing.

### 3. Type predicates are broader than their runtime checks prove

Expected reviewer signal:

- `hasInvoiceShape` claims an event is `InvoicePaidEvent | InvoicePaymentFailedEvent`
  based on `kind.startsWith("invoice.")` and `"invoiceId" in event`.
- Because `normalizeWebhook` has already trusted external data, downstream type
  predicates give TypeScript stronger guarantees than runtime validation
  actually established.
- A strong reviewer should connect this to invalid type predicate assumptions,
  not just mention "casts are bad".

Evidence:

- `subject/src/processor.ts`
- `hasInvoiceShape`
- `trustWebhookPayload`

Severity: medium.

### 4. Dedupe key can collapse independent deliveries

Expected reviewer signal:

- `dedupeKey` is `${event.kind}:${event.customerId}:${rule.channel.kind}`.
- Two different rules for the same event/customer/channel kind collide.
- Multiple invoice events for the same customer/channel kind also collide unless
  some external layer adds event ID or invoice ID.

Evidence:

- `subject/src/processor.ts`
- delivery construction inside `selectDeliveries`

Severity: medium.

### 5. Visible tests do not exercise adversarial boundary cases

Expected reviewer signal:

- Tests cover happy paths and unknown event kind only.
- They do not cover malformed field types, invalid enum values, zero thresholds,
  retry window `0`, duplicate rules, or dedupe collisions.

Evidence:

- `subject/test/run-tests.ts`

Severity: low or medium.

## Scoring

Score 0-10:

- +3 for catching shallow unknown-to-domain trust.
- +2 for catching truthiness/non-nullish edge cases.
- +2 for catching type predicate overclaiming.
- +1.5 for catching dedupe collision.
- +1 for catching test coverage gaps.
- +0.5 for schema-valid, concise, evidence-backed JSON.

Deduct:

- -2 for proposing broad rewrites without evidence.
- -2 for style-only findings.
- -3 for missing the external-input trust boundary entirely.
- -3 for returning non-JSON or private reasoning.
