// ─────────────────────────────────────────────────────────────────
// Portfolio 3 — Block 4: Normaliser + Flagger (n8n Code node)
// ─────────────────────────────────────────────────────────────────
// Mode: "Run Once for All Items"
// Input: items from each source's Set node, each tagged with `source` ∈ {"sheet","notion","slack"}
// Output: 3 LocationDailyReport objects, one per location, with severity
//
// Severity tiers (precedence: red > orange > yellow > green):
//   red    = sales < 80% of YoY baseline (or trailing 7-day fallback)
//   orange = waste/sales > 10% OR complaints >= 1
//   yellow = 80% <= sales/baseline < 90%
//   green  = none of the above
//
// Sales baseline priority:
//   1. PRIMARY:   sales_same_day_last_year (YoY)
//      Year-over-year is the canonical baseline in F&B operations because it
//      naturally controls for day-of-week / seasonal / holiday / event
//      effects that pollute trailing-window averages.
//   2. FALLBACK:  trailing 7-day average (excluding today)
//      Used when YoY data is unavailable — typically new locations that have
//      not yet accumulated a year of history.

// === Configuration ===
const YESTERDAY = '2026-05-04';

const WASTE_THRESHOLD = 0.10;
const SALES_RED_RATIO = 0.80;
const SALES_YELLOW_RATIO = 0.90;
const TRAILING_DAYS = 7;

const SEVERITY_RANK = { green: 0, yellow: 1, orange: 2, red: 3 };

const LOCATIONS = {
  sheet:  { id: 'A-Vancouver-Downtown', name: 'Vancouver Downtown' },
  notion: { id: 'B-Burnaby-Metrotown',  name: 'Burnaby Metrotown' },
  slack:  { id: 'C-Richmond-Aberdeen',  name: 'Richmond Aberdeen' },
};

// === Helpers ===

function pickHighestSeverity(...tiers) {
  return tiers.reduce((best, t) => SEVERITY_RANK[t] > SEVERITY_RANK[best] ? t : best, 'green');
}

function trailingAvg(rows, getDate, getSales) {
  const past = rows
    .filter(r => getDate(r) < YESTERDAY)
    .sort((a, b) => getDate(a).localeCompare(getDate(b)))
    .slice(-TRAILING_DAYS);
  if (past.length < TRAILING_DAYS) return null;
  return past.reduce((s, r) => s + getSales(r), 0) / TRAILING_DAYS;
}

// Pick baseline (YoY primary, trailing fallback). Returns:
//   { value: number, kind: 'yoy' | 'trailing' } | null
function pickBaseline(yoy, trailing) {
  if (yoy && yoy > 0) return { value: yoy, kind: 'yoy' };
  if (trailing && trailing > 0) return { value: trailing, kind: 'trailing' };
  return null;
}

// === Normalisers (one per source shape) ===

function normalizeSheet(rows) {
  // Sheet row shape: { date, sales_cad, waste_cad, covers, complaints, shift_notes,
  //                    sales_yoy_baseline_cad, source }
  const today = rows.find(r => r.date === YESTERDAY);
  if (!today) throw new Error(`Sheet: no row for ${YESTERDAY}`);
  const trailing = trailingAvg(rows, r => r.date, r => Number(r.sales_cad));
  const yoy = today.sales_yoy_baseline_cad ? Number(today.sales_yoy_baseline_cad) : null;
  return {
    location: LOCATIONS.sheet,
    date: today.date,
    sales: Number(today.sales_cad),
    waste: Number(today.waste_cad),
    covers: Number(today.covers),
    complaints: Number(today.complaints),
    shift_notes: today.shift_notes,
    sales_yoy_baseline: yoy,
    trailing_avg: trailing,
  };
}

function normalizeNotion(rows) {
  // Notion via n8n (simplify ON) shape:
  //   { property_date: { start: "2026-05-04", end: null, time_zone: null },
  //     property_sales_cad: 2650,
  //     property_waste_cad: 980,
  //     property_complaints: 2,
  //     property_shift_notes: "Walk-in cooler...",
  //     property_sales_yo_y_baseline_cad: 3500,   // ← n8n quirk; see below
  //     source: "notion", id, name, url, ... }
  //
  // n8n's Notion node lower-cases property names but treats consecutive
  // capitals as word separators: "Sales YoY Baseline CAD" becomes
  // `property_sales_yo_y_baseline_cad`, NOT `property_sales_yoy_baseline_cad`.
  // We accept both spellings for robustness across Notion property naming
  // styles and across n8n versions.
  const dateOf = r => {
    const d = r.property_date;
    if (!d) return '';
    if (typeof d === 'string') return d.slice(0, 10);
    return (d.start || '').slice(0, 10);
  };
  const today = rows.find(r => dateOf(r) === YESTERDAY);
  if (!today) throw new Error(`Notion: no row for ${YESTERDAY}`);
  const trailing = trailingAvg(rows, dateOf, r => Number(r.property_sales_cad));
  const yoyRaw = today.property_sales_yoy_baseline_cad
    ?? today.property_sales_yo_y_baseline_cad
    ?? null;
  const yoy = yoyRaw ? Number(yoyRaw) : null;
  return {
    location: LOCATIONS.notion,
    date: dateOf(today),
    sales: Number(today.property_sales_cad),
    waste: Number(today.property_waste_cad),
    covers: null, // not tracked at B
    complaints: Number(today.property_complaints),
    shift_notes: today.property_shift_notes,
    sales_yoy_baseline: yoy,
    trailing_avg: trailing,
  };
}

