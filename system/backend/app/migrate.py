"""Сангийн ГАРААР ажиллуулах CLI — схем, seed, бодит дата.

⚠ Урьд нь эдгээр нь `import app.main` дээр ӨӨРСДӨӨ ажилладаг байв. Одоо
ИЛЭРХИЙ: юу хийхээ мөрөндөө бичнэ, ямар сан дээр хийхээ хэвлэнэ.

Хэрэглээ (backend хавтсанд):
    python -m app.migrate --create              схем: SQLite → create_all + дутуу багана
                                                       Postgres → alembic upgrade head
    python -m app.migrate --seed                суурь seed (хэрэглэгч, зэрэглэл, каталог, тохиргоо)
    python -m app.migrate --seed --demo         + демо (mock) дата
    python -m app.migrate --backfill            хуучин дата нөхөлт (idempotent)
    python -m app.migrate --load real_data.json бодит дата ачаална
    python -m app.migrate --fresh --yes         ⚠ БҮГДИЙГ УСТГААД шинээр үүсгэнэ

    python -m app.migrate --create --seed --load real_data.json   ← шинэ орчин босгох

Тугуудыг хослуулж болно; дараалал нь ҮРГЭЛЖ: fresh → create → seed →
backfill → load. Аргументгүй бол юу ч ХИЙХГҮЙ (хуучин зан төлөв нь
`--load real_data.json` байсан — санамсаргүй ачаалалтаас хамгаалав).
"""
import argparse
import json
import os
import sys

from .db import Base, engine, SessionLocal, BASE_DIR, DATABASE_URL, IS_SQLITE
from .schema import migrate_schema
from .schema_backfills import run_all as run_backfills
from .seed import seed_base, seed, DEMO_FLAG

DATA_PATH = os.path.join(BASE_DIR, "migration", "real_data.json")
ALEMBIC_INI = os.path.join(BASE_DIR, "alembic.ini")


def alembic_upgrade(revision: str = "head") -> None:
    """Postgres дээрх схемийн эх сурвалж — Alembic."""
    from alembic import command
    from alembic.config import Config
    cfg = Config(ALEMBIC_INI)
    cfg.set_main_option("script_location", os.path.join(BASE_DIR, "alembic"))
    cfg.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))
    command.upgrade(cfg, revision)


def do_create() -> None:
    """Схемийг ОДООГИЙН диалектад тохирсон замаар босгоно."""
    if IS_SQLITE:
        Base.metadata.create_all(engine)
        added = migrate_schema(engine)
        print(f"SQLite: хүснэгт бэлэн · {len(added)} багана нэмэв")
    else:
        alembic_upgrade("head")
        print("Postgres: alembic upgrade head дууслаа")


def do_seed(demo: bool) -> None:
    if demo:
        os.environ[DEMO_FLAG] = "1"
    with SessionLocal() as db:
        (seed if demo else seed_base)(db)
    print("Seed бичигдлээ" + (" (демо дататай)" if demo else " (суурь)"))


def do_backfill() -> None:
    names = run_backfills(engine)
    print("Дата нөхөлт: " + ", ".join(names))


def do_fresh(confirmed: bool) -> None:
    """БҮХ хүснэгтийг устгаад дахин үүсгэнэ — гурван түгжээтэй."""
    print(f"⚠ УСТГАХ САН: {DATABASE_URL}")
    if not confirmed:
        print("   Зөвшөөрөл алга. Итгэлтэй бол `--yes` нэмнэ үү.")
        sys.exit(2)
    Base.metadata.drop_all(engine)
    print("   Бүх хүснэгт устлаа.")


def do_load(path: str) -> None:
    from .services.migration import load_data
    if not os.path.isabs(path):
        cand = os.path.join(BASE_DIR, "migration", path)
        path = cand if os.path.exists(cand) else path
    if not os.path.exists(path):
        print(f"Файл олдсонгүй: {path}")
        sys.exit(1)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    with SessionLocal() as db:
        r = load_data(db, data)
    print("Шилжүүлэлт дууслаа:")
    print(f"  Харилцагч: {r['clients']}  ·  Нөөцийн мөр: {r['stock']}")
    print(f"  Зээл: {r['loans']}  ·  Бартер: {r['barter']}  ·  Алгассан (давхардал): {r['skipped']}")
    for w in r.get("warnings", []):
        print("  ⚠", w)


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m app.migrate",
                                description="Жигүүр — сангийн бэлтгэл")
    p.add_argument("--create", action="store_true", help="схем үүсгэх/шинэчлэх")
    p.add_argument("--seed", action="store_true", help="суурь seed бичих")
    p.add_argument("--demo", action="store_true", help="--seed дээр демо дата нэмэх")
    p.add_argument("--backfill", action="store_true", help="хуучин дата нөхөлт")
    p.add_argument("--load", metavar="FILE", nargs="?", const="real_data.json",
                   help="бодит дата ачаалах (default: real_data.json)")
    p.add_argument("--fresh", action="store_true", help="⚠ бүх хүснэгтийг УСТГАХ")
    p.add_argument("--yes", action="store_true", help="--fresh-ийг баталгаажуулах")
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    if not any((args.create, args.seed, args.backfill, args.load, args.fresh)):
        build_parser().print_help()
        print(f"\nОдоогийн сан: {DATABASE_URL}")
        return

    print(f"Сан: {DATABASE_URL}")
    if args.fresh:
        do_fresh(args.yes)
        do_create()                       # устгасан бол ЗААВАЛ дахин босгоно
    elif args.create:
        do_create()
    if args.seed:
        do_seed(args.demo)
    if args.backfill:
        do_backfill()
    if args.load:
        do_load(args.load)


if __name__ == "__main__":
    main()
