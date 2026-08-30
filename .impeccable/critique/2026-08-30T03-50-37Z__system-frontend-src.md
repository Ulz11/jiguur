---
target: round 4 re-score after remediation (same 8 surfaces)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 4
timestamp: 2026-08-30T03-50-37Z
slug: system-frontend-src
---
# Critique — Жигүүр Зам ERP, round 4 (post-remediation re-score)

Method: dual-agent (A: design review · B: detector/browser evidence), fresh blind assessors, isolated until synthesis.
Scope: same 8 surfaces as round 3 (dashboard drill-down/schedule, contracts switch + open-ended dates, падан ledger, MaterialDetail, machines, loans, salary, cohesion).

## Design Health Score — 29/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | InlineEdit's confirm step fires with zero live regions ([aria-live] count = 0 on /, /contracts/2, /loans) — SR users never learn the confirm chip appeared |
| 2 | Match System / Real World | 4 | падан/зэрэглэл/30-хоногийн цикл — the vocabulary IS the business. Blemish: "Хамтран ажилласан" serialises created_at (import date) |
| 3 | User Control and Freedom | 3 | Scope lives only in React state — Back can't undo it, bookmarks lose it; Salary "Хасах" has no un-hide path while Machines/Loans both have one |
| 4 | Consistency and Standards | 2 | Still weakest: one global switch with two costumes in two places; six names for one авлага number; Хаах = dismiss/collapse/terminate-a-loan; disclosure affordance applied once |
| 5 | Error Prevention | 3 | RebuildModal best-in-class; machine invoices have NO duplicate guard (M-…-1 and M-…-2 over identical rows); payroll payout arms Enter on commit |
| 6 | Recognition Rather Than Recall | 3 | Two rows both "Хэв хашмал 6012 · В" (300₮/330₮) with no on-row why — MaterialDetail already computes "2 падан", ContractDetail doesn't show it |
| 7 | Flexibility and Efficiency | 3 | Skip link first in tab order, filters serialise to URL; no bulk actions, no shortcuts, 88 tabbables on /machines |
| 8 | Aesthetic and Minimalist Design | 2 | / is 2,380px = 3.1 screens with the actionable Мэдэгдэл at y=1243 under a forecast labeled "нэхэмжлэгдсэн дүн БИШ"; /machines = 54 armed editors, no read mode |
| 9 | Error Recovery | 3 | Persistent error toasts, real Mongolian server sentences; toast is the only channel — no field-level inline validation |
| 10 | Help and Documentation | 3 | In-context copy exceptional ("өдрийнхийг 22 хоногоор тооцов"); no first-run orientation/glossary for падан/цикл |
| **Total** | | **29/40** | **Good — up from 27** |

## Design Specificity Verdict

**LLM assessment: decisively authored — and the strongest evidence is last round's own output.** The MaterialDetail reconciliation identity ("НИЙТ ЭЗЭМШИЛ 8,340ш = АГУУЛАХАД + ТҮРЭЭСЭНД + ЗАСВАРТ" with the Акталсан footnote) was called "the screen that earns trust in the whole system"; the падан ledger, the dry-run RebuildModal, and the factory boss's different-page-not-filtered-page were all named peaks. Code comments argue about Отгоо by name (ui.tsx:16, links.ts:16). Verdict: the failures are failures of completion, not conception — four good patterns each applied once.

**Deterministic scan: CLI clean on all 9 files** (exit 0, validated live against control files) — with an honest scope caveat: .tsx scans exercise ~11 of 59 rules, and index.css (outside the file list) carries the one repo finding (layout-transition, intentional sidebar). Browser overlay at 1280×800, no page overflow: 29 findings, of which 10 true (layout-transition ×4 pages, border-accent-on-rounded ×3 measured 2px accent vs 1px neutral, gpt-thin-border-wide-shadow on .command-hero, line-length 98–147 chars unconstrained, tiny-text 11.5px kicker, flat-type-hierarchy: 11 sizes spanning only 1.91×) and 19 false (SVG text-overflow — HTML box logic on SVG, nested-cards keyed on radius alone — rows have no background/border/shadow, em-dash = generated label separators, wide-tracking on a kicker not body text).

