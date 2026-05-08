# Block 3 — Source-pull workflow setup

**Goal**: build the n8n workflow that fetches yesterday's record from all 3 locations (Sheet / Notion / Slack) into a single normalized stream, with severity flags computed.

**Workflow name in n8n**: `portfolio-03-daily-report-mvp`

**Time budget**: ~2h.

**Prereqs**: Block 1 (smoke test) ✅ pass + Block 2 (sample data) ✅ populated.

---

## Workflow shape

```
[Manual Trigger]
       │
       ├─→ [Sheets: Get rows] → [Set: source="sheet"]    ┐
       ├─→ [Notion: Get DB pages] → [Set: source="notion"] ├─→ [Merge] → [Code: normaliser+flagger] → (Block 4 output)
       └─→ [Slack: Get messages] → [Set: source="slack"]   ┘
```

**Design choice**: each source pulls *all rows* (14 sheet rows / 14 Notion pages / last 20 Slack messages) and the Code node downstream picks the yesterday-matching record from each. This keeps n8n GUI configuration simple — all date filtering and shape logic lives in JS where it's testable.

---

## Step 1 — Manual Trigger

Drop a **Manual Trigger** node (or **Schedule Trigger** with cron `0 6 * * *` for production).

For Day 1 testing: use Manual Trigger.

---

## Step 2 — Branch A: Google Sheets (Location A)

### Node: Google Sheets — Get Row(s) in Sheet

- Credential: `gsheets-portfolio-03`
- Operation: **Get Row(s) in Sheet**
- Document: `portfolio-03-loc-a` (the sheet you populated in Block 2)
- Sheet: `data` (or whatever tab name you used)
- **Return all rows**: yes (no filter)
- Output: 14 rows of `{ date, sales_cad, waste_cad, covers, complaints, shift_notes }`

### Node: Set — tag source

- Mode: **Manual Mapping**
- Add field: `source` (string) = `sheet`
- Toggle **Keep Only Set**: OFF (preserve original sheet fields)

Wire: Manual Trigger → Sheets → Set("sheet")

---

## Step 3 — Branch B: Notion (Location B)

### Node: Notion — Get Many Database Pages

- Credential: `notion-portfolio-03`
- Resource: **Database Page**
- Operation: **Get Many**
- Database: select `portfolio-03-loc-b`
- Return All: ON
- **Simplify Output**: ON ← important; flattens `{ "Date": "2026-05-04", "Sales CAD": 2650, ... }` instead of the nested `properties` shape

### Node: Set — tag source

- Add field: `source` (string) = `notion`
- Keep Only Set: OFF

Wire: Manual Trigger → Notion → Set("notion")

---

## Step 4 — Branch C: Slack (Location C)

### Node: Slack — Get Many Messages

- Credential: `slack-portfolio-03`
- Resource: **Message**
- Operation: **Get Many**
- Channel: `#portfolio-03-loc-c-daily`
- Return All: OFF
- Limit: `20` (covers 14 backfill posts + buffer)

### Node: Set — tag source

- Add field: `source` (string) = `slack`
- Keep Only Set: OFF

Wire: Manual Trigger → Slack → Set("slack")

---

## Step 5 — Merge

### Node: Merge

- Mode: **Append** (concatenates all 3 branches' items into one stream)
- Number of Inputs: 3

Wire: all three Set nodes → Merge

After this, the Merge node outputs ~48 items (14 + 14 + 20). Each item has its `source` field plus all the original fields from its source node.

---

## Step 6 — Code node (Block 4)

The Code node implements the normaliser + flagger. See `normaliser-flagger.js` in this directory — copy that whole file into the Code node's editor.

- Node type: **Code**
- Mode: **Run Once for All Items**
- Language: **JavaScript**

Wire: Merge → Code

Output: array of 3 `LocationDailyReport` items, one per location, with severity flags pre-computed.

---

## Verification (Day 1 acceptance test)

After running the workflow once via Manual Trigger:

- [ ] Each branch's source node shows non-empty output (Sheets: 14 items, Notion: 14 items, Slack: 14-20 items).
- [ ] Each Set node correctly tags items with `source` field.
- [ ] Merge node outputs ~48 items.
- [ ] Code node outputs **exactly 3** items (one per location).
- [ ] Location A item: `severity: "green"`, `flags: []`.
- [ ] Location B item: `severity: "red"`, `flags` contains `sales_major_drop`, `waste_high`, `complaints_present`.
- [ ] Location C item: `severity: "green"`, `flags: []`.

If all four check, **Day 1 done**. Save the workflow.

If something doesn't match, log the discrepancy in `portfolio-03-day1-worklog.md` under "Blockers / questions" and address before moving to Day 2.

---

## Known limitations (to address in later days, not Day 1)

- **Slack complaints**: the Slack post format doesn't have a structured `complaints` field. The Code node defaults Slack-source complaints to `0`. If a Day-14 Slack post in production ever mentions a complaint in the free-text Notes section, we miss it. Day 4+: add an AI-extract step (or a Slack post template change) to handle this.
- **Date format in Slack**: parser assumes "Mon May 4" → "2026-05-04" using current year. Year-boundary edge case (Dec→Jan) untested. Day 4+: add explicit year handling.
- **Empty source**: if any source returns 0 items, the Code node will emit 0 reports for that location. No graceful "data unavailable" badge yet. Day 4+: add a missing-data branch in the digest.
