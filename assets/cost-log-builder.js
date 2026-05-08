// ─────────────────────────────────────────────────────────────────
// Portfolio 3 — Day 4: Cost Log Builder (n8n Code node)
// ─────────────────────────────────────────────────────────────────
// Mode: "Run Once for All Items"
// Position: parallel branch off the Anthropic node, feeding a Sheets
//           Append node that writes one row to `Portfolio 03 Cost Log`.
//
// Requires Anthropic node setting: **Simplify Output = OFF** so that the
// raw API response (including `usage` and `model`) is preserved.
//
// Output: 1 item with the columns the Sheets Append node maps to:
//   timestamp_iso | run_date | model | input_tokens | output_tokens
//                 | total_tokens | cost_usd | digest_source
//
// Pricing note:
// Rates verified against platform.claude.com/docs/en/about-claude/pricing
// on 2026-05-07. This is the single source of truth for the workflow's
// USD cost calculation; the README and Notion case study quote the
// per-digest cost computed against this table. When Anthropic adjusts
// pricing, update this table first and propagate to the docs.
const PRICING_USD_PER_MTOK = {
  // Claude Haiku tier (Daily Digest uses Haiku — fast + cheap is the right pick)
  'claude-haiku-4-5':   { input: 1.00, output: 5.00 },
  'claude-3-5-haiku':   { input: 0.80, output: 4.00 },
  // Sonnet tier (kept for completeness — not used by this workflow today)
  'claude-sonnet-4-6':  { input: 3.00, output: 15.00 },
  // Fallback when the API returns an exact model id we haven't seen yet
  // (e.g. dated variants like `claude-haiku-4-5-20251001`); pick a safe
  // upper-bound so cost is never under-reported.
  default:              { input: 1.00, output: 5.00 },
};

function priceFor(modelId) {
  if (!modelId) return PRICING_USD_PER_MTOK.default;
  // Match by prefix so dated suffixes (`-20251001`) still resolve.
  for (const key of Object.keys(PRICING_USD_PER_MTOK)) {
    if (key === 'default') continue;
    if (modelId.startsWith(key)) return PRICING_USD_PER_MTOK[key];
  }
  return PRICING_USD_PER_MTOK.default;
}

const incoming = $input.first().json;

// Anthropic raw response shape (Simplify Output = OFF):
//   { id, model, role, content: [{ type, text }], stop_reason,
//     usage: { input_tokens, output_tokens, cache_creation_input_tokens?,
//              cache_read_input_tokens? } }
const usage = incoming.usage ?? {};
const inputTokens  = Number(usage.input_tokens  ?? 0);
const outputTokens = Number(usage.output_tokens ?? 0);
const totalTokens  = inputTokens + outputTokens;
const model = incoming.model ?? '(unknown)';

const rate = priceFor(model);
const costUsd = (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;

// Pull `today` from the digest builder upstream so the run_date column
// matches the business date, not the wall-clock date the cron fired.
const builder = $('Build digest prompt').first().json;
const runDate = builder?.today ?? '';

return [{
  json: {
    timestamp_iso: new Date().toISOString(),
    run_date:      runDate,
    model,
    input_tokens:  inputTokens,
    output_tokens: outputTokens,
    total_tokens:  totalTokens,
    cost_usd:      Number(costUsd.toFixed(6)),
    digest_source: 'llm', // reserved for when degradation handling lands later
  }
}];
