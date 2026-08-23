"""Бодит дата руу шилжих CLI.

Хэрэглээ (backend хавтсанд):
    python -m app.migrate            ← одоогийн DB дээр real_data.json-г нэмж ачаална
    python -m app.migrate --fresh    ← DB-г ЦЭВЭРЛЭЖ, суурь (хэрэглэгч, каталог) + бодит дата

real_data.json нь backend/migration/ дотор байна (Numbers файлуудаас задалж гаргасан).
"""
import json
import os
import sys

from .db import Base, engine, SessionLocal, BASE_DIR
from .seed import seed_base
from .services.migration import load_data

DATA_PATH = os.path.join(BASE_DIR, "migration", "real_data.json")


def main():
    if not os.path.exists(DATA_PATH):
        print(f"real_data.json олдсонгүй: {DATA_PATH}")
        sys.exit(1)
    with open(DATA_PATH, encoding="utf-8") as f:
        data = json.load(f)

    if "--fresh" in sys.argv:
        print("DB-г цэвэрлэж байна…")
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        seed_base(db)
        r = load_data(db, data)

    print("Шилжүүлэлт дууслаа:")
    print(f"  Харилцагч: {r['clients']}  ·  Нөөцийн мөр: {r['stock']}")
    print(f"  Зээл: {r['loans']}  ·  Бартер: {r['barter']}  ·  Алгассан (давхардал): {r['skipped']}")
    for w in r.get("warnings", []):
        print("  ⚠", w)
    print("Одоо серверээ асаагаад (run.bat) нэвтэрч шалгаарай.")


if __name__ == "__main__":
    main()
