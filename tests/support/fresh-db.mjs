/**
 * Тестийн ТҮР DB-г цэвэрлэнэ — `playwright.config.ts`-ийн `webServer.command`
 * uvicorn-ыг асаахын ӨМНӨ ажиллуулна.
 *
 * Цэвэр (хоосон) файл дээр `app/main.py`-ийн `seed()` өөрөө ажилладаг тул
 * гүйлт бүр ЯГ ижил демо датаас эхэлнэ: 5 харилцагч, 6 гэрээ.
 *
 * ⚠ ХАМГААЛАЛТ: энэ скрипт нь `jiguur-e2e` гэсэн зам дээрх файлаас өөр ЮУГ Ч
 * устгахгүй. Отгоогийн `jiguur.db` (демо дэвтэр) ба `jiguur-real.db` (бодит
 * харилцагчийн дата) рүү санамсаргүй чиглүүлсэн тохиргоо энд ЗОГСОНО —
 * «устгах» кодод хамгаалалтгүй зам дамжуулж болохгүй.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const db = process.env.JZ_E2E_DB;

if (!db) {
  console.error('fresh-db: JZ_E2E_DB тохируулаагүй байна.');
  process.exit(1);
}
if (!db.includes('jiguur-e2e') || ['jiguur.db', 'jiguur-real.db'].includes(basename(db))) {
  console.error(`fresh-db: ТАТГАЛЗЛАА — «${db}» нь тестийн түр DB биш.`);
  process.exit(1);
}

mkdirSync(dirname(db), { recursive: true });
// SQLite нь WAL горимд гурван файлтай — гуравуулаа явахгүй бол хуучин дата үлдэнэ.
for (const suffix of ['', '-wal', '-shm']) rmSync(db + suffix, { force: true });

console.log(`fresh-db: цэвэр тестийн DB → ${db}`);
