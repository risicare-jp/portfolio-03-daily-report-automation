// ─────────────────────────────────────────────────────────────────
// Portfolio 3 — Day 3: Output Payload Builder (n8n Code node)
// ─────────────────────────────────────────────────────────────────
// Mode: "Run Once for All Items"
// Position: directly after the Anthropic "Message a Model" node.
// Output: 1 item with everything Slack + Notion need, normalised.

const SEVERITY_RANK = { green: 1, yellow: 2, orange: 3, red: 4 };
const SEVERITY_HEX = {
  green:  '#16A34A',
  yellow: '#EAB308',
  orange: '#EA580C',
  red:    '#DC2626',
};
const SEVERITY_LABEL = { green: 'Green', yellow: 'Yellow', orange: 'Orange', red: 'Red' };
const SEVERITY_EMOJI = { green: '🟢', yellow: '🟡', orange: '🟠', red: '🔴' };
// Slack legacy attachment color presets (only 3 — orange/yellow share warning).
// n8n's Color attachment item only accepts presets in Expression mode reliably;
// hex values get dropped. This is verified — see worklog Day 3 PM.
const SEVERITY_SLACK_COLOR = { green: 'good', yellow: 'warning', orange: 'warning', red: 'danger' };

// 1. Pull the bilingual digest text. With Simplify Output ON the Anthropic
//    node still surfaces content[0].text (n8n quirk, captured in Day 1 worklog).
//    Handle both shapes defensively.
const incoming = $input.first().json;
const digestText = incoming.content?.[0]?.text ?? incoming.text ?? '';

if (!digestText) {
  throw new Error('Output payload: digest text missing from Anthropic node');
}

// 2. Split into English / Japanese paragraphs (system prompt guarantees
//    a blank line separator).
const [digestEn = '', digestJa = ''] = digestText.split(/\n\s*\n/, 2).map(p => p.trim());

// 3. Pull upstream reports — digest-builder passes them through verbatim.
const builder = $('Build digest prompt').first().json;
const reports = builder.reports ?? [];
const today = builder.today ?? '';

// 4. Max severity across all locations.
const maxSeverity = reports.reduce(
  (acc, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[acc] ? r.severity : acc),
  'green',
);

// 5. Flagged locations (anything not green).
const flaggedLocations = reports
  .filter(r => r.severity !== 'green')
  .map(r => ({ id: r.location.id, name: r.location.name, severity: r.severity }));

// 6. Title for Notion: "2026-05-04 — Burnaby red" / "2026-05-04 — all clear".
//    Use first word of name for compactness ("Burnaby Metrotown" → "Burnaby").
const flaggedSummary = flaggedLocations.length === 0
  ? 'all clear'
  : flaggedLocations.map(l => `${l.name.split(' ')[0]} ${l.severity}`).join(', ');
const title = `${today} — ${flaggedSummary}`;

return [{
  json: {
    today,
    digest_text:        digestText,
    digest_en:          digestEn,
    digest_ja:          digestJa,
    severity:           maxSeverity,
    severity_label:     SEVERITY_LABEL[maxSeverity],
    severity_hex:       SEVERITY_HEX[maxSeverity],
    severity_emoji:     SEVERITY_EMOJI[maxSeverity],
    severity_slack_color: SEVERITY_SLACK_COLOR[maxSeverity],
    flagged_locations:  flaggedLocations,
    flagged_summary:    flaggedSummary,
    source_count:       reports.length,
    title,
  }
}];
