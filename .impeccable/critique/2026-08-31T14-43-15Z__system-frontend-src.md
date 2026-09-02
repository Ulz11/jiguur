---
target: seven new P0 flows (void, penalty lever, cycle modes, akt, day counts, rate+close, unified receivable)
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-31T14-43-15Z
slug: system-frontend-src
---
# Impeccable Synthesis — Seven P0 Flows, Жигүүр Зам ERP

*Six isolated assessors, one adversarial verifier per top finding, one mechanical detector pass. 2026-08-31.*

---

## Design Health Score

Scored as **the app experienced through the seven new P0 flows** — not the mature screens in isolation. Where the six assessors disagreed, the evidence decides and the disagreement is named.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | **2** | Every consequential change in this round announces itself in a channel she is documented to miss: a refused void explains itself in a toast 228px below the button; a completed wizard step deletes itself; invoices materialise at 06:00 with no on-screen trace at all. All six assessors scored this 2 — the only unanimous score. |
| 2 | Match between system and real world | **3** | The Mongolian is genuinely authored («агуулахад буцна · +200ш», «эцсийн тасархай цикл», «системээр 12 хоног»). Docked because the flow's headline noun is built on a root — «нэхэм-» — that appears **zero times** across 15,000+ cells of her own workbooks, and because /audit prints `void`, `akt`, `rate_change`, `close`, `cron`, `book_penalty` in English. |
| 3 | User control and freedom | **3** | The round's real gain: five object types correctable, nothing deleted, reason+who+when preserved, replayed through a dry-run gate. Held to 3 because the newest money-*creating* action (алданги нэхэх) ships with **no reversal at all** — the exact treatment H1 rejected. |
| 4 | Consistency and standards | **2** | Three date formats for one cycle; two verbs for one operation 92px apart in one modal; «Гадаа» used four times against their own glossary; a discount painted money-green in the form and danger-red in the receipt two clicks later. All six scored 2. |
| 5 | Error prevention | **2** | Two proven unbounded money paths: an as-of date with no `max` on either side of the wire that books more than the whole contract balance, and a signed day count that both validators accept and the server silently clamps. |
| 6 | Recognition over recall | **2** | She must hold 23,171,588 in her head to read the void receipt; convert 16,632,000 to сая to read the sub-line as a component; carry the machine's day count from another card; and select «Бүх түүхэнд» to find out what «Бүх түүхэнд» does. All six scored 2. |
| 7 | Flexibility and efficiency of use | **2** | Six акт lines on one paper means six modal openings. Charging penalty is all-or-nothing per contract when the negotiation ends at "March, not April". Resolving one lot opens a form for four. |
| 8 | Aesthetic and minimalist design | **2** | **Assessors split 3–3.** The new modals are genuinely restrained (512×552, no scroll, four receipt rows). The new *rows* are not: eight controls in a 222×187px box, 107px per акт row putting a four-entry card at 526px on a ~600px viewport. The round added density to lists while keeping modals clean; the lists are where she lives. |
| 9 | Help users recognise, diagnose, recover | **3** | **Up from 2 this round, and earned.** A forced 403 preserved the typed value, wired `aria-invalid`/`aria-describedby`, drew a measured red ring, relabelled to «Дахин оролдох», restored focus deliberately, and fired a persistent named toast. Four promises, four kept. Held from 4 by the void refusal branch and by no undo anywhere on the penalty path. |
| 10 | Help and documentation | **2** | The concept the penalty flow rests on is never defined on screen — the tooltip for «нэхэгдээгүй» just repeats «нэхэгдээгүй». The mercy/lever framing exists in five places, all of them `/* */` comments. |

**Total: 23 / 40 — Serviceable. Capable, not yet legible.**

**On the trend (19 → 24 → 27 → 29 → 23).** This is not a regression; it is a scope change, and the shape of it matters more than the number. Those four runs scored mature screens. This one scores the seven newest, least-settled surfaces in the app. Read against the flows themselves the picture is clean and consistent: **the round bought capability and did not buy legibility.** H3 and H9 moved up — she can now correct, forgive, close, and be told when a save fails. H1, H4 and H6 sat flat at 2 across all six independent assessments — the three heuristics that are all about *saying* what happened, consistently, without making her remember. Every P1 and most P2s below live in exactly those three.

---

## Handicap closure scorecard

The round's entire purpose. **1 closed · 1 mostly closed · 7 partial · 0 open.**

| Handicap | Verdict | The one line that decides it |
|---|---|---|
| **H1** — no way to fix a wrong record | **PARTIAL** | Five object types void with reason + actor + timestamp, nothing deleted, replayed through the dry-run gate — the mechanism is closed. But the modal that *commits* the void (`RebuildModal`) contains zero occurrences of «Ачилт», «хүчингүй», «цуцл» or the movement date: the screen that does it never names what it is doing. |
| **H2** — penalty charges itself | **PARTIAL** | The auto-booking half is genuinely dead: one server door (`features.py:69`), an enforced ⚠ block in `billing.py:957-963` naming every caller that must not invoke it, wizard default `0`, model default `0`. The *lever* half is not delivered — the number is the smallest, dimmest element on all five surfaces it appears on, and the action is two page-loads from /collections where she actually negotiates. |
| **H3** — calendar-month clients cannot be entered | **PARTIAL** | The mode exists, is editable behind the same rebuild gate as `start_date`, and `cycleModeHint` discloses the February clamp *before* she chooses — excellent. But `/api/contracts` carries no `cycle_mode`, so "which of my clients bill by the calendar month?" is unanswerable from any list she scans. |
| **H4** — акт has no free line, no discount | **PARTIAL** | Every mechanical clause delivered: ±amount via a toggle that owns the sign, required free-text note, server-assigned cycle, prints on invoice + хавсралт + актын цаас, audited, voidable. The *arithmetic* H4 exists to protect — «нийт актнаас 15% хасав», her own placeholder text — remains impossible on screen: no Σ in the table, none on the printed акт block, and the акт total split across two blocks that share the word «Акт». |
| **H5** — the machine owns the day count, she owns the signature | **PARTIAL, and the weakest** | The machine's number is a **placeholder, not a prefill** — the single best decision in the round. But a count exceeding the lot's remaining window is accepted by both validators and then silently clamped by `billing.py:252/303 min(ov, window)`, so the хавсралт prints **`10*`** under «* гараар тохирсон хоног» when she signed 12. That is verbatim the conclusion H5 was written to prevent: *«машин тоолж чаддаггүй»*. |
| **H6** — tariff edits half-apply, history rewrites itself | **PARTIAL** | `RateChange` record, server-supplied cycle boundaries, safe default on `next`, dedupe of same-date options, dry-run rebuild, void-not-delete — the mechanism is right. The judgement is not: the Receipt total is **byte-identical (641,250₮) for all three «Хэзээнээс» options**, so the modal's only money surface is blind to the modal's only real question. |
| **H7** — the meter never stops at close | **MOSTLY CLOSED** | The final partial cycle now invoices (verified live: №R-24/03-6, 2026-08-19 – 2026-08-31, 8,205,340₮ from the same function that prints the paper), outstanding goods are resolvable inside the flow, steps are data-driven, and it ends in paper rather than a toast. Still open: the wizard re-indexes its own step list under her and can land her on the irreversible confirm screen without her pressing «Цааш →». |
| **H9** — money appears when someone looks; two screens, two receivables | **PARTIAL** | The data layer is **closed and proven**: client 3 reads 22,768,000₮ on /clients, /clients/3 (both places) and /collections; the dashboard KPI 79,211,908₮ is the exact sum of all five clients. One function feeds every call site. Reopened twice above it — the display layer re-rounds each element to сая independently, so on /collections `22.8 − 16.6 = 6.2` against a neighbouring column reading `6.1`; and the 06:00 cron's only trace is a grey English `cron` pill authored by «—». |
| **H10** — saves fail silently | **CLOSED** | Forced live: the field stayed in edit mode, `ТЕСТ УТГА 777` preserved verbatim, `aria-invalid="true"` with `aria-describedby` wired to the error span, red ring measured, button relabelled «Дахин оролдох», focus deliberately restored (`ui.tsx:488/511-515`), persistent named toast on focusout. The only residue is polish: a 72-char clip on the reason, and «Дахин оролдох» offered for a 403 that can never succeed. |

