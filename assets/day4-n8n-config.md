# Portfolio 3 — Day 4 n8n Wiring Instructions

> Two new Code nodes go in today (sensitive-info redactor, cost log builder), and one existing node setting flips. Estimated wiring time: ~25 minutes.

## 1. Insert the Sensitive-Info Redactor

**Where**: between `Block 4 normaliser-flagger` and `Build digest prompt`.

1. In `portfolio-03-daily-report-mvp`, click the connection between `Block 4 normaliser-flagger` and `Build digest prompt` and delete it.
2. Add a new **Code** node. Name it `Redact PII`.
3. Mode: **Run Once for All Items**.
4. Paste the contents of `sensitive-info-redact.js`.
5. Wire `Block 4 normaliser-flagger` → `Redact PII` → `Build digest prompt`.
6. Run from `Block 4` downward and confirm:
   - All 3 reports still flow through with the same `severity`/`flags`/etc.
   - Each report now has a `redactions` field (`{}` for clean notes; `{ phone: 1 }` etc. when matches).
   - For our canonical sample data, all three should show `redactions: {}` since none of the seeded shift_notes contain PII tokens.

**Quick test**: temporarily edit the Location B Notion DB row's `Shift Notes` to include `Called Mr. Tanaka 604-555-0142` and re-run. Expect the redactor output to show `shift_notes: "...[redacted-phone]..."` and `redactions: { phone: 1 }`. Restore the original notes after verifying.

## 2. Flip Anthropic node to raw response

**Where**: `Anthropic — Daily Digest` (the Message a Model node).

1. Open node settings.
2. Set **Simplify Output**: **OFF**.
3. Save.
4. Re-run the workflow and confirm `Build output payload` still produces the right `digest_text` (it handles both shapes; the existing code line is `incoming.content?.[0]?.text ?? incoming.text`).

This change is required so the cost log can read `usage.input_tokens` / `usage.output_tokens` / `model` from the raw response.

## 3. Create the Cost Log Sheet

In your existing Google account that already hosts the Location A Sheet:

1. Create a new Sheet titled **`Portfolio 03 Cost Log`** (one tab named `log` is fine).
2. Header row (row 1), in this exact column order:

   | A | B | C | D | E | F | G | H |
   | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
   | timestamp_iso | run_date | model | input_tokens | output_tokens | total_tokens | cost_usd | digest_source |

3. Note the Sheet ID (the long string in the URL between `/d/` and `/edit`).

## 4. Add the Cost Log branch in n8n

**Where**: parallel branch off the Anthropic node, alongside `Build output payload`.

1. Add a new **Code** node. Name it `Build cost log row`.
2. Mode: **Run Once for All Items**.
3. Paste the contents of `cost-log-builder.js`.
4. Wire `Anthropic — Daily Digest` → `Build cost log row` (the Anthropic node now feeds two children: the existing `Build output payload` and this new node).
5. Add a **Google Sheets** node. Name it `Append cost row`.
   - Resource: **Sheet Within Document**
   - Operation: **Append Row**
   - Document: select `Portfolio 03 Cost Log`
   - Sheet: `log`
   - Mapping: **Map Each Column Manually** with all 8 columns mapping to the matching field from the previous node (e.g. column `timestamp_iso` ← `{{ $json.timestamp_iso }}`).
6. Wire `Build cost log row` → `Append cost row`.
7. Run end-to-end. Verify a new row lands in the Sheet on each successful run.

## 5. Verification checklist

After wiring all three changes, run the full workflow once and confirm:

- [ ] Slack receives the digest in `#portfolio-03-daily-digest` (existing behaviour preserved)
- [ ] Notion adds a row to `Portfolio 03 Daily Digest` (existing behaviour preserved)
- [ ] `Portfolio 03 Cost Log` Sheet has a new row with sensible token counts (Haiku digest is typically ~800-1,200 input tokens, ~200-400 output tokens — more than this means the redactor or builder regressed)
- [ ] `cost_usd` is non-zero and small (typical: $0.001-$0.005 per run — under a cent)
- [ ] `redactions` field on the redactor output is `{}` for clean canonical data

If any check fails, capture the n8n run URL and the failing node's input/output JSON before tweaking.
