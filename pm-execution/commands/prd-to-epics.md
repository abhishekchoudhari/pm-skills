---
description: Convert a PRD into Jira-ready Epics and Stories. Reads from text, file, or Confluence. Optional Figma URL for design context. Uses Job Story + WWA format. Epic + Story only, no tasks.
argument-hint: "<prd-text | confluence-url | file-path> [figma-url]"
---

# /prd-to-epics -- PRD to Epic and Story Backlog

Convert any PRD into a sprint-ready hierarchy of **Epics and Stories**. Pulls design context from Figma when available. Creates items directly in Jira when Atlassian MCP is connected.

## Invocation

```
/pm-execution:prd-to-epics                                           # prompts for PRD source
/pm-execution:prd-to-epics [paste PRD text here]                     # inline PRD content
/pm-execution:prd-to-epics /path/to/PRD-checkout.md                  # local file
/pm-execution:prd-to-epics https://your-org.atlassian.net/wiki/...   # Confluence page
/pm-execution:prd-to-epics [PRD] https://figma.com/design/...        # PRD + Figma design
```

## Workflow

Apply the **prd-to-epics** skill at `pm-execution/skills/prd-to-epics/SKILL.md`. The skill runs:

1. **Step 0 — Setup ceremony.** Asks the *Epic Structure* question first (single project epic vs multiple epics), checks for overlapping epics already in Jira, reads project issue-type metadata, extracts the Expected Impact statement, then handles PRD and Figma source resolution
2. **Step 1 — Parse the PRD.** Extracts problem, metrics, features with priorities, segments, phases, exclusions, risks, open questions
3. **Step 2 — Identify epics.** Defaults to **one epic per initiative**. Multiple epics only when work explicitly spans quarters or parallel teams
4. **Step 3 — Write stories.** Hybrid Job Story + WWA format with strategic Why, AC that QA can verify without interpretation, Figma screen references where design context is available. Stories must pass INVEST
5. **Step 4 — Output backlog.** Full markdown with epic table, nested stories, out-of-scope, open questions, PRD gaps detected
6. **Step 5 — Offer next actions.** Create in Jira via Atlassian MCP, generate test scenarios, run a pre-mortem, or export as markdown

## Story format

Every story follows this structure:

```
Why (Strategic Context): [connects to epic goal and business objective]

Job Story:
When [specific situation],
I want to [motivation],
so I can [outcome].

Acceptance Criteria:
- [ ] [Observable, testable condition]
- [ ] [Edge case or error state]
- [ ] [Performance or accessibility requirement]

Priority: P0/P1/P2 | Effort: S/M/L | Dependencies: [Story IDs]
```

The skill applies INVEST (Independent, Negotiable, Valuable, Estimable, Small, Testable) and the 3 C's (Card, Conversation, Confirmation) to every story before delivering the backlog.

## Example

```
/pm-execution:prd-to-epics https://acme.atlassian.net/wiki/spaces/PROD/pages/12345 https://figma.com/design/abc123/Checkout-v2
```

Fetches PRD from Confluence, pulls Figma design context, outputs 1-5 epics and the supporting stories with Figma screen references in acceptance criteria. Offers to create directly in Jira.

## Notes

- Epic + Story only — never tasks. Implementation detail belongs in acceptance criteria
- The Job Story format ("When I am...") captures real user situations, not abstract roles
- The strategic Why in each story lets engineers scope edge cases without checking the PRD
- Out-of-scope PRD items are listed explicitly; they do not get stories
- PRD gaps are surfaced, never silently filled with assumptions
- Stories are conversation starters, not full specifications. Sprint planning and design sessions fill in detail
