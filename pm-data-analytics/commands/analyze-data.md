---
description: Analyze any product or engineering data — auto-detects whether you need cohort analysis, error RCA, funnel analysis, trend investigation, user segmentation, or general exploration
argument-hint: "<data file, log, CSV, or description of what you're trying to understand>"
---

# /analyze-data -- PM Data Analysis

Give me any data and any question. I'll figure out what analysis is needed, parse the data before making claims about it, find patterns you didn't ask for, and tell you what to do about it.

## Invocation

```
/analyze-data [upload any CSV, log file, or data export]
/analyze-data Why did our D30 retention drop from 62% to 48% last month?
/analyze-data [upload error logs] RCA on the Experian hard pull failures
/analyze-data Our checkout funnel conversion dropped 8 points — find where
/analyze-data [upload event data] Which users are churning and why?
```

## Workflow

### Step 1: Understand the Data Before Claiming Anything

Before running any analysis framework, read and classify the data:

- What format is it? (structured rows, log lines, aggregated metrics, event stream, error output)
- What does each row represent? (a user, an event, an error, a transaction, an aggregate)
- What is the time range and volume?
- Are there data quality issues? (nulls, truncation, duplicate rows, ID format inconsistencies)
- What is the data NOT telling us? (flag gaps that would change conclusions)

State this classification explicitly before proceeding. Do not assume a data format from the file extension alone.

### Step 2: Classify the Analysis Type

Route to the right framework based on the data and the question:

| Signal in data or question | Analysis mode |
|---------------------------|---------------|
| User IDs + timestamps + events over time | Cohort / retention analysis |
| Error logs, failure counts, repeated failures per entity | Error RCA |
| Steps in a sequential flow with drop-off between steps | Funnel analysis |
| A metric moving up or down with no clear cause | Trend and anomaly investigation |
| Users or events with no prior segmentation | User / event segmentation |
| Control group + variant group + outcome metric | A/B test analysis |
| Raw data with no specific question | Exploratory analysis |

If the data could route to more than one mode, state the ambiguity, pick the most useful one, and note what a second analysis would add.

### Step 3: Apply the Right Analysis Mode

Apply the **data-analysis** skill.

**Cohort / retention analysis:**
- Define the cohort (signup period, first event, acquisition channel)
- Define the retention event (meaningful action, not just login)
- Build the retention table by period (D7, D30, D90, or weekly/monthly)
- Identify the best and worst cohorts, explain the gap
- Flag seasonal effects masquerading as trends

**Error RCA:**
- Parse entities (user IDs, request IDs, services) from log lines
- Classify by failure frequency: chronic (stuck in retry loop) vs. transient (one-time burst) vs. single-event
- Analyse retry cadence — is the system retrying aggressively without backoff?
- Identify volume spikes and determine whether they are new failures or existing ones retrying faster
- Separate "resolved" from "abandoned" — silence and success look identical in error logs
- Estimate business impact: how many users are blocked from a key flow?

**Funnel analysis:**
- Map each step explicitly with its event name and user count
- Calculate step-by-step conversion and cumulative conversion from top
- Identify the single largest drop-off step
- Segment the funnel by user type, channel, or device to isolate where the drop is concentrated
- Distinguish between users who abandoned vs. users who took an alternative path

**Trend and anomaly investigation:**
- Plot the metric over time at the right granularity (daily noise hides weekly signal; monthly averages hide spike days)
- Identify the inflection point — when exactly did the metric change?
- Check whether the change is in volume, rate, or both
- Cross-reference with product changes, campaigns, or external events near the inflection point
- Decompose: is the trend driven by one segment or broad-based?

**User / event segmentation:**
- Classify users or events into behavioural groups based on frequency, recency, and magnitude
- Label each segment by what distinguishes it, not just a number (e.g., "high-frequency short-session" not "Cluster 2")
- Size each segment and calculate its share of total volume
- Identify which segments are growing and which are shrinking over the window

**A/B test analysis:**
- Validate test setup before reading results: sufficient sample size, full business cycle run, no sample ratio mismatch
- Calculate p-value, confidence interval, and relative lift
- Check guardrail metrics — a winning primary metric with degraded guardrails is not a true win
- Recommend: Ship / Extend / Stop / Investigate, with explicit reasoning

**Exploratory analysis:**
- Summarise the data: row count, date range, unique entities, key dimensions
- Identify the 3 most interesting patterns without being prompted
- Flag anomalies and outliers immediately
- Propose 2–3 follow-up questions the data is capable of answering

### Step 4: Generate the Report

```
## Data Analysis: [Description]

**Date**: [today]
**Analysis type**: [which mode and why]
**Data**: [source, row count, date range, key dimensions]

### Data Quality Assessment
[What the data is, what it is not, any gaps that matter]

### Key Findings
1. **[Finding]** — [specific number or pattern]
2. **[Finding]** — [specific number or pattern]
3. **[Finding]** — [specific number or pattern, including one the user did not ask for]

### [Mode-specific section]
[Retention table / Error cohort table / Funnel table / Trend breakdown / Segment table / Test results]

### Business Impact
[Connect findings to a decision, a user flow, or a revenue/cost implication. Quantify where possible.]

### Recommendations
1. [Immediate action — specific, ownable, measurable]
2. [Systemic fix — what changes to prevent recurrence]
3. [Monitoring — what alert or metric to add]

### Follow-Up Queries
[SQL queries to go deeper, specific to the analysis findings]

### Data Gaps
[What this analysis cannot answer and what data would fill the gap]
```

### Step 5: Offer Next Steps

- "Want me to **segment this further** — I can cut by [dimension] which may explain the pattern."
- "Should I **write the SQL** to pull this from your warehouse on a recurring basis?"
- "Want me to **design an experiment** to test the fix?"
- "Should I **run the RCA on a specific sub-segment** of these users?"

## Notes

- Parse the data before naming the analysis type. An error log is not a cohort dataset even if it has user IDs and timestamps.
- Numbers anchor every finding. "Users are failing" is not a finding. "11 users have been stuck for 10–27 days, generating 89% of error volume" is.
- Always look for one pattern the user did not ask for. The most useful finding is usually the one that reframes the question.
- Silence and success look identical in most logs — flag when you cannot distinguish resolution from abandonment.
- If the data has an ID format anomaly (e.g., two different ID schemes for the same entity type), investigate before drawing conclusions. Mixed ID formats often indicate merged systems, test accounts, or a data pipeline issue.
- Recommendations must be specific enough to assign to a person. "Fix the retry logic" is not a recommendation. "Implement exponential backoff with a circuit breaker after 5 consecutive failures" is.