**Read the table as a shape, not a scorecard.** Every single PARTIAL fails at the same joint. The engine is finished; the sentence that tells her what the engine did is not. H1's mechanism is complete and its commit screen is anonymous. H4's data model is complete and its Σ is missing. H6's rebuild is complete and its receipt is constant. H5's override is complete and its refusal is a silent clamp. H9's arithmetic is exact and its display re-rounds. **Seven flows, one bug, wearing seven costumes.**

---

## Design Specificity Verdict

**Authored for this business and this woman — in the sentences. Category-generic in the furniture.**

The copy could not be lifted into another product. A movement-void receipt names the physical consequence in warehouse language («Тулаас В2 (шинэ) · агуулахад буцна · +200ш») and, for a pending shipment, refuses to invent a phantom stock line («Нөөц хөдлөхгүй · хараахан баталгаажаагүй ачилт»). The акт note placeholder is her own sentence lifted from her workbook: «ж: кран дуудлага, тээвэр, нийт актнаас 15% хасав». `daysVarianceText` puts *her* number first and the machine's in parentheses, and deletes the variance clause entirely when they agree — the machine is structurally incapable of saying "you disagree with me." `cycleModeHint` discloses the February clamp before she picks the mode. The close wizard's step list deletes its own барьцаа step when the contract has no барьцаа. `aktCycleLabel` and `invoiceLabel` emit a byte-identical string so she can eyeball-match her own two rows. These are domain decisions, not UI patterns.

**Then the containers arrive and the authorship stops.** The акт section is a five-column flat table with no grouping and no Σ — at home in any SaaS expense tracker, and precisely where her Excel had a *cycle block under a SUM*. The «Хэзээнээс» control is three equal-weight native radios each reading `<noun> — <ISO date>`, at the exact point where the domain needed the most opinion. The uncharged penalty renders as a slate-grey number with a small grey word under it: strip the Mongolian and /contracts/1's money card is any dashboard's "Estimated fees (uncharged)".

**The sharpest evidence in the whole pass:** the words «өршөө» (mercy) and «хөшүүрэг» (lever) — the entire thesis of the penalty flow — appear five times in `src/`, and **all five are inside `/* */` comments** (`lib/penalty.ts:10-11`, `Dashboard.tsx:280`, `ContractDetail.tsx:269`, `Collections.tsx:162`). The team wrote the argument to itself and shipped the generic version to her screen. That single pattern explains most of the PARTIAL verdicts above.

### What the deterministic scan found

**CLI, 11 P0 `.tsx` files: exit 0, `[]`, zero findings.** Read that as a coverage fact, not a clean bill of health. Of the 59 registry rules, roughly **10** can execute on a `.tsx` file at all — `PAGE_ANALYZER_EXTS` excludes React components, `.css`-only rules are gated out, no design system is loaded, and ~35 rules are DOM-only. Two blind spots were proven, not inferred: `overused-font` did not fire on a control's `style={{ fontFamily: 'Inter' }}` because the matcher requires kebab-case, so **JSX camelCase inline styles are invisible to it**; and `border-accent-on-rounded` requires `≥3px` *and* `border-radius` on the same line, while the real code is `2px` with radius inherited from `.card` in a different rule. Control files fired correctly (10 findings / 8 rules on `Control.tsx`), so the engine is healthy — it simply cannot see this codebase's shape. Suppressions: none anywhere.

**CLI, `index.css`: 1 finding.** `layout-transition` at `index.css:422`.

**Browser overlay, 4 routes at 1366×768: 29 primary.** Confirmed by measurement:

| Rule | Location | Measured |
|---|---|---|
| `layout-transition` | `index.css:422` | `transitionProperty: "width, flex-basis"`, 0.22s. Collapsing the sidebar produced **12 distinct intermediate widths over 191ms**, with `.jz-main` reflowing 1104px → 1290px every frame. **No `prefers-reduced-motion` guard** for `.jz-sidebar`, while the same file's `@media (max-width:840px)` block already uses the correct `transform` technique. Fires on all four routes. |
| `border-accent-on-rounded` ×3 | `index.css:515-518` | `border-top: 2px` vs `1px` elsewhere, `border-radius: 9px`. CLI-invisible for both reasons above. |
| `gpt-thin-border-wide-shadow` | `.command-hero` | `1px` border + `rgba(25,41,107,0.17) 0 16px 30px`. |
| `all-caps-body` | `/contracts/1` | CSS `text-transform: uppercase` on a 42-char string wrapping to **2 lines** at 288px — not a short label. |

**Five false positives, each disproved by measurement:** `text-occlusion` on `/` was **self-inflicted** — the flagged span sits inside the overlay's own `div.impeccable-label`, `closest('#root, .jz-main') === null`, and the phrase does not exist in the app pre-injection. `text-overflow` ×4 were SVG `<text>` nodes (`rectW 43.2` inside `parentW 589.5`, `overflow: visible`, nothing clipped). `nested-cards` ×10 flagged a bare `div.flex.items-center` measured at `backgroundColor rgba(0,0,0,0)`, `borderWidth 0px`, `borderRadius 0px`, `boxShadow none` — all four card affordances absent. `cramped-padding` measured the card (`padding: 0`) and missed the inset, which lives in the `th` cells at `10px 12px` — this is the house excel-bordered-table pattern, deliberate. `wide-tracking` misfired on a 21-char eyebrow because the caps are literal Cyrillic glyphs, not CSS-applied, so the short-label exemption could not see them. Two mixed: `line-length` arithmetic was wrong in both directions (claimed 156, actual 101; claimed 103, actual 39/line); `tiny-text` at 11.5px is factually below the floor but on that same eyebrow label.

**Where the detector caught what six humans missed:** `index.css:422`. Not one assessor mentioned it, and it reflows the entire main region on every route, on every sidebar toggle, with no reduced-motion guard — for a user documented as not noticing on-screen change, an unrequested 191ms reflow is the one motion she *will* notice.

**Where the humans caught what the detector structurally cannot:** every contrast measurement (2.07:1 navy-on-red), every focus and ARIA finding, both unbounded-input findings, the silent clamp, and — the best example — the fact that `Dashboard.tsx:288`'s dashed border is **defeated by a two-class selector at `index.css:502`**, so the pill that is supposed to mark "this is a calculation, not a debt" has never once rendered as designed. That is a cascade fact. The CLI cannot see cascade at all, and no browser rule exists for "the utility class the author wrote is being overridden."

---

## Overall Impression

**This round shipped the hard half and skipped the cheap half.**

