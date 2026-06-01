---
description: Process raw notes from a PRD walkthrough session and update the Confluence PRD with a Stakeholder Q&A section and refreshed Open Questions table
argument-hint: "<Confluence PRD URL> <raw walkthrough notes — pasted, file path, or transcript>"
---

# /prd-walkthrough -- Post-Walkthrough PRD Update

Turn raw notes from a PRD review session into structured updates on the Confluence PRD. Extracts every question raised, classifies each as resolved or unresolved, and adds two sections to the PRD: Stakeholder Q&A for answered questions and an updated Open Questions table for anything still open.

## Invocation

```
/prd-walkthrough https://yourco.atlassian.net/wiki/spaces/PRD/pages/123 [paste notes]
/prd-walkthrough https://...prd-page [path/to/walkthrough-notes.md]
/prd-walkthrough use the PRD we just published [paste notes]
```

## What you need

- **PRD location** — Confluence URL of the PRD being walked through
- **Walkthrough notes** — in any rough form: bullet points, a dump of questions, a meeting transcript, or a file path

## Prerequisite

**Atlassian MCP must be connected.** The skill needs to fetch the current PRD and submit an updated version. If MCP is not connected, the skill will stop and tell you how to connect it.

## Workflow

Apply the **prd-walkthrough** skill at `pm-execution/skills/prd-walkthrough/SKILL.md`. The skill runs in four steps:

1. **Fetch and parse** — fetch the current PRD from Confluence, read the walkthrough notes
2. **Extract questions** — pull every question raised in the session and classify each as Resolved (answer was given) or Unresolved (no clear answer or needs follow-up)
3. **Preview and confirm** — show you a structured preview of what will be added before touching Confluence; you can correct any classification or wording
4. **Update Confluence** — append the Stakeholder Q&A section and refresh the Open Questions table; existing PRD content is preserved exactly

## Output

Two sections added or updated on the PRD:

- **Stakeholder Q&A** — resolved questions with full-sentence answers including reasoning. Appended to existing Stakeholder Q&A if it already exists.
- **Open Questions** — unresolved questions with owner (team or role, not person) and status. Rows appended to existing table if present.

After the update, get the Confluence page URL plus offers to create Jira tickets for open questions or draft a stakeholder summary message.

## Notes

- **Questions only get added if they were raised in the session.** The skill does not invent questions or fabricate answers — partial context with no clear answer becomes an Open Question, not a Q&A entry.
- **The original PRD content is never rewritten.** Only the two new sections are added or appended.
- **Always shows a preview** and waits for explicit confirmation before updating Confluence — you can edit phrasing or move items between Resolved and Unresolved.
- **Use the language from your notes.** Stakeholders should recognise their own questions when they read the PRD; the skill does not sanitise phrasing into generic PM-speak.
