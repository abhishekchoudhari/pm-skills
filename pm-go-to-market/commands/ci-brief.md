---
description: Produce a structured competitive intelligence brief — product moves, pricing changes, hiring signals, funding, and strategic implications
argument-hint: "<competitors to track> [weekly|monthly|ad-hoc]"
---

# /ci-brief -- Competitive Intelligence Brief

Produce a recurring CI brief that tracks competitor movement across product, pricing, GTM, hiring, and funding — and translates signals into strategic implications.

## Invocation

```
/ci-brief Razorpay, PhonePe, Paytm — monthly
/ci-brief Stripe just launched embedded finance — what does it mean for us?
/ci-brief weekly sweep — same competitors as last time
```

## Workflow

Apply the **competitive-intelligence-brief** skill to:

1. Gather or recall brief configuration (competitors, cadence, signal focus, audience)
2. Produce the full CI brief with all sections: period snapshot, product moves, pricing changes, GTM moves, hiring signals, funding activity, customer sentiment, strategic implications, and watch list
3. Offer format options: full brief, quick scan, slide outline, or Slack-ready summary

## Notes

- Different from `/battlecard` — that's a one-time deep-dive on one competitor for sales; this is a recurring radar sweep across multiple competitors
- Stores configuration between uses — don't re-ask standing parameters on subsequent runs
- Strategic implications (Section 8) are the highest-value output — always produce them