const MONTHS = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };

function parseSlackPost(msg) {
  // Slack message text shape:
  //   📊 Daily — Mon May 4
  //   Sales: $5,204 | Waste: $480 | Covers: 112
  //   YoY baseline: $5,300
  //   Notes: ...
  // YoY line is optional (omitted on days without YoY data; omitted entirely
  // for prior-week rows that only feed the trailing-avg fallback).
  const text = msg.text || msg.message || '';
  const dateMatch = text.match(/Daily\s*[—-]\s*\w+\s+(\w+)\s+(\d+)/);
  const numbersMatch = text.match(/Sales:\s*\$([\d,]+)\s*\|\s*Waste:\s*\$([\d,]+)\s*\|\s*Covers:\s*(\d+)/);
  const yoyMatch = text.match(/YoY\s+baseline:\s*\$([\d,]+)/i);
  const notesMatch = text.match(/Notes:\s*([\s\S]+?)$/m);
  if (!dateMatch || !numbersMatch) return null;

  const month = MONTHS[dateMatch[1]];
  const day = String(dateMatch[2]).padStart(2, '0');
  const year = YESTERDAY.slice(0, 4);
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${day}`;

  return {
    date: isoDate,
    sales: Number(numbersMatch[1].replace(/,/g, '')),
    waste: Number(numbersMatch[2].replace(/,/g, '')),
    covers: Number(numbersMatch[3]),
    sales_yoy_baseline: yoyMatch ? Number(yoyMatch[1].replace(/,/g, '')) : null,
    notes: (notesMatch?.[1] || '').trim(),
  };
}

function normalizeSlack(messages) {
  const parsed = messages.map(parseSlackPost).filter(Boolean);
  const today = parsed.find(p => p.date === YESTERDAY);
  if (!today) throw new Error(`Slack: no post for ${YESTERDAY}`);
  const trailing = trailingAvg(parsed, p => p.date, p => p.sales);
  return {
    location: LOCATIONS.slack,
    date: today.date,
    sales: today.sales,
    waste: today.waste,
    covers: today.covers,
    complaints: 0, // slack format doesn't carry complaints; documented limitation
    shift_notes: today.notes,
    sales_yoy_baseline: today.sales_yoy_baseline,
    trailing_avg: trailing,
  };
}

// === Flagger ===

function applyFlags(report) {
  const flags = [];
  let salesTier = 'green';

  const baseline = pickBaseline(report.sales_yoy_baseline, report.trailing_avg);

  if (baseline) {
    const ratio = report.sales / baseline.value;
    if (ratio < SALES_RED_RATIO) {
      salesTier = 'red';
      flags.push({
        rule: 'sales_major_drop',
        severity: 'red',
        ratio: Number(ratio.toFixed(3)),
        threshold: SALES_RED_RATIO,
        baseline: Math.round(baseline.value),
        baseline_kind: baseline.kind, // 'yoy' or 'trailing'
      });
    } else if (ratio < SALES_YELLOW_RATIO) {
      salesTier = 'yellow';
      flags.push({
        rule: 'sales_mild_dip',
        severity: 'yellow',
        ratio: Number(ratio.toFixed(3)),
        threshold: SALES_YELLOW_RATIO,
        baseline: Math.round(baseline.value),
        baseline_kind: baseline.kind,
      });
    }
  }

  let opsTier = 'green';
  const wastePct = report.sales > 0 ? report.waste / report.sales : 0;
  if (wastePct > WASTE_THRESHOLD) {
    opsTier = 'orange';
    flags.push({
      rule: 'waste_high',
      severity: 'orange',
      pct: Number((wastePct * 100).toFixed(1)),
      threshold_pct: WASTE_THRESHOLD * 100,
    });
  }
  if (report.complaints >= 1) {
    opsTier = 'orange';
    flags.push({
      rule: 'complaints_present',
      severity: 'orange',
      count: report.complaints,
    });
  }

  const severity = pickHighestSeverity(salesTier, opsTier);
  // Surface the chosen baseline kind on the report itself so digest-builder
  // can phrase the comparison naturally without inspecting flags.
  return {
    ...report,
    baseline_used: baseline?.kind ?? null,
    baseline_value: baseline ? Math.round(baseline.value) : null,
    flags,
    severity,
  };
}

// === Main ===
const sheetItems  = $('Edit Fields').all().map(i => i.json);
const notionItems = $('Edit Fields1').all().map(i => i.json);
const slackItems  = $('Edit Fields2').all().map(i => i.json);

const reports = [
  normalizeSheet(sheetItems),
  normalizeNotion(notionItems),
  normalizeSlack(slackItems),
].map(applyFlags);

return reports.map(r => ({ json: r }));