**Where they agree:** A's "ALL-CAPS Cyrillic at 12px is slow for a 60-year-old" ↔ B's tiny-text 11.5px kicker + compressed type scale (1.91× span). A's density reading of / stands on its own measurement (2,380px); B's nested-cards corroboration from round 3 dissolved under measurement this round (false positive). Detector-only catches: the compressed type ramp, .command-hero's thin-border-wide-shadow.

**Round-3 remediation held:** none of the previous four P1s recurred — the totals partition is now cited as the app's biggest strength, scope filtering and the machines money-wall are cited as the patterns to copy, and the a11y naming work passed a hostile re-check (skip link, focus rings, unique row names, no double-announce all verified good).

## Overall Impression

29/40, and a different shape of finding: round 3 was "rules broken"; round 4 is "rules half-deployed". The new P0 is the one place the money wall was never extended (ContractDetail's tariff columns for factory — a known deferral from the ledger phase, now correctly promoted against the persona spec). Everything else on the list is finishing a pattern that already exists somewhere in the codebase and enforcing it with a test.

## What's Working

1. **The reconciliation identity on MaterialDetail** — a total she can't decompose is a total she won't believe; this shows the arithmetic, and footnotes the excluded 18ш.
2. **RebuildModal: consequence before commitment** — the preview is the same engine dry-running, so it's the outcome, not an estimate.
3. **Role separation as content, not display:none** — дарга gets Өнөөдрийн ажил with 52px targets; notificationHref refuses to render links into pages his role can't open.

## Priority Issues

**[P0] The factory boss can read rental economics on /contracts/:id.** As darga at 768×1024: ӨДРИЙН ДҮН 631,180₮, ЭНЭ ЦИКЛД ХУРИМТЛАГДСАН 7,574,160₮, the full ТАРИФ column, Засвар/Акт money. `seesMoney` exists (ContractDetail.tsx:43) but gates only two cells; the spec scopes him to quantities and grades, and Machines now does this correctly one menu item away. Fix: extend seesMoney to the remaining money cells + tariff/daily columns (Machines' conditional-th pattern), mirror server-side in the serializer, add per-role response tests.

**[P1-a] One global control, two identities, two locations.** Бүгд/Түрээс/Худалдаа is .segment in the topbar on / (the placement the team's own CSS comment says Отгоо never noticed) and .scope-switch in-page on /contracts. Switching on /contracts then going home silently rescopes every KPI — the fourth card even changes what it measures. Fix: move the dashboard switch in-page under the H1, delete the topbar branch, put scope in the URL.

**[P1-b] Payroll payout arms Enter on the commit button.** ConfirmModal "Цалин олгох" says "буцаагдахгүй" but omits `danger` — so autofocus lands on Олгох ✓ and a stray Enter books a 5,950,000₮ payroll. Also: identical accessible names on every Олгох ✓. Fix: pass danger; grep every ConfirmModal whose intro says "буцаагдахгүй" and assert danger; per-row aria-labels.

**[P1-c] Disclosure affordances are unreliable.** Four expandable surfaces, four signal levels: dashboard KPI has chevron+aria-controls; material row 1 has a chevron; material row 2 of the same group is silently expandable (no glyph, panel opens attached to row 1); loans rows have NO affordance at all — the row's most prominent element is a pencil-edit that does something else. Fix: one DisclosureRow primitive — chevron on every expandable row, id on every panel, aria-controls when open; loans gets a leading chevron column.

**[P1-d] Machine invoices can be generated twice.** POST /machines/{mid}/invoices has no duplicate/overlap guard and never marks logs invoiced — Үүсгэх twice yields M-YY/MM-1 and M-YY/MM-2 over identical rows. Plus: the two entry buttons differ in weight, the card entry silently repoints the open log panel, invBusy locks every machine's button, busy state replaces names with "…", and the preview omits VAT (agrees with server only because vat=0 today). Fix: 409 on overlapping client+range naming the existing №; per-machine busy; stable labels with aria-busy; VAT in preview.

**[P2] Vocabulary drift, round 2.** Six labels for one авлага number (the client page's own KPI breaks UI-ЗАРЧИМ's explicit rule); Механизм↔Машин four switches on one screen; Зогсоох/Хаах/Хасах = one concept, three verbs; Хаах collides (dismiss vs terminate-a-loan — and the ✕ aria-label is better than the visible label); button grammar drifts against the verb-first rule. Fix: extend the §3 dictionary + a vocab test (lib/vocab.ts) that fails when a page invents a synonym.

**[P3] Dashboard buries the actionable list; ALL-CAPS 12px labels.** Forecast (456px, "нэхэмжлэгдсэн дүн БИШ") above the fold; the 7 call-today alerts at y=1243; 10 flat notification rows uncapped. Metric labels 12px uppercase Cyrillic. Fix: Мэдэгдэл (capped at 4 + "Бүгдийг харах") above the fold; projection collapsed to its total with the same drill-down pattern as the overdue KPI; labels to 13px.

## Persona Red Flags

**Отгоо:** the switch she's on record never noticing still rescopes her morning numbers from the topbar; her actionable list is two screens down; two identical-looking contract rows with the "2 падан" answer computed but not shown; "Хамтран ажилласан: 2026-08-24-с" for a client whose contract began 2026-03-17 (created_at = import date — every migrated client shows a false date on day one); she can edit her own salary and deactivate herself.

**Дарга:** P0 above; his page says Өнөөдрийн ажил while the sidebar/topbar/tab all say Удирдлагын төв (violates the three-places rule); the drawer close ✕ — the only exclusively-touch control in the app — is 36px (--target-sm, the desktop-dense tier); shipment queue rows 43px beside a correct 52px Ачсан ✓.

**Sam:** verified good — skip link, focus rings, unique row names, no double-announce, modal focus trap. Broken: aria-controls/panel id missing on every disclosure except the dashboard; the InlineEdit confirm step is silent (zero live regions) and its confirm button's accessible name is a bare question; busy states destroy names ("…"); PDF/Олгох ✓/Нэхэмжлэл үүсгэх duplicate names; tr[tabindex] rows containing buttons announced as one control; scope switch uses aria-pressed where radiogroup semantics fit.

**Alex:** 88 tabbables and 54 armed editors on /machines with no read mode; contract actions split across two screens; no shortcuts; scope not in the URL; three interactions per cell when correcting twelve tariffs.

## Minor Observations

Login page keeps the previous route's document.title; login placeholders leak a real username; three permanently-·0 filter chips stay clickable into empty states; detail-page action slot has no convention (three pages, three placements); MaterialDetail's metric strip is navy while ContractDetail's is white — navy is otherwise reserved for Receipt/command-hero; machine card is the only clickable container bypassing rowClickProps (div onClick, no role — keyboard path via inner button, but the card advertises what keyboard can't get); InlineEdit confirm is bg-money green even when cutting a tariff; method field offers 3 chips creating vs 4 editing (Дотоод changes invoice eligibility behind "Хэлбэр солих уу?"); Loans has zero h2 (SR heading walk skips the page); type ramp compressed (11 sizes in 1.91×, six at 0.5px steps — detector).

## Questions to Consider

1. Why is the app's most consequential dialog (RebuildModal) its least protected — no autofocus, orange commit — while a 460,000₮ fuel-log delete gets danger + focus on Болих? What if every money-moving dialog had to declare its blast radius as a required prop, the way FormModal made `dirty` mandatory?
2. /machines and /salary have no read mode — is "everything is always editable" a decision, or an absence of one? Ten looks per month vs one fix — the interface is optimised for the wrong nine visits.
3. The UI-ЗАРЧИМ dictionary has five rows; how many concepts does the system actually have? Should the vocabulary live in lib/vocab.ts where a test fails when a page invents a synonym?