The hard half is real and it is not common. Void-not-delete across five object types, replayed through a dry-run gate. A `min`/`max` clamp on `PenaltySplit` so a server rounding difference can never print a negative «нэхэгдээгүй». A rounding contract (`billing.py:1099-1101`) that rounds the *total* and derives the *component*, with a docstring naming the exact failure it prevents. A focus-capture written during render rather than in an effect, with a comment explaining that `autoFocus` runs first — a bug someone had to have been bitten by. A dev-time `console.warn` that fires if a modal says «буцаах боломжгүй» without taking the `danger` flag: the safety rule is guarded by a machine, not by discipline. And the day-count placeholder, which is the single best product decision in the material.

The cheap half is missing everywhere, and it is the half she reads. Add `void: ["Хүчингүй болгосон", "pill-red"]` to a Record — three lines. Add `max={today()}` to a date input — one attribute. Put the base in a receipt row's `sub`, which `ConfirmModal` already renders — one string. Thread the object's name into `RebuildModal`'s title — one prop. Give the danger button a foreground token — one CSS rule fixing 12 modals at once. **Every P1 and most P2s in this report are under five lines.** That is not a criticism of ambition; it is a diagnosis of where the attention ran out, and it is unusually good news.

**The single biggest opportunity: nobody has ever seen these features on screen with data in them.** Zero rows in the live DB have ever been voided. `penalty_booked` is 0 for every client. `akt_entries` is empty in `jiguur.db` and in every backup. No `rate_change` exists on any of six contracts. Three separate verifiers had to *inject* the states in order to check the claims. The consequences of that are already visible and already costly: a cancelled row's money still renders in live warn-orange because nobody ever looked at one; the dashed border that separates charged from uncharged penalty has never rendered; the deposit-settle receipt stops adding up the first time a penalty exists. **Seed a fixture database with one of every new state — a voided payment beside a live one, a charged penalty, four акт entries across three cycles, a retroactive rate change — and put it in front of Отгоо for twenty minutes.** Half of this report surfaces in the first five of them.

---

## What's Working

**1. The machine's number is offered as a placeholder, not a prefill.** Measured live: `input#…-days-0` carries `placeholder="12"` and the helper beside it reads «системээр 12 хоног». H5's entire argument is that when two parties sign for 12 days, 12 is the commercial fact and a system printing 11 is not "correct" — it is in breach. A prefilled 11 asks her to fight the machine. A placeholder 11 *invites her to agree with it*, and `daysVarianceText` then leads with her number and drops the variance clause entirely when they match. This is the rarest thing in the round: a place where the product understood that her authority outranks its arithmetic and expressed that in the interaction, not just the data model.

**2. The payment modal retires a broken behaviour at the exact moment it used to happen.** «Алдангийн тооцоолол ≈1,462,376₮ — нэхэгдээгүй. Энэ төлбөр түүнийг хөндөхгүй; нэхэх бол «Алданги нэхэх» товчоор нэхнэ.» — rendered *before* «Бүртгэх» is pressed. The old system booked penalty inside the payment POST, so a forgiven client's balance grew the instant she recorded his money and she found out by phone. You cannot fix that with a changelog for a user who does not read changelogs. You fix it by standing at the exact keystroke where the betrayal used to occur and denying it in her own language. That sentence is worth more trust than the entire server-side enforcement behind it.

**3. One question, asked identically from both entry points.** The payment-void modal opened from `/contracts/1` and from `/clients/4` was diffed character-for-character: identical text, identical 512px panel, identical receipt rows, identical required field. `VoidPayment.tsx:6-8` states this as the reason for the shared component and it actually holds. For a woman who tolerated one document appearing in three forms across three workbooks and lived with the discrepancy for years, "I will never be asked two different questions about one payment" is a structural promise, and it is kept.

**4. The `H10` error state, in full.** Value preserved verbatim. `aria-invalid="true"` with `aria-describedby` wired to the error span's id. `aria-live="polite"`. Red ring measured at `1px solid rgb(179,39,45)` plus a 3px shadow. The reason inline at the field. Button relabelled «Дахин оролдох». Focus deliberately restored after `busy` drops, specifically so the browser does not dump it to `<body>` and silently kill the later blur announcement. Error toasts that never auto-dismiss, `role="alert"`, above the modal layer. This is the only handicap in the round rated CLOSED, and it is closed because someone thought about the *sequence of a person's attention*, not just the states of a component.

---

## Priority Issues

### P1

**[P1] The as-of date on an irreversible penalty charge is unbounded on both sides of the wire — and the receipt understates what the server will actually book** · *Алдангийн хөшүүрэг*

The date input in `ChargePenaltyModal` carries no `max` and no `min`; `features.py:90` checks only `as_of < c.start_date`. Set the field to `2027-08-31` and the receipt recomputes to «377 хоног → 35,693,229₮» and «407 хоног → 3,161,535₮», total **38,854,764₮** — more than the entire contract balance of 28,694,320₮ — with the confirm button measured `disabled === false`. The verifier escalated the severity: `features.py:92` runs `billing.ensure_invoices(db, c, as_of)` *before* charging, and `cycles_of` walks cycles to the passed date with no clamp to today. On this Хугацаагүй contract with 62 live movement rows that mints roughly a year of future invoices at ~18.9M₮ each, and `_book_invoices` then iterates `contract.invoices` — which now includes them, each already past its own future due date. **The amount booked exceeds the amount the receipt promised, by roughly 6×.** The frontend mirror in `lib/penalty.ts` can only see invoices that already exist, so it structurally cannot preview this.

Why it matters to her: `billing.py:1266-1267` documents that void was **deliberately** built not to reverse `penalty_booked` or `penalty_booked_until`, and no «алданги нэхэлт цуцлах» exists anywhere in the product. This is the only unguarded no-undo path in the app, aimed at the one number H2 identifies as her most politically sensitive, against a client she has forgiven for twenty years. The verifier correctly softened two limbs: `useState(today())` pre-fills the field, so the default path requires zero typing (this is why it is P1 and not P0); and the total *does* re-render live at 21px/700 in danger colour — the largest element in the dialog. But nothing on screen ever says the date is in the future, and the row keeps its own 30-day label «2026-07-20 – 2026-08-18» beside a day count of 377, which reads as noise rather than as an alarm.

**Fix:** `max={today()}` and `min={d.start_date}` on the input (`ContractDetail.tsx:2478`), plus the matching server guard beside the existing one in `features.py:91`. Then clamp `ensure_invoices` to `min(as_of, date.today())` so a charge can never mint invoices. **Systemic note from my own measurement: all 11 `type="date"` inputs in `ContractDetail.tsx` carry neither `min` nor `max`.** This is not one field; it is a house convention that does not exist yet.

---

**[P1] The penalty receipt shows a product with neither multiplicand — fewer days, three times the money, and no base anywhere on the screen** · *Алдангийн хөшүүрэг*

Live on `/contracts/1`, the «Алданги нэхэх» receipt reads «2026-07-20 – 2026-08-18 · 12 хоног → 1,136,124₮» above «2026-06-20 – 2026-07-19 · 42 хоног → 326,252₮». Read alone that is nonsense: fewer days, 3.5× the amount. The reconciling numbers — outstanding 18,935,400₮ against 1,553,580₮ — appear nowhere in the modal. The verifier widened the gap in two ways. First, the date range on each row is the **invoice cycle, not the penalty window**: a 30-day range immediately followed by «· 12 хоног», with the actual window start (`penalty_since`) appearing nowhere, so the «·» glues together two unrelated day counts. Second, the on-page pattern the assessor offered as the fix is itself mis-paired — the «≈ алданги · нэхэгдээгүй» estimate renders under the **ДҮН** column, not the **ҮЛДЭГДЭЛ** column that generates it, so for every partially-paid invoice the estimate already sits beneath the wrong number.

