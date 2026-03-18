---
description: Run a complete quarterly planning session — OKRs, roadmap, risks, and decisions — calibrated to your level
argument-hint: "<level: IC/VP/board> <quarter> [context]"
---

# /quarterly-planning -- Quarterly Planning

Run a full quarterly planning session that adapts to your seniority: team OKRs and roadmap for ICs/PMs, P&L and strategic bets for VPs/CPOs, or a board-ready QBR.

## Invocation

```
/quarterly-planning Q2 planning for my payments team — I'm a PM
/quarterly-planning VP-level Q2 planning — I own the credit card P&L
/quarterly-planning QBR deck for board meeting next Friday
```

## Workflow

Apply the **quarterly-planning** skill to:

1. Detect level (IC/team PM, VP/CPO, or QBR for CEO/board)
2. Gather last quarter's performance, this quarter's strategic context, and key inputs
3. Produce the full planning output: OKRs or strategic bets, roadmap, risks, cross-functional dependencies, and decisions needed
4. Suggest `/pre-mortem` to stress-test the plan and `/stakeholder-update` to communicate it

## Notes

- MODE A (IC/PM): 2 objectives max, 3 KRs each, P0/P1/P2 roadmap tiers
- MODE B (VP/CPO): strategic bets, portfolio allocation, cross-functional commitments, P&L scorecard
- MODE C (QBR): board-ready narrative, scorecard, strategic priority deep dives, decisions and asks
