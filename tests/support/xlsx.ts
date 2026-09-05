import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * ТЕСТИЙН .xlsx ФАЙЛ — Отгоо эгчийн импортлодог ЖИНХЭНЭ хэлбэрээр.
 *
 * Node талд xlsx бичих сан ЭНЭ репод байхгүй (`package.json` нь зөвхөн
 * Playwright); харин backend-ийн venv дотор `openpyxl` сууж байгаа — тэр нь
 * серверийн ӨӨРИЙНХ нь уншдаг сан тул файл нь ҮНЭХЭЭР зөв хэлбэртэй болно
 * (гараар угсарсан ZIP нь «уншигдсангүй» гэсэн 400-г нуух эрсдэлтэй).
 */
const PY = path.join(process.cwd(), 'system/backend/.venv/bin/python');

/** Толгой мөр + өгөгдлийн мөрүүдтэй түр файл үүсгээд ЗАМЫГ нь буцаана. */
export function writeClientsXlsx(rows: string[][]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jz-xlsx-'));
  const file = path.join(dir, 'clients.xlsx');
  const script = [
    'import json, sys',
    'from openpyxl import Workbook',
    'wb = Workbook(); ws = wb.active',
    'ws.append(["Нэр", "Регистр", "Хариуцагч", "Утас"])',
    'for r in json.loads(sys.argv[1]): ws.append(r)',
    'wb.save(sys.argv[2])',
  ].join('\n');
  execFileSync(PY, ['-c', script, JSON.stringify(rows), file]);
  return file;
}