Why it matters to her: her entire method is `SUM` across 15,000 cells — the sheet never calculated, it recorded a decision she had already priced. This receipt asks her to authorise a permanent 1,462,376₮ debt on the strength of two numbers she cannot reconstruct from anything visible. The only self-consistent reading of those two rows is that the machine invented them. She will not press it once; or she will press it once, fail to explain it on the phone, and never open the modal again.

**Fix:** put the base in each row's `sub`, which `ConfirmModal` already renders (`ui.tsx:286`): `sub = "№R-24/03-5 · 18,935,400₮ × 0.5% × 12 хоног (2026-08-19-ээс)"`. Same row height, same receipt, and the arithmetic closes on screen. Separately, move the invoice-table estimate under the **ҮЛДЭГДЭЛ** column where it belongs.

### P2

**[P2] /audit — the other half of "void-with-audit" — speaks English, and it is not one word but six across five of the seven flows** · *Цуцлалт, Тариф ба хаалт, Алдангийн хөшүүрэг, Чөлөөт акт, Нэг авлага*

Two assessors flagged this independently for different tokens; folding them and grepping every emitter shows the real scope. `Audit.tsx:7-15` `ACTIONS` has no key for **`void`** (`payments.py:147`, `contracts.py:649`, `:814`, `:941`), **`close`** (`contracts.py:1215`), **`cron`** (`services/cron.py:115`) or **`book_penalty`** (`features.py:93`); `ENTITIES` (`:16-21`) has no **`akt`** or **`rate_change`** (nor `machine`, `machine_log`, `machine_invoice`, pre-existing). All fall through to `[r.action, "pill-grey"]`. A cancelled акт renders as «void · akt #12»; a cancelled tariff as «void · rate_change #8»; the night's automatic invoicing as a grey `cron` authored by «—». Meanwhile `delete` renders correctly as «Устгасан» in red — **the operation the system deliberately does not do is the one that speaks Mongolian.**

The verifier made three corrections, all of which I have applied. The claim that grey is "quieter than a routine «Зассан» in blue" is wrong — `UI-ЗАРЧИМ` §4 carries an explicit ⚠ that `.pill-blue` is not blue at all but brand amber; the real contrast is that cancellation is `--color-danger` on all seven other surfaces per `lib/void.ts` and grey only here, which is an internal inconsistency. The claim that this is "the one screen whose job is reading cancellations back" is overstated — `voidTitle()` puts «ХҮЧИНГҮЙ: шалтгаан · хэн · хэзээ» in tooltips on the primary surfaces. And the main mitigant the assessor omitted: **all four void emitters write a Mongolian `detail`** («… — ХҮЧИНГҮЙ: {reason}»), so the «Дэлгэрэнгүй» column already says what happened. She can read the facts; the row is inconsistent and ugly, not misleading. That is why it stays P2 despite covering five flows.

**Fix, and it is the cheapest fix in this report:** add `void: ["Хүчингүй болгосон", "pill-red"]`, `close: ["Хаасан", "pill-violet"]`, `cron: ["Автомат нэхэмжлэл", "pill-blue"]`, `book_penalty: ["Алданги нэхсэн", "pill-red"]` to `ACTIONS`; add `akt: "Акт"`, `rate_change: "Тарифын өөрчлөлт"` and the three `machine*` entities to `ENTITIES`. Then stop the entity filter dropdown (`Audit.tsx:55`) offering raw English values, and write `user_name: "Систем"` from the cron path so «Хэн» is not «—».

---

**[P2] The confirm label on every destructive modal is navy on red at 2.07:1** · *app-wide; propagated to four new modals by this round*

`ConfirmModal` composes `.btn-primary` — whose `color: var(--color-onbrand)` is `#19296b`, chosen for the orange brand background where it measures a healthy 5.66:1 — with a Tailwind background override `!bg-danger` (`#b3272d`). The background is swapped; the foreground token is not. Measured on the open payment-void modal: `rgb(25,41,107)` on `rgb(179,39,45)` = **2.07:1**, well under the 4.5:1 needed for 14px semibold and under even the 3:1 large-text floor.

The verifier corrected the framing and I have adopted it: **this is a pre-existing app-wide defect, not a defect of this round.** `!bg-danger` dates to `5c88664` and the navy `--color-onbrand` token that broke it to `ead3315`, both 2026-08-27; `git diff 49ac229..HEAD` shows this round changed neither. What the round *did* introduce is `confirmDisabled`, which gives the void confirm a persistent disabled resting state measured at **1.22:1** composited over the white modal — a new state, not merely "the same colours at 0.5 opacity". The verifier also correctly struck the claim that she will therefore press by colour and position: §4's actual named safeguards (Receipt shown first, focus on «Болих») both hold here, alongside a 10.96:1 title and a required reason. This is WCAG 1.4.3 across 12 `ConfirmModal`s plus the raw button at `ContractDetail.tsx:2342`, four of them added by this round.

**Fix, one rule:** `.btn-primary.\!bg-danger { color: #fff; box-shadow: 0 8px 18px rgba(179,39,45,.22); }` → 6.3:1. Then add the pair to the colour table in `UI-ЗАРЧИМ` §4 so the next danger surface inherits it instead of rediscovering the bug.

---

**[P2] A refused void gives no acknowledgment where she is looking, and says less than the server knows** · *Цуцлалт*

On a 409, `ContractDetail.tsx:1383` calls `toast(e.message, "err")` and nothing else. The `ConfirmModal` text is byte-identical afterwards (verified same node, `innerText` unchanged), the red confirm button re-enables (`ui.tsx:260`), and the only explanation renders **227.5px below the button she just pressed and 202.5px below the modal panel**, at viewport y=696 on a 768px screen. On the `LOT_CONSUMED_ERR` branch the message is a fixed constant naming no date, no padan, no material — on a contract with two candidate returns — even though `billing.lot_consumers()` computed the exact blocking line ids and `contracts.py:626` throws them away. This round's own H10 doctrine (`lib/saveError.ts`) requires a rejection to appear at the point of the action; this is the round contradicting its own new rule.

The verifier killed three limbs and I have removed them. **The focus consequence is false** — focus does drop to `<body>`, but `lib/focus.ts:56` explicitly handles `current < 0` and pulls it back: Tab moves to the × inside the dialog, Shift+Tab back onto the confirm button. Recovery is one keypress and the trap is never left. **The toast is persistent**, not transient — `ui.tsx:19` auto-dismisses only success — with `role="alert"`, `z-50` above the `z-40` backdrop, unblurred, fully in viewport, waiting indefinitely with a ✕. The "she misses things" argument applies to its *position*, not to it vanishing. And **"or reversal_block" is wrong** — those messages already name the material and both quantities (`billing.py:1391`: «Хэв хашмал 6012: буцаж ирсэн бараа дахин олгогдсон — агуулахад 40ш л байна (400ш хасах шаардлагатай). Эхлээд дараагийн олголтыг цуцлана уу»). Only `LOT_CONSUMED_ERR` is generic. This is degraded guidance on a P0 failure branch, not abandonment: nothing is written, re-pressing is harmless, and both candidate returns are visible on the same page.

**Fix, two lines of scope:** render the refusal inside the `ConfirmModal` panel above the buttons, and interpolate the blocking return's date and padan into `LOT_CONSUMED_ERR` — «2026-06-15-ний буцаалт (Хэв хашмал 6012, 400ш) энэ падангаас хассан». The server already has the ids.

