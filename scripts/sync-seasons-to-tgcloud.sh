#!/usr/bin/env bash
# Update only Odessa Online frontend static files and dedicated view counter; never touch radar/news/svet/comments.
set -Eeuo pipefail
cd "$HOME/OdessaOnlineGuideBot" || { echo "❌ Папка бота отсутствует"; exit 1; }
test -f dist/index.html || { echo "❌ Справочник dist/index.html не найден"; exit 1; }
for cmd in node curl python; do command -v "$cmd" >/dev/null || { echo "❌ Не найдена программа $cmd"; exit 1; }; done
BASE="https://raw.githubusercontent.com/dianakhron7-ai/odessa-online/main"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
echo "=== Скачиваю 4 сезона, 8 карточек и новый глазик ==="
for file in seasonal.js seasonal.css tgcloud/endpoints/odessaGuideViews.js \
 assets/seasons/autumn.jpg assets/seasons/spring.jpg assets/seasons/summer.jpg assets/seasons/winter.jpg \
 assets/seasons/cards/autumn-transport.jpg assets/seasons/cards/autumn-medicine.jpg \
 assets/seasons/cards/spring-transport.jpg assets/seasons/cards/spring-medicine.jpg \
 assets/seasons/cards/summer-transport.jpg assets/seasons/cards/summer-medicine.jpg \
 assets/seasons/cards/winter-transport.jpg assets/seasons/cards/winter-medicine.jpg; do
 mkdir -p "$WORK/$(dirname "$file")"
 curl -fsSL --retry 2 --max-time 90 "$BASE/$file" -o "$WORK/$file" || { echo "❌ Не удалось скачать $file; ничего не заменено"; exit 1; }
done
node --check "$WORK/seasonal.js" || { echo "❌ Ошибка сезонного JavaScript"; exit 1; }
node --check "$WORK/tgcloud/endpoints/odessaGuideViews.js" || { echo "❌ Ошибка облачного счётчика"; exit 1; }
python - "$WORK" <<'PY'
from pathlib import Path
import sys
w=Path(sys.argv[1])
for season in ("autumn","spring","summer","winter"):
 for path in (w/"assets/seasons"/(season+".jpg"),*(w/"assets/seasons/cards"/(season+"-"+kind+".jpg") for kind in ("transport","medicine"))):
  b=path.read_bytes()
  assert b.startswith(bytes.fromhex("ffd8")) and len(b)>20000, str(path)
s=Path("dist/index.html").read_text(encoding="utf-8")
for term in ("<div id=\"app\">","const PHOTO_DATA=","home-content","</head>","</body>"):
 assert term in s, "Другая версия справочника: "+term
if not re.search(r'href="seasonal[.]css',s): s=s.replace("</head>",'<link rel="stylesheet" href="seasonal.css"></head>',1)
if not re.search(r'src="seasonal[.]js',s): s=s.replace("</body>",'<script defer src="seasonal.js"></script></body>',1)
s=re.sub(r'href="seasonal[.]css(?:[?][^"]*)?"','href="seasonal.css?v=oct18-sharp2"',s)
s=re.sub(r'src="seasonal[.]js(?:[?][^"]*)?"','src="seasonal.js?v=oct18-sharp2"',s)
(w/"index.html").write_text(s,encoding="utf-8")
print("✅ Все 12 фото, код и страница проверены")
PY
BACKUP="$HOME/odessa-before-eyebadge-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -p dist/index.html "$BACKUP/index.html"
[ ! -f dist/seasonal.js ] || cp -p dist/seasonal.js "$BACKUP/seasonal.js"
[ ! -f dist/seasonal.css ] || cp -p dist/seasonal.css "$BACKUP/seasonal.css"
[ ! -f tgcloud/endpoints/odessaGuideViews.js ] || cp -p tgcloud/endpoints/odessaGuideViews.js "$BACKUP/odessaGuideViews.js"
echo "✅ Резервная копия: $BACKUP"
mkdir -p tgcloud/endpoints dist/assets/seasons/cards
cp "$WORK/tgcloud/endpoints/odessaGuideViews.js" tgcloud/endpoints/odessaGuideViews.js
echo "=== Подключаю общий счётчик в Telegram Cloud ==="
if ! npx tgcloud push tgcloud/endpoints/odessaGuideViews.js; then
 echo "❌ Не удалось включить счётчик. Страницу не меняю."
 exit 1
fi
cp "$WORK/index.html" dist/index.html
cp "$WORK/seasonal.js" dist/seasonal.js
cp "$WORK/seasonal.css" dist/seasonal.css
cp "$WORK/assets/seasons/"*.jpg dist/assets/seasons/
cp "$WORK/assets/seasons/cards/"*.jpg dist/assets/seasons/cards/
echo "=== Загружаю новое оформление справочника ==="
if npx tgcloud push dist/; then
 echo "✅ ГОТОВО! Глазик и сезоны обновлены. Закрой и открой справочник в Telegram."
else
 echo "❌ Ошибка загрузки оформления. Бот, новости, свет и радар не изменены."
 exit 1
fi
