import type {
  NotificationRule
} from "../src/domain.js";
import {
  normalizeWebhook,
  selectDeliveries
} from "../src/processor.js";

const assertEqual = (actual: unknown, expected: unknown): void => {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
};

const assertJsonEqual = (actual: unknown, expected: unknown): void => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, received ${actualJson}`);
  }
};

const parsed = normalizeWebhook({
  kind: "invoice.paid",
  eventId: "evt_1",
  customerId: "cus_1",
  receivedAt: "2026-07-03T09:00:00.000Z",
  invoiceId: "inv_1",
  amountCents: 12900,
  currency: "USD"
});

assertEqual(parsed?.kind, "invoice.paid");

const invoiceRules: NotificationRule[] = [{
  id: "rule_email_high_value",
  eventKind: "invoice.paid",
  minAmountCents: 10000,
  channel: {
    kind: "email",
    to: "finance@example.com"
  }
}, {
  id: "rule_slack_low_value",
  eventKind: "invoice.paid",
  minAmountCents: 500,
  channel: {
    kind: "slack",
    webhookUrl: "https://hooks.example.test/services/finance"
  }
}];

assertJsonEqual(
  parsed === undefined ? [] : selectDeliveries(parsed, invoiceRules).map((delivery) => delivery.ruleId),
  ["rule_email_high_value", "rule_slack_low_value"]
);

const paymentFailed = normalizeWebhook({
  kind: "invoice.payment_failed",
  eventId: "evt_2",
  customerId: "cus_2",
  receivedAt: "2026-07-03T09:10:00.000Z",
  invoiceId: "inv_2",
  failureCode: "card_declined",
  retryAfterMs: 60000
});

assertEqual(paymentFailed?.kind, "invoice.payment_failed");

assertJsonEqual(
  paymentFailed === undefined
    ? []
    : selectDeliveries(paymentFailed, [{
      id: "rule_retry_fast",
      eventKind: "invoice.payment_failed",
      retryWindowMs: 120000,
      channel: {
        kind: "webhook",
        endpoint: "https://ops.example.test/billing",
        signingKeyRef: "ops-signing-key"
      }
    }]).map((delivery) => delivery.destination),
  ["https://ops.example.test/billing"]
);

assertEqual(normalizeWebhook({
  kind: "customer.created",
  eventId: "evt_bad",
  customerId: "cus_bad",
  receivedAt: "2026-07-03T09:30:00.000Z"
}), undefined);
