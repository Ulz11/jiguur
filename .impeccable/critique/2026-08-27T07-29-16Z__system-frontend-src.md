---
target: system/frontend/src
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-27T07-29-16Z
slug: system-frontend-src
---
# UI/UX Re-critique — Жигүүр Зам ERP (after 6-phase remediation)
Method: dual-agent (A: fresh design review · B: fresh detector + measured evidence)

## Score: 24/40 (was 19/40) — Acceptable band, up from Poor
| # | Heuristic | Was | Now | Key issue now |
|---|---|---|---|---|
| 1 | System status | 2 | 3 | openPdf silent on failure — all 5 callers bare, no busy state |
| 2 | Real world | 3 | 3 | sayaFmt rounding in ledger contexts (user-accepted for lists) |
| 3 | User control | 1 | 2 | dirty guard on only 3/23 modals; wizard Болих unguarded |
| 4 | Consistency | 2 | 2 | 4 good patterns (dirty/busy/Refreshing/rebuild-preview) applied to minority of sites |
| 5 | Error prevention | 1 | 3 | wizard end<start accepted; over-stock warns but doesn't block |
| 6 | Recognition | 2 | 2 | invoice table has no Үлдэгдэл column — mental arithmetic required |
| 7 | Flexibility | 2 | 2 | no skip link; 16 tab stops to content |
| 8 | Minimalism | 3 | 3 | 6 same-weight buttons; penalty-rate editor looks like the note field |
| 9 | Error recovery | 1 | 2 | errors.ts excellent; blob exports don't check res.ok |
| 10 | Help | 2 | 2 | zero explanation of cycle/rebuild/OB concepts |
Design specificity 7.5 → 9/10 (measured-contrast tokens with rationale comments, target scale, per-surface focus rings, Receipt system, role-forked dashboard). Detector: CLI 1 finding (accepted sidebar width transition); overlay 130 → 32 (mostly false positives now — navy-gradient misread, SVG artifacts); contrast table all-pass except aria-hidden pen 3.44:1 (mitigated by 5.15:1 underline + sr-only); 0 unnamed controls; 0 console errors; rows keyboard-activatable (verified with real keypresses).

## Resolved from baseline
Sidebar reachability (scrollable, footer pinned) · all 4 money actions confirmed w/ Receipts · comma-parse 6₮ bug dead · error channel (readable Mongolian, persistent, announced) · contrast system (42/42 pairs) · pen visible at rest · iPad drawer · дарга work queue + touch ReturnModal · English kickers gone · naming unified · focus system + dialogs + labels.

## New/remaining priorities
[P0] dirty guard 3/23 modals; ContractNew ← Болих destroys a filled wizard silently (useBlocker + guard everywhere; consider FormModal primitive)
[P1] exact amounts: no Үлдэгдэл column on invoices; exact figure nowhere (respect user's сая-in-lists decision; add column + exact on single-record screens + title=)
[P1] factory role sees full receivables/payments/barter on ContractDetail (gate the money cards)
[P2] openPdf/.xlsx exports: catch + busy state + res.ok
[P2] sidebar still overflows 202px at 1366×768 (46px nav items; compress under 800px) + skip link; InlineEdit 32px vs own 36 token; segment 34px; InlineEdit aria-name lacks field identity
[P3] double-submit on Гэрээ сунгах/Бодох/Settings/3 modals (busy-guard)
