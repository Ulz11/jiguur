---
target: system/frontend/src
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 2
timestamp: 2026-08-27T02-48-50Z
slug: system-frontend-src
---
# UI/UX Critique — Жигүүр Зам ERP (system/frontend/src)
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score — 19/40 (Poor band, with a caveat)
| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | /contracts/:id missing from TITLES → empty breadcrumb + "Жигүүр Зам · Жигүүр Зам" tab on the deepest screen |
| 2 | Match System / Real World | 3 | PayModal names invoices R-24/03-4 while the table behind it names the same rows by period |
| 3 | User Control and Freedom | 1 | Zero undo; "Гэрээ хаах" closes a contract on one unconfirmed click; Esc/backdrop discards filled Stocktake/ReturnModal |
| 4 | Consistency and Standards | 2 | Confirmation budget inverted: note edits = 2 steps; contract close / shipment confirm / payroll pay = 0 |
| 5 | Error Prevention | 1 | Wizard deposit "6,000,000" parses to 6₮ (no comma strip); ContractDetail strips commas — inconsistent |
| 6 | Recognition Rather Than Recall | 2 | Wizard step 4 omits all material lines; PayModal manual mode hides the payment total being split |
| 7 | Flexibility and Efficiency | 2 | No table sorting anywhere (Collections worklist unsortable); no client search in wizard |
| 8 | Aesthetic and Minimalist Design | 3 | Real craft; but ContractDetail opens with 6 co-equal buttons |
| 9 | Error Recovery | 1 | FastAPI 422 arrays render as "[object Object]" toast, auto-dismissed in 3.2s; InlineEdit failures swallowed silently |
| 10 | Help and Documentation | 2 | No help/tooltips; partly redeemed by excellent inline explanatory copy |
| **Total** | | **19/40** | Poor band — but concentrated in fixable safety/error defects; visual+domain layers alone would score ~28 |

## Specificity verdict
Authored, not template (7.5/10): the Receipt consequence-preview primitive (11 uses), structural brand-pattern use, Excel-grid tables as deliberate audience concession, domain-accurate pills/copy. Relapses: stock admin dashboard, five English mono kickers (OPERATIONAL OVERVIEW · LIVE etc.), abstract Unicode nav glyphs.
Detector: CLI near-blind on Tailwind (1 finding). Browser overlay on 5 pages: 130 findings — 82 low-contrast TRUE (t3 #8993a8 = 3.06:1 carries every .th header, caption, pen glyph; btn-primary 2.36:1; kicker 2.18:1), skipped-heading ×2 true; false positives: nested-cards ×9 (divider rows, no surface), text-overflow ×4 (SVG viewBox artifact), cramped-padding ×2 (full-bleed table in card), em-dash (data separators).

## Priority Issues
1. [P0] Sidebar unreachable below ~880px viewport height — nav scrollHeight 876px, overflow hidden, no scroll; Тохиргоо + logout/password clipped on a 1366×768 office PC. Fix: .jz-nav overflow-y:auto; min-height:0 (one line).
2. [P0] Money-moving actions fire unconfirmed — Гэрээ хаах, Ачсан ✓ (starts billing), Олгох ✓ (hits P&L), stock adjust. RebuildModal is the in-house template; route all four through Modal+Receipt delta.
3. [P0] Ачсан ✓ asks дарга to certify a shipment with no material names ("×12 · ×12 · ×12") at 75×36px, 1,927px down the manager's dashboard.
4. [P1] Error channel broken — [object Object] 422s, swallowed InlineEdit onSave rejections, silent SettingsPage save, all toasts 3.2s/no aria-live.
5. [P1] Legibility system failure for the primary persona — t3 3.06:1 at 11.5px uppercase; inline-edit pen opacity:0 at rest with 1.61:1 dashed underline; edit targets 21–28px; only one :focus rule in the entire stylesheet.

## Persona red flags (condensed)
Отгоо (60, Excel-native): every column header fails AA at 11.5px; invisible edit affordance; double-affirmative ✓→confirm; English hero kicker; ⎋/🔑 unlabeled 13–16px & clipped off-screen; no client search; 42-tile nested scroller.
Дарга (tablet): iPad-portrait misses drawer breakpoint by 8px (760 vs 768) → 506px content; primary action 36px & unconfirmed & unreadable; ReturnModal is a 16-input desktop table (Stocktake proves the team can do touch-first); no nav entry for returns; no stocktake draft persistence; sees company financials outside his role.
Санхүүч: sayaFmt rounds all list money to 0.1 сая with no way to see exact figures (can't reconcile vs bank); ~40 dead stock-pill buttons (hover+cursor, gated handler); manual allocation can submit over-allocated; Collections unsortable; phones not tel: links.
A11y: one :focus rule total; Modal lacks role/aria-modal/focus trap; toasts unannounced; zero htmlFor in codebase; color-only meaning in progress bars + calendar dots.

## Minor
Spinner blanks page on dep change (no skeletons); Empty is a dead end with filters active; 401 = hard redirect discarding work; ErrorBoundary prints raw English error; VAT label unconditional; ten different min-h values (no target scale); two design systems in index.css (@theme radii 22px vs !important 7–9px overrides).

## Questions
1. RebuildModal shows consequences before commit — why is it the only place? 2. Is дарга a designed persona or just a permission set? (Stocktake proves the bar is reachable.) 3. Whose need does сая-rounding serve — reconciliation or visual rhythm?
