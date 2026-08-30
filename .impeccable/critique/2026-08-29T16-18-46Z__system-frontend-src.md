---
target: reworked surfaces round 3 (dashboard, contracts, ledger, materials, machines, loans, salary, cohesion)
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-29T16-18-46Z
slug: system-frontend-src
---
# Critique — Жигүүр Зам ERP, reworked surfaces (round 3)

Method: dual-agent (A: design review · B: detector/browser evidence), isolated until synthesis.
Scope: Dashboard drill-down + payment schedule, Contracts switch + open-ended dates, ContractDetail падан ledger, MaterialDetail (new), Machines retire/invoice, Loans top-up/monthly, Salary inline editing, cohesion sweep.

## Design Health Score — 27/40 (Acceptable, at the Good border)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Topbar date is UTC (`toISOString`) while the rest of the app is local — wrong 8h/day on a system that books алданги per day |
| 2 | Match System / Real World | 3 | "5,130 сая₮" where the business says тэрбум; `#8 падан` exposes a DB row id as if it were a paper падан number |
| 3 | User Control and Freedom | 3 | Machines gained retire/unretire; Salary "Хасах" is one-way with no restore/list |
| 4 | Consistency and Standards | 2 | Same round, opposite decisions: seesMoney on ContractDetail but not Machines; contextual delete labels on Machines but not Salary/Loans; drill-down names invoices by period, Мэдэгдэл by № |
| 5 | Error Prevention | 3 | RebuildModal dry-run is best-in-class; machine InvoiceModal matches client by exact free text — one casing difference silently yields 0 rows |
| 6 | Recognition Rather Than Recall | 3 | Overdue drill-down drops the invoice №, forcing a mental join against Мэдэгдэл on the same page |
| 7 | Flexibility and Efficiency | 2 | No sort/filter/bulk on any new table; machine log has no month filter; MaterialDetail movement cap has no "show more"; 63 tab stops in one table |
| 8 | Aesthetic and Minimalist Design | 2 | Loans rows 124–160px tall at 1366×768; Salary table clipped 132px inside its card; dashboard 2,908px ≈ 4 screens (detector: nested-cards ×10 corroborates) |
| 9 | Error Recovery | 3 | Server messages pass through; persistent error toasts; the empty machine-invoice result is the one undiagnosed failure |
| 10 | Help and Documentation | 3 | Inline copy genuinely excellent; "Нөөц түрээсэнд 10.6%" and Засварт-vs-Агуулахад relationships unexplained |
| **Total** | | **27/40** | **Acceptable — up from 24** |

## Design Specificity Verdict

**LLM assessment: ~85% authored for this product.** The падан ledger (running balance + lot attribution `#1 · 330₮ → 306ш`), `endDateLabel()` encoding "this company doesn't set end dates" as **Хугацаагүй**, the Төлбөр/Төлөлт distinction in UI-ЗАРЧИМ, and the дарга's money-free work-queue home are structurally product-specific. Two generic-CRM assumptions survived: the "ending soon" concept (permanently 0 — 5 of 6 live contracts have no end date, and the one expired contract still shows green "Идэвхтэй" because no `expired` state exists) and `sayaFmt` having no тэрбум step.

**Deterministic scan: 0 findings across all 9 reworked files** (validated live against a control file — a genuine clean, not a broken scan; 59 rules active). Repo-wide: exactly 1 finding, `layout-transition` on the sidebar collapse (`index.css:366`) — true positive mechanically, intentional design call. In-page overlay on 4 routes: dashboard 22 findings (nested-cards ×10, tiny-text 11px/11.5px, skipped-heading h1→h3), other pages 4–7 each. Triage: sidebar "clipped-overflow" and MaterialDetail "text-overflow ×4" are false positives (measured — decorative clip / negative overflow); tiny-text `span.jz-location` 11px and skipped headings (h1 followed by h3 on 3 of 4 pages) are real and detector-only catches. Em-dash flags are the Mongolian separator convention — advisory, ignored.

**Visual overlays:** the browser pane was hidden, so no [Human] presentation; overlay scripts injected successfully on all 4 routes and screenshots with badges were captured for the record. Live server started and confirmed stopped; zero project-file mutations.

## Overall Impression

The round moved the system from "a database with screens" toward Отгоо's actual workbook — the ledger, the projections, the drill-down all answer real questions she used to answer by hand. Where it falls short is symmetry: rules established in one file (seesMoney, contextual aria labels, 36px targets, scope filtering) are violated one menu item away. The single biggest opportunity: make the four P1s below symmetrical — they are all "the rule exists, apply it everywhere" fixes, not redesigns.

## What's Working

1. **The падан ledger** — solves the hardest reconciliation problem in the business inside a table row, and refuses to move the balance for unconfirmed movements (`—` + explanatory title). The honesty is what makes it trustworthy.
2. **Role split on ContractDetail is real** — seesMoney removes balance/invoices/payments/deposit/PDFs for the дарга while keeping tariffs (warehouse information). A judgement from the org chart, not a permissions matrix.
3. **The keyboard contract holds** — Enter toggles the new expandable rows with focus retained and the accessible name flipping нээх→хаах; `:focus-visible` rings only for keyboard users. Verified live.

## Priority Issues