---

**[P2] The modal that commits the cancellation never names what it is cancelling** · *Цуцлалт*

When a void touches an invoiced window, `ConfirmModal` closes and `RebuildModal` opens. Its title describes the side-effect — «Тооцоо дахин бодогдоно» — its body calls the act «Энэ засвар», and its receipt shows only cycle totals. Reproduced live: **zero occurrences of «Ачилт», «хүчингүй», «цуцл» or the movement date** anywhere in the panel, with the naming `ConfirmModal` already unmounted and the page behind it blurred by `backdrop-blur-md`. The screen is reached identically from five modal paths and seven `gatedPatch` InlineEdit sites, so being generic, it *cannot* name the act — it has no way to know.

Two verifier corrections applied. **The focus claim is struck:** measured `document.activeElement` is the × «Хаах» button (`Modal` focuses the first tabbable, `ui.tsx:76-80`), so Enter closes rather than commits — there is an effective focus guard, just an accidental one. **The colour finding is demoted from an independent §4 violation to a symptom:** brand orange is house-standard for every modal primary («гол үйлдэл»), and the project's rule keys on *irreversibility text*, which this modal simply omits — the missing sentence is the defect and the colour follows from it. The verifier also found a stronger citation than the assessor did: **«засвар» is an occupied term on the same page** — `repair_qty`/`repair_fee` render as «Засвар: 450,000₮» in the movement rows — so the body copy names a different, visible thing. That is a §3 «нэг ойлголт — нэг үг» violation, cleaner than the §4 argument. P2 rather than P1 because no money can move by accident: step 1 is a proven dry run, Enter is safe, «Болих» aborts at zero cost, and the receipt discloses the exact delta (46,281,800₮ → 35,433,800₮). What is lost is certainty, not money.

**Fix:** thread the object's name from `Pending` into `RebuildModal`'s title or an intro line («2026-05-16 · Ачилт · Тулаас В2 200ш — ХҮЧИНГҮЙ болгоно»), add the irreversibility sentence with `danger` styling when the pending operation is a void, and show the reason she typed so it does not disappear between screens.

---

**[P2] The destroy control and the destroyed state are the same word, in the same table cell, with no affordance** · *Цуцлалт*

`VoidPayment.tsx:80` renders the visible label as the adjective «Хүчингүй» with the verb «болгох» hidden in `sr-only` — violating `UI-ЗАРЧИМ` line 95 («Товчны нэр **үйл үгээр** эхэлнэ») and contradicting the same file's own `confirmLabel` «Хүчингүй болгох» at `:47`. On four inline placements (`ContractDetail.tsx:1460` ledger, `:431` rate changes, `:513` akt, `:691` movement history) it sits 11px after the bold movement name, **inside the same cell, on the same baseline, in the same font at the same 12.5px**. Measured on `/contracts/2`: `<b>Ачилт</b>` right edge x=471, void button left edge x=471 — **0px gap, `sameCell: true`.** A live 1,000-piece shipment therefore renders as the sentence «Ачилт хүчингүй», and the second ledger row buries the control mid-phrase: «Ачилт Хүчингүй Нэмэлт олголт». The control carries no affordance whatsoever: no background, no border, no radius, no underline, no hover rule in `index.css`, and `cursor: default`.

The verifier corrected three things. Only the **ledger evidence is real** — the akt-table and Тарифын өөрчлөлт measurements could not have been live, because the DB holds zero akts, zero rate changes and zero voided records across all six contracts. The **voided state is far better differentiated than claimed**: `voidRowClass` adds a red line-through plus 60% dimming to both the date cell and the movement name, and the required reason prints in red beneath — not merely casing and a chip. And **a misread cannot destroy anything**: both void paths are `ConfirmModal` with `danger` (focus parked on «Болих») and `confirmDisabled={!reason.trim()}`, so a free-text reason must be typed first. This is a legibility and naming defect on the surface the capability doc calls her strongest (R10, «падангийн дэвтэр, COVERED илүү сайн») — not a data-loss risk.

**Fix:** make the visible label the verb — «Цуцлах» — and give it a visible outline so a control is never mistaken for a label. Then the state word «ХҮЧИНГҮЙ» belongs to the pill alone, which incidentally resolves the two-verb problem in the modal («Төлбөр хүчингүй болгох» / «Цуцлах шалтгаан» / «Хүчингүй болгох» / «Төлбөр хүчингүй болов», 92px apart) in the right direction: **цуцлах = the verb, ХҮЧИНГҮЙ = the resulting state.** Add that row to the §3 glossary so the next feature inherits it.

---

**[P2] A cancelled movement still displays its money in live warn and danger colour** · *Цуцлалт*

`voidRowClass` is applied to the movement's title `<b>` at `ContractDetail.tsx:635` but not to the collapsed summary at `:650` — nor, as the verifier found and the assessor missed, to the expanded detail panel at `:694-706`. On a voided return, the struck-through dimmed heading sits directly above «Засвар: 450,000₮» in full `rgb(162,83,10)` warn orange and «Акт: 1,251,000₮» in full `rgb(179,39,45)` danger red, both at `opacity 1` with `textDecorationLine: "none"`. Those two figures are exactly what she reads off that row. Same omission on the akt row's Цикл cell (`:501`).

Verifier corrections applied: **the evidence was simulated** — movement id=4 has `voided_at NULL`, the API returns `voided: false`, and `akt_entries` is empty in `jiguur.db` and every backup, so the classes had to be injected. And this is **ornament incompleteness, not truth ambiguity**: the card's top line reads «2026-06-15 [ХҮЧИНГҮЙ]» in a static `pill-red` with the void reason in `text-danger` one and two lines above the money, and `void.ts` itself states that the strike and dimming are ЧИМЭГ whose meaning lives in that pill and reason, per §4's «Өнгө дангаараа утга зөөхгүй». She is not left asking which is true; she is left with a card that half-says it. The akt Цикл cell is also not the same class of leak — it is a date-range label with no money in it.

**Fix, one line each:** `voidRowClass(mv)` on the summary div at `:650` and the expanded panel at `:694`, `voidRowClass(a)` on the Цикл cell at `:501`. Better: render a single «— цуцлагдсан, тооцоонд ороогүй —» line in place of the money summary when `isVoided`, so a dead record cannot show live figures at all.

---

**[P2] The void receipt never names the number she actually cares about — the resulting Авлагын үлдэгдэл** · *Цуцлалт*

The payment-void receipt totals «Нэхэмжлэлээс суларах дүн 12,330,000₮» and stops. Client 4's receivable is 23,171,588₮ — displayed on the page behind as «23.2 сая₮ / 23,171,588₮» — and the modal's `backdrop-blur-md` overlay (`ui.tsx:116`) blurs it out with body scroll locked, so at the moment of decision she has no way to see where the debt lands. Her three cards are «Нийт төлөх дүн / Төлсөн / Үлдэгдэл»; none of those words appears in the modal.

Verifier corrections, all applied. **The direction is not ambiguous** — the intro states «Доорх хуваарилалт суларч, нэхэмжлэлүүд буцаж нээгдэнэ» and the rows carry `accent: "danger"`; «суллах» is the H1 spec's own verb (`docs/Чадварын харьцуулалт.md:80`). **`RebuildModal` is not the same question answered one screen later** — it lives in a different file and prints «Нэхэмжлэлийн нийт» old→new, which is invoice totals, not the receivable. And **the freed amount is not reliably the balance delta**: `billing.py:1290` re-applies remaining client credit after the void, and `:1263-1268` keeps booked penalty. A correct "after" figure needs a server-side preview, so this is a small plumbing job, not a one-line copy change.

