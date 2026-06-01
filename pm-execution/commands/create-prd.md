---
description: Create a comprehensive Product Requirements Document from a feature idea, problem statement, or brain dump. Iterative, sized to your initiative, publishable to Confluence.
argument-hint: "<feature idea, problem statement, or brain dump>"
---

# /create-prd -- Product Requirements Document

Create a structured PRD that aligns stakeholders and guides development. Works from anything — a vague idea, a data insight, a Slack thread, or a detailed brief. Iterative by design: share what you know and refine as you learn more.

## Invocation

```
/create-prd SSO support for enterprise customers
/create-prd Users are dropping off during onboarding — step 3 has a 60% drop
/create-prd [upload a brief, research doc, strategy deck, or Figma link]
```

## Workflow

Apply the **create-prd** skill at `pm-execution/skills/create-prd/SKILL.md`. The skill runs in three phases:

1. **Setup** — checks Atlassian MCP connectivity, asks the effort sizing question (see below), gathers inputs through a guided brain dump and a question bank scoped to actual gaps, shows a section-strength signal before drafting
2. **Write** — applies the 10-section PRD template calibrated by effort level. Header metadata block always included. Open Questions and Stakeholder Q&A only populated post-walkthrough
3. **Review and publish** — rates the draft, presents for explicit confirmation, then publishes to Confluence (or saves as a markdown file if MCP is not connected). For Confluence, never publishes to personal spaces

## Effort sizing — the first question the skill asks

| Effort | Dev time | What you get |
|---|---|---|
| **Low** | 1-5 days | 1-page PRD: overview, user stories, edge cases, 1-2 metrics, out of scope |
| **Medium** | 1-6 weeks | 2-4 page PRD: problem, user stories, edge cases, 2-3 metrics, PM-level open questions |
| **High** | Quarter or more | Full PRD with phasing, risks, full metric hierarchy, experiment design |

The answer drives section selection, depth, and metric count throughout. See the SKILL for the per-level section rules.

## After the PRD is delivered

The skill offers these opt-in next steps. Picking one routes to the matching skill with the PRD already in context — no re-paste needed.

| Offer | Skill |
|---|---|
| "Stress-test this PRD with an adaptive review (score-based or CEO mode)" | `/review-prd` |
| "Break this into epics and user stories" | `/prd-to-epics` |
| "Draft a stakeholder update to socialise this" | `/stakeholder-update` |
| "Run a pre-mortem on the highest-risk failure modes" | `/pre-mortem` |

## Notes

- A tight PRD is better than an expansive vague one — be opinionated about scope
- If the idea is too big, the skill proactively suggests phasing and only specs Phase 1
- Non-goals prevent scope creep — they get the same weight as goals
- Flag assumptions explicitly rather than presenting them as facts
- The iterative process means a weak first draft is fine — keep refining
- Confluence publishes are explicit and gated; the skill never publishes without your confirmation
