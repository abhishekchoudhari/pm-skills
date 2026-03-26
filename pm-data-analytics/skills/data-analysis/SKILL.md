---
name: data-analysis
description: "Expert PM data analysis across multiple modes — error RCA, cohort retention, funnel drop-off, trend investigation, user segmentation, A/B test evaluation, and exploratory analysis. Use when the analysis type is unclear, when the data needs classification before analysis, or when the question spans more than one analytical framework."
---

# PM Data Analysis — Expert Mode

## Purpose

Analyse any product or engineering dataset with the depth of an experienced data analyst and the judgement of a senior PM. The output is not a data summary — it is a diagnosis with a decision at the end.

---

## Core principles

**1. Classify the data before running any framework.**
A file with user IDs and timestamps could be an error log, a session log, or a transaction log. Each requires a different analysis. Read the data first, state what it is, and then choose the framework.

**2. Numbers anchor every finding.**
"Retention is declining" is not a finding. "D30 retention dropped from 62% to 48% in the September cohort, driven by users acquired via paid campaigns" is a finding. Every observation must include a specific number.

**3. Find one pattern the user did not ask for.**
The most useful analysis surfaces something the person did not know to ask. Run the requested analysis fully, then look for the adjacent signal.

**4. Connect to a decision.**
Every analysis ends with a recommendation specific enough to assign to a person and measure within 30 days.

**5. Flag what the data cannot answer.**
State the gaps explicitly. "Silence and success look identical in this dataset" is important context. So is "this analysis covers 28 days; a seasonal pattern would require 90+ days to confirm."

---

## Analysis modes

### Mode 1: Error RCA

**When to use:** Data is error logs, failure counts, or repeated failures per entity. The question is "why is this breaking" or "how many users are affected."

**Step 1 — Parse entities and classify failures.**
Extract the key entities (user IDs, request IDs, service names) from raw log lines using regex or structured parsing. Do not eyeball — parse programmatically when data volume exceeds 50 rows.

Classify every entity into a failure type:
- **Chronic**: High error count (10+) or failure span exceeding 48 hours. These entities are stuck.
- **Transient**: Small burst of errors (3–9) in a short window (under 2 hours), then stopped. The system's retry mechanism fired and the issue resolved or the user abandoned.
- **Single-event**: One error, no retry. Either immediately failed with no retry logic, or was manually resolved.

**Step 2 — Analyse retry cadence.**
For chronic entities, calculate the distribution of intervals between consecutive errors:
- Bucket into: under 20 min / 20–60 min / 1–4 hrs / 4–12 hrs / 12+ hrs
- A high concentration in the under-20-min bucket signals aggressive retrying without exponential backoff
- Aggressive retrying inflates error volume, masks the true number of affected users, and may trigger rate limiting from external APIs

**Step 3 — Volume trend.**
Break total errors by day or week. For each period, count:
- Total errors
- Errors from chronic entities
- Unique new entities entering the chronic pool

A declining error count with a growing chronic population means the problem is compounding, not resolving.

**Step 4 — Spike investigation.**
For any day with 2x+ normal error volume, determine:
- Did new entities enter the failure pool on that day?
- Or did existing chronic entities retry more aggressively?
These are different root causes. New entries suggest a systemic trigger. Existing entities retrying faster suggests a change in retry configuration or a cascade.

**Step 5 — Business impact.**
Count entities (users, requests, transactions) currently blocked from completing a key flow. Estimate conversion impact if the blocked flow is revenue-critical. State what "resolved" looks like and whether the data can confirm resolution vs. abandonment.

**Output:**
| Cohort | Entities | Errors | % of volume | Avg span | Still active |
|--------|----------|--------|-------------|----------|-------------|

---

### Mode 2: Cohort / Retention Analysis

**When to use:** Data has user IDs, a signup or activation date, and subsequent activity events. The question is about retention, churn, or long-term engagement.

**Step 1 — Define activation.**
The cohort start event must be meaningful, not just account creation. A user who signed up but never transacted is not an activated user. Confirm the activation event before building cohorts.

**Step 2 — Define the retention event.**
The retention event must reflect genuine engagement. "Logged in" is a weak signal. "Completed a transaction," "used the core feature," or "reached a spending threshold" are stronger.

**Step 3 — Build the retention table.**
Calculate retention at each period (D7, D30, D90 for mobile; Week 1–12 for SaaS; Month 1–6 for financial products). Each cohort is a row; each period is a column; each cell is the % of the cohort still active at that period.

**Step 4 — Identify the patterns.**
- Which cohort has the best and worst D30 retention? What was different about those cohort periods?
- Where is the steepest drop-off? (Between D7 and D30 is an engagement problem; between D30 and D90 is a habit problem; after D180 is a product-market fit signal)
- Is retention trending up, down, or flat across recent cohorts?

**Step 5 — Segment.**
If the data allows, cut retention by: acquisition channel, onboarding completion tier, first feature used, geography. The segment with the largest retention gap is the hypothesis for the root cause.

**Output:**
| Cohort | Size | D7 | D30 | D90 | D180 |
|--------|------|----|-----|-----|------|

---

### Mode 3: Funnel Analysis

**When to use:** Data has sequential steps with a user count or conversion rate per step. The question is where users are dropping off.

**Step 1 — Map the funnel explicitly.**
List each step with its event name and user count. Do not infer steps — confirm each one exists in the data.

**Step 2 — Calculate step-by-step and cumulative conversion.**
Step conversion = users reaching step N / users reaching step N-1.
Cumulative conversion = users reaching step N / users entering step 1.

**Step 3 — Identify the primary drop.**
The single step with the largest absolute user loss is the priority. Relative drop rate matters less than absolute volume lost.