**Fix:** copy the app's own precedent — `Loans.tsx:316-318` already does exactly this for a delete-a-payment confirm via `balanceAfterRemoving` (`lib/loan.ts:27`), rendering «Устгасны дараа үлдэгдэл». Add a preview endpoint and a total row in her vocabulary: «Авлагын үлдэгдэл 23,171,588₮ → 35,501,588₮», arrow form, danger accent when it rises.

---

**[P2] «нэхэмжлэгдээгүй» and «нэхэгдээгүй» stacked flush in identical type — one is inside the number above, one is deliberately outside it** · *Алдангийн хөшүүрэг / Нэг авлага*

Measured on `/clients`, row «Алтан Гадас Констракшн», the Авлагын үлдэгдэл cell: span 2 = «үүнээс нэхэмжлэгдээгүй: 8,205,340₮» and span 3 = «≈1.5 сая₮ нэхэгдээгүй», **identical on all three attributes** (`12px`, `rgb(98,109,134)`, `weight 400`), 18px apart, 0px gap. The two words share 11 of 15 characters. The line above begins «үүнээс» — *of which* — which primes a part-of reading for whatever follows in the same visual register. But `dashboard.py:206-214` deliberately keeps `penalty_unbooked` **out** of `receivable`.

The verifier sharpened this materially. **The dashboard claim is wrong** — there the penalty is a dashed-border pill at `weight 600`, `height 28`, 8px below: the house's own solution to precisely this problem. `ClientProfile` separates them into two labelled Stat cards; `Collections` into two columns. **So the strongest form of the finding is inconsistency, not collision:** `/clients` is the single surface in the round that did not get the treatment. Also imprecise: an uncharged penalty is a real ₮ amount, just not receivable. And one compounding detail the assessor missed — `Clients.tsx:96` calls `uninvoicedLine()` with the default full-₮ formatter while every other surface passes `sayaFmt`, violating §4's «Жагсаалтад дугуйлсан» rule. **Note that fixing that rule violation makes the two lines *more* alike, so the two fixes must be taken together.**

