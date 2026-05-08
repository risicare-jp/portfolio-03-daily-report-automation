// ─────────────────────────────────────────────────────────────────
// Portfolio 3 — Day 2: Digest Prompt Builder (n8n Code node)
// ─────────────────────────────────────────────────────────────────
// Mode: "Run Once for All Items"
// Input: 3 LocationDailyReport items from upstream Code node
// Output: 1 item with `user_message` (formatted prompt body) + `today` (date)

const reports = $input.all().map(i => i.json);

if (reports.length === 0) {
  throw new Error('Digest builder: no reports received');
}

const today = reports[0].date;

// Render the baseline in a way the model can phrase naturally.
// baseline_used: 'yoy' → "vs same day last year"
// baseline_used: 'trailing' → "vs prior 7-day average"
// null → no baseline available, model should not invent a comparison
function baselineLine(r) {
  if (!r.baseline_used || !r.baseline_value) {
    return '  Sales baseline: (unavailable — new location or insufficient history)';
  }
  const ratio = (r.sales / r.baseline_value * 100).toFixed(1);
  const kindLabel = r.baseline_used === 'yoy'
    ? 'same day last year'
    : 'prior 7-day average';
  return `  Sales baseline: CAD ${r.baseline_value} (${kindLabel}); today is ${ratio}% of baseline`;
}

const formatReport = (r) => {
  const wastePct = r.sales > 0 ? (r.waste / r.sales * 100).toFixed(1) : '0.0';
  const flagsList = r.flags.length === 0
    ? '(none)'
    : r.flags.map(f => `${f.severity.toUpperCase()}:${f.rule}`).join(', ');
  return [
    `Location: ${r.location.name} (${r.location.id})`,
    `  Severity: ${r.severity}`,
    `  Sales: CAD ${r.sales}`,
    baselineLine(r),
    `  Waste: CAD ${r.waste} (${wastePct}% of revenue)`,
    `  Complaints: ${r.complaints}`,
    `  Flags: ${flagsList}`,
    `  Shift notes: ${r.shift_notes || '(none recorded)'}`,
  ].join('\n');
};

const userMessage = [
  `Today is ${today}. ${reports.length} location(s) reported.`,
  '',
  reports.map(formatReport).join('\n\n'),
  '',
  'Produce the bilingual morning digest now (English paragraph, blank line, Japanese paragraph). Follow the format and tone rules in the system prompt.',
].join('\n');

return [{ json: { today, user_message: userMessage, reports } }];
