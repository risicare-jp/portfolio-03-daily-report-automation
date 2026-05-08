# Block 1 — Smoke Test (5/4 Phase 2)

**Goal**: prove that Sheets + Anthropic + Slack credentials all work end-to-end inside one n8n workflow before investing in the real pipeline.

**Time budget**: 30 minutes.

**Workflow name in n8n**: `portfolio-03-smoke-test`

---

## Pre-flight checklist (should already be done from 5/3 Phase 1)

- [ ] n8n.cloud account active, logged in
- [ ] Anthropic credential saved in n8n with name `anthropic-portfolio-03`
- [ ] Google Sheets OAuth credential saved with name `gsheets-portfolio-03`
- [ ] Slack OAuth credential saved with name `slack-portfolio-03`

If any of the above is missing, fix before proceeding — that's a 5/3 Phase 1 leftover.

---

## Step 1 — Throwaway sheet (~2 min)

In Google Sheets, create a new sheet named `portfolio-03-smoke-test`. Tab 1 named `data`. Add two rows:

| message |
| :-- |
| hello from the sheet |

Note the spreadsheet ID from the URL (the long string between `/d/` and `/edit`).

---

## Step 2 — Throwaway Slack channel (~1 min)

Create a Slack channel named `#portfolio-03-smoke-test`. Invite your n8n bot to the channel (`/invite @<bot-name>`).

---

## Step 3 — Build the 3-node workflow (~10 min)

In n8n, create a new workflow `portfolio-03-smoke-test`. Add 3 nodes connected in series:

### Node 1: Manual Trigger
- Type: **Manual Trigger**
- No config needed.

### Node 2: Google Sheets — Read
- Type: **Google Sheets**
- Credential: `gsheets-portfolio-03`
- Operation: **Get Row(s) in Sheet**
- Document: select `portfolio-03-smoke-test`
- Sheet: `data`
- Return all rows

### Node 3: Anthropic Chat (Haiku)
- Type: **Anthropic Chat Model** (or HTTP Request to `https://api.anthropic.com/v1/messages` if no native node available — see fallback below)
- Credential: `anthropic-portfolio-03`
- Model: `claude-haiku-4-5-20251001`
- System prompt:
  ```
  You echo back the input in 10 words or fewer. No more, no less.
  ```
- User message (n8n expression):
  ```
  Echo this back: {{ $json.message }}
  ```

**HTTP fallback** (if no native Anthropic node yet):
- Method: `POST`
- URL: `https://api.anthropic.com/v1/messages`
- Authentication: Generic Credential Type → Header Auth
- Header: `x-api-key` = (your Anthropic key); `anthropic-version` = `2023-06-01`; `content-type` = `application/json`
- Body (JSON):
  ```json
  {
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 64,
    "system": "You echo back the input in 10 words or fewer.",
    "messages": [
      { "role": "user", "content": "Echo this back: {{ $json.message }}" }
    ]
  }
  ```
- Then add a **Set** node after to extract `{{ $json.content[0].text }}` into a `reply` field.

### Node 4: Slack — Post Message
- Type: **Slack**
- Credential: `slack-portfolio-03`
- Operation: **Send a message**
- Channel: `#portfolio-03-smoke-test`
- Text:
  ```
  smoke test ok — haiku said: {{ $json.reply || $json.content[0].text }}
  ```

---

## Step 4 — Run + verify (~5 min)

1. Click **Execute Workflow** (top right) on the manual trigger.
2. Watch each node light up green.
3. Open `#portfolio-03-smoke-test` in Slack — you should see a message like:
   ```
   smoke test ok — haiku said: hello from the sheet
   ```

## Pass criteria

- ✅ Sheets node returns 1 row containing `hello from the sheet`.
- ✅ Anthropic node returns a non-empty echo string.
- ✅ Slack message posts to the test channel with the echo embedded.

If all three pass, **Block 1 done**. Move to Block 2 (sample data backfill).

## If something fails

| Failure | Likely cause | Fix |
| :-- | :-- | :-- |
| Sheets node 401/403 | OAuth scope missing | Re-auth `gsheets-portfolio-03` with `drive.readonly` + `spreadsheets` scopes |
| Anthropic 401 | Wrong API key | Check `x-api-key` header; regenerate key in console.anthropic.com if needed |
| Anthropic 400 | Bad model name | Confirm `claude-haiku-4-5-20251001` (full versioned ID); fallback to `claude-haiku-4-5` |
| Slack 403 channel_not_found | Bot not invited | `/invite @<bot>` in the channel |
| Slack 403 not_in_channel | Same as above | Same |

Log any blocker into `portfolio-03-day1-worklog.md` under "Blockers / questions" before moving on.

---

## After pass

Save the workflow. Don't delete it — useful as a reference for the real workflow. Tag it `smoke-test` in n8n if you use tags.