**Fix:** give `/clients` the dashed-pill treatment the dashboard already has, and rename to «нэхээгүй алданги» so the two words stop rhyming — better still, move the accrual line off the `нэх-` root entirely («үүнээс энэ сард хуримтлагдсан: X₮», using a word already in the codebase's own comments).

---

## Refuted claims

The `refuted` list came back empty — no whole finding died. But verification killed nine specific limbs, and recording them stops each being re-raised next round:

- **"Keyboard focus escapes the modal to the skip link after a failed void."** False. Focus does drop to `<body>`, but `lib/focus.ts:56` handles `current < 0` explicitly: Tab moves to the × inside the dialog, Shift+Tab back to the confirm button. The trap is never left.
- **"The refusal toast is missed because it disappears."** False. `ui.tsx:19` auto-dismisses success only. Error toasts are `role="alert"`, `z-50`, unblurred, in viewport, and wait indefinitely. Only their *position* is the problem.
- **"`reversal_block` messages are generic too."** False. They name the material and both quantities. Only `LOT_CONSUMED_ERR` is generic.
- **"`RebuildModal` has no focus guard."** False. `Modal` focuses the first tabbable, which is the × «Хаах», so Enter closes rather than commits — an accidental guard, but a real one.
- **"`RebuildModal`'s orange button is an independent §4 colour violation."** No. Brand orange is house-standard for every modal primary; the project's rule keys on irreversibility *text*, which the modal omits. Symptom, not cause.
- **"A voided акт row and a live one were measured side by side."** Could not have been. The DB holds zero akts, zero rate changes and zero voided records. Those measurements were simulated; only the ledger evidence is live.
- **"The uncharged penalty pill collides with the uninvoiced line on the dashboard hero."** False. The dashboard uses a distinct dashed pill at weight 600. The collision exists on `/clients` only.
- **"The void receipt's «суларах» points the money the wrong way."** No. The intro says «нэхэмжлэлүүд буцаж нээгдэнэ», rows carry `danger` accent, and «суллах» is the H1 spec's own verb.
- **"A grey audit pill is quieter than a routine «Зассан» in blue."** There is no blue. `UI-ЗАРЧИМ` §4 carries an explicit ⚠ that `.pill-blue` renders brand amber. The assessor described a colour the project documents as not existing.

Plus five detector false positives disproved by measurement, listed in the Specificity section — most notably `text-occlusion`, which the overlay detected on **its own injected badge**.

---

## Unverified (carried forward)

Did not fit the verification budget. **Unconfirmed** — treat as leads, not findings.

**P1-rated, unconfirmed:**
- **`Гар хоног` silently clamped** — both validators bound by the full cycle length while money and display clamp per-lot; a count exceeding the lot's window is accepted, quietly reduced, then printed on the хавсралт as `10*` under «* гараар тохирсон хоног». *This is the highest-value unverified item in the report: it decides H5.* (`lots.ts:207` already computes the correct anchor for the hint and the validator ignores it.) — *Мөчлөг ба огноо*
- The `ReturnModal` Receipt is blind to the day-count override: measured **0₮** against a ~924,000₮ change. — *Мөчлөг ба огноо*
- The хоног field is the only control in its own modal that errors by toast — to the user documented as missing toasts. — *Мөчлөг ба огноо*
- The `RateModal` Receipt total is identical for all three «Хэзээнээс» options (641,250₮ × 3, at 21px, the largest number on screen). — *Тариф ба хаалт*
- The three «Хэзээнээс» options are distinguishable only by date; the consequence warning mounts only *after* a restating option is checked. — *Тариф ба хаалт*
- The blocked «Цааш →» renders its reason only in a `title` attribute on a 50%-opacity button; the `{block && …}` render exists only in the confirm branch. — *Тариф ба хаалт*
- Settling the барьцаа re-indexes the step array and can drop her onto the irreversible confirm step, turning «Цааш →» into a red «Гэрээ хаах» in the same slot. — *Тариф ба хаалт*
- Pressing «Дутагдуулсан» on one lot opens a 981px form listing all four, with the chosen row 4th and the submit 176px below the fold. — *Тариф ба хаалт*
- The акт write path confirms 1,206,500₮ at 12.5px while the акт *void* path confirms the same money at 21px with a full Receipt. — *Чөлөөт акт*
- A typed minus sign is silently discarded: field reads `-1 206 500` while the line beside it reads `+1,206,500₮` — a 2,413,000₮ gap between intent and record. — *Чөлөөт акт*
- «Акт бичигдээгүй.» renders in the faintest token on a page showing «Акт: 1,251,000₮» in red 400px below. — *Чөлөөт акт*
- No Σ under the Дүн column and none on the printed акт block — the «нийт» her own placeholder invites her to take 15% of exists on no screen. — *Чөлөөт акт*
- On `/clients/1` the uncharged penalty renders in full `--color-ink` at 18px/800, pixel-identical to «БАРЬЦАА» — `Stat` has no `dim` prop. — *Алдангийн хөшүүрэг*
- The deposit-settle receipt stops adding up the first time a penalty exists: the row declares `unpaid + penalty_booked`, the total deducts `unpaid` only. — *Алдангийн хөшүүрэг*
- `/collections` re-rounds both parts to сая so the visible figures stop summing (22.8 − 16.6 = 6.2 against a neighbouring 6.1). — *Нэг авлага*
- `uninvoicedLine` takes its formatter per call site and the call sites disagree in opposite directions (`Clients.tsx:89/96` vs `Dashboard.tsx:455/457`). — *Нэг авлага*
- A live 422 returns pydantic's English inside the red ring: «Input should be a valid dictionary or object to extract fields from». — *Нэг авлага*

**P2/P3, unconfirmed, grouped:** `ConfirmModal` has no `dirty` guard despite now hosting a required field (Escape discards a typed reason); the disabled confirm carries no `disabledHint` and the reason input is not `required`/`aria-required`, with a dead `autoFocus` at `VoidPayment.tsx:64`; movement void hides behind two disclosures whose teaser omits it; the ХҮЧИНГҮЙ pill lands in four different positions with `voided_at` on one page and not the other; eight controls in a 222×187px box in the page's narrowest rail; the dashed border at `Dashboard.tsx:288` never renders (`index.css:502`); the lever is displayed on `/collections` and pullable only two navigations away; `/collections` heads a column «Нэхэгдсэн алданги» that is «—» on 100% of rows and pushes the table 2px past her viewport; the hero's penalty figure is a `tabIndex -1` SPAN beside a sibling that is a disclosure BUTTON; no screen states the debt after charging (`contracts.py:1187` excludes booked penalty, `ContractDetail.tsx:2288` includes it); the money card reflows 108px→175px the first time both halves exist; «Алданги нэхэх» is the only borderless control among seven; three date formats for one cycle; `ClientProfile.tsx:217` names an invoice by a bare start date; the ledger's хоног chip reads «авто» while the machine's number sits in another card; «Календарь сар» over-promises for mid-month anchors and the wizard prints no cycle date; «авто» carries two unrelated meanings in adjacent chips; typing the machine's own number stamps a permanent manual flag on the хавсралт; акт discount colour inverts between form/list and RebuildModal; the cycle chip is a footnote 319px below the field that changes it; submit stays enabled while the chip reads «цикл олдохгүй»; 107px акт rows because a 145px action column cannot fit 135px of buttons; the printed акт shows a discount as one glyph with no «хөнгөлөлт» word and no Σ; «Тэмдэглэл» names a mandatory field the server calls «юуны төлөө»; the empty state ignores `<Empty>`; the section button is 36px beside a 44px sibling; «Дутагдуулсан» opens a window titled «Буцаалт бүртгэх»; «Гадаа» used four times against §3; 13×13px radios in 20px rows against a 36px floor; the completed wizard step deletes itself; «Гэрээ хаах» sits 876px below the fold while «Алданги нэхэх» is in the header; the restate warning says «ХҮРВЭЛ» when the count is computable; the tariff cell wears the ✎ InlineEdit signifier but opens a `FormModal`; the rate-change history has no empty state so the feature is invisible until used; a negotiated rate *cut* is painted `--color-danger`; the errored InlineEdit popup covers the next field's «Болих»; «АВЛАГА» vs «Авлагын үлдэгдэл» for one number against §3; the inline error reason clips at 72 characters; `Stat` prints the same number twice then a different one in three unlabelled grey lines.

---

## Persona Red Flags

### Отгоо эгч — 60, Excel-native, one `SUM` across 15,000 cells, does not notice on-screen events, 1366×768

**She is asked to authorise numbers she cannot rebuild.** «12 хоног → 1,136,124₮» above «42 хоног → 326,252₮», with neither the 18,935,400₮ base nor the penalty-window start on screen. «Нийт нэхэгдэх алданги 1,462,376₮» with no as-of date named in the receipt. «Нэхэмжлэлээс суларах дүн 12,330,000₮» with her 23,171,588₮ receivable blurred out behind the overlay. «Сарын дүн (30 хоногоор) ≈225,000₮» at wizard step 4, where the exact first invoice is computable from data already on the page. The one arithmetic operation she trusts is the one the system consistently leaves in her head.

**Every terminal action in this round announces itself in a channel she is documented to miss.** The success signal after charging 1,462,376₮ of penalty is a toast (`ContractDetail.tsx:2471`). The only signal that a void was *refused* is a toast at y=696 on a 768px screen. The only signal that the хоног field is out of range is a toast, while the qty input 40px above it gets a red border. The acknowledgment for resolving 2,588 pieces is a toast plus a step pill that **deletes itself** — `closeSteps` removes `goods` once `outstanding.length === 0`, so the row goes «1. Гадаа үлдэгдэл / 2. Эцсийн тооцоо / 3. Гэрээ хаах» → «1. Эцсийн тооцоо / 2. Гэрээ хаах» and she never sees a ✓. The largest piece of work in her monthly ritual leaves no trace.

**The blocked state is invisible by construction.** «Гадаа 2,588ш шийдэгдээгүй байна — буцаалт эсвэл дутагдуулсан гэж бүртгэнэ үү.» exists **only** as a `title` attribute on a button rendered at `opacity: 0.5`, with zero `.text-warn` or `.text-danger` elements on the step carrying it. She does not hover greyed-out things for a second to see what they say. She concludes the computer is broken.

**Live figures on dead records, in exactly the place her eye lands.** «Засвар: 450,000₮» in warn orange at `opacity 1` and «Акт: 1,251,000₮» in danger red at `opacity 1`, directly beneath a struck-through «Буцаалт — 400ш ХҮЧИНГҮЙ» heading. 1.7M₮ of live-looking charges on a cancelled return.

**The word for the destroy button and the word for the destroyed state are the same word, 0px apart, in the same cell.** A perfectly valid 1,000-piece shipment renders as «Ачилт Хүчингүй». On the surface the capability doc calls her strongest.

**The label on the most consequential control in every flow is the least readable text on the screen** — navy on red at 2.07:1, 14px, and 1.22:1 in its new disabled resting state.

**The system teaches her its noun and presents it as hers.** The root «нэхэм-» occurs **zero times** across all six extracts of her workbooks. Her words are «Үлдэгдэл төлбөр», «Өмнөх үлдэгдэл», «2025 оны үлдэгдэл», «төлбөрийн үлдэгдэл тооцоо» — «Үлдэгдэл» 85× and «Тооцоо» 83× in WB1 alone, against «авлага» twice across all three. The flow's headline word is the accountant's register, not hers.

**And the words that are hers, the system uses against its own rules.** «Гадаа» is banned in the first row of §3's glossary and this round uses it four times, twice on the same screen as its approved replacement: the step pill says «1. Гадаа үлдэгдэл» while the paragraph three lines below says «Түрээсэнд 2,588ш байсаар байна».

**The Receipt lies by omission at the one decision that rewrites signed history.** «2026-03-22-ээс өдрийн дүн — 641,250₮» at 21px, and it is the same 641,250₮ whether she chooses «Дараагийн циклээс» or «Бүх түүхэнд». She is Excel-native: the big number on the receipt *is* the number. Here it is off by roughly 43× from the retroactive exposure.

**Two more.** «Гэрээ хаах» — the irreversible one — sits at document y=1644 on a 1773px page, while «Алданги нэхэх» — a money-creating action with no undo — sits at y=282 in the header strip. And a wrapped 42-character metadata string is rendered in CSS `uppercase` across two lines on `/contracts/1`, for a reader with 60-year-old eyes on a 1366×768 screen.

### Дарга — factory boss, tablet at 768px, big targets, must not see company money

**Every touch target this round added is at or below the smallest size the house allows, on the device with the largest finger.** The «Хэзээнээс» radios are unstyled browser defaults at **13×13px** inside 20px click rows — against §4's «36px-ээс намхан дарагддаг юм БАЙХГҮЙ» and against `--target-lg 52px`, which §4 explicitly labels «хуруу, планшет». The «Тооцооны мөчлөг» segment is 36px beside 47px inputs. The «+ Акт бичих» entry point is `btn-row` at 36px while its sibling «+ Нэмэлт олголт» is 44px. Six InlineEdit chips at 36px/12px wrap to three rows in a 222px column.

**Modals do not fit his viewport.** `ReturnModal` measures 981px tall in a 768px window with its submit at y=944 — 176px below the fold, reachable only by scrolling inside the modal. `AktModal` spreads the amount, its meaning and its confirmation across 319px of vertical separation. On a tablet these become multi-scroll transactions with the commit button off-screen.

**One thing to check rather than a finding:** the movement-void control appears inline in the material ledger, which is a warehouse surface. Verify that the factory role cannot reach a control whose confirm receipt prints invoice deltas — the money wall is documented as server-side per route, but this round added four new inline entry points and the P1 roadmap item #19 («Мөнгөний хана бүх route-д сервер талд») is still open.

### Sam — keyboard and screen reader

**Announced state and actual state diverge on the failure branch.** After a refused void, `document.activeElement === document.body` with the dialog still open. `lib/focus.ts:56` recovers it on the next Tab, so nothing is lost — but nothing is *announced* either: the modal's content is byte-identical, and the only new information is in a toast he must find. `ui.tsx:255-260` sets `busy → disabled` (the browser blurs) then `setBusy(false)` with no refocus.

**Required fields that are not programmatically required.** The «Цуцлах шалтгаан» input has `required={false}` and no `aria-required`; `confirmDisabled={!reason.trim()}` greys the button with **no `title`, no `aria-describedby`, no inline message**. The `autoFocus` on that input (`VoidPayment.tsx:64`) is dead code — the cancel button's `autoFocus` (`ui.tsx:252`) commits later and wins — so anyone reading the source builds the wrong mental model.

**Information that exists only visually or only in a `title`.** The block reason on the close wizard's goods step: `title` attribute, no `aria-describedby`. The bare red `*` beside «Тэмдэглэл»: no legend anywhere. The disabled «Акт бичих»: `title="Дүн ба тэмдэглэл заавал бөглөгдөнө"` and nothing else.

**Two controls that look identical to sighted users are distinguished only by `sr-only` text, and one pair is distinguished the wrong way round.** The tariff cell and the six genuine InlineEdits are both `button.inline-val` with a `.pen` ✎ at 36px; the only difference is «· дахин тохирох» versus «· засах» — yet one runs the house two-step and the other opens a full `FormModal`. Meanwhile the void control hides its *verb* in `sr-only` and shows the adjective, so his reader hears the right thing and her eye reads the wrong one.

**Credit where due:** the meta chip's `aria-hidden` / `sr-only` split (`ContractDetail.tsx:161-164`), the single-announcement discipline in `ToastProvider` (`role="alert"` vs `role="status"`, with an explicit comment refusing to double up `aria-live`), the modal focus trap that reads its tabbables fresh on every Tab because the content moves, and the entire `H10` ARIA wiring are all correct and unusually considered.

---

## Minor Observations

- `index.css:422` — `.jz-sidebar` transitions `width` and `flex-basis`, reflowing `.jz-main` 1104px → 1290px twelve times per toggle over 191ms, on every route, with **no `prefers-reduced-motion` guard** — while the same stylesheet already uses `transform` correctly for the mobile drawer, and guards exist for `.row-flash`, `.refresh-note`, `.scope-switch`, `.jz-skip`. The only finding both engines independently agree on.
- `/collections` carries `min-w-[1020px]` against a measured 1018px content width at 1366×768 — a horizontal scrollbar at exactly her screen size, caused by a column that reads «—» on every row.
- `Dashboard.tsx:288` asks for `border-dashed border-white/35`; `index.css:502`'s two-class `.command-hero .pill` shorthand wins. The "this is an estimate" signal has never rendered.
- `Audit.tsx:55`'s entity filter dropdown offers raw English values to the user.
- All 11 `type="date"` inputs in `ContractDetail.tsx` carry neither `min` nor `max`.
- `contract_penalty_charges` (`billing.py:1018`) records every charge as an event with her name and an as-of date, and is called only by rebuild replay — the list of decisions she has made is written and never shown.
- `billing.py:954` `book_penalties(db, client_id, as_of, contract_id=None)` already supports charging a whole client in one call; no route exposes it, so Хөх Толгой Майнинг's two contracts need two separate charges.
- `.btn-row` measured with `border: 0` and `background: transparent` — the house's dense-action class has no affordance at all.
- The акт section starts at scrollY 852 and a four-row card measures 526px on a ~600px content viewport: the block modelled on her Excel block can never be seen whole.

---

## Questions to Consider

**1. Every new state this round created has been designed, built, tested and shipped without anyone ever seeing it on screen with real data. What is the seeding plan?**

Zero rows have ever been voided. `penalty_booked` is 0 for every client. `akt_entries` is empty in `jiguur.db` and in every backup. No `rate_change` exists on any of six contracts. Three separate verifiers had to inject states to check claims, and one assessor's evidence was rejected precisely because the row it measured could not have existed. The consequences are already in this report and they are exactly the consequences you would predict: a cancelled row's money still renders live-coloured; the dashed pill that separates charged from uncharged has never drawn; the deposit-settle receipt stops summing the first time both halves exist; `/clients` is the one surface that never got the treatment the other three got. **A fixture DB with one of every new state — a voided payment next to a live one, a charged penalty, four акт entries spanning three cycles, a retroactive rate change — costs an afternoon and surfaces half of this report in twenty minutes with her in the room.**

**2. This round ships two confirm patterns for one act. Which one is she actually confirming?**

A red `danger` modal that asks a question and changes nothing — focus parked on «Болих», «Энэ үйлдлийг буцаах боломжгүй», a receipt. Then a brand-orange modal that actually voids and restates two invoices from 46,281,800₮ to 35,433,800₮ — no irreversibility sentence, no `danger` flag, no name for the thing it is destroying, and a focus guard only by accident. **The harmless step is dressed as the dangerous one.** If the answer is that the second is the real decision, why does the first carry all the danger signalling? If the answer is the first, why is the second a separate decision rather than a second page of the same modal? Answering this once fixes `RebuildModal` for all twelve of its entrants, not just the void paths.

**3. Every receipt in this round describes the mechanism. Her workbooks record decisions. What would these modals look like if the receipt were always her three cards?**

«Нэхэмжлэлээс суларах дүн». «Гадаа байгаа тоо». «Өдрийн тооцоо буурна». «Циклд орох дүн». Each is an honest, precise description of what the engine is about to do — and none of them is a sentence she has ever written down. Her three cards are **Нийт төлөх дүн / Төлсөн / Үлдэгдэл**, and `docs/Чадварын харьцуулалт.md:138` names them as her language explicitly. Imagine every `ConfirmModal` in this round leading with those three, before → after, with the allocation detail folded under a disclosure for санхүүч. The void receipt answers "what happens to what he owes me". The penalty receipt closes its own arithmetic. The rate receipt stops being identical across three options, because the three options produce three different afters. **One change to the Receipt contract would fix five of the nine PARTIAL handicaps** — and it is the same change every time, because as the scorecard shows, these are not seven problems. They are one problem wearing seven costumes.
