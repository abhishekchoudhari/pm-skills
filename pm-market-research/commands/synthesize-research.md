---
description: Synthesize a body of user research — interviews, surveys, usability tests, NPS — into JTBD themes, segment patterns, and recommended actions
argument-hint: "<paste transcripts/notes or describe the study>"
---

# /synthesize-research -- User Research Synthesis

Transform a corpus of raw user research into structured product insight: JTBD themes, segment patterns, satisfaction signals, and decision-ready recommendations.

## Invocation

```
/synthesize-research [paste 8 interview transcripts from churned users]
/synthesize-research 12 usability tests + 200 NPS responses — need insights for Q2 planning
/synthesize-research [describe the study and decision you're trying to inform]
```

## Workflow

Apply the **user-research-synthesis** skill to:

1. Understand the research corpus (sources, participants, decision to inform)
2. Extract raw signals across all sources
3. Identify 3–6 JTBD themes with evidence, frequency, and intensity
4. Surface segment patterns where themes diverge by user type
5. Separate satisfaction, tolerance, and abandonment signals
6. Rate synthesis confidence transparently
7. Produce specific, traceable recommendations
8. Flag research gaps and decision readiness

## Notes

- Different from `/interview` — that handles a single session; this synthesizes a whole study
- Handles mixed sources: transcripts, surveys, NPS, support tickets, app reviews
- Always asks what decision the research needs to inform — synthesis without a decision target is documentation, not insight
