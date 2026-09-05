"""ХАРИЛЦАГЧ БҮРЭЭР ₮-ТУЛГАЛТ — гарын үсэг зурдаг тайлан (P0-10).

    python migration/reconcile.py                       # staging сан руу
    python migration/reconcile.py --db sqlite:///…      # өөр сан

Юуг тулгах вэ:
  ЗҮҮН тал  — ТҮҮНИЙ «Түрээс тооцоо-26» самбар: Нийт дүн · Тооцоо хийсэн ·
              **Үлдэгдэл** · Барьцаа.
  БАРУУН тал — систем ачаалсны дараа ЯГ ТЭР харилцагчид тооцсон авлага
              (`billing.client_receivable` — дэлгэц бүрийн ГАНЦ тодорхойлолт).
  ЗӨРҮҮ     — тэгээс ялгаатай бол ТУГТАЙ.

Мөн тусад нь: хийсэн нэрийн нэгтгэлүүд · нэг дэвтэрт бий нөгөөд нь алга
харилцагчид · тааруулж чадаагүй материал · задлагдаагүй нүд.

Төгсгөлд нь «Тооцоо нийлсэн:» гарын үсгийн блок — актын PDF-ийн (pdfgen.py)
байшингийн хэвээр. Энэ бол ТҮҮНИЙ гарын үсэг зурах хуудас.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, timedelta

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

TOL = 1.0          # 1₮-ээс бага зөрүү = дугуйлалт, тэг гэж үзнэ


def money(v) -> str:
    if v is None:
        return "—"
    v = round(float(v))
    return f"{v:,}".replace(",", " ") + "₮"


def _md_row(*cells) -> str:
    return "| " + " | ".join(str(c) for c in cells) + " |"


def _day(v):
    """`'2026-08-11'` → date; хоосон/буруу бол None."""
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(v) if v else None
    except (TypeError, ValueError):
        return None


def _day_amount(row: dict) -> float:
    """Гэрээний НЭГ ХОНОГИЙН түрээс — зөрүүг ₮ болгож хэлэхэд."""
    return sum(i["qty"] * i["daily_rate"] for i in row.get("items") or [])


def coverage_check(row: dict, billing_from, first_issue, accrued: float,
                   as_of: date) -> dict:
    """ХАМРАЛТЫН ЗАЛГАА — дэвтэр хаана дуусав, систем хаанаас эхлэв (P0-11).

    Гурван зүйл ЗЭРЭГ таарвал л «нүх ч, давхардал ч алга» гэж хэлж болно:
      · `billing_from` = хуудасны сүүлчийн цикл + 1 хоног;
      · ЭХНИЙ олголт ЯГ тэр өдөрт (хоног ба ₮ НЭГ гаралтай болно);
      · тэр өдрөөс `as_of` хүртэл хуримтлал 0-ээс их (тоолуур ҮНЭХЭЭР асав).

    Хамралт нь `as_of`-оос хойш байвал (Грэйт 8.31 → 9.01) хуримтлал 0
    байх нь ЗӨВ — тоолуур маргаашаас асна.
    """
    lc = _day(row.get("last_covered"))
    bf, fi = _day(billing_from), _day(first_issue)
    want = lc + timedelta(days=1) if lc else None
    bad: list[str] = []
    if lc is None:
        bad.append("хуудсанд циклийн шошго алга — хамралт МЭДЭГДЭХГҮЙ")
    elif bf != want:
        bad.append(f"тооцооны эхлэл {bf or '—'} ≠ хамралт+1 ({want})")
    if bf is not None and fi != bf:
        bad.append(f"эхний олголт {fi or '—'} ≠ тооцооны эхлэл {bf}")
    if lc is not None and bf is not None and bf < as_of and accrued <= 0:
        bad.append(f"{bf}-аас хойш хуримтлал 0 — тоолуур асаагүй")
    return {"client": row.get("client", ""), "no": row.get("no", ""),
            "last_covered": lc, "billing_from": bf, "first_issue": fi,
            "accrued": accrued, "day_amount": _day_amount(row),
            "ok": not bad, "problems": bad}


def ob_source_row(client: dict) -> dict:
    """ЭХНИЙ ҮЛДЭГДЭЛ ХААНААС ГАРАВ — хуудас ↔ самбар (2-р шат).

    Хуудастай харилцагчийн үлдэгдлийг ТҮҮНИЙ ӨӨРИЙН хуудсаас авдаг болов:
    ингэснээр үлдэгдэл ба хамралт (`last_covered`) НЭГ дэвтрээс гарна.
    Хоёр дэвтэр зөрвөл систем аль нэгийг нь ЗӨВ гэж ЗАРЛАХГҮЙ — зөрүүг нь
    ТҮҮНИЙ хэлээр асуулт болгож §9-д бичнэ.
    """
    sheet = client.get("balance_sheet")
    board = client.get("balance_board")
    src = "хуудас" if client.get("balance_source") == "sheet" else "самбар"
    delta = None
    if sheet is not None and board is not None:
        delta = round(float(sheet) - float(board))
    q = ""
    if delta:
        q = (f"Хуудас {money(sheet)} · самбар {money(board)} · "
             f"зөрүү {money(abs(delta))} — аль нь вэ?")
    return {"client": client.get("name", ""), "source": src,
            "sheet": sheet, "board": board, "delta": delta,
            "loaded": client.get("balance"),
            "ref": client.get("balance_ref", ""), "question": q}


def stock_gap(data: dict) -> dict:
    """АГУУЛАХ — «тооллого 6.22» ↔ паркийн дэвтрийн хашааны мөр (2-р шат).

    Хоёр дэвтэр НЭГ агуулахын тухай ярьж байгаа атлаа 4,215ш зөрдөг
    (63,695 ↔ 59,480). Тооллогод трубаны тооны нүд БҮГД хоосон тул тэдгээрийг
    хашааны мөрөөр нөхсөн — тэр НӨХӨЛТ нь «тооллого» баганад тоологдохгүй
    (`source` талбартай мөр), эс тэгвэл зөрүү нь өөрөө нуугдана.
    """
    count: dict[str, float] = {}
    for r in data.get("stock", []):
        if r.get("source"):
            continue                       # хашааны мөрөөс нөхөгдсөн
        count[r["material"]] = count.get(r["material"], 0.0) + float(r["on_hand"])
    park: dict[str, float] = {}
    for k, q in (data.get("audit", {}).get("park_yard") or {}).items():
        mat = k.rsplit("·", 1)[0]
        park[mat] = park.get(mat, 0.0) + float(q)
    rows = [{"material": m, "count": count.get(m, 0.0), "park": park.get(m, 0.0),
             "delta": count.get(m, 0.0) - park.get(m, 0.0)}
            for m in sorted(set(count) | set(park))]
    return {"rows": rows, "count": sum(count.values()), "park": sum(park.values()),
            "delta": sum(count.values()) - sum(park.values())}


def board_gap(row: dict) -> dict | None:
    """§9 — САМБАР ба ХУУДАС хамралтаараа зөрсөн мөр.

    Самбар нь сарын нэхэлтийг нэг нүдэнд хийдэг тул сарын сүүлчээр л
    хэлдэг; харилцагчийн хуудас нь циклийн ЖИНХЭНЭ төгсгөлийг мэднэ. Систем
    хуудсыг сонгосон — зөрүүг нь хоног БА ₮-өөр бичээд ТЭР шийднэ.
    """
    board, sheet = _day(row.get("board_last_covered")), _day(row.get("last_covered"))
    if board is None or sheet is None or board == sheet:
        return None
    days = (sheet - board).days
    amount = days * _day_amount(row)
    return {"client": row.get("client", ""), "no": row.get("no", ""),
            "board": board, "sheet": sheet, "days": days, "amount": amount,
            "text": (f"Самбар {board} хүртэл, хуудас {sheet} хүртэл — зөрүү "
                     f"{days} хоног, {money(amount)}")}


def collect(db_url: str, data: dict) -> dict:
    os.environ["DATABASE_URL"] = db_url
    os.environ.setdefault("JIGUUR_NO_CRON", "1")
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app import models
    from app.services import billing

    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    as_of = date.fromisoformat(data["as_of"])

    rows, totals = [], {"her": 0.0, "sys": 0.0, "dep_her": 0.0,
                        "dep_sys": 0.0, "accrual": 0.0}
    board = data["audit"]["ar_board"]
    with Session() as db:
        clients = db.query(models.Client).order_by(models.Client.name).all()
        by_name = {c.name: c for c in clients}
        stock_rows = db.query(models.Stock).count()
        counts = {
            "clients": len(clients),
            "contracts": db.query(models.Contract).count(),
            "contracts_ob": db.query(models.Contract).filter(
                models.Contract.no.like("OB-%")).count(),
            "invoices": db.query(models.Invoice).count(),
            "payments": db.query(models.Payment).count(),
            "loans": db.query(models.Loan).count(),
            "barter": db.query(models.BarterAsset).count(),
            "stock_rows": stock_rows,
            "items": db.query(models.ContractItem).count(),
        }
        armed = db.query(models.Contract).filter(
            models.Contract.penalty_percent != 0).count()

        seed_map = {c["name"]: c for c in data["clients"]}
        for name in sorted(set(list(by_name) + list(board) + list(seed_map))):
            cl = by_name.get(name)
            b = board.get(name)
            src = seed_map.get(name, {})
            if cl is None:
                mode = data.get("clients_mode", "all")
                rows.append({"name": name, "missing": True,
                             "her_bal": b["balance"] if b else None,
                             "note": ("энэ ачаалалтын ТОП-10-д ороогүй "
                                      "(`--clients top10`)" if mode == "top10"
                                      else "СИСТЕМД ОРООГҮЙ")})
                continue
            r = billing.client_receivable(cl, as_of)
            credit = sum(billing.payment_unallocated(p)
                         for p in db.query(models.Payment)
                         .filter(models.Payment.client_id == cl.id,
                                 models.Payment.voided_at.is_(None)).all())
            # ТУЛГАХ тоо = НЭХЭМЖИЛСЭН үлдэгдэл − хуваарилагдаагүй кредит.
            # Шинэ циклийн хуримтлал нь шилжсэн ӨДРӨӨС хойш тоологдож эхэлсэн
            # тул түүний дэвтэрт БАЙХ ЁСГҮЙ — тусдаа багана болж харагдана.
            sys_net = r["invoiced"] - credit
            # «Та» багана нь СИСТЕМД ОРСОН эх сурвалжийн тоо: хуудастай
            # харилцагчид ХУУДАС, бусдад САМБАР. Хоёр дэвтрийн зөрүү нь
            # §2.4-т тусдаа мөр болж, §9-д асуулт болж очно.
            her_bal = src["balance"] if "balance" in src else (
                b["balance"] if b else None)
            delta = sys_net - (her_bal if her_bal is not None else 0)
            her_dep = b["deposit"] if b else src.get("deposit", 0)
            rows.append({
                "name": name, "missing": False,
                "her_total": b["total"] if b else None,
                "her_paid": b["paid"] if b else None,
                "her_bal": her_bal, "her_dep": her_dep,
                "sys_total": r["total"], "sys_credit": credit, "sys_net": sys_net,
                "sys_dep": r["deposit"], "sys_uninvoiced": r["uninvoiced"],
                "delta": delta, "dep_delta": r["deposit"] - (her_dep or 0),
                "contracts": sum(1 for ct in cl.contracts
                                 if ct.status == "active"
                                 and not ct.no.startswith("OB-")),
                "penalty": r["penalty"],
                "on_board": b is not None,
                "note": src.get("note", ""),
                "not_lodged": bool(b and b.get("deposit_not_lodged")),
            })
            # ── v2: МӨНГӨНИЙ ЗАДАРГАА + ГЭРЭЭНИЙ ХЭЛБЭР + ЗУРГААН БАЙР ──
            ob = next((ct for ct in cl.contracts if ct.no.startswith("OB-")), None)
            ob_inv = sum(i.total for i in (ob.invoices if ob else [])
                         if i.voided_at is None and i.no.startswith("OB-"))
            ent = db.query(models.ClientEntry).filter(
                models.ClientEntry.client_id == cl.id,
                models.ClientEntry.voided_at.is_(None)).all()
            live = [ct for ct in cl.contracts if not ct.no.startswith("OB-")]
            notes = db.query(models.Note).filter(
                models.Note.entity_type.in_(("client", "contract")),
                models.Note.entity_id.in_(
                    [cl.id] + [ct.id for ct in cl.contracts])).all()
            n_all = [n for n in notes
                     if (n.entity_type == "client" and n.entity_id == cl.id)
                     or (n.entity_type == "contract"
                         and n.entity_id in {ct.id for ct in cl.contracts})]
            agreed = [i for ct in cl.contracts for i in ct.invoices if i.agreed_at]
            rows[-1].update({
                "ob_invoice": ob_inv,
                "entries": [{"kind": e.kind, "amount": e.amount, "label": e.label,
                             "ref": e.ref or ""} for e in ent],
                "entries_sum": sum(e.amount for e in ent),
                "shape": [{
                    "no": ct.no, "start": str(ct.start_date),
                    "mode": getattr(ct, "cycle_mode", "days") or "days",
                    "vat": ct.vat_percent,
                    "deposit": ct.deposit, "deposit_status": ct.deposit_status,
                    "deposit_events": len([e for e in ct.deposit_events
                                           if e.voided_at is None]),
                    "sites": sorted({mv.site for mv in ct.movements if mv.site}),
                } for ct in sorted(live, key=lambda c: c.no)],
                "contacts": [f"{c.role or '—'} {c.name}"
                             + (f" · {c.phone}" if c.phone else "")
                             + (f" / {c.phone2}" if c.phone2 else "")
                             for c in cl.contacts],
                "notes": len(n_all),
                "flagged": len([n for n in n_all if n.flag and n.voided_at is None]),
                "agreed_at": str(agreed[0].agreed_at) if agreed else "",
                "agreed_by": agreed[0].agreed_by if agreed else "",
            })
            totals["her"] += her_bal or 0
            totals["sys"] += sys_net
            totals["dep_her"] += her_dep or 0
            totals["dep_sys"] += r["deposit"]
            totals["accrual"] += r["uninvoiced"]

        # ── SKU-гийн тоо: ТҮҮНИЙ хуудас ↔ ачаалсан ↔ WB2 парк ──
        sku: dict[str, list[dict]] = {}
        cover: list[dict] = []
        park = data["audit"].get("park_now", {})
        for row in data.get("contracts", []):
            cl = by_name.get(row["client"])
            if cl is None:
                continue
            ct = next((c for c in cl.contracts if c.no == row["no"]), None)
            # ── ХАМРАЛТЫН ЗАЛГАА (P0-11) ──
            bf = billing.billing_origin(ct) if ct is not None else None
            first_issue = min((mv.date for mv in (ct.movements if ct else [])
                               if mv.type == "ISSUE" and mv.voided_at is None),
                              default=None)
            accrued = 0.0
            if ct is not None and bf is not None and bf < as_of:
                accrued = billing.accrue_rent(ct, bf, as_of)[0]
            cover.append(coverage_check(row, bf, first_issue, accrued, as_of))
            loaded: dict[tuple, float] = {}
            for mv in (ct.movements if ct else []):
                if mv.type != "ISSUE" or mv.voided_at is not None:
                    continue
                for ln in mv.lines:
                    m = db.get(models.Material, ln.material_id)
                    g = db.get(models.Grade, ln.grade_id)
                    loaded[(m.name, g.code)] = loaded.get((m.name, g.code), 0) + ln.qty
            her = {(i["material"], i["grade"]): 0.0 for i in row["items"]}
            for i in row["items"]:
                her[(i["material"], i["grade"])] += i["qty"]
            wb2 = park.get(row["client"], {})
            keys = sorted(set(her) | set(loaded)
                          | {tuple(k.split("·")) for k in wb2})
            sku[row["client"]] = [{
                "sku": f"{k[0]} · {k[1]}",
                "her": her.get(k, 0), "loaded": loaded.get(k, 0),
                "wb2": wb2.get(f"{k[0]}·{k[1]}", 0),
            } for k in keys]

        # ── КАТАЛОГ: тариф ХААНААС гарав, засвар/худалдах үнэ АРЧИГДСАН уу ──
        from app.services.migration import catalog_rates
        cited = catalog_rates(data.get("contracts") or [])
        catalog = [{
            "name": m.name, "category": m.category, "rate": m.base_rate,
            "repair": m.repair_fee,
            "ref": (cited.get(m.name) or {}).get("ref", ""),
            "votes": (cited.get(m.name) or {}).get("votes", 0),
        } for m in db.query(models.Material).order_by(models.Material.name).all()]
        prices = db.query(models.MaterialGradePrice).count()
    return {"rows": rows, "totals": totals, "counts": counts, "as_of": as_of,
            "penalty_armed": armed, "sku": sku, "coverage": cover,
            "catalog": catalog, "prices": prices}


def render(data: dict, res: dict, db_url: str) -> str:
    audit = data["audit"]
    rows = res["rows"]
    live = [r for r in rows if not r["missing"]]
    exact = [r for r in live if abs(r["delta"]) < TOL]
    off = sorted((r for r in live if abs(r["delta"]) >= TOL),
                 key=lambda r: -abs(r["delta"]))
    missing = [r for r in rows if r["missing"]]
    dep_off = [r for r in live if abs(r["dep_delta"]) >= TOL]

    L: list[str] = []
    A = L.append
    A("# Тооцоо нийлэх хуудас — Excel ↔ Жигүүр Зам ERP")
    A("")
    A(f"**Тулгасан огноо:** {res['as_of']}  ·  **Сан:** `{os.path.basename(db_url)}` "
      f"(ТУРШИЛТЫН — ажлын сан хөндөгдөөгүй)")
    A(f"**Эх сурвалж:** {data['source']}")
    ob_src = data.get("ob_source", "board")
    A(f"**Эхний үлдэгдлийн эх сурвалж:** `--ob-source {ob_src}` — "
      + ("харилцагч бүрийн **өөрийн хуудас** (хуудасгүй бол самбар). "
         "Ингэснээр үлдэгдэл ба «дэвтэр хаана хүртэл нэхэгдсэн» хоёр "
         "**нэг дэвтрээс** гарна."
         if ob_src == "sheet" else
         "мастер самбар «Түрээс тооцоо-26»-ийн `Үлдэгдэл` багана."))
    A("")
    A("> Зүүн талын багана бол **таны** дэвтрийн тоо. Баруун талынх нь систем "
      "ачаалсны дараа ЯГ тэр харилцагчид бодсон тоо. Хоёр нь ижил байвал "
      "«✓ таарав». Ялгаатай бол зөрүүг нь бичсэн — **аль нь үнэн бэ гэдгийг та "
      "шийднэ**, систем таамаглаагүй.")
    A("")

    # ── 1. Нэг харцаар ────────────────────────────────────────────────────
    c = res["counts"]
    A("## 1. Нэг харцаар")
    A("")
    A(_md_row("Юу", "Тоо"))
    A(_md_row("---", "---:"))
    A(_md_row("Харилцагч", c["clients"]))
    A(_md_row("Гэрээ — бүгд", c["contracts"]))
    A(_md_row("  · үүнээс «Үлдэгдэл шилжүүлэлт» (OB)", c["contracts_ob"]))
    A(_md_row("  · үүнээс идэвхтэй түрээсийн гэрээ", c["contracts"] - c["contracts_ob"]))
    A(_md_row("Гэрээний материалын мөр", c["items"]))
    A(_md_row("Нэхэмжлэл (эхний үлдэгдэл)", c["invoices"]))
    A(_md_row("Илүү төлөлт (кредит) бичилт", c["payments"]))
    A(_md_row("Агуулахын нөөцийн мөр (материал × зэрэглэл)", c["stock_rows"]))
    A(_md_row("Зээл", c["loans"]))
    A(_md_row("Бартер хөрөнгө", c["barter"]))
    A("")
    A(_md_row("Тулгалт", "Харилцагч"))
    A(_md_row("---", "---:"))
    A(_md_row("**✓ ₮ хүртэл ЯГ таарсан**", len(exact)))
    A(_md_row("⚠ зөрүүтэй", len(off)))
    A(_md_row("✗ системд ороогүй", len(missing)))
    A("")
    A(f"**Нийт авлага — таны дэвтрээр:** {money(res['totals']['her'])}  ·  "
      f"**системд нэхэмжилсэн:** {money(res['totals']['sys'])}  ·  "
      f"**зөрүү:** {money(res['totals']['sys'] - res['totals']['her'])}")
    A(f"**Шинэ циклийн хуримтлал** (шилжсэн өдрөөс хойш, таны дэвтэрт байхгүй): "
      f"{money(res['totals']['accrual'])}")
    A(f"**Барьцаа — таны дэвтрээр:** {money(res['totals']['dep_her'])}  ·  "
      f"**системд:** {money(res['totals']['dep_sys'])} "
      f"(барьцаа авлагын ГАДНА тооцогдоно)")
    A("")
    # ── 1.1 Түүний өөрийн нийлбэрийн мөр ──────────────────────────────────
    bt = audit.get("ar_board_totals") or {}
    if bt:
        rowsum = {
            "total": sum(v["total"] for v in audit["ar_board"].values()),
            "paid": sum(v["paid"] for v in audit["ar_board"].values()),
            "balance": sum(v["balance"] for v in audit["ar_board"].values()),
            "deposit": sum(v["deposit"] for v in audit["ar_board"].values()),
        }
        gaps = {k: rowsum[k] - (bt.get(k) or 0) for k in rowsum}
        A("### 1.1 Таны самбарын НИЙЛБЭР мөр — шалгав")
        A("")
        A("«Түрээс тооцоо-26»-ийн доод талын нийлбэр мөрийг мөрүүдийнх нь "
          "нийлбэртэй тулгав.")
        A("")
        A(_md_row("Багана", "Таны нийлбэр мөр", "Мөр мөрөөр нь нэмбэл", "Зөрүү"))
        A(_md_row("---", "---:", "---:", "---:"))
        for key, label in (("total", "Нийт дүн"), ("paid", "Тооцоо хийсэн"),
                           ("balance", "Үлдэгдэл"), ("deposit", "Барьцаа")):
            g = gaps[key]
            A(_md_row(label, money(bt.get(key)), money(rowsum[key]),
                      "✓" if abs(g) < TOL else f"**{money(g)}**"))
        A("")
        if abs(gaps["balance"]) >= TOL:
            A("> **АНХААРУУЛГА.** Нийлбэр мөрийн томьёо нь `=SUM(J5:J33)` — "
              "хүснэгтийн **3 ба 4-р мөрнөөс** эхлээгүй. Тиймээс "
              "«Өнө Орд ХХК яармаг» ба «Өнө Орд ХХК нүхт» хоёр таны нийт "
              "авлагад **ОРООГҮЙ**. Нийт дүн, Тооцоо хийсэн, Үлдэгдэл гурвуулаа "
              "5-р мөрнөөс эхэлдэг; харин Барьцаа (`=SUM(K3:K33)`) 3-аас эхэлдэг "
              "тул тэр нь бүтэн. Систем **бүх мөрийг** тоолсон — тиймээс "
              "системийн нийт авлага таны нийлбэр мөрнөөс "
              f"{money(gaps['balance'])} их байна. Мөр мөрөөр нь бол ЯГ таарч байгаа.")
            A("")
        if abs(gaps["deposit"]) >= TOL:
            A(f"> Барьцааны {money(gaps['deposit'])} зөрүү нь БМонгол ХХК-ийн "
              "мөрөөс гарч байна: тэнд **сөрөг үлдэгдэл барьцааны баганад** "
              "бичигдсэн (Нийт 1 045 000₮ − Тооцоо хийсэн 1 237 500₮ = "
              "−192 500₮). Систем үүнийг барьцаа биш, **илүү төлөлт** гэж уншсан.")
            A("")

    A(f"**Алданги:** нэхэгдсэн гэрээ — {res['penalty_armed']}. "
      "Шилжүүлсэн гэрээ бүр **0%**-иар орсон: систем таны нэрийн өмнөөс алданги "
      "нэхэхгүй. Нэхэх шаардлагатай болвол гэрээ тус бүр дээр нь та өөрөө асаана.")
    A("")

    # ── 2. Харилцагч бүрээр ───────────────────────────────────────────────
    A("## 2. Харилцагч бүрээр — ₮ тулгалт")
    A("")
    A("«Систем» багана нь **нэхэмжилсэн** үлдэгдэл — таны дэвтрийн `Үлдэгдэл`-тэй "
      "тулгах ёстой яг тэр тоо. «Шинэ цикл» багана нь шилжсэн өдрөөс хойш "
      "систем өөрөө тоолж эхэлсэн, таны дэвтэрт **байхгүй** хуримтлал — "
      "зөрүү биш, ирээдүйн нэхэмжлэл.")
    A("")
    A(_md_row("Харилцагч", "Нийт дүн", "Тооцоо хийсэн", "**Үлдэгдэл** (та)",
              "Систем", "Зөрүү", "Шинэ цикл", "Барьцаа (та)", "Барьцаа (систем)",
              "Тэмдэглэл"))
    A(_md_row("---", "---:", "---:", "---:", "---:", "---:", "---:", "---:",
              "---:", "---"))
    for r in sorted(live, key=lambda x: (abs(x["delta"]) < TOL, x["name"])):
        flag = "✓" if abs(r["delta"]) < TOL else f"**{money(r['delta'])}**"
        notes = []
        if not r["on_board"]:
            notes.append("«тооцов» жагсаалтаас" if "тооцов" in (r["note"] or "")
                         else "самбарт мөр алга")
        if r["not_lodged"]:
            notes.append("барьцаа байршуулаагүй")
        if r["sys_credit"]:
            notes.append(f"илүү төлөлт {money(r['sys_credit'])}")
        # ТҮРЭЭС БИШ бичилт нь хуудасны Үлдэгдэлд ОРООГҮЙ мөнгө: авлагыг
        # НЭМЭГДҮҮЛНЭ. Энэ багана нь §2-ийн зөрүүг тайлбарлана.
        if r.get("entries_sum"):
            notes.append(f"түрээс бус бичилт {money(r['entries_sum'])} "
                         f"(хуудсанд ороогүй)")
        if r["contracts"]:
            notes.append(f"{r['contracts']} идэвхтэй гэрээ")
        A(_md_row(r["name"], money(r["her_total"]), money(r["her_paid"]),
                  f"**{money(r['her_bal'])}**", money(r["sys_net"]), flag,
                  money(r["sys_uninvoiced"]) if r["sys_uninvoiced"] else "—",
                  money(r["her_dep"]), money(r["sys_dep"]),
                  " · ".join(notes) or ""))
    A(_md_row("**НИЙТ**", "", "", f"**{money(res['totals']['her'])}**",
              f"**{money(res['totals']['sys'])}**",
              f"**{money(res['totals']['sys'] - res['totals']['her'])}**",
              money(res["totals"]["accrual"]),
              money(res["totals"]["dep_her"]), money(res["totals"]["dep_sys"]), ""))
    A("")
    if off:
        A("### 2.1 Зөрүүтэй харилцагчид — ТАНЫ ШИЙДВЭР")
        A("")
        for r in off:
            A(f"- **{r['name']}** — таны дэвтэр {money(r['her_bal'])}, систем "
              f"{money(r['sys_net'])}, зөрүү **{money(r['delta'])}**. "
              + (r["note"] or ""))
        A("")
    else:
        A(f"**Зөрүүтэй харилцагч алга — {len(exact)}/{len(live)} ₮ хүртэл "
          f"таарав.**")
        A("")
    if dep_off:
        A("### 2.2 Барьцааны зөрүү")
        A("")
        for r in dep_off:
            A(f"- **{r['name']}** — самбарт {money(r['her_dep'])}, системд "
              f"{money(r['sys_dep'])}")
        A("")
    if missing:
        A("### 2.3 Энэ ачаалалтад ОРООГҮЙ харилцагчид"
          if data.get("clients_mode") == "top10" else "### 2.3 Системд ороогүй")
        A("")
        for r in missing:
            A(f"- **{r['name']}** — {money(r['her_bal'])} ({r['note']})")
        A("")

    # ── 2.4 OB ХААНААС ГАРАВ — хуудас ↔ самбар ────────────────────────────
    ob_rows = [ob_source_row(c) for c in data.get("clients", [])]
    if ob_rows:
        A("### 2.4 Эхний үлдэгдэл хаанаас гарав — таны хуудас ↔ мастер самбар")
        A("")
        A("Харилцагч бүрийн эхний үлдэгдлийг **түүний өөрийн хуудсаас** "
          "(жишээ нь `БЛҮҮМ-2!X33 = X30 − X32`) авлаа. Шалтгаан нь: тооцоо "
          "хаанаас эхлэхийг (`дэвтэр хаана хүртэл нэхэгдсэн`) МӨН тэр хуудас "
          "хэлдэг. Хоёр тоог нэг дэвтрээс авбал хооронд нь нүх ч, давхардал ч "
          "үлдэхгүй. Хуудасгүй харилцагчид самбараар орсон.")
        A("")
        A(_md_row("Харилцагч", "Эх сурвалж", "Хуудас", "Самбар", "Зөрүү",
                  "Системд орсон", "Нүд"))
        A(_md_row("---", "---", "---:", "---:", "---:", "---:", "---"))
        for x in ob_rows:
            A(_md_row(x["client"], x["source"], money(x["sheet"]),
                      money(x["board"]),
                      "✓" if not x["delta"] else f"**{money(x['delta'])}**",
                      money(x["loaded"]), f"`{x['ref']}`" if x["ref"] else "—"))
        A("")

    # ── 3. Нэрийн нэгтгэлүүд ──────────────────────────────────────────────
    A("## 3. Нэрийн хувилбарууд — юуг юутай нэгтгэсэн бэ")
    A("")
    A("Нэг тал таны дэвтрүүдэд хэдэн ч янзаар бичигдсэн байна. Систем доорхи "
      "хүснэгтээр НЭГ нэр рүү нийлүүлсэн. Буруу нийлүүлсэн зүйл байвал энд "
      "харагдана.")
    A("")
    A(_md_row("Дэвтэрт бичигдсэн хэлбэр", "→ Системийн нэр"))
    A(_md_row("---", "---"))
    for variant, canon in audit["alias_map"].items():
        if variant != canon:
            A(_md_row(f"`{variant}`", canon))
    A("")
    if audit["merges"]:
        A("**Самбар дээр ХОЁР мөрөөр бичигдсэн (нийлүүлэв):**")
        A("")
        for m in audit["merges"]:
            A(f"- **{m['canonical']}** — {m['detail']}: "
              + ", ".join(f"«{s}»" for s in m["sources"]))
        A("")
    A("### 3.1 НЭГТГЭЭГҮЙ — та шийднэ")
    A("")
    A("Эдгээр нэр ойролцоо боловч ижил тал эсэх нь **тодорхойгүй** тул систем "
      "тусад нь үлдээсэн. Нэгтгэх ёстой бол хэлээрэй.")
    A("")
    A(_md_row("Нэр А", "Нэр Б", "Асуулт"))
    A(_md_row("---", "---", "---"))
    for a in audit["ambiguous"]:
        A(_md_row(a["a"], a["b"], a["question"]))
    A("")

    # ── 4. Нэг дэвтэрт бий, нөгөөд алга ───────────────────────────────────
    A("## 4. Нэг дэвтэрт бий — нөгөөд нь алга")
    A("")
    board = set(audit["ar_board"])
    park = {k: sum(v.values()) for k, v in audit["park_now"].items()}
    sheets = {s["client"] for s in audit["sheets"] if s.get("client")}
    only_park = sorted(n for n, q in park.items() if q > 0 and n not in board)
    only_board = sorted(n for n in board if n not in park and n not in sheets)
    A("**Паркийн дэвтэрт материал ГАДАА байгаа боловч AR самбарт мөр алга** "
      "(түрээс нэхэгдэж байна уу?):")
    A("")
    if only_park:
        for n in only_park:
            A(f"- **{n}** — {park[n]:,.0f}ш гадаа")
    else:
        A("- байхгүй")
    A("")
    A("**AR самбарт мөртэй боловч паркийн дэвтэрт ч, харилцагчийн хуудсанд ч "
      "алга** (зөвхөн үлдэгдэл — материал нь эргэж ирсэн гэж үзэв):")
    A("")
    A("- " + (", ".join(only_board) if only_board else "байхгүй"))
    A("")

    # ── 5. Идэвхтэй гэрээ ─────────────────────────────────────────────────
    A("## 5. Идэвхтэй түрээсийн гэрээ — хоёр дэвтрийн тоо")
    A("")
    A("«Хуудсаар» = харилцагчийн хуудасны хамгийн сүүлийн циклд гадаа үлдсэн "
      "тоо. «Паркаар» = «2026 шинэ» матрицын тоо. Хоёр нь зөрөх нь таны "
      "дэвтрүүдэд бий зүйл — систем аль нэгийг нь СОНГОСОНГҮЙ, харин "
      "**хуудсыг** (тарифтай тул) ачаалж, зөрүүг нь энд бичив.")
    A("")
    A(_md_row("Хуудас", "Харилцагч", "Гэрээ", "Хуудсаар ш", "Паркаар ш", "Зөрүү",
              "₮/өдөр", "Үр дүн"))
    A(_md_row("---", "---", "---", "---:", "---:", "---:", "---:", "---"))
    for s in audit["sheets"]:
        if not s.get("client") or s.get("filtered"):
            continue
        d = s["wb1_qty"] - s["wb2_qty"]
        A(_md_row(s["sheet"], s["client"], s.get("no", "—"),
                  f"{s['wb1_qty']:,.0f}", f"{s['wb2_qty']:,.0f}",
                  f"{d:+,.0f}" if d else "0",
                  f"{s.get('day_amount', 0):,.0f}", s.get("result", "")))
    A("")
    skipped = [s for s in audit["sheets"] if s.get("client") and not s.get("filtered")
               and s.get("result") not in ("гэрээ үүсэв",)]
    if skipped:
        A("**Гэрээ үүсээгүй хуудсууд — шалтгаан:**")
        A("")
        for s in skipped:
            A(f"- **{s['sheet']}** ({s['client']}) — {s.get('result')}; "
              f"хуудсаар {s['wb1_qty']:,.0f}ш, паркаар {s['wb2_qty']:,.0f}ш")
        A("")
    A("**Клиент биш хуудсууд** (санаатай алгасав): "
      + ", ".join(f"«{s['sheet']}» — {s['reason']}"
                  for s in audit["sheets"] if not s.get("client")))
    A("")

    # ── 5.1 SKU-гийн тоо: ГУРВАН дэвтэр зэрэгцээ ─────────────────────────
    A("### 5.1 SKU тус бүрээр — таны хуудас ↔ систем ↔ паркийн дэвтэр")
    A("")
    A("**«Таны хуудас»** = харилцагчийн хуудасны сүүлийн циклд бичсэн тоо. "
      "**«Ачаалсан»** = систем дээр ГАДАА байгаа тоо — энэ хоёр нь ЯГ тэнцэх "
      "ёстой. **«Парк»** = «2026 шинэ» матриц; зөрвөл ТАНЫ шийдвэр (систем "
      "хуудсыг сонгосон, учир нь тариф нь тэнд бий).")
    A("")
    for name in sorted(res.get("sku", {})):
        lines = res["sku"][name]
        bad = [x for x in lines if abs(x["her"] - x["loaded"]) > 0.5]
        gap = [x for x in lines if abs(x["loaded"] - x["wb2"]) > 0.5]
        A(f"**{name}** — {len(lines)} SKU · хуудас↔систем зөрүү "
          f"{'ҮГҮЙ ✔' if not bad else f'{len(bad)} мөрд ⚠'} · паркийн зөрүү "
          f"{len(gap)} мөрд")
        A("")
        A(_md_row("SKU", "Таны хуудас ш", "Ачаалсан ш", "Парк (WB2) ш", "Парк зөрүү"))
        A(_md_row("---", "---:", "---:", "---:", "---:"))
        for x in lines:
            d = x["loaded"] - x["wb2"]
            A(_md_row(x["sku"], f"{x['her']:,.0f}", f"{x['loaded']:,.0f}",
                      f"{x['wb2']:,.0f}", f"{d:+,.0f} ⚠" if abs(d) > 0.5 else "0"))
        tot_h = sum(x["her"] for x in lines)
        tot_l = sum(x["loaded"] for x in lines)
        tot_w = sum(x["wb2"] for x in lines)
        A(_md_row("**НИЙТ**", f"**{tot_h:,.0f}**", f"**{tot_l:,.0f}**",
                  f"**{tot_w:,.0f}**", f"**{tot_l - tot_w:+,.0f}**"))
        A("")
        sh = next((s for s in audit["sheets"] if s.get("client") == name
                   and s.get("her_total") is not None), None)
        if sh:
            d = (sh["her_total"] or 0) - tot_l
            A(f"*Түүний өөрийн «Нийт» нүд ({sh.get('total_ref', '?')}) = "
              f"{sh['her_total']:,.0f}ш · ачаалсан {tot_l:,.0f}ш · "
              + ("**ЯГ ТААРНА ✔**" if abs(d) < 0.5
                 else f"**ЗӨРҮҮ {d:+,.0f}ш — ТАНЫ ШИЙДВЭР ⚠**") + "*")
            A("")

    # ── 5.2 Гэрээний хэлбэр ба зургаан шинэ байр ─────────────────────────
    A("### 5.2 Гэрээний хэлбэр ба шинэ талбарууд")
    A("")
    A("Гэрээний **эхлэл** нь одооноос хойш таны ЖИНХЭНЭ гэрээний огноо "
      "(хавсралтын толгойгоос). **Горим** «сар» бол 31 хоногтой сар ×31/30 "
      "нэхэгдэнэ. **Барьцаа** нь одоо гүйдэг дэвтэр — «явдал» багана нь "
      "хэдэн шийдвэр бичигдснийг хэлнэ («0 · none» = БАЙРШУУЛААГҮЙ, 0 биш).")
    A("")
    A(_md_row("Харилцагч", "Гэрээ", "Эхлэл", "Горим", "НӨАТ", "Барьцаа ₮",
              "Явдал", "Талбай", "Хүн", "Тэмдэглэл", "Тугтай", "Тооцоо нийлсэн"))
    A(_md_row("---", "---", "---", "---", "---:", "---:", "---:", "---", "---:",
              "---:", "---:", "---"))
    for r in sorted(live, key=lambda r: r["name"]):
        shapes = r.get("shape") or [{}]
        for i, s in enumerate(shapes):
            A(_md_row(r["name"] if i == 0 else "",
                      s.get("no", "—"), s.get("start", "—"),
                      "САР" if s.get("mode") == "month" else "хоног",
                      f"{s.get('vat', 0):g}%",
                      f"{s.get('deposit', 0):,.0f}",
                      f"{s.get('deposit_events', 0)} · {s.get('deposit_status', '—')}",
                      " + ".join(s.get("sites") or []) or "—",
                      len(r.get("contacts") or []) if i == 0 else "",
                      r.get("notes", 0) if i == 0 else "",
                      r.get("flagged", 0) if i == 0 else "",
                      (r.get("agreed_at") or "—") if i == 0 else ""))
    A("")
    # ── 5.3 ХАМРАЛТЫН ЗАЛГАА — дэвтэр хаана дуусав, систем хаанаас эхлэв ──
    cover = res.get("coverage") or []
    if cover:
        A("### 5.3 Тооцооны залгаа — таны дэвтэр хаана дуусав, систем хаанаас "
          "эхлэв")
        A("")
        A("Таны хуудас сүүлчийн циклийнхээ **төгсгөл хүртэл** нэхэгдсэн байдаг. "
          "Систем ЯГ **маргааш** нь тоолж эхэлнэ — ингэснээр хооронд нь "
          "нэхэгдээгүй хоног ч, хоёр удаа нэхэгдсэн хоног ч үлдэхгүй. "
          "«Олголт» багана нь материал системд гарсан гэж бүртгэгдсэн өдөр: "
          "тэр нь тооцооны эхлэлтэй ЯГ таарах ёстой, эс бөгөөс дэлгэц дээр "
          "«30/30 хоног» гэж бичээд 5 хоногийн мөнгө харагдана.")
        A("")
        A(_md_row("Харилцагч", "Гэрээ", "Дэвтэр хүртэл", "Тооцоо эхэлсэн",
                  "Олголт", "₮/хоног", "Хуримтлал (тулгасан өдөр хүртэл)",
                  "Шалгалт"))
        A(_md_row("---", "---", "---", "---", "---", "---:", "---:", "---"))
        for x in cover:
            A(_md_row(x["client"], x["no"], x["last_covered"] or "—",
                      x["billing_from"] or "—", x["first_issue"] or "—",
                      f"{x['day_amount']:,.0f}", money(x["accrued"]),
                      "✓" if x["ok"] else "⚠ " + "; ".join(x["problems"])))
        A("")

    # ── 5.4 АГУУЛАХ — тооллого ↔ паркийн дэвтрийн хашааны мөр ─────────────
    sg = stock_gap(data)
    if sg["rows"]:
        A("### 5.4 Агуулахын үлдэгдэл — «тооллого 6.22» ↔ паркийн дэвтрийн "
          "хашааны мөр")
        A("")
        A("Хоёр дэвтэр НЭГ агуулахын тухай ярьж байгаа боловч тоо нь зөрж "
          "байна. «тооллого 6.22»-д **трубаны тооны нүд бүгд хоосон**, «Тулаас "
          "В6», «Шат» ч мөн адил — тэдгээрийг паркийн дэвтрийн `Хашаанд бгаа` "
          "(51-р мөр) мөрөөс нөхөв (зэрэглэл «А»). Нөхөгдсөн мөр нь «тооллого» "
          "баганад 0 гэж харагдана — тэр дэвтэр тэдний талаар ЮУ Ч хэлээгүй.")
        A("")
        A(_md_row("Материал", "тооллого 6.22", "Паркийн дэвтэр (хашаа)", "Зөрүү"))
        A(_md_row("---", "---:", "---:", "---:"))
        for r in sg["rows"]:
            A(_md_row(r["material"], f"{r['count']:,.0f}", f"{r['park']:,.0f}",
                      "✓" if abs(r["delta"]) < 0.5 else f"**{r['delta']:+,.0f}**"))
        A(_md_row("**НИЙТ**", f"**{sg['count']:,.0f}**", f"**{sg['park']:,.0f}**",
                  f"**{sg['delta']:+,.0f}**"))
        A("")

    A("**Гарын үсэгтнүүд** (утсаар нь залгах хүн — захирал биш, нярав):")
    A("")
    for r in sorted(live, key=lambda r: r["name"]):
        A(f"- **{r['name']}** — "
          + ("; ".join(r.get("contacts") or []) or "*хуудсанд гарын үсэг олдсонгүй*"))
    A("")

    # ── 6. Материал ───────────────────────────────────────────────────────
    A("## 6. Каталогт байхгүй материал")
    A("")
    A("Дэвтэрт бий, системийн каталогт **алга** байсан материалууд. Эдгээр нь "
      "урьд нь чимээгүй унадаг байсан (Өнө Ордын «Труба 1м» 278ш) — одоо "
      "**каталогт нээгдэв**. Тариф нь олдоогүй мөрүүд 0-оор орсон, тэдгээрт "
      "тугтай тэмдэглэл үлдээв: та тарифыг нь тогтооно.")
    A("")
    A(_md_row("Материал", "Ангилал", "Тариф ₮/хоног", "Хаанаас гарав"))
    A(_md_row("---", "---", "---:", "---"))
    for m in audit.get("catalog_new", []):
        A(_md_row(m["name"], m.get("category", "—"),
                  f"{m.get('base_rate', 0):,.0f}"
                  + ("" if m.get("base_rate") else " ⚠ ТОГТООХ"),
                  m.get("note", "")))
    A("")
    if audit["catalog_gaps"]:
        A("Паркийн дэвтрийн таних боломжгүй багана: "
          + ", ".join(f"`{g}`" for g in audit["catalog_gaps"]))
        A("")

    # ── 6.1 БҮХ КАТАЛОГ — тариф хаанаас гарав ─────────────────────────────
    cat = res.get("catalog") or []
    if cat:
        A("### 6.1 Каталогийн тариф — аль нь ТАНЫ тоо вэ")
        A("")
        A("Систем суурилуулахдаа каталогтоо **ойролцоо үнэ** бичдэг байсан: "
          "засварын хураамж, НБҮнэ, худалдах үнэ гурвуулаа тэр демо тоо байв. "
          "Таны гурван дэвтэрт «засвар» гэсэн үг **нийт нэг удаа**, чөлөөт "
          "тэмдэглэл болж гарна — засварын ч, худалдах үнийн ч хүснэгт танд "
          "алга. Тиймээс тэдгээрийг **бүгдийг нь арчив** "
          f"(НБҮнэ/худалдах үнийн мөр одоо {res.get('prices', 0)}). "
          "Түрээсийн тариф нь таны гэрээнүүд дээр бичигдсэн тоогоор "
          "тогтоогдов — хамгийн олон удаа давтагдсан нь, цитаттайгаа.")
        A("")
        A(_md_row("Материал", "Ангилал", "Тариф ₮/хоног", "Засвар",
                  "Хаанаас (нүд)", "Хэдэн гэрээний мөр"))
        A(_md_row("---", "---", "---:", "---:", "---", "---:"))
        for m in cat:
            A(_md_row(m["name"], m["category"] or "—",
                      f"{m['rate']:,.0f}" + ("" if m["rate"] else " ⚠ ТОГТООХ"),
                      f"{m['repair']:,.0f}",
                      f"`{m['ref']}`" if m["ref"] else "— (гэрээнд мөр алга)",
                      m["votes"] or "—"))
        A("")

    # ── 7. Задлагдаагүй, анхааруулга ──────────────────────────────────────
    A("## 7. Задлаж чадаагүй нүд")
    A("")
    if audit["unparsed"]:
        for u in audit["unparsed"]:
            A(f"- `{u}`")
    else:
        A("- **байхгүй** — бүх нүд уншигдсан.")
    A("")
    A("## 8. Бүх анхааруулга (задлагчийн бүртгэл)")
    A("")
    for w in audit["warnings"]:
        A(f"- {w}")
    A("")

    # ── 9. ТАНЫ ШИЙДВЭРҮҮД ────────────────────────────────────────────────
    A("## 9. Таны шийдвэрүүд — хоёр дэвтэр зөрсөн бүх газар")
    A("")
    A("Систем эдгээрийн аль нэгийг нь **сонгосонгүй**. Мөр бүрд аль тоо "
      "үнэн болохыг тэмдэглээд өгвөл дараагийн ачаалалтад буулгана.")
    A("")
    A(_md_row("#", "Юу зөрсөн", "Утга А", "Утга Б", "Нүд", "Таны шийдвэр"))
    A(_md_row("---:", "---", "---:", "---:", "---", "---"))
    dec, n = [], 0
    # ЭХНИЙ ҮЛДЭГДЭЛ: ХОЁР ДЭВТЭР ХОЁР ӨӨР ТОО хэлж байна (2-р шат). Систем
    # хуудсыг сонгосон (үлдэгдэл ба хамралт НЭГ дэвтрээс гарах ёстой) —
    # зөрүү нь ЖИНХЭНЭ мөнгө тул ТЭР шийднэ.
    for x in ob_rows:
        if x["question"]:
            dec.append((f"{x['client']} — эхний үлдэгдэл: {x['question']}",
                        money(x["sheet"]), money(x["board"]),
                        f"{x['ref']} ↔ Түрээс тооцоо-26!J", ""))
    for r in sorted(live, key=lambda r: -abs(r["delta"])):
        if abs(r["delta"]) >= TOL:
            dec.append((f"{r['name']} — ачаалсан үлдэгдэл ↔ системийн авлага",
                        money(r["her_bal"]), money(r["sys_net"]),
                        "§2", ""))
    for s in audit["sheets"]:
        if s.get("her_total") is None:
            continue
        loaded = sum(x["loaded"] for x in res.get("sku", {}).get(s["client"], []))
        if abs((s["her_total"] or 0) - loaded) > 0.5:
            dec.append((f"{s['client']} — түүний «Нийт» тоо ↔ ачаалсан тоо",
                        f"{s['her_total']:,.0f}ш", f"{loaded:,.0f}ш",
                        f"{s['sheet']}!{s.get('total_ref', '')}", ""))
        if not s.get("filtered") and abs(s["wb1_qty"] - s["wb2_qty"]) > 0.5:
            dec.append((f"{s['client']} — хуудасны тоо ↔ паркийн дэвтэр",
                        f"{s['wb1_qty']:,.0f}ш", f"{s['wb2_qty']:,.0f}ш",
                        f"{s['sheet']} ↔ 2026 шинэ", ""))
    # ХАМРАЛТ: самбар ↔ хуудас (P0-11). Систем ХУУДСЫГ сонгосон — самбар нь
    # сарын нүдээр л ярьдаг тул нарийвчлал нь бага. Зөрүү нь ЖИНХЭНЭ мөнгө:
    # хэдэн хоног хоёр дэвтрийн хооронд «хэн нэхсэн бэ» нь тодорхойгүй байна.
    for row in data.get("contracts", []):
        g = board_gap(row)
        if g:
            dec.append((f"{g['client']} №{g['no']} — хамралт: {g['text']}",
                        str(g["board"]), str(g["sheet"]),
                        f"Түрээс тооцоо-26 ↔ {row.get('sheet', '')}", ""))
    for c in res.get("coverage") or []:
        if not c["ok"]:
            dec.append((f"{c['client']} №{c['no']} — тооцооны залгаа: "
                        + "; ".join(c["problems"]),
                        str(c["last_covered"] or "—"),
                        str(c["billing_from"] or "—"), "§5.3", ""))
    # ТАЛБАЙН ХУВААЛТ: эх сурвалж нь ОГНООТОЙ ЗУРАГ бөгөөд өнөөдрийн тоотой
    # таарахгүй тул систем ХУВААГААГҮЙ — хуваарилалт нь ТҮҮНИЙ шийдвэр.
    for g in audit.get("site_gaps", []):
        dec.append((f"{g['client']} — {g['text']}",
                    f"{g['source']:,.0f}ш", f"{g['now']:,.0f}ш",
                    "Батцоож!F27", ""))
    # АГУУЛАХ: хоёр дэвтэр нэг агуулахыг хоёр өөр тоогоор хэлж байна.
    if abs(sg["delta"]) >= 0.5:
        dec.append(("Агуулахын үлдэгдэл: хоёр дэвтэр "
                    f"{abs(sg['delta']):,.0f}ш зөрөөтэй — системд тооллого хийж "
                    "баталгаажуулна уу",
                    f"{sg['count']:,.0f}ш", f"{sg['park']:,.0f}ш",
                    "тооллого 6.22 ↔ 2026 шинэ!51", ""))
    for d in audit.get("decisions", []):
        dec.append((f"{d['client']} — «{d['what']}» хэдэн төгрөг вэ ({d['why']})",
                    money(d["a"]), money(d["b"]),
                    f"{d['a_ref']} ↔ {d['b_ref']}", ""))
    for ct in data.get("contracts", []):
        for nt in ct.get("notes", []):
            if nt.get("flag") and "НӨАТ" in nt.get("text", ""):
                dec.append((f"{ct['client']} — {nt['text'][:70]}", "", "",
                            nt.get("ref", ""), ""))
    for i, (what, a, b, cell, _) in enumerate(dec, start=1):
        n = i
        A(_md_row(i, what, a or "—", b or "—", f"`{cell}`", "……………"))
    if not dec:
        A(_md_row("—", "зөрүү олдсонгүй", "—", "—", "—", "—"))
    A("")
    A(f"*Нийт {n} шийдвэр.* Мөн гэрээ бүр дээр **шар тугтай тэмдэглэл** "
      "(«Анхаарах» самбар) байна — тэдгээр нь тус тусдаа хариулт хүлээж байгаа "
      "захын тэмдэглэлүүд.")
    A("")

    # ── 10. Гарын үсэг ────────────────────────────────────────────────────
    A("---")
    A("")
    A("## Тооцоо нийлсэн")
    A("")
    A("Дээрх харилцагч бүрийн үлдэгдэл, барьцаа, идэвхтэй гэрээний тоог "
      "**хянаж, зөвшөөрсний дараа** энэ хуудсанд гарын үсэг зурснаар систем "
      "ажлын горимд шилжинэ. Гарын үсэг зурсны дараа эдгээр тоо нь системийн "
      "эхний үлдэгдэл болж **хөлдөнө**.")
    A("")
    A("Зөрүүтэй харилцагч бүрийн хувьд ЯГ АЛЬ тоог үнэн гэж үзэхээ "
      "заана уу (§2.1).")
    A("")
    A("| | |")
    A("|---|---|")
    A("| **Тооцоо нийлсэн:** | |")
    A("| Жигүүр Зам ХХК-ийн менежер | Огноо: ............................ |")
    A("| Ч.Отгонцэцэг&nbsp;&nbsp;&nbsp;&nbsp;94003848 · 80118801 | |")
    A("| ________________________ | ________________________ |")
    A("")
    A("*Хугацаа хэтэрсэн тохиолдолд гэрээнд зааснаар алданги тооцно — "
      "систем автоматаар нэхэхгүй (алданги 0%).*")
    A("")

    # ── Хавсралт: гэрээн дээр НААГДААГҮЙ, гэхдээ АЛДАГДААГҮЙ мөрүүд ────────
    drop = audit.get("dropped_notes") or []
    if drop:
        A("---")
        A("")
        A("## Хавсралт — хуудасны машин тэмдэглэл (хөгжүүлэгчид)")
        A("")
        A("Задлагч хуудсуудаас дараах мөрүүдийг олсон боловч гэрээ/харилцагч "
          "дээр **тэмдэглэл болгож наагаагүй**: эдгээр нь нүдний хаяг, өнгө, "
          "хүснэгтийн шошго зэрэг МАШИНЫ хэл бөгөөд Отгонцэцэгээс ямар ч "
          "асуулт хүлээхгүй. Мөрүүд эндээс АЛДАГДААГҮЙ — шаардлагатай бол "
          "энэ жагсаалтаас буцааж авна.")
        A("")
        A(_md_row("Харилцагч", "Хаана", "Төрөл", "Текст", "Нүд"))
        A(_md_row("---", "---", "---", "---", "---"))
        for d in drop:
            A(_md_row(d.get("client", "—"), d.get("where", "—"),
                      d.get("kind", "—"),
                      str(d.get("text", "")).replace("|", "\\|")[:120],
                      f"`{d.get('ref', '')}`"))
        A("")
        A(f"*Нийт {len(drop)} мөр.*")
        A("")
    refs = audit.get("contact_refs") or []
    if refs:
        A("**Гарын үсэгтний нүдний хаяг** (холбоо барих бүртгэлд хадгалаагүй): "
          + ", ".join(f"`{r}`" for r in refs))
        A("")
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser(description="₮-тулгалтын тайлан")
    ap.add_argument("--db", default="sqlite:///" + os.path.join(BASE, "jiguur-real.db"))
    ap.add_argument("--data", default=os.path.join(BASE, "migration", "real_data.json"))
    ap.add_argument("--out", default=os.path.join(
        os.path.dirname(os.path.dirname(BASE)), "docs", "Тулгалтын тайлан.md"))
    a = ap.parse_args(argv)

    if not os.path.exists(a.data):
        raise SystemExit(f"real_data.json олдсонгүй: {a.data}\n"
                         "Эхлээд: python migration/build_real_data_xlsx.py")
    with open(a.data, encoding="utf-8") as f:
        data = json.load(f)
    res = collect(a.db, data)
    text = render(data, res, a.db)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        f.write(text)

    live = [r for r in res["rows"] if not r["missing"]]
    exact = sum(1 for r in live if abs(r["delta"]) < TOL)
    print(f"→ {a.out}")
    print(f"  Харилцагч {len(live)} · ЯГ таарсан {exact} · зөрүүтэй "
          f"{len(live) - exact} · системд ороогүй "
          f"{len(res['rows']) - len(live)}")
    print(f"  Авлага: дэвтрээр {money(res['totals']['her'])} · системээр "
          f"{money(res['totals']['sys'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
