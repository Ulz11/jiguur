"""Alembic-ийн орчин — холболтын мөр нь ҮРГЭЛЖ `DATABASE_URL`-ээс.

`alembic.ini`-д `sqlalchemy.url` БИЧИХГҮЙ: Neon-ийн холболтын мөр нууц үг
агуулдаг тул репод орох ёсгүй. Локал дээр:

    DATABASE_URL=postgresql+psycopg://localhost/jiguur_test \
        ./.venv/bin/python -m alembic upgrade head

эсвэл `python -m app.migrate --create` (диалектаа өөрөө хараад сонгоно).
"""
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import Base, normalize_url          # noqa: E402
from app import models                          # noqa: E402,F401  (модель бүртгэгдэнэ)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

_url = normalize_url(os.environ.get("DATABASE_URL", "")
                     or config.get_main_option("sqlalchemy.url", ""))
if _url:
    config.set_main_option("sqlalchemy.url", _url.replace("%", "%%"))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=config.get_main_option("sqlalchemy.url"),
                      target_metadata=target_metadata, literal_binds=True,
                      dialect_opts={"paramstyle": "named"},
                      compare_type=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(config.get_section(config.config_ini_section, {}),
                                     prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata,
                          compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
