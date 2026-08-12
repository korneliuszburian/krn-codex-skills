# Billing Alert Router

Acme Billing receives webhook payloads from the billing platform and routes
customer/account alerts to configured notification channels.

## Task

Implement the alert selection layer for webhook payloads:

- parse raw webhook payloads from `unknown`;
- select configured rules by event type;
- format channel deliveries;
- keep malformed payloads from reaching channel formatting;
- preserve strict TypeScript settings.

## Local Commands

```bash
npm run build
npm run test
npm run verify
```

The visible tests cover representative happy paths only. Review should focus on
production correctness under malformed external input and edge-case payloads.

