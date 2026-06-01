---
description: Create a comprehensive Product Requirements Document from a feature idea, problem statement, or brain dump — iterative, sized to your initiative, publishable to Confluence
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

### Step 1: Apply the create-prd skill

Run the full **create-prd** skill. The workflow has three phases:

---

### Phase 0 — Setup

**Check Atlassian MCP connectivity**

Silently attempt to call the Atlassian MCP tool. If not connected, tell the user:

> "Atlassian MCP is not connected. Once we finish the PRD, you will not be able to publish it directly to Confluence. To enable publishing, connect the Atlassian MCP integration and restart. You can continue without it for now."

Do not block PRD creation if MCP is unavailable.

**Size the initiative**

Ask one question before anything else:

> "Before we start — what is the effort level for this initiative?
> - **Low** (1-5 days dev): I'll write a 1-page PRD — overview, user stories, edge cases, 1-2 metrics, out of scope
> - **Medium** (1-6 weeks dev): I'll write a 2-4 page PRD — problem, user stories, edge cases, 2-3 metrics, open questions (PM-level only)
> - **High** (quarter or more): I'll write a full PRD with phasing, risks, full metric hierarchy, and experiment design
>
> Take your best guess — we can adjust as we go."

The skill uses this answer to drive section selection, depth, and metric count throughout. See `pm-execution/skills/create-prd/SKILL.md` for the per-level section rules.

**Frame the process**

Tell the user:

> "This is an iterative process. Share what you know today — even if it is incomplete. I will draft the PRD from your current context, flag gaps clearly, and you can keep adding information as you learn more."

**Gather inputs**

Ask for a brain dump first:

> "Tell me everything you know — the problem, who it affects, any data you have, rough solution ideas, timelines, or constraints. There are no wrong answers. Bullet points are fine."

Then selectively ask from the question bank below. Only ask what is genuinely missing. Never ask more than 5 questions at once. If the user does not have an answer, move on.

**Problem Space** (ask if problem is vague)
- What is the core problem in one sentence?
- Who specifically experiences it and how do you know?
- How was this discovered — data, research, user complaints, exec request?
- Have we tried to solve this before? What happened?
- What is the cost of not solving this?

**Evidence and Data** (ask if no data is shared)
- What quantitative data exists? (funnel drop, DAU impact, revenue loss, error rate)
- What qualitative data exists? (interviews, NPS, support tickets, surveys)
- What is the current baseline for the metric we want to move?
- Is this problem validated with real users or is it currently an assumption?

**Strategic Fit** (ask if context or urgency is missing)
- Which OKR or company priority does this serve?
- Why now versus 6 months ago?
- What are we not doing by prioritising this?

**Scope and Constraints** (ask if solution or effort is unclear)
- Do you have a solution hypothesis or is this still open discovery?
- Which teams or systems will this depend on?
- Are there hard constraints — technical, legal, regulatory, or timeline?

**Audience and Output** (ask once, at the end)
- Who is the primary reader: engineering, design, leadership, or cross-functional?
- Should this include experiment or A/B test design?
- Is there a Confluence space where you want this published?

**Show a gap confidence signal before writing**

After inputs are gathered, show this table and ask whether to proceed or fill gaps first:

```
SECTION              INPUT STRENGTH              NOTE
Problem              [Strong/Medium/Weak/Missing]    ...
Evidence             [Strong/Medium/Weak/Missing]    ...
Why Now              [Strong/Medium/Weak/Missing]    ...
Success Metrics      [Strong/Medium/Weak/Missing]    ...
Solution             [Strong/Medium/Weak/Missing]    ...
Constraints          [Strong/Medium/Weak/Missing]    ...
```

Ask: "Should I proceed with reasonable assumptions for weak sections, or do you want to fill any gaps first?"

---

### Phase 1 — Write the PRD

Think step by step before writing. Reason through: what is the problem, how do we know it exists, why does it matter now, who are we solving it for, what does success look like, what constraints exist, what are we building. If any answer is weak, flag it explicitly in the PRD rather than silently filling with assumptions.

Apply the 10-section PRD template:

1. **Context** — what changed, what triggered this, one-line framing of the opportunity
2. **What is the problem** — precise description, user impact, business impact, objective
3. **How do we know this is a problem** — quantitative data, qualitative data
4. **Why Now** — urgency vs. 6 months ago, what capabilities are ready, cost of inaction
5. **What does success look like** — primary metric, supporting metrics (2-4), guardrail metrics, measurement timeline (table format: today vs. target)
6. **Market Segment(s)** — who we are building for, constraints (optional, validate with user)
7. **Value Proposition(s)** — customer jobs addressed, gains, pains avoided, competitive edge
8. **Solution** — approach, key features, UX/prototypes, prioritisation (P0/P1/P2), out of scope
9. **Edge Cases and Risks** — edge cases with handling, risks with mitigation, rollback plan
10. **Release** — phase breakdown, dependencies, relative timeframes, definition of done per phase
11. **Open Questions** — unresolved items with owners

Write for a primary school graduate. No jargon. No acronyms without spelling out first. No em dashes.

---

### Phase 2 — Review and Publish

**Rate the PRD** after generating it using PRD Quality Levels (Level 1 Draft through Level 4 Excellent). Show the rating and a one-line reason for any section below Level 3.

**Present as a draft first.** Tell the user:

> "Here is your PRD draft. Review it and let me know if you want to change anything. Once you confirm it is ready, I will publish it to Confluence."

**Publish only after explicit confirmation.** If Atlassian MCP is connected, ask which Confluence space to publish to, then publish and return the page URL. If MCP is not connected, save as `PRD-[product-name].md` and confirm the file path.

---

### Step 2: Offer Next Steps

After the PRD is delivered, offer these as opt-in next steps. Do not auto-invoke any of them — wait for the user to pick. When the user picks one, route to the exact skill below and pass the PRD content from this session — do not ask the user to paste or re-upload the PRD.

| Offer | Skill to execute on pick |
|---|---|
| "Want me to **run a CEO review** to stress-test this PRD like a skeptical leadership reviewer would?" | `pm-execution/skills/prd-ceo-review/SKILL.md` |
| "Want me to **break this into epics and user stories** for engineering?" | `pm-execution/skills/prd-to-epics/SKILL.md` (the `/pm-execution:prd-to-epics` skill) |
| "Should I **draft a stakeholder update** to socialise this?" | `pm-execution/skills/executive-stakeholder-update/SKILL.md` (the `/pm-execution:stakeholder-update` skill) |
| "Want me to **run a pre-mortem** on the highest-risk failure modes?" | `pm-execution/skills/pre-mortem/SKILL.md` (the `/pm-execution:pre-mortem` skill) |

Routing rules:
- Read and execute the matched SKILL.md inline using the PRD content already in this session. Do not re-prompt for inputs the PRD already provides.
- If the chosen skill requires inputs the PRD does not have (e.g. Figma URL for prd-to-epics), ask only for those specific missing inputs.
- The user can pick more than one in sequence — finish one, then re-offer the remaining options.
- If the user does not pick anything, end the session.

## Notes

- A tight PRD is better than an expansive vague one — be opinionated about scope
- If the idea is too big, proactively suggest phasing and spec only Phase 1
- Non-goals prevent scope creep — they are as important as goals
- Flag assumptions explicitly rather than presenting them as facts
- The iterative process means a weak first draft is fine — keep refining