**[P1] MaterialDetail's header numbers don't add up and contradict Тайлан.** 4,485 + 3,825 + 30 = 8,340, header says НИЙТ ЭЗЭМШИЛ 8,310 (`serializers.py` omits `in_repair`; `analytics.py` includes it → two surfaces disagree about how many 6012 the company owns). The one page whose job is "where is my material", shown to a user who WILL add the row. Fix: `total = on_hand + out + in_repair`, label the partition, decide Акталсан's place explicitly. — /impeccable polish

**[P1] Dashboard scope switch filters only half the page.** At Худалдаа: KPIs/drill-down/aging narrow correctly; Мэдэгдэл still lists 5 rent invoices, revenue chart and Ачилт хүлээгдэж буй ignore scope (`build_notifications` takes no scope). A filter that silently ignores half a page is worse than none. Fix: pass scope through, or label unscoped panels. — /impeccable harden

**[P1] Loans and Salary break at Отгоо's exact 1366×768.** Loans: 9 columns → 124–160px row heights; confirming an InlineEdit widens the column 125→365px, pushing the table 242px out of its container mid-edit. Salary: backwards grid gives the editable table 416px — НДШ column and "Хасах" hidden behind in-card horizontal scroll (the one interaction Excel-native users never discover). Fix: swap Salary grid ratio; fold ТӨЛСӨН ХҮҮ into expanded row; cap InlineEdit confirm-step width. — /impeccable adapt + layout

**[P1] The дарга sees and can edit the machine P&L.** As darga: ОРЛОГО/ЗАРЛАГА/ЦЭВЭР, "Жолоочийн цалин −1,500,000₮", ✎ on every amount, invoice creation — while the same round built seesMoney one menu item away because the spec says he must not see company financials. Related: Дотоод ажил counts as Орлого on the card while the invoice modal excludes it — one page, two answers. Fix: apply seesMoney to Machines (hide money columns/sections for factory; server-side gate patch/delete/invoice to manager+finance). — /impeccable harden

**[P2] Overdue drill-down loses the invoice №** (renders period only; Мэдэгдэл calls the same invoice R-26/07-4 — mental join required) and lands at the top of the contract with no anchor/highlight and no "Төлбөр бүртгэх" row action. Fix: render `lb.sub`, deep-link `#inv-:id`, add the row action. — /impeccable polish

## Persona Red Flags

**Отгоо эгч (60, Excel-native, 1366×768):** everything in P1#3 happens on her screen; "5,130 сая₮" forces mental division; "0 нь удахгүй дуусна" is a permanent zero occupying a KPI sub-line; contract 26/11 shows green "Идэвхтэй" beside a red "хугацаа хэтэрсэн" notification; Мэдэгдэл — the only actionable list — sits at y≈1,794 (screen 3 of 4); "НӨӨЦ ТҮРЭЭСЭНД 10.6%" in healthy-green with no target or explanation.

**Дарга (tablet 768px):** delete buttons 28×28px — violates UI-ЗАРЧИМ's own "36px-ээс намхан дарагддаг юм БАЙХГҮЙ"; machine log overflows 90px with 5 inline editors per row behind touch-scroll; the expired-contract notification tells him "Сунгах эсвэл хаана уу" but both actions are manager-gated — an instruction with no button.

**Sam (keyboard/screen reader):** ContractDetail meta double-announces 4 of 5 fields ("Дуусах: Дуусах огноо: …"); Machines/Salary inline edits have no row identity ("Сарын цалин: … засах" ×6 with nothing naming whose) — MaterialLedger does it right, copy that pattern; the new machine card is `div[role="button"]` CONTAINING a real button (ARIA presentational-children risk — the inner "Нэхэмжлэл үүсгэх" may not be exposed); two adjacent material rows share identical accessible names; `aria-controls="overdue-panel"` dangles while collapsed; Salary "Хасах" ×6 with no per-row name. Detector adds: h1→h3 skipped headings on 3 of 4 pages, tiny-text 11px in the shared shell.

**Alex (power user):** zero sortable columns on the new tables though `lib/sort.ts` exists; no month filter on machine log; MaterialDetail's "сүүлийн 20 · нийт 34" announces its dead end.

## Minor Observations

"Идэвхтэй бүгд" includes closed contracts (latent until one closes); projection panel prints client-level receivable on a contract row (22.17M vs the contract's own 16.04M one click later) — label it; scope-emptied projection panel is a bare p with no exit; MaterialDetail omits pending shipments from the distribution table (450ш unconfirmed invisible — ContractDetail's `+Nш хүлээгдэж буй` pill pattern fits); MaterialDetail is the only detail page with no actions and no InlineEdits; "2 падан" pill exists on MaterialDetail but not ContractDetail; `→` carries four meanings on one screen; Явц column prints "Худалдаа" beside a Төрөл pill saying the same; Salary hero "6 сая₮" vs table "5,950,000₮" for the same run; machine-card "Нэхэмжлэл үүсгэх" has no busy state (double-tap fires twice); topbar UTC date.

## Questions to Consider

1. If the company deliberately doesn't set contract end dates — and lib/contract.ts says so in writing — what would it cost to delete the "ending soon" concept entirely and add a real `expired` state instead?
2. Is the confidentiality rule actually a rule, or a `seesMoney` constant only one file imports?
3. Of the eight blocks stacked over 2,908px on Удирдлагын төв, which would Отгоо genuinely miss? What earns screen one instead of a metric that reads 0 every day?
