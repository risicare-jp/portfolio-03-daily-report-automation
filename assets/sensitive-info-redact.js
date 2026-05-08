// ─────────────────────────────────────────────────────────────────
// Portfolio 3 — Day 4: Sensitive-Info Redactor (n8n Code node)
// ─────────────────────────────────────────────────────────────────
// Mode: "Run Once for All Items"
// Position: between normaliser-flagger and digest-builder.
// Input:  3 LocationDailyReport items
// Output: same 3 items, with `shift_notes` redacted for PII patterns
//         and a `redactions` summary appended for observability.
//
// Why this exists:
// shift_notes is free-text written by line managers. It can plausibly contain
// customer phone numbers ("called Mr. Tanaka 604-555-0142 to apologise"),
// emails, payment-card fragments, or government-id-like strings. Sending raw
// notes to an LLM is fine technically, but a portfolio-grade pipeline should
// strip obviously-sensitive tokens before they leave our trust boundary —
// and certainly before they appear in a Slack/Notion digest readable by
// anyone with channel access.
//
// Scope of detection (regex-based, deliberately conservative):
//   - Phone numbers, NA format: (604) 555-0142 / 604-555-0142 / 604.555.0142
//   - Email addresses
//   - 16-digit card-like sequences (with or without separators)
//   - 9-digit Canadian SIN-like sequences (xxx-xxx-xxx)
//
// Out of scope (documented limitation):
//   - Personal names. Name-detection requires NER and is brittle for the
//     bilingual EN/JP context of this app. The system prompt instead
//     instructs the model not to echo personal names appearing in notes.

const PATTERNS = [
  { name: 'phone', re: /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, replacement: '[redacted-phone]' },
  { name: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, replacement: '[redacted-email]' },
  { name: 'card',  re: /\b(?:\d[ -]?){13,19}\b/g, replacement: '[redacted-card]' },
  { name: 'sin',   re: /\b\d{3}-\d{3}-\d{3}\b/g, replacement: '[redacted-id]' },
];

function redact(text) {
  if (!text || typeof text !== 'string') {
    return { text, hits: {} };
  }
  let out = text;
  const hits = {};
  for (const { name, re, replacement } of PATTERNS) {
    const matches = out.match(re);
    if (matches) {
      hits[name] = matches.length;
      out = out.replace(re, replacement);
    }
  }
  return { text: out, hits };
}

const reports = $input.all().map(i => i.json);

const cleaned = reports.map(r => {
  const { text, hits } = redact(r.shift_notes);
  return {
    ...r,
    shift_notes: text,
    redactions: hits, // {} when nothing matched; { phone: 1, email: 2 } otherwise
  };
});

return cleaned.map(r => ({ json: r }));
