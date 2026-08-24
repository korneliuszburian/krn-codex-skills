import type {
  BillingWebhookEvent,
  Channel,
  Delivery,
  InvoicePaidEvent,
  InvoicePaymentFailedEvent,
  NotificationRule
} from "./domain.js";

type MutableRuleBuckets = Record<string, NotificationRule[]>;

const webhookKinds = new Set([
  "invoice.paid",
  "invoice.payment_failed",
  "trial.will_end",
  "subscription.canceled"
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trustWebhookPayload = <Event extends BillingWebhookEvent>(
  payload: Record<string, unknown>
): Event => payload as unknown as Event;

const hasBaseWebhookFields = (
  value: unknown
): value is Record<string, unknown> & Pick<BillingWebhookEvent, "kind" | "eventId" | "customerId" | "receivedAt"> =>
  isRecord(value) &&
  typeof value["kind"] === "string" &&
  webhookKinds.has(value["kind"]) &&
  typeof value["eventId"] === "string" &&
  Boolean(value["customerId"]) &&
  typeof value["receivedAt"] === "string";

const hasInvoiceShape = (
  event: BillingWebhookEvent
): event is InvoicePaidEvent | InvoicePaymentFailedEvent =>
  event.kind.startsWith("invoice.") && "invoiceId" in event;

const hasRetryWindow = (
  event: BillingWebhookEvent
): event is InvoicePaymentFailedEvent & { retryAfterMs: number } =>
  event.kind === "invoice.payment_failed" && Boolean(event.retryAfterMs);

export function normalizeWebhook(payload: unknown): BillingWebhookEvent | undefined {
  if (!hasBaseWebhookFields(payload)) {
    return undefined;
  }

  if (payload.kind === "invoice.paid") {
    if ("invoiceId" in payload && "amountCents" in payload && "currency" in payload) {
      return trustWebhookPayload<InvoicePaidEvent>(payload);
    }

    return undefined;
  }

  if (payload.kind === "invoice.payment_failed") {
    if ("invoiceId" in payload && "failureCode" in payload) {
      return trustWebhookPayload<InvoicePaymentFailedEvent>(payload);
    }

    return undefined;
  }

  if (payload.kind === "trial.will_end" && "planId" in payload && "trialEndsAt" in payload) {
    return trustWebhookPayload<BillingWebhookEvent>(payload);
  }

  if (payload.kind === "subscription.canceled" && "canceledAt" in payload) {
    return trustWebhookPayload<BillingWebhookEvent>(payload);
  }

  return undefined;
}

const bucketRules = (rules: readonly NotificationRule[]): MutableRuleBuckets =>
  rules.reduce<MutableRuleBuckets>((buckets, rule) => {
    if (rule.disabled) {
      return buckets;
    }

    buckets[rule.eventKind] ??= [];
    buckets[rule.eventKind]!.push(rule);

    return buckets;
  }, {});

const channelDestination = (channel: Channel): string => {
  switch (channel.kind) {
    case "email":
      return channel.to;
    case "slack":
      return channel.webhookUrl;
    case "webhook":
      return channel.endpoint;
  }
};

const deliveryBody = (event: BillingWebhookEvent): string => {
  if (hasInvoiceShape(event)) {
    return `Invoice ${event.invoiceId} changed for customer ${event.customerId}.`;
  }

  if (event.kind === "trial.will_end") {
    return `Trial for ${event.customerId} ends at ${event.trialEndsAt}.`;
  }

  return `Subscription for ${event.customerId} was canceled.`;
};

export function selectDeliveries(
  event: BillingWebhookEvent,
  rules: readonly NotificationRule[]
): Delivery[] {
  const rulesByKind = bucketRules(rules);
  const matchingRules = rulesByKind[event.kind] ?? [];
  const deliveries: Delivery[] = [];

  for (const rule of matchingRules) {
    if (
      event.kind === "invoice.paid" &&
      rule.minAmountCents &&
      event.amountCents < rule.minAmountCents
    ) {
      continue;
    }

    if (
      event.kind === "invoice.payment_failed" &&
      rule.retryWindowMs &&
      (!hasRetryWindow(event) || event.retryAfterMs > rule.retryWindowMs)
    ) {
      continue;
    }

    deliveries.push({
      ruleId: rule.id,
      channelKind: rule.channel.kind,
      destination: channelDestination(rule.channel),
      dedupeKey: `${event.kind}:${event.customerId}:${rule.channel.kind}`,
      body: deliveryBody(event)
    });
  }

  return deliveries;
}
