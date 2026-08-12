export type Currency = "USD" | "EUR" | "PLN";

export type WebhookKind =
  | "invoice.paid"
  | "invoice.payment_failed"
  | "trial.will_end"
  | "subscription.canceled";

export interface BaseWebhookEvent {
  kind: WebhookKind;
  eventId: string;
  customerId: string;
  receivedAt: string;
  metadata?: Record<string, string>;
}

export interface InvoicePaidEvent extends BaseWebhookEvent {
  kind: "invoice.paid";
  invoiceId: string;
  amountCents: number;
  currency: Currency;
}

export interface InvoicePaymentFailedEvent extends BaseWebhookEvent {
  kind: "invoice.payment_failed";
  invoiceId: string;
  failureCode: "card_declined" | "insufficient_funds" | "expired_card" | "unknown";
  retryAfterMs?: number;
}

export interface TrialWillEndEvent extends BaseWebhookEvent {
  kind: "trial.will_end";
  planId: string;
  trialEndsAt: string;
}

export interface SubscriptionCanceledEvent extends BaseWebhookEvent {
  kind: "subscription.canceled";
  canceledAt: string;
  reason?: "voluntary" | "payment_failed" | "fraud" | "unknown";
}

export type BillingWebhookEvent =
  | InvoicePaidEvent
  | InvoicePaymentFailedEvent
  | TrialWillEndEvent
  | SubscriptionCanceledEvent;

export type Channel =
  | {
      kind: "email";
      to: string;
    }
  | {
      kind: "slack";
      webhookUrl: string;
    }
  | {
      kind: "webhook";
      endpoint: string;
      signingKeyRef: string;
    };

export interface NotificationRule {
  id: string;
  eventKind: WebhookKind;
  channel: Channel;
  minAmountCents?: number;
  retryWindowMs?: number;
  disabled?: boolean;
}

export interface Delivery {
  ruleId: string;
  channelKind: Channel["kind"];
  destination: string;
  dedupeKey: string;
  body: string;
}

