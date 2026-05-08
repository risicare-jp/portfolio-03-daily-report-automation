# Multi-location Daily Report Automation

**Three F&B locations report through three different tools. One bilingual digest at 06:00 every day. Severity flagged against last year same day — the comparison F&B operators actually trust. AI-written, but anomaly detection is deterministic.**

▶︎ **[Watch the 90-second demo on Loom](LOOM_URL_TBD)** — see a multi-location daily digest get assembled and routed to Slack and Notion, end to end.

> *As a former heavy-industry QA welder in nuclear power plant maintenance and a Vancouver front-of-house manager, I bring a zero-defect mindset to bilingual multi-location operations. An area manager who reads three daily reports across three tools spends thirty minutes a day finding the one thing that matters. This pipeline finds it for her.*

This is the third project in a Portfolio sequence aimed at Japanese F&B groups operating in North America. See also:

- [Portfolio 01 — Bilingual Restaurant SOP Generator](https://github.com/risicare-jp/portfolio-01-sop-generator) — back-office bilingual documentation
- [Portfolio 02 — Real-time Allergen Decision Support](https://github.com/risicare-jp/portfolio-02-realtime-allergen) — service-floor allergen decisions

This one is the multi-location oversight tier: three locations report through Sheets, Notion, and Slack; one bilingual digest lands in the area manager's Slack and Notion every morning at 06:00 local time.

---

## What it does

1. **06:00 daily cron** triggers the n8n workflow.
2. **Three source pulls in parallel**:
   - Google Sheets (location A — date-keyed rows)
   - Notion DB (location B — long-text shift notes)
   - Slack channel (location C — one message per day in a private channel)
3. **Normaliser + deterministic flagger** (Code node): each location is converted into a common `LocationDailyReport` schema and classified red / orange / yellow / green based on threshold rules.
4. **Prompt builder** (Code node): formats the structured reports as a labelled user message.
5. **Claude Haiku 4.5** (Anthropic Messages API): writes a bilingual digest — one English paragraph + one Japanese paragraph, separated by a blank line.
6. **Output payload builder** (Code node): splits English / Japanese, computes max severity across locations, packages Slack attachment + Notion property mapping.
7. **Fan-out**: the same payload is routed to:
   - **Slack** (severity-colored attachment in `#portfolio-03-daily-digest`)
   - **Notion** (one new database page per day with structured properties)

Severity is conveyed by:

- **Title prefix emoji**: 🔴 (red) / 🟠 (orange) / 🟡 (yellow) / 🟢 (green).
- **Slack attachment color**: Slack legacy preset (`danger` / `warning` / `good`).
- **Notion select tag**: Red / Orange / Yellow / Green with matching colors.

When multiple locations are flagged, the highest-severity color is the headline. Red beats orange beats yellow beats green.

---

## See it in action

_(Screenshots TBD — recommend: (1) Slack digest with 🔴 title + bilingual body + Burnaby red sidebar, (2) Notion DB with rows for several days showing the audit log shape, (3) n8n canvas overview showing the pipeline)._

The output: a Slack digest message with a single severity-named title line, two short bilingual paragraphs, and a recommended action; mirrored in a Notion database page with structured properties for downstream querying.

---

## The deterministic flagger

A location is flagged if any of these hold for the day:

| Rule | Condition | Severity | Reasoning |
| :-- | :-- | :-- | :-- |
| Sales major drop | `sales < 80% × baseline` | 🔴 **red** | Owner-perspective: a 20%+ drop signals something structurally wrong (competitor opened, social media incident, walk-out). |
| Sales mild dip | `80% ≤ sales/baseline < 90%` | 🟡 **yellow** | Mild dip with many possible external causes. Worth observing, not necessarily acting. |
| Waste rate | `waste / sales > 10%` | 🟠 **orange** | Operational issue with a known root cause — likely equipment failure, contained to one shift. |
| Complaints | `complaints ≥ 1` | 🟠 **orange** | Customer-facing incident requiring service or food-safety follow-up. |

### Sales baseline: year-over-year primary, trailing 7-day fallback

```
if (sales_same_day_last_year is available) {
    baseline = sales_same_day_last_year     // PRIMARY — what F&B operators actually trust
} else {
    baseline = mean(prior 7 days, excluding today)  // FALLBACK — new locations only
}
```

**Year-over-year is the canonical baseline in restaurant operations.** Trailing-window averages are dominated by day-of-week, season, holiday, and local-event effects — every signal an area manager wants to see *through*, not measure against. YoY controls for all of those automatically: same Tuesday last year, same May 4 last year, same post-holiday week.

The trailing 7-day fallback exists for **new locations only** — units that have not yet accumulated a year of history. Once a location crosses its 1-year mark, it switches to YoY automatically without code changes. The data layer just starts populating `sales_same_day_last_year`.

**No AI in the flag rules.** The matrix decides whether something is anomalous; Claude only writes about it.

---

## The AI summariser — sentence budget enforced

The system prompt enforces an explicit per-scenario budget rather than a loose "3-5 sentences" range.

| Scenario | Total sentences per paragraph | Structure |
| :-- | :-- | :-- |
| All locations green | **2** | (1) greeting + count + "all within normal range". (2) one-sentence positive note. |
| 1 location flagged | **3-4** | (1) greeting + count + "today needs your attention at one". (2) flagged location + all triggering numbers + cause from shift notes in the same sentence. (3) recommended action. (4, optional) closer noting other locations are clean. |
| 2+ locations flagged | **4-5** | (1) greeting + count. (2…N+1) one sentence per flagged location: name + numbers + cause. (last) combined recommendation + remaining clean locations. |

**No invention rule**: the model never fabricates a cause. If `shift_notes` is empty, the digest reports "shift notes are blank so the root cause isn't yet clear" and the recommendation adapts to "diagnose what happened" instead of a cause-specific call. This is verified by an explicit `data missing` test fixture — see [Verification](#verification).

For our reference Day 14 — Burnaby in red, others green — the digest renders:

> Morning, Tomoko-san — three locations reported and today needs your attention at one. Burnaby Metrotown is in red with sales at 75.7% of same day last year (CAD 2,650 vs 3,500 baseline), waste at 37.0% of revenue, and two shellfish-allergen complaints after the walk-in cooler failed at 4 pm. Recommend a 10-minute call with the Burnaby PM before lunch service. Vancouver Downtown and Richmond Aberdeen both reported clean.
>
> おはようございます、智子さん — 3拠点から日報を受信し、本日は1店舗で要対応です。Burnaby Metrotown 店が赤判定で、売上が前年同日の75.7%（CAD 2,650 / 前年同日 3,500）、廃棄率37.0%（基準10%）、午後4時の冷蔵庫故障に伴い貝アレルギー対応のクレーム2件が記載されています。ランチ営業開始前に Burnaby PM と10分の通話を推奨します。Vancouver Downtown と Richmond Aberdeen は通常範囲内です。

---

## Architecture

```
[06:00 cron]
        │
        ▼
[3 source pulls in parallel]
  ├─ Google Sheets    (location A, date-keyed)
  ├─ Notion DB        (location B, long-text shift notes)
  └─ Slack channel    (location C, daily message)
        │  raw items merged, bucketed by source, parsed
        ▼
[Code node: normaliser + deterministic flagger]
        │  3 LocationDailyReport items, each with severity + flags array
        ▼
[Code node: digest prompt builder]
        │  formatted user message; system prompt is separate
        ▼
[Anthropic: Message a Model — claude-haiku-4-5]
        │  bilingual digest text (EN paragraph + blank line + JA paragraph)
        ▼
[Code node: output payload builder]
        │  splits EN / JA; computes max severity across locations;
        │  packages Slack attachment fields + Notion property mapping
        ▼
   ┌─→ [Slack: chat.postMessage]   (severity-colored attachment)
   └─→ [Notion: Create database page]  (Date / Severity / Digest EN / Digest JA / Locations flagged / Source count)
```

**Model**: `claude-haiku-4-5` — short structured input, short structured output, daily cadence. Single constant; can be swapped to `claude-sonnet-4-6` if a client wants higher writing nuance.

**Prompt caching is not applied.** With a daily cadence (24h between calls) the 5-minute ephemeral cache TTL never hits. Worth wiring at higher cadence (per-shift, per-region).

---

## Tech stack

- **Orchestration**: n8n.cloud (free tier for the demo; self-host for production)
- **AI**: Anthropic Messages API, model `claude-haiku-4-5`
- **Sources**: Google Sheets API / Notion API / Slack API (Channel resource, History operation)
- **Sinks**: Slack `chat.postMessage` / Notion Create Database Page
- **Cron**: n8n's built-in Cron node (06:00 local timezone)

The three source tools are deliberately heterogeneous — real chains rarely standardise. The pipeline demonstrates that you can integrate whatever the locations already use.

---

## Repository layout

| Path | Purpose |
| --- | --- |
| `assets/digest-system-prompt.md` | Canonical system prompt for Claude (sentence budget, tone rules, severity tiers, privacy rules, example) |
| `assets/digest-builder.js` | n8n Code node — formats the structured reports into a user message |
| `assets/normaliser-flagger.js` | n8n Code node — parses each source, applies deterministic flag rules, outputs `LocationDailyReport[]` |
| `assets/sensitive-info-redact.js` | n8n Code node — regex-based PII redactor for `shift_notes` between normaliser and digest builder |
| `assets/output-payload-builder.js` | n8n Code node — splits EN/JA digest, computes max severity, packages Slack + Notion fields |
| `assets/cost-log-builder.js` | n8n Code node — parallel branch off Anthropic, computes USD cost from `usage`, outputs row for Sheets append |
| `assets/source-pull-instructions.md` | Step-by-step n8n setup for the three source nodes (Sheets / Notion / Slack) |
| `assets/smoke-test-instructions.md` | First-run verification — minimal 3-node workflow that proves credentials work end-to-end |
| `assets/day4-n8n-config.md` | Wiring instructions for the redactor, cost log, and the Anthropic Simplify-Output flip |
| `assets/test-fixtures/edge-all-green.json` | All 3 locations clean — verifies all-green digest path |
| `assets/test-fixtures/edge-data-missing.json` | Burnaby red but `shift_notes: null` — verifies no-invention behavior |
| `assets/test-fixtures/edge-multi-flag.json` | Burnaby red + Richmond orange — verifies multi-flag precedence and per-location detail |
| `assets/location-a-sheet.csv` | Sample data for location A (Google Sheets format) |
| `assets/location-b-notion.csv` | Sample data for location B (Notion CSV import format) |
| `assets/location-c-slack-posts.md` | Sample data for location C (one message per day to paste in Slack) |
| `docs/setup.md` | _(TBD)_ End-to-end setup walkthrough |

The runtime lives in n8n (cloud or self-host). The git-tracked source of truth is `assets/`. Editing the canonical files and pasting into n8n is the deliberate workflow during demo iteration; for production, the n8n workflow JSON export is the next deliverable.

---

## Verification

Three test fixtures are kept in `assets/test-fixtures/` and verified end-to-end through Slack and Notion. To run a fixture: pin the upstream Code node's output in n8n with the fixture JSON, then execute downstream from `Build digest prompt` onward.

| Fixture | Expected sentences (EN/JA) | Expected title | What it verifies |
| :-- | :-: | :-- | :-- |
| Real data (no fixture) | 4 / 4 | 🔴 Burnaby red | Single-flag baseline |
| `edge-all-green.json` | 2 / 2 | 🟢 all clear | Sentence budget compresses correctly when all clean |
| `edge-multi-flag.json` | 5 / 5 | 🔴 Burnaby red, Richmond orange | Severity precedence; per-location detail; combined recommendation |
| `edge-data-missing.json` | 4 / 4 | 🔴 Burnaby red | No invention; honest gap reporting; recommendation adapts to "diagnose" |

A passing run produces a Slack post and a Notion database row that mirror the digest text and the severity classification.

---

## Cost profile

`claude-haiku-4-5` at $1 / $5 per million tokens (input / output).¹ Numbers below are **measured**, not estimated — captured by the cost log Sheet that runs as a parallel branch off every Anthropic call (see [Operator-grade defaults](#operator-grade-defaults)).

| Scenario | Input | Output | Cost per digest |
| --- | --- | --- | --- |
| Daily digest (3 locations, 1 flagged) | ~1,800 tokens | ~400 tokens | **~$0.004** |
| 30 digests / month / chain | — | — | **~$0.12** |
| 90 digests / month (3 chains, 1 each) | — | — | **~$0.36** |

The Anthropic cost is rounding error compared to n8n hosting. Self-host n8n on a $5/month VPS and the pipeline runs for the cost of electricity.

> ¹ Pricing snapshot — verify the current rates at [anthropic.com/pricing](https://www.anthropic.com/pricing). The rate table lives in `assets/cost-log-builder.js` and is the single place to update when pricing changes.

---

## Operator-grade defaults

Three things this pipeline does quietly, because an operator running it in production should not have to ask:

**Shift notes are scrubbed before they reach the LLM.** Free-text shift notes can plausibly contain customer phone numbers, emails, or payment-card-shaped strings. A regex-based redactor (`assets/sensitive-info-redact.js`) sits between the normaliser and the digest builder, strips obvious PII patterns (NA-format phone, email, 13-19 digit card-like sequences, 9-digit SIN-like sequences) and replaces them with explicit `[redacted-...]` tokens. The system prompt also instructs the model not to echo personal names appearing in notes. This is a defensive layer, not a compliance claim — name detection requires NER and is left out of scope; the trade-off is documented in the file header.

**The model is held honest when data is missing.** When `shift_notes` is null or a flag has no obvious cause, the model is required to surface the gap ("shift notes are blank so the root cause isn't yet clear") rather than invent a reason. Verified end-to-end with an `edge-data-missing.json` test fixture; the recommendation adapts from "confirm the cooler repair" to "diagnose what happened" without code changes.

**Token usage and dollar cost are logged on every run.** A separate Google Sheet captures `timestamp_iso`, `run_date`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `cost_usd`, and `digest_source` for every Anthropic call. An operator running this for a paying client should be able to answer "what did this cost last month" in 30 seconds, with receipts. The append node sits on a parallel branch off the Anthropic node, so a Sheets failure cannot block the Slack/Notion delivery.

---

## Setup (overview)

_(Detailed walkthrough in `docs/setup.md` — TBD)_

1. **n8n instance**: n8n.cloud free tier, or self-host with Docker on any VPS.
2. **Anthropic API key**: from console.anthropic.com. Set as n8n credential.
3. **Source credentials**: Google Sheets OAuth, Notion integration token (with the source databases shared), Slack bot token (with `channels:history` / `groups:history` for the source channels and `chat:write` for the digest channel).
4. **Sink credentials**: same Slack token (with `chat:write`); same Notion token (with the digest DB shared). Create the digest channel and digest DB; share the Notion integration with the digest DB.
5. **Build the workflow**: paste the four Code nodes from `assets/` into n8n, wire the source pulls and sinks, set the cron node to 06:00 local time.
6. **Test**: run the `edge-all-green.json` fixture through the pinned workflow first to verify the AI summariser; then unpin and run with real data.

A full new chain onboarding is roughly **30 minutes** if the chain already has Sheets / Notion / Slack accounts.

---

## What's deliberately not in scope

This is a five-day build with a hard scope. What's deferred:

- **Email output channel** (Sendgrid/SMTP) — Slack + Notion cover the demo. Email becomes the third sink when a paying client asks.
- **Anthropic prompt caching** — daily cadence makes the 5-minute TTL useless. Worth wiring at higher cadence.
- **Statistical anomaly detection** (z-scores / control limits) — current threshold rules work for one chain's data. Statistical detection is the next layer when working across a portfolio of chains.
- **Multi-language extension** — the system prompt is bilingual EN + JA. Spanish / French / simplified Chinese require system prompt expansion + sentence budget recalibration per language.
- **Comprehensive edge-case fuzzing** — three main fixtures verified end-to-end. Multi-flag, partial source failure, source schema drift, and schema mismatch are documented as future work.

These are deliberate cuts, not oversights. Each is one PR away from being added.

---

## Known limitation: Slack colored sidebar in web client

Slack's legacy attachment colored sidebar is **not visible in Slack web client** for attachment-only messages, even though the API receives the color value (verified — `color: a30200` for `danger`/red). Severity is conveyed reliably by the title emoji prefix (🔴/🟠/🟡/🟢) and the severity word in the title text, which render correctly across all clients.

If pixel-perfect colored sidebar is required, replace the Slack node with an HTTP Request node calling `chat.postMessage` directly with `attachments[].color + attachments[].blocks`. The current shape covers the operational signal (severity + named location + numbers + recommendation) without needing the bar.

---

## Licensing & usage

MIT-licensed for reference and adaptation. Your reports — and the generated digests — remain entirely yours. No data passes through anything other than your n8n instance and the Anthropic API.

---

## Hire me

If you run a multi-location Japanese F&B chain in North America, or you are scoping ops tooling for a Japanese F&B group expanding here — *daily-digest pipelines, multi-source data integration, severity-routed alerts, bilingual ops summaries, deterministic anomaly detection with an AI explanation layer* — I take this on as freelance work on Upwork.

- **Upwork**: https://www.upwork.com/freelancers/~011e69140153120f93
- **Email**: risicare929@gmail.com
- **Notion case study**: _(URL TBD on 2026-05-08)_
