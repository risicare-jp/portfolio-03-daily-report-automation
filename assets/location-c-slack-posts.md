# Location C — Richmond Aberdeen — Slack daily posts

**Channel name suggestion**: `#portfolio-03-loc-c-daily`

Copy each block below as a **separate Slack message** in the channel. Order: oldest first (Apr 21 → May 4). All 14 will share today's Slack timestamp; that's fine — the n8n parser reads the **date in the message body**, not the Slack post timestamp.

> Format: `📊 Daily — <weekday> <month> <day>\nSales: $X,XXX | Waste: $XXX | Covers: XX\nNotes: ...`

---

```
📊 Daily — Tue Apr 21
Sales: $4,820 | Waste: $310 | Covers: 96
Notes: Steady. Group of 6 at 7pm went well. No incidents.
```

```
📊 Daily — Wed Apr 22
Sales: $5,140 | Waste: $340 | Covers: 104
Notes: Busy lunch from Aberdeen office crowd. Smooth dinner.
```

```
📊 Daily — Thu Apr 23
Sales: $5,380 | Waste: $355 | Covers: 109
Notes: Normal Thursday. New server doing well.
```

```
📊 Daily — Fri Apr 24
Sales: $5,920 | Waste: $390 | Covers: 124
Notes: Full Friday dinner. 25 min wait at 7pm peak.
```

```
📊 Daily — Sat Apr 25
Sales: $6,240 | Waste: $410 | Covers: 132
Notes: Fully booked. Birthday party of 10 at 8pm.
```

```
📊 Daily — Sun Apr 26
Sales: $5,680 | Waste: $375 | Covers: 118
Notes: Family dinners strong from 5-7pm.
```

```
📊 Daily — Mon Apr 27
Sales: $4,180 | Waste: $268 | Covers: 82
Notes: Monday slow as usual.
```

```
📊 Daily — Tue Apr 28
Sales: $4,910 | Waste: $315 | Covers: 98
Notes: Steady.
```

```
📊 Daily — Wed Apr 29
Sales: $5,210 | Waste: $342 | Covers: 105
Notes: Aberdeen event nearby, +traffic.
```

```
📊 Daily — Thu Apr 30
Sales: $5,420 | Waste: $356 | Covers: 110
Notes: Normal.
```

```
📊 Daily — Fri May 1
Sales: $5,890 | Waste: $385 | Covers: 122
Notes: Friday rush. 20 min wait at peak.
```

```
📊 Daily — Sat May 2
Sales: $6,180 | Waste: $405 | Covers: 130
Notes: Fully booked.
```

```
📊 Daily — Sun May 3
Sales: $5,720 | Waste: $378 | Covers: 119
Notes: Brunch crowd strong from 11-1pm.
```

```
📊 Daily — Mon May 4
Sales: $5,204 | Waste: $480 | Covers: 112
YoY baseline: $5,300
Notes: Aberdeen Centre pop-up event nearby, +traffic. No incidents, no complaints.
```

> **YoY baseline は May 4 のメッセージにのみ含める** — flagger が必要とするのは today の YoY のみ（trailing window は他14日から計算）。Apr 21〜May 3 のメッセージは現状のまま編集不要。新規拠点立ち上げ時など YoY データがない日は YoY baseline 行を省略すれば、flagger が自動的に trailing 7-day fallback に切り替わる。
