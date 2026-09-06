#!/usr/bin/env bash
# Жигүүр Систем — Mac/Linux дээр ажиллуулах
cd "$(dirname "$0")/backend"
pip3 install -r requirements.txt -q
# Асахад хүснэгт/seed бэлтгэнэ + өдөр тутмын нэхэмжлэлийн давхрага
export JIGUUR_AUTO_INIT=1
export JIGUUR_CRON_LOOP=1
echo "Сервер аслаа — http://localhost:8000"
python3 -m uvicorn app.main:app --port 8000