**Step 4 — Segment the drop.**
Cut the funnel by: device type, user segment, acquisition channel, time of day. The drop is rarely uniform — segmentation reveals whether a specific slice is driving the overall number.

**Step 5 — Distinguish abandonment from alternative paths.**
Users who left at step 3 may have taken a different path to completion. Confirm that "drop" actually means "did not convert" before concluding.

**Output:**
| Step | Users | Step conversion | Cumulative conversion | Drop vs prior step |
|------|-------|-----------------|-----------------------|--------------------|

---

### Mode 4: Trend and Anomaly Investigation

**When to use:** A specific metric is moving in an unexpected direction and the cause is unknown.

**Step 1 — Find the inflection point.**
Plot the metric at daily granularity for at least 30 days. Identify the exact date the trend changed. Aggregate metrics (weekly, monthly) hide the day the break happened.

**Step 2 — Decompose.**
Break the metric into its components. If DAU is declining, split into new users, returning users, and resurrected users. The component driving the change is the starting point for the diagnosis.

**Step 3 — Check for co-incidents.**
List product releases, campaigns, pricing changes, and external events (holidays, news, competitor moves) within 7 days of the inflection point. Correlation is not causation but it narrows the hypothesis space.

**Step 4 — Segment.**
Determine whether the trend is broad-based or concentrated. A 10% decline in overall DAU driven entirely by one city or one acquisition channel is a different problem than a broad 10% decline.

**Step 5 — Validate with a counter-check.**
For the leading hypothesis, identify one additional signal that should be true if the hypothesis is correct. If "the new onboarding flow reduced activation" is the hypothesis, then D1 retention for post-launch cohorts should also be lower. Check it.

---

### Mode 5: User / Event Segmentation

**When to use:** Raw user or event data with no prior segmentation. The question is "who are these users" or "what patterns exist in this data."

**Step 1 — Calculate RFM or equivalent dimensions.**
For user data: recency of last activity, frequency of actions in the window, magnitude (spend, session length, transaction size).
For event data: frequency of the event type, entity that generated it, time distribution.

**Step 2 — Classify into segments.**
Use natural breaks in the distribution, not arbitrary percentile cuts. Name each segment by what it represents behaviourally, not by a number.

Common segments that emerge from product data:
- Power users: high frequency, high recency, high magnitude
- At-risk: previously high, now low recency
- Casual: low frequency, periodic returns
- Dormant: no activity in the window
- New: first activity within the window

**Step 3 — Size and trend each segment.**
What % of total users does each segment represent? How has that % changed over the window? A shrinking power user segment and a growing dormant segment is a retention crisis, even if total MAU is flat.

---

### Mode 6: A/B Test Analysis

**When to use:** Data has a control group and one or more variant groups with an outcome metric per user.

**Step 1 — Validate before reading results.**
- Sample size: run a power analysis. If underpowered, the result is unreliable regardless of p-value.
- Duration: did the test run for at least one full business cycle (typically 7–14 days minimum)?
- Sample ratio mismatch: is the actual traffic split close to the intended split? A >5% deviation signals a randomisation problem.

**Step 2 — Calculate statistical significance.**
- Conversion rate for control and each variant
- Relative lift: (variant - control) / control × 100
- p-value using a two-tailed z-test or chi-squared test
- 95% confidence interval for the difference
- Practical significance: is the lift large enough to matter for the business, independent of statistical significance?

**Step 3 — Check guardrail metrics.**
A variant that wins on the primary metric but degrades a guardrail (revenue per user, session depth, error rate) is not a true win. Check all guardrails before recommending a ship.

**Step 4 — Recommend.**
| Outcome | Recommendation |
|---------|---------------|
| Significant positive lift, no guardrail issues | Ship — roll out to 100% |
| Significant positive lift, guardrail concerns | Investigate before shipping |
| Positive trend, not significant | Extend — need more data |
| Flat, not significant | Stop — no meaningful difference |
| Significant negative lift | Do not ship — revert and diagnose |

---

### Mode 7: Exploratory Analysis

**When to use:** Raw data with no specific question, or when the user is not sure what to look for.

**Step 1 — Characterise the dataset.**
Row count, date range, unique entities, key dimensions, null rates per column, ID format consistency.

**Step 2 — Find the three most interesting patterns.**
Do not wait to be asked. Surface the patterns that are most actionable or most surprising. Apply the heuristic: what would a senior PM want to know immediately after seeing this data?

**Step 3 — Flag anomalies and outliers.**
Entities or events that are statistical outliers often represent the most important signal (e.g., one user generating 18% of total error volume; one day with 3x normal activity).

**Step 4 — Propose follow-up questions.**
State 2–3 specific questions this dataset is capable of answering, and what additional data would be needed to answer the questions it cannot.

---

## Python analysis guidelines

When data is provided as a file:
- Parse programmatically — do not manually read more than 10 rows to draw conclusions
- Use pandas for tabular data, re for log parsing
- Print row counts, date ranges, and unique entity counts before starting the analysis
- Generate reusable scripts — the user should be able to re-run the analysis with new data by changing the file path

When data is not provided:
- Generate the SQL query to extract it
- Specify the exact columns needed, the date range, and the grain (one row per user per day, etc.)
- Default to BigQuery dialect unless specified otherwise

---

## Output standards

Every analysis output must include:

1. **Data classification** — what the data is, what it is not, data quality issues
2. **Analysis type selected** — which mode and why
3. **Numbered findings** — each with a specific number, not a direction
4. **Mode-specific table** — retention table, error cohort table, funnel table, etc.
5. **Business impact** — connect to a user flow, conversion metric, or revenue implication
6. **Recommendations** — specific, ownable, measurable within 30 days
7. **Follow-up SQL** — queries to go deeper on the top findings
8. **Data gaps** — what this analysis cannot answer
